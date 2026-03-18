/**
 * Alerting Service Factory
 *
 * Creates and configures the alerting service with all available channels.
 * Channels are automatically enabled based on environment configuration:
 *
 * - Console: Always enabled (fallback for development)
 * - Email: Enabled when ALERT_EMAIL_RECIPIENTS is set
 * - Slack: Enabled when SLACK_ALERT_WEBHOOK_URL is set
 * - Sentry: Enabled when SENTRY_DSN is set
 *
 * Environment variables:
 * - ALERT_EMAIL_RECIPIENTS: Comma-separated list of email addresses
 * - ALERT_CRITICAL_RECIPIENTS: Override recipients for critical alerts
 * - SLACK_ALERT_WEBHOOK_URL: Slack incoming webhook URL
 * - SENTRY_DSN: Sentry DSN (uses existing Sentry integration)
 */
import type { EmailPort } from '@geometrix/contract';
import { getEnv } from '../lib/env.ts';
import { logger } from '../lib/logger.ts';
import { AlertingService } from './alerting.service.ts';
import { ConsoleChannel } from './channels/console-channel.ts';
import { EmailChannel } from './channels/email-channel.ts';
import { SlackChannel } from './channels/slack-channel.ts';
import { SentryChannel } from './channels/sentry-channel.ts';

export interface AlertingConfig {
  /** Email service for email channel */
  emailService?: EmailPort;
  /** Override default recipients */
  defaultRecipients?: string[];
  /** Override critical recipients */
  criticalRecipients?: string[];
  /** Skip console channel (not recommended) */
  skipConsole?: boolean;
  /** Environment name */
  environment?: string;
}

let _alertingService: AlertingService | null = null;

/**
 * Create and configure the alerting service
 */
export function createAlertingService(config?: AlertingConfig): AlertingService {
  const service = new AlertingService({
    environment: config?.environment ?? getEnv('NODE_ENV'),
  });

  // 1. Console channel (always enabled unless explicitly skipped)
  if (!config?.skipConsole) {
    service.registerChannel(new ConsoleChannel());
  }

  // 2. Email channel (enabled if recipients are configured)
  const emailRecipients =
    config?.defaultRecipients ?? parseEmailList(getEnv('ALERT_EMAIL_RECIPIENTS'));

  const criticalRecipients =
    config?.criticalRecipients ?? parseEmailList(getEnv('ALERT_CRITICAL_RECIPIENTS'));

  if (config?.emailService && (emailRecipients.length > 0 || criticalRecipients.length > 0)) {
    service.registerChannel(
      new EmailChannel({
        emailService: config.emailService,
        defaultRecipients: emailRecipients,
        criticalRecipients: criticalRecipients.length > 0 ? criticalRecipients : emailRecipients,
        appName: 'Geometrix',
      })
    );
  }

  // 3. Slack channel (enabled if webhook URL is set)
  const slackWebhook = getEnv('SLACK_ALERT_WEBHOOK_URL');
  if (slackWebhook) {
    service.registerChannel(new SlackChannel({ webhookUrl: slackWebhook }));
  }

  // 4. Sentry channel (enabled if Sentry is initialized)
  service.registerChannel(new SentryChannel());

  const channels = service.getConfiguredChannels();
  logger.info('Alerting service initialized', {
    channels,
    channelCount: channels.length,
  });

  return service;
}

/**
 * Get the singleton alerting service instance
 */
export function getAlertingService(): AlertingService {
  if (!_alertingService) {
    _alertingService = createAlertingService();
  }
  return _alertingService;
}

/**
 * Initialize the alerting service with email support
 * Call this once at app startup after email service is ready
 */
export function initializeAlertingService(config?: AlertingConfig): AlertingService {
  _alertingService = createAlertingService(config);
  return _alertingService;
}

/**
 * Parse comma-separated email list
 */
function parseEmailList(value: string | undefined): string[] {
  if (!value) return [];

  return value
    .split(',')
    .map((email) => email.trim())
    .filter((email) => email.length > 0 && email.includes('@'));
}

// Re-export everything
export { AlertingService } from './alerting.service.ts';
export { ConsoleChannel, EmailChannel, SlackChannel, SentryChannel } from './channels/index.ts';
export type {
  Alert,
  AlertSeverity,
  AlertCategory,
  AlertChannel,
  AlertResult,
  AlertingPort,
  SendAlertOptions,
  ThrottleConfig,
} from '@geometrix/contract';
