# Implementation Tasks: v0.5.0 Guard & State

## File Structure

- `Create: scripts/guard/guard.mjs` — 主入口：解析参数、查转换矩阵、组合维度、输出结果
- `Create: scripts/guard/checks/artifacts-exist.mjs` — 检查 4 工件 + specs/ 目录存在且非空
- `Create: scripts/guard/checks/schema-valid.mjs` — 调用 Validator 验证所有工件
- `Create: scripts/guard/checks/contract-fresh.mjs` — 调 hash.mjs 比对哈希
- `Create: scripts/guard/checks/tasks-complete.mjs` — 检查 tasks.md 无未勾选项
- `Create: scripts/guard/checks/tests-passing.mjs` — 读状态文件确认 test_result=pass
- `Create: scripts/lib/hash.mjs` — SHA256 计算 + 比对
- `Create: scripts/lib/state-loader.mjs` — YAML 读写（零依赖，regex 解析）
- `Create: scripts/lib/cmd-state.mjs` — ssf state 子命令（init/check/transition/get/rebuild）
- `Modify: scripts/spec-superflow.mjs` — 新增 state 子命令路由
- `Modify: skills/workflow-orchestrator/SKILL.md` — 每个路由规则前增加守护脚本调用指令
- `Modify: skills/bridge-contract/SKILL.md` — 生成 contract 后自动运行 ssf state init
- `Modify: skills/closure-archivist/SKILL.md` — 验证完成后运行 ssf state transition
- `Modify: skills/execution-governor/SKILL.md` — 每批次完成后更新 batches_completed
- `Modify: package.json` — 版本号 → 0.5.0
- `Modify: .claude-plugin/plugin.json` — 版本号 → 0.5.0
- `Modify: .claude-plugin/marketplace.json` — 版本号 → 0.5.0
- `Modify: .cursor-plugin/plugin.json` — 版本号 → 0.5.0
- `Modify: gemini-extension.json` — 版本号 → 0.5.0
- `Modify: CHANGELOG.md` — 添加 v0.5.0 条目
- `Modify: README.md` — 更新 CLI 命令表

## Interfaces

### Batch 1 → Batch 2
- **Produces**: `scripts/lib/hash.mjs`（computeArtifactsHash, computeContractHash, isContractFresh）— consumed by contract-fresh.mjs in Batch 2
- **Produces**: `scripts/lib/state-loader.mjs`（readState, writeState, updateField）— consumed by all check scripts in Batch 2 and cmd-state.mjs in Batch 3

### Batch 2 → Batch 3
- **Produces**: `scripts/guard/guard.mjs`（check 命令）— consumed by workflow-orchestrator SKILL.md in Batch 3
- **Produces**: 5 个 check 脚本 — consumed by guard.mjs 主入口

## 1. Batch 1: 基础设施（hash + state-loader）

- [ ] **1.1 实现 hash.mjs — SHA256 计算**

