import { normalizeProduct } from './product.ts';
import type { AssessmentFindingInput } from '@revbrain/contract';
import { runBaselineSuite } from '../__test-helpers__/baseline.ts';

function validProduct(over: Partial<AssessmentFindingInput> = {}): AssessmentFindingInput {
  return {
    domain: 'catalog',
    collectorName: 'catalog',
    artifactType: 'Product2',
    artifactName: 'Premium Subscription',
    artifactId: '01t3x000008zVqPAAU',
    findingKey: 'p-1',
    sourceType: 'object',
    detected: true,
    notes: 'List',
    sourceRef: 'Renewable',
    // PH9 §8.3 — match the real catalog collector's evidence shape:
    // canonical `field-ref` puts the field PATH in `value` and the
    // actual data in `label`. See apps/worker/src/collectors/catalog.ts:178-187.
    evidenceRefs: [
      {
        type: 'record-id',
        value: '01t3x000008zVqPAAU',
        label: 'Premium Subscription',
        referencedObjects: ['Product2'],
      },
      { type: 'field-ref', value: 'Product2.Family', label: 'Software' },
      { type: 'field-ref', value: 'Product2.ProductCode', label: 'PROD-001' },
    ],
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
