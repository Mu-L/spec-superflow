# Changelog

All notable changes to `spec-superflow` will be documented in this file.

The format loosely follows Keep a Changelog.

## [0.2.0] - 2026-06-26

### Added

- **Engine layer (`src/`)** — embedded OpenSpec schema/validation/parsing engine in TypeScript
  - `src/schema/` — Requirement, Delta (ADDED/MODIFIED/REMOVED/RENAMED), Spec, Change type definitions
  - `src/validation/` — Validator class with validateSpecContent, validateChangeContent, validateDeltaSpec
  - `src/parsing/` — Requirement block parser + Delta spec parser (self-contained, no external deps)
- **3 new skills** (6 → 9 total):
  - `systematic-debugger` — 4-phase root cause debugging (Root Cause → Pattern → Hypothesis → Implementation)
  - `code-reviewer` — Unified code review (request + receive), 3 severity levels (Critical/Important/Minor)
  - `spec-syncer` — Delta Spec → Main Spec intelligent merge with conflict detection
- **SDD (Subagent-Driven Development)** — Full implementation discipline embedded in `execution-governor`:
  - `implementer-prompt.md` — Subagent implementation template with TDD evidence + self-review
  - `task-reviewer-prompt.md` — Dual-verdict review (spec compliance + code quality)
  - `code-reviewer-prompt.md` — Structured code review template
- **Helper scripts (`scripts/`)** — `task-brief`, `review-package`, `validate-artifacts`
- **Session-start hooks (`hooks/`)** — Multi-platform bootstrap (Claude Code / Cursor / Copilot CLI)
- **Content-level stale detection** — `workflow-orchestrator` now compares proposal scope vs contract intent lock

### Changed

- State machine extended from 6 to 7 states (+`debugging`)
- All 6 existing skills enhanced with embedded engine capabilities:
  - `spec-explorer` — embedded brainstorming's "one question at a time + 2-3 approach comparison"
  - `spec-forger` — Schema engine validation on every artifact + writing-plans task granularity
  - `bridge-contract` — parsing engine auto-extraction of contract fields
  - `execution-governor` — Full TDD Iron Law + SDD workflow + Review Gates
  - `closure-archivist` — verification-before-completion Iron Law
  - `workflow-orchestrator` — content-level inspection + 3 new routing targets
- Plugin metadata updated to v0.2.0 with expanded keywords across all manifest files

### Release Quality

- **TypeScript compilation** — Added `tsconfig.json` (ES2022, NodeNext, strict mode), `npm run build` produces `dist/` with declarations
- **Integration tests** — 8 test cases using real example artifacts (`docs/examples/`), `npm test` passes
- **package.json** — `main` points to `dist/index.js`, `types` to `dist/index.d.ts`
- **Documentation** — Updated English README Current Status to v0.2.0

## [0.1.0] - 2026-06-25

### Added

- Initial self-contained `spec-superflow` plugin structure
- Plugin metadata in `.claude-plugin/plugin.json`
- Six workflow skills:
  - `workflow-orchestrator`
  - `spec-explorer`
  - `spec-forger`
  - `bridge-contract`
  - `execution-governor`
  - `closure-archivist`
- Planning templates:
  - `proposal.md`
  - `spec.md`
  - `design.md`
  - `tasks.md`
  - `execution-contract.md`
- Workflow docs:
  - `docs/artifact-contract.md`
  - `docs/state-machine.md`
- Example change sets:
  - `docs/examples/add-dark-mode/` (net-new UI capability)
  - `docs/examples/refactor-auth-boundary/` (brownfield backend refactor)
- Installation guide in `INSTALL.md`
- Chinese publishing README in `README.zh-CN.md`
- Repository governance files: `.gitignore`, `CONTRIBUTING.md`, `docs/release-checklist.md`

### Notes

- First release targets Claude Code and Trae style local skill loading
- Runtime ownership remains inside `spec-superflow`
- OpenSpec and Superpowers are reference influences, not runtime dependencies