```javascript
// scripts/lib/hash.mjs
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

/**
 * 计算 4 工件的联合 SHA256 哈希
 * 输入：按字母序读取 proposal.md + specs/*/spec.md + design.md + tasks.md
 */
export function computeArtifactsHash(changeDir) {
  const hash = crypto.createHash('sha256');
  
  // proposal.md
  const proposal = path.join(changeDir, 'proposal.md');
  if (fs.existsSync(proposal)) hash.update(fs.readFileSync(proposal, 'utf-8'));
  
  // specs/*/spec.md (按字母序)
  const specsDir = path.join(changeDir, 'specs');
  if (fs.existsSync(specsDir)) {
    const specFiles = [];
    walkDir(specsDir, specFiles);
    specFiles.sort();
    for (const f of specFiles) {
      if (f.endsWith('.md')) hash.update(fs.readFileSync(f, 'utf-8'));
    }
  }
  
  // design.md
  const design = path.join(changeDir, 'design.md');
  if (fs.existsSync(design)) hash.update(fs.readFileSync(design, 'utf-8'));
  
  // tasks.md
  const tasks = path.join(changeDir, 'tasks.md');
  if (fs.existsSync(tasks)) hash.update(fs.readFileSync(tasks, 'utf-8'));
  
  return `sha256:${hash.digest('hex')}`;
}

/**
 * 计算 execution-contract.md 的 SHA256 哈希
 */
export function computeContractHash(changeDir) {
  const contract = path.join(changeDir, 'execution-contract.md');
  if (!fs.existsSync(contract)) return null;
  const hash = crypto.createHash('sha256');
  hash.update(fs.readFileSync(contract, 'utf-8'));
  return `sha256:${hash.digest('hex')}`;
}

/**
 * 快速比对：读状态文件哈希 vs 重新计算当前工件哈希
 */
export function isContractFresh(changeDir) {
  const stateFile = path.join(changeDir, '.spec-superflow.yaml');
  if (!fs.existsSync(stateFile)) return false;
  
  const state = parseYaml(fs.readFileSync(stateFile, 'utf-8'));
  const storedHash = state.artifacts_hash;
  if (!storedHash) return false;
  
  const currentHash = computeArtifactsHash(changeDir);
  return storedHash === currentHash;
}

function walkDir(dir, result) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkDir(full, result);
    else result.push(full);
  }
}

// 最小 YAML 解析（仅提取顶层字段，零依赖）
function parseYaml(content) {
  const result = {};
  for (const line of content.split('\n')) {
    const match = line.match(/^(\w[\w_]*):\s*(.*)/);
    if (match) {
      result[match[1]] = match[2].trim() || null;
    }
  }
  return result;
}
```

**Files**: `Create: scripts/lib/hash.mjs`

- [ ] **1.2 实现 state-loader.mjs — 状态文件读写**

```javascript
// scripts/lib/state-loader.mjs
import fs from 'node:fs';
import path from 'node:path';

const STATE_FILE = '.spec-superflow.yaml';

const BUILTIN_DEFAULTS = {
  state: 'exploring',
  workflow: 'full',
  artifacts_hash: null,
  contract_hash: null,
  execution_mode: null,
  batches_completed: 0,
  test_result: null,
  change_name: null,
  last_transition: null,
  last_transition_from: null,
  last_transition_to: null,
};

/**
 * 读取状态文件，合并默认值
 */
export function readState(changeDir) {
  const filePath = path.join(changeDir, STATE_FILE);
  if (!fs.existsSync(filePath)) return { ...BUILTIN_DEFAULTS, change_name: path.basename(changeDir) };
  
  const raw = fs.readFileSync(filePath, 'utf-8');
  const parsed = parseYaml(raw);
  return { ...BUILTIN_DEFAULTS, ...parsed };
}

/**
 * 写入状态文件
 */
export function writeState(changeDir, state) {
  const filePath = path.join(changeDir, STATE_FILE);
  const lines = [];
  lines.push('# .spec-superflow.yaml — 轻量状态机');
  lines.push('# 派生数据，永远可从工件重建。丢失/损坏 → 回退内容级检测自动重建。');
  lines.push('');
  lines.push('# === 核心状态 ===');
  lines.push(`state: ${state.state || 'exploring'}`);
  lines.push(`workflow: ${state.workflow || 'full'}`);
  lines.push('');
  lines.push('# === 哈希（快速过期检测） ===');
  lines.push(`artifacts_hash: ${state.artifacts_hash || 'null'}`);
  lines.push(`contract_hash: ${state.contract_hash || 'null'}`);
  lines.push('');
  lines.push('# === 执行进度 ===');
  lines.push(`execution_mode: ${state.execution_mode || 'null'}`);
  lines.push(`batches_completed: ${state.batches_completed || 0}`);
  lines.push(`test_result: ${state.test_result || 'null'}`);
  lines.push('');
  lines.push('# === 元数据 ===');
  lines.push(`change_name: ${state.change_name || path.basename(changeDir)}`);
  lines.push(`last_transition: ${state.last_transition || 'null'}`);
  lines.push(`last_transition_from: ${state.last_transition_from || 'null'}`);
  lines.push(`last_transition_to: ${state.last_transition_to || 'null'}`);
  
  fs.writeFileSync(filePath, lines.join('\n') + '\n', 'utf-8');
}

/**
 * 更新单个字段
 */
export function updateField(changeDir, field, value) {
  const state = readState(changeDir);
  state[field] = value;
  writeState(changeDir, state);
}

/**
 * 从工件重建状态文件
 */
export function rebuildState(changeDir, { computeArtifactsHash, computeContractHash }) {
  const state = readState(changeDir);
  state.artifacts_hash = computeArtifactsHash(changeDir);
  state.contract_hash = computeContractHash(changeDir);
  writeState(changeDir, state);
  return state;
}

// 最小 YAML 解析（仅提取顶层字段，零依赖）
function parseYaml(content) {
  const result = {};
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const match = trimmed.match(/^(\w[\w_]*):\s*(.*)/);
    if (match) {
      const val = match[2].trim();
      if (val === 'null' || val === '') result[match[1]] = null;
      else if (/^\d+$/.test(val)) result[match[1]] = parseInt(val, 10);
      else result[match[1]] = val;
    }
  }
  return result;
}
```

