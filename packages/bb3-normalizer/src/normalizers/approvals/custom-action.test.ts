import { normalizeCustomAction } from './custom-action.ts';
import type { AssessmentFindingInput } from '@revbrain/contract';
import { runBaselineSuite } from '../__test-helpers__/baseline.ts';

function validCA(over: Partial<AssessmentFindingInput> = {}): AssessmentFindingInput {
  return {
    domain: 'approvals',
    collectorName: 'approvals',
    artifactType: 'SBQQ__CustomAction__c',
    artifactName: 'Submit_Quote',
    findingKey: 'custom-act-1',
    sourceType: 'object',
    detected: true,
    sourceRef: 'Quote',
    notes: 'VisualForce',
    textValue: '/apex/SubmitQuote',
    evidenceRefs: [],
    schemaVersion: '1.0',
    ...over,
  };
}

runBaselineSuite({
  fn: normalizeCustomAction,
  taskId: 'PH6.1',
  nodeType: 'CustomAction',
  validFinding: validCA,
  malformedFinding: null,
  renameMutation: (f) => ({ ...f, artifactId: 'a0V3x00000newid' }),
  contentChangeMutation: (f) => ({ ...f, detected: !f.detected }),
});
