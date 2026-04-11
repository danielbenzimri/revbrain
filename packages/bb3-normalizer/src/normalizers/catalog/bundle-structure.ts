/**
 * BundleStructureIR normalizer (v1.1 parentProductId: NodeRef fix).
 *
 * Spec: §5.3 BundleStructureIR, §7.1.
 */

import type { AssessmentFindingInput } from '@revbrain/contract';
import type { IRNodeBase, NodeRef } from '@revbrain/migration-ir-contract';
import type { NormalizerFn } from '../registry.ts';
import { buildBaseNode, extractFieldValue } from '../base.ts';

export interface BundleStructureIR extends IRNodeBase {
  nodeType: 'BundleStructure';
  parentProductId: NodeRef;
  parentProductCode: string | null;
  configurationType: 'Required' | 'Allowed' | 'None' | 'unknown';
  options: NodeRef[];
  features: NodeRef[];
  constraints: NodeRef[];
  configurationAttributes: NodeRef[];
}

function parseConfigType(raw: string | null): BundleStructureIR['configurationType'] {
  if (!raw) return 'unknown';
  const lower = raw.toLowerCase();
  if (lower.includes('required')) return 'Required';
  if (lower.includes('allowed')) return 'Allowed';
  if (lower.includes('none')) return 'None';
  return 'unknown';
}

export const normalizeBundleStructure: NormalizerFn = (finding: AssessmentFindingInput) => {
  // PH9 §8.3 — read the actual ProductCode value via the canonical helper.
  const parentProductCode =
    extractFieldValue(finding, 'Product2.ProductCode') ||
    extractFieldValue(finding, 'parentProductCode') ||
    finding.artifactName ||
    finding.artifactId ||
    'unknown';
  const parentProductId: NodeRef = { id: `product:${parentProductCode}`, resolved: true };
  const configurationType = parseConfigType(finding.notes ?? null);

  // PH9 §8.3 — buildBaseNode adds the per-record discriminator.
  const stableIdentity = { parentProductCode };
  const semanticPayload = { ...stableIdentity, configurationType };

  const base = buildBaseNode({
    finding,
    nodeType: 'BundleStructure',
    stableIdentity,
    semanticPayload,
  });

  const node: BundleStructureIR = {
    ...base,
    nodeType: 'BundleStructure',
    parentProductId,
    parentProductCode,
    configurationType,
    options: [],
    features: [],
    constraints: [],
    configurationAttributes: [],
  };
  return { nodes: [node] };
};
