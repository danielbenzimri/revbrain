/**
 * OutboundMessageAutomationIR normalizer (v1.2 variant).
 *
 * Spec: §5.3 OutboundMessageAutomationIR, §7.8.
 */

import type { AssessmentFindingInput } from '@revbrain/contract';
import type {
  FieldRefIR,
  NodeRef,
  OutboundMessageAutomationIR,
} from '@revbrain/migration-ir-contract';
import type { NormalizerFn } from '../registry.ts';
import { buildBaseNode, findEvidenceRef } from '../base.ts';

export const normalizeOutboundMessage: NormalizerFn = (finding: AssessmentFindingInput) => {
  const developerName = finding.artifactName;
  const endpointUrl = finding.textValue ?? '';
  const targetObject = findEvidenceRef(finding, 'object-ref') ?? '<unknown>';
  const isActive = finding.detected;

  const stableIdentity = {
    sourceType: 'OutboundMessage' as const,
    developerName,
    targetObject,
  };
  const semanticPayload = { ...stableIdentity, endpointUrl, isActive };

  const base = buildBaseNode({
    finding,
    nodeType: 'Automation',
    stableIdentity,
    semanticPayload,
    developerName,
  });

  const node: OutboundMessageAutomationIR = {
    ...base,
    nodeType: 'Automation',
    sourceType: 'OutboundMessage',
    sbqqFieldRefs: [] as FieldRefIR[],
    writtenFields: [] as FieldRefIR[],
    relatedRules: [] as NodeRef[],
    endpointUrl,
    targetObject,
    fieldsSent: [],
    isActive,
  };
  return { nodes: [node] };
};
