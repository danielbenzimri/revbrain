/**
 * Dev-only routes for testing email templates and other debug utilities.
 * Guarded by isProduction() — these routes are NOT available in production.
 *
 * Includes test cleanup endpoints for E2E tests.
 */
import { Hono, type Context } from 'hono';
import { timingSafeEqual } from 'node:crypto';
import { type AppEnv } from '../../types/index.ts';
import { isProduction } from '../../lib/config.ts';
import {
  getEmailService,
  renderWelcomeEmail,
  initializeEmailJobHandler,
} from '../../emails/index.ts';
import { getDB, coupons, leads, users, like, sql, inArray } from '@revbrain/database';
import { CronService } from '../../services/cron.service.ts';
import { JobQueueService } from '../../services/job-queue.service.ts';
import { getSupabaseAdmin } from '../../lib/supabase.ts';
import { logger } from '../../lib/logger.ts';

const devRouter = new Hono<AppEnv>();

// Test cleanup API key - simple protection for dev endpoints
// No default value - must be configured via environment variable
const TEST_CLEANUP_KEY = process.env.TEST_CLEANUP_KEY;

/**
 * Middleware to verify test cleanup requests
 * Checks for X-Test-Cleanup-Key header using timing-safe comparison
 */
function verifyTestCleanupKey(c: Context<AppEnv>, next: () => Promise<void>) {
  if (!TEST_CLEANUP_KEY) {
    return c.json({ success: false, error: 'Cleanup key not configured' }, 503);
  }
  const key = c.req.header('X-Test-Cleanup-Key');
  // Use timing-safe comparison to prevent timing attacks
  const keyBuffer = Buffer.from(key || '');
  const expectedBuffer = Buffer.from(TEST_CLEANUP_KEY);
  if (keyBuffer.length !== expectedBuffer.length || !timingSafeEqual(keyBuffer, expectedBuffer)) {
    return c.json({ success: false, error: 'Invalid cleanup key' }, 401);
  }
  return next();
}

