/**
 * WorkflowRuleAutomationIR normalizer (v1.2 variant).
 *
 * Spec: §5.3 WorkflowRuleAutomationIR, §7.3.
 */

import type { AssessmentFindingInput } from '@revbrain/contract';
import type {
  FieldRefIR,
  NodeRef,
  WorkflowRuleAutomationIR,
} from '@revbrain/migration-ir-contract';
import type { NormalizerFn } from '../registry.ts';
import { buildBaseNode, findEvidenceRef } from '../base.ts';

function parseEvaluationCriteria(
  raw: string | null
): WorkflowRuleAutomationIR['evaluationCriteria'] {
  if (!raw) return 'unknown';
  const lower = raw.toLowerCase();
  if (lower.includes('edit')) return 'on-create-or-triggered-on-edit';
  if (lower.includes('update')) return 'on-create-or-update';
  if (lower.includes('create')) return 'on-create';
  return 'unknown';
}

export const normalizeWorkflowRule: NormalizerFn = (finding: AssessmentFindingInput) => {
  const developerName = finding.artifactName;
  const targetObject = findEvidenceRef(finding, 'object-ref') ?? '<unknown>';
  const evaluationCriteria = parseEvaluationCriteria(finding.notes ?? null);
  const criteriaFormula = finding.textValue ?? null;
  const isActive = finding.detected;

  const stableIdentity = {
    sourceType: 'WorkflowRule' as const,
    targetObject,
    developerName,
  };
  const semanticPayload = { ...stableIdentity, evaluationCriteria, criteriaFormula, isActive };

  const base = buildBaseNode({
    finding,
    nodeType: 'Automation',
    stableIdentity,
    semanticPayload,
    developerName,
  });

  const node: WorkflowRuleAutomationIR = {
    ...base,
    nodeType: 'Automation',
    sourceType: 'WorkflowRule',
    sbqqFieldRefs: [] as FieldRefIR[],
    writtenFields: [] as FieldRefIR[],
    relatedRules: [] as NodeRef[],
    targetObject,
    evaluationCriteria,
    criteriaFormula,
    fieldUpdates: [],
    isActive,
  };
  return { nodes: [node] };
};
