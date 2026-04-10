/**
 * Stage 9 — Envelope assembly + canonical serialization.
 *
 * Spec: §6.1 Stage 9, §5.1, §6.2.
 *
 * Assembles the final `IRGraph` from the draft pieces produced by
 * the earlier stages. Nodes are sorted by `id`, edges are sorted
 * by `(sourceId, targetId, edgeType)`, and the whole envelope is
 * serialized via `canonicalJson` so re-runs on byte-identical
 * input produce byte-identical output (modulo `extractedAt`).
 *
 * The ONLY non-deterministic field is `extractedAt`. Wall-clock
 * measurements live in `NormalizeResult.runtimeStats` — never on
 * the envelope.
 */

import {
  canonicalJson,
  IR_SCHEMA_VERSION,
  type GraphMetadataIR,
  type IREdge,
  type IRGraph,
  type IRNodeBase,
  type OrgFingerprintIR,
  type QuarantineEntry,
  type ReferenceIndex,
} from '@revbrain/migration-ir-contract';

export interface AssembleInput {
  bb3Version: string;
  extractedAt: string;
  nodes: readonly IRNodeBase[];
  edges: readonly IREdge[];
  referenceIndex: ReferenceIndex;
  metadata: GraphMetadataIR;
  quarantine: readonly QuarantineEntry[];
  orgFingerprint?: OrgFingerprintIR;
}

export interface AssembleResult {
  graph: IRGraph;
  serialized: string;
}

/**
 * Default placeholder OrgFingerprintIR used when no org node was
 * emitted by the normalizers. Real runs receive the org fingerprint
 * via `input.orgFingerprint`; the placeholder keeps tests
 * self-contained.
 */
function placeholderOrgFingerprint(): OrgFingerprintIR {
  return {
    id: 'org:placeholder',
    contentHash: 'org:placeholder',
    nodeType: 'OrgFingerprint',
    displayName: 'Unknown Org',
    warnings: [],
    evidence: {
      sourceFindingKeys: [],
      classificationReasons: [],
      cpqFieldsRead: [],
      cpqFieldsWritten: [],
      sourceSalesforceRecordIds: [],
      sourceCollectors: [],
    },
  };
}

/**
 * Assemble + canonically serialize the envelope.
 */
export function assembleEnvelope(input: AssembleInput): AssembleResult {
  const sortedNodes = [...input.nodes].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const sortedEdges = [...input.edges].sort((a, b) => {
    if (a.sourceId !== b.sourceId) return a.sourceId < b.sourceId ? -1 : 1;
    if (a.targetId !== b.targetId) return a.targetId < b.targetId ? -1 : 1;
    if (a.edgeType !== b.edgeType) return a.edgeType < b.edgeType ? -1 : 1;
    return 0;
  });

  const graph: IRGraph = {
    irSchemaVersion: IR_SCHEMA_VERSION,
    bb3Version: input.bb3Version,
    orgFingerprint: input.orgFingerprint ?? placeholderOrgFingerprint(),
    extractedAt: input.extractedAt,
    nodes: sortedNodes,
    edges: sortedEdges,
    referenceIndex: input.referenceIndex,
    metadata: input.metadata,
    quarantine: [...input.quarantine],
  };

  const serialized = canonicalJson(graph);

  return { graph, serialized };
}
