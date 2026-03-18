import { createMiddleware } from 'hono/factory';

/**
 * Request ID & Structured Logging Middleware
 *
 * This middleware:
 * 1. Generates a unique request ID for tracing
 * 2. Adds X-Request-ID header to responses
 * 3. Logs all requests in JSON format for observability platforms
 * 4. Tracks request duration
 */
export const loggerMiddleware = createMiddleware(async (c, next) => {
  const start = Date.now();
  const requestId = crypto.randomUUID();

  // Tag the context for use in other parts of the app
  c.set('requestId', requestId);
  c.header('X-Request-ID', requestId);

  await next();

  // Log in JSON format (Best for Supabase/Datadog/CloudWatch)
  const duration = Date.now() - start;
  console.log(
    JSON.stringify({
      level: 'info',
      requestId,
      method: c.req.method,
      path: c.req.path,
      status: c.res.status,
      duration_ms: duration,
      userAgent: c.req.header('User-Agent'),
      timestamp: new Date().toISOString(),
    })
  );
});
