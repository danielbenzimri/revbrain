/**
 * PriceConditionIR normalizer.
 *
 * Spec: §5.3 PriceConditionIR, §7.2.
 *
 * Identity recipe: ownerRule.id + SBQQ__Index__c (or structural
 * content fallback when SBQQ__Index__c is null).
 */

import type { AssessmentFindingInput } from '@revbrain/contract';
import type { FieldRefIR, IRNodeBase, NodeRef } from '@revbrain/migration-ir-contract';
import type { NormalizerFn } from '../registry.ts';
import { buildBaseNode, findEvidenceRef } from '../base.ts';

export interface PriceConditionIR extends IRNodeBase {
  nodeType: 'PriceCondition';
  ownerRule: NodeRef;
  operandType: 'field-compare' | 'formula' | 'lookup-result' | 'aggregate' | 'literal';
  field: FieldRefIR | null;
  operator:
    | 'eq'
    | 'neq'
    | 'gt'
    | 'gte'
    | 'lt'
    | 'lte'
    | 'in'
    | 'contains'
    | 'starts-with'
    | 'unknown';
  value: string | number | boolean | string[] | null;
  sbqqIndex: number | null;
}

const OPERATOR_MAP: Record<string, PriceConditionIR['operator']> = {
  equals: 'eq',
  '=': 'eq',
  'not equal to': 'neq',
  '!=': 'neq',
  'greater than': 'gt',
  '>': 'gt',
  'greater or equal': 'gte',
  '>=': 'gte',
  'less than': 'lt',
  '<': 'lt',
  'less or equal': 'lte',
  '<=': 'lte',
  in: 'in',
  contains: 'contains',
  'starts with': 'starts-with',
};

function parseOperator(raw: string | null): PriceConditionIR['operator'] {
  if (!raw) return 'unknown';
  const lower = raw.toLowerCase().trim();
  return OPERATOR_MAP[lower] ?? 'unknown';
}

export const normalizePriceCondition: NormalizerFn = (finding: AssessmentFindingInput) => {
  const sbqqIndex = finding.countValue ?? null;
  const ownerRuleId = findEvidenceRef(finding, 'record-id') ?? '<unknown-rule>';
  const ownerRule: NodeRef = { id: ownerRuleId, resolved: true };
  const operator = parseOperator(finding.notes ?? null);
  const value = finding.textValue ?? null;

  const stableIdentity =
    sbqqIndex !== null
      ? { ownerRuleId, sbqqIndex }
      : { ownerRuleId, structuralContent: { operator, value } };
  const semanticPayload = { ...stableIdentity, operator, value };

  const base = buildBaseNode({
    finding,
    nodeType: 'PriceCondition',
    stableIdentity,
    semanticPayload,
  });

  const node: PriceConditionIR = {
    ...base,
    nodeType: 'PriceCondition',
    ownerRule,
    operandType: 'field-compare',
    field: null,
    operator,
    value,
    sbqqIndex,
  };
  return { nodes: [node] };
};
