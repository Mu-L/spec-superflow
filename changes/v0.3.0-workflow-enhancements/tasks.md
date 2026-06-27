# Implementation Tasks: v0.3.0 Workflow Enhancements

## File Structure

- `Create: templates/abandonment-summary.md` — Template for abandonment summaries (Change, Reason, What Was Tried, Lessons Learned, Recommendations)
- `Modify: templates/tasks.md` — Add File Structure section and Interfaces block format
- `Modify: templates/execution-contract.md` — Add Execution Mode and Verification Dimensions fields
- `Modify: src/validation/types.ts` — Add VerificationDimension, VerificationStatus, VerificationFinding, VerificationReport types
- `Modify: src/validation/constants.ts` — Add verification-related constants and messages
- `Modify: src/validation/validator.ts` — Add validateImplementation() method
- `Modify: src/index.ts` — Export new verification types
- `Modify: skills/spec-forger/SKILL.md` — Rewrite tasks.md generation chapter with writing-plans methodology
- `Modify: skills/execution-governor/SKILL.md` — Add dual-mode routing (SDD vs Inline), mode selection criteria, Inline per-task loop with checkpoint review
- `Modify: skills/closure-archivist/SKILL.md` — Add three-dimensional verification framework (Completeness + Correctness + Coherence)
- `Modify: skills/workflow-orchestrator/SKILL.md` — Add abandoned state, abandoned routing rules, universal abandoned transition guardrail
- `Modify: skills/spec-syncer/SKILL.md` — Add guard: block sync for abandoned changes
- `Modify: docs/state-machine.md` — Update to 8 states with abandoned terminal state
- `Modify: tests/e2e.test.ts` — Add test cases for validateImplementation() and new verification types
- `Modify: package.json` — Version bump to 0.3.0
- `Modify: .claude-plugin/plugin.json` — Version bump to 0.3.0
- `Modify: .claude-plugin/marketplace.json` — Version bump to 0.3.0
- `Modify: CHANGELOG.md` — Add v0.3.0 entry

## Interfaces

### Batch 1 → Batch 2
- **Produces**: `templates/tasks.md` (updated with File Structure + Interfaces format) — consumed by spec-forger SKILL.md updates in Batch 2

### Batch 1 → Batch 5
- **Produces**: `src/validation/types.ts` (VerificationDimension, VerificationStatus, VerificationFinding, VerificationReport) — consumed by Validator.validateImplementation() in Batch 5
- **Produces**: `src/validation/constants.ts` (VERIFICATION_DIMENSIONS, VERIFICATION_MESSAGES) — consumed by Validator in Batch 5

### Batch 2 → Batch 3
- **Produces**: `skills/spec-forger/SKILL.md` (updated task planning) — execution-governor in Batch 3 references the new task format

### Batch 5 → Batch 6
- **Produces**: `src/validation/validator.ts` (validateImplementation method) — tested by e2e tests in Batch 6
- **Produces**: `src/index.ts` (new exports) — imported by tests in Batch 6

## 1. Batch 1: Templates + Type Foundations

- [ ] **1.1 Write failing test for VerificationReport type exports**

```typescript
// tests/e2e.test.ts — append new test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Validator } from '../dist/index.js';

test('validateImplementation returns VerificationReport with three dimensions', () => {
  const v = new Validator();
  const report = v.validateImplementation(
    'Added auth middleware in src/middleware/auth.ts',
    '### Requirement: Auth middleware\nThe system SHALL authenticate all API requests.\n#### Scenario: Valid token\n- **WHEN** a request has a valid token\n- **THEN** the system SHALL allow access',
    '## Decisions\n### Decision 1\n- Choice: JWT-based auth\n- Rationale: stateless'
  );
  assert.ok(report.dimensions);
  assert.equal(report.dimensions.length, 3);
  assert.ok(['Completeness', 'Correctness', 'Coherence'].includes(report.dimensions[0].name));
  assert.ok(['PASS', 'FAIL', 'WARN'].includes(report.verdict));
});
```

**Files**: `Modify: tests/e2e.test.ts`

- [ ] **1.2 Run test and confirm it fails**

