import { normalizeValidationRule } from './validation-rule.ts';
import type { AssessmentFindingInput } from '@revbrain/contract';
import { runBaselineSuite } from '../__test-helpers__/baseline.ts';

function validVR(over: Partial<AssessmentFindingInput> = {}): AssessmentFindingInput {
  return {
    domain: 'customization',
    collectorName: 'customization',
    artifactType: 'ValidationRule',
    artifactName: 'Require_Discount_Approval',
    findingKey: 'vr-1',
    sourceType: 'metadata',
    detected: true,
    notes: 'Discount exceeds approval threshold',
    textValue: 'Discount__c > 20',
    evidenceRefs: [{ type: 'object-ref', value: 'SBQQ__Quote__c' }],
    schemaVersion: '1.0',
    ...over,
  };
}

runBaselineSuite({
  fn: normalizeValidationRule,
  taskId: 'PH4.17',
  nodeType: 'ValidationRule',
  validFinding: validVR,
  malformedFinding: null,
  // Identity = (object, developerName = artifactName). Mutate
  // something else to exercise the rename path.
  renameMutation: (f) => ({ ...f, evidenceRefs: [...f.evidenceRefs] }),
  contentChangeMutation: (f) => ({ ...f, textValue: 'Discount__c > 30' }),
});
