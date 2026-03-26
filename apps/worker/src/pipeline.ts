/**
 * Pipeline orchestrator — phased execution of all collectors.
 *
 * Execution phases:
 *   Phase 1: Discovery (sequential) — must succeed to proceed
 *   Phase 2: Tier 0 collectors (parallel, concurrency-limited) → gate: all must succeed
 *   Phase 3: Tier 1 + Tier 2 collectors (parallel, concurrency-limited) → tier1 threshold check (50%+)
 *   Phase 4: Post-processing — cross-collector relationships, derived metrics, validation
 *   Phase 5: Summaries — per-domain and overall assessment summaries
 *
 * Uses pLimit for concurrency control to respect Salesforce API limits.
 * Checks cancellation between phases.
 *
 * See: Implementation Plan Task 8.1–8.5
 */

import pLimit from 'p-limit';
import type { CollectorContext, CollectorResult } from './collectors/base.ts';
import { DiscoveryCollector } from './collectors/discovery.ts';
import { CatalogCollector } from './collectors/catalog.ts';
import { PricingCollector } from './collectors/pricing.ts';
import { UsageCollector } from './collectors/usage.ts';
import { DependenciesCollector } from './collectors/dependencies.ts';
import { CustomizationsCollector } from './collectors/customizations.ts';
import { SettingsCollector } from './collectors/settings.ts';
import { OrderLifecycleCollector } from './collectors/order-lifecycle.ts';
import { TemplatesCollector } from './collectors/templates.ts';
import { ApprovalsCollector } from './collectors/approvals.ts';
import { IntegrationsCollector } from './collectors/integrations.ts';
import { LocalizationCollector } from './collectors/localization.ts';
import { buildRelationships } from './normalize/relationships.ts';
import { computeDerivedMetrics } from './normalize/metrics.ts';
import { validateExtraction } from './normalize/validation.ts';
import { buildContextBlueprint } from './normalize/context-blueprint.ts';
import { buildSummaries } from './summaries/builder.ts';
import { logger } from './lib/logger.ts';
import { writeCollectorData } from './db/writes.ts';
import type { BaseCollector } from './collectors/base.ts';

/** Maximum concurrent collectors (respect SF API concurrency) */
const MAX_CONCURRENCY = 3;

/** Minimum percentage of tier1 collectors that must succeed */
const TIER1_THRESHOLD = 0.5;

/**
 * Run a collector and persist its results to the database.
 */
async function runAndPersist(
  collector: BaseCollector,
  ctx: CollectorContext,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  log: any
): Promise<CollectorResult> {
  const result = await collector.run();

  // Write findings to DB (even on partial success)
  if (result.findings.length > 0 || result.metrics) {
    try {
      await writeCollectorData({
        sql: ctx.sql,
        runId: ctx.runId,
        organizationId: ctx.organizationId,
        collectorName: collector.name,
        findings: result.findings,
        relationships: result.relationships,
        metrics: result.metrics,
      });
      log.info(
        { collector: collector.name, findings: result.findings.length },
        'collector_data_persisted'
      );
    } catch (err) {
      log.error(
        { collector: collector.name, error: (err as Error).message },
        'collector_persist_failed'
      );
      // Don't fail the collector if DB write fails — the result is still valid
    }
  }

  return result;
}

export interface PipelineResult {
  status: 'completed' | 'completed_warnings' | 'failed';
  results: Map<string, CollectorResult>;
  errors: string[];
}

/**
 * Run the full extraction pipeline.
 */
