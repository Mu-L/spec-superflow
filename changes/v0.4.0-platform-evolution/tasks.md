# spec-superflow v0.4.0 Platform Evolution — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform spec-superflow from a pure-skill workflow into a configurable, CLI-operable platform with multi-language support, while maintaining zero npm dependencies.

**Architecture:** Three-layer design — (1) JSON config system for artifact customization, (2) CLI toolchain with 6 subcommands via `node:util.parseArgs`, (3) engine extensions including a multi-language tokenizer, conflict detection, and skill updates for worktree isolation.

**Tech Stack:** TypeScript (ES2022 + NodeNext + strict), Node 22 native test runner, ESM scripts (.mjs), zero external npm dependencies.

## Global Constraints

- Zero external npm dependencies (only `typescript` as devDependency)
- Node >= 22 required
- Pure regex parsing — no Zod or runtime validation libraries
- `dist/` is compiled output, committed to repo
- Tests import from `dist/index.js`, always run `npm run build` before `npm test`
- Backward compatible: `spec-superflow.config.json` absence = v0.3.0 behavior
- All manifest versions must stay in sync (package.json, plugin.json, marketplace.json, cursor-plugin, gemini-extension)
- `package.json` has `"type": "module"` — all `.js` files are ESM

## File Structure

### New Files (10)

| File | Responsibility |
|------|---------------|
| `src/validation/tokenizer.ts` | Multi-language tokenizer (English stemmer + Chinese CJK tokenizer + auto-detect) |
| `scripts/spec-superflow.mjs` | CLI entry point — parses subcommand, dispatches to cmd modules |
| `scripts/lib/config-loader.mjs` | JSON config loading + deep merge with built-in defaults |
| `scripts/lib/cmd-list.mjs` | `ssf list` — scan changes/ and report status |
| `scripts/lib/cmd-validate.mjs` | `ssf validate <dir>` — validate artifacts via Validator |
| `scripts/lib/cmd-doctor.mjs` | `ssf doctor` — health checks (version sync, hooks, skills, docs) |
| `scripts/lib/cmd-version.mjs` | `ssf version <semver>` — sync version to all manifests |
| `scripts/lib/cmd-sync.mjs` | `ssf sync <change-dir>` — delta spec merge with conflict detection |
| `scripts/lib/cmd-config.mjs` | `ssf config` — display/modify config |
| `scripts/get-config` | Bash helper for SKILL.md config queries at runtime |

### Modified Files (14)

| File | Change |
|------|--------|
| `src/validation/types.ts` | Add `ConflictReport`, `SyncConflict` types |
| `src/validation/constants.ts` | Add conflict-related message constants |
| `src/validation/validator.ts` | Refactor to use tokenizer, add `detectSyncConflicts()`, add optional `config` param to `validateImplementation()` |
| `src/index.ts` | Export tokenizer + conflict types |
| `tests/e2e.test.ts` | Add tokenizer tests (3) + conflict detection tests (2) + Chinese verification tests (2) |
| `package.json` | Add `bin` field |
| `skills/execution-governor/SKILL.md` | Add worktree isolation section + config check |
| `skills/spec-syncer/SKILL.md` | Add conflict detection workflow |
| `skills/workflow-orchestrator/SKILL.md` | Add config-aware routing |
| `skills/spec-forger/SKILL.md` | Add config check for artifact order/skip |
| `.claude-plugin/plugin.json` | Bump version to 0.4.0 |
| `.claude-plugin/marketplace.json` | Bump version to 0.4.0 |
| `.cursor-plugin/plugin.json` | Bump version to 0.4.0 |
| `gemini-extension.json` | Bump version to 0.4.0 |

---

### Task 1: Multi-language Tokenizer

**Files:**
- Create: `src/validation/tokenizer.ts`
- Test: `tests/e2e.test.ts` (add tokenizer describe block)

**Interfaces:**
- Consumes: nothing (standalone module)
- Produces: `tokenize(text: string, language?: 'auto' | 'en' | 'zh'): Set<string>` and `detectLanguage(text: string): 'en' | 'zh' | 'mixed'` — later tasks (Task 3) will import these to replace inline stemming in validator.ts

- [ ] **Step 1: Write failing tests for English tokenizer**

Append to `tests/e2e.test.ts`:

```typescript
import { tokenize, detectLanguage } from '../dist/index.js';

describe('tokenize', () => {
  it('tokenizes English text with stemming', () => {
    const tokens = tokenize('Rate limiting middleware implementation', 'en');
    // "limiting" → stem "limit", "implementation" → stem "implement"
    assert.ok(tokens.has('limit'), `Expected "limit" in tokens: ${[...tokens].join(', ')}`);
    assert.ok(tokens.has('rate'), `Expected "rate" in tokens: ${[...tokens].join(', ')}`);
    assert.ok(tokens.has('middleware'), `Expected "middleware" in tokens: ${[...tokens].join(', ')}`);
    assert.ok(tokens.has('implement'), `Expected "implement" in tokens: ${[...tokens].join(', ')}`);
  });

  it('tokenizes Chinese text with CJK extraction', () => {
    const tokens = tokenize('速率限制模块必须支持令牌桶算法', 'zh');
    // Should extract CJK character sequences and sliding window tokens
    assert.ok(tokens.size > 0, 'Expected non-empty token set for Chinese text');
    // 2-char sliding window: "速率", "率限", "限制", "制模", "模块", etc.
    assert.ok(tokens.has('速率'), `Expected "速率" in tokens: ${[...tokens].join(', ')}`);
    assert.ok(tokens.has('限制'), `Expected "限制" in tokens: ${[...tokens].join(', ')}`);
    assert.ok(tokens.has('令牌'), `Expected "令牌" in tokens: ${[...tokens].join(', ')}`);
  });

  it('auto-detects language from text content', () => {
    assert.equal(detectLanguage('Rate limiting middleware implementation'), 'en');
    assert.equal(detectLanguage('速率限制模块必须支持令牌桶算法'), 'zh');
    // Mixed content: Chinese sentence with English API name
    const mixed = detectLanguage('使用 Redis 实现速率限制模块的令牌桶算法');
    assert.ok(['zh', 'mixed'].includes(mixed), `Expected zh or mixed, got: ${mixed}`);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run build && npm test 2>&1 | tail -20`
Expected: FAIL — `tokenize` and `detectLanguage` are not exported from `dist/index.js`

- [ ] **Step 3: Implement tokenizer.ts**

Create `src/validation/tokenizer.ts`:

```typescript
// English stop words
const EN_STOP_WORDS = new Set([
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'shall',
  'should', 'may', 'might', 'can', 'could', 'of', 'in', 'to', 'for',
  'with', 'on', 'at', 'by', 'from', 'as', 'into', 'through', 'during',
  'before', 'after', 'above', 'below', 'between', 'out', 'off', 'over',
  'under', 'again', 'further', 'then', 'once',
]);

// Chinese stop words
const ZH_STOP_WORDS = new Set([
  '的', '了', '在', '是', '我', '有', '和', '就', '不', '人', '都',
  '一', '一个', '上', '也', '很', '到', '说', '要', '去', '你', '会',
  '着', '没有', '看', '好', '自己', '这',
]);

// CJK Unicode ranges
const CJK_REGEX = /[一-鿿㐀-䶿]/;
const CJK_GLOBAL = /[一-鿿㐀-䶿]/g;

/**
 * Lightweight English stemmer.
 * Strips common suffixes (-ing, -er, -ed, -s, -tion, etc.)
 */
function stemEnglish(word: string): string {
  const w = word.toLowerCase();
  if (w.length <= 3) return w;
  const suffixes: Array<[string, number]> = [
    ['ation', 3], ['tion', 3], ['ness', 3], ['ment', 3],
    ['ings', 3], ['ally', 3],
    ['ing', 3], ['ier', 3], ['ied', 3], ['ies', 3],
    ['ted', 3], ['ned', 3], ['red', 3], ['sed', 3], ['led', 3],
    ['ped', 3], ['ded', 3], ['ved', 3], ['wed', 3], ['xed', 3],
    ['zed', 3], ['ced', 3], ['ged', 3], ['ked', 3],
    ['ers', 3], ['ors', 3],
    ['ary', 3], ['ory', 3], ['ity', 3], ['ism', 3], ['ist', 3],
    ['ent', 3], ['ant', 3], ['ous', 3], ['ive', 3], ['ful', 3],
    ['ly', 3], ['ed', 3], ['er', 3], ['es', 3],
    ['al', 3], ['en', 3], ['ty', 3], ['or', 3], ['ar', 3],
    ['ry', 3], ['ic', 3], ['id', 3],
  ];
  for (const [suffix, minRoot] of suffixes) {
    if (w.endsWith(suffix) && w.length - suffix.length >= minRoot) {
      return w.slice(0, -suffix.length);
    }
  }
  if (w.endsWith('s') && w.length > 4) return w.slice(0, -1);
  return w;
}

function tokenizeEnglish(text: string): Set<string> {
  const tokens = new Set<string>();
  const words = text.toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length > 0);
  for (const word of words) {
    if (EN_STOP_WORDS.has(word)) continue;
    if (word.length <= 3) continue;
    tokens.add(stemEnglish(word));
  }
  return tokens;
}

function tokenizeChinese(text: string): Set<string> {
  const tokens = new Set<string>();

  // Split on Chinese punctuation
  const segments = text.split(/[，。！？；：、""''（）【】《》\s]+/).filter(s => s.length > 0);

  for (const segment of segments) {
    // Extract CJK character sequences
    let cjkRun = '';
    for (const char of segment) {
      if (CJK_REGEX.test(char)) {
        cjkRun += char;
      } else {
        // Flush CJK run
        if (cjkRun.length >= 2) {
          addChineseTokens(cjkRun, tokens);
        }
        cjkRun = '';
        // Extract ASCII words from mixed content
        if (/[a-zA-Z0-9]/.test(char)) {
          // accumulate ascii — handled below
        }
      }
    }
    if (cjkRun.length >= 2) {
      addChineseTokens(cjkRun, tokens);
    }

    // Also extract ASCII words from mixed segments
    const asciiWords = segment.match(/[a-zA-Z][a-zA-Z0-9]*/g);
    if (asciiWords) {
      for (const word of asciiWords) {
        const lower = word.toLowerCase();
        if (lower.length > 3 && !EN_STOP_WORDS.has(lower)) {
          tokens.add(stemEnglish(lower));
        }
      }
    }
  }

  return tokens;
}

function addChineseTokens(cjkRun: string, tokens: Set<string>): void {
  // Filter stop words — check if entire run is a stop word
  if (ZH_STOP_WORDS.has(cjkRun)) return;

  // Add the full CJK run as a token
  tokens.add(cjkRun);

  // Add 2-character sliding window tokens
  for (let i = 0; i < cjkRun.length - 1; i++) {
    const bigram = cjkRun.slice(i, i + 2);
    if (!ZH_STOP_WORDS.has(bigram)) {
      tokens.add(bigram);
    }
  }

  // Add 3-character sliding window tokens (for compound words like 令牌桶)
  for (let i = 0; i < cjkRun.length - 2; i++) {
    const trigram = cjkRun.slice(i, i + 3);
    if (!ZH_STOP_WORDS.has(trigram)) {
      tokens.add(trigram);
    }
  }
}

/**
 * Detect the primary language of a text.
 */
export function detectLanguage(text: string): 'en' | 'zh' | 'mixed' {
  const cjkMatches = text.match(CJK_GLOBAL);
  const cjkCount = cjkMatches ? cjkMatches.length : 0;
  const totalChars = text.replace(/\s/g, '').length;
  if (totalChars === 0) return 'en';

  const cjkRatio = cjkCount / totalChars;
  const hasAsciiWords = /[a-zA-Z]{3,}/.test(text);

  if (cjkRatio > 0.3 && hasAsciiWords) return 'mixed';
  if (cjkRatio > 0.3) return 'zh';
  return 'en';
}

/**
 * Tokenize text for verification matching.
 * Supports English (stemming), Chinese (CJK sliding window), and auto-detection.
 */
export function tokenize(text: string, language?: 'auto' | 'en' | 'zh'): Set<string> {
  const lang = language === 'auto' || !language ? detectLanguage(text) : language;

  switch (lang) {
    case 'en':
      return tokenizeEnglish(text);
    case 'zh':
      return tokenizeChinese(text);
    case 'mixed': {
      const enTokens = tokenizeEnglish(text);
      const zhTokens = tokenizeChinese(text);
      return new Set([...enTokens, ...zhTokens]);
    }
    default:
      return tokenizeEnglish(text);
  }
}
```

- [ ] **Step 4: Export tokenizer from index.ts**

Add to `src/index.ts` (append these lines):

```typescript
export { tokenize, detectLanguage } from './validation/tokenizer.js';
```

- [ ] **Step 5: Build and run tests**

Run: `npm run build && npm test 2>&1 | tail -30`
Expected: All tokenize tests PASS (3 new tests). Existing 13 tests still PASS (total: 16).

- [ ] **Step 6: Commit**

```bash
git add src/validation/tokenizer.ts src/index.ts tests/e2e.test.ts
git commit -m "feat: add multi-language tokenizer (English stemmer + Chinese CJK)"
```

---

### Task 2: Config System

**Files:**
- Create: `scripts/lib/config-loader.mjs`
- Create: `scripts/get-config`
- Test: `scripts/spec-superflow.mjs config` (manual verification after Task 4)

**Interfaces:**
- Consumes: nothing (standalone module)
- Produces: `loadConfig(projectRoot: string): object` — returns merged config with defaults. Later tasks (Task 4+) import this.

- [ ] **Step 1: Implement config-loader.mjs**

Create `scripts/lib/config-loader.mjs`:

