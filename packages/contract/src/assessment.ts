/**
 * Assessment Graph Types — Shared contract for extraction worker + server.
 *
 * All types from Extraction Spec Section 22. Used by:
 * - apps/worker/ (finding factory, collectors, summaries)
 * - apps/server/ (status API, results display)
 * - packages/contract/ (shared types, Zod schemas)
 *
 * See: docs/CPQ-EXTRACTION-IMPLEMENTATION-PLAN.md Task 1.4
 */

import { z } from 'zod';

// ============================================================================
// Domain & Classification Enums
// ============================================================================

export const AssessmentDomainSchema = z.enum([
  'catalog',
  'pricing',
  'templates',
  'approvals',
  'customization',
  'dependency',
  'integration',
  'usage',
  'order-lifecycle',
  'localization',
  'settings',
  'transactional-objects',
]);
export type AssessmentDomain = z.infer<typeof AssessmentDomainSchema>;

export const SourceTypeSchema = z.enum(['object', 'metadata', 'tooling', 'bulk-usage', 'inferred']);
export type SourceType = z.infer<typeof SourceTypeSchema>;

export const UsageLevelSchema = z.enum(['high', 'medium', 'low', 'dormant']);
export type UsageLevel = z.infer<typeof UsageLevelSchema>;

/** Standardized output states for report data confidence (Redline Architectural P0) */
export const DataConfidenceSchema = z.enum([
  'Confirmed', // SOQL returned result, query verified correct
  'Estimated', // Derived/inferred value
  'Partial', // Incomplete extraction (sampling, partial query)
  'Detected', // Metadata confirms presence, count not available
  'Not extracted', // Extraction not attempted or collector failed
  'N/A', // Feature/object doesn't exist in this org
  'Insufficient activity', // <3 records, not enough for meaningful metrics
]);
export type DataConfidence = z.infer<typeof DataConfidenceSchema>;

export const RiskLevelSchema = z.enum(['critical', 'high', 'medium', 'low', 'info']);
export type RiskLevel = z.infer<typeof RiskLevelSchema>;

export const ComplexityLevelSchema = z.enum(['very-high', 'high', 'medium', 'low']);
export type ComplexityLevel = z.infer<typeof ComplexityLevelSchema>;

export const MigrationRelevanceSchema = z.enum([
  'must-migrate',
  'should-migrate',
  'optional',
  'not-applicable',
]);
export type MigrationRelevance = z.infer<typeof MigrationRelevanceSchema>;

export const RcaMappingComplexitySchema = z.enum([
  'direct',
  'transform',
  'redesign',
  'no-equivalent',
]);
export type RcaMappingComplexity = z.infer<typeof RcaMappingComplexitySchema>;

// ============================================================================
// Evidence Refs — normalized references for LLM-readiness
// ============================================================================

export const EvidenceRefSchema = z.object({
  type: z.enum([
    'record-id',
    'query',
    'api-response',
    'code-snippet',
    'count',
    'field-ref',
    'object-ref',
    'formula',
  ]),
  value: z.string(),
  label: z.string().optional(),
  // Normalized references for LLM-readiness (Section 2.7)
  referencedObjects: z.array(z.string()).optional(),
  referencedFields: z.array(z.string()).optional(),
  referencedMetadata: z.array(z.string()).optional(),
  referencedUrls: z.array(z.string()).optional(),
  /**
   * EXT-CC6 truncation discipline. When the `value` (or the
   * sibling finding's `textValue`) was capped, set `truncated: true`
   * and `originalBytes` to the pre-truncation byte length so
   * downstream consumers can render "(truncated from N bytes)" badges
   * and so the BB-3 normalizer can reason about partial bodies
   * when computing identity hashes.
   */
  truncated: z.boolean().optional(),
  originalBytes: z.number().int().optional(),
});
export type EvidenceRef = z.infer<typeof EvidenceRefSchema>;

// ============================================================================
// Merge Field Ref — parsed template merge fields (Spec §7.3)
// ============================================================================

export const MergeFieldRefSchema = z.object({
  objectName: z.string(),
  fieldName: z.string(),
  relationshipPath: z.string().optional(),
  source: z.string(),
});
export type MergeFieldRef = z.infer<typeof MergeFieldRefSchema>;

// ============================================================================
// Assessment Finding
// ============================================================================

/**
 * `nullishOptional(schema)` accepts `undefined`, `null`, or a parsed
 * value, and normalizes `null` to `undefined` so the inferred output
 * type stays `T | undefined` AND the field remains optional in the
 * parsed object (not required-with-undefined). This lets findings
 * round-trip through Postgres / JSON-as-DB-row shapes (where absent
 * fields arrive as explicit `null`) without forcing every consumer
 * to handle three states. Without this helper, a fixture loaded
 * straight from a DB dump would 100%-quarantine on the BB-3 input
 * gate (BB3_IG002), which is the failure mode that motivated this
 * helper in 2026-04.
 *
 * Implemented via `z.preprocess` rather than `.transform` because
 * `.transform()` after `.optional()` causes Zod's inferred output
 * type to mark the field as required-with-undefined, breaking
 * downstream consumers that destructure on optionality. `preprocess`
 * runs before validation so the `.optional()` is preserved.
 */
