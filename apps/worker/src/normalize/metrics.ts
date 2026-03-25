/**
 * Derived metrics computation.
 *
 * Computes aggregate and cross-collector metrics that cannot be
 * calculated within a single collector. These feed into the
 * assessment summary and LLM context.
 *
 * Examples:
 * - Overall migration complexity score (weighted across domains)
 * - Feature adoption heatmap
 * - Risk-weighted effort estimate
 * - Data volume tier classification
 *
 * See: Extraction Spec — Post-processing, derived metrics
 */

import type { CollectorContext, CollectorResult } from '../collectors/base.ts';

/**
 * Compute derived metrics from all collector results.
 */
export async function computeDerivedMetrics(
  _ctx: CollectorContext,
  _results: Map<string, CollectorResult>
): Promise<void> {
  // TODO: Aggregate per-domain complexity scores into overall score
  // TODO: Compute feature adoption heatmap (which CPQ features are used, how heavily)
  // TODO: Calculate risk-weighted effort estimate
  // TODO: Classify data volume tier (small/medium/large/enterprise)
  // TODO: Compute coverage percentage across all domains
  // TODO: Write derived metrics to assessment_runs.summary_metrics JSONB
}
