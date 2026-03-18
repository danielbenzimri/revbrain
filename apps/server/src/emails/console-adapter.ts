/**
 * Console Email Adapter
 *
 * Dev/test adapter that logs emails to console instead of sending.
 * Used automatically when RESEND_API_KEY is not configured.
 */
import type { EmailPort, SendEmailOptions, EmailResult } from '@revbrain/contract';

export class ConsoleEmailAdapter implements EmailPort {
  async send(options: SendEmailOptions): Promise<EmailResult> {
    const to = Array.isArray(options.to) ? options.to.join(', ') : options.to;
    const id = `console-${Date.now()}`;

    console.log('─'.repeat(60));
    console.log(`[Email] To: ${to}`);
    console.log(`[Email] Subject: ${options.subject}`);
    if (options.replyTo) {
      console.log(`[Email] Reply-To: ${options.replyTo}`);
    }
    console.log(`[Email] ID: ${id}`);
    console.log(`[Email] HTML preview (first 200 chars):`);
    console.log(
      options.html
        .replace(/<[^>]*>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 200)
    );
    console.log('─'.repeat(60));

    return { id, success: true };
  }
}
