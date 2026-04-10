import { normalizePriceAction } from './price-action.ts';
import type { AssessmentFindingInput } from '@revbrain/contract';
import { runBaselineSuite } from '../__test-helpers__/baseline.ts';

function validAction(over: Partial<AssessmentFindingInput> = {}): AssessmentFindingInput {
  return {
    domain: 'pricing',
    collectorName: 'pricing',
    artifactType: 'SBQQ__PriceAction__c',
    artifactName: 'Action 1',
    findingKey: 'act-1',
    sourceType: 'object',
    detected: true,
    countValue: 1,
    textValue: '10',
    notes: 'set discount percent',
    evidenceRefs: [{ type: 'record-id', value: 'rule-xyz' }],
    schemaVersion: '1.0',
    ...over,
  };
}

runBaselineSuite({
  fn: normalizePriceAction,
  taskId: 'PH4.3',
  nodeType: 'PriceAction',
  validFinding: validAction,
  malformedFinding: null,
  contentChangeMutation: (f) => ({ ...f, textValue: '25' }),
});
