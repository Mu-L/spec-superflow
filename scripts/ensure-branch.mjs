#!/usr/bin/env node
// scripts/ensure-branch.mjs — enforce git isolation before editing main/master
// Used by build-executor as a mandatory preflight. Exits non-zero when it
// cannot create an isolated context and no --force approval was given, so the
// agent MUST stop and ask the user instead of silently editing main/master.
//
// Usage: node ensure-branch.mjs <change-dir> [change-name] [--force]
//
// Security note: every git invocation uses execFileSync with a LITERAL command
// ('git') and an argument ARRAY (no shell), mirroring the pattern proven safe
// in install-cursor.mjs / install.mjs. There is no string-form shell command and
// no variable command name, so there is no command-injection surface.
import { execFileSync } from 'node:child_process';

const changeDir = process.argv[2];
const changeName = process.argv[3];
const force = process.argv.includes('--force');

if (!changeDir) {
  console.error('Usage: node ensure-branch.mjs <change-dir> [change-name] [--force]');
  process.exit(2);
}

const PROTECTED = ['main', 'master'];

// Run git with a literal command + argument array (no shell). Returns
// { ok, stdout, stderr }; never throws so callers can branch on ok.
function tryGit(args) {
  try {
    const stdout = execFileSync('git', args, {
      encoding: 'utf-8',
      cwd: changeDir,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { ok: true, stdout: stdout || '', stderr: '' };
  } catch (e) {
    return {
      ok: false,
      stdout: (e.stdout || '').toString(),
      stderr: (e.stderr || '').toString(),
    };
  }
}

const branchRes = tryGit(['branch', '--show-current']);
if (!branchRes.ok) {
  console.error('ensure-branch: could not determine current git branch. Is <change-dir> inside a git repository?');
  process.exit(1);
}
const branch = branchRes.stdout.trim();

if (!PROTECTED.includes(branch)) {
  console.log(`ensure-branch: already isolated on branch '${branch}'. Proceed with implementation edits.`);
  process.exit(0);
}

console.error(`ensure-branch: on protected branch '${branch}'. Creating an isolated implementation context...`);

const repoName = changeDir.split('/').filter(Boolean).pop() || 'repo';
const name = changeName || repoName;
const worktreePath = `../${repoName}-${name}`;

// Preferred: git worktree
const wt = tryGit(['worktree', 'add', worktreePath, '-b', name]);
if (wt.ok) {
  console.log(`ensure-branch: created git worktree at ${worktreePath} on branch '${name}'. Make all implementation edits there.`);
  process.exit(0);
}
console.error(`ensure-branch: worktree creation failed: ${wt.stderr.trim() || wt.stdout.trim() || 'unknown'}`);

// Fallback: local branch
const br = tryGit(['switch', '-c', name]);
if (br.ok) {
  console.log(`ensure-branch: created branch '${name}' via git switch -c. Make implementation edits there.`);
  process.exit(0);
}
console.error(`ensure-branch: branch creation failed: ${br.stderr.trim() || br.stdout.trim() || 'unknown'}`);

// Both failed → require explicit approval to edit in place.
if (force) {
  console.error('ensure-branch: WARNING — editing protected branch in place with --force. This modifies main/master directly.');
  process.exit(0);
}
console.error('ensure-branch: could not create an isolated context and no --force given. STOP and ask the user for explicit approval before editing main/master.');
process.exit(1);
