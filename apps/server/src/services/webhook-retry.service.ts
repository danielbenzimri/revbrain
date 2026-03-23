/**
 * Webhook Retry Service
 *
 * Handles retry logic for failed webhook events with exponential backoff.
 * This service is used to process webhook events that failed during
 * initial processing and need to be retried.
 */
import { db } from '@revbrain/database/client';
import { billingEvents } from '@revbrain/database';
import { eq, and, lt, isNull, sql, lte } from 'drizzle-orm';
import { BillingService } from './billing.service.ts';
import { logger } from '../lib/logger.ts';
import type Stripe from 'stripe';

/** Configuration for exponential backoff */
const BACKOFF_CONFIG = {
  /** Base delay in milliseconds (1 minute) */
  baseDelayMs: 60_000,
  /** Maximum delay in milliseconds (4 hours) */
  maxDelayMs: 4 * 60 * 60 * 1000,
  /** Multiplier for exponential backoff */
  multiplier: 2,
  /** Jitter factor (0-1) to add randomness */
  jitterFactor: 0.1,
};

/** Result of processing pending retries */
export interface RetryResult {
  processed: number;
  succeeded: number;
  failed: number;
  exhausted: number;
}

export class WebhookRetryService {
  private billingService: BillingService;

  constructor() {
    this.billingService = new BillingService();
  }

  /**
   * Calculate the next retry time using exponential backoff with jitter.
   *
   * @param retryCount Current retry count (0-indexed)
   * @returns Date when next retry should be attempted
   */
  calculateNextRetryTime(retryCount: number): Date {
    // Exponential backoff: baseDelay * (multiplier ^ retryCount)
    let delay = BACKOFF_CONFIG.baseDelayMs * Math.pow(BACKOFF_CONFIG.multiplier, retryCount);

    // Cap at max delay
    delay = Math.min(delay, BACKOFF_CONFIG.maxDelayMs);

    // Add jitter to prevent thundering herd
    const jitter = delay * BACKOFF_CONFIG.jitterFactor * Math.random();
    delay = delay + jitter;

    return new Date(Date.now() + delay);
  }

  /**
   * Schedule a failed event for retry.
   *
   * @param eventId The event ID in our database (not Stripe's event ID)
   * @param error The error message from the failed attempt
   */
  async scheduleRetry(eventId: string, error: string): Promise<void> {
    const event = await db.query.billingEvents.findFirst({
      where: eq(billingEvents.id, eventId),
    });

    if (!event) {
      logger.error('Cannot schedule retry: event not found', { eventId });
      return;
    }

    const newRetryCount = event.retryCount + 1;

    if (newRetryCount > event.maxRetries) {
      // Mark as exhausted
      await db
        .update(billingEvents)
        .set({
          lastError: error,
          error: `Exhausted all ${event.maxRetries} retries. Last error: ${error}`,
        })
        .where(eq(billingEvents.id, eventId));

      logger.error('Webhook event exhausted all retries', {
        eventId,
        stripeEventId: event.stripeEventId,
        eventType: event.eventType,
        retryCount: newRetryCount,
      });
      return;
    }

    const nextRetryAt = this.calculateNextRetryTime(newRetryCount - 1);

    await db
      .update(billingEvents)
      .set({
        retryCount: newRetryCount,
        nextRetryAt,
        lastError: error,
      })
      .where(eq(billingEvents.id, eventId));

    logger.info('Webhook event scheduled for retry', {
      eventId,
      stripeEventId: event.stripeEventId,
      eventType: event.eventType,
      retryCount: newRetryCount,
      nextRetryAt: nextRetryAt.toISOString(),
    });
  }

