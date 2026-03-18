/**
 * Request Timeout Middleware
 *
 * Prevents requests from hanging indefinitely by enforcing a maximum
 * request duration. This protects against:
 * - Slow database queries
 * - Unresponsive external services
 * - Infinite loops in request handlers
 * - Resource exhaustion from stuck connections
 *
 * Default timeout: 30 seconds (configurable per route)
 */
import { createMiddleware } from 'hono/factory';
import { AppError, ErrorCodes } from '@geometrix/contract';

// Default timeout in milliseconds
const DEFAULT_TIMEOUT_MS = 30_000; // 30 seconds

// Longer timeout for specific operations
export const TIMEOUTS = {
  DEFAULT: DEFAULT_TIMEOUT_MS,
  WEBHOOK: 60_000, // 60 seconds - webhooks may have retries
  FILE_UPLOAD: 120_000, // 2 minutes - file uploads take longer
  REPORT: 90_000, // 90 seconds - report generation
} as const;

/**
 * Create a timeout middleware with configurable duration.
 *
 * @param timeoutMs - Maximum request duration in milliseconds
 * @returns Hono middleware that enforces the timeout
 *
 * @example
 * ```ts
 * // Use default timeout (30s)
 * app.use('*', createTimeoutMiddleware());
 *
 * // Use longer timeout for file uploads
 * app.use('/upload/*', createTimeoutMiddleware(TIMEOUTS.FILE_UPLOAD));
 * ```
 */
export function createTimeoutMiddleware(timeoutMs: number = DEFAULT_TIMEOUT_MS) {
  return createMiddleware(async (_c, next) => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    // Create a promise that rejects on timeout
    const timeoutPromise = new Promise<never>((_, reject) => {
      controller.signal.addEventListener('abort', () => {
        reject(
          new AppError(
            ErrorCodes.SERVICE_UNAVAILABLE,
            `Request timeout after ${timeoutMs / 1000} seconds`,
            503
          )
        );
      });
    });

    try {
      // Race between the actual request and the timeout
      await Promise.race([next(), timeoutPromise]);
    } finally {
      clearTimeout(timeoutId);
    }
  });
}

/**
 * Default timeout middleware (30 seconds)
 */
export const timeoutMiddleware = createTimeoutMiddleware(DEFAULT_TIMEOUT_MS);

/**
 * Webhook timeout middleware (60 seconds)
 */
export const webhookTimeoutMiddleware = createTimeoutMiddleware(TIMEOUTS.WEBHOOK);

/**
 * File upload timeout middleware (2 minutes)
 */
export const fileUploadTimeoutMiddleware = createTimeoutMiddleware(TIMEOUTS.FILE_UPLOAD);
