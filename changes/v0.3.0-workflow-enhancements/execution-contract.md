# Execution Contract: v0.3.0 Workflow Enhancements

## Intent Lock

- **Change name**: v0.3.0-workflow-enhancements
- **Problem being solved**: spec-superflow v0.2.1 有 4 个短板 — 任务拆解粒度不足（缺少精确文件路径和 TDD 展开）、执行模式单一（只有 SDD subagent）、无放弃路径（7 态只有 closing 终态）、验证维度不足（只检查 spec compliance）。v0.3.0 补齐它们，为 v1.0.0 奠基。
- **In scope**:
  1. spec-forger 任务拆解增强（writing-plans 方法论：File Structure + Interfaces + TDD 展开 + 零占位符）
  2. execution-governor Inline 执行模式（≤3 任务 + 无跨模块依赖 → 单会话执行 + checkpoint review）
  3. abandoned 终态（第 8 态 + abandonment-summary.md + 部分代码保留 + spec-syncer 阻断）
  4. 三维验证（Completeness + Correctness + Coherence → closure-archivist + Validator.validateImplementation()）
  5. 模板更新（tasks.md、execution-contract.md、abandonment-summary.md）
  6. 版本同步（package.json / plugin.json / marketplace.json → 0.3.0）+ CHANGELOG + CI/CD 发布
- **Out of scope**: CLI 工具链、可配置 Schema、git worktree 隔离、spec-syncer 增强、多平台适配器、skill-creator

## Approved Behavior

### task-planning (5 requirements — MODIFIED)

| # | Requirement | Key Scenario | Acceptance Check |
|---|-------------|-------------|-----------------|
| TP-1 | Enhanced Task Granularity | 每个 task step 是 2-5 分钟原子操作，TDD 5 阶段展开 | tasks.md 中每个 task 有 5 个 TDD 步骤，无"implement the module"等模糊指令 |
| TP-2 | Precise File Path Declaration | 每个 task 声明 `Create:` / `Modify:` 精确路径 | 所有修改包含行范围或区域 |
| TP-3 | Interface Contract Declaration | 每个 task 有 Interfaces 块（Consumes/Produces） | 接口条目指定函数名、参数类型、返回类型 |
| TP-4 | Zero Placeholder Enforcement | 禁止 TBD/TODO/implement later | spec-forger 完成前扫描占位符并解析 |
| TP-5 | File Structure Section | tasks.md 以 File Structure 开头 | 所有 task 引用的文件都出现在 File Structure |

### inline-execution (3 requirements — ADDED)

| # | Requirement | Key Scenario | Acceptance Check |
|---|-------------|-------------|-----------------|
| IE-1 | Inline Execution Mode | ≤3 任务 + 无跨模块 → 当前会话执行，不 dispatch subagent | execution-governor 检查 task count 和依赖后选择模式 |
| IE-2 | Inline Mode Checkpoint Review | 每个 task 完成后 checkpoint 验证 spec compliance + done-when | 不通过不进入下一个 task |
| IE-3 | Execution Mode Selection Criteria | 自动选择 + 用户可覆盖 | 报告选择理由，记录覆盖到 progress ledger |

### abandonment-workflow (4 requirements — ADDED)

| # | Requirement | Key Scenario | Acceptance Check |
|---|-------------|-------------|-----------------|
| AW-1 | Abandoned Terminal State | 任何非终态可转 abandoned，转后禁止再转 | workflow-orchestrator 阻断 abandoned → 其他状态 |
| AW-2 | Abandonment Summary Generation | 生成 abandonment-summary.md（Reason ≥50 chars + Lessons Learned ≥1 insight） | 文件存在且满足最低长度 |
| AW-3 | Partial Code Preservation | 用户可选保留部分变更（[abandoned] 前缀 commit） | 保留的 commit 记录在 summary 中 |
| AW-4 | No Delta Spec Merge on Abandonment | abandoned 变更的 delta specs 不可 sync | spec-syncer 检测到 abandoned 状态后拒绝 |

### verification-framework (3 requirements — MODIFIED)

| # | Requirement | Key Scenario | Acceptance Check |
|---|-------------|-------------|-----------------|
| VF-1 | Three-Dimensional Verification | Completeness（全做了吗）+ Correctness（做对了吗）+ Coherence（设计体现吗） | 三维各有独立 findings 列表 |
| VF-2 | Verification Dimension Report | 每维 PASS/FAIL/WARN + overall verdict PASS/CONDITIONAL/FAIL | FAIL 阻断完成声明 |
| VF-3 | Implementation Validator Engine | `Validator.validateImplementation(diffSummary, specContent, designContent)` → VerificationReport | API 可导入，3 个维度各返回 findings |

### state-machine (2 requirements — MODIFIED)

| # | Requirement | Key Scenario | Acceptance Check |
|---|-------------|-------------|-----------------|
| SM-1 | Eight-State Workflow | 8 态枚举完整（+abandoned） | workflow-orchestrator 和 docs 都列出 8 态 |
| SM-2 | Abandoned State Routing | 任何非终态 → abandoned 允许；debugging escalation 提供两个选项 | 不自动 abandoned，需用户确认 |

