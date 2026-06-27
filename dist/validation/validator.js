import { MIN_PURPOSE_LENGTH, MIN_WHY_SECTION_LENGTH, MAX_WHY_SECTION_LENGTH, MAX_REQUIREMENT_TEXT_LENGTH, MAX_DELTAS_PER_CHANGE, VALIDATION_MESSAGES, VERIFICATION_MESSAGES, } from './constants.js';
import { parseDeltaSpec, normalizeRequirementName, extractRequirementsSection, } from '../parsing/requirement-blocks.js';
const REQUIREMENT_HEADER_REGEX = /^###\s*Requirement:\s*(.+)\s*$/i;
const SCENARIO_HEADER_REGEX = /^####\s+Scenario:/i;
function normalizeLineEndings(content) {
    return content.replace(/\r\n?/g, '\n');
}
function extractSection(content, heading) {
    const normalized = normalizeLineEndings(content);
    const lines = normalized.split('\n');
    const headingRegex = new RegExp(`^##\\s+${heading.replace(/\s+/g, '\\s+')}\\s*$`, 'i');
    const idx = lines.findIndex((l) => headingRegex.test(l));
    if (idx === -1)
        return undefined;
    let endIdx = lines.length;
    for (let i = idx + 1; i < lines.length; i++) {
        if (/^##\s+/.test(lines[i])) {
            endIdx = i;
            break;
        }
    }
    return lines.slice(idx + 1, endIdx).join('\n').trim();
}
function containsShallOrMust(text) {
    return /\b(SHALL|MUST)\b/.test(text);
}
/**
 * Lightweight English stemmer used to normalize requirement / decision keywords
 * before comparing against diff words. Strips only the most common suffixes
 * (-ing, -er, -ed, -s, -tion) so that natural variations like
 * "limiting" / "limiter" / "limit" collapse to the same stem.
 *
 * Intentionally conservative — false-negative matching (missing a coverage gap)
 * is preferred over false-positive (falsely claiming a requirement is covered).
 */
