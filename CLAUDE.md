# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

A Claude Code plugin that integrates OpenSpec (planning engine) + Superpowers (execution discipline) into a unified AI coding workflow. Self-contained, zero external npm dependencies.

## Commands

```bash
# Build TypeScript
npm run build

# Run integration tests
npm test

# Run single test (Node 22+ native test runner)
node --test --experimental-strip-types tests/e2e.test.ts --test-name-pattern="parseDeltaSpec"

# Validate artifacts (uses docs/examples/ data)
npm run validate

# CI/CD (GitHub Actions)
# push/PR → build + test
# v* tag → build + test + npm publish + GitHub Release
```

## Architecture

### Source Code (`src/`)

TypeScript interfaces + regex-based parsers. Compiles to `dist/` (ES2022 + NodeNext + strict).

- `schema/` — Type definitions: `base.ts` (Requirement, Scenario), `change.ts` (Delta operations), `spec.ts`
- `parsing/` — `requirement-blocks.ts` parses delta spec markdown, `change-parser.ts` parses proposal/change markdown
- `validation/` — `validator.ts` validates artifacts against schema rules, `constants.ts` holds thresholds (min lengths, max deltas)

### Skills (`skills/`)

9 skills, one per directory. Each contains a `SKILL.md` that Claude Code loads as an instruction set:

| Skill | Phase | Purpose |
|-------|-------|---------|
| `workflow-orchestrator` | Entry | Content-level state detection, routes to correct skill |
| `spec-explorer` | Exploring | Requirement elicitation |
| `spec-forger` | Specifying | Generate planning artifacts |
| `bridge-contract` | Bridging | Generate `execution-contract.md` from planning artifacts |
| `execution-governor` | Executing | TDD + SDD + Review Gate enforcement |
| `systematic-debugger` | Debugging | Handle execution blockers |
| `code-reviewer` | Review | Dual-adjudication review |
| `closure-archivist` | Closing | Archive and validate completion |
| `spec-syncer` | Sync | Sync delta specs to prevent spec rot |

### State Machine

7 states: `exploring → specifying → bridging → approved → executing → debugging → closing`

`workflow-orchestrator` is the single entry point. It reads artifact content (not just file existence) to determine current state.

### Key Files

- `hooks/session-start` — Runs on session start, registers skills
- `templates/*.md` — Markdown templates for artifacts (proposal, spec, design, tasks, execution-contract)
- `docs/examples/` — Real example artifacts used by tests

## Constraints

- **Zero external dependencies** — Only TypeScript as devDependency
- **Node >= 22** — Uses `--experimental-strip-types` for direct .ts test execution
- **Pure regex parsing** — No Zod or runtime validation libraries
- **Self-contained** — Does not require OpenSpec or Superpowers to be installed

## Testing

Tests import from `dist/index.js` (compiled output), not source. Run `npm run build` before `npm test`.

Test data lives in `docs/examples/` — real proposal/spec/design artifacts from `add-dark-mode` and `refactor-auth-boundary` scenarios.
