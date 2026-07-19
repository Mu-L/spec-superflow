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

  it('defines closing as a successful terminal state with no active archivist', () => {
    const stateMachine = read('docs/state-machine.md');
    const closing = section(stateMachine, '### `closing`');

    assert.match(closing, /successful terminal/i);
    assert.doesNotMatch(closing, /release-archivist.*active/i);
  });
});