```javascript
// Config loader for spec-superflow
// Loads spec-superflow.config.json and merges with built-in defaults.
// Lookup order: (1) projectRoot, (2) git root, (3) home directory.

import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { execSync } from 'node:child_process';

const DEFAULTS = {
  artifacts: {
    order: ['proposal', 'specs', 'design', 'tasks', 'execution-contract'],
    skip: [],
  },
  execution: {
    inlineThreshold: 3,
    abandonmentReasonMinLength: 50,
    defaultLanguage: 'auto',
  },
  verification: {
    language: 'auto',
  },
};

function deepMerge(target, source) {
  const result = { ...target };
  for (const key of Object.keys(source)) {
    if (
      source[key] &&
      typeof source[key] === 'object' &&
      !Array.isArray(source[key]) &&
      target[key] &&
      typeof target[key] === 'object' &&
      !Array.isArray(target[key])
    ) {
      result[key] = deepMerge(target[key], source[key]);
    } else {
      result[key] = source[key];
    }
  }
  return result;
}

function findConfigFile(startDir) {
  // 1. Check startDir
  const direct = join(startDir, 'spec-superflow.config.json');
  if (existsSync(direct)) return direct;

  // 2. Check git root
  try {
    const gitRoot = execSync('git rev-parse --show-toplevel', {
      cwd: startDir,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
    const gitPath = join(gitRoot, 'spec-superflow.config.json');
    if (existsSync(gitPath)) return gitPath;
  } catch {
    // Not a git repo — skip
  }

  // 3. Check home directory
  const homePath = join(process.env.HOME || '', 'spec-superflow.config.json');
  if (existsSync(homePath)) return homePath;

  return null;
}

export function loadConfig(projectRoot) {
  const configPath = findConfigFile(projectRoot || process.cwd());
  if (!configPath) return { ...DEFAULTS };

  try {
    const raw = readFileSync(configPath, 'utf-8');
    const userConfig = JSON.parse(raw);
    return deepMerge(DEFAULTS, userConfig);
  } catch {
    return { ...DEFAULTS };
  }
}

export function getDefaults() {
  return { ...DEFAULTS };
}
```

- [ ] **Step 2: Implement get-config bash helper**

Create `scripts/get-config`:

```bash
#!/usr/bin/env bash
# Read a config field from spec-superflow.config.json
# Usage: get-config <field-path>
# Example: get-config execution.inlineThreshold → outputs "3"
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
field_path="${1:-}"

if [ -z "$field_path" ]; then
  echo "Usage: get-config <field-path>" >&2
  echo "Example: get-config execution.inlineThreshold" >&2
  exit 2
fi

# Use node to load config and extract field
node -e "
import { loadConfig } from '${SCRIPT_DIR}/lib/config-loader.mjs';
const config = loadConfig(process.cwd());
const parts = '${field_path}'.split('.');
let val = config;
for (const p of parts) {
  if (val === undefined || val === null) { val = undefined; break; }
  val = val[p];
}
if (val !== undefined) {
  process.stdout.write(typeof val === 'object' ? JSON.stringify(val) : String(val));
} else {
  process.exit(1);
}
" 2>/dev/null || exit 1
```

Run: `chmod +x scripts/get-config`

- [ ] **Step 3: Manual verification**

Run: `bash scripts/get-config execution.inlineThreshold`
Expected: `3` (default value, since no config file exists)

Run: `bash scripts/get-config verification.language`
Expected: `auto`

- [ ] **Step 4: Commit**

```bash
git add scripts/lib/config-loader.mjs scripts/get-config
git commit -m "feat: add config system (JSON config loader + bash helper)"
```

---

### Task 3: Refactor validateImplementation() to use Tokenizer + Add Conflict Detection

**Files:**
- Modify: `src/validation/validator.ts:454-543` (validateImplementation method)
- Modify: `src/validation/types.ts` (add ConflictReport, SyncConflict)
- Modify: `src/validation/constants.ts` (add conflict messages)
- Modify: `src/index.ts` (export new types)
- Test: `tests/e2e.test.ts` (add Chinese verification tests + conflict tests)

**Interfaces:**
- Consumes: `tokenize()` and `detectLanguage()` from Task 1; `parseDeltaSpec()`, `normalizeRequirementName()` from existing parsing module; `DeltaPlan`, `RequirementBlock` types
- Produces: updated `validateImplementation()` signature (backward-compatible, optional `config` param), new `detectSyncConflicts()` method on Validator class

- [ ] **Step 1: Write failing tests for Chinese verification and conflict detection**

Append to `tests/e2e.test.ts` (inside the existing `Validator.validateImplementation` describe block):

```typescript
  it('verifies Chinese spec content with Chinese tokenizer', () => {
    const report = validator.validateImplementation(
      '新增速率限制模块，使用令牌桶算法实现 src/middleware/rate-limit.ts',
      '### Requirement: 速率限制\n系统必须实现令牌桶算法进行速率限制。\n#### Scenario: 正常请求\n- **WHEN** 请求频率在限制内\n- **THEN** 系统必须正常处理',
      '## Decisions\n### Decision 1\n- Choice: 令牌桶算法\n- Rationale: 平滑限流'
    );
    // Both spec and diff are Chinese — should detect and use zh tokenizer
    const completeness = report.dimensions.find(d => d.name === 'Completeness');
    assert.ok(completeness, 'Missing Completeness dimension');
    // "速率限制" tokens should match diff content
    assert.equal(completeness!.status, 'PASS', `Expected PASS but got ${completeness!.status}: ${JSON.stringify(completeness!.findings)}`);
  });

  it('detects missing requirement in Chinese spec (Completeness FAIL)', () => {
    const report = validator.validateImplementation(
      '新增日志模块 src/utils/logger.ts',
      '### Requirement: 速率限制\n系统必须实现令牌桶算法进行速率限制。\n\n### Requirement: 日志记录\n系统必须记录所有API请求日志。',
      '## Decisions\n### Decision 1\n- Choice: 令牌桶算法\n- Rationale: 平滑限流'
    );
    const completeness = report.dimensions.find(d => d.name === 'Completeness');
    assert.equal(completeness!.status, 'FAIL');
    // "日志记录" should be found, but "速率限制" should be missing from diff
    assert.ok(completeness!.findings.some(f => f.message.includes('速率限制')));
  });
```

Append new describe block for conflict detection:

```typescript
describe('Validator.detectSyncConflicts', () => {
  const validator = new Validator();

  it('returns no conflicts when delta specs modify different requirements', () => {
    const deltas = [
      {
        changeName: 'change-a',
        content: '## MODIFIED Requirements\n### Requirement: Auth middleware\nThe system SHALL use JWT.\n#### Scenario: test\n- **WHEN** x\n- **THEN** y',
      },
      {
        changeName: 'change-b',
        content: '## MODIFIED Requirements\n### Requirement: Rate limiting\nThe system SHALL limit to 100 req/min.\n#### Scenario: test\n- **WHEN** x\n- **THEN** y',
      },
    ];
    const report = validator.detectSyncConflicts(deltas);
    assert.equal(report.hasConflicts, false);
    assert.equal(report.conflicts.length, 0);
  });

  it('detects conflicts when two changes modify the same requirement', () => {
    const deltas = [
      {
        changeName: 'change-a',
        content: '## MODIFIED Requirements\n### Requirement: Auth middleware\nThe system SHALL use JWT tokens.\n#### Scenario: test\n- **WHEN** x\n- **THEN** y',
      },
      {
        changeName: 'change-b',
        content: '## MODIFIED Requirements\n### Requirement: Auth middleware\nThe system SHALL use session cookies.\n#### Scenario: test\n- **WHEN** x\n- **THEN** y',
      },
    ];
    const report = validator.detectSyncConflicts(deltas);
    assert.equal(report.hasConflicts, true);
    assert.equal(report.conflicts.length, 1);
    assert.equal(report.conflicts[0].requirement, 'Auth middleware');
    assert.ok(report.conflicts[0].changes.includes('change-a'));
    assert.ok(report.conflicts[0].changes.includes('change-b'));
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run build && npm test 2>&1 | tail -20`
Expected: FAIL — Chinese verification tests fail (validator still uses inline stemmer, not tokenizer), conflict tests fail (`detectSyncConflicts` not defined)

