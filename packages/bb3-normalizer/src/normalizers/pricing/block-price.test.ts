import { describe, expect, it } from 'vitest';
import { normalizeBlockPrice } from './block-price.ts';
import type { AssessmentFindingInput } from '@revbrain/contract';
import { runBaselineSuite } from '../__test-helpers__/baseline.ts';
import { prepareCatalog } from '../../stages/s2-5-schema-catalog.ts';

function validBP(over: Partial<AssessmentFindingInput> = {}): AssessmentFindingInput {
  return {
    domain: 'pricing',
    collectorName: 'pricing',
    artifactType: 'SBQQ__BlockPrice__c',
    artifactName: 'Product-A-Block-10',
    findingKey: 'bp-1',
    sourceType: 'object',
    detected: true,
    countValue: 10,
    textValue: '9.99',
    sourceRef: 'StandardPriceBook',
    evidenceRefs: [
      { type: 'field-ref', value: 'PROD-A' },
      { type: 'api-response', value: 'USD' },
    ],
    schemaVersion: '1.0',
    ...over,
  };
}

runBaselineSuite({
  fn: normalizeBlockPrice,
  taskId: 'PH4.7',
  nodeType: 'BlockPrice',
  validFinding: validBP,
  malformedFinding: null,
  contentChangeMutation: (f) => ({ ...f, textValue: '12.50' }),
});

describe('PH4.7 — BlockPrice currency + pricebook in identity', () => {
  const ctx = { catalog: prepareCatalog(), diagnostics: [] };

  it('different currency → different id', () => {
    const a = normalizeBlockPrice(validBP(), ctx).nodes[0]!;
    const b = normalizeBlockPrice(
      validBP({
        evidenceRefs: [
          { type: 'field-ref', value: 'PROD-A' },
          { type: 'api-response', value: 'EUR' },
        ],
      }),
      ctx
    ).nodes[0]!;
    expect(a.id).not.toBe(b.id);
  });

  it('different pricebook → different id', () => {
    const a = normalizeBlockPrice(validBP(), ctx).nodes[0]!;
    const b = normalizeBlockPrice(validBP({ sourceRef: 'EuropeanPriceBook' }), ctx).nodes[0]!;
    expect(a.id).not.toBe(b.id);
  });
});
