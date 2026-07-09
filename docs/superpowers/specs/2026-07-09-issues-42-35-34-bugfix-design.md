# Issues 42/35/34 Bugfix Design

Date: 2026-07-09
Target release: 0.8.17
Scope: GitHub issues #42, #35, and #34

## Context

This patch fixes three open bug reports that expose the same product problem: spec-superflow currently lets documented workflow contracts drift from actual CLI behavior.

Issue #42 reports inconsistent delta spec paths. Documentation and examples use flat files such as `specs/<capability>.md`, while CLI paths such as validation, schema guard checks, hashing, and sync mostly expect `specs/<capability>/spec.md`. Local reproduction confirms that `node scripts/validate-artifacts docs/examples/add-dark-mode` and `ssf validate docs/examples/add-dark-mode` exit successfully even though the example contains no canonical `spec.md` files. This can make agents believe specs were validated when they were skipped.

Issue #35 reports that `ssf inject <dir>` writes `GEMINI.md` in a Cursor project. Local reproduction confirms that the command defaults to `claude,cursor,copilot,gemini` and writes all four platform outputs when `--platforms` is omitted.

Issue #34 reports that the hotfix fast path is self-contradictory. Documentation says hotfix skips the full planning bundle and enters minimal contract-builder, but guard currently runs the full `artifacts-exist` check for `exploring -> bridging --workflow hotfix`. Local reproduction confirms that an empty hotfix change with only `.spec-superflow.yaml` fails because `proposal.md`, `design.md`, `tasks.md`, and `specs/` are missing.

## Goals

- Make `specs/<capability>/spec.md` the single canonical delta spec path across docs, examples, tests, validation, hashing, and sync.
- Fail clearly when a change uses flat `specs/<capability>.md` or root `specs/spec.md` instead of silently skipping validation.
- Make `ssf inject` platform selection explicit and safe, so Cursor users do not receive Gemini files by default.
- Make hotfix fast-path guard behavior match the intended workflow: no full planning bundle, but still a minimal execution contract and DP-3 approval before build.
- Preserve full workflow strictness and tweak behavior.
- Keep the patch self-contained in zero-runtime-dependency ESM scripts and Markdown docs.

## Non-Goals

- Do not support two equally valid spec path layouts long term.
- Do not rewrite the TypeScript parser or validator engine.
- Do not add runtime dependencies.
- Do not change the semantics of full planning artifacts beyond canonical path enforcement.
- Do not implement prototype, Ponytail, model profiles, or Node 20 support in this patch.

## Recommended Approach

Use a contract-convergence patch instead of ad hoc fixes. The code should expose shared helpers for spec path discovery and workflow-aware guard checks, then route all affected commands through those helpers.

This is stricter than accepting both spec layouts, but it removes the ambiguity that caused the bugs. Compatibility is provided through actionable errors and migration hints, not by continuing to process two defaults.

## Proposed Changes

### 1. Canonical Spec Path Discovery

Add a shared helper, tentatively `scripts/lib/spec-paths.mjs`, with these responsibilities:

- `findCanonicalSpecFiles(changeDir)` returns sorted canonical files under `specs/<capability>/spec.md`.
- `findInvalidSpecFiles(changeDir)` returns flat files such as `specs/ui-theme.md` and root `specs/spec.md`.
- `validateSpecPathLayout(changeDir)` returns structured failures with messages that name the invalid path and the expected replacement path.

The helper should not parse Markdown. It only owns filesystem layout so callers cannot drift.

Consumers:

- `scripts/validate-artifacts`
- `scripts/lib/cmd-validate.mjs`
- `scripts/guard/checks/schema-valid.mjs`
- `scripts/lib/hash.mjs`
- `scripts/lib/cmd-sync.mjs`

Validation behavior:

- If `specs/` exists and contains invalid spec-shaped Markdown files, validation exits non-zero with a migration hint.
- If `specs/` exists but contains no canonical spec files, validation exits non-zero for full planning validation.
- `schema-valid` fails when the layout is invalid or no canonical specs are found in a context that requires specs.
- `hash` computes artifact hashes from canonical specs only. Invalid layout should not be silently hashed as if it were approved.
- `sync` syncs only canonical delta specs and fails with a clear layout error if a change uses flat specs.

