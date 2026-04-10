import { normalizeSummaryVariable } from './summary-variable.ts';
import type { AssessmentFindingInput } from '@revbrain/contract';
import { runBaselineSuite } from '../__test-helpers__/baseline.ts';

function validSV(over: Partial<AssessmentFindingInput> = {}): AssessmentFindingInput {
  return {
    domain: 'pricing',
    collectorName: 'pricing',
    artifactType: 'SBQQ__SummaryVariable__c',
    artifactName: 'Total_Quote_Amount',
    findingKey: 'sv-1',
    sourceType: 'object',
    detected: true,
    notes: 'Sum',
    sourceRef: 'SBQQ__QuoteLine__c',
    evidenceRefs: [],
    schemaVersion: '1.0',
    ...over,
  };
}

runBaselineSuite({
  fn: normalizeSummaryVariable,
  taskId: 'PH4.6',
  nodeType: 'SummaryVariable',
  validFinding: validSV,
  malformedFinding: null,
  // Identity = developerName (derived from artifactName). Per spec
  // §5.2 the baseline default rename does change id for metadata-
  // backed types; override to mutate a non-identity field.
  renameMutation: (f) => ({ ...f, artifactId: 'a0V3x00000newid' }),
  contentChangeMutation: (f) => ({ ...f, notes: 'Max' }),
});