Run: `npm run build && npm test`
Expected: FAIL — `validateImplementation` is not a function

- [ ] **1.3 Add VerificationReport types to src/validation/types.ts**

```typescript
// Append to src/validation/types.ts

export type VerificationDimension = 'Completeness' | 'Correctness' | 'Coherence';
export type VerificationStatus = 'PASS' | 'FAIL' | 'WARN';

export interface VerificationFinding {
  level: 'CRITICAL' | 'IMPORTANT' | 'INFO';
  dimension: VerificationDimension;
  message: string;
}

export interface VerificationReport {
  dimensions: {
    name: VerificationDimension;
    status: VerificationStatus;
    findings: VerificationFinding[];
  }[];
  verdict: 'PASS' | 'CONDITIONAL' | 'FAIL';
}
```

**Files**: `Modify: src/validation/types.ts`
**Interfaces**: Produces `VerificationDimension`, `VerificationStatus`, `VerificationFinding`, `VerificationReport` — consumed by Batch 5 (Validator.validateImplementation)

- [ ] **1.4 Add verification constants to src/validation/constants.ts**

```typescript
// Append to src/validation/constants.ts

export const VERIFICATION_DIMENSIONS = ['Completeness', 'Correctness', 'Coherence'] as const;

export const VERIFICATION_MESSAGES = {
  COMPLETENESS_MISSING_TASK: 'Task in tasks.md has no corresponding code change in diff summary',
  COMPLETENESS_MISSING_REQUIREMENT: 'SHALL/MUST requirement in spec has no matching implementation in diff summary',
  CORRECTNESS_TEST_FAILURE: 'Test suite has failures',
  CORRECTNESS_MISSING_SCENARIO: 'Spec scenario has no corresponding test assertion',
  COHERENCE_NAMING_MISMATCH: 'Design decision naming does not match implementation naming',
  COHERENCE_PATTERN_MISSING: 'Architecture pattern from design.md not found in implementation',
  VERIFICATION_PLACEHOLDER_DETECTED: 'Diff summary contains placeholder markers (TODO, FIXME, HACK)',
} as const;

export const MIN_ABANDONMENT_REASON_LENGTH = 50;
```

**Files**: `Modify: src/validation/constants.ts`
**Interfaces**: Produces `VERIFICATION_DIMENSIONS`, `VERIFICATION_MESSAGES`, `MIN_ABANDONMENT_REASON_LENGTH` — consumed by Batch 4 (abandonment) and Batch 5 (Validator)

- [ ] **1.5 Export new types from src/index.ts**

```typescript
// Append to src/index.ts
export type { VerificationDimension, VerificationStatus, VerificationFinding, VerificationReport } from './validation/types.js';
```

**Files**: `Modify: src/index.ts`
**Interfaces**: Produces public API exports — consumed by Batch 6 (tests import from dist/index.js)

- [ ] **1.6 Update tasks.md template with File Structure and Interfaces**

Replace content of `templates/tasks.md` with:

```markdown
# Implementation Tasks

## File Structure

- `Create: path/to/new-file.ts` — One-sentence responsibility
- `Modify: path/to/existing.ts` — What changes and why

## Interfaces

### Batch N → Batch M
- **Produces**: `type/function name` — consumed by Batch M for purpose

## 1. Batch 1: [Batch Objective]

- [ ] **1.1 Write the failing test**

\```language
// test code with exact assertions
\```

**Files**: `Create/Modify: exact/path`

- [ ] **1.2 Run test and confirm it fails**

Run: `exact command`
Expected: FAIL with "specific error message"

- [ ] **1.3 Implement minimal code**

\```language
// implementation code
\```

**Files**: `Create/Modify: exact/path`
**Interfaces**: Produces `name(type): returnType` — consumed by Batch N

- [ ] **1.4 Run test and confirm it passes**

Run: `exact command`
Expected: PASS

- [ ] **1.5 Commit**

\```bash
git add files
git commit -m "feat: description"
\```
```

**Files**: `Modify: templates/tasks.md`
**Interfaces**: Produces updated template — consumed by Batch 2 (spec-forger references this format)

- [ ] **1.7 Update execution-contract.md template**

Add after the existing `## Test Obligations` section:

