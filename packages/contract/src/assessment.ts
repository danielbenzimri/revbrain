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

export const AssessmentFindingSchema = z.object({
  domain: AssessmentDomainSchema,
  collectorName: z.string(),
  artifactType: z.string(),
  artifactName: z.string(),
  artifactId: z.string().optional(),
  findingKey: z.string(),
  sourceType: SourceTypeSchema,
  sourceRef: z.string().optional(),
  detected: z.boolean().default(true),
  countValue: z.number().int().optional(),
  textValue: z.string().optional(),
  usageLevel: UsageLevelSchema.optional(),
  riskLevel: RiskLevelSchema.optional(),
  complexityLevel: ComplexityLevelSchema.optional(),
  migrationRelevance: MigrationRelevanceSchema.optional(),
  rcaTargetConcept: z.string().optional(),
  rcaMappingComplexity: RcaMappingComplexitySchema.optional(),
  evidenceRefs: z.array(EvidenceRefSchema).default([]),
  notes: z.string().optional(),
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
 */
export function generateFindingKey(parts: {
  collector: string;
  artifactType: string;
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
  return `${parts.collector}:${parts.artifactType}:unknown`;
}
