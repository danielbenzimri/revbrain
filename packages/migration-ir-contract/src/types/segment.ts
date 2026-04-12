/**
 * Segment types — shared contract for the Migration Segmenter.
 *
 * Spec: docs/MIGRATION-SEGMENTER-DESIGN.md §6.
 * Task: SEG-0.1.
 *
 * These types are consumed by `@revbrain/migration-segmenter` (the
 * algorithm) and `apps/worker` (the pipeline integration). They
 * live in the contract package so both sides share the same shapes
 * without a direct dependency between them.
 */

import type { IREdgeType } from './edge.ts';

// ============================================================================
// Complexity weights + authority scores (shared defaults)
// ============================================================================

/**
 * Per-node complexity weights for segment sizing. Used to compute
 * `Segment.weight` (sum) and `Segment.complexityEstimate` (composite).
 * Spec §5.4.
 */
export const DEFAULT_COMPLEXITY_WEIGHTS: Readonly<Record<string, number>> = Object.freeze({
  simple: 1,
  moderate: 3,
  complex: 9,
  unknown: 1,
});

/**
 * Root-selection authority scores by node type. Higher = more likely
 * to be chosen as segment root. Spec §5.6.
 */
export const DEFAULT_AUTHORITY_SCORES: Readonly<Record<string, number>> = Object.freeze({
  CyclicDependency: 100,
  BundleStructure: 90,
  PricingRule: 80,
  DiscountSchedule: 70,
  Product: 60,
  Automation: 55,
  ConfigConstraint: 50,
});

/** Default score for node types not in the authority table. */
export const DEFAULT_AUTHORITY_FALLBACK = 10;

// ============================================================================
// Configuration
// ============================================================================

/**
 * Runtime options for the segmenter. All fields optional with
 * documented defaults. Validated by Zod at entry (spec §3.2).
 */
export interface SegmenterOptions {
  thresholds?: {
    /** Segment size triggering articulation analysis. Default: 200. */
    largeSegment?: number;
    /** Wave weight triggering sub-wave hints. Default: 500. */
    heavyWave?: number;
    /** Max articulation hints per large segment. Default: 20. */
    maxArticulationHints?: number;
  };
  /** Override complexity weights. Merged over DEFAULT_COMPLEXITY_WEIGHTS. */
  weights?: Partial<Record<string, number>>;
  /** Override root-selection authority scores. Merged over DEFAULT_AUTHORITY_SCORES. */
  authorityScores?: Partial<Record<string, number>>;
  /**
   * Enable non-contractual heuristic diagnostics (e.g. Product↔
   * BundleStructure orphan detection). Default: false.
   */
  enableHeuristics?: boolean;
}

// ============================================================================
// Size histogram bucket constants
// ============================================================================

/** Size histogram bucket boundaries (inclusive). Spec §6.4. */
export const SIZE_HISTOGRAM_BUCKETS = Object.freeze({
  SINGLETON: 1,
  SMALL_MIN: 2,
  SMALL_MAX: 5,
  MEDIUM_MIN: 6,
  MEDIUM_MAX: 20,
  LARGE_MIN: 21,
  LARGE_MAX: 200,
  XLARGE_MIN: 201,
} as const);

export interface SizeHistogram {
  /** 1 node */
  singleton: number;
  /** 2–5 nodes */
  small: number;
  /** 6–20 nodes */
  medium: number;
  /** 21–200 nodes */
  large: number;
  /** 201+ nodes */
  xlarge: number;
}

// ============================================================================
// Core types (§6.1–§6.2)
// ============================================================================

/**
 * Map from node ID → segment ID. Every real node has exactly one
 * entry. Virtual segments have zero entries. Spec §6.1.
 */
export interface SegmentAssignment {
  nodeToSegment: Record<string, string>;
}

/**
 * A migration segment — a group of semantically coupled IR nodes
 * that must be planned as one unit. Spec §6.2.
 */
export interface Segment {
  /** Content-addressable: `seg:<base64url(sha256)>`. Spec §6.2. */
  id: string;
  /** Root-anchored: `pseg:<rootNodeId>`. Stable when leaves change. Spec §6.2. */
  persistentId: string;
  /** Display: `<rootNodeType>: <rootDisplayName>`. Not keyed. */
  label: string;
  /** The structurally most-authoritative node in the segment. */
  rootNodeId: string;
  nodeCount: number;
  /** Sorted unique node type values. */
  nodeTypes: string[];
  /** Sorted member node IDs. */
  memberNodeIds: string[];
  /** Composite complexity. Spec §5.4. */
  complexityEstimate: 'simple' | 'moderate' | 'complex';
  /** Sum of per-node complexity weights. */
  weight: number;
  /** Wave number (0+ for real, -1 for virtual). */
  migrationOrder: number;
  /** Prerequisite segment IDs. */
  dependsOn: string[];
  /** Dependent segment IDs. */
  dependedOnBy: string[];
  isIsland: boolean;
  /** True for external placeholder segments. Spec §6.7. */
  isVirtual: boolean;
  /** Deploy-time validation constraints. Spec §6.2. */
  validationConstraints: ValidationConstraint[];
  /** Articulation hints for large segments. Spec §5.5. */
  internalOrderingHints: ArticulationHint[];
}

