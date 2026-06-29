---
name: workflow-orchestrator
description: Primary entry point for spec-superflow. Invoke when the user says start, continue, resume, implement, plan, or when the current workflow stage is unclear and the next skill must be chosen safely.
---

# Workflow Orchestrator

This is the primary entry point for `spec-superflow`.

Its job is not to implement anything directly. Its job is to:

1. inspect the current change context
2. determine the current workflow state
3. route to the correct next skill
4. block invalid transitions

## Use This Skill When

Invoke this skill first when the user says things like:

- "continue"
- "resume this change"
- "start a new workflow"
- "help me figure out what to do next"
- "begin implementation"
- "let's write the spec"
- "we already planned this, now build it"

Use it whenever the correct next skill is not obvious from the current artifacts.

## Default States

- `exploring`
- `specifying`
- `bridging`
- `approved-for-build`
- `executing`
- `debugging`
- `closing`
- `abandoned`

Read `docs/state-machine.md` before making a state decision if the transition is ambiguous.

## Required Inspection

Before routing, inspect the current change folder if it exists.

Look for:

- `proposal.md`
- `specs/`
- `design.md`
- `tasks.md`
- `execution-contract.md`

Then answer these questions in order:

1. Is the change still fuzzy?
2. Are planning artifacts missing or unstable?
3. Does a bridge contract exist?
4. Has the user explicitly approved the contract for build work?
5. Is execution in progress or blocked by a bug?
6. Is the change already in verification or wrap-up?

### Config-Aware Routing

Before routing, check project configuration:
- Run: `bash "${CLAUDE_PLUGIN_ROOT}/scripts/get-config" artifacts.order`
- If the config specifies a custom artifact order, follow it when checking artifact completeness
- Run: `bash "${CLAUDE_PLUGIN_ROOT}/scripts/get-config" artifacts.skip`
- If artifacts are in the skip list, do not require them for state transitions

## Mode Detection

Before routing, check the workflow mode:
1. Run: `ssf state get <change-dir> workflow`
2. If workflow is `full` or unset → standard routing (no changes)
3. If workflow is `hotfix`:
   - Validate: ≤2 files? No new modules? No schema changes?
   - All pass → use hotfix fast-path routing
   - Any fail → upgrade to `full`, run `ssf state set <dir> workflow full`, output upgrade reason
4. If workflow is `tweak`:
   - Validate: ≤4 files? Single module? Config/doc/prompt only?
   - All pass → use tweak fast-path routing
   - Any fail → upgrade to `full`, run `ssf state set <dir> workflow full`, output upgrade reason

## Enhanced Stale Detection via Content Inspection

Do not rely solely on file existence to determine staleness. Inspect file **contents** to detect drift:

### Detecting stale `execution-contract.md`

Compare the **intent lock** in the contract against the current proposal:

- Open `proposal.md` and read the scope (## What Changes, ## Scope sections)
- Open `execution-contract.md` and read the **Intent Lock** section
- If the proposal's scope has expanded beyond what the contract's scope fence allows → **stale**
- If the contract references capabilities no longer in the proposal → **stale**

### Detecting stale planning artifacts

Compare the proposal's scope against spec files:

- Open `proposal.md` and note which capabilities are in scope
- Open `specs/<capability>/spec.md` for each listed capability
- If a proposal-listed capability has no spec file → **stale artifacts**
- If a spec file exists for a capability not in the proposal scope → **drift detected**

### Detecting stale spec vs. tasks

- Open `specs/` and list all requirement names (SHALL/MUST statements)
- Open `tasks.md` and check that each spec requirement is represented in at least one task
- If a requirement has no corresponding task → **stale tasks**

## Routing Rules

### Route to `spec-explorer` when:

- the request is still fuzzy
- scope is unclear
- the user is comparing options
- there is no stable change name yet

### Route to `spec-forger` when:

- **Guard check**: If a change directory exists, run `node scripts/guard/guard.mjs check <dir> exploring specifying --json`
  - If exit code ≠ 0 → BLOCK. Report failures, do not route.
  - If exit code = 0 → proceed.
- the user knows what they want
- planning artifacts are missing or incomplete
- proposal, specs, design, or tasks need to be created or revised

### Route to `bridge-contract` when:

- **Guard check**: Run `node scripts/guard/guard.mjs check <dir> specifying bridging --json`
  - If exit code ≠ 0 → BLOCK. Report failures (missing artifacts or schema validation errors), do not route.
  - If exit code = 0 → proceed.
- planning artifacts exist
- implementation is requested or about to begin
- the execution contract is missing or stale
- planning artifacts changed after the last contract draft

### Route to `execution-governor` when:

- **Guard check**: Run `node scripts/guard/guard.mjs check <dir> approved executing --json`
  - If exit code ≠ 0 → BLOCK. Report failures (contract stale or artifacts missing), do not route.
  - If exit code = 0 → proceed.
- `execution-contract.md` exists
- the user has explicitly approved it
- implementation is the active task
- the contract still matches the current planning artifacts

### Route to `systematic-debugger` when:

- execution is in the `executing` state but has hit a blockage
- a test failure, unexpected behavior, or build error has stopped progress
- the execution-governor reports a task cannot proceed
- the user reports a bug during active implementation

After debugging completes, route back to `execution-governor` to resume the executing state.

### Route to `code-reviewer` when:

- an execution batch has been completed
- the execution-governor has finished a group of related tasks
- a full batch is ready for spec-compliance and code-quality verification
- the user asks for a review checkpoint

### Route to `closure-archivist` when:

- **Guard check**: Run `node scripts/guard/guard.mjs check <dir> executing closing --json`
  - If exit code ≠ 0 → BLOCK. Report failures (unfinished tasks or missing test evidence), do not route.
  - If exit code = 0 → proceed.
- implementation is complete
- verification is complete or nearly complete
- the user wants a final summary, archive, or wrap-up

### Route to `spec-syncer` when:

- closure-archivist reports delta specs exist that need merging
- the change is closing and has ADDED/MODIFIED/REMOVED/RENAMED specs
- multiple changes have accumulated unsynced delta specs
- the user asks about spec consistency

### Route to `abandonment` when:

- the user explicitly requests to abandon the change
- systematic-debugger has escalated after 3+ consecutive fix failures AND the user chooses to abandon
- scope change during specifying makes the change no longer worthwhile AND the user confirms abandonment
- the current state is NOT `closing` or `abandoned` (terminal states block abandonment transition)

### Hotfix Fast-Path Routing

When workflow is `hotfix`:
- Route to `bridge-contract` with minimal contract mode (intent + task list only)
- Skip `spec-explorer` and full `spec-forger`
- Guard check: `node scripts/guard/guard.mjs check <dir> exploring bridging --workflow hotfix --json`
- After bridge: DP-3 契约批准
- After approval: route to `execution-governor` (inline mode)
- After execution: route to `closure-archivist` (lightweight closure)

### Tweak Fast-Path Routing

When workflow is `tweak`:
- Route directly to `execution-governor` (direct edit mode)
- Skip `spec-explorer`, `spec-forger`, and `bridge-contract`
- Guard check: `node scripts/guard/guard.mjs check <dir> exploring approved --workflow tweak --json`
- After execution: route to `closure-archivist` (lightweight closure: file exists + syntax check)

### Post-Transition Injection Prompt

After every successful `ssf state transition`, output:
> 💡 Run `ssf inject <change-dir>` to update phase-guard.md with the new state.

## Staleness Rules

Treat `execution-contract.md` as stale if:

- `proposal.md` changed scope (confirmed by content comparison, not just timestamp)
- `specs/` changed approved behavior
- `design.md` changed architecture constraints
- `tasks.md` changed execution batches materially
- the contract's intent lock no longer matches the proposal's scope (content-level check)

If stale, do not continue implementation. Route back to `bridge-contract`.

Treat planning artifacts as stale if:

- A requirement in `specs/` has no corresponding task in `tasks.md`
- A capability listed in `proposal.md` has no spec file
- The design references decisions no longer valid given current specs

## Guardrails

- Do not allow implementation before planning artifacts exist.
- Do not allow implementation before `execution-contract.md` exists.
- Do not treat "continue" as permission to skip state inspection.
- Do not allow continued implementation if scope or core behavior changed without artifact updates.
- If the user is in `executing` but the contract is stale, route backward to `bridge-contract`.
- Do not allow implementation to continue past a bug without `systematic-debugger` investigation.
- Do not move from execution batches to closure without code review first.
- Do not close a change with unsynced delta specs without routing to `spec-syncer`.
- If the detected state is `debugging`, ensure `systematic-debugger` completes before routing back.
- If the user asks to skip a review gate, explain why the gate exists and ask for confirmation.
- Do not allow any state transitions FROM `abandoned` — it is a terminal state.
- Do not allow transition to `abandoned` from `closing` or `abandoned` — these are already terminal.
- Do not auto-abandon without user confirmation — even if systematic-debugger recommends it.
- When transitioning to `abandoned`, prompt for abandonment summary generation before confirming.
- Do not merge delta specs from an abandoned change — spec-syncer must block this.

## Output Standard

Your response should always make three things explicit:

1. current detected state
2. why that state was chosen (cite the specific file, content, or condition that determined the state)
3. which skill should run next

If transition blocking is required, explain the missing artifact or approval clearly.

If content-level inspection was performed, include a brief note on what was compared (e.g., "Compared proposal scope (3 capabilities) against contract intent lock (2 capabilities) — contract is stale").

### Decision Point References

When routing to a skill that has an associated decision point, include the decision point number in the output:
- Route to bridge-contract → include `DP-3: 契约批准 — 用户需明确批准 execution-contract.md`
- Route to execution-governor → include `DP-4: 执行模式选择 — 用户选择 TDD 或 SDD`
- Route to systematic-debugger (escalation) → include `DP-5: 调试升级`
- Route to closure-archivist → include `DP-7: 归档确认`

Reference: `docs/decision-points.md`

## Preferred User Experience

- Keep the user on one visible workflow.
- Avoid making them choose between upstream mental models.
- Treat OpenSpec ideas as planning inputs and Superpowers ideas as execution discipline, but keep `spec-superflow` as the only workflow owner.