Examples and docs should be migrated from:

```text
specs/<capability>.md
```

to:

```text
specs/<capability>/spec.md
```

### 2. Safe Platform Selection For `ssf inject`

Change `ssf inject <dir>` so omitted `--platforms` no longer means all supported platforms.

Supported platform input:

- `--platforms cursor`
- `--platforms claude,cursor`
- `--platforms all`

Default behavior when `--platforms` is omitted:

1. Detect project markers in the current project root.
2. If exactly one platform is detected, inject only that platform.
3. If zero or multiple platforms are detected, exit with code 2 and explain that the user must pass `--platforms <platform>` or `--platforms all`.

Initial marker rules:

- `.cursor/` or `.cursor/rules/` means Cursor.
- `.claude/` means Claude.
- Existing `GEMINI.md` means Gemini.
- Existing `.github/copilot-instructions.md` means Copilot.

This avoids surprising writes. Users who really want all platform outputs still have a stable explicit command:

```bash
ssf inject <change-dir> --platforms all
```

Docs should recommend Cursor users run:

```bash
ssf inject <change-dir> --platforms cursor
```

### 3. Hotfix Minimal Guard Path

Hotfix must be treated as a separate guard contract, not as full planning with skipped schema validation.

Guard behavior:

- `exploring -> bridging --workflow hotfix`
  - requires workflow mode to be `hotfix`
  - does not require `proposal.md`, `design.md`, `tasks.md`, or `specs/`
  - allows route into contract-builder Hotfix Mode

- `bridging -> approved-for-build --workflow hotfix`
  - requires non-empty `execution-contract.md`
  - requires `dp_3_result`
  - requires the stored `contract_hash` to match the current `execution-contract.md` hash, or an equivalent minimal-contract freshness check
  - does not require full artifact hash freshness

- `approved-for-build -> executing --workflow hotfix`
  - requires DP-3 to remain recorded
  - should not require full artifact existence
  - may default execution mode to `Inline` if no explicit `execution_mode` is set

Full workflow behavior remains unchanged:

- `specifying -> bridging` requires full artifacts and schema validation.
- `bridging -> approved-for-build` requires full artifacts, schema validation, contract freshness, and DP-3.
- `approved-for-build -> executing` requires full artifacts, contract freshness, and the existing decision gate behavior.

Tweak behavior remains direct-edit oriented:

- `exploring -> approved-for-build --workflow tweak` continues to skip full artifacts.
- Tweak does not require contract-builder unless later docs explicitly redefine it.

Implementation should prefer either workflow-specific transition matrices or workflow-aware check expansion over broad post-hoc skip lists. The current skip-list model made hotfix accidentally inherit `artifacts-exist`; the replacement should make each fast path's contract explicit.

## Data Flow

Spec layout validation flow:

1. CLI command receives a change directory.
2. Shared spec path helper scans `specs/`.
3. Command fails fast on invalid layout.
4. Command validates, hashes, or syncs canonical files only.

Inject flow:

1. Parse `--platforms`.
2. If omitted, run platform marker detection.
3. Resolve requested platforms or return an actionable usage error.
4. Write only resolved platform files.

Hotfix flow:

1. `workflow-start` infers or confirms `hotfix`.
2. Guard permits `exploring -> bridging` without full artifacts.
3. `contract-builder` Hotfix Mode writes minimal `execution-contract.md`.
4. User records DP-3 approval.
5. State init/rebuild records contract hash.
6. Guard permits `bridging -> approved-for-build` using minimal contract checks.
7. Build starts only after the approved minimal contract is fresh.

## Error Handling

Spec path errors must be direct and migration-oriented:

```text
Invalid spec path: specs/ui-theme.md
Expected: specs/ui-theme/spec.md
```

