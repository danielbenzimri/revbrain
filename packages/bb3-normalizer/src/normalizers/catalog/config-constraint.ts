/**
 * ConfigConstraintIR normalizer (ProductRule + OptionConstraint).
 *
 * Spec: §5.3 ConfigConstraintIR, §7.1.
 */

import type { AssessmentFindingInput } from '@revbrain/contract';
import {
  structuralSignature,
  type IRNodeBase,
  type NodeRef,
} from '@revbrain/migration-ir-contract';
import type { NormalizerFn } from '../registry.ts';
import { buildBaseNode } from '../base.ts';

export interface ConfigConstraintIR extends IRNodeBase {
  nodeType: 'ConfigConstraint';
  sourceCategory: 'ProductRule' | 'OptionConstraint';
  ruleType: 'selection' | 'validation' | 'alert' | 'filter' | null;
  evaluationEvent: 'always' | 'on-init' | 'save' | 'edit' | 'unknown';
  isActive: boolean;
  scopeProducts: NodeRef[];
  conditions: NodeRef[];
  actions: NodeRef[];
  errorMessage: string | null;
}

function parseRuleType(raw: string | null): ConfigConstraintIR['ruleType'] {
  if (!raw) return null;
  const lower = raw.toLowerCase();
  if (lower.includes('selection')) return 'selection';
  if (lower.includes('validation')) return 'validation';
  if (lower.includes('alert')) return 'alert';
  if (lower.includes('filter')) return 'filter';
  return null;
}

function parseEvaluationEvent(raw: string | null): ConfigConstraintIR['evaluationEvent'] {
  if (!raw) return 'unknown';
  const lower = raw.toLowerCase();
  if (lower.includes('always')) return 'always';
  if (lower.includes('on init') || lower.includes('on-init')) return 'on-init';
  if (lower.includes('save')) return 'save';
  if (lower.includes('edit')) return 'edit';
  return 'unknown';
}

export const normalizeConfigConstraint: NormalizerFn = (finding: AssessmentFindingInput) => {
  const sourceCategory: ConfigConstraintIR['sourceCategory'] = finding.artifactType
    .toLowerCase()
    .includes('product')
    ? 'ProductRule'
    : 'OptionConstraint';
  const ruleType = parseRuleType(finding.notes ?? null);
  const evaluationEvent = parseEvaluationEvent(finding.sourceRef ?? null);
  const isActive = finding.detected;

  const signature = structuralSignature({
    parentObject: 'SBQQ__ProductRule__c',
    evaluationScope: evaluationEvent,
    evaluationOrder: finding.countValue ?? null,
    conditionLogic: 'all',
    contextScope: sourceCategory,
    conditions: [],
    actions: [],
  });

  const stableIdentity = { sourceCategory, signature };
  const semanticPayload = { ...stableIdentity, ruleType, evaluationEvent, isActive };

  const base = buildBaseNode({
    finding,
    nodeType: 'ConfigConstraint',
    stableIdentity,
    semanticPayload,
  });

  const node: ConfigConstraintIR = {
    ...base,
    nodeType: 'ConfigConstraint',
    sourceCategory,
    ruleType,
    evaluationEvent,
    isActive,
    scopeProducts: [],
    conditions: [],
    actions: [],
    errorMessage: finding.textValue ?? null,
  };
  return { nodes: [node] };
};