```markdown
## Execution Mode

- **Mode**: `SDD` | `Inline`
- **Selection rationale**: [why this mode was chosen — task count, dependency analysis]

## Verification Dimensions

| Dimension | Status | Findings |
|-----------|--------|----------|
| Completeness | Pending | — |
| Correctness | Pending | — |
| Coherence | Pending | — |

**Overall verdict**: Pending
```

**Files**: `Modify: templates/execution-contract.md`

- [ ] **1.8 Create abandonment-summary.md template**

```markdown
# Abandonment Summary

## Change

- **Name**: [change name]
- **Original goal**: [one sentence]

## Reason

[At least 50 characters explaining why this change was abandoned]

## What Was Tried

- [Action 1 and its outcome]
- [Action 2 and its outcome]

## Lessons Learned

- [Concrete insight 1 that may help future attempts]

## Recommendations

- [Suggested next step or alternative approach]

## Preserved Work

- [ ] No work preserved (all changes discarded)
- [ ] Partial work preserved:
  - Commit `[hash]`: [description]
```

**Files**: `Create: templates/abandonment-summary.md`

- [ ] **1.9 Build and verify compilation**

Run: `npm run build`
Expected: Compilation succeeds, `dist/` contains updated types

- [ ] **1.10 Commit Batch 1**

```bash
git add -A
git commit -m "feat(v0.3.0): templates + verification types foundation"
```

## 2. Batch 2: Enhanced Task Planning (spec-forger)

Depends on: Batch 1 (tasks.md template updated)

- [ ] **2.1 Rewrite spec-forger tasks.md generation chapter**

In `skills/spec-forger/SKILL.md`, replace the `### tasks.md` section (currently lines 57-75) with a new section that includes:

1. **File Structure requirement**: Every tasks.md MUST begin with a `## File Structure` section listing all files to create/modify with one-sentence responsibilities.
2. **Interfaces requirement**: Every tasks.md MUST include `## Interfaces` section declaring Consumes/Produces between batches.
3. **Per-task format**: Each task MUST include:
   - Exact file paths (`Create:` / `Modify:` with line ranges for modifications)
   - TDD phases expanded: (1) write failing test with exact code, (2) run and confirm fail, (3) implement minimal code with exact code, (4) run and confirm pass, (5) commit
   - Interfaces block if the task produces output consumed by later tasks
4. **Zero placeholder rule**: Scan for "TBD", "TODO", "implement later", "figure out", "add appropriate", "we'll decide" — resolve all before handoff.
5. **Granularity enforcement**: Each task step is 2-5 minutes. If a step takes longer, decompose it. "Implement the authentication module" is NOT a task — it's a batch of tasks.
6. **Dependency declaration**: Each batch header states `Depends on: Batch N` if it consumes output from an earlier batch.

**Files**: `Modify: skills/spec-forger/SKILL.md`
**Interfaces**: Consumes updated `templates/tasks.md` format from Batch 1

- [ ] **2.2 Update spec-forger tasks.md validation checklist**

In `skills/spec-forger/SKILL.md`, replace the `### tasks.md Validation` section (currently lines 117-124) with expanded checklist:

```markdown
### tasks.md Validation

- [ ] Has `## File Structure` section listing all files with responsibilities
- [ ] Has `## Interfaces` section with Consumes/Produces between batches
- [ ] Tasks are numbered (1.1, 1.2, 2.1, etc.)
- [ ] Each task has exact file paths (Create/Modify with line ranges)
- [ ] Each code-producing task has expanded TDD phases (5 steps)
- [ ] Each task is ≤ 5 minutes of focused work
- [ ] No TBD, TODO, or placeholder language in any task
- [ ] Every requirement from specs/ maps to at least one task
- [ ] Dependencies are explicit (Depends on: Batch N)
- [ ] Every batch ends with a commit step
```

**Files**: `Modify: skills/spec-forger/SKILL.md`

- [ ] **2.3 Update spec-forger self-review checklist**

Add to the Self-Review Checklist section:

```markdown
- [ ] Verify task granularity — each step is 2-5 min, atomic, concretely actionable
- [ ] Verify File Structure — every file referenced in any task appears in the File Structure section
- [ ] Verify Interfaces — every cross-batch dependency is declared in the Interfaces section
- [ ] Verify zero placeholders — grep for TBD, TODO, "implement later", "figure out", "add appropriate"
```

**Files**: `Modify: skills/spec-forger/SKILL.md`

- [ ] **2.4 Commit Batch 2**

```bash
git add -A
git commit -m "feat(v0.3.0): enhanced task planning with writing-plans methodology"
```

## 3. Batch 3: Inline Execution Mode (execution-governor)

Depends on: Batch 2 (spec-forger produces tasks in new format)

- [ ] **3.1 Add Execution Mode Selection section to execution-governor**

In `skills/execution-governor/SKILL.md`, add a new section after `## Core Laws` and before `## SubAgent-Driven Development (SDD) Workflow`:

