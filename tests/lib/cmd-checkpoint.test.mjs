// tests/lib/cmd-checkpoint.test.mjs
// Dispatcher-level tests for ssf checkpoint.
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CLI = join(process.cwd(), 'scripts/spec-superflow.mjs');
let changeDir;

function runSsf(args) {
  try {
    const stdout = execFileSync(process.execPath, [CLI, ...args], {
      encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'],
    });
    return { exitCode: 0, stdout, stderr: '' };
  } catch (error) {
    return {
      exitCode: error.status || 1,
      stdout: error.stdout?.toString() || '',
      stderr: error.stderr?.toString() || error.message,
    };
  }
}

beforeEach(() => {
  changeDir = mkdtempSync(join(tmpdir(), 'ssf-checkpoint-'));
  writeFileSync(join(changeDir, 'tasks.md'), '# Tasks\n\n- [ ] 1.1 Original task text\n');
});

afterEach(() => {
  rmSync(changeDir, { recursive: true, force: true });
});

describe('ssf checkpoint', () => {
  it('saves and shows a task checkpoint', () => {
    const result = runSsf([
      'checkpoint', 'save', changeDir, '--task', '1.1', '--next', 'Run focused tests',
      '--completed', 'Added parser tests', '--verification', 'tests/lib/sdd-overlay.test.mjs',
      '--review', 'review.md', '--risk', 'None', '--commit-start', 'aaaaaaa', '--commit-end', 'bbbbbbb',
    ]);
    assert.equal(result.exitCode, 0, result.stderr);
    assert.match(runSsf(['checkpoint', 'show', changeDir, '1.1']).stdout, /Run focused tests/);
  });

  it('rejects save without --next before creating a checkpoint file', () => {
    const result = runSsf(['checkpoint', 'save', changeDir, '--task', '1.1']);
    assert.equal(result.exitCode, 2);
    assert.equal(existsSync(join(changeDir, '.superpowers', 'sdd', 'checkpoints', '1.1.md')), false);
  });

  it('lists a stale checkpoint as JSON', () => {
    const save = runSsf(['checkpoint', 'save', changeDir, '--task', '1.1', '--next', 'Run focused tests']);
    assert.equal(save.exitCode, 0, save.stderr);
    writeFileSync(join(changeDir, 'tasks.md'), '# Tasks\n\n- [ ] 1.1 Changed task text\n');

    const result = runSsf(['checkpoint', 'list', changeDir, '--json']);
    assert.equal(result.exitCode, 0, result.stderr);
    const payload = JSON.parse(result.stdout);
    assert.equal(payload.ok, true);
    assert.equal(payload.checkpoints.length, 1);
    assert.equal(payload.checkpoints[0].task_id, '1.1');
    assert.equal(payload.checkpoints[0].stale, true);
  });

  it('rejects an unknown task ID when showing a checkpoint', () => {
    const result = runSsf(['checkpoint', 'show', changeDir, '9.9']);
    assert.equal(result.exitCode, 1);
  });
});