export async function runPipeline(ctx: CollectorContext): Promise<PipelineResult> {
  const log = logger.child({ component: 'pipeline', runId: ctx.runId });
  const results = new Map<string, CollectorResult>();
  const errors: string[] = [];
  const limit = pLimit(MAX_CONCURRENCY);

  // ── Phase 1: Discovery (sequential) ──────────────────────────────
  log.info('phase_1_start: discovery');
  const discovery = new DiscoveryCollector(ctx);
  const discoveryResult = await runAndPersist(discovery, ctx, log);
  results.set('discovery', discoveryResult);

  if (discoveryResult.status === 'failed') {
    log.error('phase_1_failed: discovery collector failed, aborting pipeline');
    return { status: 'failed', results, errors: [discoveryResult.error ?? 'Discovery failed'] };
  }

  // ── Phase 2: Tier 0 (parallel) → gate ────────────────────────────
  log.info('phase_2_start: tier0 collectors');
  const tier0Collectors = [
    new CatalogCollector(ctx),
    new PricingCollector(ctx),
    new UsageCollector(ctx),
  ];

  const tier0Results = await Promise.all(
    tier0Collectors.map((c) => limit(() => runAndPersist(c, ctx, log)))
  );

  for (let i = 0; i < tier0Collectors.length; i++) {
    results.set(tier0Collectors[i].name, tier0Results[i]);
  }

  // Gate: all tier0 must succeed
  const tier0Failed = tier0Results.filter((r) => r.status === 'failed');
  if (tier0Failed.length > 0) {
    const failedNames = tier0Collectors
      .filter((_, i) => tier0Results[i].status === 'failed')
      .map((c) => c.name);
    log.error({ failedNames }, 'phase_2_failed: tier0 gate not met');
    return {
      status: 'failed',
      results,
      errors: failedNames.map((n) => `Tier 0 collector '${n}' failed`),
    };
  }

  // ── Phase 3: Tier 1 + Tier 2 (parallel) → tier1 threshold ───────
  log.info('phase_3_start: tier1 + tier2 collectors');
  const tier1Collectors = [
    new DependenciesCollector(ctx),
    new CustomizationsCollector(ctx),
    new SettingsCollector(ctx),
    new OrderLifecycleCollector(ctx),
  ];

  const tier2Collectors = [
    new TemplatesCollector(ctx),
    new ApprovalsCollector(ctx),
    new IntegrationsCollector(ctx),
    new LocalizationCollector(ctx),
  ];

  const phase3Collectors = [...tier1Collectors, ...tier2Collectors];
  const phase3Results = await Promise.all(
    phase3Collectors.map((c) => limit(() => runAndPersist(c, ctx, log)))
  );

  for (let i = 0; i < phase3Collectors.length; i++) {
    results.set(phase3Collectors[i].name, phase3Results[i]);
  }

  // Tier 1 threshold check: at least 50% must succeed
  const tier1Results = phase3Results.slice(0, tier1Collectors.length);
  const tier1SuccessCount = tier1Results.filter((r) => r.status !== 'failed').length;
  const tier1SuccessRate = tier1SuccessCount / tier1Collectors.length;

  if (tier1SuccessRate < TIER1_THRESHOLD) {
    const failedNames = tier1Collectors
      .filter((_, i) => tier1Results[i].status === 'failed')
      .map((c) => c.name);
    log.error({ failedNames, tier1SuccessRate }, 'phase_3_failed: tier1 threshold not met');
    return {
      status: 'failed',
      results,
      errors: [
        `Tier 1 threshold not met: ${tier1SuccessCount}/${tier1Collectors.length} succeeded (need ${TIER1_THRESHOLD * 100}%)`,
      ],
    };
  }

  // Collect warnings from any failed tier1/tier2
  const phase3Failed = phase3Collectors
    .filter((_, i) => phase3Results[i].status === 'failed')
    .map((c) => c.name);
  if (phase3Failed.length > 0) {
    errors.push(...phase3Failed.map((n) => `Collector '${n}' failed (non-fatal)`));
  }

  // ── Phase 4: Post-processing ─────────────────────────────────────
  log.info('phase_4_start: post-processing');
  // TODO: These are sequential post-processing steps
  try {
    await buildRelationships(ctx, results);
    await computeDerivedMetrics(ctx, results);
    await validateExtraction(ctx, results);
    await buildContextBlueprint(ctx, results);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.warn({ error: msg }, 'phase_4_warning: post-processing error (non-fatal)');
    errors.push(`Post-processing warning: ${msg}`);
  }

  // ── Phase 5: Summaries ───────────────────────────────────────────
  log.info('phase_5_start: summaries');
  try {
    await buildSummaries(ctx, results);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.warn({ error: msg }, 'phase_5_warning: summary generation error (non-fatal)');
    errors.push(`Summary warning: ${msg}`);
  }

  const finalStatus = errors.length > 0 ? 'completed_warnings' : 'completed';
  log.info(
    { status: finalStatus, collectorCount: results.size, errors: errors.length },
    'pipeline_complete'
  );

  return { status: finalStatus, results, errors };
}