- [ ] **Step 3: Add ConflictReport types to types.ts**

Append to `src/validation/types.ts`:

```typescript
export interface SyncConflict {
  requirement: string;
  spec: string;
  changes: string[];
}

export interface ConflictReport {
  hasConflicts: boolean;
  conflicts: SyncConflict[];
}
```

- [ ] **Step 4: Add conflict message constants**

Append to `VERIFICATION_MESSAGES` in `src/validation/constants.ts`:

```typescript
  CONFLICT_DETECTED: 'Requirement "{requirement}" is modified by multiple changes: {changes}',
```

- [ ] **Step 5: Refactor validateImplementation() to use tokenizer**

In `src/validation/validator.ts`, replace the `validateImplementation` method (lines 454-543). Add import at top of file:

```typescript
import { tokenize } from './tokenizer.js';
```

Replace the method body:

```typescript
  validateImplementation(
    diffSummary: string,
    specContent: string,
    designContent: string,
    config?: { verification?: { language?: string } }
  ): VerificationReport {
    const dimensions: VerificationReport['dimensions'] = [];
    const language = (config?.verification?.language as 'auto' | 'en' | 'zh') || 'auto';

    // --- Completeness ---
    const completenessFindings: VerificationFinding[] = [];
    const requirements = this.extractRequirementNames(specContent);
    const diffTokens = tokenize(diffSummary, language);
    for (const req of requirements) {
      const reqTokens = tokenize(req, language);
      // Requirement is covered when every token from the requirement name
      // appears somewhere in the diff tokens
      const allPresent = reqTokens.size === 0 || [...reqTokens].every(t => diffTokens.has(t));
      if (!allPresent) {
        completenessFindings.push({
          level: 'CRITICAL',
          dimension: 'Completeness',
          message: VERIFICATION_MESSAGES.COMPLETENESS_MISSING_REQUIREMENT.replace('{requirement}', req),
        });
      }
    }
    dimensions.push({
      name: 'Completeness',
      status: completenessFindings.some(f => f.level === 'CRITICAL') ? 'FAIL' : completenessFindings.length > 0 ? 'WARN' : 'PASS',
      findings: completenessFindings,
    });

    // --- Correctness ---
    const correctnessFindings: VerificationFinding[] = [];
    const placeholderPatterns = ['TODO', 'FIXME', 'HACK', 'XXX', 'PLACEHOLDER'];
    for (const pattern of placeholderPatterns) {
      if (diffSummary.includes(pattern)) {
        correctnessFindings.push({
          level: 'CRITICAL',
          dimension: 'Correctness',
          message: VERIFICATION_MESSAGES.VERIFICATION_PLACEHOLDER_DETECTED,
        });
        break;
      }
    }
    dimensions.push({
      name: 'Correctness',
      status: correctnessFindings.some(f => f.level === 'CRITICAL') ? 'FAIL' : correctnessFindings.length > 0 ? 'WARN' : 'PASS',
      findings: correctnessFindings,
    });

    // --- Coherence ---
    const coherenceFindings: VerificationFinding[] = [];
    const decisionNames = this.extractDecisionNames(designContent);
    for (const name of decisionNames) {
      if (name.length <= 3) continue;
      const decisionTokens = tokenize(name, language);
      const diffTokensForCoherence = tokenize(diffSummary, language);
      const allPresent = decisionTokens.size === 0 || [...decisionTokens].every(t => diffTokensForCoherence.has(t));
      if (!allPresent) {
        coherenceFindings.push({
          level: 'IMPORTANT',
          dimension: 'Coherence',
          message: VERIFICATION_MESSAGES.COHERENCE_PATTERN_MISSING.replace('{pattern}', name),
        });
      }
    }
    dimensions.push({
      name: 'Coherence',
      status: coherenceFindings.some(f => f.level === 'CRITICAL') ? 'FAIL' : coherenceFindings.length > 0 ? 'WARN' : 'PASS',
      findings: coherenceFindings,
    });

    // --- Verdict ---
    const hasCritical = dimensions.some(d => d.status === 'FAIL');
    const hasWarning = dimensions.some(d => d.status === 'WARN');
    const verdict: VerificationReport['verdict'] = hasCritical ? 'FAIL' : hasWarning ? 'CONDITIONAL' : 'PASS';

    return { dimensions, verdict };
  }
```

- [ ] **Step 6: Add detectSyncConflicts() method to Validator class**

Append before `isValid()` method in `src/validation/validator.ts`:

```typescript
  detectSyncConflicts(deltaSpecs: Array<{ changeName: string; content: string }>): ConflictReport {
    // Build map: requirementName → [changeName, ...]
    const reqToChanges = new Map<string, string[]>();

    for (const { changeName, content } of deltaSpecs) {
      const plan = parseDeltaSpec(content);
      // Collect MODIFIED and RENAMED requirement names
      const names: string[] = [
        ...plan.modified.map(b => normalizeRequirementName(b.name)),
        ...plan.renamed.map(r => normalizeRequirementName(r.to)),
      ];
      for (const name of names) {
        const existing = reqToChanges.get(name) || [];
        existing.push(changeName);
        reqToChanges.set(name, existing);
      }
    }

    // Find conflicts: requirements modified by 2+ changes
    const conflicts: SyncConflict[] = [];
    for (const [requirement, changes] of reqToChanges) {
      if (changes.length >= 2) {
        conflicts.push({
          requirement,
          spec: requirement,
          changes,
        });
      }
    }

    return {
      hasConflicts: conflicts.length > 0,
      conflicts,
    };
  }
```

- [ ] **Step 7: Remove old inline stem() function from validator.ts**

Delete the `stem()` function (lines 56-81 in original validator.ts). It's now replaced by `tokenizer.ts`. Also remove the `fillerWords` set that was inline in the Coherence section — the tokenizer handles stop words internally.

- [ ] **Step 8: Export new types from index.ts**

Update `src/index.ts` — add to the types.ts export line:

```typescript
export type { ConflictReport, SyncConflict } from './validation/types.js';
```

- [ ] **Step 9: Build and run all tests**

