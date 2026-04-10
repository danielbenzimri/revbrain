import { normalizeConfigConstraint } from './config-constraint.ts';
import type { AssessmentFindingInput } from '@revbrain/contract';
import { runBaselineSuite } from '../__test-helpers__/baseline.ts';

function validCC(over: Partial<AssessmentFindingInput> = {}): AssessmentFindingInput {
  return {
    domain: 'catalog',
    collectorName: 'catalog',
    artifactType: 'SBQQ__ProductRule__c',
    artifactName: 'Require Storage With Server',
    findingKey: 'cc-1',
    sourceType: 'object',
    detected: true,
    notes: 'Validation',
    sourceRef: 'Always',
    textValue: 'Storage must be selected',
    evidenceRefs: [],
    schemaVersion: '1.0',
    ...over,
  };
}

runBaselineSuite({
  fn: normalizeConfigConstraint,
  taskId: 'PH4.14',
  nodeType: 'ConfigConstraint',
  validFinding: validCC,
  malformedFinding: null,
  // Toggle isActive via `detected` — it's in semanticPayload but
  // not in stableIdentity, so id stays stable and contentHash
  // changes.
  contentChangeMutation: (f) => ({ ...f, detected: !f.detected }),
});
