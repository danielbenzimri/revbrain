import { normalizeConfigurationAttribute } from './configuration-attribute.ts';
import type { AssessmentFindingInput } from '@revbrain/contract';
import { runBaselineSuite } from '../__test-helpers__/baseline.ts';

function validCA(over: Partial<AssessmentFindingInput> = {}): AssessmentFindingInput {
  return {
    domain: 'catalog',
    collectorName: 'catalog',
    artifactType: 'SBQQ__ConfigurationAttribute__c',
    artifactName: 'Color',
    findingKey: 'ca-1',
    sourceType: 'object',
    detected: true,
    countValue: 1,
    textValue: 'Blue',
    evidenceRefs: [{ type: 'object-ref', value: 'PROD-01' }],
    schemaVersion: '1.0',
    ...over,
  };
}

runBaselineSuite({
  fn: normalizeConfigurationAttribute,
  taskId: 'PH4.15',
  nodeType: 'ConfigurationAttribute',
  validFinding: validCA,
  malformedFinding: null,
  // Identity includes developerName (from artifactName). Mutate
  // an unrelated field for the baseline rename check.
  renameMutation: (f) => ({ ...f, artifactId: 'a0V3x00000newid' }),
  // Bump displayOrder via countValue — it's in semanticPayload.
  contentChangeMutation: (f) => ({ ...f, countValue: (f.countValue ?? 0) + 1 }),
});