## Design Constraints

### Architecture Constraints (from design.md Decisions)

1. **D1**: writing-plans 方法论嵌入 spec-forger，不创建独立 skill → 不新建 `skills/writing-plans/` 目录
2. **D2**: Inline 模式是 execution-governor 内部分支，不是独立 skill → 不新建 `skills/inline-executor/` 目录
3. **D3**: abandoned 是终态，不允许回退 → 不实现 abandoned → exploring 的路由
4. **D4**: 三维验证是 closure-archivist 增强，不是新 skill → 不新建 `skills/verifier/` 目录
5. **D5**: Validator 保持零依赖 + regex 解析 → 不引入 Zod、tree-sitter 或 git 依赖

### Interface Constraints

- `Validator.validateImplementation()` 签名固定：`(diffSummary: string, specContent: string, designContent: string) → VerificationReport`
- 新增类型必须从 `src/index.ts` 导出：`VerificationDimension`, `VerificationStatus`, `VerificationFinding`, `VerificationReport`
- tasks.md 模板格式（File Structure + Interfaces）是 spec-forger 和 downstream skills 的共享接口

### Dependency Constraints

- 零外部 npm 依赖（保持 `devDependencies` 仅有 `typescript`）
- Node >= 22
- 所有解析使用纯正则

### Data Constraints

- `templates/abandonment-summary.md` Reason 段最低 50 字符（`MIN_ABANDONMENT_REASON_LENGTH = 50`）
- `VerificationReport.verdict` 仅三个值：`PASS` / `CONDITIONAL` / `FAIL`

## Task Batches

### Batch 1: Templates + Type Foundations

- **Objective**: 建立所有后续 batch 的基础 — 新模板 + 验证类型 + 常量
- **Inputs**: 现有 `templates/`、`src/validation/types.ts`、`src/validation/constants.ts`、`src/index.ts`
- **Outputs**: 更新的 tasks.md 模板、execution-contract.md 模板、新的 abandonment-summary.md 模板、VerificationReport 类型、验证常量、新导出
- **Done when**: `npm run build` 编译通过，`dist/` 包含新类型声明

### Batch 2: Enhanced Task Planning (spec-forger)

- **Objective**: spec-forger 的 tasks.md 生成能力达到 writing-plans 水平
- **Inputs**: Batch 1 产出的 tasks.md 模板
- **Outputs**: 更新的 `skills/spec-forger/SKILL.md`（任务拆解章节 + 验证清单 + 自审清单）
- **Done when**: spec-forger SKILL.md 包含 File Structure、Interfaces、TDD 5 阶段、零占位符规则
- **Depends on**: Batch 1

### Batch 3: Inline Execution Mode (execution-governor)

- **Objective**: execution-governor 支持 SDD + Inline 双模式
- **Inputs**: Batch 2 产出的 spec-forger（新任务格式）、execution-contract.md 模板（Execution Mode 字段）
- **Outputs**: 更新的 `skills/execution-governor/SKILL.md`（模式选择 + Inline 循环 + 升级路径）
- **Done when**: SKILL.md 有明确的模式选择标准、Inline per-task 循环、Inline→SDD 升级规则
- **Depends on**: Batch 2

### Batch 4: Abandonment Workflow (workflow-orchestrator + spec-syncer)

- **Objective**: 8 态状态机 + abandoned 终态 + 放弃流程
- **Inputs**: Batch 1 产出的 abandonment-summary.md 模板、`MIN_ABANDONMENT_REASON_LENGTH` 常量
- **Outputs**: 更新的 workflow-orchestrator（8 态 + abandoned 路由 + guardrails）、spec-syncer（abandoned guard）、docs/state-machine.md
- **Done when**: workflow-orchestrator 列出 8 态、abandoned 路由规则完整、spec-syncer 阻断 abandoned sync
- **Depends on**: Batch 1

### Batch 5: Three-Dimensional Verification (Validator + closure-archivist)

- **Objective**: Validator 引擎 + closure-archivist 整合三维验证
- **Inputs**: Batch 1 产出的 VerificationReport 类型和常量
- **Outputs**: `Validator.validateImplementation()` 方法、closure-archivist 五步验证 + 报告格式
- **Done when**: 新测试通过（Completeness/Correctness/Coherence 各至少一个测试）、`npm test` 全绿
- **Depends on**: Batch 1

### Batch 6: Integration Tests + Version Bump + Publish

- **Objective**: 全面测试 + 版本号同步 + CI/CD 发布
- **Inputs**: Batch 1-5 所有产出
- **Outputs**: 新增 e2e 测试用例、版本号 0.3.0（3 个文件）、CHANGELOG.md 条目、git tag v0.3.0
- **Done when**: `npm run build && npm test` 全绿、3 个版本文件一致、tag 推送触发 CI/CD
- **Depends on**: Batch 1-5

## Test Obligations

### Must Start With Failing Tests

