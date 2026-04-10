/**
 * ApprovalChainRuleIR normalizer (Advanced Approvals / sbaa). Spec: §5.3, §7.6.
 */

import type { AssessmentFindingInput } from '@revbrain/contract';
import type { IRNodeBase, NodeRef } from '@revbrain/migration-ir-contract';
import type { NormalizerFn } from '../registry.ts';
import { buildBaseNode, findEvidenceRef } from '../base.ts';

export interface ApprovalChainRuleIR extends IRNodeBase {
  nodeType: 'ApprovalChainRule';
  targetObject: string;
  conditionCount: number;
  approverCount: number;
  apexApprover: NodeRef | null;
  isActive: boolean;
}

export const normalizeApprovalChainRule: NormalizerFn = (finding: AssessmentFindingInput) => {
  const developerName = finding.artifactName;
  const targetObject = findEvidenceRef(finding, 'object-ref') ?? 'SBQQ__Quote__c';
  const conditionCount = finding.countValue ?? 0;
  const approverCount = 0;
  const isActive = finding.detected;

  const stableIdentity = { targetObject, developerName };
  const semanticPayload = { ...stableIdentity, conditionCount, approverCount, isActive };

  const base = buildBaseNode({
    finding,
    nodeType: 'ApprovalChainRule',
    stableIdentity,
    semanticPayload,
    developerName,
  });
  // Namespace is forced to 'sbaa' per the PH6.3 non-negotiable.
  base.namespace = 'sbaa';
  const node: ApprovalChainRuleIR = {
    ...base,
    nodeType: 'ApprovalChainRule',
    targetObject,
    conditionCount,
    approverCount,
    apexApprover: null,
    isActive,
  };
  return { nodes: [node] };
};
