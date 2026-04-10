/**
 * LocalizationBundleIR normalizer. Spec: §5.3, §7.9.
 * One node per language.
 */

import type { AssessmentFindingInput } from '@revbrain/contract';
import type { IRNodeBase } from '@revbrain/migration-ir-contract';
import type { NormalizerFn } from '../registry.ts';
import { buildBaseNode } from '../base.ts';

export interface LocalizationBundleIR extends IRNodeBase {
  nodeType: 'LocalizationBundle';
  languageCode: string;
  translations: Array<{ key: string; value: string }>;
  customLabelCount: number;
}

export const normalizeLocalizationBundle: NormalizerFn = (finding: AssessmentFindingInput) => {
  const languageCode = finding.artifactName;
  const customLabelCount = finding.countValue ?? 0;

  const stableIdentity = { languageCode };
  const semanticPayload = { ...stableIdentity, customLabelCount };

  const base = buildBaseNode({
    finding,
    nodeType: 'LocalizationBundle',
    stableIdentity,
    semanticPayload,
  });
  const node: LocalizationBundleIR = {
    ...base,
    nodeType: 'LocalizationBundle',
    languageCode,
    translations: [],
    customLabelCount,
  };
  return { nodes: [node] };
};
