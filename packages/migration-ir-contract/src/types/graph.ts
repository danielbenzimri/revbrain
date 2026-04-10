/**
 * IRGraph envelope + GraphMetadataIR.
 *
 * Spec: §5.1 (envelope), §5.5 (ReferenceIndex), §5.6 (graph metadata).
 *
 * `IRGraph` is the top-level output of BB-3. A single immutable
 * snapshot of the customer's CPQ business logic, expressed as a
 * typed graph. Platform-neutral: contains no references to RCA, no
 * LLM output, no TPR lookups.
 *
 * **DETERMINISM CONTRACT (v1.1, Auditor 1 P0.1):** This type MUST be
 * byte-identical across re-runs on byte-identical inputs, modulo
 * the single `extractedAt` field. Wall-clock timings, duration
 * counters, and any other runtime-observed measurements live in
 * `NormalizeResult.runtimeStats` (§6.4), NOT on the graph envelope.
 * The graph is the stable contract; stats are sidecar telemetry.
 *
 * FORBIDDEN fields on `IRGraph` or `GraphMetadataIR`:
 * `bb3DurationMs`, `stageDurations`, `apexParseStats`, `generatedAt`,
 * `buildTimestamp`. Any new field whose name contains `Duration`,
 * `Ms`, `Time`, or `At` (other than the existing `extractedAt` and
 * `capturedAt`) is a determinism bug.
 */

import type { IREdge } from './edge.ts';
import type { IRNodeBase } from './nodes.ts';
import type { FieldRefIR } from './field-ref.ts';
import type { QuarantineEntry } from './quarantine.ts';

/**
 * A placeholder for the full `IRNode` discriminated union. In PH0.10
 * we only have `IRNodeBase`; the concrete per-type interfaces land
 * in later phases. Downstream consumers can cast to the specific
 * variant after checking `nodeType`. Every node in the graph MUST
 * extend `IRNodeBase`.
 */
export type IRNode = IRNodeBase;

/**
 * Global inverted index answering "what depends on field X?".
 *
 * Spec: §5.5 (v1.1 path support + resolution buckets).
 *
 * Built in Stage 7 (§8.8) after all IR nodes are produced. Not a
 * separate graph — an auxiliary index over the same nodes.
 */
export interface ReferenceIndex {
  /** `'SBQQ__Quote__c' -> [nodeId, ...]` — every node referencing this object. */
  byObject: Record<string, string[]>;
  /** `'SBQQ__Quote__c.SBQQ__NetAmount__c' -> [nodeId, ...]` — direct field refs. */
  byField: Record<string, string[]>;
  /** `'SBQQ__Quote__c.Account__r.Owner.Profile.Name' -> [nodeId, ...]` — relationship paths. */
  byPath: Record<string, string[]>;
  /** Reverse lookup. */
  byNodeId: Record<string, { objects: string[]; fields: string[]; paths: string[] }>;
  /** Fields referenced dynamically (string-concatenated, record.get(variable), etc.). */
  dynamicRefs: Array<{ nodeId: string; hint: string }>;
  /** Fields that failed SchemaCatalog resolution. */
  unresolvedRefs: Array<{ nodeId: string; reference: FieldRefIR; reason: string }>;
}

/**
 * Graph-level metadata. No timing fields (v1.1 removed `bb3DurationMs`).
 */
export interface GraphMetadataIR {
  /** `collectorName -> coverage %`. */
  collectorCoverage: Record<string, number>;
  collectorWarnings: Record<string, string[]>;
  degradedInputs: Array<{
    source: 'collector' | 'schema-catalog' | 'relationship-graph';
    /** `collectorName`, or `'schema-catalog'`, etc. */
    identifier: string;
    reason: string;
    severity: 'warn' | 'hard';
  }>;
  quarantineCount: number;
  totalFindingsConsumed: number;
  totalIRNodesEmitted: number;
  cycleCount: number;
  unknownArtifactCount: number;
  /** v1.1 addition. */
  unresolvedRefCount: number;
  /**
   * Hash of the SchemaCatalog that was used, or `null` if none was
   * provided. Lets downstream consumers invalidate cached analyses
   * when the schema drifts.
   */
  schemaCatalogHash: string | null;
}

/**
 * Singleton orientation node copied into the envelope. The full
 * `OrgFingerprintIR` shape lives with the other node types (PH6.14);
 * this placeholder keeps `IRGraph.orgFingerprint` type-safe in
 * PH0.10 without creating a circular import.
 */
export interface OrgFingerprintIR extends IRNodeBase {
  nodeType: 'OrgFingerprint';
}

/**
 * Top-level BB-3 output.
 *
 * Nodes are sorted by `id`; edges are sorted by
 * `(sourceId, targetId, edgeType)`. Both sort orders are contractual
 * — downstream consumers assume them and the canonical serializer
 * enforces them in Stage 9 (PH3.10).
 */
export interface IRGraph {
  /** Semver, e.g. `'1.0.0'`. Bumped on any schema change (§5.8). */
  irSchemaVersion: string;
  /** Version of the BB-3 implementation that produced this graph. */
  bb3Version: string;
  /** Org-level orientation (§5.3 `OrgFingerprintIR`). */
  orgFingerprint: OrgFingerprintIR;
  /** ISO-8601 timestamp — the ONLY nondeterministic field on the graph. */
  extractedAt: string;
  /** Every IR node, discriminated by `nodeType`; sorted by `id`. */
  nodes: IRNode[];
  /** Typed edges between nodes (§5.1a); sorted by `(sourceId, targetId, edgeType)`. */
  edges: IREdge[];
  /** Global inverted index (§5.5). */
  referenceIndex: ReferenceIndex;
  /** Coverage, warnings, degraded inputs (§5.6). */
  metadata: GraphMetadataIR;
  /** Findings BB-3 could not normalize (§5.7). */
  quarantine: QuarantineEntry[];
}
