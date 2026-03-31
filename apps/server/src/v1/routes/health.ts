import { Hono } from 'hono';
import type { HealthCheckResponse } from '@revbrain/contract';
import { users, billingEvents } from '@revbrain/database';

// Lazy database accessor — prevents postgres.js from loading on Edge Functions (Deno)
async function getDb() {
  const { initDB } = await import('@revbrain/database/client');
  return initDB();
}
import { sql, and, isNull } from 'drizzle-orm';
import { getVersion, getRegion, isProduction } from '../../lib/config.ts';
import { getEnv } from '../../lib/env.ts';
import { logger } from '../../lib/logger.ts';
import { getStripe } from '../../lib/stripe.ts';
import { getEmailService } from '../../emails/index.ts';

import { type AppEnv } from '../../types/index.ts';

/** Default timeout for health checks in milliseconds */
const HEALTH_CHECK_TIMEOUT_MS = 5000;

/** Status of a service dependency */
interface DependencyStatus {
  status: 'ok' | 'degraded' | 'down';
  latencyMs?: number;
  message?: string;
}

/** Process metrics */
interface ProcessMetrics {
  memoryMB: number;
  uptimeSeconds: number;
  nodeVersion: string;
}

/** Webhook stats */
interface WebhookStats {
  pendingRetries: number;
  exhaustedEvents: number;
}

/** Full health check response */
interface FullHealthCheckResponse {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  version: string;
  region: string;
  env: string;
  dependencies: {
    database: DependencyStatus;
    stripe: DependencyStatus;
    email: DependencyStatus;
  };
  process?: ProcessMetrics;
  webhooks?: WebhookStats;
}

/**
 * Wrap an async function with a timeout.
 * Returns a fallback status if the check times out.
 */
async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, fallback: T): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout>;
  const timeoutPromise = new Promise<T>((resolve) => {
    timeoutId = setTimeout(() => resolve(fallback), timeoutMs);
  });

  try {
    const result = await Promise.race([promise, timeoutPromise]);
    clearTimeout(timeoutId!);
    return result;
  } catch (error) {
    clearTimeout(timeoutId!);
    throw error;
  }
}

/**
 * Health Check Router
 *
 * Public endpoint for deployment verification and monitoring.
 * Returns service status, environment, region, and version information.
 */
export const healthRouter = new Hono<AppEnv>();

healthRouter.get('/', (c) => {
  const response: HealthCheckResponse & { version: string } = {
    status: 'ok',
    env: isProduction() ? 'production' : getEnv('NODE_ENV') || 'development',
    timestamp: new Date().toISOString(),
    region: getRegion(),
    version: getVersion(),
  };

  return c.json(response);
});

