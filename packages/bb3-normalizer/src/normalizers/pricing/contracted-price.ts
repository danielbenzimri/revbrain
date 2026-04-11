/**
 * ContractedPriceIR normalizer (v1.2 discountSchedule link + currency identity).
 *
 * Spec: §5.3 ContractedPriceIR, §7.2, PH4.8 card.
 */

import type { AssessmentFindingInput } from '@revbrain/contract';
import type { IRNodeBase, NodeRef } from '@revbrain/migration-ir-contract';
import type { NormalizerFn } from '../registry.ts';
import { buildBaseNode, extractFieldValue, findEvidenceRef } from '../base.ts';

export interface ContractedPriceIR extends IRNodeBase {
  nodeType: 'ContractedPrice';
  productCode: string;
  scopeType: 'account' | 'account-hierarchy' | 'opportunity' | 'unknown';
  scopeKey: string;
  price: number | null;
  currencyIsoCode: string | null;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  discountSchedule: NodeRef | null;
}

function parseScopeType(raw: string | null): ContractedPriceIR['scopeType'] {
  if (!raw) return 'unknown';
  const lower = raw.toLowerCase();
  if (lower.includes('hierarchy')) return 'account-hierarchy';
  if (lower.includes('account')) return 'account';
  if (lower.includes('opportunity')) return 'opportunity';
  return 'unknown';
}

export const normalizeContractedPrice: NormalizerFn = (finding: AssessmentFindingInput) => {
  // PH9 §8.3 — extract via canonical helper.
  const productCode =
    extractFieldValue(finding, 'Product2.ProductCode') ||
    extractFieldValue(finding, 'productCode') ||
    finding.artifactName ||
    finding.artifactId ||
    'unknown';
  const scopeType = parseScopeType(finding.notes ?? null);
  const scopeKey = findEvidenceRef(finding, 'object-ref') ?? '<unknown-scope>';
  const currencyIsoCode = findEvidenceRef(finding, 'api-response');
  const price = finding.textValue ? Number.parseFloat(finding.textValue) : null;
  const discountScheduleId = findEvidenceRef(finding, 'record-id');

  // Warn when scope is unstable.
  const warnings: string[] = [];
  if (scopeKey === '<unknown-scope>') warnings.push('contracted-price-scope-unstable');

  // PH9 §8.3 — buildBaseNode adds the per-record discriminator.
  const stableIdentity = { productCode, scopeType, scopeKey, currencyIsoCode };
  const semanticPayload = {
    ...stableIdentity,
    price,
    discountScheduleId,
  };

  const base = buildBaseNode({
    finding,
    nodeType: 'ContractedPrice',
    stableIdentity,
    semanticPayload,
    warnings,
  });

  const node: ContractedPriceIR = {
    ...base,
    nodeType: 'ContractedPrice',
    productCode,
    scopeType,
    scopeKey,
    price: Number.isFinite(price ?? NaN) ? price : null,
    currencyIsoCode,
    effectiveFrom: null,
    effectiveTo: null,
    discountSchedule: discountScheduleId ? { id: discountScheduleId, resolved: true } : null,
  };
  return { nodes: [node] };
};
