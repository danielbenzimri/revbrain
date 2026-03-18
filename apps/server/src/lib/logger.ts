/**
 * Structured Logger Utility
 *
 * Provides consistent, JSON-formatted logging across the application.
 * Designed for observability platforms (CloudWatch, Datadog, Supabase).
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogContext {
  requestId?: string;
  userId?: string;
  organizationId?: string;
  action?: string;
  [key: string]: unknown;
}

interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: string;
  context?: LogContext;
  error?: {
    name: string;
    message: string;
    code?: string;
    stack?: string;
  };
}

/**
 * Scrub sensitive fields from objects before logging
 */
function scrubSensitive(obj: Record<string, unknown>): Record<string, unknown> {
  const sensitiveKeys = ['password', 'token', 'secret', 'authorization', 'cookie', 'apikey'];
  const scrubbed: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(obj)) {
    if (sensitiveKeys.some((k) => key.toLowerCase().includes(k))) {
      scrubbed[key] = '[REDACTED]';
    } else if (typeof value === 'object' && value !== null) {
      scrubbed[key] = scrubSensitive(value as Record<string, unknown>);
    } else {
      scrubbed[key] = value;
    }
  }

  return scrubbed;
}

/**
 * Format error for logging
 */
function formatError(err: Error): LogEntry['error'] {
  return {
    name: err.name,
    message: err.message,
    code: 'code' in err ? String(err.code) : undefined,
    stack: process.env.NODE_ENV === 'production' ? undefined : err.stack,
  };
}

/**
 * Create a log entry and output to console
 */
function log(level: LogLevel, message: string, context?: LogContext, error?: Error): void {
  const entry: LogEntry = {
    level,
    message,
    timestamp: new Date().toISOString(),
  };

  if (context) {
    entry.context = scrubSensitive(context) as LogContext;
  }

  if (error) {
    entry.error = formatError(error);
  }

  // Use appropriate console method based on level
  const output = JSON.stringify(entry);
  switch (level) {
    case 'error':
      console.error(output);
      break;
    case 'warn':
      console.warn(output);
      break;
    case 'debug':
      console.debug(output);
      break;
    default:
      console.log(output);
  }
}

/**
 * Logger instance with context binding support
 */
export const logger = {
  debug: (message: string, context?: LogContext) => log('debug', message, context),
  info: (message: string, context?: LogContext) => log('info', message, context),
  warn: (message: string, context?: LogContext, error?: Error) =>
    log('warn', message, context, error),
  error: (message: string, context?: LogContext, error?: Error) =>
    log('error', message, context, error),

  /**
   * Create a child logger with bound context
   */
  child: (boundContext: LogContext) => ({
    debug: (message: string, context?: LogContext) =>
      log('debug', message, { ...boundContext, ...context }),
    info: (message: string, context?: LogContext) =>
      log('info', message, { ...boundContext, ...context }),
    warn: (message: string, context?: LogContext, error?: Error) =>
      log('warn', message, { ...boundContext, ...context }, error),
    error: (message: string, context?: LogContext, error?: Error) =>
      log('error', message, { ...boundContext, ...context }, error),
  }),
};