Run: `npm run build && npm test`
Expected: All tests PASS — existing 13 + new tokenizer 3 + new verification 2 + new conflict 2 = 20 tests total.

- [ ] **Step 10: Commit**

```bash
git add src/validation/validator.ts src/validation/types.ts src/validation/constants.ts src/index.ts tests/e2e.test.ts
git commit -m "feat: refactor validateImplementation to use tokenizer, add detectSyncConflicts"
```

---

### Task 4: CLI Entry Point + list + validate + config Commands

**Files:**
- Create: `scripts/spec-superflow.mjs`
- Create: `scripts/lib/cmd-list.mjs`
- Create: `scripts/lib/cmd-validate.mjs`
- Create: `scripts/lib/cmd-config.mjs`
- Modify: `package.json` (add `bin` field)

**Interfaces:**
- Consumes: `loadConfig()` from `config-loader.mjs` (Task 2), `Validator` from `dist/index.js` (existing)
- Produces: CLI entry point with 3 working subcommands (`list`, `validate`, `config`)

- [ ] **Step 1: Add bin field to package.json**

Add to `package.json` (after `"types"` field):

```json
  "bin": {
    "ssf": "./scripts/spec-superflow.mjs",
    "spec-superflow": "./scripts/spec-superflow.mjs"
  },
```

- [ ] **Step 2: Create CLI entry point**

Create `scripts/spec-superflow.mjs`:

```javascript
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
```

Run: `chmod +x scripts/spec-superflow.mjs`

- [ ] **Step 3: Implement cmd-list.mjs**

Create `scripts/lib/cmd-list.mjs`:

```javascript
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
```

- [ ] **Step 4: Implement cmd-validate.mjs**

Create `scripts/lib/cmd-validate.mjs`:

```javascript
// ssf validate <dir> — validate artifacts in a change directory
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, basename, relative } from 'node:path';
import { loadConfig } from './config-loader.mjs';

async function getValidator() {
  const mod = await import('../../dist/index.js');
  return new mod.Validator(false);
}

function findFiles(dir, pattern) {
  const results = [];
  if (!existsSync(dir)) return results;
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) results.push(...findFiles(full, pattern));
    else if (st.isFile() && pattern.test(entry)) results.push(full);
  }
  return results;
}

function printReport(label, report) {
  console.log(`\n  📋 ${label}`);
  if (report.valid) {
    console.log(`     ✅ valid (${report.summary.errors} errors, ${report.summary.warnings} warnings, ${report.summary.info} info)`);
  } else {
    console.log(`     ❌ invalid (${report.summary.errors} errors, ${report.summary.warnings} warnings, ${report.summary.info} info)`);
  }
  for (const issue of report.issues) {
    const icon = issue.level === 'ERROR' ? '🔴' : issue.level === 'WARNING' ? '🟡' : '🔵';
    console.log(`     ${icon} [${issue.level}] ${issue.path}: ${issue.message}`);
  }
}

export async function run(args) {
  if (args.length < 1) {
    console.error('Usage: ssf validate <change-dir>');
    process.exit(2);
  }

  const changeDir = args[0];
  if (!existsSync(changeDir) || !statSync(changeDir).isDirectory()) {
    console.error(`Error: "${changeDir}" is not a valid directory`);
    process.exit(2);
  }

  const config = loadConfig(process.cwd());
  const changeName = basename(changeDir);
  const validator = await getValidator();

  console.log(`🔍 Validating: ${changeDir}`);
  console.log(`   Change: ${changeName}`);

  let hasErrors = false;

  // Validate proposal.md
  const proposalPath = join(changeDir, 'proposal.md');
  if (existsSync(proposalPath)) {
    const content = readFileSync(proposalPath, 'utf-8');
    const report = validator.validateChangeContent(changeName, content);
    printReport('proposal.md', report);
    if (!report.valid) hasErrors = true;
  }

  // Validate specs/*/spec.md
  const specsDir = join(changeDir, 'specs');
  if (existsSync(specsDir)) {
    const specFiles = findFiles(specsDir, /^spec\.md$/);
    for (const specFile of specFiles) {
      const content = readFileSync(specFile, 'utf-8');
      const report = validator.validateDeltaSpec(content);
      const rel = relative(changeDir, specFile);
      printReport(rel, report);
      if (!report.valid) hasErrors = true;
    }
  }

  console.log('');
  if (hasErrors) {
    console.log('❌ Validation failed with errors.');
    process.exit(1);
  } else {
    console.log('✅ All artifacts validated.');
    process.exit(0);
  }
}
```

- [ ] **Step 5: Implement cmd-config.mjs**

Create `scripts/lib/cmd-config.mjs`:

```javascript
// ssf config — display or modify configuration
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { loadConfig, getDefaults } from './config-loader.mjs';

export async function run(args) {
  const config = loadConfig(process.cwd());

  // No args → display full effective config
  if (args.length === 0) {
    console.log('Effective configuration:');
    console.log(JSON.stringify(config, null, 2));
    return;
  }

  // --get <path>
  if (args[0] === '--get' && args[1]) {
    const parts = args[1].split('.');
    let val = config;
    for (const p of parts) {
      if (val === undefined || val === null) { val = undefined; break; }
      val = val[p];
    }
    if (val !== undefined) {
      console.log(typeof val === 'object' ? JSON.stringify(val, null, 2) : val);
    } else {
      console.error(`Config path not found: ${args[1]}`);
      process.exit(1);
    }
    return;
  }

  // --set <path>=<value>
  if (args[0] === '--set' && args[1]) {
    const eqIdx = args[1].indexOf('=');
    if (eqIdx === -1) {
      console.error('Usage: ssf config --set <path>=<value>');
      process.exit(2);
    }
    const path = args[1].slice(0, eqIdx);
    const rawValue = args[1].slice(eqIdx + 1);
    // Parse value: try number, boolean, then string
    let value;
    if (rawValue === 'true') value = true;
    else if (rawValue === 'false') value = false;
    else if (/^\d+$/.test(rawValue)) value = parseInt(rawValue, 10);
    else value = rawValue;

    // Load existing config file or start from empty
    const configPath = join(process.cwd(), 'spec-superflow.config.json');
    let fileConfig = {};
    if (existsSync(configPath)) {
      fileConfig = JSON.parse(readFileSync(configPath, 'utf-8'));
    }

    // Set the nested value
    const parts = path.split('.');
    let target = fileConfig;
    for (let i = 0; i < parts.length - 1; i++) {
      if (!target[parts[i]] || typeof target[parts[i]] !== 'object') {
        target[parts[i]] = {};
      }
      target = target[parts[i]];
    }
    target[parts[parts.length - 1]] = value;

    writeFileSync(configPath, JSON.stringify(fileConfig, null, 2) + '\n');
    console.log(`Set ${path} = ${JSON.stringify(value)}`);
    return;
  }

  console.error('Usage: ssf config [--get <path>] [--set <path>=<value>]');
  process.exit(2);
}
```

- [ ] **Step 6: Manual verification of CLI**

Run: `node scripts/spec-superflow.mjs --help`
Expected: Help text with all 6 commands listed