if (!isProduction()) {
  /**
   * POST /v1/dev/test-email
   *
   * Sends a test email using the current email adapter.
   * Body: { to: string, template: "welcome", data: { ... } }
   */
  devRouter.post('/test-email', async (c) => {
    const body = await c.req.json<{
      to: string;
      template: string;
      data: Record<string, string>;
    }>();

    let html: string;
    let subject: string;

    switch (body.template) {
      case 'welcome':
        html = renderWelcomeEmail({
          userName: body.data.userName || 'Test User',
          orgName: body.data.orgName || 'Test Org',
          loginUrl: body.data.loginUrl || 'http://localhost:3000/login',
        });
        subject = 'Welcome to RevBrain!';
        break;
      default:
        return c.json({ success: false, error: `Unknown template: ${body.template}` }, 400);
    }

    const result = await getEmailService().send({
      to: body.to,
      subject: `[TEST] ${subject}`,
      html,
    });

    return c.json(result);
  });

  /**
   * POST /v1/dev/cleanup/coupons
   *
   * Delete test coupons by code pattern.
   * Body: { pattern: string } - SQL LIKE pattern (e.g., "TEST_%")
   *
   * Headers: X-Test-Cleanup-Key: <secret>
   */
  devRouter.post('/cleanup/coupons', verifyTestCleanupKey, async (c) => {
    const body = await c.req.json<{ pattern?: string; codes?: string[] }>();

    const db = getDB();

    try {
      let deletedCount = 0;

      if (body.codes && body.codes.length > 0) {
        // Delete specific codes
        const result = await db
          .delete(coupons)
          .where(inArray(coupons.code, body.codes))
          .returning({ id: coupons.id });
        deletedCount = result.length;
      } else if (body.pattern) {
        // Delete by pattern (e.g., "TEST_%")
        const result = await db
          .delete(coupons)
          .where(like(coupons.code, body.pattern))
          .returning({ id: coupons.id });
        deletedCount = result.length;
      } else {
        // Default: delete all coupons with "TEST" in code
        const result = await db
          .delete(coupons)
          .where(like(coupons.code, '%TEST%'))
          .returning({ id: coupons.id });
        deletedCount = result.length;
      }

      return c.json({
        success: true,
        deleted: deletedCount,
        message: `Deleted ${deletedCount} test coupon(s)`,
      });
    } catch (err) {
      return c.json(
        {
          success: false,
          error: err instanceof Error ? err.message : 'Failed to cleanup coupons',
        },
        500
      );
    }
  });

  /**
   * POST /v1/dev/cleanup/leads
   *
   * Delete test leads by email pattern.
   * Body: { pattern?: string, emails?: string[] }
   *
   * Headers: X-Test-Cleanup-Key: <secret>
   */
  devRouter.post('/cleanup/leads', verifyTestCleanupKey, async (c) => {
    const body = await c.req.json<{ pattern?: string; emails?: string[] }>();

    const db = getDB();

    try {
      let deletedCount = 0;

      if (body.emails && body.emails.length > 0) {
        // Delete specific emails
        const result = await db
          .delete(leads)
          .where(inArray(leads.contactEmail, body.emails))
          .returning({ id: leads.id });
        deletedCount = result.length;
      } else if (body.pattern) {
        // Delete by pattern
        const result = await db
          .delete(leads)
          .where(like(leads.contactEmail, body.pattern))
          .returning({ id: leads.id });
        deletedCount = result.length;
      } else {
        // Default: delete test leads (test.%@example.com)
        const result = await db
          .delete(leads)
          .where(like(leads.contactEmail, 'test.%@example.com'))
          .returning({ id: leads.id });
        deletedCount = result.length;
      }

      return c.json({
        success: true,
        deleted: deletedCount,
        message: `Deleted ${deletedCount} test lead(s)`,
      });
    } catch (err) {
      return c.json(
        {
          success: false,
          error: err instanceof Error ? err.message : 'Failed to cleanup leads',
        },
        500
      );
    }
  });

  /**
   * POST /v1/dev/cleanup/users
   *
   * Delete test users by email pattern.
   * This also removes their organization memberships.
   * Body: { pattern?: string, emails?: string[] }
   *
   * WARNING: This permanently deletes users. Use with caution.
   * Headers: X-Test-Cleanup-Key: <secret>
   */
  devRouter.post('/cleanup/users', verifyTestCleanupKey, async (c) => {
    const body = await c.req.json<{ pattern?: string; emails?: string[] }>();

    const db = getDB();

    try {
      let deletedCount = 0;

      // Find users matching pattern
      let usersToDelete: { id: string; email: string }[] = [];

      if (body.emails && body.emails.length > 0) {
        usersToDelete = await db
          .select({ id: users.id, email: users.email })
          .from(users)
          .where(inArray(users.email, body.emails));
      } else if (body.pattern) {
        usersToDelete = await db
          .select({ id: users.id, email: users.email })
          .from(users)
          .where(like(users.email, body.pattern));
      } else {
        // Default: delete test users (test.%@example.com)
        usersToDelete = await db
          .select({ id: users.id, email: users.email })
          .from(users)
          .where(like(users.email, 'test.%@example.com'));
      }

      if (usersToDelete.length > 0) {
        const userIds = usersToDelete.map((u) => u.id);

        // Delete users directly (they belong to organizations via organizationId field)
        const result = await db
          .delete(users)
          .where(inArray(users.id, userIds))
          .returning({ id: users.id });

        deletedCount = result.length;
      }

      return c.json({
        success: true,
        deleted: deletedCount,
        deletedEmails: usersToDelete.map((u) => u.email),
        message: `Deleted ${deletedCount} test user(s)`,
      });
    } catch (err) {
      return c.json(
        {
          success: false,
          error: err instanceof Error ? err.message : 'Failed to cleanup users',
        },
        500
      );
    }
  });

  /**
   * POST /v1/dev/cleanup/all
   *
   * Delete all test data (coupons, leads, users matching test patterns).
   * Headers: X-Test-Cleanup-Key: <secret>
   */
  devRouter.post('/cleanup/all', verifyTestCleanupKey, async (c) => {
    const results = {
      coupons: 0,
      leads: 0,
      users: 0,
    };

    const db = getDB();

    try {
      // Cleanup coupons with TEST in code
      const couponResult = await db
        .delete(coupons)
        .where(like(coupons.code, '%TEST%'))
        .returning({ id: coupons.id });
      results.coupons = couponResult.length;

      // Cleanup leads with test email pattern
      const leadResult = await db
        .delete(leads)
        .where(like(leads.contactEmail, 'test.%@example.com'))
        .returning({ id: leads.id });
      results.leads = leadResult.length;

      // Cleanup test users
      const testUsers = await db
        .select({ id: users.id })
        .from(users)
        .where(like(users.email, 'test.%@example.com'));

      if (testUsers.length > 0) {
        const userIds = testUsers.map((u) => u.id);
        const userResult = await db
          .delete(users)
          .where(inArray(users.id, userIds))
          .returning({ id: users.id });
        results.users = userResult.length;
      }

      return c.json({
        success: true,
        deleted: results,
        message: `Cleanup complete: ${results.coupons} coupons, ${results.leads} leads, ${results.users} users`,
      });
    } catch (err) {
      return c.json(
        {
          success: false,
          error: err instanceof Error ? err.message : 'Failed to cleanup',
          partialResults: results,
        },
        500
      );
    }
  });

  /**
   * GET /v1/dev/cleanup/stats
   *
   * Get count of test data that would be cleaned up.
   * Headers: X-Test-Cleanup-Key: <secret>
   */
  devRouter.get('/cleanup/stats', verifyTestCleanupKey, async (c) => {
    const db = getDB();

    try {
      const couponCount = await db
        .select({ count: sql<number>`count(*)` })
        .from(coupons)
        .where(like(coupons.code, '%TEST%'));

      const leadCount = await db
        .select({ count: sql<number>`count(*)` })
        .from(leads)
        .where(like(leads.contactEmail, 'test.%@example.com'));

      const userCount = await db
        .select({ count: sql<number>`count(*)` })
        .from(users)
        .where(like(users.email, 'test.%@example.com'));

      return c.json({
        success: true,
        counts: {
          coupons: Number(couponCount[0]?.count || 0),
          leads: Number(leadCount[0]?.count || 0),
          users: Number(userCount[0]?.count || 0),
        },
      });
    } catch (err) {
      return c.json(
        {
          success: false,
          error: err instanceof Error ? err.message : 'Failed to get stats',
        },
        500
      );
    }
  });

  /**
   * POST /v1/dev/cron/run
   *
   * Run all scheduled cron jobs (trial notifications, etc.).
   * Called by external schedulers (pg_cron, Vercel Cron, GitHub Actions, etc.)
   *
   * Headers: X-Test-Cleanup-Key: <secret>
   */
  devRouter.post('/cron/run', verifyTestCleanupKey, async (c) => {
    try {
      const cronService = new CronService();
      const result = await cronService.runAllJobs();

      return c.json({
        success: true,
        data: result,
      });
    } catch (err) {
      return c.json(
        {
          success: false,
          error: err instanceof Error ? err.message : 'Cron jobs failed',
        },
        500
      );
    }
  });

  /**
   * POST /v1/dev/cron/trial-ending
   *
   * Run only the trial-ending warnings job.
   * Headers: X-Test-Cleanup-Key: <secret>
   */
  devRouter.post('/cron/trial-ending', verifyTestCleanupKey, async (c) => {
    try {
      const cronService = new CronService();
      const result = await cronService.processTrialEndingWarnings();

      return c.json({
        success: true,
        data: result,
      });
    } catch (err) {
      return c.json(
        {
          success: false,
          error: err instanceof Error ? err.message : 'Trial ending job failed',
        },
        500
      );
    }
  });

  /**
   * POST /v1/dev/cron/trial-ended
   *
   * Run only the trial-ended notifications job.
   * Headers: X-Test-Cleanup-Key: <secret>
   */
  devRouter.post('/cron/trial-ended', verifyTestCleanupKey, async (c) => {
    try {
      const cronService = new CronService();
      const result = await cronService.processTrialEndedNotifications();

      return c.json({
        success: true,
        data: result,
      });
    } catch (err) {
      return c.json(
        {
          success: false,
          error: err instanceof Error ? err.message : 'Trial ended job failed',
        },
        500
      );
    }
  });

  /**
   * POST /v1/dev/jobs/process
   *
   * Process pending jobs from the queue.
   * Called by external schedulers or cron to process async tasks.
   *
   * Query params:
   *   - batchSize: number of jobs to process (default: 10)
   *
   * Headers: X-Test-Cleanup-Key: <secret>
   */
  devRouter.post('/jobs/process', verifyTestCleanupKey, async (c) => {
    try {
      // Initialize email job handler if not already done
      initializeEmailJobHandler();

      const batchSize = parseInt(c.req.query('batchSize') || '10', 10);
      const jobQueue = new JobQueueService();
      const result = await jobQueue.process(batchSize);

      return c.json({
        success: true,
        data: result,
      });
    } catch (err) {
      return c.json(
        {
          success: false,
          error: err instanceof Error ? err.message : 'Job processing failed',
        },
        500
      );
    }
  });

  /**
   * GET /v1/dev/jobs/stats
   *
   * Get job queue statistics.
   * Headers: X-Test-Cleanup-Key: <secret>
   */
  devRouter.get('/jobs/stats', verifyTestCleanupKey, async (c) => {
    try {
      const jobQueue = new JobQueueService();
      const stats = await jobQueue.getStats();

      return c.json({
        success: true,
        data: stats,
      });
    } catch (err) {
      return c.json(
        {
          success: false,
          error: err instanceof Error ? err.message : 'Failed to get job stats',
        },
        500
      );
    }
  });

  /**
   * GET /v1/dev/jobs/failed
   *
   * Get recent failed/dead jobs for debugging.
   * Headers: X-Test-Cleanup-Key: <secret>
   */
  devRouter.get('/jobs/failed', verifyTestCleanupKey, async (c) => {
    try {
      const limit = parseInt(c.req.query('limit') || '20', 10);
      const jobQueue = new JobQueueService();
      const jobs = await jobQueue.getFailedJobs(limit);

      return c.json({
        success: true,
        data: jobs,
      });
    } catch (err) {
      return c.json(
        {
          success: false,
          error: err instanceof Error ? err.message : 'Failed to get failed jobs',
        },
        500
      );
    }
  });

  /**
   * POST /v1/dev/jobs/:id/retry
   *
   * Retry a specific failed/dead job.
   * Headers: X-Test-Cleanup-Key: <secret>
   */
  devRouter.post('/jobs/:id/retry', verifyTestCleanupKey, async (c) => {
    try {
      const jobId = c.req.param('id');
      const jobQueue = new JobQueueService();
      const success = await jobQueue.retryJob(jobId);

      if (!success) {
        return c.json(
          {
            success: false,
            error: 'Job not found or not in failed/dead state',
          },
          404
        );
      }

      return c.json({
        success: true,
        message: `Job ${jobId} queued for retry`,
      });
    } catch (err) {
      return c.json(
        {
          success: false,
          error: err instanceof Error ? err.message : 'Failed to retry job',
        },
        500
      );
    }
  });

  /**
   * POST /v1/dev/jobs/cleanup
   *
   * Clean up old completed/dead jobs.
   * Headers: X-Test-Cleanup-Key: <secret>
   */
  devRouter.post('/jobs/cleanup', verifyTestCleanupKey, async (c) => {
    try {
      const retentionDays = parseInt(c.req.query('retentionDays') || '7', 10);
      const jobQueue = new JobQueueService();
      const deleted = await jobQueue.cleanup(retentionDays);

      return c.json({
        success: true,
        deleted,
        message: `Cleaned up ${deleted} old jobs`,
      });
    } catch (err) {
      return c.json(
        {
          success: false,
          error: err instanceof Error ? err.message : 'Failed to cleanup jobs',
        },
        500
      );
    }
  });

  /**
   * POST /v1/dev/test-upload
   *
   * Simple file upload test - NO AUTH required.
   * Just tests if we can upload to Supabase Storage.
   */
  devRouter.post('/test-upload', async (c) => {
    const BUCKET_NAME = 'project-files';

    try {
      logger.info('[TestUpload] Starting test upload');

      // Parse form data
      let formData;
      try {
        formData = await c.req.formData();
        logger.info('[TestUpload] FormData parsed');
      } catch (e) {
        logger.error('[TestUpload] FormData parse failed', { error: e });
        return c.json({ success: false, error: 'FormData parse failed', details: String(e) }, 400);
      }

      const file = formData.get('file') as File | null;
      if (!file) {
        return c.json({ success: false, error: 'No file provided' }, 400);
      }

      logger.info('[TestUpload] File received', {
        name: file.name,
        size: file.size,
        type: file.type,
      });

      // Get array buffer
      let arrayBuffer;
      try {
        arrayBuffer = await file.arrayBuffer();
        logger.info('[TestUpload] ArrayBuffer created', { size: arrayBuffer.byteLength });
      } catch (e) {
        logger.error('[TestUpload] ArrayBuffer failed', { error: e });
        return c.json({ success: false, error: 'ArrayBuffer failed', details: String(e) }, 500);
      }

      // Upload to storage
      const supabase = getSupabaseAdmin();
      const storagePath = `test/${Date.now()}_${file.name}`;

      logger.info('[TestUpload] Uploading to storage', { path: storagePath, bucket: BUCKET_NAME });

      const { data, error } = await supabase.storage
        .from(BUCKET_NAME)
        .upload(storagePath, arrayBuffer, {
          contentType: file.type || 'application/octet-stream',
          upsert: false,
        });

      if (error) {
        logger.error('[TestUpload] Storage upload failed', {
          error,
          message: error.message,
          name: error.name,
        });
        return c.json(
          {
            success: false,
            error: 'Storage upload failed',
            details: error.message,
            errorObj: error,
          },
          500
        );
      }

      logger.info('[TestUpload] Upload successful', { path: data.path });

      return c.json({
        success: true,
        message: 'File uploaded successfully',
        path: data.path,
        fileName: file.name,
        fileSize: file.size,
        fileType: file.type,
      });
    } catch (e) {
      logger.error('[TestUpload] Unexpected error', { error: e });
      return c.json(
        {
          success: false,
          error: 'Unexpected error',
          details: String(e),
        },
        500
      );
    }
  });
}

// ============================================================================
// MOCK DATA RESET (only in mock + local mode)
// ============================================================================
// Excluded from OpenAPI — uses plain post(), not openapi()
if (
  process.env.USE_MOCK_DATA === 'true' &&
  (process.env.APP_ENV === 'local' || !process.env.APP_ENV)
) {
  // Dynamic import to avoid loading mock modules in real mode
  import('../../mocks/index.ts').then(({ resetAllMockData }) => {
    devRouter.post('/reset-mock-data', async (c) => {
      resetAllMockData();
      logger.info('[MOCK MODE] All mock data reset to seed state');
      return c.json({ success: true, message: 'Mock data reset to seed state' });
    });
  });
  console.log('[MOCK MODE] Reset endpoint: POST /v1/dev/reset-mock-data');
}

export { devRouter };
