/**
 * BundleOptionIR normalizer.
 *
 * Spec: §5.3 BundleOptionIR, §7.1.
 * Identity: parentProductCode + optionProductCode + SBQQ__Number__c.
 */

import type { AssessmentFindingInput } from '@revbrain/contract';
import type { IRNodeBase, NodeRef } from '@revbrain/migration-ir-contract';
import type { NormalizerFn } from '../registry.ts';
import { buildBaseNode, extractFieldValue, findEvidenceRef } from '../base.ts';

export interface BundleOptionIR extends IRNodeBase {
  nodeType: 'BundleOption';
  parentBundle: NodeRef;
  optionProduct: NodeRef;
  number: number;
  quantity: number;
  required: boolean;
  selected: boolean;
  optionType: 'component' | 'accessory' | 'related-product' | 'option' | 'unknown';
  bundled: boolean;
  discountedByPackage: boolean;
  feature: NodeRef | null;
}

function parseOptionType(raw: string | null): BundleOptionIR['optionType'] {
  if (!raw) return 'unknown';
  const lower = raw.toLowerCase();
  if (lower.includes('component')) return 'component';
  if (lower.includes('accessory')) return 'accessory';
  if (lower.includes('related')) return 'related-product';
  if (lower.includes('option')) return 'option';
  return 'unknown';
}

export const normalizeBundleOption: NormalizerFn = (finding: AssessmentFindingInput) => {
  // PH9 §8.3 — extract via the canonical helper. The 'object-ref'
  // call is unaffected (object-ref evidence carries the value as
  // 'value' by convention).
  const parentProductCode = findEvidenceRef(finding, 'object-ref') ?? '<unknown-bundle>';
  const optionProductCode =
    extractFieldValue(finding, 'OptionalSKU.ProductCode') ||
    extractFieldValue(finding, 'optionProductCode') ||
    finding.artifactName ||
    finding.artifactId ||
    'unknown';
  const number = finding.countValue ?? 0;
  const optionType = parseOptionType(finding.notes ?? null);

  // PH9 §8.3 — buildBaseNode adds the per-record discriminator.
  const stableIdentity = { parentProductCode, optionProductCode, number };
  const semanticPayload = { ...stableIdentity, optionType };

  const base = buildBaseNode({
    finding,
    nodeType: 'BundleOption',
    stableIdentity,
    semanticPayload,
  });

  const node: BundleOptionIR = {
    ...base,
    nodeType: 'BundleOption',
    parentBundle: { id: `bundle:${parentProductCode}`, resolved: true },
    optionProduct: { id: `product:${optionProductCode}`, resolved: true },
    number,
    quantity: 1,
    required: false,
    selected: false,
    optionType,
    bundled: false,
    discountedByPackage: false,
    feature: null,
  };
  return { nodes: [node] };
};