const nullishOptional = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((v) => (v === null ? undefined : v), schema.optional());

/**
 * EXT-CC5 — Stability tag. Marks whether the finding's payload
 * is sourced from metadata (deterministic across runs over the
 * same source state) or runtime (observed at extraction time
 * and may drift between runs even when the source hasn't
 * changed). Defaults to 'metadata' so existing collectors
 * validate without changes; collectors emitting usage / lifecycle
 * findings should set 'runtime' explicitly.
 */
export const StabilitySchema = z.enum(['metadata', 'runtime']);
export type Stability = z.infer<typeof StabilitySchema>;

export const AssessmentFindingSchema = z.object({
  domain: AssessmentDomainSchema,
  collectorName: z.string(),
  artifactType: z.string(),
  artifactName: z.string(),
  artifactId: nullishOptional(z.string()),
  findingKey: z.string(),
  sourceType: SourceTypeSchema,
  sourceRef: nullishOptional(z.string()),
  detected: z.boolean().default(true),
  countValue: nullishOptional(z.number().int()),
  textValue: nullishOptional(z.string()),
  usageLevel: nullishOptional(UsageLevelSchema),
  riskLevel: nullishOptional(RiskLevelSchema),
  complexityLevel: nullishOptional(ComplexityLevelSchema),
  migrationRelevance: nullishOptional(MigrationRelevanceSchema),
  rcaTargetConcept: nullishOptional(z.string()),
  rcaMappingComplexity: nullishOptional(RcaMappingComplexitySchema),
  evidenceRefs: z.array(EvidenceRefSchema).default([]),
  notes: nullishOptional(z.string()),
  // EXT-CC5 — stability tag. Optional via the same nullishOptional
  // pattern as other fields so existing collectors validate
  // unchanged. Absence = 'metadata' (deterministic source) by
  // convention. Collectors emitting usage / lifecycle / runtime
  // findings should set 'runtime' to make drift potential explicit.
  stability: nullishOptional(StabilitySchema),
  schemaVersion: z.string().default('1.0'),
});
export type AssessmentFindingInput = z.infer<typeof AssessmentFindingSchema>;

// ============================================================================
// Assessment Relationship
// ============================================================================

export const RelationshipTypeSchema = z.enum([
  'depends-on',
  'references',
  'parent-of',
  'triggers',
  'maps-to',
  'same-field-used-in',
  'overlaps-with',
]);
export type RelationshipType = z.infer<typeof RelationshipTypeSchema>;

export const AssessmentRelationshipSchema = z.object({
  sourceFindingId: z.string().uuid(),
  targetFindingId: z.string().uuid(),
  relationshipType: RelationshipTypeSchema,
  description: z.string().optional(),
});
export type AssessmentRelationshipInput = z.infer<typeof AssessmentRelationshipSchema>;

// ============================================================================
// Collector Metrics
// ============================================================================

export const CollectorMetricsSchema = z.object({
  collectorName: z.string(),
  domain: AssessmentDomainSchema,
  metrics: z.record(z.string(), z.union([z.number(), z.string(), z.boolean()])),
  warnings: z.array(z.string()).default([]),
  coverage: z.number().int().min(0).max(100).default(0),
  durationMs: z.number().int().optional(),
  schemaVersion: z.string().default('1.0'),
});
export type CollectorMetricsInput = z.infer<typeof CollectorMetricsSchema>;

// ============================================================================
// Collector Registry Types
// ============================================================================

export const CollectorTierSchema = z.enum(['tier0', 'tier1', 'tier2']);
export type CollectorTier = z.infer<typeof CollectorTierSchema>;

// ============================================================================
// Finding Key Generation
// ============================================================================

/**
 * Generate a deterministic finding key for dedup.
 *
 * Formats:
 * - Record-based: {collector}:{artifactType}:{sfRecordId}:{findingType}
 * - Aggregate: {collector}:{metricName}:{scope}
 * - Cross-object: {collector}:{sourceType}:{targetType}:{key}
 * - Fallback: {collector}:{artifactType}:{artifactName} — used when no
 *   record/metric/cross-object key is supplied. The artifactName is
 *   included so that callers iterating over Describe-derived items
 *   (which have no SF record ID) cannot silently produce duplicate
 *   keys. Pre-2026-04 behavior used a literal `unknown` sentinel,
 *   which collapsed every such caller's findings into a single key
 *   and tripped BB-3 invariant I2 ("findingKey must be unique").
 */
export function generateFindingKey(parts: {
  collector: string;
  artifactType: string;
  artifactName?: string;
  recordId?: string;
  findingType?: string;
  metricName?: string;
  scope?: string;
  sourceType?: string;
  targetType?: string;
  key?: string;
}): string {
  if (parts.recordId) {
    return `${parts.collector}:${parts.artifactType}:${parts.recordId}:${parts.findingType ?? 'default'}`;
  }
  if (parts.metricName) {
    return `${parts.collector}:${parts.metricName}:${parts.scope ?? 'global'}`;
  }
  if (parts.sourceType && parts.targetType && parts.key) {
    return `${parts.collector}:${parts.sourceType}:${parts.targetType}:${parts.key}`;
  }
  return `${parts.collector}:${parts.artifactType}:${parts.artifactName ?? 'unknown'}`;
}
