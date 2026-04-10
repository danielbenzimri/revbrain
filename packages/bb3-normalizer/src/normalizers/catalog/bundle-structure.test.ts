import { normalizeBundleStructure } from './bundle-structure.ts';
import type { AssessmentFindingInput } from '@revbrain/contract';
import { runBaselineSuite } from '../__test-helpers__/baseline.ts';

function validBS(over: Partial<AssessmentFindingInput> = {}): AssessmentFindingInput {
  return {
    domain: 'catalog',
    collectorName: 'catalog',
    artifactType: 'BundleStructure',
    artifactName: 'Premium Bundle',
    findingKey: 'bs-1',
    sourceType: 'object',
    detected: true,
    notes: 'Required',
    evidenceRefs: [{ type: 'field-ref', value: 'BUNDLE-01' }],
    schemaVersion: '1.0',
    ...over,
  };
}

runBaselineSuite({
  fn: normalizeBundleStructure,
  taskId: 'PH4.11',
  nodeType: 'BundleStructure',
  validFinding: validBS,
  malformedFinding: null,
  contentChangeMutation: (f) => ({ ...f, notes: 'Allowed' }),
});
