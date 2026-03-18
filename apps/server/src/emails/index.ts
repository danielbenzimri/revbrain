/**
 * Email service factory.
 *
 * Creates the appropriate email adapter based on environment:
 * - RESEND_API_KEY set + EMAIL_ASYNC=true → QueuedEmailAdapter (async via job queue)
 * - RESEND_API_KEY set → ResendEmailAdapter (sync, immediate)
 * - RESEND_API_KEY missing → ConsoleEmailAdapter (dev/test)
 */
import type { EmailPort } from '@revbrain/contract';
import { getEnv } from '../lib/env.ts';
import { ResendEmailAdapter } from './resend-adapter.ts';
import { ConsoleEmailAdapter } from './console-adapter.ts';
import { QueuedEmailAdapter, registerEmailJobHandler } from './queued-adapter.ts';

/**
 * Create the direct email adapter (used by job worker)
 */
export function createDirectEmailAdapter(): EmailPort {
  const apiKey = getEnv('RESEND_API_KEY');
  const from = getEnv('EMAIL_FROM') || 'RevBrain <onboarding@resend.dev>';

  if (apiKey) {
    return new ResendEmailAdapter(apiKey, from);
  }

  return new ConsoleEmailAdapter();
}

/**
 * Create the email service (may be queued or direct based on config)
 */
export function createEmailService(): EmailPort {
  const apiKey = getEnv('RESEND_API_KEY');
  const asyncEnabled = getEnv('EMAIL_ASYNC') === 'true';

  if (apiKey && asyncEnabled) {
    console.log('[Email] Using async queued adapter');
    return new QueuedEmailAdapter();
  }

  if (apiKey) {
    const from = getEnv('EMAIL_FROM') || 'RevBrain <onboarding@resend.dev>';
    console.log('[Email] Using sync Resend adapter');
    return new ResendEmailAdapter(apiKey, from);
  }

  console.log('[Email] No RESEND_API_KEY — using console adapter');
  return new ConsoleEmailAdapter();
}

let _emailService: EmailPort | null = null;
let _directEmailAdapter: EmailPort | null = null;
let _jobHandlerRegistered = false;

export function getEmailService(): EmailPort {
  if (!_emailService) {
    _emailService = createEmailService();
  }
  return _emailService;
}

/**
 * Initialize the email job handler for async processing
 * Should be called once at app startup when using async emails
 */
export function initializeEmailJobHandler(): void {
  if (_jobHandlerRegistered) return;

  if (!_directEmailAdapter) {
    _directEmailAdapter = createDirectEmailAdapter();
  }

  registerEmailJobHandler(_directEmailAdapter);
  _jobHandlerRegistered = true;
  console.log('[Email] Job handler registered for async processing');
}

// Re-export templates for convenience
export { renderWelcomeEmail } from './templates/index.ts';
export type { WelcomeEmailData } from './templates/index.ts';
