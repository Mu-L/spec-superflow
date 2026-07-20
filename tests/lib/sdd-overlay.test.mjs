import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  getCheckpoint, saveCheckpoint, listCheckpoints, createHandoff, listHandoffs, finishHandoff, resolveHandoff,
} from '../../scripts/lib/sdd-overlay.mjs';

let changeDir;

const validHandoffInput = {
  type: 'research',
  title: 'Research findings',
  question: 'Which approach should the implementation use?',
  context: 'Compare the available implementation approaches.',
  source: 'Local repository inspection',
};

beforeEach(() => {
  changeDir = mkdtempSync(join(tmpdir(), 'sdd-overlay-'));
  writeFileSync(join(changeDir, 'tasks.md'), '# Tasks\n\n- [ ] 1.1 Original task text\n');
  writeFileSync(join(changeDir, 'proposal.md'), '# Proposal\n\nA valid proposal.\n');
  writeFileSync(join(changeDir, 'design.md'), '# Design\n\nA valid design.\n');
  writeFileSync(join(changeDir, '.spec-superflow.yaml'), 'state: executing\nworkflow: auto\n');
});

afterEach(() => {
  rmSync(changeDir, { recursive: true, force: true });
});

describe('checkpoint storage', () => {
  it('returns the saved current schema while list and show reparse it', () => {
    const saved = saveCheckpoint(changeDir, { taskId: '1.1', next: 'Run the focused test' });

    assert.deepEqual(Object.keys(saved), [
      'task_id', 'task_hash', 'next', 'completed', 'evidence', 'review', 'risk',
      'commit_start', 'commit_end', 'created_at', 'stale',
    ]);
    assert.equal(saved.task_id, '1.1');
    assert.match(saved.task_hash, /^sha256:/);
    assert.equal(saved.next, 'Run the focused test');
    assert.equal(saved.completed, 'Not recorded');
    assert.equal(saved.evidence, 'Not recorded');
    assert.equal(saved.review, 'Not recorded');
    assert.equal(saved.risk, 'Not recorded');
    assert.equal(saved.commit_start, 'Not recorded');
    assert.equal(saved.commit_end, 'Not recorded');
    assert.equal(saved.stale, false);
    assert.deepEqual(listCheckpoints(changeDir)[0], saved);
    assert.deepEqual(getCheckpoint(changeDir, '1.1'), saved);

    writeFileSync(join(changeDir, 'tasks.md'), '# Tasks\n\n- [ ] 1.1 Changed task text\n');
    assert.equal(listCheckpoints(changeDir)[0].stale, true);
    assert.equal(getCheckpoint(changeDir, '1.1').stale, true);
  });

  it('computes the save task hash once without rereading the saved checkpoint', () => {
    const source = readFileSync(new URL('../../scripts/lib/sdd-overlay.mjs', import.meta.url), 'utf8');
    const saveBody = source.match(/export function saveCheckpoint[\s\S]*?\n}\n\nexport function listCheckpoints/)[0];

    assert.equal((saveBody.match(/computeTaskHash/g) ?? []).length, 1);
    assert.ok(saveBody.indexOf('computeTaskHash') < saveBody.indexOf('mkdirSync'));
    assert.doesNotMatch(saveBody, /readCheckpoint/);
  });

  it('persists commit boundaries and recovery fields across list and show reads', () => {
    saveCheckpoint(changeDir, {
      taskId: '1.1',
      next: 'Run the focused test',
      completed: 'Added parser tests',
      evidence: 'tests/lib/sdd-overlay.test.mjs',
      review: 'review.md',
      risk: 'None',
      commitStart: 'aaaaaaa',
      commitEnd: 'bbbbbbb',
    });

    const checkpoint = listCheckpoints(changeDir)[0];
    assert.equal(checkpoint.task_id, '1.1');
    assert.equal(checkpoint.next, 'Run the focused test');
    assert.equal(checkpoint.completed, 'Added parser tests');
    assert.equal(checkpoint.evidence, 'tests/lib/sdd-overlay.test.mjs');
    assert.equal(checkpoint.review, 'review.md');
    assert.equal(checkpoint.risk, 'None');
    assert.equal(checkpoint.commit_start, 'aaaaaaa');
    assert.equal(checkpoint.commit_end, 'bbbbbbb');
  });

  it('marks a checkpoint stale when its numbered task line changes', () => {
    saveCheckpoint(changeDir, { taskId: '1.1', next: 'Run the focused test' });
    writeFileSync(join(changeDir, 'tasks.md'), '# Tasks\n\n- [ ] 1.1 Changed task text\n');

    assert.equal(listCheckpoints(changeDir)[0].stale, true);
  });

  it('marks a checkpoint stale when its task is removed', () => {
    saveCheckpoint(changeDir, { taskId: '1.1', next: 'Run the focused test' });
    writeFileSync(join(changeDir, 'tasks.md'), '# Tasks\n');

    assert.equal(listCheckpoints(changeDir)[0].stale, true);
  });
});

describe('handoff storage', () => {
  it('creates HANDOFF.md and HANDOFF_RESULT.md and validates the latter on finish', () => {
    const handoff = createHandoff(changeDir, validHandoffInput);
    const handoffPath = join(handoff.directory, 'HANDOFF.md');
    const resultPath = join(handoff.directory, 'HANDOFF_RESULT.md');

    assert.equal(existsSync(handoffPath), true);
    assert.equal(existsSync(resultPath), true);
    writeFileSync(resultPath, validResult());
    assert.equal(finishHandoff(changeDir, handoff.id).status, 'result-ready');
  });

  it('keeps a handoff active when finish validation fails', () => {
    const handoff = createHandoff(changeDir, validHandoffInput);

    assert.throws(() => finishHandoff(changeDir, handoff.id), /Conclusion/);
    assert.equal(listHandoffs(changeDir)[0].status, 'active');
  });

  it('requires explicit drift acknowledgement before resolving', () => {
    const handoff = createReadyHandoff();
    writeFileSync(join(changeDir, 'design.md'), '# Changed design\n');

    assert.throws(
      () => resolveHandoff(changeDir, handoff.id, 'accept', false),
      /acknowledge-source-drift/,
    );
    assert.equal(resolveHandoff(changeDir, handoff.id, 'accept', true).status, 'resolved');
  });
});

function createReadyHandoff() {
  const handoff = createHandoff(changeDir, validHandoffInput);
  const resultPath = join(changeDir, '.superpowers', 'sdd', 'handoffs', handoff.id, 'HANDOFF_RESULT.md');
  writeFileSync(resultPath, validResult());
  return finishHandoff(changeDir, handoff.id);
}

function validResult() {
  return [
    '## Conclusion\nThe research is complete.',
    '## Evidence\nRepository evidence was reviewed.',
    '## Produced Artifacts\nThe handoff record was produced.',
    '## Risks\nNo additional risks were found.',
    '## Suggested Changes\nProceed with the selected approach.',
    '',
  ].join('\n');
}
