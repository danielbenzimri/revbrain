/**
 * RecordTypeIR normalizer.
 *
 * Spec: §5.3 RecordTypeIR, §7.4.
 */

import type { AssessmentFindingInput } from '@revbrain/contract';
import type { IRNodeBase } from '@revbrain/migration-ir-contract';
import type { NormalizerFn } from '../registry.ts';
import { buildBaseNode, findEvidenceRef } from '../base.ts';

export interface RecordTypeIR extends IRNodeBase {
  nodeType: 'RecordType';
  object: string;
  developerName: string;
  isActive: boolean;
  picklistValueMap: Record<string, string[]>;
}

export const normalizeRecordType: NormalizerFn = (finding: AssessmentFindingInput) => {
  const developerName = finding.artifactName;
  const object = findEvidenceRef(finding, 'object-ref') ?? '<unknown>';
  const isActive = finding.detected;

  const stableIdentity = { object, developerName };
  const semanticPayload = { ...stableIdentity, isActive };

  const base = buildBaseNode({
    finding,
    nodeType: 'RecordType',
    stableIdentity,
    semanticPayload,
    developerName,
  });

  const node: RecordTypeIR = {
    ...base,
    nodeType: 'RecordType',
    object,
    developerName,
    isActive,
    picklistValueMap: {},
  };
  return { nodes: [node] };
};
