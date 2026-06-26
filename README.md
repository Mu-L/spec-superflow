<h1 align="center">spec-superflow</h1>

<p align="center">
  <strong>连通"需求说清楚"和"代码写对路"的 AI 编程工作流插件</strong>
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="MIT License"></a>
  <a href="INSTALL.md"><img src="https://img.shields.io/badge/Claude%20Code%20%7C%20Trae-supported-green.svg" alt="Claude Code | Trae"></a>
  <a href="https://github.com/MageByte-Zero/spec-superflow/stargazers"><img src="https://img.shields.io/github/stars/MageByte-Zero/spec-superflow" alt="GitHub Stars"></a>
</p>

<p align="center">
  <a href="#为什么需要它">为什么需要它</a> |
  <a href="docs/README_en.md">English</a> |
  <a href="docs/showcase.html">Showcase</a> |
  <a href="#核心-skills">Skills</a> |
  <a href="#快速开始">快速开始</a> |
  <a href="#工作流">工作流</a> |
  <a href="#常见问题">FAQ</a>
</p>

---

## 为什么需要它

用 AI 写代码时，最常碰到两个失控点：

- **还没想清楚要做什么，AI 就开始写代码。** 你说了句"帮我加个权限控制"，它就开始改几十个文件。改到一半才发现 —— 到底要 RBAC 还是 ABAC？

- **规划文档写得明明白白，但执行阶段还是会跑偏。** proposal 写了、design 画了，但实现过程中没人盯着测试、没人卡 review，等到合并才发现行为不对。

**spec-superflow 在两个失控点之间加了一道硬桥：**

`spec-explorer` 先把需求问清楚 -> `spec-forger` 把意图沉淀为正式工件 -> `bridge-contract` 把规划压缩成执行契约 `execution-contract.md` -> `execution-governor` 只按已批准的契约推进实现。

它不是把 OpenSpec 和 Superpowers 并排安装再手工拼接，而是把两者最有价值的部分吸收进一个统一的 workflow owner。

| 设计原则 | 说明 |
|---|---|
| Spec First | 没有稳定的规划工件，不允许进入实现 |
| Guarded Handoff | `execution-contract.md` 是规划到实现的唯一交接层 |
| Strong Guardrails | 实现过程中违反契约的行为被明确拦截并回退 |
| Self-Contained | 不需要运行时安装 OpenSpec 或 Superpowers |

## 核心 Skills

| Skill | 阶段 | 职责 |
|---|---|---|
| `workflow-orchestrator` | 入口 | 检查状态、路由到正确的 skill、阻止非法跳转 |
| `spec-explorer` | 探索 | 澄清意图、范围、约束、成功标准 |
| `spec-forger` | 规格 | 生成 proposal、specs、design、tasks |
| `bridge-contract` | 桥接 | 把规划工件压缩为 `execution-contract.md` |
| `execution-governor` | 执行 | 强制 TDD、评审关卡、契约优先实现 |
| `closure-archivist` | 收口 | 验证、总结、归档准备 |

## 快速开始

### 安装

支持 Claude Code 和 Trae 本地 skills 安装。完整说明见 [INSTALL.md](INSTALL.md)。

**Claude Code：**

```bash
mkdir -p ~/.claude/skills
cp -R skills/workflow-orchestrator ~/.claude/skills/
cp -R skills/spec-explorer ~/.claude/skills/
cp -R skills/spec-forger ~/.claude/skills/
cp -R skills/bridge-contract ~/.claude/skills/
cp -R skills/execution-governor ~/.claude/skills/
cp -R skills/closure-archivist ~/.claude/skills/
```

**Trae：**

```bash
mkdir -p ~/.trae/skills
cp -R skills/workflow-orchestrator ~/.trae/skills/
cp -R skills/spec-explorer ~/.trae/skills/
cp -R skills/spec-forger ~/.trae/skills/
cp -R skills/bridge-contract ~/.trae/skills/
cp -R skills/execution-governor ~/.trae/skills/
cp -R skills/closure-archivist ~/.trae/skills/
```

### 使用

安装完成后，告诉 Agent：

- 启动新的  change -> "用 workflow-orchestrator"
- 恢复旧的 change -> "继续上次的工作流"
- 不确定当前状态 -> "帮我看看现在该干什么"

Agent 会自动检查当前工件，判断处于探索/规格/桥接/执行/收口的哪个阶段。

## 工作流

对于名为 `<change-name>` 的变更，推荐的工件目录：

```text
workflow/
└── changes/<change-name>/
    ├── proposal.md
    ├── design.md
    ├── tasks.md
    ├── specs/
    │   └── <capability>.md
    └── execution-contract.md
```

流程线是：

```text
proposal/specs/design/tasks -> execution-contract.md -> 用户批准 -> 开始实现
```

**规划本身不等于可以实现。** 如果 `execution-contract.md` 缺失、过时或未被用户批准，工作流会拒绝进入实现阶段。

## 示例

两个完整 change 示例展示了从 proposal 到 execution contract 的贯通路径：

- `docs/examples/add-dark-mode/` -- 新 UI 功能（暗色模式）
- `docs/examples/refactor-auth-boundary/` -- brownfield 后端重构（认证边界）

阅读顺序：`proposal.md` -> `specs/` -> `design.md` -> `tasks.md` -> `execution-contract.md`

## 常用问题

<details>
<summary><strong>spec-superflow 和 OpenSpec / Superpowers 什么关系？</strong></summary>

OpenSpec 侧重规划工件（proposal、specs、design、tasks）。Superpowers 侧重执行纪律（TDD、review gate、subagent 驱动开发）。spec-superflow 把两者合并为一个工作流：先规划，通过桥接层压缩为执行契约，再在约束下实现。

你不需要运行时安装 OpenSpec 或 Superpowers。
</details>

<details>
<summary><strong>能用在我已有的 OpenSpec change 目录上吗？</strong></summary>

可以部分兼容。如果你的目录已经有 proposal、specs、design、tasks，可以直接用 bridge-contract 生成 execution contract。但不要在同一会话混用 OpenSpec CLI 命令和 spec-superflow skills——选一个做 workflow owner。
</details>

<details>
<summary><strong>支持 brownfield / 已有代码库吗？</strong></summary>

支持。工作流不假设你是从零开始的项目。spec-explorer 会先检查项目上下文再提问。见 `refactor-auth-boundary` 示例。
</details>

<details>
<summary><strong>第一版支持哪些平台？</strong></summary>

Claude Code 和 Trae。两者都通过本地 skills 目录加载，不需要额外运行时依赖。
</details>

<details>
<summary><strong>execution contract 怎么知道该更新了？</strong></summary>

以下情况视为 contract 过时：

- proposal.md 范围变了
- specs/ 里的已批准需求改了
- design.md 架构或接口约束变了
- tasks.md 执行批次变了

过时后 workflow-orchestrator 会回退到 bridge-contract，不会继续执行。
</details>

## 当前状态

当前仓库 v0.1 已可用：

- 插件元数据已就位
- 六个核心 skills 已具备明确职责和路由规则
- 五类模板完整（proposal、spec、design、tasks、execution-contract）
- 工件映射与状态机文档齐全
- 两个完整示例（UI 功能 + 后端重构）
- 安装指南、许可证、版本记录已补齐

---

**Star 一下，下次需要的时候能找到。**
