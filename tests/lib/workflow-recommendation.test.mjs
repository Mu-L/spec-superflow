import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  recommendWorkflowPath,
  WORKFLOW_MODES,
} from '../../scripts/lib/workflow-recommendation.mjs';

const base = {
  task_count: 2,
  file_count: 2,
  config_doc_only: 'no',
  schema_api_change: 'no',
  new_module: 'no',
  uncertainty: 'low',
};

describe('workflow path recommendation', () => {
  it('recommends hotfix for a bounded code change', () => {
    const result = recommendWorkflowPath(base);
    assert.equal(result.status, 'ready');
    assert.deepEqual(result.available_modes, WORKFLOW_MODES);
    assert.equal(result.recommendation.mode, 'hotfix');
  });

  it('recommends tweak for a small config/doc-only change', () => {
    const result = recommendWorkflowPath({ ...base, task_count: 4, file_count: 4, config_doc_only: 'yes' });
    assert.equal(result.recommendation.mode, 'tweak');
  });

  it('recommends full for risk, uncertainty, or threshold overflow', () => {
    for (const facts of [
      { ...base, schema_api_change: 'yes' },
      { ...base, new_module: 'yes' },
      { ...base, uncertainty: 'high' },
      { ...base, task_count: 3 },
    ]) assert.equal(recommendWorkflowPath(facts).recommendation.mode, 'full');
  });

  it('returns needs-input instead of full when facts are unknown', () => {
    const result = recommendWorkflowPath({ ...base, file_count: null, new_module: 'unknown' });
    assert.equal(result.status, 'needs-input');
    assert.equal(result.recommendation, null);
    assert.deepEqual(result.missing_facts, ['file_count', 'new_module']);
  });
});
