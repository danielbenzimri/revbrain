/**
 * Admin Job Queue Routes
 *
 * Visibility into async job health: stats, dead job listing, and retry.
 */
import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import { authMiddleware } from '../../../middleware/auth.ts';
import { requireRole } from '../../../middleware/rbac.ts';
import { adminLimiter, listLimiter } from '../../../middleware/rate-limit.ts';
import { routeMiddleware } from '../../../lib/middleware-types.ts';
import { AppError, ErrorCodes } from '@revbrain/contract';
import { JobQueueService } from '../../../services/job-queue.service.ts';
import type { AppEnv } from '../../../types/index.ts';
import { buildAuditContext } from './utils/audit-context.ts';

const adminJobsRouter = new OpenAPIHono<AppEnv>();

// Retryable job types (idempotent-safe)
const RETRYABLE_TYPES = ['email', 'webhook'];

/**
 * GET /v1/admin/jobs/stats — Job queue statistics
 */
adminJobsRouter.openapi(
  createRoute({
    method: 'get',
    path: '/stats',
    summary: 'Get Job Queue Stats',
    description: 'Returns counts of pending, processing, completed, failed, and dead jobs.',
    middleware: routeMiddleware(authMiddleware, requireRole('system_admin'), listLimiter),
    responses: {
      200: {
        content: {
          'application/json': {
            schema: z.object({
              success: z.boolean(),
              data: z.object({
                pending: z.number(),
                processing: z.number(),
                completed: z.number(),
                failed: z.number(),
                dead: z.number(),
              }),
            }),
          },
        },
        description: 'Job queue statistics',
      },
    },
  }),
  async (c) => {
    const jobService = new JobQueueService();
    const stats = await jobService.getStats();
    return c.json({ success: true, data: stats });
  }
);

/**
 * GET /v1/admin/jobs/dead — List dead/failed jobs
 */
adminJobsRouter.openapi(
  createRoute({
    method: 'get',
    path: '/dead',
    summary: 'List Dead Jobs',
    description: 'Returns recently failed and dead jobs for investigation.',
    middleware: routeMiddleware(authMiddleware, requireRole('system_admin'), listLimiter),
    request: {
      query: z.object({
        limit: z.coerce.number().min(1).max(100).optional(),
      }),
    },
    responses: {
      200: {
        content: {
          'application/json': {
            schema: z.object({
              success: z.boolean(),
              data: z.array(z.any()),
            }),
          },
        },
        description: 'Dead/failed jobs',
      },
    },
  }),
  async (c) => {
    const { limit } = c.req.query();
    const parsedLimit = Math.min(Number(limit) || 20, 100);

    const jobService = new JobQueueService();
    const jobs = await jobService.getFailedJobs(parsedLimit);

    return c.json({
      success: true,
      data: jobs.map((j) => ({
        id: j.id,
        type: j.type,
        status: j.status,
        attempts: j.attempts,
        maxAttempts: j.maxAttempts,
        lastError: j.lastError,
        createdAt: j.createdAt,
        failedAt: j.failedAt,
        organizationId: j.organizationId,
        userId: j.userId,
        retryable: RETRYABLE_TYPES.includes(j.type),
      })),
    });
  }
);

/**
 * POST /v1/admin/jobs/:id/retry — Retry a dead/failed job
 */
adminJobsRouter.openapi(
  createRoute({
    method: 'post',
    path: '/{id}/retry',
    summary: 'Retry Dead Job',
    description: 'Retry a dead or failed job. Only idempotent-safe job types can be retried.',
    middleware: routeMiddleware(authMiddleware, requireRole('system_admin'), adminLimiter),
    request: {
      params: z.object({
        id: z.string().uuid(),
      }),
    },
    responses: {
      200: {
        content: {
          'application/json': {
            schema: z.object({
              success: z.boolean(),
              message: z.string(),
            }),
          },
        },
        description: 'Job retried',
      },
    },
  }),
  async (c) => {
    const { id } = c.req.param();

    const jobService = new JobQueueService();

    // Fetch the job to check type
    const deadJobs = await jobService.getFailedJobs(100);
    const job = deadJobs.find((j) => j.id === id);

    if (!job) {
      throw new AppError(ErrorCodes.NOT_FOUND, 'Job not found or not in failed/dead state', 404);
    }

    if (!RETRYABLE_TYPES.includes(job.type)) {
      throw new AppError(
        ErrorCodes.VALIDATION_ERROR,
        `Job type '${job.type}' is not safe to retry automatically. Use manual intervention.`,
        400
      );
    }

    const retried = await jobService.retryJob(id);
    if (!retried) {
      throw new AppError(ErrorCodes.NOT_FOUND, 'Job could not be retried', 404);
    }

    try {
      const auditCtx = buildAuditContext(c);
      await c.var.repos.auditLogs.create({
        userId: auditCtx.actorId,
        organizationId: job.organizationId,
        action: 'job.retried',
        targetUserId: null,
        metadata: { requestId: auditCtx.requestId, jobId: id, jobType: job.type },
        ipAddress: auditCtx.ipAddress,
        userAgent: auditCtx.userAgent,
      });
    } catch {
      /* audit failure should not block operation */
    }

    return c.json({ success: true, message: 'Job queued for retry' });
  }
);

export { adminJobsRouter };
