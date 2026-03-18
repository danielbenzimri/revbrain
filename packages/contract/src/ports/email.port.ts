/**
 * Email Service Port (Hexagonal Architecture)
 *
 * Defines the contract for sending emails. Implementations:
 * - ResendEmailAdapter: Production adapter using Resend API
 * - ConsoleEmailAdapter: Dev/test adapter that logs to console
 */

export interface SendEmailOptions {
  to: string | string[];
  subject: string;
  html: string;
  replyTo?: string;
}

export interface EmailResult {
  id: string;
  success: boolean;
  error?: string;
}

export interface EmailPort {
  send(options: SendEmailOptions): Promise<EmailResult>;
}
