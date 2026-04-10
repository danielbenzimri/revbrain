/**
 * BundleFeatureIR normalizer.
 *
 * Spec: §5.3 BundleFeatureIR.
 */

import type { AssessmentFindingInput } from '@revbrain/contract';
import type { IRNodeBase, NodeRef } from '@revbrain/migration-ir-contract';
import type { NormalizerFn } from '../registry.ts';
import { buildBaseNode, findEvidenceRef } from '../base.ts';

export interface BundleFeatureIR extends IRNodeBase {
  nodeType: 'BundleFeature';
  parentBundle: NodeRef;
  category: string | null;
  minOptionCount: number | null;
  maxOptionCount: number | null;
  number: number;
}

export const normalizeBundleFeature: NormalizerFn = (finding: AssessmentFindingInput) => {
  const parentProductCode = findEvidenceRef(finding, 'object-ref') ?? '<unknown-bundle>';
  const number = finding.countValue ?? 0;
  const developerName = finding.artifactName;

  const stableIdentity = { parentProductCode, developerName, number };
  const semanticPayload = {
    ...stableIdentity,
    category: finding.notes ?? null,
  };

  const base = buildBaseNode({
    finding,
    nodeType: 'BundleFeature',
    stableIdentity,
    semanticPayload,
  });

  const node: BundleFeatureIR = {
    ...base,
    nodeType: 'BundleFeature',
    parentBundle: { id: `bundle:${parentProductCode}`, resolved: true },
    category: finding.notes ?? null,
    minOptionCount: null,
    maxOptionCount: null,
    number,
  };
  return { nodes: [node] };
};
