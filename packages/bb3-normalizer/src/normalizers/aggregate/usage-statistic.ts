/**
 * UsageStatisticIR normalizer. Spec: §5.3, §7.9.
 */

import type { AssessmentFindingInput } from '@revbrain/contract';
import type { IRNodeBase } from '@revbrain/migration-ir-contract';
import type { NormalizerFn } from '../registry.ts';
import { buildBaseNode } from '../base.ts';

export interface UsageStatisticIR extends IRNodeBase {
  nodeType: 'UsageStatistic';
  metricKey: string;
  value: number;
  windowStart: string | null;
  windowEnd: string | null;
  breakdown: Array<{ label: string; value: number }>;
}

export const normalizeUsageStatistic: NormalizerFn = (finding: AssessmentFindingInput) => {
  const metricKey = finding.artifactName;
  const value = finding.countValue ?? 0;

  const stableIdentity = { metricKey };
  const semanticPayload = { ...stableIdentity, value };

  const base = buildBaseNode({
    finding,
    nodeType: 'UsageStatistic',
    stableIdentity,
    semanticPayload,
  });
  const node: UsageStatisticIR = {
    ...base,
    nodeType: 'UsageStatistic',
    metricKey,
    value,
    windowStart: null,
    windowEnd: null,
    breakdown: [],
  };
  return { nodes: [node] };
};