```markdown
## Execution Mode Selection

Before starting implementation, determine the execution mode:

### Automatic Selection Criteria

1. Count total tasks in the execution contract's task batches
2. Analyze cross-module dependencies (does any task modify files in > 2 modules?)
3. Decision:
   - Tasks ≤ 3 AND no cross-module dependencies → **Inline mode**
   - Otherwise → **SDD mode** (default)

### Reporting

Before executing the first task, report to the user:
- Selected mode and reasoning
- Total task count
- Cross-module dependency analysis (if any)
- Offer user override: "You can override this by saying 'use SDD' or 'use inline'"

### User Override

If the user explicitly requests a mode, use it regardless of automatic selection. Record the override in the progress ledger.
```

**Files**: `Modify: skills/execution-governor/SKILL.md`
**Interfaces**: Consumes execution contract's Execution Mode field (from Batch 1 template update)

- [ ] **3.2 Add Inline Mode execution loop**

In `skills/execution-governor/SKILL.md`, add a new section after the SDD Workflow section:

```markdown
## Inline Execution Mode

For small changes (≤ 3 tasks, no cross-module dependencies).

### Per-Task Loop (Inline)

1. **Read task**: Use `scripts/task-brief PLAN_FILE N` to extract the task
2. **Write failing test**: Follow the task's TDD phase 1 — write the exact test code specified
3. **Confirm failure**: Run the test, verify it fails for the expected reason
4. **Implement**: Follow the task's TDD phase 3 — write the exact implementation code specified
5. **Confirm green**: Run the full test suite, verify all tests pass
6. **Checkpoint review**: Before proceeding to the next task:
   - Verify the task's done-when criteria from the execution contract
   - Verify the task output against its spec requirements (SHALL/MUST statements)
   - If any check fails → STOP, report the gap, ask user how to proceed
7. **Commit**: Follow the task's commit step
8. **Progress ledger**: Append task completion to `.superpowers/sdd/progress.md`

### Inline → SDD Escalation

If an inline task hits a BLOCKED state (test failure after 3 fix attempts, or the implementation requires changes outside the task's declared file paths), suggest escalating to SDD mode:
- "This task is more complex than estimated. Switch to SDD mode for subagent-driven implementation?"
```

**Files**: `Modify: skills/execution-governor/SKILL.md`

- [ ] **3.3 Update execution-governor Execution Modes section**

Replace the existing `## Execution Modes` section (currently lines 169-177) with:

```markdown
## Execution Modes Summary

| Aspect | SDD Mode | Inline Mode |
|--------|----------|-------------|
| Task count | > 3 or cross-module | ≤ 3, single module |
| Implementation | Subagent per task | Current session |
| Review | Reviewer subagent per task | Checkpoint review by governor |
| Model selection | Per-task model routing | Single model |
| Progress ledger | Yes | Yes |
| TDD Iron Law | Yes | Yes |
| Escalation | → systematic-debugger | → SDD mode or systematic-debugger |
```

**Files**: `Modify: skills/execution-governor/SKILL.md`

- [ ] **3.4 Commit Batch 3**

```bash
git add -A
git commit -m "feat(v0.3.0): inline execution mode with checkpoint review"
```

## 4. Batch 4: Abandonment Workflow (workflow-orchestrator + spec-syncer)

