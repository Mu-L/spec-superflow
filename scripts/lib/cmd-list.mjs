// ssf list — scan changes/ and report status
import { readdirSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { loadConfig } from './config-loader.mjs';

function detectChangeStatus(changeDir) {
  const hasProposal = existsSync(join(changeDir, 'proposal.md'));
  const hasContract = existsSync(join(changeDir, 'execution-contract.md'));
  const hasAbandonment = existsSync(join(changeDir, 'abandonment-summary.md'));
  const hasSpecs = existsSync(join(changeDir, 'specs'));

  if (hasAbandonment) return { status: 'ABANDONED', detail: 'Change was abandoned' };
  if (!hasProposal) return { status: 'INCOMPLETE', detail: 'Missing proposal.md' };
  if (!hasContract) return { status: 'SPECIFYING', detail: 'Planning in progress' };
  if (!hasSpecs) return { status: 'BRIDGED', detail: 'Contract ready, no specs yet' };

  // Count spec files
  const specsDir = join(changeDir, 'specs');
  const specDirs = readdirSync(specsDir).filter(f => {
    try { return statSync(join(specsDir, f)).isDirectory(); } catch { return false; }
  });

  return { status: 'CLOSED', detail: `${specDirs.length} specs` };
}

export async function run(args) {
  const config = loadConfig(process.cwd());
  const changesDir = join(process.cwd(), 'changes');

  if (!existsSync(changesDir)) {
    console.log('No changes/ directory found.');
    return;
  }

  const dirs = readdirSync(changesDir).filter(f => {
    try { return statSync(join(changesDir, f)).isDirectory(); } catch { return false; }
  });

  if (dirs.length === 0) {
    console.log('No changes found in changes/');
    return;
  }

  console.log('Changes:');
  for (const dir of dirs) {
    const changeDir = join(changesDir, dir);
    const { status, detail } = detectChangeStatus(changeDir);
    const icon = status === 'CLOSED' ? '✅' : status === 'ABANDONED' ? '🚫' : status === 'SPECIFYING' ? '📝' : '🔧';
    console.log(`  ${icon} ${dir}  [${status}]  ${detail}`);
  }
}
