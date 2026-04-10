import { normalizePriceCondition } from './price-condition.ts';
import type { AssessmentFindingInput } from '@revbrain/contract';
import { runBaselineSuite } from '../__test-helpers__/baseline.ts';

function validCondition(over: Partial<AssessmentFindingInput> = {}): AssessmentFindingInput {
  return {
    domain: 'pricing',
    collectorName: 'pricing',
    artifactType: 'SBQQ__PriceCondition__c',
    artifactName: 'Condition 1',
    findingKey: 'cond-1',
    sourceType: 'object',
    detected: true,
    countValue: 1,
    textValue: '100',
    notes: 'greater than',
    evidenceRefs: [{ type: 'record-id', value: 'rule-xyz' }],
    schemaVersion: '1.0',
    ...over,
  };
}

runBaselineSuite({
  fn: normalizePriceCondition,
  taskId: 'PH4.2',
  nodeType: 'PriceCondition',
  validFinding: validCondition,
  malformedFinding: null,
  contentChangeMutation: (f) => ({ ...f, notes: 'less than' }),
});
