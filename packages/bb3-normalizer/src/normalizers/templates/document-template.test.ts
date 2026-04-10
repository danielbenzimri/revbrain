import { normalizeDocumentTemplate } from './document-template.ts';
import type { AssessmentFindingInput } from '@revbrain/contract';
import { runBaselineSuite } from '../__test-helpers__/baseline.ts';

function validDT(over: Partial<AssessmentFindingInput> = {}): AssessmentFindingInput {
  return {
    domain: 'templates',
    collectorName: 'templates',
    artifactType: 'SBQQ__QuoteTemplate__c',
    artifactName: 'Standard_Quote_Template',
    findingKey: 'dt-1',
    sourceType: 'object',
    detected: true,
    notes: 'default',
    sourceRef: '2026-04-01',
    evidenceRefs: [],
    schemaVersion: '1.0',
    ...over,
  };
}

runBaselineSuite({
  fn: normalizeDocumentTemplate,
  taskId: 'PH6.4',
  nodeType: 'DocumentTemplate',
  validFinding: validDT,
  malformedFinding: null,
  renameMutation: (f) => ({ ...f, artifactId: 'a0V3x00000newid' }),
  // isDefault parses 'default' anywhere in notes; use a token that
  // doesn't include 'default' to actually flip the flag.
  contentChangeMutation: (f) => ({ ...f, notes: 'custom template' }),
});