Depends on: Batch 1 (abandonment-summary.md template, MIN_ABANDONMENT_REASON_LENGTH constant)

- [ ] **4.1 Add abandoned state to workflow-orchestrator**

In `skills/workflow-orchestrator/SKILL.md`:

1. Add `abandoned` to the `## Default States` list (making it 8 states)
2. Add routing rule section `### Route to abandonment when:` after the existing routing rules:

```markdown
### Route to `abandonment` when:

- the user explicitly requests to abandon the change
- systematic-debugger has escalated after 3+ consecutive fix failures AND the user chooses to abandon
- scope change during specifying makes the change no longer worthwhile AND the user confirms abandonment
- the current state is NOT `closing` or `abandoned` (terminal states block abandonment transition)
```

**Files**: `Modify: skills/workflow-orchestrator/SKILL.md`
**Interfaces**: Consumes `MIN_ABANDONMENT_REASON_LENGTH` from Batch 1 constants

- [ ] **4.2 Add abandoned state guardrails to workflow-orchestrator**

Add to the `## Guardrails` section:

```markdown
- Do not allow any state transitions FROM `abandoned` — it is a terminal state.
- Do not allow transition to `abandoned` from `closing` or `abandoned` — these are already terminal.
- Do not auto-abandon without user confirmation — even if systematic-debugger recommends it.
- When transitioning to `abandoned`, prompt for abandonment summary generation before confirming.
- Do not merge delta specs from an abandoned change — spec-syncer must block this.
```

**Files**: `Modify: skills/workflow-orchestrator/SKILL.md`

- [ ] **4.3 Add abandoned change guard to spec-syncer**

In `skills/spec-syncer/SKILL.md`, add a pre-flight check before the sync process:

```markdown
### Pre-Flight: Abandoned Change Guard

Before syncing any delta specs:
1. Check if the change is in the `abandoned` state
2. If abandoned → STOP and report: "Abandoned changes cannot be synced. Delta specs from abandoned changes are preserved for reference but must not be merged into the main spec base."
3. If not abandoned → proceed with normal sync flow
```

**Files**: `Modify: skills/spec-syncer/SKILL.md`

- [ ] **4.4 Update docs/state-machine.md to 8 states**

Update the state machine diagram and state descriptions to include `abandoned`:

```markdown
## States (8)

1. `exploring` — fuzzy intent, spec-explorer active
2. `specifying` — planning artifacts written/refined, spec-forger active
3. `bridging` — artifacts translated to execution contract, bridge-contract active
4. `approved-for-build` — contract exists and user approved it
5. `executing` — TDD, SDD/Inline, review gates active, execution-governor active
6. `debugging` — side-path from executing, systematic-debugger active
7. `closing` — terminal state, verification-with-evidence, closure-archivist active
8. `abandoned` — terminal state, change abandoned, abandonment-summary generated

## Terminal States

- `closing` — successful completion
- `abandoned` — change abandoned (no delta spec merge, no further transitions)
```

**Files**: `Modify: docs/state-machine.md`

- [ ] **4.5 Commit Batch 4**

```bash
git add -A
git commit -m "feat(v0.3.0): abandoned terminal state with summary generation"
```

## 5. Batch 5: Three-Dimensional Verification (Validator + closure-archivist)

Depends on: Batch 1 (types + constants)

- [ ] **5.1 Write failing test for validateImplementation — Completeness**

```typescript
// Append to tests/e2e.test.ts
test('validateImplementation detects missing requirement in diff', () => {
  const v = new Validator();
  const report = v.validateImplementation(
    'Added logging to src/utils/logger.ts',
    '### Requirement: Auth middleware\nThe system SHALL authenticate all API requests.\n#### Scenario: Valid token\n- **WHEN** a request has a valid token\n- **THEN** the system SHALL allow access\n\n### Requirement: Rate limiting\nThe system SHALL limit requests to 100 per minute.\n#### Scenario: Over limit\n- **WHEN** rate limit exceeded\n- **THEN** the system SHALL return 429',
    '## Decisions\n### Decision 1\n- Choice: JWT\n- Rationale: stateless'
  );
  const completeness = report.dimensions.find(d => d.name === 'Completeness');
  assert.ok(completeness);
  assert.equal(completeness!.status, 'FAIL');
  assert.ok(completeness!.findings.some(f => f.message.includes('Rate limiting')));
});
```

