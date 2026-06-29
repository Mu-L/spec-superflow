# spec-superflow v0.5.0 — Guard & State 设计文档

**Date:** 2026-06-29
**Version:** 0.4.0 → 0.5.0
**Goal:** 从"软提示"到"硬门禁"——为 spec-superflow 增加可靠性层（Reliability Layer），让阶段转换有可执行的门禁、状态恢复有缓存层、过期检测有哈希加速。

---

## 1. 背景

### 1.1 问题

spec-superflow v0.4.0 的 workflow-orchestrator 通过**内容级检测**判断状态——Agent 读取工件全文，人工比对 scope、contract、tasks 的一致性。这个机制在短会话中工作良好，但在以下场景暴露弱点：

1. **上下文压缩后恢复慢**：Agent 需要重新读取 proposal + specs + design + tasks + contract 五份文件全文做比对，每次恢复消耗 ~3500+ tokens。
2. **阶段转换无硬门禁**：SKILL.md 写的是"你应该检查 X、Y、Z"，但 Agent 可能在长上下文中跳过这些检查——没有 exit code、没有阻塞机制。
3. **过期检测昂贵**：比对 proposal scope vs contract intent lock 需要 Agent 阅读并理解两份长文档，纯推理消耗大。

### 1.2 灵感来源

