/**
 * Summary builder — generates per-domain and overall assessment summaries.
 *
 * Produces structured summaries consumed by:
 * - The assessment UI (dashboard cards, domain detail pages)
 * - The LLM migration advisor (structured context for recommendations)
 * - Export/report generation
 *
 * Each domain summary includes:
 * - Key findings count and breakdown by risk/complexity
 * - Feature adoption indicators
 * - Migration-relevant highlights
 * - Recommended next steps
 *
 * See: Extraction Spec — Phase 5 Summary generation
 */

import type { CollectorContext, CollectorResult } from '../collectors/base.ts';
import type { SummarySchema, DomainSummary } from './schemas.ts';

/**
 * Build all summaries from collector results.
 */
export async function buildSummaries(
  _ctx: CollectorContext,
  _results: Map<string, CollectorResult>
): Promise<SummarySchema> {
  // TODO: Generate per-domain summaries (one per collector domain)
  // TODO: Aggregate into overall assessment summary
  // TODO: Compute top-level stats: total findings, risk distribution, complexity distribution
  // TODO: Generate migration readiness score
  // TODO: Build feature adoption summary (which CPQ features are used)
  // TODO: Write summaries to assessment_runs.summaries JSONB
  // TODO: Emit summary findings for UI consumption

  const domainSummaries: DomainSummary[] = [];

  return {
    overallScore: 0,
    domainSummaries,
    totalFindings: 0,
    riskDistribution: { critical: 0, high: 0, medium: 0, low: 0, info: 0 },
    generatedAt: new Date().toISOString(),
  };
}
