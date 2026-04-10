/**
 * DocumentTemplateIR normalizer with inlined sections. Spec: §5.3, §7.7.
 */

import type { AssessmentFindingInput } from '@revbrain/contract';
import type { FieldRefIR, IRNodeBase } from '@revbrain/migration-ir-contract';
import type { NormalizerFn } from '../registry.ts';
import { buildBaseNode } from '../base.ts';

export interface DocumentTemplateIR extends IRNodeBase {
  nodeType: 'DocumentTemplate';
  isDefault: boolean;
  lastModifiedDate: string;
  sections: Array<{
    name: string;
    displayOrder: number;
    sectionType: 'heading' | 'content' | 'line-item-table' | 'terms' | 'signature' | 'unknown';
  }>;
  mergeFields: FieldRefIR[];
  lineColumns: Array<{ field: FieldRefIR; displayOrder: number }>;
}

export const normalizeDocumentTemplate: NormalizerFn = (finding: AssessmentFindingInput) => {
  const developerName = finding.artifactName;
  const isDefault = (finding.notes ?? '').toLowerCase().includes('default');

  const stableIdentity = { developerName };
  const semanticPayload = { ...stableIdentity, isDefault };

  const base = buildBaseNode({
    finding,
    nodeType: 'DocumentTemplate',
    stableIdentity,
    semanticPayload,
    developerName,
  });
  const node: DocumentTemplateIR = {
    ...base,
    nodeType: 'DocumentTemplate',
    isDefault,
    lastModifiedDate: finding.sourceRef ?? '',
    sections: [],
    mergeFields: [],
    lineColumns: [],
  };
  return { nodes: [node] };
};