对比分析了 [Comet](https://github.com/rpamis/comet)（v0.3.9，1745 stars）的阶段守护机制，吸收其核心思路但保留 spec-superflow 的差异化：

| Comet 做法 | spec-superflow 吸收方式 |
|---|---|
| Shell 脚本守护（bash） | Node.js 脚本守护，复用 Validator 引擎 |
| `.comet.yaml` 为主状态源 | `.spec-superflow.yaml` 为**派生缓存**，工件优先 |
| 20+ 字段的 YAML 状态机 | 12 字段轻量状态机 |
| SHA256 handoff 上下文 | SHA256 工件哈希 + 独立 contract 哈希 |

### 1.3 设计原则

- **状态文件是派生数据**——永远可从工件重建，损坏就回退内容级检测
- **守护脚本是硬门禁**——exit code ≠ 0 不允许推进，Agent 不能跳过
- **哈希是加速层**——让过期检测从"读全文比对"变成"一次脚本调用"
- **不改动现有 skill 核心逻辑**——v0.5.0 是加一层可靠性，不是重写

---

## 2. 整体架构

v0.5.0 在 spec-superflow 的三层架构下新增**第 0 层：可靠性层（Reliability Layer）**：

```
┌─────────────────────────────────────────────────┐
│  Layer 1: Configuration                         │
│  spec-superflow.config.json                     │
├─────────────────────────────────────────────────┤
│  Layer 2: CLI Toolchain                         │
│  ssf list | validate | doctor | version |       │
│  sync | config | state    ← 新增               │
├─────────────────────────────────────────────────┤
│  Layer 3: Engine Extensions                     │
│  tokenizer.ts | detectSyncConflicts()           │
├─────────────────────────────────────────────────┤
│  Layer 0: Reliability (NEW)                     │
│  guard.mjs     ← 维度组合式阶段守护             │
│  state.mjs     ← 轻量状态机（缓存+恢复）         │
│  hash.mjs      ← SHA256 工件哈希（快速过期检测） │
└─────────────────────────────────────────────────┘
```

### 2.1 v0.5.0 vs v0.6.0 规划

v0.5.0 是**地基**——守护脚本、状态文件、哈希。v0.6.0 是**上层建筑**——在可靠的状态机和守护之上，增加快速路径（hotfix/tweak）、防漂移 Rule（每轮注入）、决策点协议（统一用户交互）。

| 版本 | 主题 | 内容 |
|------|------|------|
| v0.5.0 | 加固 | 阶段守护脚本 + 轻量状态文件 + SHA256 契约哈希 |
| v0.6.0 | 扩展 | 快速路径 hotfix/tweak + 阶段防漂移 Rule + 决策点协议 |

---

## 3. 守护检查维度 & 状态转换矩阵

### 3.1 五个检查维度

每个维度是独立的检查函数，返回 `{pass: boolean, failures: string[]}`。维度之间无依赖，可独立调用和测试。

| 维度 | 函数 | 检查内容 | 复用引擎 |
|------|------|---------|---------|
| `artifacts-exist` | `checkArtifactsExist()` | proposal.md、design.md、tasks.md 存在且非空，specs/ 目录非空 | —（纯文件检查） |
| `schema-valid` | `checkSchemaValid()` | 调用 `Validator.validateChangeContent()` + 每个 spec 的 `validateSpecContent()`，全部通过 | Validator（src/validation/） |
| `contract-fresh` | `checkContractFresh()` | 比对 `.spec-superflow.yaml` 中的 `artifacts_hash` 与当前工件哈希，一致则 fresh | hash.mjs |
| `tasks-complete` | `checkTasksComplete()` | tasks.md 所有 `- [ ]` 变为 `- [x]`，无未完成项 | —（纯文本检查） |
| `tests-passing` | `checkTestsPassing()` | `.spec-superflow.yaml` 中 `test_result` 字段为 `pass` | —（读状态文件） |

### 3.2 状态转换矩阵

spec-superflow 有 8 个状态：`exploring → specifying → bridging → approved → executing → closing`（+ `debugging`、`abandoned`）。

每个转换需要的检查维度组合：

| 转换 | 所需维度 | 备注 |
|------|---------|------|
| `exploring → specifying` | `artifacts-exist` | 至少 proposal.md 存在且非空 |
| `specifying → bridging` | `artifacts-exist` + `schema-valid` | 4 工件齐全 + Schema 验证通过 |
| `bridging → approved` | `artifacts-exist` + `schema-valid` + `contract-fresh` | 用户批准后，contract 必须是最新的 |
| `approved → executing` | `artifacts-exist` + `contract-fresh` | 进入执行前最后确认 contract 未过期 |
| `executing → closing` | `tasks-complete` + `tests-passing` | 所有任务完成 + 测试通过 |
| `executing → debugging` | 无（自动路由） | 遇到 bug 强制进入，不检查 |
| `debugging → executing` | `contract-fresh` | 修复后确认 contract 范围未变 |
| `any → abandoned` | 无（用户确认后） | 放弃不检查完成度 |

**关键门禁：**
- `bridging → approved` 是唯一需要 `schema-valid` 的转换——规划质量的硬门禁
- `executing → closing` 是唯一需要 `tests-passing` 的——验证前完成铁律的脚本化

---

## 4. `.spec-superflow.yaml` 状态文件

### 4.1 Schema

```yaml
# .spec-superflow.yaml — 轻量状态机
# 派生数据，永远可从工件重建。丢失/损坏 → 回退内容级检测自动重建。

# === 核心状态 ===
state: executing                  # exploring | specifying | bridging | approved | executing | closing | abandoned
workflow: full                    # full | hotfix | tweak（v0.6.0 启用 hotfix/tweak）

# === 哈希（快速过期检测） ===
artifacts_hash: sha256:abc123...  # proposal + specs + design + tasks 的联合哈希
contract_hash: sha256:def456...   # execution-contract.md 自身的哈希

# === 执行进度 ===
execution_mode: sdd               # sdd | inline
batches_completed: 2              # 已完成的批次计数
test_result: null                 # null | pass | fail（closure-archivist 写入）

# === 元数据 ===
change_name: v0.5.0-guard-and-state
last_transition: 2026-06-29T14:00:00Z
last_transition_from: bridging
last_transition_to: approved
```

### 4.2 字段设计理由

| 字段 | 为什么需要 | 能否从工件重建 |
|------|-----------|--------------|
| `state` | 上下文压缩后恢复，不用重新内容检测 | ✅ 能 |
| `workflow` | v0.6.0 快速路径需要区分 full/hotfix/tweak | ✅ 能（从 artifact 齐全度推断） |
| `artifacts_hash` | 一次 `ssf state check` 就知道工件是否变了 | ✅ 能（重新计算） |
| `contract_hash` | 同上，针对 contract 单独追踪 | ✅ 能 |
| `execution_mode` | 恢复执行时知道用 SDD 还是 inline | ❌ 不能（是用户决策） |
| `batches_completed` | 恢复时知道哪些批次已完成，不重复执行 | ⚠️ 部分（可从 progress.md 推断） |
| `test_result` | closure-archivist 写入，守护脚本检查 | ✅ 能（重新跑测试） |
| `change_name` | 自包含，文件移动后不丢失身份 | ✅ 能（从目录名） |
| `last_transition` | 审计追踪 | ✅ 能（从 git log 推断） |

### 4.3 生命周期

```
ssf state init <change-dir>     ← bridge-contract 完成后首次创建
ssf state check <change-dir>    ← 验证一致性（哈希比对），workflow-orchestrator 入口时调用
ssf state transition <change-dir> <to-state>  ← 守护脚本通过后更新状态
ssf state get <change-dir> <field>   ← Agent 读取单个字段
ssf state rebuild <change-dir>  ← 从工件重建状态文件（损坏时）
```

### 4.4 与 Comet `.comet.yaml` 的区别

| | Comet | spec-superflow |
|---|---|---|
| 定位 | 主状态源 | 派生缓存 |
| 字段数 | ~20+ | ~12 |
| 写入方式 | `comet-state.sh set` | `ssf state transition`（只能通过守护脚本推进） |
| 损坏恢复 | 手工修复 | `ssf state rebuild` 自动从工件重建 |
| 内容级检测 | 无（信任 YAML） | 有（不一致时工件优先，自动修正） |

---

## 5. SHA256 哈希机制

### 5.1 哈希计算

`scripts/lib/hash.mjs` — 零依赖，使用 `node:crypto`：

```javascript
// 联合哈希：一次性计算 4 工件的 SHA256
computeArtifactsHash(changeDir) → "sha256:abc123..."
// 输入：按字母序读取 proposal.md + specs/*/spec.md + design.md + tasks.md
// 拼接为单个字符串 → crypto.createHash('sha256').update(str).digest('hex')

// 单文件哈希：contract 单独追踪
computeContractHash(changeDir) → "sha256:def456..."
// 输入：execution-contract.md 全文

// 快速比对：不重新读文件，直接比状态文件中的哈希
isContractFresh(changeDir) → boolean
// 1. 读 .spec-superflow.yaml 的 artifacts_hash
// 2. 重新计算当前工件的哈希
// 3. 比对 → 返回 true/false
```

### 5.2 过期检测性能对比

**优化前（v0.4.0，纯内容级检测）：**
```
Agent 读取 proposal.md 全文（~2000 tokens）
  → 读取 execution-contract.md 全文（~1500 tokens）
  → 人工比对 scope 是否一致
  → 总消耗：~3500 tokens + Agent 推理
```

**优化后（v0.5.0，哈希加速）：**
```
Agent 运行：node scripts/guard/guard.mjs check <dir> approved executing
  → guard.mjs 内部调用 hash.mjs 做哈希比对
  → 返回：{pass: true} 或 {pass: false, failures: [...]}
  → 总消耗：~50 tokens（命令输出）
```

**节省：~98% 的过期检测 token。**

### 5.3 哈希存储位置

哈希存入 `.spec-superflow.yaml`（不在 contract 中嵌入 HTML 注释），保持 contract 干净。Agent 通过 `ssf state get <field>` 读取。

---

## 6. 守护脚本接口

### 6.1 调用方式

```
node scripts/guard/guard.mjs check <change-dir> <from-state> <to-state> [--json]
```

单一入口，内部根据 `<from-state> → <to-state>` 查转换矩阵，组合需要的检查维度。Agent 只需记住一个命令。

### 6.2 输出格式

**通过时：**
```json
{
  "pass": true,
  "checks": [
    {"dimension": "artifacts-exist", "pass": true},
    {"dimension": "schema-valid", "pass": true},
    {"dimension": "contract-fresh", "pass": true}
  ]
}
```

**失败时：**
```json
{
  "pass": false,
  "checks": [
    {"dimension": "artifacts-exist", "pass": true},
    {"dimension": "schema-valid", "pass": false, "failures": [
      "specs/auth/spec.md: Requirement 'User Login' missing SHALL or MUST",
      "proposal.md: ## Why section is only 23 chars (minimum 50)"
    ]},
    {"dimension": "contract-fresh", "pass": true}
  ]
}
```

### 6.3 在 workflow-orchestrator 中的集成

workflow-orchestrator SKILL.md 中，每个路由规则前增加守护脚本调用：

```markdown
### Route to execution-governor when:
- **Guard check**: Run `node scripts/guard/guard.mjs check <dir> approved executing`
  - If exit code ≠ 0 → BLOCK. Report failures to user, do not route.
  - If exit code = 0 → proceed with routing.
- execution-contract.md exists
- user has explicitly approved it
```

---

## 7. 文件变更清单

### 7.1 新增文件

| 文件 | 用途 | 估计行数 |
|------|------|---------|
| `scripts/guard/guard.mjs` | 主入口：解析参数、查转换矩阵、组合维度、输出结果 | ~80 |
| `scripts/guard/checks/artifacts-exist.mjs` | 检查 4 工件 + specs/ 目录存在且非空 | ~30 |
| `scripts/guard/checks/schema-valid.mjs` | 调用 Validator 验证所有工件 | ~40 |
| `scripts/guard/checks/contract-fresh.mjs` | 调 hash.mjs 比对哈希 | ~20 |
| `scripts/guard/checks/tasks-complete.mjs` | 检查 tasks.md 无未勾选项 | ~25 |
| `scripts/guard/checks/tests-passing.mjs` | 读状态文件确认 test_result=pass | ~15 |
| `scripts/lib/hash.mjs` | SHA256 计算 + 比对 | ~40 |
| `scripts/lib/cmd-state.mjs` | `ssf state` 子命令（init/check/transition/get/rebuild） | ~120 |
| `scripts/lib/state-loader.mjs` | YAML 读写（零依赖，regex 解析，与 config-loader 同模式） | ~60 |

### 7.2 修改文件

| 文件 | 改动 | 影响行数 |
|------|------|---------|
| `scripts/spec-superflow.mjs` | 新增 `state` 子命令路由 | +10 |
| `skills/workflow-orchestrator/SKILL.md` | 每个路由规则前增加守护脚本调用指令 | +30 |
| `skills/bridge-contract/SKILL.md` | 生成 contract 后自动运行 `ssf state init` | +5 |
| `skills/closure-archivist/SKILL.md` | 验证完成后运行 `ssf state transition <dir> closing` 写入 test_result | +5 |
| `skills/execution-governor/SKILL.md` | 每批次完成后更新 `batches_completed` | +5 |
| `package.json` | 版本号 → 0.5.0 | 1 |
| `CHANGELOG.md` | v0.5.0 条目 | — |
| `README.md` | 更新架构图 + CLI 命令表 | — |

### 7.3 不变的东西

- 9 个 skill 的核心逻辑不变
- `src/validation/validator.ts` 不变（只被调用，不修改）
- 内容级检测逻辑不变（守护脚本失败时回退）
- 现有 `ssf list/validate/doctor/version/sync/config` 命令不变
- 零外部依赖约束不变

---

## 8. 实现顺序

### Step 1: 基础设施（预计 1 天）

```
hash.mjs → state-loader.mjs → artifacts-exist.mjs
```
产物：脚本可以读/写状态文件 + 计算哈希

### Step 2: 守护脚本（预计 1 天）

```
schema-valid.mjs → contract-fresh.mjs → tasks-complete.mjs → tests-passing.mjs
→ guard.mjs（主入口 + 转换矩阵）
```
产物：`guard.mjs check` 命令完整可用

### Step 3: 集成 + CLI（预计 1 天）

```
cmd-state.mjs → ssf 入口更新 → 4 个 skill 文件更新 → 文档/版本号
```
产物：端到端可用，workflow-orchestrator 能调用守护脚本

---

## 9. 风险与缓解

| 风险 | 缓解 |
|------|------|
| ESM/CJS 互操作：guard.mjs 为 ESM，dist/ 为 CommonJS | 使用动态 `import()` 加载 dist/index.js，与现有 CLI 脚本模式一致 |
| 状态文件与工件不一致 | 工件优先。`ssf state check` 发现不一致时自动回退内容级检测并修正状态文件 |
| 守护脚本增加 Agent 调用负担 | 每次路由前只多一次 shell 命令（~50 tokens 输出），远低于当前内容级检测的 ~3500 tokens |
| 状态文件被误删 | `ssf state rebuild` 一键从工件重建，零信息丢失 |

---

## 10. 展望 v0.6.0

v0.5.0 的可靠性层为 v0.6.0 提供地基：

| v0.6.0 特性 | 依赖 v0.5.0 的什么 |
|------------|-------------------|
| 快速路径 hotfix/tweak | `workflow` 字段区分 full/hotfix/tweak 模式；守护脚本根据 workflow 跳过特定检查 |
| 阶段防漂移 Rule | `ssf state get` 提供当前阶段信息，供 Rule 文件动态生成 |
| 决策点协议 | `ssf state transition` 确保决策点前后的状态一致性 |