**Files**: `Create: scripts/lib/state-loader.mjs`

- [ ] **1.3 实现 artifacts-exist.mjs — 第一个检查维度**

```javascript
// scripts/guard/checks/artifacts-exist.mjs
import fs from 'node:fs';
import path from 'node:path';

/**
 * 检查 4 工件 + specs/ 目录存在且非空
 */
export function checkArtifactsExist(changeDir) {
  const failures = [];
  const required = ['proposal.md', 'design.md', 'tasks.md'];
  
  for (const file of required) {
    const filePath = path.join(changeDir, file);
    if (!fs.existsSync(filePath)) {
      failures.push(`${file}: missing`);
    } else if (fs.readFileSync(filePath, 'utf-8').trim().length === 0) {
      failures.push(`${file}: empty`);
    }
  }
  
  const specsDir = path.join(changeDir, 'specs');
  if (!fs.existsSync(specsDir) || fs.readdirSync(specsDir).length === 0) {
    failures.push('specs/: missing or empty');
  }
  
  return { pass: failures.length === 0, failures };
}
```

**Files**: `Create: scripts/guard/checks/artifacts-exist.mjs`

- [ ] **1.4 验证 hash.mjs 可独立运行**

```bash
# 用现有 change 目录测试哈希计算
node -e "
  import { computeArtifactsHash, computeContractHash } from './scripts/lib/hash.mjs';
  const h = computeArtifactsHash('changes/v0.3.0-workflow-enhancements');
  console.log('artifacts hash:', h);
  console.assert(h.startsWith('sha256:'), 'hash should start with sha256:');
  console.assert(h.length === 71, 'sha256 hex is 64 chars + 7 prefix');
  const ch = computeContractHash('changes/v0.3.0-workflow-enhancements');
  console.log('contract hash:', ch || '(no contract file — expected)');
  console.log('OK');
"
```

**Expected**: 输出 artifacts hash + contract hash（或 null 如果无 contract），无 assert 失败

- [ ] **1.5 验证 state-loader.mjs 可独立运行**

```bash
# 临时目录测试读写
node -e "
  import { writeState, readState, updateField } from './scripts/lib/state-loader.mjs';
  import fs from 'node:fs';
  const tmp = '/tmp/ssf-test-state';
  fs.mkdirSync(tmp, { recursive: true });
  const state = readState(tmp);
  console.assert(state.state === 'exploring', 'default state');
  state.artifacts_hash = 'sha256:test123';
  writeState(tmp, state);
  console.assert(fs.existsSync(tmp + '/.spec-superflow.yaml'), 'file written');
  const reread = readState(tmp);
  console.assert(reread.artifacts_hash === 'sha256:test123', 'round-trip');
  updateField(tmp, 'batches_completed', 3);
  const updated = readState(tmp);
  console.assert(updated.batches_completed === 3, 'field update');
  fs.rmSync(tmp, { recursive: true });
  console.log('OK');
"
```

**Expected**: 输出 OK，无 assert 失败

- [ ] **1.6 Commit Batch 1**

```bash
git add -A
git commit -m "feat(v0.5.0): hash engine + state loader + artifacts-exist check"
```

## 2. Batch 2: 守护脚本（5 个检查维度 + 主入口）

Depends on: Batch 1（hash.mjs + state-loader.mjs）

- [ ] **2.1 实现 schema-valid.mjs — 复用 Validator 引擎**

