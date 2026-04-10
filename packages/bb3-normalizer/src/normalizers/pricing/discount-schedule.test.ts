import { normalizeDiscountSchedule } from './discount-schedule.ts';
import type { AssessmentFindingInput } from '@revbrain/contract';
import { runBaselineSuite } from '../__test-helpers__/baseline.ts';

function validSchedule(over: Partial<AssessmentFindingInput> = {}): AssessmentFindingInput {
  return {
    domain: 'pricing',
    collectorName: 'pricing',
    artifactType: 'SBQQ__DiscountSchedule__c',
    artifactName: 'Volume Discount A',
    findingKey: 'ds-1',
    sourceType: 'object',
    detected: true,
    countValue: 3,
    notes: 'Volume',
    sourceRef: 'unit',
    evidenceRefs: [],
    schemaVersion: '1.0',
    ...over,
  };
}

runBaselineSuite({
  fn: normalizeDiscountSchedule,
  taskId: 'PH4.4',
  nodeType: 'DiscountSchedule',
  validFinding: validSchedule,
  malformedFinding: null,
  contentChangeMutation: (f) => ({ ...f, countValue: (f.countValue ?? 0) + 5 }),
});