**Files**: `Modify: tests/e2e.test.ts`

- [ ] **5.2 Run test and confirm it fails**

Run: `npm run build && npm test`
Expected: FAIL — `validateImplementation` is not a function

- [ ] **5.3 Implement validateImplementation in Validator class**

Add to `src/validation/validator.ts` inside the `Validator` class:

```typescript
validateImplementation(
  diffSummary: string,
  specContent: string,
  designContent: string
): VerificationReport {
  const dimensions: VerificationReport['dimensions'] = [];

  // --- Completeness ---
  const completenessFindings: VerificationFinding[] = [];
  const requirements = this.extractRequirementNames(specContent);
  for (const req of requirements) {
    if (!diffSummary.toLowerCase().includes(req.toLowerCase())) {
      completenessFindings.push({
        level: 'CRITICAL',
        dimension: 'Completeness',
        message: VERIFICATION_MESSAGES.COMPLETENESS_MISSING_REQUIREMENT.replace('{requirement}', req),
      });
    }
  }
  dimensions.push({
    name: 'Completeness',
    status: completenessFindings.some(f => f.level === 'CRITICAL') ? 'FAIL' : completenessFindings.length > 0 ? 'WARN' : 'PASS',
    findings: completenessFindings,
  });

  // --- Correctness ---
  const correctnessFindings: VerificationFinding[] = [];
  const placeholderPatterns = ['TODO', 'FIXME', 'HACK', 'XXX', 'PLACEHOLDER'];
  for (const pattern of placeholderPatterns) {
    if (diffSummary.includes(pattern)) {
      correctnessFindings.push({
        level: 'CRITICAL',
        dimension: 'Correctness',
        message: VERIFICATION_MESSAGES.VERIFICATION_PLACEHOLDER_DETECTED,
      });
      break;
    }
  }
  dimensions.push({
    name: 'Correctness',
    status: correctnessFindings.some(f => f.level === 'CRITICAL') ? 'FAIL' : correctnessFindings.length > 0 ? 'WARN' : 'PASS',
    findings: correctnessFindings,
  });

  // --- Coherence ---
  const coherenceFindings: VerificationFinding[] = [];
  const decisionNames = this.extractDecisionNames(designContent);
  for (const name of decisionNames) {
    if (name.length > 3 && !diffSummary.toLowerCase().includes(name.toLowerCase())) {
      coherenceFindings.push({
        level: 'IMPORTANT',
        dimension: 'Coherence',
        message: VERIFICATION_MESSAGES.COHERENCE_PATTERN_MISSING.replace('{pattern}', name),
      });
    }
  }
  dimensions.push({
    name: 'Coherence',
    status: coherenceFindings.some(f => f.level === 'CRITICAL') ? 'FAIL' : coherenceFindings.length > 0 ? 'WARN' : 'PASS',
    findings: coherenceFindings,
  });

  // --- Verdict ---
  const hasCritical = dimensions.some(d => d.status === 'FAIL');
  const hasWarning = dimensions.some(d => d.status === 'WARN');
  const verdict: VerificationReport['verdict'] = hasCritical ? 'FAIL' : hasWarning ? 'CONDITIONAL' : 'PASS';

  return { dimensions, verdict };
}

private extractRequirementNames(specContent: string): string[] {
  const regex = /### Requirement:\s*(.+)/g;
  const names: string[] = [];
  let match;
  while ((match = regex.exec(specContent)) !== null) {
    names.push(match[1].trim());
  }
  return names;
}

private extractDecisionNames(designContent: string): string[] {
  const regex = /### Decision \d+\s*\n\s*- Choice:\s*(.+)/g;
  const names: string[] = [];
  let match;
  while ((match = regex.exec(designContent)) !== null) {
    names.push(match[1].trim());
  }
  return names;
}
```

Add necessary imports at the top of `validator.ts`:
```typescript
import type { VerificationReport, VerificationFinding } from './types.js';
import { VERIFICATION_MESSAGES } from './constants.js';
```