```javascript
// scripts/guard/checks/schema-valid.mjs
import fs from 'node:fs';
import path from 'node:path';

/**
 * 调用 Validator 验证所有工件
 * 动态 import dist/index.js（ESM → CJS 互操作）
 */
export async function checkSchemaValid(changeDir) {
  const failures = [];
  
  // 动态 import 编译后的 Validator
  const { Validator } = await import(new URL('../../../dist/index.js', import.meta.url).pathname);
  const validator = new Validator();
  
  // 验证 proposal.md
  const proposalPath = path.join(changeDir, 'proposal.md');
  if (fs.existsSync(proposalPath)) {
    const content = fs.readFileSync(proposalPath, 'utf-8');
    const report = validator.validateChangeContent(content);
    if (!report.valid) {
      for (const issue of report.issues) {
        if (issue.level === 'ERROR') {
          failures.push(`proposal.md: ${issue.message}`);
        }
      }
    }
  }
  
  // 验证每个 specs/*/spec.md
  const specsDir = path.join(changeDir, 'specs');
  if (fs.existsSync(specsDir)) {
    for (const entry of fs.readdirSync(specsDir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        const specFile = path.join(specsDir, entry.name, 'spec.md');
        if (fs.existsSync(specFile)) {
          const content = fs.readFileSync(specFile, 'utf-8');
          const report = validator.validateSpecContent(content);
          if (!report.valid) {
            for (const issue of report.issues) {
              if (issue.level === 'ERROR') {
                failures.push(`specs/${entry.name}/spec.md: ${issue.message}`);
              }
            }
          }
        }
      }
    }
  }
  
  return { pass: failures.length === 0, failures };
}
```

**Files**: `Create: scripts/guard/checks/schema-valid.mjs`

- [ ] **2.2 实现 contract-fresh.mjs — 哈希比对**

```javascript
// scripts/guard/checks/contract-fresh.mjs
import { isContractFresh } from '../../lib/hash.mjs';

/**
 * 比对 .spec-superflow.yaml 中的 artifacts_hash 与当前工件哈希
 */
export function checkContractFresh(changeDir) {
  const fresh = isContractFresh(changeDir);
  if (fresh) {
    return { pass: true, failures: [] };
  }
  return {
    pass: false,
    failures: ['execution-contract.md is stale: artifacts hash mismatch. Re-run bridge-contract to regenerate.'],
  };
}
```

**Files**: `Create: scripts/guard/checks/contract-fresh.mjs`

- [ ] **2.3 实现 tasks-complete.mjs — 任务勾选检查**

```javascript
// scripts/guard/checks/tasks-complete.mjs
import fs from 'node:fs';
import path from 'node:path';

/**
 * 检查 tasks.md 所有 - [ ] 变为 - [x]，无未完成项
 */
export function checkTasksComplete(changeDir) {
  const tasksPath = path.join(changeDir, 'tasks.md');
  if (!fs.existsSync(tasksPath)) {
    return { pass: false, failures: ['tasks.md: missing'] };
  }
  
  const content = fs.readFileSync(tasksPath, 'utf-8');
  const unchecked = content.match(/^- \[ \]/gm);
  if (unchecked && unchecked.length > 0) {
    return {
      pass: false,
      failures: [`tasks.md: ${unchecked.length} unchecked task(s) remaining`],
    };
  }
  
  const hasAny = content.match(/^- \[x\]/gm);
  if (!hasAny) {
    return { pass: false, failures: ['tasks.md: no completed tasks found'] };
  }
  
  return { pass: true, failures: [] };
}
```

**Files**: `Create: scripts/guard/checks/tasks-complete.mjs`

- [ ] **2.4 实现 tests-passing.mjs — 测试结果检查**

```javascript
// scripts/guard/checks/tests-passing.mjs
import { readState } from '../../lib/state-loader.mjs';

/**
 * 读状态文件确认 test_result=pass
 */
export function checkTestsPassing(changeDir) {
  const state = readState(changeDir);
  if (state.test_result === 'pass') {
    return { pass: true, failures: [] };
  }
  return {
    pass: false,
    failures: [`test_result is '${state.test_result || 'null'}' — expected 'pass'. Run closure-archivist verification first.`],
  };
}
```

