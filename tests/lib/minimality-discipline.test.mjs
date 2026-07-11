import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const read = file => readFileSync(join(ROOT, file), 'utf8');

describe('minimality discipline: broad reviewer', () => {
  it('traces unrequested complexity to the missing requirement and diff line', () => {
    const skill = read('skills/code-reviewer/SKILL.md');
    const prompt = read('skills/code-reviewer/code-reviewer-prompt.md');
    assert.match(skill, /## Minimality And Scope/);
    assert.match(skill, /missing task requirement and diff line/);
    assert.match(skill, /Important for merge-blocking complexity/);
    assert.match(skill, /Minor for safe/);
    assert.match(skill, /never score by line count/);
    assert.match(prompt, /## Minimality And Scope/);
    assert.match(prompt, /unrequested dependency, configuration surface, abstraction, or unrelated refactor/);
    assert.match(prompt, /missing task requirement and diff line/);
    assert.match(prompt, /merge-blocking complexity as Important/);
    assert.match(prompt, /behavior-neutral redundancy as Minor/);
    assert.match(prompt, /Do not use line count as evidence/);
  });
});
