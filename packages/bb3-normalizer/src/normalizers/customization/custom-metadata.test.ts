import { normalizeCustomMetadataType } from './custom-metadata.ts';
import type { AssessmentFindingInput } from '@revbrain/contract';
import { runBaselineSuite } from '../__test-helpers__/baseline.ts';

function validCMT(over: Partial<AssessmentFindingInput> = {}): AssessmentFindingInput {
  return {
    domain: 'customization',
    collectorName: 'customization',
    artifactType: 'CustomMetadataType',
    artifactName: 'SBQQ__TaxRate__mdt',
    findingKey: 'cmt-1',
    sourceType: 'metadata',
    detected: true,
    countValue: 10,
    textValue: 'Name, Rate__c, Country__c',
    evidenceRefs: [],
    schemaVersion: '1.0',
    ...over,
  };
}

runBaselineSuite({
  fn: normalizeCustomMetadataType,
  taskId: 'PH5.5',
  nodeType: 'CustomMetadataTypeIR',
  validFinding: validCMT,
  malformedFinding: null,
  renameMutation: (f) => ({ ...f, artifactId: 'a0V3x00000newid' }),
  contentChangeMutation: (f) => ({ ...f, countValue: (f.countValue ?? 0) + 5 }),
});
