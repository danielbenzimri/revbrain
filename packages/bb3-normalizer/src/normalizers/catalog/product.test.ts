import { normalizeProduct } from './product.ts';
import type { AssessmentFindingInput } from '@revbrain/contract';
import { runBaselineSuite } from '../__test-helpers__/baseline.ts';

function validProduct(over: Partial<AssessmentFindingInput> = {}): AssessmentFindingInput {
  return {
    domain: 'catalog',
    collectorName: 'catalog',
    artifactType: 'Product2',
    artifactName: 'Premium Subscription',
    findingKey: 'p-1',
    sourceType: 'object',
    detected: true,
    notes: 'List',
    sourceRef: 'Renewable',
    evidenceRefs: [{ type: 'field-ref', value: 'PROD-001' }],
    schemaVersion: '1.0',
    ...over,
  };
}

runBaselineSuite({
  fn: normalizeProduct,
  taskId: 'PH4.10',
  nodeType: 'Product',
  validFinding: validProduct,
  malformedFinding: null,
  contentChangeMutation: (f) => ({ ...f, notes: 'Block' }),
});
