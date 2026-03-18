/**
 * Queued Email Adapter
 *
 * Email adapter that enqueues emails for async processing instead of sending immediately.
 * The actual sending is handled by the job queue worker.
 */
import type { EmailPort, SendEmailOptions, EmailResult } from '@revbrain/contract';
import { JobQueueService, type JobPayload } from '../services/job-queue.service.ts';

export class QueuedEmailAdapter implements EmailPort {
  private jobQueue: JobQueueService;
  private priority: number;

  constructor(options?: { priority?: number }) {
    this.jobQueue = new JobQueueService();
    this.priority = options?.priority ?? 0;
  }

  async send(options: SendEmailOptions): Promise<EmailResult> {
    try {
      const jobId = await this.jobQueue.enqueue(
        'email',
        {
          email: {
            to: options.to,
            subject: options.subject,
            html: options.html,
            replyTo: options.replyTo,
          },
        } as JobPayload,
        {
          priority: this.priority,
        }
      );

      return {
        id: jobId,
        success: true,
      };
    } catch (error) {
      console.error('[Email] Failed to enqueue email:', error);
      return {
        id: '',
        success: false,
        error: error instanceof Error ? error.message : 'Failed to enqueue email',
      };
    }
  }
}

/**
 * Register the email job handler
 * This should be called once at app startup
 */
export function registerEmailJobHandler(emailAdapter: EmailPort): void {
  JobQueueService.registerHandler('email', async (payload: JobPayload) => {
    if (!payload.email) {
      throw new Error('Email payload is missing');
    }

    const result = await emailAdapter.send({
      to: payload.email.to,
      subject: payload.email.subject,
      html: payload.email.html,
      replyTo: payload.email.replyTo,
    });

    if (!result.success) {
      throw new Error(result.error || 'Email send failed');
    }
  });
}
