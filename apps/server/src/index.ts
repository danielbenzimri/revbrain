import { OpenAPIHono } from '@hono/zod-openapi';
import { type ContentfulStatusCode } from 'hono/utils/http-status';

import { cors } from 'hono/cors';
import { compress } from 'hono/compress';
import { AppError } from '@geometrix/contract';
import { loggerMiddleware } from './middleware/logger.ts';
import { securityHeadersMiddleware } from './middleware/security-headers.ts';
import { authMiddleware } from './middleware/auth.ts';
import { authLimiter, apiLimiter } from './middleware/rate-limit.ts';
import {
  apiBodyLimit,
  webhookBodyLimit,
  fileUploadBodyLimit,
  createBodyLimit,
} from './middleware/body-limit.ts';
import {
  timeoutMiddleware,
  webhookTimeoutMiddleware,
  fileUploadTimeoutMiddleware,
} from './middleware/timeout.ts';
import { repositoryMiddleware } from './repositories/middleware.ts';
import { serviceMiddleware } from './services/middleware.ts';
import {
  cacheMiddleware,
  cacheShort,
  cacheLong,
  cacheStatic,
  noCacheMiddleware,
} from './middleware/cache.ts';
import { v1Router } from './v1/routes/index.ts';
import { healthRouter } from './v1/routes/health.ts';
import { logger } from './lib/logger.ts';
import { isProduction } from './lib/config.ts';
import { getEnv } from './lib/env.ts';
import { captureException } from './lib/sentry.ts';
import { getAlertingService } from './alerting/index.ts';
import type { AppEnv } from './types/index.ts';

// Get allowed CORS origins from environment or use defaults
function getCorsOrigins(): string[] {
  const envOrigins = getEnv('CORS_ORIGINS');
  if (envOrigins) {
    return envOrigins.split(',').map((o) => o.trim());
  }
  // Default origins (includes legacy .vercel.app domains during transition)
  return isProduction()
    ? [
        'https://app.geometrixlabs.com',
        'https://geometrixlabs.com',
        'https://geometrix-client.vercel.app', // Legacy — remove after transition
      ]
    : [
        'https://stg.geometrixlabs.com',
        'https://app.geometrixlabs.com',
        'https://geometrixlabs.com',
        'https://geometrix-client.vercel.app', // Legacy — remove after transition
        'https://geometrix-client-staging.vercel.app', // Legacy — remove after transition
        'http://localhost:5173',
        'http://localhost:5174',
        'http://localhost:5175',
        'http://localhost:5176',
        'http://localhost:3000',
      ];
}

/**
 * Main Hono Application
 *
 * This is the portable, standards-based HTTP server.
 * It has no knowledge of Supabase Edge Functions and can be deployed
 * to AWS Lambda, Docker, Cloudflare Workers, or any other runtime.
 *
 * Middleware Order:
 * 1. Observability (Logger) - First, so we log everything
 * 2. Security (CORS) - Protect against unauthorized origins
 * 3. Security (Headers) - Standard security headers
 * 3.5. Timeout - Prevent hanging requests
 * 4. Body Limits - Prevent DoS via large payloads
 * 5. Repository (DAL) - Inject repositories into context
 * 6. Rate Limiting - Prevent abuse
 * 7. Routes - Handle requests
 * 8. Documentation - OpenAPI spec and UI
 * 9. Error Handler - Catch and format errors
 * 10. 404 Handler - Catch unmatched routes
 */

const app = new OpenAPIHono<AppEnv>();

// Base path handling - we apply it manually to sub-routes usually, but here we can't set .basePath on OpenAPIHono
// Instead, we will mount everything under /api

// 1. Observability: Request ID and Structured Logging
app.use('*', loggerMiddleware);

// 1.5. Performance: Response Compression (gzip/deflate)
app.use('*', compress());

// 2. Security: CORS Configuration
// Origins can be set via CORS_ORIGINS env var (comma-separated)
app.use(
  '*',
  cors({
    origin: getCorsOrigins(),
    allowMethods: ['POST', 'GET', 'OPTIONS', 'DELETE', 'PUT', 'PATCH'],
    allowHeaders: ['Content-Type', 'Authorization'],
    exposeHeaders: ['X-Request-ID'],
    credentials: true,
  })
);

// 3. Security: Standard Security Headers
app.use('*', securityHeadersMiddleware);

// 3.5. Request Timeout (Resource Protection)
// Prevents requests from hanging indefinitely
// Webhook endpoints get longer timeout (60s) for retries
app.use('/api/v1/webhooks/*', webhookTimeoutMiddleware);
app.use('/v1/webhooks/*', webhookTimeoutMiddleware);
// File upload endpoints get longer timeout (2 minutes)
app.use('/api/v1/projects/*/files', fileUploadTimeoutMiddleware);
app.use('/v1/projects/*/files', fileUploadTimeoutMiddleware);
app.use('/api/v1/boq/*/import', fileUploadTimeoutMiddleware);
app.use('/v1/boq/*/import', fileUploadTimeoutMiddleware);
// General API endpoints get 30s timeout
app.use('/api/*', timeoutMiddleware);
app.use('/v1/*', timeoutMiddleware);

