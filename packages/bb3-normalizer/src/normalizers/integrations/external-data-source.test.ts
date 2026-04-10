import { normalizeExternalDataSource } from './external-data-source.ts';
import type { AssessmentFindingInput } from '@revbrain/contract';
import { runBaselineSuite } from '../__test-helpers__/baseline.ts';

function validEDS(over: Partial<AssessmentFindingInput> = {}): AssessmentFindingInput {
  return {
    domain: 'integration',
    collectorName: 'integration',
    artifactType: 'ExternalDataSource',
    artifactName: 'Legacy_ERP',
    findingKey: 'eds-1',
    sourceType: 'metadata',
    detected: true,
    textValue: 'https://erp.legacy.internal/api',
    notes: 'odata',
    evidenceRefs: [],
    schemaVersion: '1.0',
    ...over,
  };
}

runBaselineSuite({
  fn: normalizeExternalDataSource,
  taskId: 'PH6.7',
  nodeType: 'ExternalDataSource',
  validFinding: validEDS,
  malformedFinding: null,
  renameMutation: (f) => ({ ...f, artifactId: 'a0V3x00000newid' }),
  contentChangeMutation: (f) => ({ ...f, notes: 'custom' }),
});