**Files**: `Create: scripts/guard/checks/tests-passing.mjs`

- [ ] **2.5 实现 guard.mjs — 主入口 + 转换矩阵**

```javascript
#!/usr/bin/env node
// scripts/guard/guard.mjs
import { parseArgs } from 'node:util';
import { checkArtifactsExist } from './checks/artifacts-exist.mjs';
import { checkTasksComplete } from './checks/tasks-complete.mjs';
import { checkTestsPassing } from './checks/tests-passing.mjs';
import { checkContractFresh } from './checks/contract-fresh.mjs';

// 转换矩阵：<from> → <to> 需要的检查维度
const TRANSITION_CHECKS = {
  'exploring:specifying': ['artifacts-exist'],
  'specifying:bridging':  ['artifacts-exist', 'schema-valid'],
  'bridging:approved':    ['artifacts-exist', 'schema-valid', 'contract-fresh'],
  'approved:executing':   ['artifacts-exist', 'contract-fresh'],
  'executing:closing':    ['tasks-complete', 'tests-passing'],
  'executing:debugging':  [],  // 自动路由，不检查
  'debugging:executing':  ['contract-fresh'],
};

async function main() {
  const { positionals } = parseArgs({
    options: { json: { type: 'boolean', default: false } },
    allowPositionals: true,
  });

  const subcommand = positionals[0];
  if (subcommand !== 'check') {
    console.error('Usage: guard.mjs check <change-dir> <from-state> <to-state> [--json]');
    process.exit(2);
  }

  const changeDir = positionals[1];
  const fromState = positionals[2];
  const toState = positionals[3];
  const useJson = process.argv.includes('--json');

  const key = `${fromState}:${toState}`;
  const dimensions = TRANSITION_CHECKS[key];

  if (!dimensions) {
    const msg = `Unknown transition: ${fromState} → ${toState}. Valid transitions: ${Object.keys(TRANSITION_CHECKS).join(', ')}`;
    if (useJson) console.log(JSON.stringify({ pass: false, checks: [], error: msg }));
    else console.error(msg);
    process.exit(1);
  }

  if (dimensions.length === 0) {
    // 无检查的转换（如 executing → debugging）
    const result = { pass: true, checks: [] };
    if (useJson) console.log(JSON.stringify(result));
    else console.log('All checks passed (no checks required for this transition).');
    process.exit(0);
  }

  const checks = [];
  let pass = true;

  for (const dim of dimensions) {
    let result;
    switch (dim) {
      case 'artifacts-exist':
        result = checkArtifactsExist(changeDir);
        break;
      case 'schema-valid':
        result = await (await import('./checks/schema-valid.mjs')).checkSchemaValid(changeDir);
        break;
      case 'contract-fresh':
        result = checkContractFresh(changeDir);
        break;
      case 'tasks-complete':
        result = checkTasksComplete(changeDir);
        break;
      case 'tests-passing':
        result = checkTestsPassing(changeDir);
        break;
      default:
        result = { pass: false, failures: [`Unknown dimension: ${dim}`] };
    }
    checks.push({ dimension: dim, pass: result.pass, failures: result.failures || [] });
    if (!result.pass) pass = false;
  }

  if (useJson) {
    console.log(JSON.stringify({ pass, checks }, null, 2));
  } else {
    if (pass) {
      console.log('All checks passed.');
    } else {
      console.error('Guard checks failed:');
      for (const c of checks) {
        if (!c.pass) {
          for (const f of c.failures) {
            console.error(`  [FAIL] ${c.dimension}: ${f}`);
          }
        }
      }
    }
  }

  process.exit(pass ? 0 : 1);
}

main().catch(err => {
  console.error('Guard error:', err.message);
  process.exit(1);
});
```

**Files**: `Create: scripts/guard/guard.mjs`

- [ ] **2.6 验证 guard.mjs 可运行**

```bash
# 测试 artifacts-exist 检查（v0.3.0 change 目录有完整工件）
node scripts/guard/guard.mjs check changes/v0.3.0-workflow-enhancements exploring specifying --json

# 测试 tasks-complete 检查（v0.3.0 tasks.md 所有项已勾选）
node scripts/guard/guard.mjs check changes/v0.3.0-workflow-enhancements executing closing --json

# 测试未知转换（应报错）
node scripts/guard/guard.mjs check changes/v0.3.0-workflow-enhancements closing exploring --json 2>&1; echo "exit: $?"
```

