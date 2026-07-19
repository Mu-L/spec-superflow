import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CLI = join(process.cwd(), 'scripts/spec-superflow.mjs');
let root;

function runSsf(args) {
  try {
    const stdout = execFileSync(process.execPath, [CLI, ...args], {
      encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'],
    });
    return { status: 0, stdout, stderr: '' };
  } catch (error) {
    return {
      status: error.status || 1,
      stdout: error.stdout?.toString() || '',
      stderr: error.stderr?.toString() || error.message,
    };
  }
}

function makeChange(name, state) {
  const changeDir = join(root, name);
  mkdirSync(changeDir);
  writeFileSync(join(changeDir, '.spec-superflow.yaml'), `state: ${state}\nworkflow: full\n`);
  return changeDir;
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'ssf-cmd-recovery-'));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('ssf resume and switch', () => {
  it('returns one stable JSON object from resume', () => {
    const change = makeChange('alpha', 'specifying');
    const result = runSsf(['resume', change, '--json']);

    assert.equal(result.status, 0, result.stderr);
    const value = JSON.parse(result.stdout);
    assert.deepEqual(
      Object.keys(value).filter(key =>
        ['ok', 'command', 'change', 'state', 'terminal', 'blockers', 'next_action'].includes(key),
      ),
      ['ok', 'command', 'change', 'state', 'terminal', 'blockers', 'next_action'],
    );
    assert.equal(value.command, 'resume');
  });

  it('rejects switch without an explicit target as JSON', () => {
    const result = runSsf(['switch', '--json']);

    assert.equal(result.status, 2);
    assert.deepEqual(JSON.parse(result.stdout), {
      ok: false,
      command: 'switch',
      error: {
        code: 'TARGET_REQUIRED',
        message: 'switch requires an explicit change target',
        details: {},
      },
    });
  });

  it('returns a single JSON object for recovery domain errors', () => {
    const result = runSsf(['resume', join(root, 'missing'), '--json']);

    assert.equal(result.status, 1);
    assert.deepEqual(JSON.parse(result.stdout), {
      ok: false,
      command: 'resume',
      error: {
        code: 'TARGET_NOT_FOUND',
        message: 'Change target was not found',
        details: { input: join(root, 'missing') },
      },
    });
  });

  it('renders the complete recovery context as text without changing the target', () => {
    const change = makeChange('alpha', 'specifying');
    const stateBefore = readFileSync(join(change, '.spec-superflow.yaml'), 'utf8');

    const result = runSsf(['switch', change]);

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /State: specifying/);
    assert.match(result.stdout, /Checkpoint: none/);
    assert.match(result.stdout, /Handoffs: active 0, result-ready 0, resolved 0/);
    assert.match(result.stdout, /Execution: current n\/a/);
    assert.match(result.stdout, /Blockers: none/);
    assert.match(result.stdout, /Next action:/);
    assert.equal(readFileSync(join(change, '.spec-superflow.yaml'), 'utf8'), stateBefore);
  });
});
