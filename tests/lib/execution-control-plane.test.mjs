import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const read = path => readFileSync(join(root, path), 'utf8');

describe('execution control plane instructions', () => {
  it('documents #45 guarded execution without claiming #47 slash commands', () => {
    const documents = [
      'README.md',
      'docs/README_en.md',
      'INSTALL.md',
      'templates/execution-contract.md',
      'docs/state-machine.md',
      'docs/artifact-contract.md',
    ];

    for (const path of documents) {
      const content = read(path);
      assert.match(content, /execution[ -]plan/i, `${path} documents execution plans`);
      assert.match(content, /execution recommend|execution-recommendation|执行模式推荐/i, `${path} documents execution-mode recommendations`);
      assert.match(content, /execution-recommendation\.json|recommendation receipt|推荐凭据/i, `${path} documents persisted recommendation evidence`);
      assert.match(content, /--confirm|用户.*确认|user.*confirm/is, `${path} documents user confirmation`);
      assert.match(content, /acknowledge-recommendation|确认.*风险|acknowledg/is, `${path} documents acknowledgement for a non-recommended choice`);
      assert.match(content, /review receipt/i, `${path} documents review receipts`);
    }

    assert.match(read('templates/execution-contract.md'), /Execution Waves/);
    assert.match(read('CHANGELOG.md'), /#45/);
    assert.doesNotMatch(read('README.md'), /\/ssf:resume/);
    assert.doesNotMatch(read('docs/README_en.md'), /\/ssf:resume/);
    assert.doesNotMatch(read('INSTALL.md'), /\/ssf:resume/);

    for (const path of documents) {
      assert.doesNotMatch(read(path), /automatic(?:ally)?\s+(?:defaults?\s+to\s+)?Batch Inline/i,
        `${path} does not advertise automatic Batch Inline`);
    }
  });

  it('documents only the persisted execution-plan contract that #45 implements', () => {
    const documents = [
      'README.md',
      'docs/README_en.md',
      'INSTALL.md',
      'templates/execution-contract.md',
      'docs/state-machine.md',
      'docs/artifact-contract.md',
      'CHANGELOG.md',
    ];

    for (const path of documents) {
      const content = read(path);
      assert.match(content, /\.superpowers\/sdd\/execution-plan\.json/,
        `${path} identifies the persisted execution-plan path`);
      assert.doesNotMatch(content, /write[- ]?conflict/i,
        `${path} does not claim an unpersisted write-conflict check`);
    }

    for (const path of ['README.md', 'docs/README_en.md', 'INSTALL.md']) {
      const content = read(path);
      assert.match(content, /execution revise/i, `${path} documents execution revise`);
      assert.match(content,
        /retains?\/upgrades?.*sdd.*replan|inline\/batch-inline.*(?:upgrades?|升级).*sdd.*(?:or|或).*(?:replans?|重规划).*sdd/is,
        `${path} allows SDD replanning while retaining the no-downgrade contract`);
      assert.match(content, /downgrade|降级/i, `${path} keeps SDD downgrade rejection explicit`);
    }

    assert.match(read('scripts/spec-superflow.mjs'), /upgrade inline\/batch.*replan existing sdd.*new revision/is,
      'CLI help describes SDD replanning instead of only inline upgrades');
  });

  it('documents portable and auditable review receipt evidence', () => {
    const localizedDocuments = ['README.md', 'INSTALL.md'];

    for (const path of localizedDocuments) {
      const content = read(path);
      assert.match(content,
        /--report.*相对于.*<change>.*解析.*<change>\/.superpowers\/sdd\/reviews/is,
        `${path} resolves review reports from the change directory into its reviews overlay`);
      assert.match(content, /--base.*--head.*真实.*commit/is,
        `${path} requires real commits for review ranges`);
      assert.match(content, /<change>.*Git.*工作树/is,
        `${path} binds review ranges to the change worktree`);
      assert.match(content, /base.*head.*祖先/is,
        `${path} requires base to precede head`);
      assert.match(content,
        /<change>\/.superpowers\/sdd\/reviews\/.*物理.*非符号链接/is,
        `${path} requires physical, non-symlink review overlay directories`);
      assert.match(content,
        /report.*普通.*非空.*非符号链接.*文件/is,
        `${path} requires review reports to be regular, non-empty, non-symlink files`);
    }

    const english = read('docs/README_en.md');
    assert.match(english,
      /--report.*resolved relative to.*<change>.*must remain under.*<change>\/.superpowers\/sdd\/reviews/is,
      'English documentation resolves review reports from the change directory into its reviews overlay');
    assert.match(english, /--base.*--head.*real commits/is,
      'English documentation requires real commits for review ranges');
    assert.match(english, /<change>.*Git worktree/is,
      'English documentation binds review ranges to the change worktree');
    assert.match(english, /base.*ancestor.*head/is,
      'English documentation requires base to precede head');
    assert.match(english,
      /<change>\/.superpowers\/sdd\/reviews\/.*physical.*non-symlink/is,
      'English documentation requires physical, non-symlink review overlay directories');
    assert.match(english,
      /report.*regular.*non-empty.*non-symlink.*file/is,
      'English documentation requires review reports to be regular, non-empty, non-symlink files');
  });

  it('keeps execution mode and review gates machine-backed in every entry point', () => {
    const workflowStart = read('skills/workflow-start/SKILL.md');
    const buildExecutor = read('skills/build-executor/SKILL.md');
    const codeReviewer = read('skills/code-reviewer/SKILL.md');
    const inject = read('scripts/lib/cmd-inject.mjs');

    assert.match(workflowStart, /execution show <change-dir> --json/);
    assert.match(workflowStart, /execution plan <change-dir>/);
    assert.match(buildExecutor, /execution recommend/i);
    assert.match(buildExecutor, /user.*confirm|用户.*确认/is);
    assert.match(buildExecutor, /acknowledge-recommendation/i);
    assert.match(buildExecutor, /parallel.*wave/is);
    assert.match(buildExecutor, /concurren(?:cy|t).*unavailable/i);
    assert.match(buildExecutor, /retryable.*replacement.*pass/is);
    assert.doesNotMatch(buildExecutor, />3 tasks, same module/);
    assert.match(codeReviewer, /execution review <change-dir>.*--verdict <pass\|fail>/s);
    assert.match(codeReviewer, /Critical\/Important.*fail.*receipt/is);
    assert.match(inject, /execution plan/);
    assert.match(inject, /pass.*review receipts.*closing/is);
    assert.match(buildExecutor, /<wave-id>:<parallel\|serial>:<task,.+>\[:<depends-on/i);
  });

  it('gives every packaged installer the same planned-execution gate', () => {
    for (const path of [
      'scripts/lib/install.mjs',
      'scripts/lib/cmd-install-workbuddy.mjs',
      'scripts/install-cursor.mjs',
      'scripts/install-zcode.mjs',
    ]) {
      const content = read(path);
      assert.match(content, /execution recommend/);
      assert.match(content, /--confirm/);
      assert.match(content, /acknowledge-recommendation/);
      assert.match(content, /all.*pass.*review receipt.*closing/is);
      assert.match(content, /full\/hotfix.*tweak.*exempt/is);
    }
  });

  it('keeps task implementer and reviewer prompts aligned with planned waves and receipts', () => {
    const implementer = read('skills/build-executor/implementer-prompt.md');
    const taskReviewer = read('skills/build-executor/task-reviewer-prompt.md');
    const reviewerPrompt = read('skills/code-reviewer/code-reviewer-prompt.md');

    assert.match(implementer, /planned wave/i);
    assert.match(implementer, /implementer report path/i);
    assert.match(taskReviewer, /execution review <change-dir>/);
    assert.match(taskReviewer, /--verdict <pass\|fail>/);
    assert.match(taskReviewer, /review report\s+path/i);
    assert.match(taskReviewer, /persisted.*review report/i);
    assert.match(reviewerPrompt, /execution review <change-dir>/);
    assert.match(reviewerPrompt, /wave ID/i);
    assert.match(reviewerPrompt, /review report\s+path/i);
    assert.match(reviewerPrompt, /persisted.*review report/i);
  });
});
