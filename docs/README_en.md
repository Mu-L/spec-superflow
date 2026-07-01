# spec-superflow

`spec-superflow` is a self-contained workflow integration plugin for AI coding agents.

It combines:

- OpenSpec-style artifact thinking: `proposal.md`, `specs/`, `design.md`, `tasks.md`
- Superpowers-style execution discipline: guardrails, TDD, review gates, controlled handoff

The key idea:

```text
clarify -> specify -> bridge -> execute -> close
```

Instead of requiring users to install both upstream systems and manually stitch them together, `spec-superflow` absorbs the useful parts of each and exposes one coherent workflow.

## Why It Exists

Most AI coding sessions fail in one of two ways:

1. The AI starts writing code before "what we are building" is stable.
2. The team does define the change, but implementation still drifts because testing, review, and handoff are too loose.

`spec-superflow` addresses both:

- `need-explorer` and `spec-writer` make the change explicit.
- `contract-builder` turns planning artifacts into an `execution-contract.md`.
- `build-executor` treats that contract as the approved source for implementation behavior.

## When to Use

### ✅ Good Fit

| Scenario | Why |
|----------|-----|
| **Large feature development** | Needs explicit planning, review gates, and test discipline to prevent drift |
| **Multi-person collaboration** | `execution-contract.md` provides clear contracts and review standards |
| **Long-term maintenance** | `spec-merger` prevents spec rot; delta specs support continuous evolution |
| **TDD + Review Gate required** | Built-in TDD Iron Law + SDD subagent-driven + dual review |
| **Brownfield projects** | `need-explorer` inspects existing code before planning changes |
| **Need for planning stability** | `contract-builder` ensures planning is stable before implementation begins |

### ❌ Not a Good Fit

| Scenario | Why | Alternative |
|----------|-----|-------------|
| **Quick prototype / Demo** | Workflow is heavy, high token cost | Use Claude Code default behavior |
| **Small changes (< 100 lines)** | 9 skills + 7 states is overkill | Just edit code + test |
| **Exploratory development** | Planning changes frequently, contract goes stale fast | Use `need-explorer` alone, skip full workflow |
| **Personal experimental project** | Review gates and archiving add burden | Use Superpowers or OpenSpec alone |
| **Pure bug fix** | No planning phase needed | Use `bug-investigator` alone |
| **Learning / experimenting with new tools** | Workflow restricts exploration freedom | Just experiment directly |

### 💡 Rule of Thumb

> **If you can figure out a change without writing a proposal and design doc, spec-superflow is probably too heavy for it.**
>
> Quick test: If you'd spend more than 5 minutes explaining the change in a team standup, spec-superflow is worth it.

## Recommended Usage

### The Single Entry Point

**Everything starts from `workflow-start`.**

Whenever you begin or resume a change, just tell your agent:

```
use workflow-start to start
```

`workflow-start` inspects the current artifact directory, determines which stage you're in, and routes to the correct next skill. You don't need to memorize six skill names or manually figure out "what should I do next" — the entry point handles it.

### Full Flow: Six States, One Pipeline

```text
You: "add authorization to the API"
       │
       ▼
┌──────────────────────────┐
│  workflow-start    │  ← Single entry. Inspects state, routes forward
└──────┬───────────────────┘
       │
       ▼
   exploring         need-explorer asks: "RBAC or ABAC?" "What granularity?" "Which endpoints?"
       │
       ▼
   specifying        spec-writer produces 4 artifacts: proposal + specs + design + tasks
       │
       ▼
   bridging          contract-builder compresses 4 artifacts into 1 execution-contract.md
       │                 ┌────────────────────────────────────────┐
       │                 │ execution-contract.md                  │
       │                 │  - Input / Output / Boundaries         │
       │                 │  - Per-item test checklist             │
       │                 │  - Review gates                        │
       │                 └────────────────────────────────────────┘
       │
  ◇ User Approval ◇   ← The only human gate: you review, confirm, say "approved"
       │
       ▼
   executing         build-executor enforces TDD, review gates, contract compliance
       │
       ▼
   closing           release-archivist verifies, summarizes, archives
```

