/**
 * ProductIR normalizer.
 *
 * Spec: §5.3 ProductIR, §7.1.
 */

import type { AssessmentFindingInput } from '@revbrain/contract';
import type { IRNodeBase, NodeRef } from '@revbrain/migration-ir-contract';
import type { NormalizerFn } from '../registry.ts';
import { buildBaseNode, extractFieldValue } from '../base.ts';

export interface ProductIR extends IRNodeBase {
  nodeType: 'Product';
  productCode: string;
  family: string | null;
  isActive: boolean;
  pricingMethod: 'list' | 'cost' | 'block' | 'percent-of-total' | 'unknown';
  subscriptionType: 'one-time' | 'renewable' | 'evergreen' | null;
  billingFrequency: 'monthly' | 'quarterly' | 'semiannual' | 'annual' | 'invoice-plan' | null;
  isExternallyConfigurable: boolean;
  hasConfigurationAttributes: boolean;
  isTaxable: boolean;
  bundleStructure: NodeRef | null;
}

function parsePricingMethod(raw: string | null): ProductIR['pricingMethod'] {
  if (!raw) return 'unknown';
  const lower = raw.toLowerCase();
  if (lower === 'list') return 'list';
  if (lower === 'cost') return 'cost';
  if (lower === 'block') return 'block';
  if (lower.includes('percent')) return 'percent-of-total';
  return 'unknown';
}

function parseSubscriptionType(raw: string | null): ProductIR['subscriptionType'] {
  if (!raw) return null;
  const lower = raw.toLowerCase();
  if (lower.includes('one')) return 'one-time';
  if (lower.includes('renew')) return 'renewable';
  if (lower.includes('evergreen')) return 'evergreen';
  return null;
}

export const normalizeProduct: NormalizerFn = (finding: AssessmentFindingInput) => {
  // PH9 §8.3 — Read the actual ProductCode value via the canonical
  // helper. Pre-fix this read the field PATH (`Product2.ProductCode`)
  // for every product → 178 of 179 staging products silently
  // collapsed via Stage 4 identity merging.
  const productCode =
    extractFieldValue(finding, 'Product2.ProductCode') ||
    finding.artifactName ||
    finding.artifactId ||
    'unknown';
  const isActive = finding.detected;
  const pricingMethod = parsePricingMethod(finding.notes ?? null);
  const subscriptionType = parseSubscriptionType(finding.sourceRef ?? null);

  // PH9 §8.3 — buildBaseNode automatically wraps this with a
  // per-record discriminator (artifactId). The recipe stays focused
  // on the semantic identity (productCode); discrimination is
  // automatic.
  const stableIdentity = { productCode };
  const semanticPayload = {
    ...stableIdentity,
    isActive,
    pricingMethod,
    subscriptionType,
  };

  const base = buildBaseNode({
    finding,
    nodeType: 'Product',
    stableIdentity,
    semanticPayload,
  });

  const node: ProductIR = {
    ...base,
    nodeType: 'Product',
    productCode,
    family: null,
    isActive,
    pricingMethod,
    subscriptionType,
    billingFrequency: null,
    isExternallyConfigurable: false,
    hasConfigurationAttributes: false,
    isTaxable: false,
    bundleStructure: null,
  };
  return { nodes: [node] };
};
