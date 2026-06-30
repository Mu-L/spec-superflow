# Implementation Tasks: v0.7.0 Aware & Multiplatform

## File Structure

```
changes/v0.7.0-aware-and-platform-fixes/
├── proposal.md
├── design.md
├── tasks.md
├── specs/
│   ├── platform-install-fixes/spec.md
│   ├── auto-mode-detection/spec.md
│   ├── multi-platform-inject/spec.md
│   └── dp-audit-report/spec.md
└── execution-contract.md
```

## Interfaces

- **Consumes**: `.spec-superflow.yaml`, `proposal.md`, `design.md`, specs, existing `scripts/lib/cmd-inject.mjs` template.
- **Produces**: updated `plugin.json`, `scripts/install-cursor.mjs`, `scripts/lib/cmd-inject.mjs`, `scripts/lib/cmd-audit.mjs`, updated skill files, `CHANGELOG.md`, `README.md`, version manifests.

---

## Batch 1: Platform Installation Fixes

- [x] Task 1.1: Fix root `plugin.json` `author` field from string to object.
- [x] Task 1.2: Create `scripts/install-cursor.mjs` that deploys `skills/` to `.cursor/skills/` and generates `.cursor/rules/phase-guard.mdc`.
- [x] Task 1.3: Update `INSTALL.md` Cursor and Copilot CLI sections with correct steps.
- [x] Task 1.4: Extend `ssf doctor` to validate root `plugin.json` `author` format.
- [x] Task 1.5: Run `npm run build` and `npm test` to ensure no regressions.

## Batch 2: Auto Mode Detection

- [x] Task 2.1: Add mode inference logic to `skills/workflow-orchestrator/SKILL.md`.
- [x] Task 2.2: Create `scripts/infer-workflow.mjs` helper to count files/modules from `proposal.md` and `tasks.md`.
- [x] Task 2.3: Add example or test case for hotfix/tweak/full inference.

## Batch 3: Multi-Platform Phase-Guard Injection

- [x] Task 3.1: Extend `scripts/lib/cmd-inject.mjs` with `PLATFORM_TEMPLATES`.
- [x] Task 3.2: Implement Cursor `.mdc` generation.
- [x] Task 3.3: Implement Copilot instructions generation.
- [x] Task 3.4: Implement Gemini `GEMINI.md` section update.
- [x] Task 3.5: Add `--platforms` CLI flag to `ssf inject`.
- [x] Task 3.6: Update `skills/workflow-orchestrator/SKILL.md` post-transition prompt to mention multi-platform inject.

## Batch 4: Decision Point Audit Report

- [x] Task 4.1: Create `scripts/lib/cmd-audit.mjs` with `ssf audit` command.
- [x] Task 4.2: Generate `decision-point-audit.md` template.
- [x] Task 4.3: Update `skills/closure-archivist/SKILL.md` to reference `ssf audit`.
- [x] Task 4.4: Ensure `ssf audit` is read-only and idempotent.

## Batch 5: Release

- [x] Task 5.1: Bump version to 0.7.0 in `package.json`, `plugin.json`, `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json`, `.cursor-plugin/plugin.json`, `gemini-extension.json`.
- [x] Task 5.2: Translate `templates/proposal.md`, `templates/design.md`, `templates/tasks.md`, `templates/spec.md`, `templates/execution-contract.md` to Chinese.
- [x] Task 5.3: Update `CHANGELOG.md` with v0.7.0 entries.
- [x] Task 5.4: Update `README.md` with new CLI commands and platform install notes.
- [x] Task 5.5: Run `ssf doctor` and `ssf validate`.
- [x] Task 5.6: Build, test, commit, tag `v0.7.0`, push to GitHub, refresh marketplace.
