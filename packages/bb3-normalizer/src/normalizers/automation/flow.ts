/**
 * FlowAutomationIR normalizer (v1.2 variant).
 *
 * Spec: §5.3 FlowAutomationIR, §7.3.
 *
 * Emits `sourceType: 'Flow'`. Carries flow-specific fields ONLY:
 * `flowType`, `activeVersionNumber`, `elementCounts`, `triggerObject`,
 * `triggerEvents`. NO Apex metrics per v1.2 Auditor 3 P2 #10.
 *
 * Flows are captured as metadata XML. v1 does not parse flow body;
 * `parseStatus: 'metadata-only'`.
 */

import type { AssessmentFindingInput } from '@revbrain/contract';
import type { FieldRefIR, FlowAutomationIR, NodeRef } from '@revbrain/migration-ir-contract';
import type { NormalizerFn } from '../registry.ts';
import { buildBaseNode } from '../base.ts';

type FlowType = FlowAutomationIR['flowType'];

function parseFlowType(raw: string | null): FlowType {
  if (!raw) return 'unknown';
  const lower = raw.toLowerCase();
  if (lower.includes('screen')) return 'screen';
  if (lower.includes('record')) return 'record-triggered';
  if (lower.includes('scheduled')) return 'scheduled';
  if (lower.includes('platform')) return 'platform-event';
  if (lower.includes('autolaunch')) return 'autolaunched';
  return 'unknown';
}

export const normalizeFlow: NormalizerFn = (finding: AssessmentFindingInput) => {
  const developerName = finding.artifactName;
  const flowType = parseFlowType(finding.notes ?? null);
  const activeVersionNumber = finding.detected ? (finding.countValue ?? null) : null;

  const stableIdentity = { sourceType: 'Flow' as const, developerName };
  const semanticPayload = {
    ...stableIdentity,
    flowType,
    activeVersionNumber,
  };

  const base = buildBaseNode({
    finding,
    nodeType: 'Automation',
    stableIdentity,
    semanticPayload,
    developerName,
    warnings: ['Flow field refs not extracted in v1'],
  });

  const triggerObject = flowType === 'record-triggered' ? (finding.sourceRef ?? null) : null;
  const triggerEvents = flowType === 'record-triggered' ? ['create-or-update' as const] : null;

  const node: FlowAutomationIR = {
    ...base,
    nodeType: 'Automation',
    sourceType: 'Flow',
    sbqqFieldRefs: [] as FieldRefIR[],
    writtenFields: [] as FieldRefIR[],
    relatedRules: [] as NodeRef[],
    flowType,
    activeVersionNumber,
    elementCounts: {},
    triggerObject,
    triggerEvents,
    parseStatus: 'metadata-only',
  };
  return { nodes: [node] };
};
