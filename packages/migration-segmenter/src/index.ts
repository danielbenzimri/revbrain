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