**Files**: `Modify: src/validation/validator.ts`
**Interfaces**: Consumes `VerificationReport`, `VerificationFinding` from types.ts; `VERIFICATION_MESSAGES` from constants.ts. Produces `validateImplementation()` public API.

- [ ] **5.4 Run test and confirm it passes**

Run: `npm run build && npm test`
Expected: PASS — all tests including new validateImplementation tests

- [ ] **5.5 Add three-dimensional verification to closure-archivist**

In `skills/closure-archivist/SKILL.md`, replace the `## Verification Steps` section with:

```markdown
## Verification Steps

### Step 1: Test Suite Verification (Correctness)

Run the full test suite. Record:
- Total tests, passed, failed, skipped
- Zero failures required for PASS
- Any failure = CRITICAL finding in Correctness dimension

### Step 2: Completeness Verification

Compare the execution contract's task batches against the actual diff:
1. List all tasks from the execution contract
2. For each task, verify a corresponding code change exists in the diff
3. For each SHALL/MUST requirement in specs, verify at least one implementation artifact
4. Missing items = CRITICAL findings in Completeness dimension

### Step 3: Coherence Verification

Compare design.md decisions against the implementation:
1. Extract each decision's Choice from design.md
2. Verify the choice is reflected in the code (naming, patterns, architecture)
3. Check naming consistency between specs and implementation
4. Inconsistencies = IMPORTANT findings in Coherence dimension

### Step 4: Unintended Scope Detection

Check the diff for unplanned changes:
- Files modified that are not in the execution contract's scope fence
- New dependencies added that are not in the design's constraints
- Unplanned changes = WARN findings in Completeness dimension

### Step 5: Verification Report

Produce a structured report:

| Dimension | Status | Findings |
|-----------|--------|----------|
| Completeness | PASS/FAIL/WARN | [list] |
| Correctness | PASS/FAIL/WARN | [list] |
| Coherence | PASS/FAIL/WARN | [list] |

**Overall verdict**: PASS (all PASS) / CONDITIONAL (WARN only) / FAIL (any FAIL)

If FAIL → do not claim completion. Fix issues or route back to execution-governor.
If CONDITIONAL → present WARN findings to user, proceed only with explicit acceptance.
If PASS → proceed to final checks.
```

**Files**: `Modify: skills/closure-archivist/SKILL.md`

- [ ] **5.6 Update closure-archivist Output section**

Add the verification report to the output format:

```markdown
## Output

1. Verification report table (three dimensions with status and findings)
2. Overall verdict
3. If PASS: summary of all contract obligations met
4. If CONDITIONAL: list of accepted warnings
5. Risks and follow-ups
6. Archive readiness assessment
```

**Files**: `Modify: skills/closure-archivist/SKILL.md`

- [ ] **5.7 Commit Batch 5**

```bash
git add -A
git commit -m "feat(v0.3.0): three-dimensional verification (Completeness + Correctness + Coherence)"
```

## 6. Batch 6: Integration Tests + Version Bump + Publish

Depends on: All previous batches

- [ ] **6.1 Add comprehensive validateImplementation tests**

Add to `tests/e2e.test.ts`:

```typescript
test('validateImplementation passes when all requirements covered', () => {
  const v = new Validator();
  const report = v.validateImplementation(
    'Added JWT auth middleware in src/middleware/auth.ts, rate limiter in src/middleware/rate-limit.ts',
    '### Requirement: Auth middleware\nThe system SHALL authenticate all API requests.\n\n### Requirement: Rate limiting\nThe system SHALL limit requests to 100 per minute.',
    '## Decisions\n### Decision 1\n- Choice: JWT-based auth\n- Rationale: stateless'
  );
  assert.equal(report.verdict, 'PASS');
});

test('validateImplementation detects placeholder markers', () => {
  const v = new Validator();
  const report = v.validateImplementation(
    'Added auth middleware. TODO: implement rate limiting',
    '### Requirement: Auth middleware\nThe system SHALL authenticate all API requests.',
    '## Decisions\n### Decision 1\n- Choice: JWT\n- Rationale: stateless'
  );
  const correctness = report.dimensions.find(d => d.name === 'Correctness');
  assert.equal(correctness!.status, 'FAIL');
});

test('validateImplementation detects coherence gaps', () => {
  const v = new Validator();
  const report = v.validateImplementation(
    'Added session-based auth in src/auth.ts',
    '### Requirement: Auth middleware\nThe system SHALL authenticate all API requests.',
    '## Decisions\n### Decision 1\n- Choice: JWT-based auth\n- Rationale: stateless'
  );
  const coherence = report.dimensions.find(d => d.name === 'Coherence');
  assert.ok(coherence!.findings.length > 0);
});
```

