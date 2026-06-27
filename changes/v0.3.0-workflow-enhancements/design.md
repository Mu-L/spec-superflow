# Technical Design: v0.3.0 Workflow Enhancements

## Context

- **Current state**: spec-superflow v0.2.1 has 9 skills, 7-state machine, TypeScript validation engine with 3 methods (validateSpecContent, validateChangeContent, validateDeltaSpec), and zero external npm dependencies. The plugin works as markdown skills injected via hooks.
- **Constraints**: Zero external npm dependencies. Node >= 22. Pure regex parsing. Multi-platform (7 platforms). Self-contained (no OpenSpec/Superpowers runtime dependency).
- **Stakeholders**: Plugin users (developers using Claude Code/Cursor/Codex), spec-superflow maintainers, open-source community evaluating the plugin.

## Goals

- Make task planning granular enough that implementation requires no guesswork (writing-plans quality)
- Provide a lightweight execution path for small changes without sacrificing TDD discipline
- Allow graceful abandonment when a change proves unviable, preserving lessons and optional partial work
- Verify implementation quality across three orthogonal dimensions before declaring completion

## Non-Goals

- CLI tooling (deferred to v0.4.0)
- Configurable schemas / YAML artifact dependency graphs (deferred to v0.4.0)
- Programmatic state machine enforcement (the state machine remains LLM-guided, not code-enforced)
- Automated conflict resolution in spec-syncer

## Decisions

### Decision 1: Writing-plans methodology embedded in spec-forger, not a separate skill

- **Choice**: Enhance spec-forger's tasks.md generation chapter directly with writing-plans methodology. Do not create a new `writing-plans` skill.
- **Rationale**: spec-superflow's value proposition is a single unified workflow. Adding a separate planning skill fragments the experience. The methodology is guidance for artifact generation, not a distinct workflow phase. Embedding it keeps the entry point simple (spec-forger creates all 4 artifacts).
- **Alternatives considered**: (a) New `plan-writer` skill that spec-forger delegates to — rejected because it adds routing complexity and breaks the "one skill per artifact set" model. (b) Import Superpowers' writing-plans skill as-is — rejected because it uses Superpowers-specific terminology and file paths (`docs/superpowers/plans/`) that conflict with spec-superflow's structure.

### Decision 2: Inline mode as execution-governor internal branch, not a separate skill

- **Choice**: Add Inline mode as a conditional branch within execution-governor's per-task loop, not as a new `inline-executor` skill.
- **Rationale**: Inline and SDD modes share the same TDD Iron Law, the same review gates, and the same progress ledger. The only difference is whether subagents are dispatched. A separate skill would duplicate 80% of execution-governor's logic. Internal branching keeps the shared discipline in one place.
- **Alternatives considered**: (a) Separate `inline-executor` skill — rejected due to massive duplication. (b) Strategy pattern with pluggable execution backends — overengineered for two modes; if a third mode emerges later, refactor then.

### Decision 3: Abandoned as terminal state, not a rewind target

- **Choice**: `abandoned` is a terminal state (like `closing`). Once abandoned, no further transitions are allowed. The user must start a new change.
- **Rationale**: Abandonment means the change itself is fundamentally flawed, not that a specific artifact is wrong. Rewinding to specifying or bridging would imply the change is salvageable, which contradicts the abandonment decision. A clean terminal state forces the user to start fresh with lessons learned.
- **Alternatives considered**: (a) Rewind to exploring — rejected because it conflates "this change is dead" with "let's rethink." (b) Paused state (resume later) — rejected because it creates zombie changes that accumulate without resolution.

### Decision 4: Three-dimensional verification as closure-archivist enhancement, not a new skill

- **Choice**: Extend closure-archivist's verification steps with Completeness, Correctness, and Coherence checks. Add `validateImplementation()` to the Validator engine.
- **Rationale**: Verification is closure-archivist's core responsibility. Adding a separate `verifier` skill would create ambiguity about who owns the "is this done?" question. The Validator engine extension provides programmatic support for what was previously pure LLM judgment.
- **Alternatives considered**: (a) New `implementation-verifier` skill — rejected because it fragments the closure phase. (b) OpenSpec-style `/opsx:verify` slash command — rejected because spec-superflow uses skill routing, not slash commands.

### Decision 5: Zero new npm dependencies for Validator extension

- **Choice**: `validateImplementation()` uses the same regex-based parsing approach as existing validators. No Zod, no AST parsing.
- **Rationale**: The zero-dependency constraint is a core differentiator. The implementation verification is inherently heuristic (checking for placeholder markers, matching requirement names against diff summaries). Regex is sufficient for this level of checking.
- **Alternatives considered**: (a) Use tree-sitter for AST-based code analysis — rejected because it requires a native dependency. (b) Shell out to git diff — rejected because it couples the Validator to git, breaking the pure-function API contract.

## Risks And Trade-Offs

- **Task granularity enforcement is heuristic** → The 2-5 minute rule cannot be programmatically verified. Mitigation: spec-forger's self-review checklist includes explicit granularity questions; bridge-contract cross-checks task count against requirement count.
- **Inline mode may be selected for changes that need SDD** → Automatic mode selection could underestimate complexity. Mitigation: execution-governor reports the selection reasoning; user can override; if inline execution hits a blockage, governor suggests switching to SDD.
- **Abandonment summary may be skipped** → Users might abandon without generating the summary. Mitigation: workflow-orchestrator prompts for summary generation before confirming abandonment; the prompt can be declined but not silently skipped.
- **Three-dimensional verification increases closure time** → Coherence checking requires reading both design.md and code, which is token-intensive. Mitigation: Coherence dimension only runs if design.md exists and has a Decisions section; skipped for trivial changes.
- **Validator.validateImplementation() is heuristic** → Regex-based diff analysis cannot catch all completeness/correctness issues. Mitigation: The method returns WARN (not FAIL) for low-confidence checks; the LLM performs the authoritative verification using the method's output as a checklist.

## Migration Plan

- **Rollout steps**: (1) Update templates (tasks.md, execution-contract.md, abandonment-summary.md) → (2) Update Validator engine → (3) Update skills (spec-forger, execution-governor, closure-archivist, workflow-orchestrator) → (4) Update docs/state-machine.md → (5) Run existing tests + add new tests → (6) Version bump + publish
- **Rollback steps**: Revert to v0.2.1 tag. No data migration required (all changes are additive to skills and templates).

## Open Questions

- None. All design decisions resolved during exploring phase.
