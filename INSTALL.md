# Install

`spec-superflow` is a self-contained plugin. You do not need to install OpenSpec or Superpowers at runtime.

Source lineage:

- [Fission-AI/OpenSpec](https://github.com/Fission-AI/OpenSpec)
- [obra/superpowers](https://github.com/obra/superpowers)

Current release: `v0.6.0`. This repo tracks `spec-superflow` versions, not runtime dependency versions for the upstream projects.

## Claude Code

### Marketplace Install（推荐）

```
/plugin marketplace add MageByte-Zero/spec-superflow
/plugin install spec-superflow@spec-superflow
```

两行命令搞定。零拷贝、零配置。

### 本地安装

```bash
git clone https://github.com/MageByte-Zero/spec-superflow.git
```

在 Claude Code 中执行：

```
/plugin install file:/absolute/path/to/spec-superflow
```

## Cursor

### Marketplace Install（推荐）

在 Cursor Agent chat 中：

```
/add-plugin spec-superflow
```

或者搜索 "spec-superflow" 在 Cursor 插件市场中找到并安装。

### 手动安装

```bash
git clone https://github.com/MageByte-Zero/spec-superflow.git
```

Cursor 会自动发现 `.cursor-plugin/` 目录下的插件。

## OpenAI Codex CLI

在 Codex CLI 中打开插件搜索：

```
/plugins
```

搜索 `spec-superflow`，选择 Install Plugin。

如果暂时搜不到，请先刷新插件列表或重启 Codex CLI，再重新搜索。

## OpenAI Codex App

在 Codex App 中：
- 点击侧边栏的 **Plugins**
- 在 Coding 分类中找到 **spec-superflow**
- 点击 `+` 安装

如果暂时搜不到，请重开 Plugins 面板或确认客户端已经更新到支持插件目录索引的版本。

## OpenCode

在 `opencode.json` 中添加插件：

```json
{
  "plugin": ["spec-superflow@git+https://github.com/MageByte-Zero/spec-superflow.git"]
}
```

重启 OpenCode 即可。详细说明见 [.opencode/INSTALL.md](.opencode/INSTALL.md)。

## GitHub Copilot CLI

```
copilot plugin marketplace add MageByte-Zero/spec-superflow
copilot plugin install spec-superflow@spec-superflow
```

## Gemini CLI

```
gemini extensions install https://github.com/MageByte-Zero/spec-superflow
```

更新：

```
gemini extensions update spec-superflow
```

## Trae

```bash
git clone https://github.com/MageByte-Zero/spec-superflow.git
mkdir -p ~/.trae/skills
cp -R spec-superflow/skills/* ~/.trae/skills/
```

## Qoder / Trae CN / Other Local Skill Clients

If your client can point to a local `skills/` directory, use the same repository clone and map `spec-superflow/skills` into the client-specific skill location.

Typical flow:

```bash
git clone https://github.com/MageByte-Zero/spec-superflow.git
```

Then configure your client to load skills from:

- `<repo>/skills`
- or a client-specific local skills directory that symlinks/copies from `<repo>/skills`

---

## 使用

安装完成后，告诉 Agent：

```
用 workflow-orchestrator 开始
```

`workflow-orchestrator` 会检查当前工件目录，判断你处于探索 / 规格 / 桥接 / 执行 / 收口的哪个阶段，然后自动路由到正确的下一个 skill。

- 启动新的变更 → "用 workflow-orchestrator 开始"
- 恢复旧的变更 → "继续上次的工作流"
- 不确定当前状态 → "帮我看看现在该干什么"

## 工作流目录约定

对于名为 `<change-name>` 的变更：

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

流程线：`proposal/specs/design/tasks -> execution-contract.md -> 用户批准 -> 开始实现`

规划本身不等于可以实现。如果 `execution-contract.md` 缺失、过时或未被用户批准，工作流会拒绝进入实现阶段。

## 验证

安装后验证：

- `workflow-orchestrator` skill 已可用
- 其余 5 个 skill 全部可见

## 故障排查

### Agent 找不到 skill

- 检查 skill 目录名是否与 skill 名一致
- 检查目录下是否存在 `SKILL.md`

### 工作流过早开始实现

从 `workflow-orchestrator` 入口开始，不要直接调用 `execution-governor`。

推荐流程：`exploring -> specifying -> bridging -> approved-for-build -> executing -> closing`
