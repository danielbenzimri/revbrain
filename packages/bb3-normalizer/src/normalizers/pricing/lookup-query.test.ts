import { normalizeLookupQuery } from './lookup-query.ts';
import type { AssessmentFindingInput } from '@revbrain/contract';
import { runBaselineSuite } from '../__test-helpers__/baseline.ts';

function validLQ(over: Partial<AssessmentFindingInput> = {}): AssessmentFindingInput {
  return {
    domain: 'pricing',
    collectorName: 'pricing',
    artifactType: 'SBQQ__LookupQuery__c',
    artifactName: 'FindActiveProducts',
    findingKey: 'lq-1',
    sourceType: 'object',
    detected: true,
    textValue: 'SELECT Id, Name, IsActive FROM Product2 WHERE IsActive = true',
    evidenceRefs: [],
    schemaVersion: '1.0',
    ...over,
  };
}

runBaselineSuite({
  fn: normalizeLookupQuery,
  taskId: 'PH4.9',
  nodeType: 'LookupQuery',
  validFinding: validLQ,
  malformedFinding: null,
  // Identity = developerName = artifactName. Override rename to
  // mutate a non-identity field so both id and contentHash stay
  // stable for the baseline rename assertion.
  renameMutation: (f) => ({ ...f, artifactId: 'a0V3x00000newid' }),
  // Changing the raw SOQL bumps contentHash while preserving id.
  // Use a mutation that keeps the FROM object the same (LookupQuery
  // identity is developerName alone, not query shape) but that
  // isn't identical to the original text.
  contentChangeMutation: (f) => ({
    ...f,
    textValue: 'SELECT Id, Name, IsActive, Family FROM Product2 WHERE IsActive = true',
  }),
});