  /**
   * Process all pending retries that are due.
   * This should be called periodically by a cron job.
   *
   * @param batchSize Maximum number of events to process in one batch
   * @returns Result summary
   */
  async processPendingRetries(batchSize: number = 10): Promise<RetryResult> {
    const now = new Date();

    // Find events that are due for retry
    const pendingEvents = await db.query.billingEvents.findMany({
      where: and(
        isNull(billingEvents.processedAt),
        lte(billingEvents.nextRetryAt, now),
        lt(billingEvents.retryCount, sql`${billingEvents.maxRetries}`)
      ),
      limit: batchSize,
      orderBy: (be, { asc }) => [asc(be.nextRetryAt)],
    });

    const result: RetryResult = {
      processed: 0,
      succeeded: 0,
      failed: 0,
      exhausted: 0,
    };

    for (const event of pendingEvents) {
      result.processed++;

      try {
        // Reconstruct Stripe event from stored payload
        const stripeEvent = {
          id: event.stripeEventId,
          type: event.eventType,
          data: {
            object: event.payload,
          },
        } as Stripe.Event;

        // Clear nextRetryAt before processing to prevent duplicate processing
        await db
          .update(billingEvents)
          .set({ nextRetryAt: null })
          .where(eq(billingEvents.id, event.id));

        // Attempt to process
        const processResult = await this.billingService.handleWebhookEvent(stripeEvent);

        if (processResult.status === 'success' || processResult.status === 'already_processed') {
          result.succeeded++;
          logger.info('Webhook retry succeeded', {
            eventId: event.id,
            stripeEventId: event.stripeEventId,
            eventType: event.eventType,
            retryCount: event.retryCount,
          });
        } else {
          result.failed++;
          // Schedule next retry
          const errorMsg =
            processResult.status === 'transient_error' || processResult.status === 'permanent_error'
              ? processResult.error
              : 'Processing failed';
          await this.scheduleRetry(event.id, errorMsg);
        }
      } catch (err) {
        result.failed++;
        const errorMsg = err instanceof Error ? err.message : 'Unknown error';

        // Check if retries exhausted
        if (event.retryCount + 1 >= event.maxRetries) {
          result.exhausted++;
        }

        await this.scheduleRetry(event.id, errorMsg);
      }
    }

    if (result.processed > 0) {
      logger.info('Webhook retry batch completed', { ...result });
    }

    return result;
  }

  /**
   * Get statistics about pending retries.
   */
  async getRetryStats(): Promise<{
    pending: number;
    failed: number;
    exhausted: number;
  }> {
    // Pending retries (scheduled but not yet due or currently processing)
    const [pending] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(billingEvents)
      .where(
        and(
          isNull(billingEvents.processedAt),
          lt(billingEvents.retryCount, sql`${billingEvents.maxRetries}`)
        )
      );

    // Failed events (have error but not exhausted)
    const [failed] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(billingEvents)
      .where(
        and(
          isNull(billingEvents.processedAt),
          sql`${billingEvents.error} IS NOT NULL`,
          lt(billingEvents.retryCount, sql`${billingEvents.maxRetries}`)
        )
      );

    // Exhausted (retry count >= max retries and not processed)
    const [exhausted] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(billingEvents)
      .where(
        and(
          isNull(billingEvents.processedAt),
          sql`${billingEvents.retryCount} >= ${billingEvents.maxRetries}`
        )
      );

    return {
      pending: pending?.count ?? 0,
      failed: failed?.count ?? 0,
      exhausted: exhausted?.count ?? 0,
    };
  }

  /**
   * Manually retry a specific event.
   * Useful for admin intervention.
   */
  async retryEvent(eventId: string): Promise<boolean> {
    const event = await db.query.billingEvents.findFirst({
      where: eq(billingEvents.id, eventId),
    });

    if (!event) {
      throw new Error('Event not found');
    }

    if (event.processedAt) {
      throw new Error('Event was already processed successfully');
    }

    try {
      const stripeEvent = {
        id: event.stripeEventId,
        type: event.eventType,
        data: {
          object: event.payload,
        },
      } as Stripe.Event;

      const processResult = await this.billingService.handleWebhookEvent(stripeEvent);

      if (processResult.status === 'success' || processResult.status === 'already_processed') {
        return true;
      }

      const errorMsg =
        processResult.status === 'transient_error' || processResult.status === 'permanent_error'
          ? processResult.error
          : 'Processing failed';
      await this.scheduleRetry(eventId, `Manual retry: ${errorMsg}`);
      return false;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown error';
      await this.scheduleRetry(eventId, `Manual retry failed: ${errorMsg}`);
      return false;
    }
  }

  /**
   * Reset an exhausted event to allow more retries.
   * Useful for admin intervention after fixing the underlying issue.
   */
  async resetRetryCount(eventId: string, additionalRetries: number = 3): Promise<void> {
    const event = await db.query.billingEvents.findFirst({
      where: eq(billingEvents.id, eventId),
    });

    if (!event) {
      throw new Error('Event not found');
    }

    await db
      .update(billingEvents)
      .set({
        retryCount: 0,
        maxRetries: additionalRetries,
        nextRetryAt: new Date(), // Retry immediately
        error: null,
        lastError: null,
      })
      .where(eq(billingEvents.id, eventId));

    logger.info('Webhook event retry count reset', {
      eventId,
      stripeEventId: event.stripeEventId,
      newMaxRetries: additionalRetries,
    });
  }
}
