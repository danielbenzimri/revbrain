/**
 * Correlation ID Middleware
 *
 * Ensures every request has a unique X-Request-Id for tracing.
 * Reads from incoming header or generates a new UUID.
 * Sets the ID on the response header and Hono context.
 */
import type { MiddlewareHandler } from 'hono';

export const correlationIdMiddleware: MiddlewareHandler = async (c, next) => {
  const requestId = c.req.header('X-Request-Id') || crypto.randomUUID();

  // Store in context for downstream use (audit logging, error reporting)
  c.set('requestId', requestId);

  await next();

  // Set on response header for client traceability
  c.header('X-Request-Id', requestId);
};
