import { normalizeRecordType } from './record-type.ts';
import type { AssessmentFindingInput } from '@revbrain/contract';
import { runBaselineSuite } from '../__test-helpers__/baseline.ts';

function validRT(over: Partial<AssessmentFindingInput> = {}): AssessmentFindingInput {
  return {
    domain: 'customization',
    collectorName: 'customization',
    artifactType: 'RecordType',
    artifactName: 'Enterprise_Quote',
    findingKey: 'rt-1',
    sourceType: 'metadata',
    detected: true,
    evidenceRefs: [{ type: 'object-ref', value: 'SBQQ__Quote__c' }],
    schemaVersion: '1.0',
    ...over,
  };
}

runBaselineSuite({
  fn: normalizeRecordType,
  taskId: 'PH5.6',
  nodeType: 'RecordTypeIR',
  validFinding: validRT,
  malformedFinding: null,
  renameMutation: (f) => ({ ...f, artifactId: 'a0V3x00000newid' }),
  contentChangeMutation: (f) => ({ ...f, detected: !f.detected }),
});
