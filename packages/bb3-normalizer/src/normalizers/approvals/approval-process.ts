/**
 * ApprovalProcessIR normalizer. Spec: §5.3 ApprovalProcessIR, §7.6.
 */

import type { AssessmentFindingInput } from '@revbrain/contract';
import type { IRNodeBase } from '@revbrain/migration-ir-contract';
import type { NormalizerFn } from '../registry.ts';
import { buildBaseNode, findEvidenceRef } from '../base.ts';
import type { FormulaIR } from '../formula/formula-field.ts';

export interface ApprovalProcessIR extends IRNodeBase {
  nodeType: 'ApprovalProcess';
  targetObject: string;
  entryCriteria: FormulaIR | null;
  stepCount: number;
  isActive: boolean;
  approverTypes: Array<'user' | 'role' | 'queue' | 'formula' | 'related-user'>;
}

export const normalizeApprovalProcess: NormalizerFn = (finding: AssessmentFindingInput) => {
  const developerName = finding.artifactName;
  const targetObject = findEvidenceRef(finding, 'object-ref') ?? '<unknown>';
  const stepCount = finding.countValue ?? 0;
  const isActive = finding.detected;

  const stableIdentity = { targetObject, developerName };
  const semanticPayload = { ...stableIdentity, stepCount, isActive };

  const base = buildBaseNode({
    finding,
    nodeType: 'ApprovalProcess',
    stableIdentity,
    semanticPayload,
    developerName,
  });
  const node: ApprovalProcessIR = {
    ...base,
    nodeType: 'ApprovalProcess',
    targetObject,
    entryCriteria: null,
    stepCount,
    isActive,
    approverTypes: [],
  };
  return { nodes: [node] };
};
