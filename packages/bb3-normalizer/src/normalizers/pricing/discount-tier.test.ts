import { normalizeDiscountTier } from './discount-tier.ts';
import type { AssessmentFindingInput } from '@revbrain/contract';
import { runBaselineSuite } from '../__test-helpers__/baseline.ts';

function validTier(over: Partial<AssessmentFindingInput> = {}): AssessmentFindingInput {
  return {
    domain: 'pricing',
    collectorName: 'pricing',
    artifactType: 'SBQQ__DiscountTier__c',
    artifactName: 'Tier 1',
    findingKey: 'tier-1',
    sourceType: 'object',
    detected: true,
    countValue: 10,
    textValue: '15%',
    evidenceRefs: [{ type: 'record-id', value: 'schedule-1' }],
    schemaVersion: '1.0',
    ...over,
  };
}

runBaselineSuite({
  fn: normalizeDiscountTier,
  taskId: 'PH4.5',
  nodeType: 'DiscountTier',
  validFinding: validTier,
  malformedFinding: null,
  contentChangeMutation: (f) => ({ ...f, textValue: '20%' }),
});
