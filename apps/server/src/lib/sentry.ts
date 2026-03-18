/**
 * Sentry Integration
 *
 * Error tracking and performance monitoring for production.
 * Only active when SENTRY_DSN is set.
 *
 * Setup:
 * 1. Create a Sentry project at https://sentry.io
 * 2. Set SENTRY_DSN environment variable
 * 3. Optionally set SENTRY_ENVIRONMENT (defaults to NODE_ENV)
 *
 * Features:
 * - Automatic error capture
 * - User context (userId, orgId)
 * - Request context (method, path, requestId)
 * - Custom tags and extra data
 * - Performance tracing (optional)
 */

import { getEnv } from './env.ts';
import { isProduction } from './config.ts';
import { logger } from './logger.ts';

// Types for Sentry-like interface (supports both real Sentry and no-op)
interface SentryUser {
  id?: string;
  email?: string;
  username?: string;
  [key: string]: unknown;
}

interface SentryScope {
  setUser(user: SentryUser | null): void;
  setTag(key: string, value: string): void;
  setExtra(key: string, value: unknown): void;
  setContext(name: string, context: Record<string, unknown>): void;
}

interface SentryTransaction {
  finish(): void;
  setStatus(status: string): void;
}

interface SentryInterface {
  init(options: Record<string, unknown>): void;
  captureException(error: Error, context?: Record<string, unknown>): string;
  captureMessage(message: string, level?: string): string;
  setUser(user: SentryUser | null): void;
  setTag(key: string, value: string): void;
  setExtra(key: string, value: unknown): void;
  withScope(callback: (scope: SentryScope) => void): void;
  startTransaction(context: Record<string, unknown>): SentryTransaction;
  flush(timeout?: number): Promise<boolean>;
}

// No-op implementation when Sentry is not configured
const noopSentry: SentryInterface = {
  init: () => {},
  captureException: (error) => {
    logger.error('Error captured (Sentry disabled)', {}, error);
    return 'noop-event-id';
  },
  captureMessage: (message, level) => {
    logger.info('Message captured (Sentry disabled)', { message, level });
    return 'noop-event-id';
  },
  setUser: () => {},
  setTag: () => {},
  setExtra: () => {},
  withScope: (callback) => {
    const noopScope: SentryScope = {
      setUser: () => {},
      setTag: () => {},
      setExtra: () => {},
      setContext: () => {},
    };
    callback(noopScope);
  },
  startTransaction: () => ({
    finish: () => {},
    setStatus: () => {},
  }),
  flush: async () => true,
};

// Sentry instance (real or noop)
let sentryInstance: SentryInterface = noopSentry;
let isInitialized = false;

/**
 * Initialize Sentry
 * Call this once at application startup
 */
export async function initSentry(): Promise<void> {
  const dsn = getEnv('SENTRY_DSN');

  if (!dsn) {
    logger.info('Sentry not configured (SENTRY_DSN not set)');
    return;
  }

  try {
    // Dynamic import to avoid loading Sentry when not needed
    const Sentry = await import('@sentry/node');

    Sentry.init({
      dsn,
      environment: getEnv('SENTRY_ENVIRONMENT') || (isProduction() ? 'production' : 'development'),
      release: getEnv('SENTRY_RELEASE') || getEnv('npm_package_version') || '1.0.0',

      // Only send 100% of errors in production
      sampleRate: 1.0,

      // Performance monitoring (optional)
      tracesSampleRate: isProduction() ? 0.1 : 1.0, // 10% in prod, 100% in dev

      // Don't send errors in development unless explicitly enabled
      enabled: isProduction() || getEnv('SENTRY_ENABLED') === 'true',

      // Filter out known non-issues
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      beforeSend(event: any, hint: any) {
        const error = hint.originalException;

        // Don't send 4xx errors (client errors)
        if (error && typeof error === 'object' && 'statusCode' in error) {
          const statusCode = (error as { statusCode: number }).statusCode;
          if (statusCode >= 400 && statusCode < 500) {
            return null; // Drop the event
          }
        }

        return event;
      },

      // Integrate with Node.js
      integrations: [
        Sentry.httpIntegration(),
        Sentry.onUncaughtExceptionIntegration(),
        Sentry.onUnhandledRejectionIntegration(),
      ],
    });

    sentryInstance = Sentry as unknown as SentryInterface;
    isInitialized = true;
    logger.info('Sentry initialized', { environment: getEnv('SENTRY_ENVIRONMENT') });
  } catch (err) {
    logger.warn('Failed to initialize Sentry', { error: (err as Error).message });
    // Continue with noop implementation
  }
}

/**
 * Capture an exception with context
 */
export function captureException(
  error: Error,
  context?: {
    userId?: string;
    organizationId?: string;
    requestId?: string;
    path?: string;
    method?: string;
    extra?: Record<string, unknown>;
    tags?: Record<string, string>;
  }
): string {
  return sentryInstance.withScope((scope) => {
    // Set user context
    if (context?.userId) {
      scope.setUser({ id: context.userId });
    }

    // Set tags
    if (context?.organizationId) {
      scope.setTag('organization_id', context.organizationId);
    }
    if (context?.requestId) {
      scope.setTag('request_id', context.requestId);
    }
    if (context?.tags) {
      Object.entries(context.tags).forEach(([key, value]) => {
        scope.setTag(key, value);
      });
    }

    // Set extra data
    if (context?.path) {
      scope.setExtra('path', context.path);
    }
    if (context?.method) {
      scope.setExtra('method', context.method);
    }
    if (context?.extra) {
      Object.entries(context.extra).forEach(([key, value]) => {
        scope.setExtra(key, value);
      });
    }

    return sentryInstance.captureException(error);
  }) as unknown as string;
}

/**
 * Capture a message (for non-error events)
 */
export function captureMessage(
  message: string,
  level: 'fatal' | 'error' | 'warning' | 'info' | 'debug' = 'info',
  context?: {
    userId?: string;
    organizationId?: string;
    extra?: Record<string, unknown>;
    tags?: Record<string, string>;
  }
): string {
  return sentryInstance.withScope((scope) => {
    if (context?.userId) {
      scope.setUser({ id: context.userId });
    }
    if (context?.organizationId) {
      scope.setTag('organization_id', context.organizationId);
    }
    if (context?.tags) {
      Object.entries(context.tags).forEach(([key, value]) => {
        scope.setTag(key, value);
      });
    }
    if (context?.extra) {
      Object.entries(context.extra).forEach(([key, value]) => {
        scope.setExtra(key, value);
      });
    }

    return sentryInstance.captureMessage(message, level);
  }) as unknown as string;
}

/**
 * Set user context for all future events
 */
export function setUser(
  user: { id: string; email?: string; organizationId?: string } | null
): void {
  if (user) {
    sentryInstance.setUser({
      id: user.id,
      email: user.email,
    });
    if (user.organizationId) {
      sentryInstance.setTag('organization_id', user.organizationId);
    }
  } else {
    sentryInstance.setUser(null);
  }
}

/**
 * Flush pending events (call before process exit)
 */
export async function flushSentry(timeout = 2000): Promise<boolean> {
  return sentryInstance.flush(timeout);
}

/**
 * Check if Sentry is initialized
 */
export function isSentryInitialized(): boolean {
  return isInitialized;
}

// Export for testing
export { sentryInstance as _sentryInstance };