// Diagnostic route to test DB connectivity without auth
healthRouter.get('/db', async (c) => {
  try {
    const { getDB, client } = await import('@revbrain/database/client');
    const dbInstance = getDB();

    // 1. Try raw query first to check connection
    let rawStatus = 'pending';
    if (client) {
      try {
        await client`SELECT 1`;
        rawStatus = 'ok';
      } catch (e: unknown) {
        rawStatus = `failed: ${e instanceof Error ? e.message : 'Unknown error'}`;
      }
    } else {
      rawStatus = 'client_not_initialized';
    }

    // 2. Try Drizzle query
    const result = await dbInstance.select({ id: users.id }).from(users).limit(1);

    return c.json({
      status: 'ok',
      database: {
        raw: rawStatus,
        drizzle: 'ok',
        count: result.length,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error: unknown) {
    logger.error('Health check DB connection failed', {}, error as Error);
    const isProd = isProduction();
    const err = error as Error;
    return c.json(
      {
        status: 'error',
        database: 'crashed',
        error: isProd ? 'Database connection failed' : err.message,
        ...(isProd ? {} : { stack: err.stack }),
        timestamp: new Date().toISOString(),
      },
      500
    );
  }
});

/**
 * GET /health/stripe
 *
 * Check Stripe API connectivity by fetching account info.
 */
healthRouter.get('/stripe', async (c) => {
  const start = Date.now();
  try {
    const stripe = getStripe();
    if (!stripe) {
      return c.json({
        status: 'down',
        message: 'Stripe not configured',
        timestamp: new Date().toISOString(),
      });
    }

    // Retrieve account info as a connectivity check
    await stripe.balance.retrieve();
    const latencyMs = Date.now() - start;

    return c.json({
      status: 'ok',
      latencyMs,
      timestamp: new Date().toISOString(),
    });
  } catch (error: unknown) {
    const latencyMs = Date.now() - start;
    logger.error('Health check Stripe connection failed', {}, error as Error);
    const isProd = isProduction();
    const err = error as Error;
    return c.json(
      {
        status: 'error',
        latencyMs,
        error: isProd ? 'Stripe connection failed' : err.message,
        timestamp: new Date().toISOString(),
      },
      500
    );
  }
});

/**
 * GET /health/email
 *
 * Check email service configuration (doesn't send actual email).
 */
healthRouter.get('/email', async (c) => {
  try {
    // Verify email service can be instantiated (side-effect check)
    void getEmailService();

    // Check if email service is properly configured
    const adapterType = getEnv('EMAIL_ADAPTER') || 'console';
    const hasResendKey = !!getEnv('RESEND_API_KEY');

    if (adapterType === 'resend' && !hasResendKey) {
      return c.json({
        status: 'degraded',
        adapter: 'resend',
        message: 'Resend API key not configured',
        timestamp: new Date().toISOString(),
      });
    }

    return c.json({
      status: 'ok',
      adapter: adapterType,
      configured: adapterType === 'console' || hasResendKey,
      timestamp: new Date().toISOString(),
    });
  } catch (error: unknown) {
    logger.error('Health check email service failed', {}, error as Error);
    const err = error as Error;
    return c.json(
      {
        status: 'error',
        error: isProduction() ? 'Email service check failed' : err.message,
        timestamp: new Date().toISOString(),
      },
      500
    );
  }
});

/**
 * GET /health/full
 *
 * Comprehensive health check of all dependencies.
 * Returns overall status and individual dependency statuses.
 * Includes timeout protection, process metrics, and webhook stats.
 */
healthRouter.get('/full', async (c) => {
  const timeoutFallback: DependencyStatus = {
    status: 'down',
    message: 'Health check timed out',
  };

  const checkDatabase = async (): Promise<DependencyStatus> => {
    const start = Date.now();
    try {
      const { getDB, client } = await import('@revbrain/database/client');
      const dbInstance = getDB();

      // Quick connectivity check
      if (client) {
        await client`SELECT 1`;
      }
      await dbInstance.select({ id: users.id }).from(users).limit(1);

      return {
        status: 'ok',
        latencyMs: Date.now() - start,
      };
    } catch (error: unknown) {
      return {
        status: 'down',
        latencyMs: Date.now() - start,
        message: isProduction() ? 'Connection failed' : (error as Error).message,
      };
    }
  };

  const checkStripe = async (): Promise<DependencyStatus> => {
    const start = Date.now();
    try {
      const stripe = getStripe();
      if (!stripe) {
        return {
          status: 'degraded',
          message: 'Not configured',
        };
      }

      await stripe.balance.retrieve();
      return {
        status: 'ok',
        latencyMs: Date.now() - start,
      };
    } catch (error: unknown) {
      return {
        status: 'down',
        latencyMs: Date.now() - start,
        message: isProduction() ? 'Connection failed' : (error as Error).message,
      };
    }
  };

  const checkEmail = async (): Promise<DependencyStatus> => {
    try {
      const adapterType = getEnv('EMAIL_ADAPTER') || 'console';
      const hasResendKey = !!getEnv('RESEND_API_KEY');

      if (adapterType === 'resend' && !hasResendKey) {
        return {
          status: 'degraded',
          message: 'Resend API key not configured',
        };
      }

      return {
        status: 'ok',
      };
    } catch {
      return {
        status: 'down',
        message: 'Configuration error',
      };
    }
  };

  const getProcessMetrics = (): ProcessMetrics => {
    const memoryUsage = process.memoryUsage();
    return {
      memoryMB: Math.round(memoryUsage.heapUsed / 1024 / 1024),
      uptimeSeconds: Math.round(process.uptime()),
      nodeVersion: process.version,
    };
  };

  const getWebhookStats = async (): Promise<WebhookStats> => {
    try {
      const db = await getDb();
      // Count pending retries (not processed, retry count < max)
      const [pending] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(billingEvents)
        .where(
          and(
            isNull(billingEvents.processedAt),
            sql`${billingEvents.retryCount} < ${billingEvents.maxRetries}`
          )
        );

      // Count exhausted events (retry count >= max, not processed)
      const [exhausted] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(billingEvents)
        .where(
          and(
            isNull(billingEvents.processedAt),
            sql`${billingEvents.retryCount} >= ${billingEvents.maxRetries}`
          )
        );

      return {
        pendingRetries: pending?.count ?? 0,
        exhaustedEvents: exhausted?.count ?? 0,
      };
    } catch {
      return {
        pendingRetries: 0,
        exhaustedEvents: 0,
      };
    }
  };

  // Run all checks in parallel with timeout protection
  const [database, stripe, email, webhooks] = await Promise.all([
    withTimeout(checkDatabase(), HEALTH_CHECK_TIMEOUT_MS, timeoutFallback),
    withTimeout(checkStripe(), HEALTH_CHECK_TIMEOUT_MS, timeoutFallback),
    withTimeout(checkEmail(), HEALTH_CHECK_TIMEOUT_MS, { status: 'down', message: 'Timed out' }),
    getWebhookStats(),
  ]);

  // Get process metrics (sync, no timeout needed)
  const processMetrics = getProcessMetrics();

  // Determine overall status
  const dependencies = { database, stripe, email };
  const statuses = Object.values(dependencies).map((d) => d.status);

  let overallStatus: 'healthy' | 'degraded' | 'unhealthy';
  if (statuses.every((s) => s === 'ok')) {
    overallStatus = 'healthy';
  } else if (statuses.includes('down')) {
    overallStatus = 'unhealthy';
  } else {
    overallStatus = 'degraded';
  }

  // Warn if there are exhausted webhook events
  if (webhooks.exhaustedEvents > 0) {
    logger.warn('Health check found exhausted webhook events', {
      exhaustedEvents: webhooks.exhaustedEvents,
    });
  }

  const response: FullHealthCheckResponse = {
    status: overallStatus,
    timestamp: new Date().toISOString(),
    version: getVersion(),
    region: getRegion(),
    env: isProduction() ? 'production' : getEnv('NODE_ENV') || 'development',
    dependencies,
    process: processMetrics,
    webhooks,
  };

  const httpStatus = overallStatus === 'healthy' ? 200 : overallStatus === 'degraded' ? 200 : 503;
  return c.json(response, httpStatus);
});