// 4. Body Size Limits (DoS Prevention)
// Applied before parsing to reject oversized payloads early
// Webhook endpoints get smaller limits (64KB) - Stripe payloads are small
app.use('/api/v1/webhooks/*', webhookBodyLimit);
app.use('/v1/webhooks/*', webhookBodyLimit);
// File upload endpoints get larger limits (50MB) - applied ONLY to these paths
app.use('/api/v1/projects/*/files', fileUploadBodyLimit);
app.use('/v1/projects/*/files', fileUploadBodyLimit);
app.use('/api/v1/boq/*/import', fileUploadBodyLimit);
app.use('/v1/boq/*/import', fileUploadBodyLimit);
// General API endpoints get standard limits (100KB)
// Skip paths that have their own body limits
app.use('/api/*', async (c, next) => {
  const path = c.req.path;
  // Skip file upload and webhook paths - they have their own limits
  if (
    path.includes('/files') ||
    path.includes('/webhooks') ||
    path.includes('/import')
  ) {
    return next();
  }
  return apiBodyLimit(c, next);
});
app.use('/v1/*', async (c, next) => {
  const path = c.req.path;
  // Skip file upload and webhook paths - they have their own limits
  if (
    path.includes('/files') ||
    path.includes('/webhooks') ||
    path.includes('/import')
  ) {
    return next();
  }
  return apiBodyLimit(c, next);
});

// 5. Repository Layer (Data Access)
// Injects repositories into context for all API routes
app.use('/api/*', repositoryMiddleware());
app.use('/v1/*', repositoryMiddleware());

// 5.5. Service Layer (Business Logic)
// Injects services into context, depends on repositories being available
app.use('/api/*', serviceMiddleware());
app.use('/v1/*', serviceMiddleware());

// 5.7. Authentication (Protected Routes)
// Apply auth middleware to protected routes (skip /health, /auth/*, /leads, /plans, /webhooks)
app.use('/api/v1/users/*', authMiddleware);
app.use('/api/v1/admin/*', authMiddleware);
app.use('/api/v1/org/*', authMiddleware);
app.use('/api/v1/billing/*', authMiddleware);
app.use('/api/v1/support/*', authMiddleware);
app.use('/api/v1/projects/*', authMiddleware);
app.use('/api/v1/boq/*', authMiddleware);
app.use('/api/v1/execution/*', authMiddleware);
app.use('/api/v1/work-logs/*', authMiddleware);
app.use('/api/v1/tasks/*', authMiddleware);
app.use('/api/v1/chat/*', authMiddleware);
app.use('/api/v1/storage/*', authMiddleware);
app.use('/v1/users/*', authMiddleware);
app.use('/v1/admin/*', authMiddleware);
app.use('/v1/org/*', authMiddleware);
app.use('/v1/billing/*', authMiddleware);
app.use('/v1/support/*', authMiddleware);
app.use('/v1/projects/*', authMiddleware);
app.use('/v1/boq/*', authMiddleware);
app.use('/v1/execution/*', authMiddleware);
app.use('/v1/work-logs/*', authMiddleware);
app.use('/v1/tasks/*', authMiddleware);
app.use('/v1/chat/*', authMiddleware);
app.use('/v1/storage/*', authMiddleware);

// 6. Rate Limiting
// Strict on authentication endpoints
app.use('/api/v1/auth/*', authLimiter);
// Lenient on general API endpoints
app.use('/api/v1/*', apiLimiter);

// 6.5 Tiered Caching
// No caching for auth endpoints (sensitive)
app.use('/api/v1/auth/*', noCacheMiddleware);
app.use('/v1/auth/*', noCacheMiddleware);
// Short cache: fast-changing data (15s)
app.use('/api/v1/tasks/*', cacheShort);
app.use('/v1/tasks/*', cacheShort);
app.use('/api/v1/work-logs/*', cacheShort);
app.use('/v1/work-logs/*', cacheShort);
// Long cache: slow-changing data (1h)
app.use('/api/v1/users/me', cacheLong);
app.use('/v1/users/me', cacheLong);
app.use('/api/v1/org/*', cacheLong);
app.use('/v1/org/*', cacheLong);
// Static cache: rarely changing data (24h)
app.use('/api/v1/plans', cacheStatic);
app.use('/v1/plans', cacheStatic);
app.use('/api/v1/health', cacheStatic);
app.use('/v1/health', cacheStatic);
// Default cache: everything else (60s)
app.use('/api/v1/*', cacheMiddleware);
app.use('/v1/*', cacheMiddleware);
// ETag disabled — body-based hashing reads+rebuilds every response (500ms-2s overhead).
// Cache-Control headers (above) + React Query handle caching. If conditional GET is
// needed later, use DB timestamps as ETags instead of hashing response bodies.

