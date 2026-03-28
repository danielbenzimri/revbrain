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

import { OpenAPIHono } from '@hono/zod-openapi';
import type { AppEnv } from '../../types/index.ts';
import type { AssessmentRunStatus } from '@revbrain/contract';

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

  // 9. Trigger Cloud Run Job (placeholder — returns dispatched status)
  // In production: call GCP Cloud Run Jobs API to create execution
  // For now: the worker can poll for dispatched runs or be triggered externally

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

  // Generate report — returns findings as structured JSON for now.
  // Full PDF generation requires Playwright (available in worker package).
  // v1: Return structured report data that client can render or that
  // a dedicated report-generation endpoint in the worker can consume.
  try {
    const findings = await repos.assessmentRuns.findFindingsByRun(runId, { limit: 5000 });

    // Group findings by artifact type for the report structure
    const byType: Record<string, typeof findings> = {};
    for (const f of findings) {
      if (!byType[f.artifactType]) byType[f.artifactType] = [];
      byType[f.artifactType].push(f);
    }

    const settingsPanel = (byType['CPQSettingValue'] ?? []).map((f) => ({
      setting: f.artifactName,
      value: ((f.evidenceRefs?.[0] as Record<string, unknown>)?.label as string) ?? 'Unknown',
      notes: f.notes ?? '',
    }));

    const plugins = (byType['PluginStatus'] ?? []).map((f) => ({
      plugin: f.artifactName,
      status: (f.countValue ?? 0) > 0 ? 'Active' : 'Not Configured',
      notes: f.notes ?? '',
    }));

    const hotspots = (byType['ComplexityHotspot'] ?? []).map((f) => ({
      name: f.artifactName,
      severity: f.riskLevel ?? 'medium',
      analysis: f.notes ?? '',
    }));

    const topProducts = (byType['TopQuotedProduct'] ?? []).map((f) => ({
      name: f.artifactName,
      quotedCount: f.countValue ?? 0,
      notes: f.notes ?? '',
    }));

    const objectInventory = (byType['ObjectInventoryItem'] ?? []).map((f, i) => ({
      id: i + 1,
      objectName: f.artifactName,
      count: f.countValue ?? 0,
      complexity: f.complexityLevel ?? 'low',
    }));

    return c.json({
      success: true,
      data: {
        runId,
        totalFindings: findings.length,
        settingsPanel,
        plugins,
        hotspots,
        topProducts,
        objectInventory,
        findingsByType: Object.fromEntries(
          Object.entries(byType).map(([type, items]) => [type, items.length])
        ),
        // PDF generation available via worker script:
        // npx tsx apps/worker/scripts/generate-report.ts --runId={runId}
        pdfAvailable: false,
        pdfNote:
          'PDF generation requires Playwright. Use the worker report generator for full PDF output.',
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

  // Check if PDF has been generated (stored in run metadata)
  // PDF generation happens via worker script: npx tsx apps/worker/scripts/generate-report.ts
  // and uploaded to Supabase Storage at assessment-reports/{runId}/report.pdf
  return c.json(
    {
      success: false,
      error: {
        code: 'NOT_AVAILABLE',
        message:
          'PDF report not yet generated. Run: npx tsx apps/worker/scripts/generate-report.ts',
      },
    },
    404
  );
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
