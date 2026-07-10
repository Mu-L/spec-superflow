import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const CLI = join(process.cwd(), 'scripts/spec-superflow.mjs');
let tempDir;

before(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'ssf-cmd-config-test-'));
});

after(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

function writeConfig(config) {
  writeFileSync(join(tempDir, 'spec-superflow.config.json'), JSON.stringify(config));
}

function runSsf(args) {
  try {
    return {
      exitCode: 0,
      stdout: execFileSync(process.execPath, [CLI, ...args], {
        cwd: tempDir, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'],
      }), stderr: '',
    };
  } catch (error) {
    return {
      exitCode: error.status ?? 1,
      stdout: error.stdout?.toString() ?? '',
      stderr: error.stderr?.toString() ?? error.message,
    };
  }
}

describe('ssf config --resolve-model', () => {
  it('documents model profile resolution in CLI help', () => {
    const result = runSsf(['--help']);
    assert.equal(result.exitCode, 0, result.stderr);
    assert.match(result.stdout, /config --resolve-model <profile>/);
    assert.match(result.stdout, /without switching models/);
  });

  it('prints configured model profile JSON', () => {
    writeConfig({ models: { mechanical: 'vendor-small' } });
    const result = runSsf(['config', '--resolve-model', 'mechanical']);
    assert.equal(result.exitCode, 0, result.stderr);
    assert.deepStrictEqual(JSON.parse(result.stdout), {
      profile: 'mechanical', model: 'vendor-small', configured: true,
    });
  });

  it('prints a valid unmapped result and rejects invalid requests', () => {
    writeConfig({ models: {} });
    const unmapped = runSsf(['config', '--resolve-model', 'review']);
    assert.equal(unmapped.exitCode, 0, unmapped.stderr);
    assert.deepStrictEqual(JSON.parse(unmapped.stdout), {
      profile: 'review', model: null, configured: false,
    });
    assert.equal(runSsf(['config', '--resolve-model']).exitCode, 2);
    assert.equal(runSsf(['config', '--resolve-model', 'fast']).exitCode, 1);

    writeConfig({ models: { review: '' } });
    assert.equal(runSsf(['config', '--resolve-model', 'review']).exitCode, 1);
    assert.equal(runSsf(['config', '--get', 'execution.inlineThreshold']).stdout.trim(), '3');
  });
});
