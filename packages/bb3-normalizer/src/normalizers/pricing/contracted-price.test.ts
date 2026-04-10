import { normalizeContractedPrice } from './contracted-price.ts';
import type { AssessmentFindingInput } from '@revbrain/contract';
import { runBaselineSuite } from '../__test-helpers__/baseline.ts';

function validCP(over: Partial<AssessmentFindingInput> = {}): AssessmentFindingInput {
  return {
    domain: 'pricing',
    collectorName: 'pricing',
    artifactType: 'SBQQ__ContractedPrice__c',
    artifactName: 'CP-Acme-PROD-A',
    findingKey: 'cp-1',
    sourceType: 'object',
    detected: true,
    textValue: '75.00',
    notes: 'Account',
    evidenceRefs: [
      { type: 'field-ref', value: 'PROD-A' },
      { type: 'object-ref', value: 'Acme-12345' },
      { type: 'api-response', value: 'USD' },
    ],
    schemaVersion: '1.0',
    ...over,
  };
}

runBaselineSuite({
  fn: normalizeContractedPrice,
  taskId: 'PH4.8',
  nodeType: 'ContractedPrice',
  validFinding: validCP,
  malformedFinding: null,
  contentChangeMutation: (f) => ({ ...f, textValue: '100.00' }),
});
