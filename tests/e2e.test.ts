import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  parseDeltaSpec,
  parseChangeMarkdown,
  Validator,
} from '../dist/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const EXAMPLES_DIR = resolve(__dirname, '../docs/examples');

function readExample(...parts: string[]): string {
  return readFileSync(resolve(EXAMPLES_DIR, ...parts), 'utf-8');
}

describe('parseDeltaSpec', () => {
  it('parses add-dark-mode spec with 3 ADDED requirements', () => {
    const content = readExample('add-dark-mode', 'specs', 'ui-theme.md');
    const plan = parseDeltaSpec(content);

    assert.equal(plan.added.length, 3);
    assert.equal(plan.modified.length, 0);
    assert.equal(plan.removed.length, 0);
    assert.equal(plan.renamed.length, 0);
    assert.equal(plan.sectionPresence.added, true);

    const names = plan.added.map(b => b.name);
    assert.ok(names.includes('User can use dark mode'));
    assert.ok(names.includes('User preference persists'));
    assert.ok(names.includes('Theme maintains readable contrast'));
  });

  it('parses refactor-auth-boundary spec with 3 MODIFIED requirements', () => {
    const content = readExample('refactor-auth-boundary', 'specs', 'auth-boundary.md');
    const plan = parseDeltaSpec(content);

    assert.equal(plan.added.length, 0);
    assert.equal(plan.modified.length, 3);
    assert.equal(plan.removed.length, 0);
    assert.equal(plan.renamed.length, 0);
    assert.equal(plan.sectionPresence.modified, true);

    const names = plan.modified.map(b => b.name);
    assert.ok(names.includes('Protected requests use one authentication boundary'));
    assert.ok(names.includes('Auth failures map consistently'));
    assert.ok(names.includes('Existing approved login behavior remains unchanged'));
  });
});

describe('parseChangeMarkdown', () => {
  it('parses add-dark-mode proposal with why and whatChanges', () => {
    const content = readExample('add-dark-mode', 'proposal.md');
    const change = parseChangeMarkdown(content, 'add-dark-mode');

    assert.equal(change.name, 'add-dark-mode');
    assert.ok(change.why.length > 50, `why section too short: ${change.why.length} chars`);
    assert.ok(change.whatChanges.length > 0, 'whatChanges section is empty');

    // proposal.md uses "## Capabilities" not "## ADDED/MODIFIED Requirements"
    // so deltas array will be empty (no delta sections found)
    assert.equal(change.deltas.length, 0);
  });

  it('parses refactor-auth-boundary proposal with why and whatChanges', () => {
    const content = readExample('refactor-auth-boundary', 'proposal.md');
    const change = parseChangeMarkdown(content, 'refactor-auth-boundary');

    assert.equal(change.name, 'refactor-auth-boundary');
    assert.ok(change.why.length > 50, `why section too short: ${change.why.length} chars`);
    assert.ok(change.whatChanges.length > 0, 'whatChanges section is empty');
  });
});

describe('Validator.validateDeltaSpec', () => {
  const validator = new Validator();

  it('validates add-dark-mode delta spec structure', () => {
    const content = readExample('add-dark-mode', 'specs', 'ui-theme.md');
    const report = validator.validateDeltaSpec(content);

    // Delta specs should have deltas (ADDED/MODIFIED/REMOVED/RENAMED)
    // The validator checks for presence of delta sections
    assert.equal(report.valid, true, `Expected valid but got issues: ${JSON.stringify(report.issues, null, 2)}`);
    assert.equal(report.summary.errors, 0);
  });

  it('validates refactor-auth-boundary delta spec structure', () => {
    const content = readExample('refactor-auth-boundary', 'specs', 'auth-boundary.md');
    const report = validator.validateDeltaSpec(content);

    assert.equal(report.valid, true, `Expected valid but got issues: ${JSON.stringify(report.issues, null, 2)}`);
    assert.equal(report.summary.errors, 0);
  });
});

