import { normalizeCustomMetadataRecord } from './custom-metadata-record.ts';
import type { AssessmentFindingInput } from '@revbrain/contract';
import { runBaselineSuite } from '../__test-helpers__/baseline.ts';

function validCMTRecord(over: Partial<AssessmentFindingInput> = {}): AssessmentFindingInput {
  return {
    domain: 'customization',
    collectorName: 'customizations',
    artifactType: 'CustomMetadataRecord',
    artifactName: 'TaxRate.US_Sales_Tax',
    artifactId: 'm0123000000ABCDE',
    findingKey: 'customizations:CustomMetadataRecord:m0123000000ABCDE',
    sourceType: 'tooling',
    detected: true,
    notes: 'TaxRate__mdt record: US Sales Tax',
    evidenceRefs: [
      { type: 'object-ref', value: 'TaxRate__mdt', label: 'US_Sales_Tax' },
      { type: 'field-ref', value: 'TaxRate__mdt.Rate__c', label: '0.0875' },
      { type: 'field-ref', value: 'TaxRate__mdt.Country__c', label: 'US' },
    ],
    schemaVersion: '1.0',
    ...over,
  };
}

runBaselineSuite({
  fn: normalizeCustomMetadataRecord,
  taskId: 'EXT-1.3',
  nodeType: 'CustomMetadataRecordIR',
  validFinding: validCMTRecord,
  malformedFinding: null,
  // Custom rename mutation: this normalizer's identity is
  // (parentTypeName, developerName) which both derive from
  // artifactName, so the default rename (which mutates
  // artifactName) WOULD change identity. The "rename invariant"
  // for CMT records is sandbox refresh: artifactId changes (new
  // SF record id) but the developer name stays constant. The
  // BB-3 buildBaseNode auto-discriminator picks developerName
  // (not artifactId) when developerName is supplied, so the
  // rename test sandbox-refresh case still passes.
  renameMutation: (f) => ({ ...f, artifactId: 'm0123000000NEWID' }),
  contentChangeMutation: (f) => ({
    ...f,
    evidenceRefs: [
      ...(f.evidenceRefs ?? []),
      { type: 'field-ref', value: 'TaxRate__mdt.Notes__c', label: 'edited' },
    ],
  }),
});
