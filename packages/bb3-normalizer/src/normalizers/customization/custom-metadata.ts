/**
 * CustomMetadataTypeIR normalizer.
 *
 * Spec: §5.3 CustomMetadataTypeIR, §7.4.
 */

import type { AssessmentFindingInput } from '@revbrain/contract';
import type { IRNodeBase } from '@revbrain/migration-ir-contract';
import type { NormalizerFn } from '../registry.ts';
import { buildBaseNode } from '../base.ts';

export interface CustomMetadataTypeIR extends IRNodeBase {
  nodeType: 'CustomMetadataType';
  developerName: string;
  fields: string[];
  recordCount: number;
  isUsedByCpq: boolean;
}

export const normalizeCustomMetadataType: NormalizerFn = (finding: AssessmentFindingInput) => {
  const developerName = finding.artifactName;
  const fields = (finding.textValue ?? '')
    .split(',')
    .map((f) => f.trim())
    .filter(Boolean)
    .sort();
  const recordCount = finding.countValue ?? 0;
  const isUsedByCpq =
    finding.notes?.toLowerCase().includes('cpq') || /^SBQQ__|^sbaa__|^blng__/i.test(developerName);

  const stableIdentity = { developerName };
  const semanticPayload = { ...stableIdentity, fields, recordCount, isUsedByCpq: !!isUsedByCpq };

  const base = buildBaseNode({
    finding,
    nodeType: 'CustomMetadataType',
    stableIdentity,
    semanticPayload,
    developerName,
  });

  const node: CustomMetadataTypeIR = {
    ...base,
    nodeType: 'CustomMetadataType',
    developerName,
    fields,
    recordCount,
    isUsedByCpq: !!isUsedByCpq,
  };
  return { nodes: [node] };
};