**Expected**: 
- 第一个命令：pass=true（artifacts-exist 通过）
- 第二个命令：pass=true 或 pass=false（取决于 tasks.md 勾选状态和 test_result）
- 第三个命令：exit code 1，包含 "Unknown transition"

- [ ] **2.7 Commit Batch 2**

```bash
git add -A
git commit -m "feat(v0.5.0): guard script with 5 check dimensions + transition matrix"
```

## 3. Batch 3: 集成 + CLI + 文档

Depends on: Batch 2（guard.mjs 完整可用）

- [ ] **3.1 实现 cmd-state.mjs — ssf state 子命令**

```javascript
// scripts/lib/cmd-state.mjs
import { parseArgs } from 'node:util';
import { readState, writeState, updateField, rebuildState } from './state-loader.mjs';
import { computeArtifactsHash, computeContractHash } from './hash.mjs';

export async function run(args) {
  const { positionals, values } = parseArgs({
    args,
    options: {
      json: { type: 'boolean', default: false },
    },
    allowPositionals: true,
  });

  const sub = positionals[0];  // init | check | transition | get | rebuild
  const changeDir = positionals[1];
  const arg = positionals[2];  // <to-state> for transition, <field> for get

  if (!changeDir) {
    console.error('Usage: ssf state <subcommand> <change-dir> [arg]');
    process.exit(2);
  }

  switch (sub) {
    case 'init': {
      const hash = computeArtifactsHash(changeDir);
      const ch = computeContractHash(changeDir);
      const state = readState(changeDir);
      state.artifacts_hash = hash;
      state.contract_hash = ch;
      state.last_transition = new Date().toISOString();
      writeState(changeDir, state);
      console.log(values.json ? JSON.stringify({ ok: true, hash }) : `State initialized. artifacts_hash: ${hash}`);
      break;
    }
    case 'check': {
      const state = readState(changeDir);
      const currentHash = computeArtifactsHash(changeDir);
      const consistent = state.artifacts_hash === currentHash;
      if (values.json) {
        console.log(JSON.stringify({
          consistent,
          stored_hash: state.artifacts_hash,
          current_hash: currentHash,
          state: state.state,
        }));
      } else {
        console.log(consistent ? 'State consistent with artifacts.' : 'State inconsistent — artifacts have changed since last transition.');
        console.log(`  State: ${state.state}, stored hash: ${state.artifacts_hash}`);
        console.log(`  Current hash: ${currentHash}`);
      }
      process.exit(consistent ? 0 : 1);
      break;
    }
    case 'transition': {
      const toState = arg;
      if (!toState) {
        console.error('Usage: ssf state transition <change-dir> <to-state>');
        process.exit(2);
      }
      const state = readState(changeDir);
      const fromState = state.state;
      state.state = toState;
      state.last_transition_from = fromState;
      state.last_transition_to = toState;
      state.last_transition = new Date().toISOString();
      writeState(changeDir, state);
      console.log(values.json
        ? JSON.stringify({ ok: true, from: fromState, to: toState })
        : `State transitioned: ${fromState} → ${toState}`);
      break;
    }
    case 'get': {
      const field = arg;
      if (!field) {
        console.error('Usage: ssf state get <change-dir> <field>');
        process.exit(2);
      }
      const state = readState(changeDir);
      const value = state[field];
      console.log(values.json ? JSON.stringify({ field, value }) : (value ?? 'null'));
      break;
    }
    case 'rebuild': {
      const state = rebuildState(changeDir, { computeArtifactsHash, computeContractHash });
      console.log(values.json ? JSON.stringify({ ok: true, state }) : `State rebuilt from artifacts. state: ${state.state}`);
      break;
    }
    default:
      console.error(`Unknown subcommand: ${sub}. Valid: init, check, transition, get, rebuild`);
      process.exit(2);
  }
}
```

**Files**: `Create: scripts/lib/cmd-state.mjs`

- [ ] **3.2 更新 ssf 入口 — 新增 state 子命令路由**

