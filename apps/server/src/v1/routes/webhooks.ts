/**
 * Webhook Routes
 *
 * Handles incoming webhooks from external services.
 * These endpoints are NOT protected by auth middleware -
 * they use signature verification instead.
 *
 * HTTP Status Code Strategy:
 * - 200: Event processed successfully OR event was already processed (idempotent)
 * - 400: Invalid request (bad signature, missing header, malformed payload)
 * - 500: Transient failure (allows Stripe to retry)
 *
 * We combine Stripe's built-in retry mechanism with our own exponential
 * backoff retry service for persistent failures.
 */
import { Hono } from 'hono';
import { timingSafeEqual } from 'node:crypto';
import { verifyWebhookSignature, isStripeConfigured } from '../../lib/stripe.ts';
import { BillingService } from '../../services/billing.service.ts';
import { WebhookRetryService } from '../../services/webhook-retry.service.ts';
import { logger } from '../../lib/logger.ts';
import type { AppEnv } from '../../types/index.ts';

const webhooksRouter = new Hono<AppEnv>();

/**
 * POST /webhooks/stripe
 * Handle Stripe webhook events
 *
 * IMPORTANT: This endpoint does NOT use standard auth middleware.
 * It uses Stripe signature verification instead.
 */
webhooksRouter.post('/stripe', async (c) => {
  if (!isStripeConfigured()) {
    logger.warn('Stripe webhook received but Stripe is not configured');
    return c.json({ error: 'Billing not configured' }, 400);
  }

  const signature = c.req.header('stripe-signature');

  if (!signature) {
    logger.warn('Stripe webhook missing signature');
    return c.json({ error: 'Missing stripe-signature header' }, 400);
  }

  // Get raw body for signature verification
  const body = await c.req.text();

  let event;
  try {
    event = await verifyWebhookSignature(body, signature);
  } catch (err) {
    logger.error(
      'Stripe webhook signature verification failed',
      {},
      err instanceof Error ? err : new Error('Unknown error')
    );
    return c.json({ error: 'Invalid signature' }, 400);
  }

  logger.info('Stripe webhook received', {
    eventId: event.id,
    type: event.type,
  });

  // Process the event (idempotent - safe to call multiple times)
  const billingService = new BillingService();
  const result = await billingService.handleWebhookEvent(event);

  // Determine appropriate HTTP status based on result
  if (result.status === 'success' || result.status === 'already_processed') {
    // Event processed successfully or was already processed (idempotent)
    return c.json({
      received: true,
      eventId: event.id,
      status: result.status,
    });
  }

  if (result.status === 'transient_error') {
    // Transient failure - return 500 so Stripe will retry
    // We've also scheduled our own retry as a fallback
    logger.warn('Webhook processing failed with transient error, requesting Stripe retry', {
      eventId: event.id,
      type: event.type,
      error: result.error,
    });
    return c.json(
      {
        received: true,
        eventId: event.id,
        status: 'transient_error',
        error: result.error,
      },
      500
    );
  }

  // Permanent failure - return 200 to prevent Stripe retries
  // Our retry service will handle retries with exponential backoff
  return c.json({
    received: true,
    eventId: event.id,
    status: result.status,
    error: result.error,
  });
});

/**
 * POST /webhooks/retry
 * Manually trigger processing of pending webhook retries.
 * This endpoint is protected by a simple secret key check.
 *
 * In production, this should be called by a cron job or scheduler.
 */
webhooksRouter.post('/retry', async (c) => {
  // Simple auth check using a shared secret
  const authHeader = c.req.header('x-retry-secret');
  const expectedSecret = process.env.WEBHOOK_RETRY_SECRET;

  if (!expectedSecret) {
    logger.warn('WEBHOOK_RETRY_SECRET not configured');
    return c.json({ error: 'Retry endpoint not configured' }, 503);
  }

  // Use timing-safe comparison to prevent timing attacks
  const authBuffer = Buffer.from(authHeader || '');
  const expectedBuffer = Buffer.from(expectedSecret);
  if (authBuffer.length !== expectedBuffer.length || !timingSafeEqual(authBuffer, expectedBuffer)) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const retryService = new WebhookRetryService();
  const result = await retryService.processPendingRetries();

  return c.json({
    success: true,
    ...result,
  });
});

export { webhooksRouter };
