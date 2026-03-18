/**
 * Alerting Service Port (Hexagonal Architecture)
 *
 * Defines the contract for sending alerts across multiple channels.
 * Implementations:
 * - EmailChannel: Production alerts via email
 * - SlackChannel: Slack webhook notifications
 * - SentryChannel: Sentry alert integration
 * - ConsoleChannel: Dev/test adapter that logs to console
 */

/**
 * Alert severity levels
 */
export type AlertSeverity = 'critical' | 'warning' | 'info';

/**
 * Alert categories for filtering and routing
 */
export type AlertCategory =
  | 'error'
  | 'security'
  | 'billing'
  | 'performance'
  | 'system'
  | 'user_action';

/**
 * Alert payload with all context
 */
export interface Alert {
  /** Unique identifier for deduplication */
  id: string;
  /** Human-readable title */
  title: string;
  /** Detailed message */
  message: string;
  /** Severity level */
  severity: AlertSeverity;
  /** Category for routing */
  category: AlertCategory;
  /** ISO timestamp */
  timestamp: string;
  /** Additional context */
  context?: {
    userId?: string;
    organizationId?: string;
    requestId?: string;
    environment?: string;
    /** Error stack trace if applicable */
    stack?: string;
    /** Arbitrary metadata */
    metadata?: Record<string, unknown>;
  };
  /** Tags for filtering */
  tags?: string[];
}

/**
 * Result from sending an alert
 */
export interface AlertResult {
  /** Channel name that processed this */
  channel: string;
  /** Whether the alert was sent successfully */
  success: boolean;
  /** Error message if failed */
  error?: string;
  /** Whether the alert was throttled */
  throttled?: boolean;
}

/**
 * Options for sending alerts
 */
export interface SendAlertOptions {
  /** Override default channels for this alert */
  channels?: string[];
  /** Skip throttling for this alert */
  bypassThrottle?: boolean;
  /** Recipients for email channel */
  recipients?: string[];
}

/**
 * Individual alert channel interface
 */
export interface AlertChannel {
  /** Channel identifier */
  readonly name: string;
  /** Send an alert through this channel */
  send(alert: Alert, options?: SendAlertOptions): Promise<AlertResult>;
  /** Check if channel is properly configured */
  isConfigured(): boolean;
}

/**
 * Main alerting service interface
 */
export interface AlertingPort {
  /** Send an alert to all configured channels */
  send(alert: Omit<Alert, 'id' | 'timestamp'>, options?: SendAlertOptions): Promise<AlertResult[]>;
  /** Send a critical alert (convenience method) */
  critical(title: string, message: string, context?: Alert['context']): Promise<AlertResult[]>;
  /** Send a warning alert (convenience method) */
  warning(title: string, message: string, context?: Alert['context']): Promise<AlertResult[]>;
  /** Send an info alert (convenience method) */
  info(title: string, message: string, context?: Alert['context']): Promise<AlertResult[]>;
  /** Get list of configured channel names */
  getConfiguredChannels(): string[];
}

/**
 * Throttle configuration
 */
export interface ThrottleConfig {
  /** Time window in milliseconds */
  windowMs: number;
  /** Max alerts per window for the same alert ID */
  maxPerWindow: number;
}
