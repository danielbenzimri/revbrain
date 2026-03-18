/**
 * Console Alert Channel
 *
 * Development/test channel that logs alerts to console.
 * Always configured (used as fallback when no other channels are set up).
 */
import type { Alert, AlertChannel, AlertResult, SendAlertOptions } from '@revbrain/contract';
import { logger } from '../../lib/logger.ts';

const SEVERITY_ICONS: Record<string, string> = {
  critical: '🚨',
  warning: '⚠️',
  info: 'ℹ️',
};

export class ConsoleChannel implements AlertChannel {
  readonly name = 'console';

  isConfigured(): boolean {
    // Console is always available
    return true;
  }

  async send(alert: Alert, _options?: SendAlertOptions): Promise<AlertResult> {
    const icon = SEVERITY_ICONS[alert.severity] || '📢';

    // Use structured logging
    const logMethod =
      alert.severity === 'critical'
        ? logger.error
        : alert.severity === 'warning'
          ? logger.warn
          : logger.info;

    logMethod.call(logger, `${icon} [ALERT] ${alert.title}`, {
      alertId: alert.id,
      severity: alert.severity,
      category: alert.category,
      message: alert.message,
      timestamp: alert.timestamp,
      ...alert.context,
      tags: alert.tags,
    });

    // Also log stack trace if present
    if (alert.context?.stack) {
      console.error('Stack trace:\n', alert.context.stack);
    }

    return {
      channel: this.name,
      success: true,
    };
  }
}
