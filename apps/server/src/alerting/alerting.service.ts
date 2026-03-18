/**
 * Alerting Service
 *
 * Multi-channel alerting with throttling and deduplication.
 * Supports email, Slack, Sentry, and extensible to other channels.
 *
 * Features:
 * - Channel abstraction for easy extension
 * - Throttling to prevent alert spam
 * - Severity-based routing
 * - Full context propagation
 */
import type {
  Alert,
  AlertChannel,
  AlertingPort,
  AlertResult,
  AlertCategory,
  SendAlertOptions,
  ThrottleConfig,
} from '@geometrix/contract';
import { randomUUID } from 'node:crypto';
import { logger } from '../lib/logger.ts';

/**
 * Default throttle config: 5 alerts per hour for same alert hash
 */
const DEFAULT_THROTTLE: ThrottleConfig = {
  windowMs: 60 * 60 * 1000, // 1 hour
  maxPerWindow: 5,
};

interface ThrottleEntry {
  count: number;
  windowStart: number;
}

export class AlertingService implements AlertingPort {
  private readonly channels: Map<string, AlertChannel> = new Map();
  private readonly throttleConfig: ThrottleConfig;
  private readonly throttleMap: Map<string, ThrottleEntry> = new Map();
  private readonly environment: string;

  constructor(options?: { throttle?: ThrottleConfig; environment?: string }) {
    this.throttleConfig = options?.throttle ?? DEFAULT_THROTTLE;
    this.environment = options?.environment ?? process.env.NODE_ENV ?? 'development';
  }

  /**
   * Register an alert channel
   */
  registerChannel(channel: AlertChannel): void {
    if (!channel.isConfigured()) {
      logger.debug('Alert channel not configured, skipping registration', {
        channel: channel.name,
      });
      return;
    }

    this.channels.set(channel.name, channel);
    logger.info('Alert channel registered', { channel: channel.name });
  }

  /**
   * Get list of configured channel names
   */
  getConfiguredChannels(): string[] {
    return Array.from(this.channels.keys());
  }

  /**
   * Send an alert to all configured channels
   */
  async send(
    alertData: Omit<Alert, 'id' | 'timestamp'>,
    options?: SendAlertOptions
  ): Promise<AlertResult[]> {
    const alert: Alert = {
      ...alertData,
      id: randomUUID(),
      timestamp: new Date().toISOString(),
      context: {
        ...alertData.context,
        environment: alertData.context?.environment ?? this.environment,
      },
    };

    // Generate throttle key based on alert content
    const throttleKey = this.generateThrottleKey(alert);

    // Check throttling
    if (!options?.bypassThrottle && this.isThrottled(throttleKey)) {
      logger.debug('Alert throttled', {
        alertId: alert.id,
        title: alert.title,
        throttleKey,
      });

      return this.getTargetChannels(options).map((channel) => ({
        channel: channel.name,
        success: false,
        throttled: true,
      }));
    }

    // Record this alert for throttling
    this.recordAlert(throttleKey);

    // Determine which channels to send to
    const targetChannels = this.getTargetChannels(options);

    if (targetChannels.length === 0) {
      logger.warn('No configured channels to send alert', {
        alertId: alert.id,
        title: alert.title,
      });
      return [];
    }

    // Send to all channels concurrently
    const results = await Promise.all(
      targetChannels.map(async (channel) => {
        try {
          return await channel.send(alert, options);
        } catch (error) {
          logger.error('Failed to send alert via channel', {
            channel: channel.name,
            alertId: alert.id,
            error: error instanceof Error ? error.message : 'Unknown error',
          });

          return {
            channel: channel.name,
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
          };
        }
      })
    );

    // Log summary
    const successCount = results.filter((r) => r.success).length;
    logger.info('Alert sent', {
      alertId: alert.id,
      title: alert.title,
      severity: alert.severity,
      category: alert.category,
      channelsSent: successCount,
      channelsTotal: results.length,
    });

    return results;
  }

