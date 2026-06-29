// scripts/lib/cmd-inject.mjs — ssf inject: generate phase-guard.md and install to .claude/always/
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, basename } from 'node:path';
import { parseArgs } from 'node:util';
import { readState } from './state-loader.mjs';

const PHASE_TEMPLATES = {
  'exploring': `# Phase Guard: {{change_name}}

**当前阶段**: {{state}} | **工作流**: {{workflow}}

## ✅ 允许操作
- 澄清需求、比较方案
- 与用户讨论 scope 和 capabilities

## ⛔ 禁止操作
- 创建规划工件（proposal.md, specs/, design.md, tasks.md）
- 执行实现代码
- 修改 execution-contract.md

## 🔔 决策点
- DP-1: 需求确认 — 进入 specifying 前需用户确认 scope`,

  'specifying': `# Phase Guard: {{change_name}}

**当前阶段**: {{state}} | **工作流**: {{workflow}}

## ✅ 允许操作
- 创建/修改 proposal.md
- 创建/修改 specs/ 目录中的规格文件
- 创建/修改 design.md
- 创建/修改 tasks.md

## ⛔ 禁止操作
- 修改 execution-contract.md
- 执行实现代码
- 修改已批准的 specs（需先回退状态）

## 🔔 决策点
- DP-2: 工件审查 — 完成后需用户审查所有工件`,

  'bridging': `# Phase Guard: {{change_name}}

**当前阶段**: {{state}} | **工作流**: {{workflow}}

## ✅ 允许操作
- 生成/修改 execution-contract.md
- 运行 ssf validate 验证工件

## ⛔ 禁止操作
- 执行实现代码
- 修改 proposal.md, specs/, design.md, tasks.md（需先回退到 specifying）

## 🔔 决策点
- DP-3: 契约批准 — 用户必须明确批准 execution-contract.md（硬门禁）`,

  'approved': `# Phase Guard: {{change_name}}

**当前阶段**: {{state}} | **工作流**: {{workflow}}

## ✅ 允许操作
- 选择执行模式（TDD 或 SDD）
- 准备执行环境

## ⛔ 禁止操作
- 修改 execution-contract.md（需回退到 bridging）
- 修改 proposal.md, specs/, design.md, tasks.md

## 🔔 决策点
- DP-4: 执行模式选择 — 用户选择 TDD 或 SDD`,

  'approved-for-build': `# Phase Guard: {{change_name}}

**当前阶段**: {{state}} | **工作流**: {{workflow}}

## ✅ 允许操作
- 选择执行模式（TDD 或 SDD）
- 准备执行环境

## ⛔ 禁止操作
- 修改 execution-contract.md（需回退到 bridging）
- 修改 proposal.md, specs/, design.md, tasks.md

## 🔔 决策点
- DP-4: 执行模式选择 — 用户选择 TDD 或 SDD`,

  'executing': `# Phase Guard: {{change_name}}

**当前阶段**: {{state}} | **工作流**: {{workflow}}

## ✅ 允许操作
- 按 execution-contract.md 执行任务
- 运行测试
- 提交代码（按 batch 提交）

## ⛔ 禁止操作
- 修改 proposal.md, specs/, design.md（需先回退到 specifying）
- 修改 execution-contract.md（需先回退到 bridging）
- 跳过测试步骤

## 🔔 决策点
- DP-5: 调试升级 — 3+ 修复失败后需用户决定`,

  'debugging': `# Phase Guard: {{change_name}}

**当前阶段**: {{state}} | **工作流**: {{workflow}}

## ✅ 允许操作
- 分析根因（4 阶段根因分析）
- 修复 bug（TDD 修复循环）
- 返回 executing 状态

## ⛔ 禁止操作
- 修改 proposal.md, specs/, design.md
- 开始新任务
- 跳过根因分析直接修复`,

  'closing': `# Phase Guard: {{change_name}}

**当前阶段**: {{state}} | **工作流**: {{workflow}}

## ✅ 允许操作
- 运行验证（三维验证）
- 归档变更
- 合并 delta specs

## ⛔ 禁止操作
- 修改 execution-contract.md
- 执行新任务
- 修改 proposal.md, specs/, design.md

## 🔔 决策点
- DP-6: 验证失败 — 验证未通过时需用户决定
- DP-7: 归档确认 — 需用户确认归档`,

  'abandoned': `# Phase Guard: {{change_name}}

**当前阶段**: {{state}} | **工作流**: {{workflow}}

## ⛔ 终止状态
- 此变更已放弃，不允许任何进一步操作
- 不得合并 delta specs
- 不得从 abandoned 状态转换`,
};

function generatePhaseGuard(state) {
  const template = PHASE_TEMPLATES[state.state] || PHASE_TEMPLATES['exploring'];
  return template
    .replace(/\{\{change_name\}\}/g, state.change_name || 'unknown')
    .replace(/\{\{state\}\}/g, state.state || 'exploring')
    .replace(/\{\{workflow\}\}/g, state.workflow || 'full');
}

function installRule(content, projectRoot) {
  const alwaysDir = join(projectRoot, '.claude', 'always');
  mkdirSync(alwaysDir, { recursive: true });
  writeFileSync(join(alwaysDir, 'phase-guard.md'), content);
}

export async function run(args) {
  const { values, positionals } = parseArgs({
    args,
    options: { json: { type: 'boolean', default: false } },
    allowPositionals: true,
  });

  const changeDir = positionals[0];
  if (!changeDir) {
    console.error('Usage: ssf inject <change-dir> [--json]');
    process.exit(2);
  }

  // Read state (graceful fallback if missing)
  const stateFile = join(changeDir, '.spec-superflow.yaml');
  if (!existsSync(stateFile)) {
    if (!values.json) console.log(`⚠️ No .spec-superflow.yaml found in ${changeDir}, using defaults`);
  }
  const state = readState(changeDir);

  // Generate phase-guard.md
  const content = generatePhaseGuard(state);

  // Write to rules/ directory
  const rulesDir = 'rules';
  mkdirSync(rulesDir, { recursive: true });
  writeFileSync(join(rulesDir, 'phase-guard.md'), content);

  // Install to .claude/always/
  installRule(content, process.cwd());

  if (values.json) {
    console.log(JSON.stringify({ ok: true, state: state.state, workflow: state.workflow, change_name: state.change_name }));
  } else {
    console.log(`✅ Generated rules/phase-guard.md`);
    console.log(`✅ Installed to .claude/always/phase-guard.md`);
    console.log(`   Change: ${state.change_name} | State: ${state.state} | Workflow: ${state.workflow}`);
  }
}
