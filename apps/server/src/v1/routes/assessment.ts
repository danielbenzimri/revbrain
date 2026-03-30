/**
 * Assessment extraction API routes.
 *
 * POST /:projectId/assessment/run — trigger extraction run
 * GET  /:projectId/assessment/status — latest run status
 * GET  /:projectId/assessment/runs — list all runs
 * GET  /:projectId/assessment/runs/:runId/status — poll run status
 * GET  /:projectId/assessment/runs/:runId/findings — get findings
 * POST /:projectId/assessment/runs/:runId/cancel — cancel run
 *
 * See: Implementation Plan Task 9.1
 */

import { spawn } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { OpenAPIHono } from '@hono/zod-openapi';
import type { AppEnv } from '../../types/index.ts';
import type { AssessmentRunStatus } from '@revbrain/contract';
import { getEnv } from '../../lib/env.ts';
import { logger } from '../../lib/logger.ts';

// ---------------------------------------------------------------------------
// Report generation — dynamic import from worker package at runtime.
// Uses dynamic import() to avoid TypeScript rootDir restrictions while
// allowing the server to assemble + render the full HTML report.
// The worker report modules only depend on @revbrain/contract (shared).
// ---------------------------------------------------------------------------

let _assembleReport: ((findings: unknown[]) => unknown) | null = null;
let _renderReport: ((data: unknown) => string) | null = null;

