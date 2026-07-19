// Contract tests for #64: closing is a successful terminal state.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();

function read(relativePath) {
  return readFileSync(join(ROOT, relativePath), 'utf8');
}

function section(content, heading) {
  const start = content.indexOf(heading);
  assert.notEqual(start, -1, `missing section: ${heading}`);
  const next = content.indexOf('\n## ', start + heading.length);
  return content.slice(start, next === -1 ? undefined : next);
}

describe('closing terminal lifecycle', () => {
  it('short-circuits closing before recovery overlays and returns no next skill', () => {
    const workflow = read('skills/workflow-start/SKILL.md');
    const terminal = section(workflow, '## Terminal-State Short Circuit');
    const recovery = workflow.indexOf('## Overlay Recovery Scan');

    assert.ok(workflow.indexOf('## Terminal-State Short Circuit') < recovery,
      'terminal short circuit must run before overlay recovery scans');
    assert.match(terminal, /closing.*terminal/i);
    assert.match(terminal, /next skill.*none/i);
    assert.match(terminal,
      /do not run.*handoff.*checkpoint.*execution-control.*release-archivist/is);
  });

  it('performs archival verification and delta merging while executing before its final transition', () => {
    const archivist = read('skills/release-archivist/SKILL.md');
    const merger = read('skills/spec-merger/SKILL.md');

    assert.match(archivist, /state.*executing/i);
    assert.match(archivist, /spec-merger.*before.*executing\s*→\s*closing/is);
    assert.match(archivist, /executing\s*→\s*closing.*final/i);
    assert.match(merger, /executing\s*→\s*closing/i);
    assert.match(merger, /closing.*must not.*route.*spec-merger/is);
  });

  it('stops pre-closing skills on a persisted non-executing state before side effects', () => {
    const archivist = read('skills/release-archivist/SKILL.md');
    const merger = read('skills/spec-merger/SKILL.md');
    const archivistGuard = section(archivist, '## Execution-State Guard');
    const mergerGuard = section(merger, '## Execution-State Guard');

    for (const [name, guard] of [
      ['release-archivist', archivistGuard],
      ['spec-merger', mergerGuard],
    ]) {
      assert.match(guard, /ssf state get <change-dir> state/,
        `${name} must inspect the persisted state`);
      assert.match(guard, /exactly.*`executing`/i,
        `${name} must allow only executing`);
      assert.match(guard, /closing.*STOP/is,
        `${name} must stop for the terminal closing state`);
      assert.match(guard, /any other.*state.*STOP/is,
        `${name} must stop for every other non-executing state`);
    }

    assert.ok(merger.indexOf('## Execution-State Guard') < merger.indexOf('ssf sync'),
      'spec-merger must guard before sync can write main specs');
    for (const sideEffect of [
      '### Step 1: Test Suite',
      'ssf audit',
      'ssf state set <change-dir> dp_6_result',
      'ssf state set <change-dir> dp_7_result',
      'invoke `spec-merger`',
    ]) {
      assert.notEqual(archivist.indexOf(sideEffect), -1,
        `release-archivist fixture must include ${sideEffect}`);
      assert.ok(archivist.indexOf('## Execution-State Guard') < archivist.indexOf(sideEffect),
        `release-archivist must guard before ${sideEffect}`);
    }
  });

  it('defines closing as a successful terminal state with no active archivist', () => {
    const stateMachine = read('docs/state-machine.md');
    const closing = section(stateMachine, '### `closing`');

    assert.match(closing, /successful terminal/i);
    assert.doesNotMatch(closing, /release-archivist.*active/i);
  });
});
