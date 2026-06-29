# Change Proposal: v0.5.0 Guard & State

## Why

spec-superflow v0.4.0 的 workflow-orchestrator 通过**内容级检测**判断状态——Agent 读取工件全文，人工比对 scope、contract、tasks 的一致性。这个机制在短会话中工作良好，但在实际使用中暴露三个关键短板：

1. **上下文压缩后恢复慢** — Agent 需要重新读取 proposal + specs + design + tasks + contract 五份文件全文做比对，每次恢复消耗 ~3500+ tokens。没有缓存层，每次都是"从零开始"。
2. **阶段转换无硬门禁** — SKILL.md 写的是"你应该检查 X、Y、Z"，但 Agent 可能在长上下文中跳过这些检查。没有 exit code、没有阻塞机制——完全是"软提示"，靠 Agent 自觉。
3. **过期检测昂贵** — 比对 proposal scope vs contract intent lock 需要 Agent 阅读并理解两份长文档，纯推理消耗大。没有哈希加速，每次都是"全文重读"。

对比分析了 [Comet](https://github.com/rpamis/comet)（v0.3.9，1745 stars）的阶段守护机制后，发现其核心思路（shell 脚本守护 + YAML 状态机 + SHA256 哈希追踪）可以吸收，但需保留 spec-superflow 的差异化（自包含、零依赖、工件优先）。

v0.5.0 的目标是为 spec-superflow 增加**可靠性层（Reliability Layer）**，让阶段转换有可执行的门禁、状态恢复有缓存层、过期检测有哈希加速。为 v0.6.0 的快速路径（hotfix/tweak）、防漂移 Rule、决策点协议提供可靠地基。

## What Changes

- 新增 `scripts/guard/guard.mjs` — 维度组合式阶段守护主入口，复用 Validator 引擎
- 新增 `scripts/guard/checks/` — 5 个独立检查维度（artifacts-exist、schema-valid、contract-fresh、tasks-complete、tests-passing）
- 新增 `scripts/lib/hash.mjs` — SHA256 工件哈希计算 + 比对，过期检测从 ~3500 tokens 降到 ~50 tokens
- 新增 `scripts/lib/cmd-state.mjs` — `ssf state` 子命令（init/check/transition/get/rebuild）
- 新增 `scripts/lib/state-loader.mjs` — 零依赖 YAML 读写，与 config-loader 同模式
- 新增 `.spec-superflow.yaml` 状态文件约定 — 12 字段轻量状态机，派生缓存，工件优先
- workflow-orchestrator SKILL.md 每个路由规则前增加守护脚本调用指令
- bridge-contract SKILL.md 生成 contract 后自动运行 `ssf state init`
- closure-archivist SKILL.md 验证完成后运行 `ssf state transition`
- execution-governor SKILL.md 每批次完成后更新 `batches_completed`
- `ssf` 入口新增 `state` 子命令路由

## Capabilities

### New Capabilities

- `guard-checks` — 5 个维度组合式阶段守护，硬门禁替代软提示
- `state-cache` — 轻量状态文件，派生缓存加速上下文恢复
- `hash-acceleration` — SHA256 契约哈希，过期检测 98% token 节省

### Modified Capabilities

- `workflow-orchestrator` — 路由规则增加守护脚本调用
- `bridge-contract` — 增加状态文件初始化步骤
- `closure-archivist` — 增加状态转换步骤
- `execution-governor` — 增加批次进度追踪

## Scope

### In Scope

- `scripts/guard/guard.mjs` 主入口 + 转换矩阵
- `scripts/guard/checks/` 5 个检查维度
- `scripts/lib/hash.mjs` SHA256 计算 + 比对
- `scripts/lib/cmd-state.mjs` ssf state 子命令
- `scripts/lib/state-loader.mjs` YAML 读写
- 4 个 skill 文件更新（workflow-orchestrator、bridge-contract、closure-archivist、execution-governor）
- `scripts/spec-superflow.mjs` 新增 state 子命令路由
- `package.json` / plugin.json / marketplace.json 版本同步至 0.5.0
- `CHANGELOG.md` 添加 v0.5.0 条目
- `README.md` 更新 CLI 命令表

### Out of Scope

- 快速路径 hotfix/tweak（留给 v0.6.0）
- 阶段防漂移 Rule（留给 v0.6.0）
- 决策点协议（留给 v0.6.0）
- 守护脚本 hook 层硬拦截（留给 v0.6.0，需配合防漂移 Rule）
- `src/validation/validator.ts` 修改（只被调用，不修改）

## Impact

- Affected code areas: `scripts/guard/`（新增），`scripts/lib/hash.mjs`（新增），`scripts/lib/cmd-state.mjs`（新增），`scripts/lib/state-loader.mjs`（新增），`scripts/spec-superflow.mjs`（修改），`skills/workflow-orchestrator/`（修改），`skills/bridge-contract/`（修改），`skills/closure-archivist/`（修改），`skills/execution-governor/`（修改）
- Affected APIs or interfaces: 新增 `ssf state` 子命令（init/check/transition/get/rebuild）；新增 `guard.mjs check` 命令
- Dependencies or systems touched: 无新增外部依赖（保持零 npm 依赖约束）；新增 `node:crypto` 内置模块使用