Run: `node scripts/spec-superflow.mjs list`
Expected: Shows `v0.3.0-workflow-enhancements  [CLOSED]  5 specs`

Run: `node scripts/spec-superflow.mjs validate changes/v0.3.0-workflow-enhancements/`
Expected: `✅ All artifacts validated.`

Run: `node scripts/spec-superflow.mjs config`
Expected: Full default config JSON

Run: `node scripts/spec-superflow.mjs config --get execution.inlineThreshold`
Expected: `3`

- [ ] **Step 7: Commit**

```bash
git add scripts/spec-superflow.mjs scripts/lib/cmd-list.mjs scripts/lib/cmd-validate.mjs scripts/lib/cmd-config.mjs package.json
git commit -m "feat: add CLI entry point with list, validate, config commands"
```

---

### Task 5: CLI Commands (version + doctor + sync)

**Files:**
- Create: `scripts/lib/cmd-version.mjs`
- Create: `scripts/lib/cmd-doctor.mjs`
- Create: `scripts/lib/cmd-sync.mjs`

**Interfaces:**
- Consumes: `loadConfig()` from `config-loader.mjs`, `Validator` + `detectSyncConflicts` from `dist/index.js`, `parseDeltaSpec` from `dist/index.js`
- Produces: 3 additional CLI commands completing the toolchain

- [ ] **Step 1: Implement cmd-version.mjs**

Create `scripts/lib/cmd-version.mjs`:

```javascript
// ssf version <semver> — sync version to all manifest files
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const MANIFESTS = [
  { file: 'package.json', path: ['version'] },
  { file: '.claude-plugin/plugin.json', path: ['version'] },
  { file: '.claude-plugin/marketplace.json', path: ['plugins', '0', 'version'] },
  { file: '.cursor-plugin/plugin.json', path: ['version'] },
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
```

- [ ] **Step 2: Implement cmd-doctor.mjs**

Create `scripts/lib/cmd-doctor.mjs`:

```javascript
// ssf doctor — health check for spec-superflow installation and project
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { loadConfig } from './config-loader.mjs';

function readJsonIfExists(filePath) {
  if (!existsSync(filePath)) return null;
  try { return JSON.parse(readFileSync(filePath, 'utf-8')); } catch { return null; }
}

function checkVersionConsistency(root) {
  const files = [
    { name: 'package.json', path: ['version'] },
    { name: '.claude-plugin/plugin.json', path: ['version'] },
    { name: '.claude-plugin/marketplace.json', path: ['plugins', '0', 'version'] },
    { name: '.cursor-plugin/plugin.json', path: ['version'] },
    { name: 'gemini-extension.json', path: ['version'] },
  ];

  const versions = {};
  for (const f of files) {
    const data = readJsonIfExists(join(root, f.name));
    if (!data) { versions[f.name] = null; continue; }
    let val = data;
    for (const p of f.path) val = val?.[p];
    versions[f.name] = val || null;
  }

  const uniqueVersions = [...new Set(Object.values(versions).filter(Boolean))];
  const pkgVersion = versions['package.json'];

  if (uniqueVersions.length <= 1) {
    return { pass: true, message: `Version: ${pkgVersion} (consistent across ${Object.keys(versions).filter(k => versions[k]).length} manifests)` };
  }
  const mismatches = Object.entries(versions)
    .filter(([, v]) => v !== pkgVersion)
    .map(([name, v]) => `${name}=${v}`)
    .join(', ');
  return { pass: false, message: `Version mismatch: ${pkgVersion} (package.json) vs ${mismatches}` };
}

function checkHooks(root) {
  const hooksPath = join(root, 'hooks', 'hooks.json');
  if (!existsSync(hooksPath)) {
    return { pass: false, message: 'hooks/hooks.json not found' };
  }
  try {
    const hooks = JSON.parse(readFileSync(hooksPath, 'utf-8'));
    if (hooks.hooks && typeof hooks.hooks === 'object' && !Array.isArray(hooks.hooks)) {
      return { pass: true, message: 'valid format' };
    }
    return { pass: false, message: 'invalid format (expected record, got ' + typeof hooks.hooks + ')' };
  } catch (e) {
    return { pass: false, message: `parse error: ${e.message}` };
  }
}

function checkSkills(root) {
  const skillsDir = join(root, 'skills');
  if (!existsSync(skillsDir)) {
    return { pass: false, message: 'skills/ directory not found' };
  }
  const dirs = readdirSync(skillsDir).filter(f => {
    try { return statSync(join(skillsDir, f)).isDirectory(); } catch { return false; }
  });
  const withSkillMd = dirs.filter(d => existsSync(join(skillsDir, d, 'SKILL.md')));
  if (withSkillMd.length === dirs.length) {
    return { pass: true, message: `${dirs.length}/${dirs.length} present` };
  }
  const missing = dirs.filter(d => !withSkillMd.includes(d));
  return { pass: false, message: `${withSkillMd.length}/${dirs.length} present, missing SKILL.md: ${missing.join(', ')}` };
}

function checkDist(root) {
  const distDir = join(root, 'dist');
  if (!existsSync(distDir)) {
    return { pass: false, message: 'dist/ not found (run npm run build)' };
  }
  const indexJs = join(distDir, 'index.js');
  if (!existsSync(indexJs)) {
    return { pass: false, message: 'dist/index.js not found' };
  }
  return { pass: true, message: 'compiled' };
}

function checkNodeVersion() {
  const major = parseInt(process.version.slice(1).split('.')[0], 10);
  if (major >= 22) {
    return { pass: true, message: `${process.version}` };
  }
  return { pass: false, message: `${process.version} (requires >= 22)` };
}

function checkDocs(root) {
  const warnings = [];
  const pkg = readJsonIfExists(join(root, 'package.json'));
  if (!pkg) return { pass: true, message: 'skipped (no package.json)' };

  const pkgVersion = pkg.version;

  // Check CHANGELOG has current version
  const changelogPath = join(root, 'CHANGELOG.md');
  if (existsSync(changelogPath)) {
    const changelog = readFileSync(changelogPath, 'utf-8');
    if (!changelog.includes(`## [${pkgVersion}]`)) {
      warnings.push(`CHANGELOG.md missing entry for v${pkgVersion}`);
    }
  }

  // Check skills count in README
  const readmePath = join(root, 'README.md');
  if (existsSync(readmePath)) {
    const skillsDir = join(root, 'skills');
    if (existsSync(skillsDir)) {
      const actualSkills = readdirSync(skillsDir).filter(f => {
        try { return statSync(join(skillsDir, f)).isDirectory(); } catch { return false; }
      }).length;
      const readme = readFileSync(readmePath, 'utf-8');
      // Count table rows with skill references (heuristic: rows with `skill-name` pattern)
      const skillRefs = readme.match(/\| `[a-z-]+`/g) || [];
      if (skillRefs.length > 0 && skillRefs.length !== actualSkills) {
        warnings.push(`README lists ${skillRefs.length} skills, but skills/ has ${actualSkills}`);
      }
    }
  }

  if (warnings.length === 0) {
    return { pass: true, message: 'consistent' };
  }
  return { pass: false, message: warnings.join('; ') };
}