```javascript
// 在 scripts/spec-superflow.mjs 中新增 state 路由
// 在现有的 subcommand switch 中增加一个 case：

// case 'state':
//   const { run: runState } = await import('./lib/cmd-state.mjs');
//   await runState(positionals.slice(1));
//   break;
```

**Files**: `Modify: scripts/spec-superflow.mjs`

- [ ] **3.3 更新 workflow-orchestrator SKILL.md — 增加守护脚本调用**

在每个路由规则前增加守护脚本调用指令。以 `execution-governor` 路由为例：

```markdown
### Route to `execution-governor` when:

- **Guard check passes**: Run `node scripts/guard/guard.mjs check <dir> approved executing --json`
  - If exit code ≠ 0 → BLOCK. Report failures to user, do not route.
  - If exit code = 0 → proceed with routing.
- `execution-contract.md` exists
- the user has explicitly approved it
- the contract still matches the current planning artifacts
```

同样更新 `closure-archivist`、`bridge-contract`、`spec-forger`、`spec-explorer` 的路由规则。

**Files**: `Modify: skills/workflow-orchestrator/SKILL.md`

- [ ] **3.4 更新 bridge-contract SKILL.md — 生成 contract 后初始化状态文件**

在 bridge-contract SKILL.md 的完成步骤中增加：

```markdown
### After Contract Generation

After `execution-contract.md` is written and validated:

1. Run: `node scripts/spec-superflow.mjs state init <change-dir>`
2. This creates `.spec-superflow.yaml` with:
   - `artifacts_hash` — SHA256 of all 4 planning artifacts
   - `contract_hash` — SHA256 of the execution contract
   - `state: bridging`
3. The hash enables fast staleness detection in subsequent phases.
```

**Files**: `Modify: skills/bridge-contract/SKILL.md`

- [ ] **3.5 更新 closure-archivist SKILL.md — 验证完成后状态转换**

在 closure-archivist SKILL.md 的最终完成步骤中增加：

```markdown
### After Verification

After the verification report is generated and verdict is PASS or CONDITIONAL:

1. Run: `node scripts/spec-superflow.mjs state transition <change-dir> closing`
2. Run: `node scripts/spec-superflow.mjs state get <change-dir> test_result`
3. This updates `.spec-superflow.yaml` with `state: closing` and `test_result: pass|fail`
```

**Files**: `Modify: skills/closure-archivist/SKILL.md`

- [ ] **3.6 更新 execution-governor SKILL.md — 批次进度追踪**

在 execution-governor SKILL.md 的 `### Progress Ledger` 部分增加：

```markdown
After each batch completes and the progress ledger is updated:

1. Run: `node scripts/spec-superflow.mjs state get <change-dir> batches_completed`
2. Increment the value and update:
   - Run: `node scripts/spec-superflow.mjs state transition <change-dir> executing`
   - (This updates `batches_completed` and `last_transition` timestamp)
```

**Files**: `Modify: skills/execution-governor/SKILL.md`

- [ ] **3.7 验证端到端流程**

```bash
# 用 v0.5.0 自己的 change 目录测试完整流程
CHANGE_DIR="changes/v0.5.0-guard-and-state"

# 1. 初始化状态文件
node scripts/spec-superflow.mjs state init "$CHANGE_DIR"
node scripts/spec-superflow.mjs state get "$CHANGE_DIR" state
node scripts/spec-superflow.mjs state get "$CHANGE_DIR" artifacts_hash

# 2. 检查状态一致性
node scripts/spec-superflow.mjs state check "$CHANGE_DIR" --json

# 3. 守护脚本检查（specifying → bridging）
node scripts/guard/guard.mjs check "$CHANGE_DIR" specifying bridging --json

# 4. 状态转换
node scripts/spec-superflow.mjs state transition "$CHANGE_DIR" specifying
node scripts/spec-superflow.mjs state get "$CHANGE_DIR" state

# 5. 从工件重建
node scripts/spec-superflow.mjs state rebuild "$CHANGE_DIR"
node scripts/spec-superflow.mjs state check "$CHANGE_DIR" --json
```

**Expected**: 所有命令正常执行，状态正确流转，hash 一致

- [ ] **3.8 版本号同步**

使用 `ssf version` 命令同步所有 manifest 文件：

