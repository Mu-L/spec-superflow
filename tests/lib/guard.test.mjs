// tests/lib/guard.test.mjs
// Tests for scripts/guard/guard.mjs — transition matrix and workflow behavior
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execSync } from 'node:child_process';

let tempDir;
const GUARD_PATH = join(process.cwd(), 'scripts/guard/guard.mjs');

describe('guard: transition matrix', () => {
  before(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'ssf-guard-test-'));
    // Create minimal artifacts so artifact checks can pass
    writeFileSync(join(tempDir, 'proposal.md'), '## Why\nThis is a test proposal for guard testing purposes. The system needs to support feature X which will enable users to accomplish their goals more efficiently.\n## What Changes\n- Add feature X');
    mkdirSync(join(tempDir, 'specs', 'test'), { recursive: true });
    writeFileSync(join(tempDir, 'specs', 'test', 'spec.md'), '## ADDED Requirements\n### Requirement: Feature X\nThe system SHALL do X.\n#### Scenario: basic\n- **WHEN** user triggers\n- **THEN** system responds');
    writeFileSync(join(tempDir, 'design.md'), '## Context\nTest design\n## Decisions\n### Decision 1\n- Choice: A\n- Rationale: B');
    writeFileSync(join(tempDir, 'tasks.md'), '## File Structure\n- Create: src/x.ts\n## Tasks\n### 1.1 Task\n- [x] done');
  });

  after(() => {
    if (tempDir) rmSync(tempDir, { recursive: true, force: true });
  });

  function runGuard(fromState, toState, opts = '') {
    try {
      const result = execSync(
        `node ${GUARD_PATH} check ${tempDir} ${fromState} ${toState} --json ${opts}`,
        { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }
      );
      return { exitCode: 0, output: JSON.parse(result.trim()) };
    } catch (err) {
      if (err.stdout) {
        try { return { exitCode: err.status, output: JSON.parse(err.stdout.trim()) }; }
        catch { return { exitCode: err.status, output: err.stderr || err.message }; }
      }
      return { exitCode: err.status || 1, output: err.stderr || err.message };
    }
  }

  it('exploring→specifying requires artifacts-exist', () => {
    const result = runGuard('exploring', 'specifying');
    assert.equal(result.exitCode, 0, `Expected exit 0 but got ${result.exitCode}: ${JSON.stringify(result.output)}`);
    const checks = result.output.checks;
    assert.ok(checks.some(c => c.dimension === 'artifacts-exist'));
  });

  it('specifying→bridging requires artifacts-exist + schema-valid', () => {
    const result = runGuard('specifying', 'bridging');
    assert.equal(result.exitCode, 0, `Expected exit 0 but got ${result.exitCode}: ${JSON.stringify(result.output)}`);
    const dims = result.output.checks.map(c => c.dimension);
    assert.ok(dims.includes('artifacts-exist'));
    assert.ok(dims.includes('schema-valid'));
  });

  it('bridging→approved-for-build requires artifacts-exist + schema-valid + contract-fresh', () => {
    const result = runGuard('bridging', 'approved-for-build');
    // contract-fresh may fail since no contract exists, but the check should run
    const dims = result.output.checks.map(c => c.dimension);
    assert.ok(dims.includes('artifacts-exist'));
    assert.ok(dims.includes('schema-valid'));
    assert.ok(dims.includes('contract-fresh'));
  });

  it('approved-for-build→executing requires artifacts-exist + contract-fresh', () => {
    const result = runGuard('approved-for-build', 'executing');
    const dims = result.output.checks.map(c => c.dimension);
    assert.ok(dims.includes('artifacts-exist'));
    assert.ok(dims.includes('contract-fresh'));
  });

  it('executing→closing requires tasks-complete + tests-passing', () => {
    const result = runGuard('executing', 'closing');
    const dims = result.output.checks.map(c => c.dimension);
    assert.ok(dims.includes('tasks-complete'));
    assert.ok(dims.includes('tests-passing'));
  });

  it('executing→debugging requires no checks', () => {
    const result = runGuard('executing', 'debugging');
    assert.equal(result.exitCode, 0);
    assert.deepStrictEqual(result.output.checks, []);
  });

  it('exploring→approved-for-build fails in default full workflow', () => {
    const result = runGuard('exploring', 'approved-for-build');
    assert.equal(result.exitCode, 1, `Expected exit 1 but got ${result.exitCode}: ${JSON.stringify(result.output)}`);
    const dims = result.output.checks.map(c => c.dimension);
    assert.ok(dims.includes('workflow-mode'));
  });

  it('exploring→approved-for-build passes in tweak workflow', () => {
    const result = runGuard('exploring', 'approved-for-build', '--workflow tweak');
    assert.equal(result.exitCode, 0, `Expected exit 0 but got ${result.exitCode}: ${JSON.stringify(result.output)}`);
    assert.deepEqual(result.output.checks, []);
  });

  it('unknown transition returns error', () => {
    const result = runGuard('closing', 'exploring');
    assert.equal(result.exitCode, 1);
  });
});

