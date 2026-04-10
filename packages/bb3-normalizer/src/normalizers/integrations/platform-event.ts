/**
 * PlatformEventIR normalizer. Spec: §5.3, §7.8.
 */

import type { AssessmentFindingInput } from '@revbrain/contract';
import type { IRNodeBase } from '@revbrain/migration-ir-contract';
import type { NormalizerFn } from '../registry.ts';
import { buildBaseNode } from '../base.ts';

export interface PlatformEventIR extends IRNodeBase {
  nodeType: 'PlatformEvent';
  developerName: string;
  fields: string[];
  isCpqRelated: boolean;
}

export const normalizePlatformEvent: NormalizerFn = (finding: AssessmentFindingInput) => {
  const developerName = finding.artifactName;
  const fields = (finding.textValue ?? '')
    .split(',')
    .map((f) => f.trim())
    .filter(Boolean)
    .sort();
  const isCpqRelated = /^SBQQ__|^sbaa__|^blng__/i.test(developerName);

  const stableIdentity = { developerName };
  const semanticPayload = { ...stableIdentity, fields, isCpqRelated };

  const base = buildBaseNode({
    finding,
    nodeType: 'PlatformEvent',
    stableIdentity,
    semanticPayload,
    developerName,
  });
  const node: PlatformEventIR = {
    ...base,
    nodeType: 'PlatformEvent',
    developerName,
    fields,
    isCpqRelated,
  };
  return { nodes: [node] };
};
