import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createRecoverySummary, resolveChangeTarget } from '../../scripts/lib/change-recovery.mjs';
import { createHandoff, finishHandoff, saveCheckpoint } from '../../scripts/lib/sdd-overlay.mjs';

describe('change-recovery: resolveChangeTarget()', () => {
  let root;

  before(() => {
    root = mkdtempSync(join(tmpdir(), 'ssf-change-recovery-test-'));
    mkdirSync(join(root, 'changes'));
  });

  after(() => {
    if (root) rmSync(root, { recursive: true, force: true });
  });

  function makeChange(name, state) {
    const changeDir = join(root, 'changes', name);
    mkdirSync(changeDir);
    writeFileSync(join(changeDir, '.spec-superflow.yaml'), `state: ${state}\n`);
    return changeDir;
  }

  function makeExecutableChange(name) {
    const changeDir = makeChange(name, 'executing');
    writeFileSync(join(changeDir, 'tasks.md'), '- [ ] 1.1 Recovery summary\n');
    return changeDir;
  }

  function makeStaleCheckpoint(changeDir, taskId) {
    saveCheckpoint(changeDir, { taskId, next: 'Use this stale recovery note' });
    writeFileSync(join(changeDir, 'tasks.md'), '- [x] 1.1 Recovery summary\n');
  }

  function makeResultReadyHandoff(changeDir, id) {
    const handoff = createHandoff(changeDir, {
      id,
      type: 'research',
      title: 'Recovery research',
      question: 'What needs review?',
    });
    writeFileSync(join(handoff.directory, 'HANDOFF_RESULT.md'), [
      '## Conclusion\nReady',
      '## Evidence\nRecorded',
      '## Produced Artifacts\nNone',
      '## Risks\nNone',
      '## Suggested Changes\nNone',
      '',
    ].join('\n\n'));
    finishHandoff(changeDir, id);
  }

  it('selects the only active change and rejects ambiguous recovery', () => {
    makeChange('alpha', 'executing');
    assert.equal(resolveChangeTarget(undefined, root).name, 'alpha');
    makeChange('beta', 'specifying');
    assert.throws(
      () => resolveChangeTarget(undefined, root),
      error => {
        assert.equal(error.code, 'AMBIGUOUS_CHANGE');
        assert.deepEqual(error.details.candidates, ['alpha', 'beta']);
        return true;
      },
    );
  });

  it('requires switch targets to resolve to recognizable changes', () => {
    assert.throws(
      () => resolveChangeTarget('missing', root),
      error => error.code === 'TARGET_NOT_FOUND',
    );
  });

  it('prioritizes result-ready handoffs over execution-plan blockers', () => {
    const change = makeExecutableChange('summary-alpha');
    makeStaleCheckpoint(change, '1.1');
    makeResultReadyHandoff(change, 'research-1');

    const summary = createRecoverySummary(change);

    assert.equal(summary.checkpoint.status, 'stale');
    assert.equal(summary.blockers[0].code, 'HANDOFF_REVIEW_REQUIRED');
    assert.equal(
      summary.next_action.command,
      `ssf handoff resolve ${change} research-1 --decision <accept|reject|defer>`,
    );
  });

  it('returns no next skill for terminal changes', () => {
    const change = makeChange('done', 'closing');
    const summary = createRecoverySummary(change);

    assert.equal(summary.terminal, true);
    assert.equal(summary.next_action.skill, 'none');
    assert.deepEqual(summary.blockers, []);
  });
});