describe('guard: workflow mode behavior', () => {
  before(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'ssf-guard-mode-'));
    writeFileSync(join(tempDir, 'proposal.md'), '## Why\nTest for mode skipping\n## What Changes\n- Add Y');
  });

  after(() => {
    if (tempDir) rmSync(tempDir, { recursive: true, force: true });
  });

  function runGuardWithMode(fromState, toState, workflow) {
    try {
      const result = execSync(
        `node ${GUARD_PATH} check ${tempDir} ${fromState} ${toState} --json --workflow ${workflow}`,
        { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }
      );
      return { exitCode: 0, output: JSON.parse(result.trim()) };
    } catch (err) {
      if (err.stdout) {
        try { return { exitCode: err.status, output: JSON.parse(err.stdout.trim()) }; }
        catch { return { exitCode: err.status, output: err.stderr || err.message }; }
      }
      return { exitCode: err.status || 1, output: err.stderr || err.message };
    }
  }

  it('tweak mode allows exploring to approved-for-build without artifacts', () => {
    const result = runGuardWithMode('exploring', 'approved-for-build', 'tweak');
    assert.equal(result.exitCode, 0, JSON.stringify(result.output));
    assert.deepEqual(result.output.checks, []);
  });

  it('hotfix mode allows exploring to bridging without artifacts', () => {
    const result = runGuardWithMode('exploring', 'bridging', 'hotfix');
    assert.equal(result.exitCode, 0, JSON.stringify(result.output));
    assert.deepEqual(result.output.checks, []);
  });

  it('full mode keeps requiring artifacts on specifying to bridging', () => {
    const result = runGuardWithMode('specifying', 'bridging', 'full');
    const checks = result.output.checks;
    assert.ok(checks.some(c => c.dimension === 'artifacts-exist'));
    assert.ok(checks.some(c => c.dimension === 'schema-valid'));
  });

  it('invalid workflow mode exits with error', () => {
    const result = runGuardWithMode('exploring', 'specifying', 'invalid-mode');
    assert.equal(result.exitCode, 2);
  });
});

