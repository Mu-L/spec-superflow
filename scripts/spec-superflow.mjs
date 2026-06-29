#!/usr/bin/env node
// spec-superflow CLI — zero-dependency CLI for spec management
// Usage: ssf <command> [options]

import { parseArgs } from 'node:util';

const COMMANDS = {
  list:     () => import('./lib/cmd-list.mjs'),
  validate: () => import('./lib/cmd-validate.mjs'),
  doctor:   () => import('./lib/cmd-doctor.mjs'),
  version:  () => import('./lib/cmd-version.mjs'),
  sync:     () => import('./lib/cmd-sync.mjs'),
  config:   () => import('./lib/cmd-config.mjs'),
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
