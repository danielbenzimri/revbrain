/**
 * Sentry Alert Channel
 *
 * Routes alerts to Sentry for centralized error tracking.
 * Critical/warning alerts are sent as errors, info as messages.
 *
 * This bridges the alerting service with Sentry, allowing
 * business alerts to appear alongside technical errors.
 */
import type { Alert, AlertChannel, AlertResult, SendAlertOptions } from '@geometrix/contract';
import { captureException, captureMessage, isSentryInitialized } from '../../lib/sentry.ts';
import { logger } from '../../lib/logger.ts';

interface SentryChannelConfig {
  /** Only send critical alerts to Sentry */
  criticalOnly?: boolean;
  /** Skip sending to Sentry in development */
  skipInDevelopment?: boolean;
}

export class SentryChannel implements AlertChannel {
  readonly name = 'sentry';
  private readonly criticalOnly: boolean;
  private readonly skipInDevelopment: boolean;

  constructor(config?: SentryChannelConfig) {
    this.criticalOnly = config?.criticalOnly ?? false;
    this.skipInDevelopment = config?.skipInDevelopment ?? true;
  }

  isConfigured(): boolean {
    // Only configured if Sentry is initialized
    return isSentryInitialized();
  }

  async send(alert: Alert, _options?: SendAlertOptions): Promise<AlertResult> {
    // Skip non-critical if configured
    if (this.criticalOnly && alert.severity !== 'critical') {
      return {
        channel: this.name,
        success: true, // Not an error, just skipped
      };
    }

    // Skip in development if configured
    const env = alert.context?.environment ?? process.env.NODE_ENV;
    if (this.skipInDevelopment && env === 'development') {
      logger.debug('Sentry alert skipped in development', { alertId: alert.id });
      return {
        channel: this.name,
        success: true,
      };
    }

    try {
      const sentryContext = {
        userId: alert.context?.userId,
        organizationId: alert.context?.organizationId,
        requestId: alert.context?.requestId,
        tags: {
          alert_category: alert.category,
          alert_severity: alert.severity,
          alert_id: alert.id,
          ...(alert.tags?.reduce(
            (acc, tag) => {
              acc[`tag_${tag}`] = 'true';
              return acc;
            },
            {} as Record<string, string>
          ) ?? {}),
        },
        extra: {
          alert_title: alert.title,
          alert_message: alert.message,
          alert_timestamp: alert.timestamp,
          ...alert.context?.metadata,
        },
      };

      // For critical/warning with stack trace, create an Error
      if ((alert.severity === 'critical' || alert.severity === 'warning') && alert.context?.stack) {
        const error = new Error(alert.message);
        error.name = `Alert: ${alert.title}`;
        error.stack = alert.context.stack;

        captureException(error, sentryContext);
      } else if (alert.severity === 'critical' || alert.severity === 'warning') {
        // Create synthetic error for critical/warning without stack
        const error = new Error(
          `[${alert.severity.toUpperCase()}] ${alert.title}: ${alert.message}`
        );
        error.name = `Alert: ${alert.category}`;

        captureException(error, sentryContext);
      } else {
        // Info level - send as message
        captureMessage(`[ALERT] ${alert.title}: ${alert.message}`, 'info', sentryContext);
      }

      logger.debug('Alert sent to Sentry', {
        alertId: alert.id,
        severity: alert.severity,
      });

      return {
        channel: this.name,
        success: true,
      };
    } catch (error) {
      logger.error('Failed to send alert to Sentry', {
        alertId: alert.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      return {
        channel: this.name,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
}
