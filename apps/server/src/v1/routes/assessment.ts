/**
 * Assessment extraction API routes.
 *
 * POST /:projectId/assessment/run — trigger extraction run
 * GET /:projectId/assessment/runs/:runId/status — poll run status
 * POST /:projectId/assessment/runs/:runId/cancel — cancel run
 *
 * See: Implementation Plan Task 9.1
 */

import { OpenAPIHono } from '@hono/zod-openapi';
import { type AppEnv } from '../../types/index.ts';

export const assessmentRouter = new OpenAPIHono<AppEnv>();

/**
 * POST /:projectId/assessment/run
 *
 * Trigger a CPQ data extraction run.
 * - Validates project access + active SF connection
 * - Checks no active run (unique partial index)
 * - Creates assessment_runs record (status: queued)
 * - CAS dispatch: queued → dispatched before Cloud Run trigger
 * - Accepts Idempotency-Key header
 * - Rate limit: 1 run per project per 5 minutes
 * - Global concurrency: max 6 concurrent runs across all orgs
 */
assessmentRouter.post('/:projectId/assessment/run', async (c) => {
  // TODO: Wire to actual service layer
  // 1. Validate project access via auth middleware
  // 2. Check active SF connection for project
  // 3. Check idempotency key
  // 4. Check rate limit (1 per project per 5 min)
  // 5. Check global concurrency cap (max 6)
  // 6. Create assessment_runs record
  // 7. CAS dispatch: queued → dispatched
  // 8. Trigger Cloud Run job
  // 9. Return runId with 202 Accepted

  return c.json(
    {
      success: false,
      error: {
        code: 'NOT_IMPLEMENTED',
        message: 'Assessment run trigger not yet wired',
      },
    },
    501
  );
});

/**
 * GET /:projectId/assessment/runs/:runId/status
 *
 * Poll run status + progress.
 * Returns current status, progress JSONB, timestamps, error.
 */
assessmentRouter.get('/:projectId/assessment/runs/:runId/status', async (c) => {
  // TODO: Wire to actual DB query
  // 1. Validate org-scoped access
  // 2. Read assessment_runs by runId
  // 3. Return status + progress

  return c.json(
    {
      success: false,
      error: {
        code: 'NOT_IMPLEMENTED',
        message: 'Assessment status polling not yet wired',
      },
    },
    501
  );
});

/**
 * POST /:projectId/assessment/runs/:runId/cancel
 *
 * Cancel a running assessment.
 * Handles all non-terminal states:
 * - queued/stalled → cancelled directly
 * - dispatched → cancelled (abort Cloud Run if possible)
 * - running → cancel_requested (worker stops at next checkpoint)
 * - cancel_requested → no-op
 * - Terminal states → 400
 */
assessmentRouter.post('/:projectId/assessment/runs/:runId/cancel', async (c) => {
  // TODO: Wire to actual DB update
  // 1. Validate org-scoped access
  // 2. Read current status
  // 3. Determine transition based on current state
  // 4. Update status
  // 5. Return updated status

  return c.json(
    {
      success: false,
      error: {
        code: 'NOT_IMPLEMENTED',
        message: 'Assessment cancellation not yet wired',
      },
    },
    501
  );
});