/**
 * A condition Disposition must verify before deploying a segment.
 * Generated from ordering edges that cross segment boundaries.
 * Spec §6.2.
 */
export interface ValidationConstraint {
  type: 'prereq-exists';
  /** Node ID in the prerequisite segment that must exist in target. */
  nodeId: string;
  nodeType: string;
  displayName: string;
  edgeType: IREdgeType;
}

/**
 * Articulation-point hint for large-segment internal ordering.
 * Ranked by separation power (largest component if removed).
 * Spec §5.5.
 */
export interface ArticulationHint {
  nodeId: string;
  nodeType: string;
  /** Size of largest resulting component if this node were removed. */
  largestComponentSize: number;
}

// ============================================================================
// Dependencies + hazards (§6.3, §6.6)
// ============================================================================

/**
 * Cross-segment dependency with edge-type provenance. Spec §6.3.
 */
export interface SegmentDependency {
  prerequisiteSegmentId: string;
  dependentSegmentId: string;
  /** Count per edge type that created this dependency. */
  byEdgeType: Partial<Record<IREdgeType, number>>;
  /** Up to 5 sample edges for explainability. */
  sampleEdges: Array<{
    edgeType: IREdgeType;
    sourceNodeId: string;
    targetNodeId: string;
  }>;
}

/**
 * Coordination hazard — an operational coupling (not ordering).
 * Generated from hazard-class edges (e.g. `triggers`). Spec §6.6.
 */
export interface CoordinationHazard {
  /** Deterministic hash for acknowledgment tracking across runs. */
  fingerprint: string;
  segmentId: string;
  relatedSegmentId: string;
  edgeType: IREdgeType;
  description: string;
  sampleEdges: Array<{
    sourceNodeId: string;
    targetNodeId: string;
  }>;
}

/**
 * Sub-wave deployment hint for heavy waves. Spec §5.4.
 */
export interface WavePlanHint {
  wave: number;
  /** Segment IDs sorted by weight descending. */
  orderedSegmentIds: string[];
  totalWeight: number;
}

// ============================================================================
// Manifest (§6.4)
// ============================================================================

/**
 * The full segmentation output manifest. Spec §6.4.
 */
export interface SegmentManifest {
  /** Sorted by (migrationOrder ASC, id ASC). */
  segments: Segment[];
  /** Cross-segment dependencies with provenance. */
  dependencies: SegmentDependency[];
  /** Operational hazards from hazard-class edges. */
  coordinationHazards: CoordinationHazard[];

  segmentCount: number;
  realSegmentCount: number;
  virtualSegmentCount: number;
  /** Waves among real segments only (excludes wave -1). */
  waveCount: number;
  islandCount: number;
  crossSegmentCycleMergeCount: number;
  crossSegmentDependencyCount: number;
  /** Total weight per wave (index = wave number, real only). */
  waveWeights: number[];
  /** Sub-wave hints for heavy waves. */
  subWaveHints: WavePlanHint[];
  sizeHistogram: SizeHistogram;
}

// ============================================================================
// Result + diagnostics (§6.5)
// ============================================================================

/**
 * Diagnostic codes — closed set. Spec §6.5.
 */
export type SegmentDiagnosticCode =
  | 'SEG_I001' // >50 nodes
  | 'SEG_I002' // articulation ran
  | 'SEG_I003' // virtual created
  | 'SEG_W001' // zero edges
  | 'SEG_W002' // cycle merged
  | 'SEG_W003' // heavy wave
  | 'SEG_W004' // Product↔BundleStructure orphan
  | 'SEG_E001' // dangling edge
  | 'SEG_E002' // unknown edge type
  | 'SEG_E003'; // schema mismatch

export type SegmentDiagnosticSeverity = 'info' | 'warn' | 'error';

/**
 * Segmenter diagnostic entry. Spec §6.5.
 */
export interface SegmentDiagnostic {
  code: SegmentDiagnosticCode;
  severity: SegmentDiagnosticSeverity;
  message: string;
  context?: {
    segmentIds?: string[];
    nodeIds?: string[];
    edgeTypes?: string[];
  };
}

/**
 * Top-level segmenter return value. Spec §6.5.
 */
export interface SegmentResult {
  assignment: SegmentAssignment;
  manifest: SegmentManifest;
  /**
   * Runtime telemetry. EXCLUDED from determinism guarantees —
   * durations vary between runs.
   */
  runtimeStats: {
    durationMs: number;
    phaseDurations: Array<{ phase: string; durationMs: number }>;
  };
  diagnostics: SegmentDiagnostic[];
}