// 7. Mount Routes
// Note: Supabase Edge Functions often include the function name in the path.
// If the function is named 'api', then the outgoing path from Supabase is already /v1/...
// We mount at root, /v1, and /api to be flexible across all environments.
app.route('/health', healthRouter);
app.route('/v1', v1Router);
app.route('/api/health', healthRouter);
app.route('/api/v1', v1Router);

// Root endpoint
app.get('/api', (c) => {
  return c.json({
    name: 'Geometrix API',
    version: '1.0.0',
    status: 'operational',
  });
});

// 7. Documentation
// The OpenAPI Spec (mounted at both paths for environment flexibility)
const openApiConfig = {
  openapi: '3.0.0' as const,
  info: {
    version: '1.0.0',
    title: 'Geometrix API',
  },
};
app.doc('/api/doc', openApiConfig);
app.doc('/doc', openApiConfig);

// Note: Interactive API docs (Scalar UI) are hosted on the client app at /api-docs.html
// Supabase Edge Functions cannot serve HTML (gateway forces text/plain + sandbox CSP).

// Type guard for AppError-like objects (duck typing for Edge Runtime compatibility)
interface AppErrorLike {
  code: string;
  message: string;
  statusCode: number;
}

function isAppErrorLike(err: unknown): err is AppErrorLike {
  return (
    err instanceof AppError ||
    (typeof err === 'object' && err !== null && 'name' in err && err.name === 'AppError') ||
    (typeof err === 'object' &&
      err !== null &&
      'code' in err &&
      'statusCode' in err &&
      typeof (err as AppErrorLike).code === 'string' &&
      typeof (err as AppErrorLike).statusCode === 'number')
  );
}

// 8. Global Error Handler
app.onError((err, c) => {
  // Handle known application errors
  // ROBUST CHECK: Accept if it IS an instance OR looks like one (duck typing)
  // This safeguards against bundling issues in Edge Runtime
  if (isAppErrorLike(err)) {
    const appErr = err;
    const requestId = c.get('requestId') || 'unknown';

    // Log application errors at warn level (they're expected but notable)
    if (appErr.statusCode >= 500) {
      logger.error('Application error', { requestId, code: appErr.code }, err);
      // Capture 5xx app errors to Sentry
      captureException(err, {
        requestId,
        userId: c.get('user')?.id,
        organizationId: c.get('user')?.organizationId,
        path: c.req.path,
        method: c.req.method,
        tags: { errorCode: appErr.code },
      });
      // Alert on 5xx errors (non-blocking)
      getAlertingService()
        .critical(`Server Error: ${appErr.code}`, appErr.message, {
          userId: c.get('user')?.id,
          organizationId: c.get('user')?.organizationId,
          requestId,
          stack: err.stack,
          metadata: { path: c.req.path, method: c.req.method },
        })
        .catch(() => {}); // Fire and forget
    } else {
      logger.warn('Application error', { requestId, code: appErr.code });
    }

    return c.json(
      {
        success: false,
        error: {
          code: appErr.code || 'UNKNOWN_ERROR',
          message: appErr.message,
        },
      },
      (appErr.statusCode || 500) as ContentfulStatusCode
    );
  }

  // Log unexpected errors with structured context
  const requestId = c.get('requestId') || 'unknown';
  const user = c.get('user');
  logger.error(
    'Unhandled error',
    {
      requestId,
      userId: user?.id,
      method: c.req.method,
      path: c.req.path,
    },
    err
  );

  // Capture all unhandled errors to Sentry
  captureException(err, {
    requestId,
    userId: user?.id,
    organizationId: user?.organizationId,
    path: c.req.path,
    method: c.req.method,
  });

  // Alert on unhandled errors (non-blocking)
  getAlertingService()
    .critical('Unhandled Server Error', err.message || 'Unknown error', {
      userId: user?.id,
      organizationId: user?.organizationId,
      requestId,
      stack: err.stack,
      metadata: { path: c.req.path, method: c.req.method },
    })
    .catch(() => {}); // Fire and forget

  // Only include stack trace in development for security
  // Production errors should not leak implementation details
  const isProd = isProduction();
  return c.json(
    {
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: isProd
          ? 'An unexpected error occurred.'
          : err.message || 'An unexpected error occurred.',
        ...(isProd ? {} : { stack: err.stack }),
        requestId,
      },
    },
    500
  );
});

// 9. 404 Handler
app.notFound((c) => {
  return c.json(
    {
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: 'Route not found',
      },
    },
    404
  );
});

import { type Hono } from 'hono';
export type AppType = Hono<AppEnv>;
export default app;