**Files**: `Modify: tests/e2e.test.ts`

- [ ] **6.2 Run full test suite**

Run: `npm run build && npm test`
Expected: All tests PASS (existing + new)

- [ ] **6.3 Run validate on example data**

Run: `npm run validate`
Expected: Validation passes for existing example change sets

- [ ] **6.4 Version bump**

Update version to `"0.3.0"` in:
- `package.json`
- `.claude-plugin/plugin.json`
- `.claude-plugin/marketplace.json`

**Files**: `Modify: package.json`, `Modify: .claude-plugin/plugin.json`, `Modify: .claude-plugin/marketplace.json`

- [ ] **6.5 Update CHANGELOG.md**

Add v0.3.0 entry before the v0.2.1 entry:

```markdown
## [0.3.0] - 2026-06-27

### Added

- **Inline execution mode** — Lightweight single-session execution for small changes (≤ 3 tasks), parallel to SDD subagent mode. Preserves TDD Iron Law with checkpoint review instead of subagent dispatch.
- **Abandoned terminal state** — 8th workflow state allowing graceful change abandonment. Generates `abandonment-summary.md` with reason, lessons learned, and recommendations. Blocks delta spec merge for abandoned changes.
- **Three-dimensional verification** — closure-archivist now verifies Completeness (all tasks/requirements implemented), Correctness (tests pass, no placeholders), and Coherence (design decisions reflected in code). New `Validator.validateImplementation()` API.
- **abandonment-summary.md template** — Structured template for documenting abandoned changes.

### Changed

- **spec-forger task planning** — Rewritten with writing-plans methodology: File Structure section, Interfaces block, per-task TDD expansion (5 phases), exact file paths with line ranges, zero placeholder enforcement, 2-5 minute granularity per step.
- **execution-contract.md template** — Added Execution Mode (SDD | Inline) and Verification Dimensions table.
- **tasks.md template** — Added File Structure and Interfaces sections.
- **State machine** — Extended from 7 to 8 states (+abandoned terminal state).
- **Validator engine** — New `validateImplementation()` method with `VerificationReport` return type. New exports: `VerificationDimension`, `VerificationStatus`, `VerificationFinding`, `VerificationReport`.
```

**Files**: `Modify: CHANGELOG.md`

- [ ] **6.6 Final build + test**

Run: `npm run build && npm test`
Expected: All tests PASS

- [ ] **6.7 Commit and tag**

```bash
git add -A
git commit -m "release: v0.3.0 — inline execution, abandoned state, three-dimensional verification"
git tag v0.3.0
git push origin main --tags
```

## 7. Closeout

- [ ] **7.1 Verify all contract obligations**

Cross-check every SHALL/MUST from all 5 delta specs against implementation:
- task-planning: 5 requirements (Enhanced Task Granularity, Precise File Path Declaration, Interface Contract Declaration, Zero Placeholder Enforcement, File Structure Section)
- inline-execution: 3 requirements (Inline Execution Mode, Inline Mode Checkpoint Review, Execution Mode Selection Criteria)
- abandonment-workflow: 4 requirements (Abandoned Terminal State, Abandonment Summary Generation, Partial Code Preservation, No Delta Spec Merge on Abandonment)
- verification-framework: 3 requirements (Three-Dimensional Verification, Verification Dimension Report, Implementation Validator Engine)
- state-machine: 2 requirements (Eight-State Workflow, Abandoned State Routing)

Total: 17 requirements, each must have corresponding implementation.

- [ ] **7.2 Summarize risks, follow-ups, and archive readiness**

Document in the execution contract's closeout section.