describe('Validator.validateChangeContent', () => {
  const validator = new Validator();

  it('validates add-dark-mode proposal as valid', () => {
    const content = readExample('add-dark-mode', 'proposal.md');
    const report = validator.validateChangeContent('add-dark-mode', content);

    assert.equal(report.valid, true, `Expected valid but got issues: ${JSON.stringify(report.issues, null, 2)}`);
    assert.equal(report.summary.errors, 0);
  });

  it('validates refactor-auth-boundary proposal as valid', () => {
    const content = readExample('refactor-auth-boundary', 'proposal.md');
    const report = validator.validateChangeContent('refactor-auth-boundary', content);

    assert.equal(report.valid, true, `Expected valid but got issues: ${JSON.stringify(report.issues, null, 2)}`);
    assert.equal(report.summary.errors, 0);
  });
});

describe('Validator.validateImplementation', () => {
  const validator = new Validator();

  it('returns VerificationReport with three dimensions', () => {
    const report = validator.validateImplementation(
      'Added auth middleware in src/middleware/auth.ts',
      '### Requirement: Auth middleware\nThe system SHALL authenticate all API requests.\n#### Scenario: Valid token\n- **WHEN** a request has a valid token\n- **THEN** the system SHALL allow access',
      '## Decisions\n### Decision 1\n- Choice: JWT-based auth\n- Rationale: stateless'
    );
    assert.ok(report.dimensions);
    assert.equal(report.dimensions.length, 3);
    const names = report.dimensions.map(d => d.name);
    assert.ok(names.includes('Completeness'));
    assert.ok(names.includes('Correctness'));
    assert.ok(names.includes('Coherence'));
    assert.ok(['PASS', 'FAIL', 'CONDITIONAL'].includes(report.verdict));
  });

  it('detects missing requirement in diff (Completeness FAIL)', () => {
    const report = validator.validateImplementation(
      'Added logging to src/utils/logger.ts',
      '### Requirement: Auth middleware\nThe system SHALL authenticate all API requests.\n\n### Requirement: Rate limiting\nThe system SHALL limit requests to 100 per minute.',
      '## Decisions\n### Decision 1\n- Choice: JWT\n- Rationale: stateless'
    );
    const completeness = report.dimensions.find(d => d.name === 'Completeness');
    assert.ok(completeness);
    assert.equal(completeness!.status, 'FAIL');
    assert.ok(completeness!.findings.some(f => f.message.includes('Rate limiting')));
  });

  it('detects placeholder markers in diff (Correctness FAIL)', () => {
    const report = validator.validateImplementation(
      'Added auth middleware. TODO: implement rate limiting',
      '### Requirement: Auth middleware\nThe system SHALL authenticate all API requests.',
      '## Decisions\n### Decision 1\n- Choice: JWT\n- Rationale: stateless'
    );
    const correctness = report.dimensions.find(d => d.name === 'Correctness');
    assert.equal(correctness!.status, 'FAIL');
  });

  it('passes when all requirements covered and no placeholders', () => {
    const report = validator.validateImplementation(
      'Added JWT auth middleware in src/middleware/auth.ts, rate limiter in src/middleware/rate-limit.ts',
      '### Requirement: Auth middleware\nThe system SHALL authenticate all API requests.\n\n### Requirement: Rate limiting\nThe system SHALL limit requests to 100 per minute.',
      '## Decisions\n### Decision 1\n- Choice: JWT-based auth\n- Rationale: stateless'
    );
    assert.equal(report.verdict, 'PASS');
  });

  it('detects coherence gaps when design decisions not in diff', () => {
    const report = validator.validateImplementation(
      'Added session-based auth in src/auth.ts',
      '### Requirement: Auth middleware\nThe system SHALL authenticate all API requests.',
      '## Decisions\n### Decision 1\n- Choice: JWT-based auth\n- Rationale: stateless'
    );
    const coherence = report.dimensions.find(d => d.name === 'Coherence');
    assert.ok(coherence!.findings.length > 0);
  });
});
