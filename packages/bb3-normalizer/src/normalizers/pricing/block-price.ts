/**
 * BlockPriceIR normalizer (v1.2 multi-currency + pricebook collision fix).
 *
 * Spec: §5.3 BlockPriceIR, §7.2, PH4.7 card.
 *
 * v1.2 (Auditor 3 P1 #3): identity recipe expanded to include
 * currency + pricebook. The v1.0/v1.1 recipe (productCode +
 * lowerBound) would collide for block prices that differ only in
 * currency or pricebook.
 */

import type { AssessmentFindingInput } from '@revbrain/contract';
import type { IRNodeBase } from '@revbrain/migration-ir-contract';
import type { NormalizerFn } from '../registry.ts';
import { buildBaseNode, extractFieldValue, findEvidenceRef } from '../base.ts';

export interface BlockPriceIR extends IRNodeBase {
  nodeType: 'BlockPrice';
  productCode: string;
  lowerBound: number;
  upperBound: number | null;
  price: number;
  currencyIsoCode: string | null;
  pricebookNaturalKey: string;
}

export const normalizeBlockPrice: NormalizerFn = (finding: AssessmentFindingInput) => {
  // PH9 §8.3 — extract via canonical helper.
  const productCode =
    extractFieldValue(finding, 'Product2.ProductCode') ||
    extractFieldValue(finding, 'productCode') ||
    finding.artifactName ||
    finding.artifactId ||
    'unknown';
  const lowerBound = finding.countValue ?? 0;
  const price = Number.parseFloat(finding.textValue ?? '0') || 0;
  const currencyIsoCode = findEvidenceRef(finding, 'api-response');
  const pricebookNaturalKey = finding.sourceRef ?? '<standard>';

  // PH9 §8.3 — buildBaseNode adds the per-record discriminator.
  const stableIdentity = { productCode, lowerBound, currencyIsoCode, pricebookNaturalKey };
  const semanticPayload = { ...stableIdentity, price, upperBound: null };

  const base = buildBaseNode({
    finding,
    nodeType: 'BlockPrice',
    stableIdentity,
    semanticPayload,
  });

  const node: BlockPriceIR = {
    ...base,
    nodeType: 'BlockPrice',
    productCode,
    lowerBound,
    upperBound: null,
    price,
    currencyIsoCode,
    pricebookNaturalKey,
  };
  return { nodes: [node] };
};
