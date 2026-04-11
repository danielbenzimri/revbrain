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
import { ComponentsCollector } from './collectors/components.ts';
import { Tier2InventoriesCollector } from './collectors/tier2-inventories.ts';
import { buildRelationships } from './normalize/relationships.ts';
import { computeDerivedMetrics, computeAttachmentRates } from './normalize/metrics.ts';
import { joinPluginActivation } from './normalize/plugin-activation.ts';
import { introspectFls, type FieldPermissionsRow } from './salesforce/fls-introspect.ts';
import { validateExtraction } from './normalize/validation.ts';
import { buildContextBlueprint } from './normalize/context-blueprint.ts';
import { buildSummaries } from './summaries/builder.ts';
import { logger } from './lib/logger.ts';
import { writeCollectorData } from './db/writes.ts';
import type { BaseCollector } from './collectors/base.ts';
import { runBB3 } from './pipeline/run-bb3.ts';
import { emitBB3Metrics, type Logger as BB3Logger } from './pipeline/bb3-metrics.ts';
import { SupabaseBlobStore } from './pipeline/supabase-blob-store.ts';
import { writeIRGraph } from './db/write-ir-graph.ts';
import type { BlobStore, NormalizeResult } from '@revbrain/bb3-normalizer';
import type { AssessmentFindingInput } from '@revbrain/contract';

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

  // ── Phase 0: FLS pre-flight (EXT-CC1) ────────────────────────────
  // Per the v1.1 fix in gaps-doc §7 CC-1: View All Data does NOT
  // override Field-Level Security. An integration user with VAD
  // but missing FLS read on a CPQ field will silently fail to
  // extract that field — the field is just absent with no error.
  // This pre-flight catches the gap up front.
  //
  // Failure mode: graceful — we log gaps + emit fls metrics on
  // the run, but DO NOT abort yet. The hard-abort branch (when
  // an identifier like Id/Name is unreadable) is gated behind a
  // config flag because we cannot validate it against staging
  // until a follow-up integration test lands.
  try {
    const fls = await introspectFls(async (objects) => {
      const objectList = objects.map((o) => `'${o}'`).join(',');
      // Standard FieldPermissions query — limited to the
      // SObjectTypes the worker actually projects in its SOQL.
      const soql =
        `SELECT Field, PermissionsRead FROM FieldPermissions ` +
        `WHERE SObjectType IN (${objectList})`;
      const result = await ctx.restApi.query<FieldPermissionsRow>(soql, undefined);
      return result.records;
    });
    log.info(
      {
        required: fls.requiredCount,
        gaps: fls.gaps.length,
        hardFailures: fls.hasHardFailures,
      },
      'fls_introspection_complete'
    );
    if (fls.gaps.length > 0) {
      log.warn(
        { sample: fls.gaps.slice(0, 10).map((g) => `${g.object}.${g.field}`) },
        'fls_gaps_detected'
      );
    }
  } catch (err) {
    // Pre-flight failure should never block extraction — log
    // and continue. The collectors themselves will report any
    // privilege issues per-collector.
    log.warn({ error: (err as Error).message }, 'fls_introspection_failed_continuing_with_warning');
    errors.push(`FLS pre-flight warning: ${(err as Error).message}`);
  }

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
    new ComponentsCollector(ctx),
    new Tier2InventoriesCollector(ctx),
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

  // EXT-1.2 — Plugin activation join. Runs BEFORE buildRelationships
  // because the join mutates the dependencies findings (appends an
  // isActivePlugin evidenceRef to the matching cpq_apex_plugin
  // finding) and emits new findings the relationship graph should
  // see. Pure function — no SF API calls, just an in-memory pass.
  try {
    const allFindings: AssessmentFindingInput[] = [];
    for (const [, result] of results) {
      if (result.status !== 'failed') allFindings.push(...result.findings);
    }
    const activation = joinPluginActivation(allFindings);
    log.info(
      {
        active: activation.stats.activePluginCount,
        unset: activation.stats.unsetPluginCount,
        orphaned: activation.stats.orphanedRegistrationCount,
      },
      'plugin_activation_joined'
    );
    if (activation.warnings.length > 0) {
      log.warn({ warnings: activation.warnings }, 'plugin_activation_warnings');
    }
    // Persist the new findings as part of the dependencies result
    // so they flow into BB-3 and the report. We pick dependencies
    // (not settings) because the join is conceptually about Apex
    // classes, and the report's "Apex Classes" section is where
    // the activation flag will eventually surface.
    const deps = results.get('dependencies');
    if (deps) {
      deps.findings = [...deps.findings, ...activation.newFindings];
      // Replace the existing apex plugin findings with the
      // updated copies (which now have the isActivePlugin
      // evidence ref) so downstream stages see the activation.
      const updatedByKey = new Map(activation.updatedFindings.map((f) => [f.findingKey, f]));
      deps.findings = deps.findings.map((f) => updatedByKey.get(f.findingKey) ?? f);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.warn({ error: msg }, 'plugin_activation_join_failed');
    errors.push(`Plugin activation join warning: ${msg}`);
  }

  try {
    const relGraph = await buildRelationships(ctx, results);
    log.info(
      { edges: relGraph.edges.length, crossDomain: relGraph.stats.crossDomainEdgeCount },
      'relationships_built'
    );

    const derivedMetrics = await computeDerivedMetrics(ctx, results);
    log.info(
      {
        complexityScore: derivedMetrics.overallComplexityScore,
        effortHours: derivedMetrics.estimatedEffortHours,
        volumeTier: derivedMetrics.volumeTier,
      },
      'derived_metrics_computed'
    );

    // G-07: Attachment rates (cross-collector: catalog + usage)
    const attachmentFindings = computeAttachmentRates(results);
    if (attachmentFindings.length > 0) {
      log.info({ attachmentFindings: attachmentFindings.length }, 'attachment_rates_computed');
    }

    const validation = await validateExtraction(ctx, results);
    if (!validation.valid) {
      errors.push(...validation.errors.map((e) => `Validation error: ${e}`));
    }
    if (validation.warnings.length > 0) {
      log.warn({ validationWarnings: validation.warnings }, 'extraction_validation_warnings');
    }

    const blueprint = await buildContextBlueprint(ctx, results);
    log.info(
      {
        totalFields: blueprint.totalSourceFields,
        mapped: blueprint.totalMapped,
        coverage: blueprint.coveragePercent,
      },
      'context_blueprint_built'
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.warn({ error: msg }, 'phase_4_warning: post-processing error (non-fatal)');
    errors.push(`Post-processing warning: ${msg}`);
  }

  // ── Phase 5: Summaries ───────────────────────────────────────────
  log.info('phase_5_start: summaries');
  try {
    const summaries = await buildSummaries(ctx, results);
    log.info(
      {
        overallScore: summaries.overallScore,
        domains: summaries.domainSummaries.length,
        totalFindings: summaries.totalFindings,
      },
      'summaries_built'
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.warn({ error: msg }, 'phase_5_warning: summary generation error (non-fatal)');
    errors.push(`Summary warning: ${msg}`);
  }

  // ── Phase 5.5: LLM Enrichment (optional) ────────────────────────
  if (ctx.config.llmEnrichmentEnabled && ctx.config.anthropicApiKey) {
    log.info('phase_5_5_start: llm_enrichment');
    try {
      const { enrichWithLLM } = await import('./summaries/llm-enrichment.ts');
      const enrichment = await enrichWithLLM({
        apiKey: ctx.config.anthropicApiKey,
        model: ctx.config.anthropicModel ?? undefined,
        summaries: {
          overallScore: 0,
          domainSummaries: [],
          totalFindings: 0,
          riskDistribution: { critical: 0, high: 0, medium: 0, low: 0, info: 0 },
          generatedAt: new Date().toISOString(),
        },
        results,
      });
      if (enrichment) {
        // Write to assessment_summaries table
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (ctx.sql as any)`
            INSERT INTO assessment_summaries (run_id, summary_type, content, schema_version)
            VALUES (${ctx.runId}, 'llm_enrichment', ${JSON.stringify(enrichment)}, '1.0')
            ON CONFLICT (run_id, summary_type, COALESCE(domain, '_global'))
            DO UPDATE SET content = EXCLUDED.content, created_at = NOW()
          `;
        } catch {
          log.warn('llm_enrichment_db_write_failed');
        }
        log.info(
          {
            summaryCount: enrichment.executiveSummary.length,
            hotspotCount: enrichment.hotspotAnalyses.length,
            lifecycleSteps: enrichment.lifecycleDescription.length,
          },
          'llm_enrichment_complete'
        );
      }
    } catch {
      log.warn('phase_5_5_warning: llm enrichment failed (non-fatal)');
    }
  } else {
    log.info('phase_5_5_skip: llm_enrichment_disabled');
  }

  // ── Phase 5.6: BB-3 normalization (PH9.9) ───────────────────────
  // Feeds every collector's findings into the BB-3 normalizer and
  // captures the resulting IRGraph for downstream persistence
  // (PH9.10) and metrics emission (PH9.11). BB-3 failures are
  // logged but NEVER fail the extraction run — per §10.1 the
  // graph is advisory output, not a gate.
  let bb3Result: NormalizeResult | null = null;
  try {
    log.info('phase_5_6_start: bb3_normalize');
    const allFindings: AssessmentFindingInput[] = [];
    for (const collectorResult of results.values()) {
      allFindings.push(...collectorResult.findings);
    }

    // PH9 §8.2 — wire a Supabase blob store when the env vars are
    // present so large CustomComputationIR.rawSource blobs get
    // externalized to the bb3-blobs bucket. Falls back to inline
    // (no store) when the env is incomplete — fixture / unit
    // test runs always take the inline path. Reads from process.env
    // directly because CollectorContext.config is a slimmer
    // subset that doesn't include the Supabase env vars.
    const supabaseUrl = process.env.SUPABASE_STORAGE_URL ?? process.env.SUPABASE_URL;
    const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const blobStore: BlobStore | undefined =
      supabaseUrl && supabaseServiceRoleKey
        ? new SupabaseBlobStore({
            url: supabaseUrl,
            serviceRoleKey: supabaseServiceRoleKey,
            prefix: ctx.organizationId,
          })
        : undefined;

    bb3Result = await runBB3(allFindings, {
      extractedAt: new Date().toISOString(),
      ...(blobStore && { blobStore }),
    });
    log.info(
      {
        findingsIn: bb3Result.runtimeStats.totalFindingsIn,
        nodesOut: bb3Result.runtimeStats.totalNodesOut,
        edgeCount: bb3Result.graph.edges.length,
        diagnosticCount: bb3Result.diagnostics.length,
        quarantineCount: bb3Result.runtimeStats.quarantineCount,
        durationMs: bb3Result.runtimeStats.durationMs,
        bb3Version: bb3Result.runtimeStats.bb3Version,
      },
      'bb3_normalize_complete'
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.warn({ error: msg }, 'phase_5_6_warning: bb3_normalize failed (non-fatal)');
    errors.push(`BB-3 normalization warning: ${msg}`);
  }
  // PH9.10 — Persist the IRGraph onto assessment_runs.ir_graph
  // (added by migration 0044). Persistence failures are logged
  // inside writeIRGraph() and swallowed; they do not fail the
  // extraction run.
  // PH9.11 — Emit bb3_normalize_complete metrics event via the
  // existing worker pino logger. Lives here (not inside runBB3)
  // so the sink is an explicit worker concern, not a library one.
  if (bb3Result) {
    const persisted = await writeIRGraph({
      sql: ctx.sql,
      runId: ctx.runId,
      graph: bb3Result.graph,
    });
    if (persisted) {
      log.info({ nodesOut: bb3Result.runtimeStats.totalNodesOut }, 'bb3_ir_graph_persisted');
    } else {
      log.warn('bb3_ir_graph_persist_failed');
    }

    try {
      emitBB3Metrics(bb3Result, log as unknown as BB3Logger);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log.warn({ error: msg }, 'bb3_metrics_emit_failed');
    }
  }

  const finalStatus = errors.length > 0 ? 'completed_warnings' : 'completed';
  log.info(
    { status: finalStatus, collectorCount: results.size, errors: errors.length },
    'pipeline_complete'
  );

  return { status: finalStatus, results, errors };
}