```bash
node scripts/spec-superflow.mjs version 0.5.0
```

**Files**: `Modify: package.json`, `Modify: .claude-plugin/plugin.json`, `Modify: .claude-plugin/marketplace.json`, `Modify: .cursor-plugin/plugin.json`, `Modify: gemini-extension.json`

- [ ] **3.9 更新 CHANGELOG.md**

```markdown
## [0.5.0] - 2026-06-29

### Added

- **Guard script system** — `scripts/guard/guard.mjs` provides dimension-based phase transition validation with 5 check dimensions (artifacts-exist, schema-valid, contract-fresh, tasks-complete, tests-passing). Exit code ≠ 0 blocks transitions. Reuses existing Validator engine for schema validation.
- **Lightweight state file** — `.spec-superflow.yaml` as a derived cache for fast context recovery (12 fields). Always rebuildable from artifacts via `ssf state rebuild`. Artifacts are the source of truth; state file is a performance optimization.
- **SHA256 hash acceleration** — `scripts/lib/hash.mjs` computes artifact hashes for O(1) staleness detection. Reduces staleness detection from ~3500 tokens (full content read) to ~50 tokens (single script call).
- **ssf state CLI** — New `state` subcommand with 5 operations: `init`, `check`, `transition`, `get`, `rebuild`.

### Changed

- **workflow-orchestrator** — Each routing rule now includes a guard script invocation step before allowing transitions.
- **bridge-contract** — Automatically runs `ssf state init` after contract generation.
- **closure-archivist** — Runs `ssf state transition` after verification completes.
- **execution-governor** — Updates `batches_completed` in state file after each batch.
```

**Files**: `Modify: CHANGELOG.md`

- [ ] **3.10 更新 README.md**

在 CLI 命令表中增加 `state` 子命令：

```markdown
| `ssf state init <dir>` | Initialize state file with artifact hashes |
| `ssf state check <dir>` | Verify state file consistency with artifacts |
| `ssf state transition <dir> <to>` | Record state transition |
| `ssf state get <dir> <field>` | Read a single state field |
| `ssf state rebuild <dir>` | Rebuild state file from artifacts |
```

**Files**: `Modify: README.md`

- [ ] **3.11 最终构建 + 测试**

```bash
npm run build
npm test
```

**Expected**: Build 成功，所有现有测试通过

- [ ] **3.12 Commit Batch 3**

```bash
git add -A
git commit -m "feat(v0.5.0): CLI integration + skill updates + docs for guard & state system"
```

## 4. Closeout

- [ ] **4.1 验证所有 contract obligations**

对照 design.md 确认所有设计决策已实现：

| # | Obligation | Status |
|---|-----------|--------|
| 1 | guard.mjs 5 个检查维度全部实现 | — |
| 2 | 8 状态转换矩阵正确映射 | — |
| 3 | .spec-superflow.yaml 12 字段 schema | — |
| 4 | hash.mjs SHA256 计算 + 比对 | — |
| 5 | ssf state 5 个子命令 | — |
| 6 | 4 个 skill 文件更新 | — |
| 7 | 过期检测 token 节省 98% | — |
| 8 | 状态文件派生数据，可从工件重建 | — |
| 9 | 守护脚本复用 Validator 引擎 | — |
| 10 | 零外部依赖 | — |

- [ ] **4.2 总结风险、follow-ups、归档准备**

风险：
- ESM/CJS 互操作：schema-valid.mjs 动态 import dist/index.js。已在设计阶段考虑，使用动态 `import()` 模式，与现有 CLI 脚本一致。
- 状态文件与工件不一致：工件优先。`ssf state check` 发现不一致时自动回退内容级检测。
- 守护脚本增加 Agent 调用负担：每次路由前只多一次 shell 命令（~50 tokens 输出），远低于当前内容级检测的 ~3500 tokens。

Follow-ups（v0.6.0）：
- 快速路径 hotfix/tweak（依赖 `workflow` 字段）
- 阶段防漂移 Rule（依赖 `ssf state get` 读取当前阶段）
- 决策点协议（依赖 `ssf state transition` 确保状态一致性）
- 守护脚本 hook 层硬拦截（配合防漂移 Rule 实现 PreToolUse 拦截）