describe('guard: hotfix minimal contract', () => {
  let dir;

  before(() => {
    dir = mkdtempSync(join(tmpdir(), 'ssf-hotfix-guard-'));
    writeFileSync(join(dir, '.spec-superflow.yaml'), 'state: exploring\nworkflow: hotfix\nchange_name: hotfix-test\n');
  });

  after(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  function run(fromState, toState) {
    try {
      const stdout = execSync(
        `node ${GUARD_PATH} check ${dir} ${fromState} ${toState} --json --workflow hotfix`,
        { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }
      );
      return { exitCode: 0, output: JSON.parse(stdout.trim()) };
    } catch (err) {
      if (err.stdout) {
        try { return { exitCode: err.status, output: JSON.parse(err.stdout.trim()) }; }
        catch { return { exitCode: err.status, output: err.stderr || err.message }; }
      }
      return { exitCode: err.status || 1, output: err.stderr || err.message };
    }
  }

  function prepareFreshHotfixState() {
    writeFileSync(join(dir, 'execution-contract.md'), '# Execution Contract\n\n## Intent Lock\n\nHotfix contract.\n');
    execSync(`node ${join(process.cwd(), 'scripts/spec-superflow.mjs')} state init ${dir}`);
    execSync(`node ${join(process.cwd(), 'scripts/spec-superflow.mjs')} state set ${dir} workflow hotfix`);
  }

  it('allows exploring to bridging without full planning artifacts', () => {
    const result = run('exploring', 'bridging');
    assert.equal(result.exitCode, 0, JSON.stringify(result.output));
    assert.deepEqual(result.output.checks, []);
  });

  it('blocks bridging to approved-for-build without execution-contract.md', () => {
    const result = run('bridging', 'approved-for-build');
    assert.equal(result.exitCode, 1);
    assert.ok(result.output.checks.some(c => c.dimension === 'contract-current'));
  });

  it('blocks bridging to approved-for-build without DP-3', () => {
    prepareFreshHotfixState();
    const result = run('bridging', 'approved-for-build');
    assert.equal(result.exitCode, 1);
    assert.ok(result.output.checks.some(c => c.dimension === 'dp3-approved'));
  });

  it('rejects bridging to approved-for-build when DP-3 is recorded but not approved', () => {
    prepareFreshHotfixState();
    execSync(`node ${join(process.cwd(), 'scripts/spec-superflow.mjs')} state set ${dir} dp_3_result rejected`);
    const result = run('bridging', 'approved-for-build');
    assert.equal(result.exitCode, 1);
    const dp3Check = result.output.checks.find(c => c.dimension === 'dp3-approved');
    assert.ok(dp3Check);
    assert.equal(dp3Check.pass, false);
  });

  it('allows bridging to approved-for-build with fresh contract and DP-3', () => {
    prepareFreshHotfixState();
    execSync(`node ${join(process.cwd(), 'scripts/spec-superflow.mjs')} state set ${dir} dp_3_result approved`);
    const result = run('bridging', 'approved-for-build');
    assert.equal(result.exitCode, 0, JSON.stringify(result.output));
  });

  it('allows approved-for-build to executing with fresh contract and approved DP-3', () => {
    prepareFreshHotfixState();
    execSync(`node ${join(process.cwd(), 'scripts/spec-superflow.mjs')} state set ${dir} dp_3_result approved: user confirmed minimal contract`);
    const result = run('approved-for-build', 'executing');
    assert.equal(result.exitCode, 0, JSON.stringify(result.output));
    const dims = result.output.checks.map(c => c.dimension);
    assert.deepEqual(dims, ['contract-current', 'dp3-approved']);
  });
});

describe('guard: artifacts-exist check', () => {
  before(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'ssf-guard-artifacts-'));
  });

  after(() => {
    if (tempDir) rmSync(tempDir, { recursive: true, force: true });
  });

  function runGuard(fromState, toState) {
    try {
      const result = execSync(
        `node ${GUARD_PATH} check ${tempDir} ${fromState} ${toState} --json`,
        { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }
      );
      return { exitCode: 0, output: JSON.parse(result.trim()) };
    } catch (err) {
      if (err.stdout) {
        try { return { exitCode: err.status, output: JSON.parse(err.stdout.trim()) }; }
        catch { return { exitCode: err.status, output: err.stderr || err.message }; }
      }
      return { exitCode: err.status || 1, output: err.stderr || err.message };
    }
  }

  it('fails when no artifacts exist', () => {
    const result = runGuard('exploring', 'specifying');
    // artifacts-exist should fail — no proposal, specs, etc.
    const artifactsCheck = result.output.checks.find(c => c.dimension === 'artifacts-exist');
    assert.ok(artifactsCheck);
    assert.equal(artifactsCheck.pass, false);
    assert.ok(artifactsCheck.failures.length > 0);
  });
});
