import { normalizeQuoteTermBlock } from './quote-term-block.ts';
import type { AssessmentFindingInput } from '@revbrain/contract';
import { runBaselineSuite } from '../__test-helpers__/baseline.ts';

function validQTB(over: Partial<AssessmentFindingInput> = {}): AssessmentFindingInput {
  return {
    domain: 'templates',
    collectorName: 'templates',
    artifactType: 'SBQQ__QuoteTerm__c',
    artifactName: 'Standard_Terms',
    findingKey: 'qtb-1',
    sourceType: 'object',
    detected: true,
    textValue: 'This quote is valid for 30 days from the issue date.',
    evidenceRefs: [],
    schemaVersion: '1.0',
    ...over,
  };
}

runBaselineSuite({
  fn: normalizeQuoteTermBlock,
  taskId: 'PH6.5',
  nodeType: 'QuoteTermBlock',
  validFinding: validQTB,
  malformedFinding: null,
  renameMutation: (f) => ({ ...f, artifactId: 'a0V3x00000newid' }),
  contentChangeMutation: (f) => ({
    ...f,
    textValue: 'This quote is valid for 45 days from the issue date.',
  }),
});
