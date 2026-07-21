export const WORKFLOW_MODES = Object.freeze(['full', 'hotfix', 'tweak']);

const BOOLEAN_FACTS = ['config_doc_only', 'schema_api_change', 'new_module'];
const FACT_KEYS = ['task_count', 'file_count', ...BOOLEAN_FACTS, 'uncertainty'];

export function normalizeWorkflowFacts(input = {}) {
  return {
    task_count: normalizeCount(input.task_count),
    file_count: normalizeCount(input.file_count),
    config_doc_only: normalizeEnum(input.config_doc_only, ['yes', 'no', 'unknown']),
    schema_api_change: normalizeEnum(input.schema_api_change, ['yes', 'no', 'unknown']),
    new_module: normalizeEnum(input.new_module, ['yes', 'no', 'unknown']),
    uncertainty: normalizeEnum(input.uncertainty, ['low', 'high', 'unknown']),
  };
}

export function recommendWorkflowPath(input = {}) {
  const facts = normalizeWorkflowFacts(input);
  const missing_facts = FACT_KEYS.filter((key) => facts[key] === null || facts[key] === 'unknown');
  const base = { available_modes: [...WORKFLOW_MODES], facts, missing_facts };

  if (missing_facts.length) {
    return { ...base, status: 'needs-input', recommendation: null };
  }
  if (facts.schema_api_change === 'yes' || facts.new_module === 'yes' || facts.uncertainty === 'high') {
    return ready(base, 'full', 'Risk or uncertainty requires the full workflow.');
  }
  if (facts.config_doc_only === 'yes' && facts.task_count <= 4 && facts.file_count <= 4) {
    return ready(base, 'tweak', 'Config/doc-only work is within the tweak thresholds.');
  }
  if (facts.config_doc_only === 'no' && facts.task_count <= 2 && facts.file_count <= 2) {
    return ready(base, 'hotfix', 'Bounded code work is within the hotfix thresholds.');
  }
  return ready(base, 'full', 'The observed scope exceeds the fast-path thresholds.');
}

function ready(base, mode, reason) {
  return { ...base, status: 'ready', recommendation: { mode, reasons: [reason] } };
}

function normalizeCount(value) {
  if (value === null || value === undefined) return null;
  if (!Number.isInteger(value) || value < 0) {
    throw new Error('task_count and file_count must be non-negative integers');
  }
  return value;
}

function normalizeEnum(value, allowed) {
  if (value === null || value === undefined) return 'unknown';
  if (!allowed.includes(value)) throw new Error(`invalid workflow fact value: ${value}`);
  return value;
}
