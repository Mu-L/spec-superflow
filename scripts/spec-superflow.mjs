#!/usr/bin/env node
// spec-superflow CLI — zero-dependency CLI for spec management
// Usage: ssf <command> [options]

import { parseArgs } from 'node:util';

const COMMANDS = {
  list:           () => import('./lib/cmd-list.mjs'),
  validate:       () => import('./lib/cmd-validate.mjs'),
  doctor:         () => import('./lib/cmd-doctor.mjs'),
  version:        () => import('./lib/cmd-version.mjs'),
  sync:           () => import('./lib/cmd-sync.mjs'),
  config:         () => import('./lib/cmd-config.mjs'),
  state:          () => import('./lib/cmd-state.mjs'),
  inject:         () => import('./lib/cmd-inject.mjs'),
  audit:          () => import('./lib/cmd-audit.mjs'),
  checkpoint:     () => import('./lib/cmd-checkpoint.mjs'),
  isolate:        () => import('./lib/cmd-isolate.mjs'),
  'install-cursor': () => import('./lib/cmd-install-cursor.mjs'),
  'install-workbuddy': () => import('./lib/cmd-install-workbuddy.mjs'),
  'install-cline':    () => import('./lib/cmd-install-cline.mjs'),
  'install-kiro':     () => import('./lib/cmd-install-kiro.mjs'),
  'install-windsurf': () => import('./lib/cmd-install-windsurf.mjs'),
  'install-qwen':     () => import('./lib/cmd-install-qwen.mjs'),
  'install-amazon-q': () => import('./lib/cmd-install-amazon-q.mjs'),
  'install-roocode':  () => import('./lib/cmd-install-roocode.mjs'),
  'install-continue': () => import('./lib/cmd-install-continue.mjs'),
  'install-pi':       () => import('./lib/cmd-install-pi.mjs'),
  'install-zcode':     () => import('./lib/cmd-install-zcode.mjs'),
};

const HELP = `spec-superflow (ssf) — Spec-first workflow CLI

Usage: ssf <command> [options]

Commands:
  list                  List all changes and their status
  validate <dir>        Validate artifacts in a change directory
  doctor                Health check (versions, hooks, skills, docs)
  version <semver>      Sync version to all manifest files
  sync <change-dir>     Merge delta specs into main specs
  config [options]      Display or modify configuration
  state <sub> <dir>     Manage .spec-superflow.yaml state (init|check|transition|get|rebuild)
  inject <dir>          Generate phase-guard artifacts; use --platforms <name|all> when platform is ambiguous
  audit <dir>           Generate decision-point-audit.md from .spec-superflow.yaml
  install-cursor        Deploy skills/scripts/docs to .cursor/ (local Cursor setup)
  install-workbuddy     Deploy skills to WorkBuddy marketplace and enable them
  install-cline         Deploy to .cline/ + .clinerules/ (Cline)
  install-kiro          Deploy to .kiro/ + .kiro/steering/ (Kiro)
  install-windsurf      Deploy to .windsurf/ + .windsurf/rules/ (Windsurf)
  install-qwen          Deploy to .qwen/ + .qwen/rules/ (Qwen Code)
  install-amazon-q      Deploy to .amazonq/ + .amazonq/rules/ (Amazon Q Developer)
  install-roocode       Deploy to .roo/ + .roo/rules/ (Roo Code)
  install-continue      Deploy to .continue/ + .continue/rules/ (Continue)
  install-pi            Deploy to .pi/skills/ (Pi agent; no rules dir)

Options:
  --help, -h            Show this help message
  --version, -v         Show CLI version

Examples:
  ssf list
  ssf validate changes/v0.4.0-platform-evolution/
  ssf doctor
  ssf version 0.4.0
  ssf sync changes/v0.3.0-workflow-enhancements/
  ssf config --get execution.inlineThreshold
  ssf config --set verification.language=zh
  ssf state init changes/my-change/
  ssf state check changes/my-change/
  ssf state transition changes/my-change/ approved-for-build
  ssf state get changes/my-change/ batches_completed
  ssf install-cursor
  ssf install-workbuddy
  ssf install-cline --local /path/to/spec-superflow
`;

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    console.log(HELP);
    process.exit(0);
  }

  if (args.includes('--version') || args.includes('-v')) {
    const pkg = JSON.parse(
      (await import('node:fs')).readFileSync(
        new URL('../package.json', import.meta.url), 'utf-8'
      )
    );
    console.log(pkg.version);
    process.exit(0);
  }

  const command = args[0];
  const commandArgs = args.slice(1);

  if (!COMMANDS[command]) {
    console.error(`Unknown command: ${command}`);
    console.error(`Run "ssf --help" for available commands.`);
    process.exit(2);
  }

  const mod = await COMMANDS[command]();
  await mod.run(commandArgs);
}

main().catch(err => {
  console.error(`Error: ${err.message}`);
  process.exit(1);
});
