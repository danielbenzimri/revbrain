/**
 * Slack Alert Channel
 *
 * Sends alerts to Slack via incoming webhook.
 * Supports rich formatting with Block Kit.
 *
 * Setup:
 * 1. Create a Slack app at https://api.slack.com/apps
 * 2. Enable Incoming Webhooks
 * 3. Add webhook to a channel
 * 4. Set SLACK_ALERT_WEBHOOK_URL environment variable
 */
import type { Alert, AlertChannel, AlertResult, SendAlertOptions } from '@revbrain/contract';
import { getEnv } from '../../lib/env.ts';
import { logger } from '../../lib/logger.ts';

interface SlackChannelConfig {
  /** Webhook URL (overrides env var) */
  webhookUrl?: string;
  /** Channel override (if webhook supports it) */
  channel?: string;
  /** Custom username for the bot */
  username?: string;
  /** Custom icon emoji */
  iconEmoji?: string;
}

const SEVERITY_EMOJI: Record<string, string> = {
  critical: ':rotating_light:',
  warning: ':warning:',
  info: ':information_source:',
};

const SEVERITY_COLOR: Record<string, string> = {
  critical: '#dc2626',
  warning: '#f59e0b',
  info: '#3b82f6',
};

export class SlackChannel implements AlertChannel {
  readonly name = 'slack';
  private readonly webhookUrl: string | undefined;
  private readonly channel: string | undefined;
  private readonly username: string;
  private readonly iconEmoji: string;

  constructor(config?: SlackChannelConfig) {
    this.webhookUrl = config?.webhookUrl ?? getEnv('SLACK_ALERT_WEBHOOK_URL');
    this.channel = config?.channel;
    this.username = config?.username ?? 'RevBrain Alerts';
    this.iconEmoji = config?.iconEmoji ?? ':bell:';
  }

  isConfigured(): boolean {
    return Boolean(this.webhookUrl);
  }

  async send(alert: Alert, _options?: SendAlertOptions): Promise<AlertResult> {
    if (!this.webhookUrl) {
      return {
        channel: this.name,
        success: false,
        error: 'Slack webhook URL not configured',
      };
    }

    try {
      const payload = this.buildSlackPayload(alert);

      const response = await fetch(this.webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorText = await response.text();
        logger.error('Slack webhook failed', {
          status: response.status,
          error: errorText,
          alertId: alert.id,
        });

        return {
          channel: this.name,
          success: false,
          error: `Slack API error: ${response.status} - ${errorText}`,
        };
      }

      logger.debug('Alert sent to Slack', { alertId: alert.id });

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

  private buildSlackPayload(alert: Alert): Record<string, unknown> {
    const emoji = SEVERITY_EMOJI[alert.severity] ?? ':bell:';
    const color = SEVERITY_COLOR[alert.severity] ?? '#6b7280';
    const env = alert.context?.environment ?? 'production';
    const envTag = env !== 'production' ? `[${env.toUpperCase()}] ` : '';

    const blocks: Record<string, unknown>[] = [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: `${emoji} ${envTag}${alert.title}`,
          emoji: true,
        },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: alert.message,
        },
      },
      {
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: `*Severity:* ${alert.severity} | *Category:* ${alert.category}`,
          },
        ],
      },
    ];

    // Add context fields
    const contextFields = this.buildContextFields(alert);
    if (contextFields.length > 0) {
      blocks.push({
        type: 'section',
        fields: contextFields,
      });
    }

    // Add stack trace if present
    if (alert.context?.stack) {
      // Truncate stack trace for Slack (3000 char limit per block)
      const truncatedStack =
        alert.context.stack.length > 2900
          ? alert.context.stack.substring(0, 2900) + '\n... (truncated)'
          : alert.context.stack;

      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: '```' + truncatedStack + '```',
        },
      });
    }

    // Add timestamp and tags
    blocks.push({
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: `Alert ID: \`${alert.id}\` | ${new Date(alert.timestamp).toLocaleString()}${alert.tags?.length ? ` | Tags: ${alert.tags.join(', ')}` : ''}`,
        },
      ],
    });

    return {
      username: this.username,
      icon_emoji: this.iconEmoji,
      channel: this.channel,
      attachments: [
        {
          color,
          blocks,
        },
      ],
    };
  }

  private buildContextFields(alert: Alert): Array<Record<string, unknown>> {
    const fields: Array<Record<string, unknown>> = [];
    const ctx = alert.context;

    if (!ctx) return fields;

    if (ctx.userId) {
      fields.push({
        type: 'mrkdwn',
        text: `*User:*\n${ctx.userId}`,
      });
    }

    if (ctx.organizationId) {
      fields.push({
        type: 'mrkdwn',
        text: `*Organization:*\n${ctx.organizationId}`,
      });
    }

    if (ctx.requestId) {
      fields.push({
        type: 'mrkdwn',
        text: `*Request ID:*\n\`${ctx.requestId}\``,
      });
    }

    // Add metadata fields (limit to 4 total fields)
    if (ctx.metadata) {
      const remaining = 8 - fields.length; // Slack allows max 10 fields, reserve 2
      Object.entries(ctx.metadata)
        .slice(0, remaining)
        .forEach(([key, value]) => {
          fields.push({
            type: 'mrkdwn',
            text: `*${key}:*\n${String(value)}`,
          });
        });
    }

    return fields;
  }
}
