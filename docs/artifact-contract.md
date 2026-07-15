# Artifact Contract

`spec-superflow` uses five primary artifacts in each change:

1. `proposal.md`
2. `specs/`
3. `design.md`
4. `tasks.md`
5. `execution-contract.md`

The first four are planning artifacts. The fifth is the execution handshake.

## Artifact Roles

### `proposal.md`

Defines:

- why the change exists
- what is in scope
- what is explicitly out of scope
- which capabilities are affected

### `specs/`

Defines:

- required behavior
- scenarios and acceptance conditions
- behavioral edges the implementation must respect

### `design.md`

Defines:

- architecture and component boundaries
- interface and dependency decisions
- trade-offs and risk areas

### `tasks.md`

Defines:

- implementation ordering
- dependency-aware work breakdown
- completion units that become named execution waves in the execution plan

### `execution-contract.md`

Defines:

- the approved intent lock
- the approved behavior summary
- implementation constraints
- the instructions for the execution plan and named execution waves
- test obligations
- review gates and their review receipts
- escalation rules

For full/hotfix, `ssf execution recommend` lists applicable execution modes and
recommends one from task count and wave strategy, and persists a recommendation
receipt at `<change>/.superpowers/sdd/execution-recommendation.json`. `plan`
and `revise` require the receipt to match the current artifacts, contract, and
waves. The user confirms the selected mode with `--confirm`; a non-recommended mode additionally requires
`--acknowledge-recommendation`. Batch Inline remains serial. After approval,
`ssf execution plan` writes
the persisted execution plan to `<change>/.superpowers/sdd/execution-plan.json`.
That JSON records each wave's dependencies and parallel/serial strategy; it is
not stored in `execution-contract.md`. A current `pass` review receipt is
required for every wave before dependent work or closing proceeds. `tweak` is
exempt from execution-plan and review-receipt gates. `ssf execution revise`
retains or upgrades an existing plan as `sdd`, requires fresh confirmation,
creates a new revision, and
clears prior review receipts; it never permits a downgrade. #47 slash commands for recovery,
switching, and manual save are not implemented, so `/ssf:*` commands must not
be claimed.

## Mapping

`spec-superflow` converts planning artifacts into execution inputs:

- `proposal.md` -> intent lock and scope fence
- `specs/` -> test obligations and acceptance checks
- `design.md` -> implementation constraints
- `tasks.md` -> execution-plan waves in `<change>/.superpowers/sdd/execution-plan.json`

## Guardrail

Implementation starts only after:

- planning artifacts exist
- `execution-contract.md` exists
- the user approves the execution contract
- full/hotfix have a current `ssf execution plan` with a user-confirmed mode and
  persisted recommendation evidence
- every completed wave records a current `pass` review receipt before closing
