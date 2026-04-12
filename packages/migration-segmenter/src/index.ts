/**
 * @revbrain/migration-segmenter
 *
 * Migration Segmenter — partitions an IRGraph into semantically
 * coupled segments for migration planning.
 *
 * Spec: docs/MIGRATION-SEGMENTER-DESIGN.md (V3.1 Final)
 *
 * Public API lands in SEG-4.2. Types re-exported from
 * @revbrain/migration-ir-contract for convenience.
 */

// Re-export segment types from the contract package.
export type {
  Segment,
  SegmentAssignment,
  SegmentDependency,
  SegmentDiagnostic,
  SegmentDiagnosticCode,
  SegmentManifest,
  SegmentResult,
  SegmenterOptions,
  ValidationConstraint,
  ArticulationHint,
  CoordinationHazard,
  WavePlanHint,
  SizeHistogram,
} from '@revbrain/migration-ir-contract';

export {
  DEFAULT_COMPLEXITY_WEIGHTS,
  DEFAULT_AUTHORITY_SCORES,
  DEFAULT_AUTHORITY_FALLBACK,
  SIZE_HISTOGRAM_BUCKETS,
} from '@revbrain/migration-ir-contract';

// Public API
export { segment } from './segment.ts';

// Edge classification (useful for doctor checks + tests)
export {
  STRONG_EDGE_TYPES,
  ORDERING_EDGE_TYPES,
  HAZARD_EDGE_TYPES,
  ALL_CLASSIFIED_EDGE_TYPES,
  EXTERNAL_ALLOWED_EDGE_TYPES,
  classifyEdgeType,
  getOrderingDirection,
} from './edge-classification.ts';

// Errors
export {
  DanglingEdgeError,
  DuplicateNodeIdError,
  UnclassifiedEdgeTypeError,
  IncompatibleSchemaError,
  InvalidOptionsError,
  SegmenterInvariantError,
} from './errors.ts';
