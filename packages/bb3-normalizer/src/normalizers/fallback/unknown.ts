/**
 * UnknownArtifactIR fallback normalizer.
 *
 * Spec: §5.3, §7.10.
 *
 * Emitted for any artifactType that has no registered normalizer.
 * Keeps the pipeline running (G9) rather than crashing on unknown
 * input. Attaches a warning and copies the raw finding into
 * `rawFinding` for downstream "best-effort" disposition by BB-5.
 */

import type { AssessmentFindingInput } from '@revbrain/contract';
import type { IRNodeBase } from '@revbrain/migration-ir-contract';
import type { NormalizerFn } from '../registry.ts';
import { buildBaseNode } from '../base.ts';

export interface UnknownArtifactIR extends IRNodeBase {
  nodeType: 'UnknownArtifact';
  rawArtifactType: string;
  rawCollectorName: string;
  rawFinding: Record<string, unknown>;
}

export const normalizeUnknownArtifact: NormalizerFn = (finding: AssessmentFindingInput) => {
  const rawArtifactType = finding.artifactType;
  const rawCollectorName = finding.collectorName;

  const stableIdentity = {
    rawCollectorName,
    rawArtifactType,
    findingKey: finding.findingKey,
  };
  const semanticPayload = { ...stableIdentity };

  const base = buildBaseNode({
    finding,
    nodeType: 'UnknownArtifact',
    stableIdentity,
    semanticPayload,
    warnings: ['unknown-artifact-type'],
  });

  const node: UnknownArtifactIR = {
    ...base,
    nodeType: 'UnknownArtifact',
    rawArtifactType,
    rawCollectorName,
    rawFinding: finding as unknown as Record<string, unknown>,
  };
  return { nodes: [node] };
};
