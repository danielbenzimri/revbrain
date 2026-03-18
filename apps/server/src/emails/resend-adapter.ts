/**
 * Resend Email Adapter
 *
 * Production email adapter using Resend's REST API via fetch.
 * No SDK dependency — works in both Node.js and Deno runtimes.
 */
import type { EmailPort, SendEmailOptions, EmailResult } from '@revbrain/contract';

const RESEND_API_URL = 'https://api.resend.com/emails';

export class ResendEmailAdapter implements EmailPort {
  private apiKey: string;
  private fromAddress: string;

  constructor(apiKey: string, fromAddress: string) {
    this.apiKey = apiKey;
    this.fromAddress = fromAddress;
  }

  async send(options: SendEmailOptions): Promise<EmailResult> {
    try {
      const response = await fetch(RESEND_API_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: this.fromAddress,
          to: Array.isArray(options.to) ? options.to : [options.to],
          subject: options.subject,
          html: options.html,
          ...(options.replyTo ? { reply_to: options.replyTo } : {}),
        }),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        console.error(`[Email] Resend API error ${response.status}:`, errorBody);
        return {
          id: '',
          success: false,
          error: `Resend API error ${response.status}: ${errorBody}`,
        };
      }

      const result = (await response.json()) as { id?: string };
      return {
        id: result.id || '',
        success: true,
      };
    } catch (error) {
      console.error('[Email] Send failed:', error);
      return {
        id: '',
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
}