- `validateImplementation()` — Batch 1 task 1.1 写失败测试（方法不存在），Batch 5 task 5.1 写 Completeness 失败测试
- Inline mode selection — 无独立代码模块（逻辑在 SKILL.md 中），无需代码级测试
- abandoned state — 无独立代码模块（逻辑在 SKILL.md 中），无需代码级测试

### Required Edge Cases

- `validateImplementation()`:
  - diff 覆盖所有 requirements → PASS
  - diff 缺少某个 requirement → FAIL (Completeness)
  - diff 包含 TODO/FIXME → FAIL (Correctness)
  - design decision 在 diff 中不可见 → WARN (Coherence)
  - 空 diff summary → FAIL (Completeness)
  - 空 spec content → PASS (无 requirements = 无遗漏)

### Regression-Sensitive Areas

- 现有 `validateSpecContent()`、`validateChangeContent()`、`validateDeltaSpec()` — 不可修改已有行为
- 现有 e2e 测试 — 不可删除或弱化
- `src/index.ts` 导出 — 只能追加，不能移除已有导出

## Execution Mode

- **Mode**: `SDD`
- **Selection rationale**: 40+ tasks, 6 batches, 跨模块依赖（src/validation/ + skills/ + templates/ + docs/ + tests/）→ SDD 模式

## Verification Dimensions

| Dimension | Status | Findings |
|-----------|--------|----------|
| Completeness | Pending | — |
| Correctness | Pending | — |
| Coherence | Pending | — |

**Overall verdict**: Pending

## Review Gates

### Mandatory Review Points

- **Batch 1 → 2**: 模板和类型基础完成后，验证编译通过
- **Batch 3 → 4**: Inline 模式 SKILL.md 完成后，验证与 spec-forger 新任务格式兼容
- **Batch 5 → 6**: Validator 扩展完成后，验证 `npm test` 全绿（含新测试）
- **Batch 6 完成**: 全量 review — 版本号一致、CHANGELOG 完整、CI/CD 发布成功

### Blocker Categories

- `npm run build` 编译失败 → 必须修复才能继续
- `npm test` 任何测试失败 → 必须修复才能继续
- SKILL.md 中出现 TBD/TODO → 必须解决才能 handoff
- 版本号不一致（package.json ≠ plugin.json ≠ marketplace.json）→ 必须同步才能发布

## Escalation Rules

### Return to `specifying` when:

- 实现中发现某个 requirement 需要修改（如 Inline 模式的阈值从 3 改为其他值）
- 新增 requirement 浮现（如发现需要额外的模板字段）
- design.md 的某个 Decision 被证明不可行

### Return to `bridging` when:

- tasks.md 的 batch 结构需要重组（如发现 Batch 2 和 Batch 3 有循环依赖）
- execution-contract.md 的 test obligation 需要补充
- scope fence 需要调整（如某个 Out of Scope 项需要拉入）

### Do not continue implementation if:

- `npm run build` 失败且 3 次修复尝试后仍未解决 → 进入 `debugging`
- 某个 batch 完成后 `npm test` 有 regression → 进入 `debugging`
- 用户要求放弃变更 → 进入 `abandoned`
- systematic-debugger 3+ 次修复失败 → 提供 abandoned 选项

### Transition to `abandoned` when:

- 用户明确请求放弃
- systematic-debugger 建议放弃且用户确认
- 实现过程中发现 v0.3.0 方向根本性错误

## Coverage Cross-Check

17 requirements 全部映射到 test obligations 和 execution batches：

| Requirement | Test Obligation | Batch |
|-------------|----------------|-------|
| TP-1 Enhanced Task Granularity | SKILL.md 审查（无代码级测试） | 2 |
| TP-2 Precise File Path Declaration | SKILL.md 审查 | 2 |
| TP-3 Interface Contract Declaration | SKILL.md 审查 | 2 |
| TP-4 Zero Placeholder Enforcement | SKILL.md 审查 | 2 |
| TP-5 File Structure Section | SKILL.md 审查 | 2 |
| IE-1 Inline Execution Mode | SKILL.md 审查 | 3 |
| IE-2 Inline Mode Checkpoint Review | SKILL.md 审查 | 3 |
| IE-3 Execution Mode Selection | SKILL.md 审查 | 3 |
| AW-1 Abandoned Terminal State | SKILL.md + docs 审查 | 4 |
| AW-2 Abandonment Summary Generation | 模板审查 + 常量验证 | 4 |
| AW-3 Partial Code Preservation | SKILL.md 审查 | 4 |
| AW-4 No Delta Spec Merge on Abandonment | SKILL.md 审查 | 4 |
| VF-1 Three-Dimensional Verification | `validateImplementation()` e2e 测试 | 5 |
| VF-2 Verification Dimension Report | `validateImplementation()` e2e 测试 | 5 |
| VF-3 Implementation Validator Engine | `validateImplementation()` e2e 测试 | 5+6 |
| SM-1 Eight-State Workflow | docs + SKILL.md 审查 | 4 |
| SM-2 Abandoned State Routing | docs + SKILL.md 审查 | 4 |

**Coverage gaps**: None. All 17 requirements mapped.
