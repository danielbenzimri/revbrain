import { normalizeLocalizationBundle } from './localization-bundle.ts';
import type { AssessmentFindingInput } from '@revbrain/contract';
import { runBaselineSuite } from '../__test-helpers__/baseline.ts';

function validLB(over: Partial<AssessmentFindingInput> = {}): AssessmentFindingInput {
  return {
    domain: 'localization',
    collectorName: 'localization',
    artifactType: 'LocalizationBundle',
    artifactName: 'en_US',
    findingKey: 'lb-1',
    sourceType: 'metadata',
    detected: true,
    countValue: 50,
    evidenceRefs: [],
    schemaVersion: '1.0',
    ...over,
  };
}

runBaselineSuite({
  fn: normalizeLocalizationBundle,
  taskId: 'PH6.12',
  nodeType: 'LocalizationBundle',
  validFinding: validLB,
  malformedFinding: null,
  renameMutation: (f) => ({ ...f, artifactId: 'a0V3x00000newid' }),
  contentChangeMutation: (f) => ({ ...f, countValue: (f.countValue ?? 0) + 10 }),
});
