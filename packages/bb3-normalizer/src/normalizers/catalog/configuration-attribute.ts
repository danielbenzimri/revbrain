/**
 * ConfigurationAttributeIR normalizer.
 *
 * Spec: §5.3 ConfigurationAttributeIR.
 */

import type { AssessmentFindingInput } from '@revbrain/contract';
import type { FieldRefIR, IRNodeBase, NodeRef } from '@revbrain/migration-ir-contract';
import type { NormalizerFn } from '../registry.ts';
import { buildBaseNode, findEvidenceRef } from '../base.ts';

export interface ConfigurationAttributeIR extends IRNodeBase {
  nodeType: 'ConfigurationAttribute';
  parentProduct: NodeRef;
  targetField: FieldRefIR | null;
  displayOrder: number;
  isRequired: boolean;
  defaultValue: string | null;
  picklistValues: string[] | null;
}

export const normalizeConfigurationAttribute: NormalizerFn = (finding: AssessmentFindingInput) => {
  const parentProductCode = findEvidenceRef(finding, 'object-ref') ?? '<unknown>';
  const developerName = finding.artifactName;
  const displayOrder = finding.countValue ?? 0;

  const stableIdentity = { parentProductCode, developerName };
  const semanticPayload = { ...stableIdentity, displayOrder };

  const base = buildBaseNode({
    finding,
    nodeType: 'ConfigurationAttribute',
    stableIdentity,
    semanticPayload,
  });

  const node: ConfigurationAttributeIR = {
    ...base,
    nodeType: 'ConfigurationAttribute',
    parentProduct: { id: `product:${parentProductCode}`, resolved: true },
    targetField: null,
    displayOrder,
    isRequired: false,
    defaultValue: finding.textValue ?? null,
    picklistValues: null,
  };
  return { nodes: [node] };
};
