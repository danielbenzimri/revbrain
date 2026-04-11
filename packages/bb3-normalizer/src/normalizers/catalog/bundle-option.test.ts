import { normalizeBundleOption } from './bundle-option.ts';
import type { AssessmentFindingInput } from '@revbrain/contract';
import { runBaselineSuite } from '../__test-helpers__/baseline.ts';

function validBO(over: Partial<AssessmentFindingInput> = {}): AssessmentFindingInput {
  return {
    domain: 'catalog',
    collectorName: 'catalog',
    artifactType: 'SBQQ__ProductOption__c',
    artifactName: 'Add-on Storage',
    artifactId: 'a0M3x000003ABCDEAA',
    findingKey: 'bo-1',
    sourceType: 'object',
    detected: true,
    countValue: 1,
    notes: 'Component',
    // PH9 §8.3 — canonical field-ref shape: value=path, label=value.
    evidenceRefs: [
      { type: 'object-ref', value: 'BUNDLE-01' },
      { type: 'field-ref', value: 'OptionalSKU.ProductCode', label: 'ADDON-STORAGE' },
    ],
    schemaVersion: '1.0',
    ...over,
  };
}

runBaselineSuite({
  fn: normalizeBundleOption,
  taskId: 'PH4.12',
  nodeType: 'BundleOption',
  validFinding: validBO,
  malformedFinding: null,
  contentChangeMutation: (f) => ({ ...f, notes: 'Accessory' }),
});
