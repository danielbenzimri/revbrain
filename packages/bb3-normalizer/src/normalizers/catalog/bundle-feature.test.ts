import { normalizeBundleFeature } from './bundle-feature.ts';
import type { AssessmentFindingInput } from '@revbrain/contract';
import { runBaselineSuite } from '../__test-helpers__/baseline.ts';

function validBF(over: Partial<AssessmentFindingInput> = {}): AssessmentFindingInput {
  return {
    domain: 'catalog',
    collectorName: 'catalog',
    artifactType: 'SBQQ__ProductFeature__c',
    artifactName: 'Storage Options',
    findingKey: 'bf-1',
    sourceType: 'object',
    detected: true,
    countValue: 1,
    notes: 'Storage',
    evidenceRefs: [{ type: 'object-ref', value: 'BUNDLE-01' }],
    schemaVersion: '1.0',
    ...over,
  };
}

runBaselineSuite({
  fn: normalizeBundleFeature,
  taskId: 'PH4.13',
  nodeType: 'BundleFeature',
  validFinding: validBF,
  malformedFinding: null,
  // developerName-based identity: mutate textValue / evidenceRefs
  // rather than artifactName.
  renameMutation: (f) => ({ ...f, textValue: 'renamed description' }),
  contentChangeMutation: (f) => ({ ...f, notes: 'Support' }),
});
