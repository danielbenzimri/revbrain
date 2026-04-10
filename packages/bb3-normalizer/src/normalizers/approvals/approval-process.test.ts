import { normalizeApprovalProcess } from './approval-process.ts';
import type { AssessmentFindingInput } from '@revbrain/contract';
import { runBaselineSuite } from '../__test-helpers__/baseline.ts';

function validAP(over: Partial<AssessmentFindingInput> = {}): AssessmentFindingInput {
  return {
    domain: 'approvals',
    collectorName: 'approvals',
    artifactType: 'ApprovalProcess',
    artifactName: 'Standard_Discount_Approval',
    findingKey: 'ap-1',
    sourceType: 'metadata',
    detected: true,
    countValue: 3,
    evidenceRefs: [{ type: 'object-ref', value: 'SBQQ__Quote__c' }],
    schemaVersion: '1.0',
    ...over,
  };
}

runBaselineSuite({
  fn: normalizeApprovalProcess,
  taskId: 'PH6.2',
  nodeType: 'ApprovalProcess',
  validFinding: validAP,
  malformedFinding: null,
  renameMutation: (f) => ({ ...f, artifactId: 'a0V3x00000newid' }),
  contentChangeMutation: (f) => ({ ...f, countValue: (f.countValue ?? 0) + 1 }),
});
