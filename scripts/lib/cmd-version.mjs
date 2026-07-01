// ssf version <semver> — sync version to all manifest files
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const MANIFESTS = [
  { file: 'package.json', path: ['version'] },
  { file: 'plugin.json', path: ['version'] },
  { file: '.claude-plugin/plugin.json', path: ['version'] },
  { file: '.claude-plugin/marketplace.json', path: ['plugins', '0', 'version'] },
  { file: '.cursor-plugin/plugin.json', path: ['version'] },
  { file: '.codex-plugin/plugin.json', path: ['version'] },
  { file: 'gemini-extension.json', path: ['version'] },
];

function getNestedValue(obj, pathParts) {
  let val = obj;
  for (const p of pathParts) {
    if (val === undefined || val === null) return undefined;
    val = val[p];
  }
  return val;
}

function setNestedValue(obj, pathParts, value) {
  let target = obj;
  for (let i = 0; i < pathParts.length - 1; i++) {
    target = target[pathParts[i]];
  }
  target[pathParts[pathParts.length - 1]] = value;
}

export async function run(args) {
  const dryRun = args.includes('--dry-run');
  const semverArgs = args.filter(a => a !== '--dry-run');

  if (semverArgs.length < 1) {
    console.error('Usage: ssf version <semver> [--dry-run]');
    process.exit(2);
  }

  const newVersion = semverArgs[0];
  if (!/^\d+\.\d+\.\d+/.test(newVersion)) {
    console.error(`Invalid semver: ${newVersion}`);
    process.exit(2);
  }

  console.log(`Version sync → ${newVersion}${dryRun ? ' (dry run)' : ''}\n`);

  for (const manifest of MANIFESTS) {
    const filePath = join(process.cwd(), manifest.file);
    if (!existsSync(filePath)) {
      console.log(`  ⏭️  ${manifest.file} — not found, skipping`);
      continue;
    }

    const content = JSON.parse(readFileSync(filePath, 'utf-8'));
    const currentVersion = getNestedValue(content, manifest.path);

    if (currentVersion === newVersion) {
      console.log(`  ✅ ${manifest.file}: ${currentVersion} (unchanged)`);
    } else {
      console.log(`  📝 ${manifest.file}: ${currentVersion || 'N/A'} → ${newVersion}`);
      if (!dryRun) {
        setNestedValue(content, manifest.path, newVersion);
        writeFileSync(filePath, JSON.stringify(content, null, 2) + '\n');
      }
    }
  }

  console.log('');
  if (dryRun) {
    console.log('Dry run complete. Run without --dry-run to apply changes.');
  } else {
    console.log('✅ Version synced. Remember to commit and update CHANGELOG.md.');
  }
}