async function getReportModules() {
  if (_assembleReport && _renderReport) return { assembleReport: _assembleReport, renderReport: _renderReport };
  try {
    const workerReportPath = resolve(
      dirname(fileURLToPath(import.meta.url)),
      '../../../../worker/src/report/index.ts'
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mod = await import(workerReportPath) as any;
    _assembleReport = mod.assembleReport;
    _renderReport = mod.renderReport;
    return { assembleReport: _assembleReport!, renderReport: _renderReport! };
  } catch (err) {
    logger.error('report_module_import_failed', {
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

// ---------------------------------------------------------------------------
// Worker dispatch — local (dev) or Cloud Run trigger proxy (staging/prod)
// ---------------------------------------------------------------------------

async function dispatchWorker(runId: string, connectionId: string): Promise<void> {
  const isLocal =
    (getEnv('APP_ENV') || '').startsWith('local') || getEnv('NODE_ENV') === 'development';

  if (isLocal) {
    dispatchWorkerLocally(runId, connectionId);
    return;
  }

  // Production/staging: call Cloud Run trigger proxy
  await dispatchWorkerCloudRun(runId, connectionId);
}

async function dispatchWorkerCloudRun(runId: string, connectionId: string): Promise<void> {
  const triggerUrl = getEnv('CLOUD_RUN_TRIGGER_URL');
  const triggerSecret = getEnv('INTERNAL_API_SECRET');

  if (!triggerUrl || !triggerSecret) {
    logger.error('cloud_run_dispatch_missing_config', {
      hasTriggerUrl: !!triggerUrl,
      hasSecret: !!triggerSecret,
    });
    return;
  }

  try {
    const res = await fetch(`${triggerUrl}/trigger`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${triggerSecret}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        jobId: `job-${Date.now()}`,
        runId,
        connectionId,
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      logger.error('cloud_run_dispatch_failed', { status: res.status, body, runId });
      return;
    }

    logger.info('cloud_run_dispatch_success', { runId });
  } catch (err) {
    logger.error('cloud_run_dispatch_error', {
      error: err instanceof Error ? err.message : String(err),
      runId,
    });
  }
}

function dispatchWorkerLocally(runId: string, connectionId: string): void {
  const workerEntry = resolve(
    dirname(fileURLToPath(import.meta.url)),
    '../../../../worker/src/index.ts'
  );

  console.log(`[assessment] Spawning local worker for run ${runId} → ${workerEntry}`);

  const child = spawn('npx', ['tsx', workerEntry], {
    env: {
      ...process.env,
      JOB_ID: `local-${Date.now()}`,
      RUN_ID: runId,
      CONNECTION_ID: connectionId,
      SUPABASE_STORAGE_URL: `${process.env.SUPABASE_URL}/storage/v1`,
      INTERNAL_API_URL: 'http://localhost:3000/api',
      INTERNAL_API_SECRET: process.env.WORKER_SECRET || '',
      LOG_LEVEL: 'info',
      WORKER_VERSION: 'local-dev',
      TRACE_ID: `local-trace-${runId.slice(0, 8)}`,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true,
  });

  child.stdout?.on('data', (data: Buffer) =>
    console.log(`[worker:${runId.slice(0, 8)}] ${data.toString().trimEnd()}`)
  );
  child.stderr?.on('data', (data: Buffer) =>
    console.error(`[worker:${runId.slice(0, 8)}] ${data.toString().trimEnd()}`)
  );
  child.on('error', (err) =>
    console.error(`[worker:${runId.slice(0, 8)}] spawn error:`, err.message)
  );

  child.unref();
}

export const assessmentRouter = new OpenAPIHono<AppEnv>();

// Terminal statuses that cannot be cancelled
const TERMINAL_STATUSES: AssessmentRunStatus[] = [
  'completed',
  'completed_warnings',
  'failed',
  'cancelled',
];

// Max concurrent runs (global soft cap)
const MAX_GLOBAL_CONCURRENT_RUNS = 6;

// ==========================================================================
// POST /:projectId/assessment/run — Trigger extraction
// ==========================================================================

assessmentRouter.post('/:projectId/assessment/run', async (c) => {
  const user = c.get('user');
  const projectId = c.req.param('projectId');
  const repos = c.var.repos;

  // 1. Validate project access
  const project = await repos.projects.findById(projectId);
  if (!project || project.organizationId !== user.organizationId) {
    return c.json(
      { success: false, error: { code: 'NOT_FOUND', message: 'Project not found' } },
      404
    );
  }

  // 2. Check active Salesforce connection (source)
  const connections = await repos.salesforceConnections.findByProject(projectId);
  const sourceConnection = connections.find(
    (conn) => conn.connectionRole === 'source' && conn.status === 'connected'
  );
  if (!sourceConnection) {
    return c.json(
      {
        success: false,
        error: {
          code: 'PRECONDITION_FAILED',
          message: 'No active source Salesforce connection. Connect your org first.',
        },
      },
      412
    );
  }

  // 3. Check org-level concurrency (max 1 active per org)
  const activeOrgRuns = await repos.assessmentRuns.countActiveRunsByOrg(user.organizationId);
  if (activeOrgRuns > 0) {
    return c.json(
      {
        success: false,
        error: {
          code: 'CONFLICT',
          message: 'An extraction run is already in progress for your organization.',
        },
      },
      409
    );
  }

  // 4. Check global concurrency cap
  const activeGlobal = await repos.assessmentRuns.countActiveRuns();
  if (activeGlobal >= MAX_GLOBAL_CONCURRENT_RUNS) {
    return c.json(
      {
        success: false,
        error: {
          code: 'SERVICE_BUSY',
          message: 'System is at capacity. Please try again in a few minutes.',
        },
      },
      503
    );
  }

  // 5. Check rate limit (most recent run for this project must be >5min ago)
  const latestRun = await repos.assessmentRuns.findLatestRunByProject(projectId);
  if (latestRun) {
    const fiveMinAgo = Date.now() - 5 * 60 * 1000;
    if (latestRun.createdAt.getTime() > fiveMinAgo) {
      return c.json(
        {
          success: false,
          error: {
            code: 'RATE_LIMITED',
            message: 'Please wait at least 5 minutes between extraction runs.',
          },
        },
        429
      );
    }
  }

  // 6. Parse optional config from body
  const body = await c.req.json().catch(() => ({}));
  const mode = (body as Record<string, string>).mode ?? 'full';
  const rawSnapshotMode = (body as Record<string, string>).rawSnapshotMode ?? 'errors_only';
  const idempotencyKey = c.req.header('Idempotency-Key') ?? undefined;

  // 7. Create run record
  const run = await repos.assessmentRuns.createRun({
    projectId,
    organizationId: user.organizationId,
    connectionId: sourceConnection.id,
    mode,
    rawSnapshotMode,
    idempotencyKey,
    createdBy: user.id,
  });

  // 8. CAS dispatch: queued → dispatched (prevents race with duplicate triggers)
  const dispatched = await repos.assessmentRuns.casDispatch(run.id);
  if (!dispatched) {
    return c.json(
      {
        success: false,
        error: { code: 'CONFLICT', message: 'Run could not be dispatched (already claimed).' },
      },
      409
    );
  }

  // 9. Trigger worker (local spawn in dev, Cloud Run in production)
  // Fire-and-forget: don't await — the run is already persisted, worker picks it up
  dispatchWorker(dispatched.id, sourceConnection.id).catch(() => {});

  return c.json(
    {
      success: true,
      data: {
        runId: dispatched.id,
        status: dispatched.status,
        projectId: dispatched.projectId,
        connectionId: dispatched.connectionId,
        createdAt: dispatched.createdAt.toISOString(),
        dispatchedAt: dispatched.dispatchedAt?.toISOString() ?? null,
      },
    },
    202
  );
});

// ==========================================================================
// GET /:projectId/assessment/status — Latest run status (shorthand)
// ==========================================================================

assessmentRouter.get('/:projectId/assessment/status', async (c) => {
  const user = c.get('user');
  const projectId = c.req.param('projectId');
  const repos = c.var.repos;

  // Validate project access
  const project = await repos.projects.findById(projectId);
  if (!project || project.organizationId !== user.organizationId) {
    return c.json(
      { success: false, error: { code: 'NOT_FOUND', message: 'Project not found' } },
      404
    );
  }

  const latestRun = await repos.assessmentRuns.findLatestRunByProject(projectId);
  if (!latestRun) {
    return c.json({ success: true, data: null });
  }

  const findingsCount = await repos.assessmentRuns.countFindingsByRun(latestRun.id);

  return c.json({
    success: true,
    data: formatRunResponse(latestRun, findingsCount),
  });
});

// ==========================================================================
// GET /:projectId/assessment/runs — List all runs
// ==========================================================================

assessmentRouter.get('/:projectId/assessment/runs', async (c) => {
  const user = c.get('user');
  const projectId = c.req.param('projectId');
  const repos = c.var.repos;

  const project = await repos.projects.findById(projectId);
  if (!project || project.organizationId !== user.organizationId) {
    return c.json(
      { success: false, error: { code: 'NOT_FOUND', message: 'Project not found' } },
      404
    );
  }

  const limit = Math.min(Number(c.req.query('limit') ?? 20), 100);
  const offset = Number(c.req.query('offset') ?? 0);

  const runs = await repos.assessmentRuns.findRunsByProject(projectId, { limit, offset });

  return c.json({
    success: true,
    data: runs.map((r) => formatRunResponse(r)),
  });
});

// ==========================================================================
// GET /:projectId/assessment/runs/:runId/status — Poll run status
// ==========================================================================

assessmentRouter.get('/:projectId/assessment/runs/:runId/status', async (c) => {
  const user = c.get('user');
  const projectId = c.req.param('projectId');
  const runId = c.req.param('runId');
  const repos = c.var.repos;

  const run = await repos.assessmentRuns.findRunById(runId);
  if (!run || run.projectId !== projectId) {
    return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Run not found' } }, 404);
  }

  // Org-scoped access check
  const project = await repos.projects.findById(projectId);
  if (!project || project.organizationId !== user.organizationId) {
    return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Run not found' } }, 404);
  }

  const findingsCount = await repos.assessmentRuns.countFindingsByRun(runId);

  return c.json({
    success: true,
    data: formatRunResponse(run, findingsCount),
  });
});

// ==========================================================================
// GET /:projectId/assessment/runs/:runId/findings — Get findings
// ==========================================================================

assessmentRouter.get('/:projectId/assessment/runs/:runId/findings', async (c) => {
  const user = c.get('user');
  const projectId = c.req.param('projectId');
  const runId = c.req.param('runId');
  const repos = c.var.repos;

  const run = await repos.assessmentRuns.findRunById(runId);
  if (!run || run.projectId !== projectId) {
    return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Run not found' } }, 404);
  }

  const project = await repos.projects.findById(projectId);
  if (!project || project.organizationId !== user.organizationId) {
    return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Run not found' } }, 404);
  }

  const domain = c.req.query('domain') ?? undefined;
  const limit = Math.min(Number(c.req.query('limit') ?? 500), 2000);
  const offset = Number(c.req.query('offset') ?? 0);

  const findings = await repos.assessmentRuns.findFindingsByRun(runId, {
    domain,
    limit,
    offset,
  });

  const total = await repos.assessmentRuns.countFindingsByRun(runId, domain);

  return c.json({
    success: true,
    data: findings,
    pagination: {
      total,
      limit,
      offset,
      hasMore: offset + limit < total,
    },
  });
});

// ==========================================================================
// POST /:projectId/assessment/runs/:runId/cancel — Cancel run
// ==========================================================================

assessmentRouter.post('/:projectId/assessment/runs/:runId/cancel', async (c) => {
  const user = c.get('user');
  const projectId = c.req.param('projectId');
  const runId = c.req.param('runId');
  const repos = c.var.repos;

  const run = await repos.assessmentRuns.findRunById(runId);
  if (!run || run.projectId !== projectId) {
    return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Run not found' } }, 404);
  }

  const project = await repos.projects.findById(projectId);
  if (!project || project.organizationId !== user.organizationId) {
    return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Run not found' } }, 404);
  }

  // State machine: determine target status based on current status
  if (TERMINAL_STATUSES.includes(run.status)) {
    return c.json(
      {
        success: false,
        error: {
          code: 'BAD_REQUEST',
          message: `Cannot cancel run in '${run.status}' state. Run has already completed.`,
        },
      },
      400
    );
  }

  if (run.status === 'cancel_requested') {
    // No-op: already requested
    return c.json({
      success: true,
      data: formatRunResponse(run),
    });
  }

  let targetStatus: AssessmentRunStatus;
  const extra: Record<string, unknown> = {};

  if (run.status === 'queued' || run.status === 'stalled' || run.status === 'dispatched') {
    // Can cancel directly
    targetStatus = 'cancelled';
    extra.statusReason = `Cancelled by user ${user.email}`;
  } else if (run.status === 'running') {
    // Worker is active — request cancellation (worker checks at next checkpoint)
    targetStatus = 'cancel_requested';
    extra.cancelRequestedAt = new Date();
  } else {
    return c.json(
      {
        success: false,
        error: { code: 'BAD_REQUEST', message: `Unexpected run status: ${run.status}` },
      },
      400
    );
  }

  const updated = await repos.assessmentRuns.updateRunStatus(runId, targetStatus, extra);
  if (!updated) {
    return c.json(
      {
        success: false,
        error: { code: 'CONFLICT', message: 'Run status changed concurrently. Please retry.' },
      },
      409
    );
  }

  return c.json({
    success: true,
    data: formatRunResponse(updated),
  });
});

// ==========================================================================
// POST /:projectId/assessment/runs/:runId/report — Generate PDF report
// ==========================================================================

assessmentRouter.post('/:projectId/assessment/runs/:runId/report', async (c) => {
  const user = c.get('user');
  const projectId = c.req.param('projectId');
  const runId = c.req.param('runId');
  const repos = c.var.repos;

  const run = await repos.assessmentRuns.findRunById(runId);
  if (!run || run.projectId !== projectId) {
    return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Run not found' } }, 404);
  }

  const project = await repos.projects.findById(projectId);
  if (!project || project.organizationId !== user.organizationId) {
    return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Run not found' } }, 404);
  }

  if (!['completed', 'completed_warnings'].includes(run.status)) {
    return c.json(
      {
        success: false,
        error: {
          code: 'BAD_REQUEST',
          message: `Cannot generate report for run in '${run.status}' state.`,
        },
      },
      400
    );
  }

  // Check for cached report (skip regeneration unless ?regenerate=true)
  const metadata = (run as any).metadata as Record<string, unknown> | null;
  const existingPath = metadata?.reportPath as string | undefined;
  const regenerate = c.req.query('regenerate') === 'true';

  if (existingPath && !regenerate) {
    // Return cached report info — client can use the download endpoint
    return c.json({
      success: true,
      data: {
        status: 'ready',
        reportPath: existingPath,
        generatedAt: metadata?.reportGeneratedAt ?? null,
      },
    });
  }

  // Generate report — assemble findings into structured data, then render HTML.
  // The assembler + renderer are dynamically imported from the worker package
  // (pure functions, no heavy deps — only @revbrain/contract types and templates).
  try {
    const reportModules = await getReportModules();
    if (!reportModules) {
      return c.json(
        {
          success: false,
          error: {
            code: 'REPORT_GENERATION_FAILED',
            message: 'Report generation modules not available. Ensure the worker package is accessible.',
          },
        },
        500
      );
    }

    const findings = await repos.assessmentRuns.findFindingsByRun(runId, { limit: 5000 });

    // Query param: ?format=html returns raw HTML for download; default returns JSON metadata
    const format = c.req.query('format');

    // Assemble the report data structure from raw findings
    const reportData = reportModules.assembleReport(findings);

    // Render the full HTML report
    const html = reportModules.renderReport(reportData);

    if (format === 'html') {
      // Return raw HTML — client will trigger download or print-to-PDF
      return new Response(html, {
        status: 200,
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Content-Disposition': `attachment; filename="cpq-assessment-${runId.slice(0, 8)}.html"`,
        },
      });
    }

    // Default: return JSON with report metadata + HTML embedded
    return c.json({
      success: true,
      data: {
        runId,
        totalFindings: findings.length,
        reportHtml: html,
        generatedAt: new Date().toISOString(),
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return c.json(
      {
        success: false,
        error: { code: 'REPORT_GENERATION_FAILED', message: `Report generation failed: ${msg}` },
      },
      500
    );
  }
});

// ==========================================================================
// GET /:projectId/assessment/runs/:runId/report/download — Download PDF
// ==========================================================================

assessmentRouter.get('/:projectId/assessment/runs/:runId/report/download', async (c) => {
  const user = c.get('user');
  const projectId = c.req.param('projectId');
  const runId = c.req.param('runId');
  const repos = c.var.repos;

  const run = await repos.assessmentRuns.findRunById(runId);
  if (!run || run.projectId !== projectId) {
    return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Run not found' } }, 404);
  }

  const project = await repos.projects.findById(projectId);
  if (!project || project.organizationId !== user.organizationId) {
    return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Run not found' } }, 404);
  }

  // Generate HTML report on-the-fly and return as downloadable file
  if (!['completed', 'completed_warnings'].includes(run.status)) {
    return c.json(
      {
        success: false,
        error: {
          code: 'BAD_REQUEST',
          message: `Cannot download report for run in '${run.status}' state.`,
        },
      },
      400
    );
  }

  try {
    const reportModules = await getReportModules();
    if (!reportModules) {
      return c.json(
        {
          success: false,
          error: {
            code: 'REPORT_GENERATION_FAILED',
            message: 'Report generation modules not available.',
          },
        },
        500
      );
    }

    const findings = await repos.assessmentRuns.findFindingsByRun(runId, { limit: 5000 });
    const reportData = reportModules.assembleReport(findings);
    const html = reportModules.renderReport(reportData);

    return new Response(html, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Disposition': `attachment; filename="cpq-assessment-${runId.slice(0, 8)}.html"`,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return c.json(
      {
        success: false,
        error: { code: 'REPORT_GENERATION_FAILED', message: `Report generation failed: ${msg}` },
      },
      500
    );
  }
});

// ==========================================================================
// Helpers
// ==========================================================================

function formatRunResponse(
  run: {
    id: string;
    status: string;
    projectId: string;
    connectionId: string;
    mode: string;
    progress: Record<string, unknown>;
    error: string | null;
    durationMs: number | null;
    apiCallsUsed: number | null;
    recordsExtracted: number | null;
    completenessPct: number | null;
    createdAt: Date;
    dispatchedAt: Date | null;
    startedAt: Date | null;
    completedAt: Date | null;
    failedAt: Date | null;
    cancelRequestedAt: Date | null;
  },
  findingsCount?: number
) {
  return {
    runId: run.id,
    status: run.status,
    projectId: run.projectId,
    connectionId: run.connectionId,
    mode: run.mode,
    progress: run.progress,
    error: run.error,
    durationMs: run.durationMs,
    apiCallsUsed: run.apiCallsUsed,
    recordsExtracted: run.recordsExtracted,
    completenessPct: run.completenessPct,
    findingsCount: findingsCount ?? null,
    createdAt: run.createdAt.toISOString(),
    dispatchedAt: run.dispatchedAt?.toISOString() ?? null,
    startedAt: run.startedAt?.toISOString() ?? null,
    completedAt: run.completedAt?.toISOString() ?? null,
    failedAt: run.failedAt?.toISOString() ?? null,
    cancelRequestedAt: run.cancelRequestedAt?.toISOString() ?? null,
  };
}