**Hard constraints:**

- No `execution-contract.md` or no user approval → **implementation is blocked**
- Violating the contract during implementation → **intercepted and rolled back**, not left to developer intuition
- Requirements change mid-execution → **forced rollback to `specifying` or `bridging`**, no silent scope creep

### The Superpower: Truly Integrating OpenSpec + Superpowers

Most AI coding workflows fall into two camps:

| Camp | Example | Strength | Weakness |
|---|---|---|---|
| Planning-first | OpenSpec | Clean proposal, specs, design, tasks | Stops at documentation. Implementation runs unguarded |
| Discipline-first | Superpowers | TDD, review gates, subagent-driven dev | No formal planning layer. No hard judgment on "is the spec stable?" |

**spec-superflow bridges both worlds:**

```text
OpenSpec strengths                 Superpowers strengths
    │                                    │
    │  proposal                          │  brainstorming
    │  specs                             │  TDD
    │  design                            │  review gates
    │  tasks                             │  subagent-driven-dev
    │                                    │
    └──────────┬─────────────────────────┘
               │
               ▼
      ┌─────────────────────┐
      │  execution-contract  │  ← spec-superflow's bridge layer
      │  .md                 │     Planning artifacts compressed into
      └─────────────────────┘     verifiable contract.
               │                  Execution discipline only activates
               ▼                  against approved contract.
        Planning is no longer just reference material.
        Execution no longer drifts on its own.
```

In concrete terms:

1. **Absorbs OpenSpec's planning capability** — proposal, specs, design, tasks as formal artifacts, not the end of the process
2. **Absorbs Superpowers' execution discipline** — TDD, review gates, violation interception, but requires an approved contract to activate
3. **`execution-contract.md` is the unique innovation** — not another planning doc, but a **verifiable contract**: inputs/outputs/boundaries/test checklist/review gates, each item checkable during implementation
4. **Self-Contained** — no OpenSpec install, no Superpowers install. One plugin, one workflow owner.

## Core Skills

| Skill | Stage | Responsibility |
|---|---|---|
| `workflow-start` | Entry | Inspect state, route to correct skill, block invalid transitions |
| `need-explorer` | Exploring | Clarify intent, scope, constraints, and success criteria |
| `spec-writer` | Specifying | Generate proposal, specs, design, and tasks |
| `contract-builder` | Bridging | Convert planning artifacts into `execution-contract.md` |
| `build-executor` | Executing | Enforce TDD, review gates, and contract-first implementation |
| `release-archivist` | Closing | Verify, summarize, and prepare for archive |

## Install

Supports **Claude Code / Cursor / OpenAI Codex CLI / OpenAI Codex App / GitHub Copilot CLI / Gemini CLI**.

Any client that can load a local `skills/` directory can use the same repository clone flow, including OpenCode, Trae, Qoder, and Trae CN.

**Claude Code:**

```
/plugin marketplace add MageByte-Zero/spec-superflow
/plugin install spec-superflow@spec-superflow
```

**Cursor:**

```
/add-plugin spec-superflow
```

**OpenAI Codex CLI:**

```bash
codex plugin marketplace add MageByte-Zero/spec-superflow
codex plugin add spec-superflow@spec-superflow
```

`spec-superflow` is not part of the OpenAI curated marketplace, so add this repository as a marketplace first.

**OpenAI Codex App:**

Run the Codex CLI marketplace commands above, restart the Codex app, then open **Plugins** and switch to the `spec-superflow` marketplace.

**OpenCode:**

```bash
git clone https://github.com/MageByte-Zero/spec-superflow.git
mkdir -p your-project/.agents
ln -s /absolute/path/to/spec-superflow/skills your-project/.agents/skills
```

**GitHub Copilot CLI:**

```
copilot plugin marketplace add MageByte-Zero/spec-superflow
copilot plugin install spec-superflow@spec-superflow
```

**Gemini CLI:**

