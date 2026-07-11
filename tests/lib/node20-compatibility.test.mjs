import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const read = file => readFileSync(join(ROOT, file), 'utf8');

describe('Node 20 compatibility contract', () => {
  it('declares Node 20 in package metadata and lockfile', () => {
    const pkg = JSON.parse(read('package.json'));
    const lock = JSON.parse(read('package-lock.json'));
    assert.equal(pkg.engines.node, '>=20');
    assert.equal(lock.packages[''].engines.node, '>=20');
  });

  it('runs build, test, doctor, CLI smoke, and installers on Node 20 and 22', () => {
    const ci = read('.github/workflows/ci.yml');
    assert.equal((ci.match(/node-version: \[20, 22\]/g) || []).length, 2);
    assert.match(ci, /- run: npm run build/);
    assert.match(ci, /- run: npm test/);
    assert.match(ci, /node scripts\/spec-superflow\.mjs doctor/);
    assert.match(ci, /node scripts\/spec-superflow\.mjs --version/);
    assert.match(ci, /config --get execution\.inlineThreshold/);
    assert.match(ci, /node-version: 22\n          registry-url:/);
  });

  it('keeps project guidance aligned with the Node 20 test command', () => {
    const guide = read('AGENTS.md');
    assert.match(guide, /Node 20\+ native test runner/);
    assert.match(guide, /tests\/e2e\.test\.mjs/);
    assert.doesNotMatch(guide, /experimental-strip-types/);
  });
});
