import { normalizeBundleStructure } from './bundle-structure.ts';
import type { AssessmentFindingInput } from '@revbrain/contract';
import { runBaselineSuite } from '../__test-helpers__/baseline.ts';

function validBS(over: Partial<AssessmentFindingInput> = {}): AssessmentFindingInput {
  return {
    domain: 'catalog',
    collectorName: 'catalog',
    artifactType: 'BundleStructure',
    artifactName: 'Premium Bundle',
    artifactId: '01t3x000008zVqQAAU',
    findingKey: 'bs-1',
    sourceType: 'object',
    detected: true,
    notes: 'Required',
    // PH9 §8.3 — canonical field-ref shape: value=path, label=value.
    evidenceRefs: [{ type: 'field-ref', value: 'Product2.ProductCode', label: 'BUNDLE-01' }],
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