```
gemini extensions install https://github.com/MageByte-Zero/spec-superflow
```

**Trae:**

```bash
git clone https://github.com/MageByte-Zero/spec-superflow.git
mkdir -p ~/.trae/skills
cp -R spec-superflow/skills/* ~/.trae/skills/
```

All install methods: [INSTALL.md](INSTALL.md)

## Quick Start

1. Install the plugin (see above).
2. Create or choose a change workspace under `workflow/changes/<change-name>/`.
3. Start from `workflow-start`.
4. Let the workflow move through exploration, specification, bridging, execution, and closure.

## Version Notes

- Current release: `v0.6.0`
- `spec-superflow` is self-contained and does not require runtime installation of OpenSpec or Superpowers
- Upstream source projects: [Fission-AI/OpenSpec](https://github.com/Fission-AI/OpenSpec) and [obra/superpowers](https://github.com/obra/superpowers)

## How To Use

### 1. Start from the orchestrator

Ask the agent to use `workflow-start` when:

- starting a new change
- resuming an old change
- deciding what stage the work is in

### 2. Let the workflow move through five artifact steps

For a change named `<change-name>`, the plugin expects:

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

### 3. Use one workflow owner

Do not ask the same session to separately run:

- OpenSpec workflow commands
- Superpowers workflow entry points
- `spec-superflow` orchestration

Pick `spec-superflow` as the visible workflow owner and let it absorb the rest.

### 4. Let the contract gate execution

Planning alone does not authorize implementation.

The intended handoff is:

```text
proposal/specs/design/tasks -> execution-contract.md -> approved build work
```

If the contract is missing, stale, or unapproved, route back instead of coding forward.

## Included Templates

Templates live in `templates/`:

- `proposal.md`
- `spec.md`
- `design.md`
- `tasks.md`
- `execution-contract.md`

## Example Workflow

Two complete change sets demonstrate the full progression from proposal to execution contract:

- `docs/examples/add-dark-mode/` -- net-new UI capability (dark mode)
- `docs/examples/refactor-auth-boundary/` -- brownfield backend refactor (auth layer)

Read each in artifact order: `proposal.md` -> `specs/` -> `design.md` -> `tasks.md` -> `execution-contract.md`.

## FAQ

<details>
<summary><strong>What's the difference between spec-superflow and OpenSpec / Superpowers?</strong></summary>

OpenSpec focuses on planning artifacts (proposal, specs, design, tasks). Superpowers focuses on execution discipline (TDD, review gates, subagent-driven development). spec-superflow merges both into one workflow: plan first, bridge through an execution contract, then build under guardrails.

You do not need to install OpenSpec or Superpowers at runtime.
</details>

<details>
<summary><strong>Can I use this with existing OpenSpec change folders?</strong></summary>

Partially. If your folder already has proposal, specs, design, and tasks, you can run contract-builder to generate the execution contract. The folder structure is compatible. However, mixing OpenSpec CLI commands with spec-superflow skills in the same session is not recommended -- pick one workflow owner.
</details>

<details>
<summary><strong>Does this work with brownfield / existing codebases?</strong></summary>

Yes. The workflow does not assume a greenfield project. The need-explorer inspects the current project context before asking clarifying questions. See the `refactor-auth-boundary` example for a brownfield scenario.
</details>

## Current Status

**v0.2.0** (2026-06-26) — Open-source announcement ready.

- ✅ TypeScript engine with strict compilation (`npm run build`)
- ✅ Integration test suite using real example artifacts (`npm test`)
- ✅ 9 collaborative skills with complete workflow coverage
- ✅ Multi-agent packaging (Claude Code / Cursor / Codex / Copilot CLI / Gemini CLI + local skills clients)
- ✅ Self-contained: zero external npm dependencies
- ✅ Two complete example change sets (add-dark-mode, refactor-auth-boundary)
- ✅ MIT license, CONTRIBUTING.md, and installation guide included

See [CHANGELOG.md](../CHANGELOG.md) for detailed release notes.
