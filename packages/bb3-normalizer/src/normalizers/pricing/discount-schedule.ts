/**
 * DiscountScheduleIR normalizer (v1.2 structural tier-shape identity).
 *
 * Spec: §5.3 DiscountScheduleIR, §7.2, PH4.4 card.
 *
 * v1.2 (Auditor 3 P1 #5): SBQQ__DiscountSchedule__c is a
 * managed-package custom object with no DeveloperName — only Name,
 * which admins can edit. v1.0/v1.1 used developerName as the
 * identity recipe; that silently fell back to Name slugs and
 * broke rename stability. v1.2 uses a structural tier-shape
 * signature as the id: { type, aggregateScope, tierBoundaries }.
 */

import type { AssessmentFindingInput } from '@revbrain/contract';
import type { IRNodeBase, NodeRef } from '@revbrain/migration-ir-contract';
import type { NormalizerFn } from '../registry.ts';
import { buildBaseNode } from '../base.ts';

export interface DiscountScheduleIR extends IRNodeBase {
  nodeType: 'DiscountSchedule';
  type: 'volume' | 'term' | 'unknown';
  aggregateScope: 'unit' | 'total' | 'none' | 'unknown';
  tiers: NodeRef[];
  displayNameFromSource: string | null;
}

function parseType(raw: string | null): DiscountScheduleIR['type'] {
  if (!raw) return 'unknown';
  const lower = raw.toLowerCase();
  if (lower.includes('volume')) return 'volume';
  if (lower.includes('term')) return 'term';
  return 'unknown';
}

function parseAggregate(raw: string | null): DiscountScheduleIR['aggregateScope'] {
  if (!raw) return 'unknown';
  const lower = raw.toLowerCase();
  if (lower.includes('unit')) return 'unit';
  if (lower.includes('total')) return 'total';
  if (lower.includes('none')) return 'none';
  return 'unknown';
}

export const normalizeDiscountSchedule: NormalizerFn = (finding: AssessmentFindingInput) => {
  const type = parseType(finding.notes ?? null);
  const aggregateScope = parseAggregate(finding.sourceRef ?? null);
  // `countValue` is treated as the number of tiers; actual tier
  // bounds are populated in Stage 4 once DiscountTierIR children
  // are linked. For PH4.4 identity, use a placeholder sorted array.
  const tierBoundaries: number[] = [];

  const stableIdentity = { type, aggregateScope, tierBoundaries };
  const semanticPayload = {
    ...stableIdentity,
    tierCount: finding.countValue ?? 0,
  };

  const base = buildBaseNode({
    finding,
    nodeType: 'DiscountSchedule',
    stableIdentity,
    semanticPayload,
  });

  const node: DiscountScheduleIR = {
    ...base,
    nodeType: 'DiscountSchedule',
    type,
    aggregateScope,
    tiers: [],
    displayNameFromSource: finding.artifactName,
  };
  return { nodes: [node] };
};
