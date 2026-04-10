import { normalizePlatformEvent } from './platform-event.ts';
import type { AssessmentFindingInput } from '@revbrain/contract';
import { runBaselineSuite } from '../__test-helpers__/baseline.ts';

function validPE(over: Partial<AssessmentFindingInput> = {}): AssessmentFindingInput {
  return {
    domain: 'integration',
    collectorName: 'integration',
    artifactType: 'PlatformEvent',
    artifactName: 'Quote_Submitted__e',
    findingKey: 'pe-1',
    sourceType: 'metadata',
    detected: true,
    textValue: 'QuoteId__c, Amount__c, SubmittedBy__c',
    evidenceRefs: [],
    schemaVersion: '1.0',
    ...over,
  };
}

runBaselineSuite({
  fn: normalizePlatformEvent,
  taskId: 'PH6.9',
  nodeType: 'PlatformEvent',
  validFinding: validPE,
  malformedFinding: null,
  renameMutation: (f) => ({ ...f, artifactId: 'a0V3x00000newid' }),
  contentChangeMutation: (f) => ({ ...f, textValue: 'QuoteId__c, Amount__c' }),
});