export async function run(args) {
  const root = process.cwd();
  const config = loadConfig(root);

  console.log('spec-superflow doctor:\n');

  const checks = [
    ['Version', checkVersionConsistency(root)],
    ['Hooks', checkHooks(root)],
    ['Skills', checkSkills(root)],
    ['dist/', checkDist(root)],
    ['Node.js', checkNodeVersion()],
    ['Docs', checkDocs(root)],
  ];

  // Config check
  const configPath = join(root, 'spec-superflow.config.json');
  if (existsSync(configPath)) {
    try {
      JSON.parse(readFileSync(configPath, 'utf-8'));
      checks.push(['Config', { pass: true, message: 'valid JSON' }]);
    } catch (e) {
      checks.push(['Config', { pass: false, message: `invalid JSON: ${e.message}` }]);
    }
  }

  let hasFailure = false;
  for (const [name, result] of checks) {
    const icon = result.pass ? '✅' : '⚠️ ';
    console.log(`  ${icon} ${name}: ${result.message}`);
    if (!result.pass) hasFailure = true;
  }

  console.log('');
  if (hasFailure) {
    console.log('⚠️  Some checks need attention.');
  } else {
    console.log('✅ All checks passed.');
  }
}
```

- [ ] **Step 3: Implement cmd-sync.mjs**

Create `scripts/lib/cmd-sync.mjs`:

```javascript
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
```

- [ ] **Step 4: Manual verification**

Run: `node scripts/spec-superflow.mjs doctor`
Expected: All checks pass (or warnings for cursor/gemini version lag)

Run: `node scripts/spec-superflow.mjs version 0.4.0 --dry-run`
Expected: Shows version diff for all 5 manifests without writing

Run: `node scripts/spec-superflow.mjs sync changes/v0.3.0-workflow-enhancements/`
Expected: Conflict check + sync report (may show already synced)

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/cmd-version.mjs scripts/lib/cmd-doctor.mjs scripts/lib/cmd-sync.mjs
git commit -m "feat: add CLI version, doctor, sync commands"
```

---

### Task 6: SKILL.md Updates (worktree + conflict + config awareness)

**Files:**
- Modify: `skills/execution-governor/SKILL.md`
- Modify: `skills/spec-syncer/SKILL.md`
- Modify: `skills/workflow-orchestrator/SKILL.md`
- Modify: `skills/spec-forger/SKILL.md`

**Interfaces:**
- Consumes: `scripts/get-config` bash helper (Task 2) for config queries
- Produces: Updated skill instructions with worktree isolation, conflict detection, and config-aware behavior

- [ ] **Step 1: Add worktree isolation to execution-governor**

Add this section to `skills/execution-governor/SKILL.md`, after the "Pre-Flight Plan Review" section:

```markdown
### Worktree Isolation (Optional, Recommended)

Before starting execution, check the current branch:

1. Run: `git branch --show-current`
2. If on `main` or `master` branch:
   - Create worktree: `git worktree add ../<project>-<change-name> -b <change-name>`
   - Execute all tasks in the worktree directory
3. If already on a feature branch → proceed normally
4. After all batches complete, remind the user:
   - "Worktree ready for merge. Suggested commands:"
   - `git merge <change-name>`
   - `git worktree remove <worktree-path>`

If `git worktree` is unavailable (not a git repo, or git not installed) → silently skip, continue in current directory.
```

Also add a Config Check section at the top:

```markdown
### Config Check

Before determining execution mode, check the project configuration:
- Run: `bash "${CLAUDE_PLUGIN_ROOT}/scripts/get-config" execution.inlineThreshold`
- If the script returns a value, use it as the inline threshold; otherwise use default (3)
```

- [ ] **Step 2: Add conflict detection to spec-syncer**

Add this section to `skills/spec-syncer/SKILL.md`, before the existing "Pre-Flight: Abandoned Change Guard":

```markdown
### Pre-Flight: Conflict Detection

Before syncing, check for conflicts across unsynced changes:

1. Run: `node "${CLAUDE_PLUGIN_ROOT}/scripts/spec-superflow.mjs" sync <change-dir>`
2. If conflicts are detected, the CLI will report which requirements are modified by multiple changes
3. Present the conflict list to the user and ask for resolution order
4. Sync changes one at a time in the user-specified order

Alternatively, use the Validator API directly:
- Call `validator.detectSyncConflicts(deltaSpecs)` with all pending delta specs
- If `hasConflicts` is true, present conflicts before proceeding
```

- [ ] **Step 3: Add config awareness to workflow-orchestrator**

Add this section to `skills/workflow-orchestrator/SKILL.md`, after "Required Inspection":

```markdown
### Config-Aware Routing

Before routing, check project configuration:
- Run: `bash "${CLAUDE_PLUGIN_ROOT}/scripts/get-config" artifacts.order`
- If the config specifies a custom artifact order, follow it when checking artifact completeness
- Run: `bash "${CLAUDE_PLUGIN_ROOT}/scripts/get-config" artifacts.skip`
- If artifacts are in the skip list, do not require them for state transitions
```

- [ ] **Step 4: Add config check to spec-forger**

Add this section to `skills/spec-forger/SKILL.md`, after "Required Artifacts":

```markdown
### Config Check

Before generating artifacts, check the project configuration:
- Run: `bash "${CLAUDE_PLUGIN_ROOT}/scripts/get-config" artifacts.order`
- Generate artifacts in the configured order (default: proposal → specs → design → tasks → execution-contract)
- Run: `bash "${CLAUDE_PLUGIN_ROOT}/scripts/get-config" artifacts.skip`
- Skip any artifacts listed in the skip configuration
```

- [ ] **Step 5: Commit**

```bash
git add skills/execution-governor/SKILL.md skills/spec-syncer/SKILL.md skills/workflow-orchestrator/SKILL.md skills/spec-forger/SKILL.md
git commit -m "feat: add worktree isolation, conflict detection, config awareness to skills"
```

---

### Task 7: Version Bump + CHANGELOG + README + Release Prep

**Files:**
- Modify: `package.json` (version bump)
- Modify: `.claude-plugin/plugin.json` (version bump)
- Modify: `.claude-plugin/marketplace.json` (version bump)
- Modify: `.cursor-plugin/plugin.json` (version bump)
- Modify: `gemini-extension.json` (version bump)
- Modify: `CHANGELOG.md`
- Modify: `README.md`
- Modify: `docs/release-checklist.md`

**Interfaces:**
- Consumes: CLI `ssf version` command (Task 5) for version sync
- Produces: All manifest files at v0.4.0, CHANGELOG entry, updated README

- [ ] **Step 1: Run ssf version to sync all manifests**

Run: `node scripts/spec-superflow.mjs version 0.4.0`
Expected: All 5 manifests updated to 0.4.0

Verify: `grep -r '"version"' package.json .claude-plugin/ .cursor-plugin/ gemini-extension.json`

- [ ] **Step 2: Add CHANGELOG.md entry**

