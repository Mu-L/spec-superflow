# Issue 15 Guard Hardening Design

Date: 2026-07-05
Target release: 0.8.10
Branch: fix/issue-15-guard-hardening

## Context

GitHub issue #15 reports that spec-superflow v0.8.8 can skip workflow stages. The reported session admitted it manually edited `.spec-superflow.yaml`, skipped `contract-builder` and `approved-for-build`, and then wrote implementation code. Local review found the report is valid:

- The guard matrix currently defines `exploring -> bridging` and `exploring -> approved-for-build` as fast-path transitions, but does not reject those transitions when the workflow is `full` or `auto`.
- `ssf state transition` currently fails open if the guard process errors or returns non-JSON output.
- `build-executor` does not require branch/worktree isolation before implementation, so a main or master branch can be modified directly.

The patch must fix the concrete bypasses without redesigning the full multi-platform enforcement model.

## Goals

- Release a narrow 0.8.10 patch that makes guard behavior match the documented state machine.
- Keep hotfix and tweak fast paths available only in their intended workflow modes.
- Ensure state transitions fail closed when guard execution is unreliable.
- Add execution-phase branch isolation instructions so main/master edits require explicit handling.
- Keep package, manifest, documentation, changelog, and phase-guard version strings consistent.
- Produce a PR to `main`; after merge, tag `v0.8.10` to trigger the release workflow.

## Non-Goals

- Do not build a platform-specific tool-call or file-edit interception system in this patch.
- Do not remove hotfix or tweak workflows.
- Do not change the artifact schema or rewrite the state machine.
- Do not claim that prompt-level instructions are equivalent to system-level write protection.

## Proposed Changes

### Guard Fast-Path Mode Gating

Add explicit workflow-mode validation before guard checks are treated as passing:

- `exploring -> bridging` is valid only for `hotfix` or `tweak`.
- `exploring -> approved-for-build` is valid only for `tweak`.
- `full` rejects both fast-path shortcuts.
- `auto` is normalized to `full` by `cmd-state`, so it also rejects direct fast-path shortcuts unless inference has already persisted `hotfix` or `tweak`.

The guard output should identify this as a workflow-mode failure, not an unknown transition.

### State Transition Fail-Closed

`ssf state transition` must not update `.spec-superflow.yaml` unless the guard process completes successfully and returns a passing result.

Failure cases that must block transition:

- guard process exits non-zero
- guard stdout cannot be parsed as JSON
- guard process times out or is terminated
- guard script errors before producing a pass result

This replaces the current warning-and-continue behavior.

### Build Executor Branch Isolation

Update `skills/build-executor/SKILL.md` so implementation begins with a branch/worktree preflight:

1. Run `git branch --show-current` and inspect worktree state.
2. If current branch is `main` or `master`, create or switch to a feature branch/worktree before editing.
3. If branch/worktree creation is impossible, stop and ask the user for explicit approval before editing the protected branch.
4. Report the chosen branch/worktree before implementation.

This is a skill-level execution requirement. It improves behavior but is not presented as a hard OS-level file-write block.

### Tests

Add or update regression tests for:

- `guard.mjs` rejects `exploring -> approved-for-build` in `full`.
- `guard.mjs` rejects `exploring -> bridging` in `full`.
- `guard.mjs` still allows `exploring -> bridging` for `hotfix`.
- `guard.mjs` still allows `exploring -> approved-for-build` for `tweak`.
- `ssf state transition` rejects the fast-path transitions when workflow is `auto` or `full`.
- `ssf state transition` does not write state when guard execution fails or returns invalid output.

Tests should be implemented in the existing `tests/lib/guard-transitions.test.mjs` and `tests/lib/cmd-state.test.mjs` style.

## Version And Release Plan

1. Run `node scripts/spec-superflow.mjs version 0.8.10`.
2. Add a `CHANGELOG.md` entry for `0.8.10` with:
   - fast-path workflow gating
   - state transition fail-closed behavior
   - build-executor branch isolation preflight
3. Run verification:
   - `npm run build`
   - `npm test`
   - `node scripts/check-version-consistency.mjs`
   - `node scripts/spec-superflow.mjs doctor`
4. Commit and push the branch.
5. Open a PR to `main`.
6. After merge, create and push tag `v0.8.10` from `main` to trigger CI/CD release.

## Risks And Mitigations

- Existing users relying on direct `exploring -> approved-for-build` in `auto` mode will be blocked. This is intended because direct fast-path execution must require an explicit or inferred `tweak` mode.
- Branch isolation remains instruction-level. The patch should describe this honestly and avoid overstating it as an unbypassable system guard.
- Version drift is easy during release work. `ssf version 0.8.10`, `check-version-consistency`, and `doctor` are mandatory before PR.

## Acceptance Criteria

- The minimal reproduction from issue #15 no longer transitions from `exploring` directly to `approved-for-build` under `auto` or `full`.
- Guard failures never result in `.spec-superflow.yaml` state updates.
- Hotfix and tweak fast paths still work when their workflow modes are set.
- `build-executor` explicitly requires branch/worktree preflight before implementation.
- All versioned files report `0.8.10`.
- Build, tests, version consistency, and doctor checks pass locally before PR.
