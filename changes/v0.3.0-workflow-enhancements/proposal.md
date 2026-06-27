# Change Proposal: v0.3.0 Workflow Enhancements

## Why

spec-superflow v0.2.1 整合了 OpenSpec 规划引擎和 Superpowers 执行纪律，但在实际使用中暴露四个关键短板：

1. **任务拆解粒度不足** — spec-forger 生成的 tasks.md 只有粗粒度步骤（"write test → implement → review"），缺少精确文件路径、接口契约、TDD 红绿重构展开。Superpowers 的 writing-plans 方法论远更成熟，但未被吸收。
2. **执行模式单一** — execution-governor 只有 SDD subagent 模式，小改动（≤3 任务、无跨模块依赖）也要 dispatch subagent + reviewer，太重。缺少轻量 inline 模式。
3. **无放弃路径** — 7 态状态机只有 closing 一个终态。执行中发现方向错误时无法优雅退出，只能卡住或强行关闭。
4. **验证维度不足** — closure-archivist 只检查 spec compliance（SHALL/MUST 关键词、scenario 覆盖），缺少对实现完整性（Completeness）、正确性（Correctness）、设计一致性（Coherence）的系统检查。OpenSpec 的三维验证框架更可靠。

这四个短板阻碍了 spec-superflow 从"可用"走向"可靠"。v0.3.0 的目标是补齐它们，为 v1.0.0 奠定基础。

## What Changes

- spec-forger 的任务拆解逻辑重写：吸收 writing-plans 方法论（每步 2-5 分钟、精确文件路径、Interfaces 块、TDD 展开、零占位符）
- tasks.md 模板更新：增加 File Structure 和 Interfaces 部分
- execution-governor 增加双模式路由：SDD 模式（大改动）和 Inline 模式（小改动），保留 TDD Iron Law
- execution-contract.md 模板增加 Execution Mode 和 Verification Dimensions 字段
- 状态机扩展为 8 态：新增 `abandoned` 终态
- workflow-orchestrator 路由规则更新：任何状态可转向 abandoned
- 新增 abandonment-summary.md 模板
- closure-archivist 整合三维验证框架（Completeness + Correctness + Coherence）
- Validator 引擎扩展：新增 `validateImplementation()` 方法
- docs/state-machine.md 更新为 8 态

## Capabilities

### New Capabilities

- `inline-execution` — 轻量级单会话执行模式，与 SDD 并行
- `abandonment-workflow` — 变更放弃路径，含原因记录 + 教训总结 + 部分代码保留

### Modified Capabilities

- `task-planning` — spec-forger 任务拆解增强（writing-plans 方法论）
- `verification-framework` — closure-archivist 三维验证（Completeness + Correctness + Coherence）
- `state-machine` — 8 态（+abandoned 终态）

## Scope

### In Scope

- spec-forger SKILL.md 任务拆解章节重写
- tasks.md 模板更新（File Structure + Interfaces）
- execution-governor SKILL.md 双模式路由
- execution-contract.md 模板增加 Execution Mode + Verification Dimensions
- workflow-orchestrator SKILL.md 路由规则 + 状态定义更新
- closure-archivist SKILL.md 三维验证整合
- 新增 abandonment-summary.md 模板
- Validator 引擎新增 `validateImplementation()` 方法
- src/validation/constants.ts 新增三维验证相关常量
- docs/state-machine.md 更新为 8 态
- src/index.ts 导出新类型
- tests/e2e.test.ts 新增验证测试用例
- package.json / plugin.json / marketplace.json 版本同步至 0.3.0
- CHANGELOG.md 添加 v0.3.0 条目

### Out of Scope

- CLI 工具链（留给 v0.4.0）
- 可配置 Schema / YAML 工件依赖图（留给 v0.4.0）
- git worktree 隔离工作区
- spec-syncer 增强
- 多平台适配器扩展
- skill-creator 工具包

## Impact

- Affected code areas: `skills/spec-forger/`, `skills/execution-governor/`, `skills/closure-archivist/`, `skills/workflow-orchestrator/`, `src/validation/`, `templates/`, `docs/`, `tests/`
- Affected APIs or interfaces: `Validator` class 新增 `validateImplementation()` 方法；`src/index.ts` 新增导出类型 `VerificationDimension`, `VerificationResult`
- Dependencies or systems touched: 无新增外部依赖（保持零 npm 依赖约束）