Insert at the top of CHANGELOG.md (after the header, before v0.3.0):

```markdown
## [0.4.0] - 2026-06-29

### Added

- **CLI toolchain** — `ssf` command with 6 subcommands: `list` (scan changes), `validate` (artifact validation), `doctor` (health check), `version` (version sync), `sync` (delta spec merge), `config` (configuration management). Zero dependencies via `node:util.parseArgs`.
- **Configuration system** — Optional `spec-superflow.config.json` for customizing artifact order, skip list, execution thresholds, and verification language. Absence = v0.3.0 defaults. Skills query config via `scripts/get-config` helper.
- **Multi-language tokenizer** — `src/validation/tokenizer.ts` with English stemmer (extracted from validator) + Chinese CJK tokenizer (Unicode ranges + 2/3-char sliding window + stop words). Auto-detection based on CJK character ratio. `validateImplementation()` refactored to use tokenizer with optional `config` parameter.
- **Conflict detection** — `Validator.detectSyncConflicts()` detects when multiple changes modify the same requirement. Integrated into `ssf sync` command and `spec-syncer` skill.
- **git worktree isolation** — execution-governor now recommends worktree creation when executing on main/master branch. Pure SKILL.md guidance, no code changes.

### Changed

- **package.json** — Added `bin` field exposing `ssf` and `spec-superflow` commands.
- **validateImplementation()** — Refactored to use `tokenize()` instead of inline `stem()`. Added optional `config` parameter for language override. Backward compatible (existing callers unchanged).
- **Version manifests** — `.cursor-plugin/plugin.json` and `gemini-extension.json` now tracked in version sync (previously lagging).

### Fixed

- **Version consistency** — `ssf version` command ensures all 5 manifest files stay in sync. `ssf doctor` reports inconsistencies.
```

- [ ] **Step 3: Update README.md**

Add or update the "Current Status" section to reference v0.4.0. Add a CLI section:

```markdown
## CLI Toolchain

```bash
# Install globally
npm install -g spec-superflow

# Or use via npx
npx spec-superflow list

# Available commands
ssf list                  # List all changes and status
ssf validate <dir>        # Validate artifacts
ssf doctor                # Health check
ssf version <semver>      # Sync version to all manifests
ssf sync <change-dir>     # Merge delta specs with conflict detection
ssf config                # Display/modify configuration
```
```

Update the skills table if any new skills were added (no new skills in v0.4.0, so table row count stays at 9).

- [ ] **Step 4: Update release-checklist.md**

Add these items to `docs/release-checklist.md`:

```markdown
- [ ] Run `node scripts/spec-superflow.mjs doctor` — all checks pass
- [ ] Run `node scripts/spec-superflow.mjs version <version>` — all manifests in sync
- [ ] Verify CLI works: `node scripts/spec-superflow.mjs --help`
- [ ] Verify `spec-superflow.config.json` absence still works (backward compat)
```

- [ ] **Step 5: Build and run full test suite**

Run: `npm run build && npm test`
Expected: All 20 tests PASS

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "release: v0.4.0 — CLI toolchain, config system, multi-language tokenizer, conflict detection"
```

---

## Self-Review

### 1. Spec Coverage

| Design Section | Task | Status |
|---|---|---|
| 3.1 Config file format | Task 2 (config-loader defaults match spec) | ✅ |
| 3.2 Config fields | Task 2 (DEFAULTS object matches all 6 fields) | ✅ |
| 3.3 Config loading | Task 2 (loadConfig + findConfigFile + deepMerge) | ✅ |
| 3.4 Skills consume config | Task 6 (config check sections in 4 SKILL.md files) | ✅ |
| 4.1 CLI entry point | Task 4 (spec-superflow.mjs + bin field) | ✅ |
| 4.2 ssf list | Task 4 (cmd-list.mjs) | ✅ |
| 4.3 ssf validate | Task 4 (cmd-validate.mjs) | ✅ |
| 4.4 ssf doctor | Task 5 (cmd-doctor.mjs with all 7 checks) | ✅ |
| 4.5 ssf version | Task 5 (cmd-version.mjs with 5 manifest targets) | ✅ |
| 4.6 ssf sync | Task 5 (cmd-sync.mjs with conflict detection) | ✅ |
| 4.7 ssf config | Task 4 (cmd-config.mjs with get/set/display) | ✅ |
| 5.1 Multi-language tokenizer | Task 1 (tokenizer.ts with EN + ZH + auto-detect) | ✅ |
| 5.2 Integration with validateImplementation | Task 3 (refactor + optional config param) | ✅ |
| 5.3 Conflict detection | Task 3 (detectSyncConflicts method) | ✅ |
| 5.4 git worktree isolation | Task 6 (execution-governor SKILL.md section) | ✅ |
| 5.5 Documentation sync | Task 5 (cmd-doctor.mjs checkDocs function) | ✅ |
| 6. File structure — new files | Tasks 1-5 (10 new files) | ✅ |
| 6. File structure — modified files | Tasks 3,6,7 (14 modified files) | ✅ |
| 8. Testing strategy — 7 new tests | Tasks 1,3 (7 tests: 3 tokenizer + 2 Chinese verification + 2 conflict) | ✅ |
| 9. Version sync checklist | Task 7 (ssf version + CHANGELOG + README) | ✅ |

**Gaps found:** None. All design sections covered.

### 2. Placeholder Scan

Searched for: TBD, TODO, "implement later", "fill in details", "add appropriate", "similar to Task", "write tests for the above".

**Found:** None. All steps contain complete code.

### 3. Type Consistency

| Symbol | Defined | Used | Consistent |
|---|---|---|---|
| `tokenize(text, language?)` | Task 1 tokenizer.ts | Task 3 validator.ts | ✅ |
| `detectLanguage(text)` | Task 1 tokenizer.ts | Task 1 (internal use) | ✅ |
| `loadConfig(projectRoot)` | Task 2 config-loader.mjs | Tasks 4,5,6 cmd-*.mjs + SKILL.md | ✅ |
| `getDefaults()` | Task 2 config-loader.mjs | Task 4 cmd-config.mjs | ✅ |
| `ConflictReport` | Task 3 types.ts | Task 3 validator.ts, Task 5 cmd-sync.mjs | ✅ |
| `SyncConflict` | Task 3 types.ts | Task 3 validator.ts | ✅ |
| `detectSyncConflicts(deltaSpecs)` | Task 3 validator.ts | Task 5 cmd-sync.mjs | ✅ |
| `Validator` class | existing | Tasks 3,4,5 | ✅ |
| `parseDeltaSpec(content)` | existing | Task 3 (used in detectSyncConflicts), Task 5 (cmd-sync) | ✅ |
| `normalizeRequirementName(name)` | existing | Task 3 (used in detectSyncConflicts) | ✅ |
| `validateImplementation(diff, spec, design, config?)` | Task 3 (updated signature) | Existing tests (backward compat, no config param) | ✅ |
| `DeltaPlan` interface | existing parsing module | Task 3 (used via parseDeltaSpec return) | ✅ |

**Issues found:** None. All method signatures and type names consistent across tasks.