  /**
   * Send a critical alert
   */
  async critical(
    title: string,
    message: string,
    context?: Alert['context']
  ): Promise<AlertResult[]> {
    return this.send({
      title,
      message,
      severity: 'critical',
      category: this.inferCategory(message, context),
      context,
      tags: ['critical'],
    });
  }

  /**
   * Send a warning alert
   */
  async warning(
    title: string,
    message: string,
    context?: Alert['context']
  ): Promise<AlertResult[]> {
    return this.send({
      title,
      message,
      severity: 'warning',
      category: this.inferCategory(message, context),
      context,
      tags: ['warning'],
    });
  }

  /**
   * Send an info alert
   */
  async info(title: string, message: string, context?: Alert['context']): Promise<AlertResult[]> {
    return this.send({
      title,
      message,
      severity: 'info',
      category: this.inferCategory(message, context),
      context,
      tags: ['info'],
    });
  }

  /**
   * Create a scoped alerter with preset context
   */
  scoped(context: Alert['context']): ScopedAlerter {
    return new ScopedAlerter(this, context);
  }

  /**
   * Generate a throttle key based on alert content (title + category + severity)
   */
  private generateThrottleKey(alert: Alert): string {
    // Combine title, category, and severity for deduplication
    // Same alert type from same source should be throttled together
    return `${alert.category}:${alert.severity}:${alert.title}`;
  }

  /**
   * Check if an alert should be throttled
   */
  private isThrottled(key: string): boolean {
    const entry = this.throttleMap.get(key);
    if (!entry) return false;

    const now = Date.now();

    // Check if window has expired
    if (now - entry.windowStart > this.throttleConfig.windowMs) {
      this.throttleMap.delete(key);
      return false;
    }

    return entry.count >= this.throttleConfig.maxPerWindow;
  }

  /**
   * Record an alert for throttling
   */
  private recordAlert(key: string): void {
    const now = Date.now();
    const entry = this.throttleMap.get(key);

    if (!entry || now - entry.windowStart > this.throttleConfig.windowMs) {
      // Start new window
      this.throttleMap.set(key, { count: 1, windowStart: now });
    } else {
      // Increment existing window
      entry.count++;
    }
  }

  /**
   * Get target channels based on options
   */
  private getTargetChannels(options?: SendAlertOptions): AlertChannel[] {
    if (options?.channels && options.channels.length > 0) {
      // Filter to only requested channels that exist
      return options.channels
        .map((name) => this.channels.get(name))
        .filter((ch): ch is AlertChannel => ch !== undefined);
    }

    // Return all configured channels
    return Array.from(this.channels.values());
  }

  /**
   * Infer category from message content
   */
  private inferCategory(message: string, context?: Alert['context']): AlertCategory {
    const lowerMessage = message.toLowerCase();

    if (context?.stack || lowerMessage.includes('error') || lowerMessage.includes('exception')) {
      return 'error';
    }
    if (
      lowerMessage.includes('security') ||
      lowerMessage.includes('auth') ||
      lowerMessage.includes('unauthorized')
    ) {
      return 'security';
    }
    if (
      lowerMessage.includes('payment') ||
      lowerMessage.includes('billing') ||
      lowerMessage.includes('subscription')
    ) {
      return 'billing';
    }
    if (
      lowerMessage.includes('slow') ||
      lowerMessage.includes('timeout') ||
      lowerMessage.includes('performance')
    ) {
      return 'performance';
    }

    return 'system';
  }

  /**
   * Clear throttle state (for testing)
   */
  clearThrottle(): void {
    this.throttleMap.clear();
  }
}

/**
 * Scoped alerter with preset context
 */
class ScopedAlerter {
  constructor(
    private readonly service: AlertingService,
    private readonly context: Alert['context']
  ) {}

  async critical(title: string, message: string): Promise<AlertResult[]> {
    return this.service.critical(title, message, this.context);
  }

  async warning(title: string, message: string): Promise<AlertResult[]> {
    return this.service.warning(title, message, this.context);
  }

  async info(title: string, message: string): Promise<AlertResult[]> {
    return this.service.info(title, message, this.context);
  }
}
