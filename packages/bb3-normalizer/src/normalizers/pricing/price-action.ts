/**
 * PriceActionIR normalizer.
 *
 * Spec: §5.3 PriceActionIR, §7.2.
 *
 * Identity recipe: ownerRule.id + SBQQ__Order__c (or structural
 * content fallback when SBQQ__Order__c is null).
 */

import type { AssessmentFindingInput } from '@revbrain/contract';
import type { FieldRefIR, IRNodeBase, NodeRef } from '@revbrain/migration-ir-contract';
import type { NormalizerFn } from '../registry.ts';
import { buildBaseNode, findEvidenceRef } from '../base.ts';

export interface PriceActionIR extends IRNodeBase {
  nodeType: 'PriceAction';
  ownerRule: NodeRef;
  actionType:
    | 'set-discount-pct'
    | 'set-discount-amt'
    | 'set-price'
    | 'set-unit-price'
    | 'set-field'
    | 'add-charge'
    | 'formula-result'
    | 'unknown';
  targetField: FieldRefIR | null;
  value: string | number | null;
  currencyIsoCode: string | null;
  sbqqOrder: number | null;
}

function parseActionType(raw: string | null): PriceActionIR['actionType'] {
  if (!raw) return 'unknown';
  const lower = raw.toLowerCase();
  if (lower.includes('discount') && lower.includes('percent')) return 'set-discount-pct';
  if (lower.includes('discount') && lower.includes('amount')) return 'set-discount-amt';
  if (lower.includes('unit')) return 'set-unit-price';
  if (lower.includes('price')) return 'set-price';
  if (lower.includes('charge')) return 'add-charge';
  if (lower.includes('formula')) return 'formula-result';
  if (lower.includes('field')) return 'set-field';
  return 'unknown';
}

export const normalizePriceAction: NormalizerFn = (finding: AssessmentFindingInput) => {
  const sbqqOrder = finding.countValue ?? null;
  const ownerRuleId = findEvidenceRef(finding, 'record-id') ?? '<unknown-rule>';
  const ownerRule: NodeRef = { id: ownerRuleId, resolved: true };
  const actionType = parseActionType(finding.notes ?? null);
  const value = finding.textValue ?? null;

  const stableIdentity =
    sbqqOrder !== null
      ? { ownerRuleId, sbqqOrder }
      : { ownerRuleId, structuralContent: { actionType, value } };
  const semanticPayload = { ...stableIdentity, actionType, value };

  const base = buildBaseNode({
    finding,
    nodeType: 'PriceAction',
    stableIdentity,
    semanticPayload,
  });

  const node: PriceActionIR = {
    ...base,
    nodeType: 'PriceAction',
    ownerRule,
    actionType,
    targetField: null,
    value,
    currencyIsoCode: null,
    sbqqOrder,
  };
  return { nodes: [node] };
};
