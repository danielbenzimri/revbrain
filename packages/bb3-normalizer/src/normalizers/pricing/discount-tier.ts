/**
 * DiscountTierIR normalizer.
 *
 * Spec: §5.3 DiscountTierIR.
 */

import type { AssessmentFindingInput } from '@revbrain/contract';
import type { IRNodeBase, NodeRef } from '@revbrain/migration-ir-contract';
import type { NormalizerFn } from '../registry.ts';
import { buildBaseNode, findEvidenceRef } from '../base.ts';

export interface DiscountTierIR extends IRNodeBase {
  nodeType: 'DiscountTier';
  parentSchedule: NodeRef;
  lowerBound: number;
  upperBound: number | null;
  discountRate: number;
  discountType: 'percent' | 'amount';
  currencyIsoCode: string | null;
}

export const normalizeDiscountTier: NormalizerFn = (finding: AssessmentFindingInput) => {
  const parentScheduleId = findEvidenceRef(finding, 'record-id') ?? '<unknown-schedule>';
  const parentSchedule: NodeRef = { id: parentScheduleId, resolved: true };
  const lowerBound = finding.countValue ?? 0;
  const discountRateRaw = finding.textValue ?? '0';
  const discountRate = Number.parseFloat(discountRateRaw) || 0;
  const discountType: DiscountTierIR['discountType'] = discountRateRaw.includes('%')
    ? 'percent'
    : 'amount';

  const stableIdentity = { parentScheduleId, lowerBound };
  const semanticPayload = { ...stableIdentity, discountRate, discountType };

  const base = buildBaseNode({
    finding,
    nodeType: 'DiscountTier',
    stableIdentity,
    semanticPayload,
  });

  const node: DiscountTierIR = {
    ...base,
    nodeType: 'DiscountTier',
    parentSchedule,
    lowerBound,
    upperBound: null,
    discountRate,
    discountType,
    currencyIsoCode: null,
  };
  return { nodes: [node] };
};
