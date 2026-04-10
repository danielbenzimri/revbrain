/**
 * SummaryVariableIR normalizer.
 *
 * Spec: §5.3 SummaryVariableIR, §7.2. Identity recipe: developerName.
 */

import type { AssessmentFindingInput } from '@revbrain/contract';
import type { FieldRefIR, IRNodeBase, NodeRef } from '@revbrain/migration-ir-contract';
import type { NormalizerFn } from '../registry.ts';
import { buildBaseNode } from '../base.ts';

export interface SummaryVariableIR extends IRNodeBase {
  nodeType: 'SummaryVariable';
  aggregateFunction: 'sum' | 'average' | 'count' | 'min' | 'max' | 'unknown';
  targetField: FieldRefIR | null;
  targetObject: string;
  filterFormula: string | null;
  consumers: NodeRef[];
}

function parseAggregate(raw: string | null): SummaryVariableIR['aggregateFunction'] {
  if (!raw) return 'unknown';
  const lower = raw.toLowerCase();
  if (lower.includes('sum')) return 'sum';
  if (lower.includes('avg') || lower.includes('average')) return 'average';
  if (lower.includes('count')) return 'count';
  if (lower.includes('min')) return 'min';
  if (lower.includes('max')) return 'max';
  return 'unknown';
}

export const normalizeSummaryVariable: NormalizerFn = (finding: AssessmentFindingInput) => {
  const developerName = finding.artifactName.replace(/\W+/g, '_');
  const aggregateFunction = parseAggregate(finding.notes ?? null);
  const targetObject = finding.sourceRef ?? 'SBQQ__QuoteLine__c';

  const stableIdentity = { developerName };
  const semanticPayload = { ...stableIdentity, aggregateFunction, targetObject };

  const base = buildBaseNode({
    finding,
    nodeType: 'SummaryVariable',
    stableIdentity,
    semanticPayload,
    developerName,
  });

  const node: SummaryVariableIR = {
    ...base,
    nodeType: 'SummaryVariable',
    aggregateFunction,
    targetField: null,
    targetObject,
    filterFormula: finding.textValue ?? null,
    consumers: [],
  };
  return { nodes: [node] };
};