`ssf inject` ambiguous default errors should not write partial files. The command should exit before any writer runs.

Hotfix guard failures should identify the missing minimal requirement, for example:

- `execution-contract.md: missing`
- `execution-contract.md: empty`
- `DP-3 (dp_3_result) is not recorded`
- `execution-contract.md is stale: contract hash mismatch`

## Tests

Add or update tests in the existing Node 22 native test style.

Spec path tests:

- `spec-paths` unit tests discover sorted canonical specs.
- `spec-paths` reports flat `specs/<capability>.md` and root `specs/spec.md` as invalid.
- `validate-artifacts` exits 1 on flat example layout and 0 after example migration.
- `ssf validate` exits 1 on flat layout and 0 on canonical layout.
- `schema-valid` fails invalid layout instead of returning pass with no spec checks.
- `hash` includes canonical specs and ignores invalid flat files only after reporting layout errors through validation paths.
- `sync` syncs canonical specs to main `specs/<capability>/spec.md`.

Inject tests:

- `--platforms cursor` writes `.cursor/rules/phase-guard.mdc` and does not write `GEMINI.md`.
- `--platforms all` writes Claude, Cursor, Copilot, and Gemini outputs.
- Omitted `--platforms` with `.cursor/` marker injects only Cursor.
- Omitted `--platforms` with no marker exits 2 and writes nothing.
- Omitted `--platforms` with multiple markers exits 2 and writes nothing.
- Invalid platform names remain rejected.

Hotfix guard tests:

- Empty hotfix change with state file passes `exploring -> bridging --workflow hotfix`.
- Empty full workflow still fails `exploring -> bridging`.
- Hotfix `bridging -> approved-for-build` fails without `execution-contract.md`.
- Hotfix `bridging -> approved-for-build` fails without DP-3.
- Hotfix `bridging -> approved-for-build` passes with non-empty fresh contract and DP-3.
- Full workflow `bridging -> approved-for-build` still requires full artifacts.
- Tweak `exploring -> approved-for-build` still passes under the existing tweak contract.

Verification before PR:

```bash
npm run build
npm test
npm run validate -- docs/examples/add-dark-mode
npm run validate -- docs/examples/refactor-auth-boundary
node scripts/spec-superflow.mjs doctor
```

## Documentation Updates

Update these surfaces in the same implementation batch as behavior changes:

- `README.md`
- `docs/README_en.md`
- `INSTALL.md`
- `docs/examples/**/README.md`
- `docs/state-machine.md`
- `skills/workflow-start/SKILL.md`
- `skills/contract-builder/SKILL.md`
- CLI help text for `ssf inject`

Documentation must say:

- Delta specs live at `specs/<capability>/spec.md`.
- `ssf inject` requires explicit `--platforms` unless one platform marker is detected.
- Hotfix skips full planning artifacts but not the minimal contract or DP-3 approval.

## Risks And Mitigations

- Existing users with flat specs will see new validation failures. This is intentional; error messages must include the exact target path.
- Some users may expect `ssf inject` to keep writing all files. The explicit `--platforms all` escape hatch preserves that behavior without surprise writes.
- Hotfix changes can become under-specified if the minimal contract is too weak. The guard must still require a non-empty, fresh `execution-contract.md` and DP-3.
- Hash semantics can drift if full and hotfix freshness checks share unclear names. Keep artifact hash and contract hash checks separate in code and messages.

## Acceptance Criteria

- Flat example specs are migrated to canonical directories.
- Validation commands fail on flat spec layouts and pass on canonical layouts.
- `ssf validate` and `validate-artifacts` no longer report success when no canonical spec was validated for a full planning bundle.
- Cursor-only injection does not create `GEMINI.md`.
- Omitted inject platform is either unambiguous by marker or rejected before writing.
- Hotfix can enter bridging without full artifacts.
- Hotfix cannot enter approved-for-build without a fresh minimal contract and DP-3.
- Full workflow and tweak workflow regressions remain covered by tests.
- Build, tests, example validation, and doctor pass before implementation is considered complete.