function stem(word) {
    const w = word.toLowerCase();
    if (w.length <= 3)
        return w;
    // Longer suffixes first so "ting" strips before "ing", "tion" before "ion", etc.
    const suffixes = [
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
    if (w.endsWith('s') && w.length > 4)
        return w.slice(0, -1);
    return w;
}
function countScenarios(blockRaw) {
    const matches = blockRaw.match(/^####\s+/gm);
    return matches ? matches.length : 0;
}
function extractRequirementText(blockRaw) {
    const lines = blockRaw.split('\n');
    for (let i = 1; i < lines.length; i++) {
        const line = lines[i];
        if (/^####\s+/.test(line))
            break;
        const trimmed = line.trim();
        if (trimmed.length === 0)
            continue;
        if (/^\*\*[^*]+\*\*:/.test(trimmed))
            continue;
        return trimmed;
    }
    return undefined;
}
function buildMissingShallOrMustMessage(action, blockName) {
    const base = `${action} "${blockName}" must contain SHALL or MUST`;
    if (containsShallOrMust(blockName)) {
        return `${base} in the requirement body, not only in the header. Move the SHALL/MUST statement to the line immediately after the "### Requirement: ..." header.`;
    }
    return base;
}
function formatSectionList(sections) {
    if (sections.length === 0)
        return '';
    if (sections.length === 1)
        return sections[0];
    const head = sections.slice(0, -1);
    const last = sections[sections.length - 1];
    return `${head.join(', ')} and ${last}`;
}
function enrichTopLevelError(itemId, baseMessage) {
    const msg = baseMessage.trim();
    if (msg === VALIDATION_MESSAGES.CHANGE_NO_DELTAS) {
        return `${msg}. ${VALIDATION_MESSAGES.GUIDE_NO_DELTAS}`;
    }
    if (msg.includes('Spec must have a Purpose section') ||
        msg.includes('Spec must have a Requirements section')) {
        return `${msg}. ${VALIDATION_MESSAGES.GUIDE_MISSING_SPEC_SECTIONS}`;
    }
    if (msg.includes('Change must have a Why section') ||
        msg.includes('Change must have a What Changes section')) {
        return `${msg}. ${VALIDATION_MESSAGES.GUIDE_MISSING_CHANGE_SECTIONS}`;
    }
    return msg;
}
function createReport(issues, strictMode = false) {
    const errors = issues.filter((i) => i.level === 'ERROR').length;
    const warnings = issues.filter((i) => i.level === 'WARNING').length;
    const info = issues.filter((i) => i.level === 'INFO').length;
    const valid = strictMode ? errors === 0 && warnings === 0 : errors === 0;
    return {
        valid,
        issues,
        summary: { errors, warnings, info },
    };
}
export class Validator {
    strictMode;
    constructor(strictMode = false) {
        this.strictMode = strictMode;
    }
    validateSpecContent(specName, content) {
        const issues = [];
        if (!specName || specName.trim().length === 0) {
            issues.push({ level: 'ERROR', path: 'name', message: VALIDATION_MESSAGES.SPEC_NAME_EMPTY });
        }
        const purposeSection = extractSection(content, 'Purpose');
        if (!purposeSection || purposeSection.trim().length === 0) {
            issues.push({
                level: 'ERROR',
                path: 'overview',
                message: VALIDATION_MESSAGES.SPEC_PURPOSE_EMPTY,
            });
        }
        else if (purposeSection.length < MIN_PURPOSE_LENGTH) {
            issues.push({
                level: 'WARNING',
                path: 'overview',
                message: VALIDATION_MESSAGES.PURPOSE_TOO_BRIEF,
            });
        }
        const reqSectionParts = extractRequirementsSection(content);
        if (reqSectionParts.bodyBlocks.length === 0) {
            issues.push({
                level: 'ERROR',
                path: 'requirements',
                message: VALIDATION_MESSAGES.SPEC_NO_REQUIREMENTS,
            });
        }
        for (const block of reqSectionParts.bodyBlocks) {
            const reqText = extractRequirementText(block.raw);
            if (!reqText || reqText.trim().length === 0) {
                issues.push({
                    level: 'ERROR',
                    path: `requirements.${block.name}`,
                    message: VALIDATION_MESSAGES.REQUIREMENT_EMPTY,
                });
            }
            else {
                if (!containsShallOrMust(reqText)) {
                    issues.push({
                        level: 'ERROR',
                        path: `requirements.${block.name}`,
                        message: buildMissingShallOrMustMessage('ADDED', block.name),
                    });
                }
                if (reqText.length > MAX_REQUIREMENT_TEXT_LENGTH) {
                    issues.push({
                        level: 'INFO',
                        path: `requirements.${block.name}`,
                        message: VALIDATION_MESSAGES.REQUIREMENT_TOO_LONG,
                    });
                }
            }
            const scenarioCount = countScenarios(block.raw);
            if (scenarioCount < 1) {
                issues.push({
                    level: 'WARNING',
                    path: `requirements.${block.name}.scenarios`,
                    message: `${VALIDATION_MESSAGES.REQUIREMENT_NO_SCENARIOS}. ${VALIDATION_MESSAGES.GUIDE_SCENARIO_FORMAT}`,
                });
            }
        }
        return createReport(issues, this.strictMode);
    }
    validateChangeContent(changeName, content) {
        const issues = [];
        if (!changeName || changeName.trim().length === 0) {
            issues.push({ level: 'ERROR', path: 'name', message: VALIDATION_MESSAGES.CHANGE_NAME_EMPTY });
        }
        const whySection = extractSection(content, 'Why');
        if (!whySection || whySection.trim().length === 0) {
            issues.push({
                level: 'ERROR',
                path: 'why',
                message: VALIDATION_MESSAGES.CHANGE_WHY_TOO_SHORT,
            });
        }
        else {
            if (whySection.length < MIN_WHY_SECTION_LENGTH) {
                issues.push({
                    level: 'ERROR',
                    path: 'why',
                    message: VALIDATION_MESSAGES.CHANGE_WHY_TOO_SHORT,
                });
            }
            if (whySection.length > MAX_WHY_SECTION_LENGTH) {
                issues.push({
                    level: 'WARNING',
                    path: 'why',
                    message: VALIDATION_MESSAGES.CHANGE_WHY_TOO_LONG,
                });
            }
        }
        const whatChanges = extractSection(content, 'What Changes');
        if (!whatChanges || whatChanges.trim().length === 0) {
            issues.push({
                level: 'ERROR',
                path: 'whatChanges',
                message: VALIDATION_MESSAGES.CHANGE_WHAT_EMPTY,
            });
        }
        return createReport(issues, this.strictMode);
    }
    validateDeltaSpec(content) {
        const issues = [];
        const plan = parseDeltaSpec(content);
        const totalDeltas = plan.added.length + plan.modified.length + plan.removed.length + plan.renamed.length;
        if (totalDeltas === 0) {
            issues.push({
                level: 'ERROR',
                path: 'file',
                message: enrichTopLevelError('change', VALIDATION_MESSAGES.CHANGE_NO_DELTAS),
            });
            return createReport(issues, this.strictMode);
        }
        if (totalDeltas > MAX_DELTAS_PER_CHANGE) {
            issues.push({
                level: 'WARNING',
                path: 'file',
                message: VALIDATION_MESSAGES.CHANGE_TOO_MANY_DELTAS,
            });
        }
        const addedNames = new Set();
        const modifiedNames = new Set();
        const removedNames = new Set();
        const renamedFrom = new Set();
        const renamedTo = new Set();
        for (const block of plan.added) {
            const key = normalizeRequirementName(block.name);
            if (addedNames.has(key)) {
                issues.push({
                    level: 'ERROR',
                    path: 'added',
                    message: `Duplicate requirement in ADDED: "${block.name}"`,
                });
            }
            else {
                addedNames.add(key);
            }
            const reqText = extractRequirementText(block.raw);
            if (!reqText) {
                issues.push({
                    level: 'ERROR',
                    path: `added.${block.name}`,
                    message: `ADDED "${block.name}" is missing requirement text`,
                });
            }
            else if (!containsShallOrMust(reqText)) {
                issues.push({
                    level: 'ERROR',
                    path: `added.${block.name}`,
                    message: buildMissingShallOrMustMessage('ADDED', block.name),
                });
            }
            if (countScenarios(block.raw) < 1) {
                issues.push({
                    level: 'ERROR',
                    path: `added.${block.name}`,
                    message: `ADDED "${block.name}" must include at least one scenario`,
                });
            }
        }
        for (const block of plan.modified) {
            const key = normalizeRequirementName(block.name);
            if (modifiedNames.has(key)) {
                issues.push({
                    level: 'ERROR',
                    path: 'modified',
                    message: `Duplicate requirement in MODIFIED: "${block.name}"`,
                });
            }
            else {
                modifiedNames.add(key);
            }
            const reqText = extractRequirementText(block.raw);
            if (!reqText) {
                issues.push({
                    level: 'ERROR',
                    path: `modified.${block.name}`,
                    message: `MODIFIED "${block.name}" is missing requirement text`,
                });
            }
            else if (!containsShallOrMust(reqText)) {
                issues.push({
                    level: 'ERROR',
                    path: `modified.${block.name}`,
                    message: buildMissingShallOrMustMessage('MODIFIED', block.name),
                });
            }
            if (countScenarios(block.raw) < 1) {
                issues.push({
                    level: 'ERROR',
                    path: `modified.${block.name}`,
                    message: `MODIFIED "${block.name}" must include at least one scenario`,
                });
            }
        }
        for (const name of plan.removed) {
            const key = normalizeRequirementName(name);
            if (removedNames.has(key)) {
                issues.push({
                    level: 'ERROR',
                    path: 'removed',
                    message: `Duplicate requirement in REMOVED: "${name}"`,
                });
            }
            else {
                removedNames.add(key);
            }
        }
        for (const { from, to } of plan.renamed) {
            const fromKey = normalizeRequirementName(from);
            const toKey = normalizeRequirementName(to);
            if (renamedFrom.has(fromKey)) {
                issues.push({
                    level: 'ERROR',
                    path: 'renamed',
                    message: `Duplicate FROM in RENAMED: "${from}"`,
                });
            }
            else {
                renamedFrom.add(fromKey);
            }
            if (renamedTo.has(toKey)) {
                issues.push({
                    level: 'ERROR',
                    path: 'renamed',
                    message: `Duplicate TO in RENAMED: "${to}"`,
                });
            }
            else {
                renamedTo.add(toKey);
            }
        }
        for (const n of modifiedNames) {
            if (removedNames.has(n)) {
                issues.push({
                    level: 'ERROR',
                    path: 'cross-section',
                    message: `Requirement present in both MODIFIED and REMOVED: "${n}"`,
                });
            }
            if (addedNames.has(n)) {
                issues.push({
                    level: 'ERROR',
                    path: 'cross-section',
                    message: `Requirement present in both MODIFIED and ADDED: "${n}"`,
                });
            }
        }
        for (const n of addedNames) {
            if (removedNames.has(n)) {
                issues.push({
                    level: 'ERROR',
                    path: 'cross-section',
                    message: `Requirement present in both ADDED and REMOVED: "${n}"`,
                });
            }
        }
        for (const { from, to } of plan.renamed) {
            const fromKey = normalizeRequirementName(from);
            const toKey = normalizeRequirementName(to);
            if (modifiedNames.has(fromKey)) {
                issues.push({
                    level: 'ERROR',
                    path: 'cross-section',
                    message: `MODIFIED references old name from RENAMED. Use new header for "${to}"`,
                });
            }
            if (addedNames.has(toKey)) {
                issues.push({
                    level: 'ERROR',
                    path: 'cross-section',
                    message: `RENAMED TO collides with ADDED for "${to}"`,
                });
            }
        }
        return createReport(issues, this.strictMode);
    }
    validateImplementation(diffSummary, specContent, designContent) {
        const dimensions = [];
        // --- Completeness ---
        const completenessFindings = [];
        const requirements = this.extractRequirementNames(specContent);
        const diffWords = new Set(diffSummary.toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length > 0).map(stem));
        for (const req of requirements) {
            // A requirement is considered covered when every significant word (stemmed) appears
            // somewhere in the diff. This handles natural variations like "Rate limiting" vs
            // "rate limiter" / "rate-limit.ts" without requiring exact substring matches.
            const keywords = req
                .toLowerCase()
                .split(/[^a-z0-9]+/)
                .filter(w => w.length > 3);
            const allPresent = keywords.length === 0 || keywords.every(kw => diffWords.has(stem(kw)));
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
        const correctnessFindings = [];
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
        const coherenceFindings = [];
        const decisionNames = this.extractDecisionNames(designContent);
        const diffLower = diffSummary.toLowerCase();
        const fillerWords = new Set(['based', 'with', 'the', 'a', 'an', 'of', 'for', 'and', 'or', 'in', 'on', 'to', 'by', 'as']);
        for (const name of decisionNames) {
            if (name.length <= 3)
                continue;
            // Check that every significant word from the decision name appears in the diff.
            // This allows "JWT-based auth" to match "JWT auth middleware" (design naming ≠ exact diff substring).
            const keywords = name
                .toLowerCase()
                .split(/[^a-z0-9]+/)
                .filter(w => w.length > 0 && !fillerWords.has(w));
            const allPresent = keywords.length === 0 || keywords.every(kw => diffLower.includes(kw));
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
        const verdict = hasCritical ? 'FAIL' : hasWarning ? 'CONDITIONAL' : 'PASS';
        return { dimensions, verdict };
    }
    extractRequirementNames(specContent) {
        const regex = /### Requirement:\s*(.+)/g;
        const names = [];
        let match;
        while ((match = regex.exec(specContent)) !== null) {
            names.push(match[1].trim());
        }
        return names;
    }
    extractDecisionNames(designContent) {
        const regex = /- Choice:\s*(.+)/g;
        const names = [];
        let match;
        while ((match = regex.exec(designContent)) !== null) {
            names.push(match[1].trim());
        }
        return names;
    }
    isValid(report) {
        return report.valid;
    }
}
