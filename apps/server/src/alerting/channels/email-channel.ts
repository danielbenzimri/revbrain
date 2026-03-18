/**
 * Email Alert Channel
 *
 * Sends alerts via email using the existing email infrastructure.
 * Supports customizable recipients based on alert severity.
 */
import type { Alert, AlertChannel, AlertResult, SendAlertOptions } from '@geometrix/contract';
import type { EmailPort } from '@geometrix/contract';
import { getEnv } from '../../lib/env.ts';
import { logger } from '../../lib/logger.ts';

interface EmailChannelConfig {
  /** Email service instance */
  emailService: EmailPort;
  /** Default recipients for alerts */
  defaultRecipients?: string[];
  /** Recipients for critical alerts (overrides default) */
  criticalRecipients?: string[];
  /** App name for email subject */
  appName?: string;
}

const SEVERITY_COLORS: Record<string, string> = {
  critical: '#dc2626',
  warning: '#f59e0b',
  info: '#3b82f6',
};

const CATEGORY_LABELS: Record<string, string> = {
  error: 'Error',
  security: 'Security',
  billing: 'Billing',
  performance: 'Performance',
  system: 'System',
  user_action: 'User Action',
};

export class EmailChannel implements AlertChannel {
  readonly name = 'email';
  private readonly emailService: EmailPort;
  private readonly defaultRecipients: string[];
  private readonly criticalRecipients: string[];
  private readonly appName: string;

  constructor(config: EmailChannelConfig) {
    this.emailService = config.emailService;
    this.defaultRecipients = config.defaultRecipients ?? [];
    this.criticalRecipients = config.criticalRecipients ?? config.defaultRecipients ?? [];
    this.appName = config.appName ?? 'Geometrix';
  }

  isConfigured(): boolean {
    // Check if we have at least one recipient
    return this.defaultRecipients.length > 0 || this.criticalRecipients.length > 0;
  }

  async send(alert: Alert, options?: SendAlertOptions): Promise<AlertResult> {
    // Determine recipients
    let recipients = options?.recipients ?? [];

    if (recipients.length === 0) {
      recipients = alert.severity === 'critical' ? this.criticalRecipients : this.defaultRecipients;
    }

    if (recipients.length === 0) {
      return {
        channel: this.name,
        success: false,
        error: 'No recipients configured for email alerts',
      };
    }

    try {
      const html = this.renderAlertEmail(alert);
      const subject = this.formatSubject(alert);

      const result = await this.emailService.send({
        to: recipients,
        subject,
        html,
      });

      if (!result.success) {
        return {
          channel: this.name,
          success: false,
          error: result.error ?? 'Email send failed',
        };
      }

      logger.debug('Alert email sent', {
        alertId: alert.id,
        recipients: recipients.length,
        emailId: result.id,
      });

      return {
        channel: this.name,
        success: true,
      };
    } catch (error) {
      return {
        channel: this.name,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  private formatSubject(alert: Alert): string {
    const severityPrefix =
      alert.severity === 'critical' ? '🚨 CRITICAL' : alert.severity === 'warning' ? '⚠️' : 'ℹ️';

    const env = alert.context?.environment ?? getEnv('NODE_ENV') ?? 'production';
    const envTag = env !== 'production' ? `[${env.toUpperCase()}] ` : '';

    return `${envTag}${severityPrefix} ${this.appName}: ${alert.title}`;
  }

  private renderAlertEmail(alert: Alert): string {
    const color = SEVERITY_COLORS[alert.severity] ?? '#6b7280';
    const categoryLabel = CATEGORY_LABELS[alert.category] ?? alert.category;

    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 20px; background-color: #f3f4f6;">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; margin: 0 auto;">
    <tr>
      <td style="background-color: ${color}; padding: 20px; border-radius: 8px 8px 0 0;">
        <h1 style="margin: 0; color: white; font-size: 18px; font-weight: 600;">
          ${this.escapeHtml(alert.title)}
        </h1>
      </td>
    </tr>
    <tr>
      <td style="background-color: white; padding: 24px; border-radius: 0 0 8px 8px; border: 1px solid #e5e7eb; border-top: none;">
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td style="padding-bottom: 16px;">
              <span style="display: inline-block; padding: 4px 12px; border-radius: 9999px; font-size: 12px; font-weight: 500; text-transform: uppercase; background-color: ${color}20; color: ${color};">
                ${alert.severity}
              </span>
              <span style="display: inline-block; padding: 4px 12px; border-radius: 9999px; font-size: 12px; font-weight: 500; background-color: #f3f4f6; color: #374151; margin-left: 8px;">
                ${categoryLabel}
              </span>
            </td>
          </tr>
          <tr>
            <td style="padding-bottom: 16px;">
              <p style="margin: 0; color: #374151; font-size: 15px; line-height: 1.6;">
                ${this.escapeHtml(alert.message)}
              </p>
            </td>
          </tr>
          ${this.renderContext(alert)}
          ${this.renderStack(alert)}
          <tr>
            <td style="padding-top: 16px; border-top: 1px solid #e5e7eb;">
              <p style="margin: 0; color: #6b7280; font-size: 12px;">
                Alert ID: ${alert.id}<br>
                Time: ${new Date(alert.timestamp).toLocaleString('en-US', { timeZone: 'UTC' })} UTC
                ${alert.tags?.length ? `<br>Tags: ${alert.tags.join(', ')}` : ''}
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
  }

  private renderContext(alert: Alert): string {
    const ctx = alert.context;
    if (!ctx) return '';

    const items: string[] = [];

    if (ctx.userId) items.push(`<strong>User:</strong> ${this.escapeHtml(ctx.userId)}`);
    if (ctx.organizationId)
      items.push(`<strong>Organization:</strong> ${this.escapeHtml(ctx.organizationId)}`);
    if (ctx.requestId) items.push(`<strong>Request ID:</strong> ${this.escapeHtml(ctx.requestId)}`);
    if (ctx.environment)
      items.push(`<strong>Environment:</strong> ${this.escapeHtml(ctx.environment)}`);

    // Render metadata
    if (ctx.metadata) {
      Object.entries(ctx.metadata).forEach(([key, value]) => {
        items.push(`<strong>${this.escapeHtml(key)}:</strong> ${this.escapeHtml(String(value))}`);
      });
    }

    if (items.length === 0) return '';

    return `
          <tr>
            <td style="padding-bottom: 16px;">
              <div style="background-color: #f9fafb; padding: 12px; border-radius: 6px; font-size: 13px; color: #4b5563;">
                ${items.join('<br>')}
              </div>
            </td>
          </tr>`;
  }

  private renderStack(alert: Alert): string {
    if (!alert.context?.stack) return '';

    return `
          <tr>
            <td style="padding-bottom: 16px;">
              <p style="margin: 0 0 8px 0; color: #374151; font-size: 13px; font-weight: 600;">
                Stack Trace:
              </p>
              <pre style="margin: 0; padding: 12px; background-color: #1f2937; color: #f9fafb; border-radius: 6px; font-size: 11px; overflow-x: auto; white-space: pre-wrap; word-break: break-all;">${this.escapeHtml(alert.context.stack)}</pre>
            </td>
          </tr>`;
  }

  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}
