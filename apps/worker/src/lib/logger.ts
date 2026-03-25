/**
 * Structured logging with pino + AsyncLocalStorage for trace context.
 *
 * All log output is JSON to stdout (Cloud Logging / CloudWatch picks it up).
 * Context fields (traceId, runId, jobId, projectId, attemptNo) are bound
 * via AsyncLocalStorage so every log line from any async operation includes
 * them automatically.
 *
 * Sensitive patterns are redacted: accessToken, refreshToken, password, secret.
 */

import { AsyncLocalStorage } from 'node:async_hooks';
import pino from 'pino';

/** Context propagated through all async operations via AsyncLocalStorage */
export interface WorkerContext {
  traceId: string;
  runId: string;
  jobId: string;
  projectId?: string;
  attemptNo?: number;
  workerId: string;
}

/** AsyncLocalStorage instance — initialized once at entry point */
export const workerContextStorage = new AsyncLocalStorage<WorkerContext>();

/** Get current context from AsyncLocalStorage (or empty object if not set) */
function getContext(): Partial<WorkerContext> {
  return workerContextStorage.getStore() ?? {};
}

/**
 * Base pino logger with:
 * - JSON output to stdout
 * - Redaction of sensitive fields
 * - Dynamic mixin that injects AsyncLocalStorage context into every log line
 */
export const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  redact: {
    paths: [
      'accessToken',
      'refreshToken',
      'password',
      'secret',
      '*.accessToken',
      '*.refreshToken',
      '*.password',
      '*.secret',
      'headers.authorization',
      'headers.Authorization',
    ],
    censor: '[REDACTED]',
  },
  mixin() {
    return getContext();
  },
  formatters: {
    level(label) {
      return { level: label };
    },
  },
  // Timestamp as ISO string for Cloud Logging compatibility
  timestamp: pino.stdTimeFunctions.isoTime,
});

/**
 * Run a function within a worker context.
 * All log lines emitted during the function (including nested async calls)
 * will include the context fields.
 *
 * Usage:
 *   await runWithContext({ traceId, runId, jobId, workerId }, async () => {
 *     logger.info('this log includes traceId, runId, etc.');
 *   });
 */
export function runWithContext<T>(
  context: WorkerContext,
  fn: () => T | Promise<T>
): T | Promise<T> {
  return workerContextStorage.run(context, fn);
}

/**
 * Create a child logger with additional bound fields.
 * Useful for collector-specific logging.
 */
export function createChildLogger(bindings: Record<string, unknown>) {
  return logger.child(bindings);
}
