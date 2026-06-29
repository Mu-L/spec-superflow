// ssf sync <change-dir> — merge delta specs into main specs with conflict detection
import { readFileSync, readdirSync, writeFileSync, existsSync, statSync, mkdirSync } from 'node:fs';
import { join, basename } from 'node:path';
import { loadConfig } from './config-loader.mjs';

function findSpecFiles(dir) {
  const results = [];
  if (!existsSync(dir)) return results;
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) results.push(...findSpecFiles(full));
    else if (entry === 'spec.md') results.push(full);
  }
  return results;
}

export async function run(args) {
  if (args.length < 1) {
    console.error('Usage: ssf sync <change-dir>');
    process.exit(2);
  }

  const changeDir = args[0];
  if (!existsSync(changeDir)) {
    console.error(`Error: "${changeDir}" not found`);
    process.exit(2);
  }

  const config = loadConfig(process.cwd());
  const { Validator, parseDeltaSpec } = await import('../../dist/index.js');
  const validator = new Validator();

  // Collect all unsynced changes for conflict detection
  const changesDir = join(process.cwd(), 'changes');
  const allDeltas = [];

  if (existsSync(changesDir)) {
    for (const dir of readdirSync(changesDir)) {
      const dirPath = join(changesDir, dir);
      if (!statSync(dirPath).isDirectory()) continue;
      const specsPath = join(dirPath, 'specs');
      if (!existsSync(specsPath)) continue;

      for (const specFile of findSpecFiles(specsPath)) {
        const content = readFileSync(specFile, 'utf-8');
        allDeltas.push({ changeName: dir, content });
      }
    }
  }

  // Check for conflicts
  if (allDeltas.length > 0) {
    const conflictReport = validator.detectSyncConflicts(allDeltas);
    if (conflictReport.hasConflicts) {
      console.log('⚠️  Sync conflicts detected:\n');
      for (const conflict of conflictReport.conflicts) {
        console.log(`  Requirement: "${conflict.requirement}"`);
        console.log(`  Modified by: ${conflict.changes.join(', ')}\n`);
      }
      console.log('Resolve conflicts before syncing. Consider syncing changes one at a time.');
      process.exit(1);
    }
  }

  // Perform sync: copy delta specs to main specs/
  const changeSpecsDir = join(changeDir, 'specs');
  const mainSpecsDir = join(process.cwd(), 'specs');
  const changeName = basename(changeDir);

  if (!existsSync(changeSpecsDir)) {
    console.log('No specs/ found in change directory.');
    return;
  }

  if (!existsSync(mainSpecsDir)) {
    mkdirSync(mainSpecsDir, { recursive: true });
  }

  const specFiles = findSpecFiles(changeSpecsDir);
  let synced = 0;

  for (const specFile of specFiles) {
    // Determine capability name from directory structure
    const relative = specFile.replace(changeSpecsDir + '/', '');
    const capabilityDir = relative.replace('/spec.md', '');
    const targetDir = join(mainSpecsDir, capabilityDir);

    if (!existsSync(targetDir)) {
      mkdirSync(targetDir, { recursive: true });
    }

    const content = readFileSync(specFile, 'utf-8');
    writeFileSync(join(targetDir, 'spec.md'), content);
    console.log(`  📋 Synced: specs/${capabilityDir}/spec.md`);
    synced++;
  }

  console.log(`\n✅ Synced ${synced} spec(s) from ${changeName} to specs/`);
}
