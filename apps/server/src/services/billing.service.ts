/**
 * Billing Service
 *
 * Handles all billing operations: plan sync with Stripe,
 * checkout session creation, customer portal, subscription management.
 */
import { db } from '@revbrain/database/client';
import {
  plans,
  organizations,
  subscriptions,
  paymentHistory,
  billingEvents,
  auditLogs,
  users,
} from '@revbrain/database';
import { eq, isNull, and, inArray } from 'drizzle-orm';
import { getStripe, formatAmount, isStripeConfigured } from '../lib/stripe.ts';
import { getEnv } from '../lib/env.ts';
import { logger } from '../lib/logger.ts';
import { getEmailService } from '../emails/index.ts';
import {
  renderPaymentReceiptEmail,
  renderPaymentFailedEmail,
  renderSubscriptionChangedEmail,
  renderRefundConfirmationEmail,
} from '../emails/templates/index.ts';
import { getAlertingService } from '../alerting/index.ts';
import type Stripe from 'stripe';

/** Billing contact info for an organization */
interface BillingContact {
  email: string;
  fullName: string;
  orgName: string;
}

export interface CreateCheckoutInput {
  planId: string;
  organizationId: string;
  userEmail: string;
  orgName: string;
  successUrl?: string;
  cancelUrl?: string;
}

export interface CheckoutResult {
  checkoutUrl: string;
  sessionId: string;
}

/** Input for issuing a refund */
export interface IssueRefundInput {
  paymentId: string;
  amountCents?: number; // If not provided, full refund
  reason: string;
  actorId: string;
}

/** Result of a refund operation */
export interface RefundResult {
  success: boolean;
  refundId: string;
  amountRefunded: number;
  isFullRefund: boolean;
}

/** Result of webhook event processing */
export type WebhookProcessingResult =
  | { status: 'success' }
  | { status: 'already_processed' }
  | { status: 'transient_error'; error: string }
  | { status: 'permanent_error'; error: string };

export class BillingService {
  /**
   * Create a Stripe Checkout Session for subscription purchase.
   */
  async createCheckoutSession(input: CreateCheckoutInput): Promise<CheckoutResult> {
    const stripe = getStripe();

    // Get plan with Stripe Price ID
    const plan = await db.query.plans.findFirst({
      where: eq(plans.id, input.planId),
    });

    if (!plan) {
      throw new Error('Plan not found');
    }

    if (!plan.stripePriceId) {
      throw new Error('Plan is not configured for billing. Contact support.');
    }

    // Get or create Stripe Customer
    const org = await db.query.organizations.findFirst({
      where: eq(organizations.id, input.organizationId),
    });

    if (!org) {
      throw new Error('Organization not found');
    }

    let customerId = org.stripeCustomerId;

    if (!customerId) {
      // Create new Stripe Customer
      const customer = await stripe.customers.create({
        email: input.userEmail,
        name: input.orgName,
        metadata: {
          organization_id: input.organizationId,
        },
      });
      customerId = customer.id;

      // Save customer ID
      await db
        .update(organizations)
        .set({ stripeCustomerId: customerId })
        .where(eq(organizations.id, input.organizationId));

      logger.info('Created Stripe customer', {
        customerId,
        organizationId: input.organizationId,
      });
    }

    const appUrl = getEnv('APP_URL') || 'http://localhost:5173';

    // Create Checkout Session
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      line_items: [
        {
          price: plan.stripePriceId,
          quantity: 1,
        },
      ],
      success_url:
        input.successUrl ||
        `${appUrl}/settings/billing?success=true&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: input.cancelUrl || `${appUrl}/settings/billing?canceled=true`,
      metadata: {
        organization_id: input.organizationId,
        plan_id: input.planId,
      },
      subscription_data: {
        metadata: {
          organization_id: input.organizationId,
          plan_id: input.planId,
        },
        trial_period_days: plan.trialDays || undefined,
      },
      // Allow promo codes
      allow_promotion_codes: true,
      // Collect billing address
      billing_address_collection: 'required',
    });

    logger.info('Created checkout session', {
      sessionId: session.id,
      organizationId: input.organizationId,
      planId: input.planId,
    });

    return {
      checkoutUrl: session.url!,
      sessionId: session.id,
    };
  }

  /**
   * Create a Stripe Customer Portal session for billing management.
   */
  async createPortalSession(
    organizationId: string,
    returnUrl?: string
  ): Promise<{ portalUrl: string }> {
    const stripe = getStripe();

    const org = await db.query.organizations.findFirst({
      where: eq(organizations.id, organizationId),
    });

    if (!org?.stripeCustomerId) {
      throw new Error('No billing account found. Please subscribe to a plan first.');
    }

    const appUrl = getEnv('APP_URL') || 'http://localhost:5173';

    const session = await stripe.billingPortal.sessions.create({
      customer: org.stripeCustomerId,
      return_url: returnUrl || `${appUrl}/settings/billing`,
    });

    return { portalUrl: session.url };
  }

  /**
   * Get current subscription status for an organization.
   */
  async getSubscription(organizationId: string) {
    const subscription = await db.query.subscriptions.findFirst({
      where: eq(subscriptions.organizationId, organizationId),
      with: {
        plan: true,
      },
    });

    if (!subscription) {
      return { subscription: null, plan: null };
    }

    return {
      subscription: {
        id: subscription.id,
        status: subscription.status,
        currentPeriodStart: subscription.currentPeriodStart,
        currentPeriodEnd: subscription.currentPeriodEnd,
        trialStart: subscription.trialStart,
        trialEnd: subscription.trialEnd,
        cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
        canceledAt: subscription.canceledAt,
      },
      plan: subscription.plan,
    };
  }

  /**
   * Get payment history for an organization with pagination.
   */
  async getPaymentHistory(
    organizationId: string,
    options?: { limit?: number; offset?: number }
  ): Promise<{
    payments: Array<{
      id: string;
      stripeInvoiceId: string | null;
      amount: string;
      amountCents: number;
      currency: string;
      status: string;
      description: string | null;
      invoiceUrl: string | null;
      receiptUrl: string | null;
      createdAt: Date;
    }>;
    hasMore: boolean;
  }> {
    const limit = options?.limit ?? 10;
    const offset = options?.offset ?? 0;

    // Fetch one extra to determine hasMore
    const payments = await db.query.paymentHistory.findMany({
      where: eq(paymentHistory.organizationId, organizationId),
      orderBy: (p, { desc }) => [desc(p.createdAt)],
      limit: limit + 1,
      offset,
    });

    const hasMore = payments.length > limit;
    const data = hasMore ? payments.slice(0, limit) : payments;

    return {
      payments: data.map((p) => ({
        id: p.id,
        stripeInvoiceId: p.stripeInvoiceId,
        amount: formatAmount(p.amountCents, p.currency),
        amountCents: p.amountCents,
        currency: p.currency,
        status: p.status,
        description: p.description,
        invoiceUrl: p.invoicePdfUrl,
        receiptUrl: p.receiptUrl,
        createdAt: p.createdAt,
      })),
      hasMore,
    };
  }

  // ========================================================================
  // PLAN SYNC (Admin operations)
  // ========================================================================

  /**
   * Sync a plan to Stripe (create Product + Price).
   * Call this when creating a new plan or when stripeProductId is missing.
   */
  async syncPlanToStripe(planId: string): Promise<void> {
    if (!isStripeConfigured()) {
      logger.warn('Stripe not configured, skipping plan sync');
      return;
    }

    const stripe = getStripe();

    const plan = await db.query.plans.findFirst({
      where: eq(plans.id, planId),
    });

    if (!plan) {
      throw new Error('Plan not found');
    }

    // Skip if already synced
    if (plan.stripeProductId && plan.stripePriceId) {
      logger.info('Plan already synced to Stripe', { planId, code: plan.code });
      return;
    }

    // Create Stripe Product
    const product = await stripe.products.create({
      name: plan.name,
      description: plan.description || undefined,
      metadata: {
        app_plan_id: plan.id,
        app_plan_code: plan.code,
      },
    });

    // Create Stripe Price
    const price = await stripe.prices.create({
      product: product.id,
      unit_amount: plan.price * 100, // Convert dollars to cents
      currency: plan.currency.toLowerCase(),
      recurring: {
        interval: plan.interval as 'month' | 'year',
      },
      metadata: {
        app_plan_id: plan.id,
        app_plan_code: plan.code,
      },
    });

    // Update plan with Stripe IDs
    await db
      .update(plans)
      .set({
        stripeProductId: product.id,
        stripePriceId: price.id,
        updatedAt: new Date(),
      })
      .where(eq(plans.id, planId));

    logger.info('Synced plan to Stripe', {
      planId,
      code: plan.code,
      productId: product.id,
      priceId: price.id,
    });
  }

  /**
   * Sync all plans that don't have Stripe IDs.
   */
  async syncAllPlansToStripe(): Promise<{ synced: number; errors: string[] }> {
    if (!isStripeConfigured()) {
      return { synced: 0, errors: ['Stripe not configured'] };
    }

    const unsynced = await db.query.plans.findMany({
      where: isNull(plans.stripeProductId),
    });

    let synced = 0;
    const errors: string[] = [];

    for (const plan of unsynced) {
      try {
        await this.syncPlanToStripe(plan.id);
        synced++;
      } catch (err) {
        const msg = `Failed to sync plan ${plan.code}: ${err instanceof Error ? err.message : 'Unknown error'}`;
        errors.push(msg);
        logger.error(msg);
      }
    }

    return { synced, errors };
  }

  // ========================================================================
  // WEBHOOK HANDLERS
  // ========================================================================

  /**
   * Result of webhook event processing.
   * Used to determine HTTP response code and retry behavior.
   */

  /**
   * Handle Stripe webhook event.
   * Returns a structured result indicating the processing status.
   *
   * IDEMPOTENCY: This handler is designed to be safely called multiple times
   * with the same event. If an event was already processed successfully,
   * it returns immediately without re-processing.
   *
   * Status values:
   * - 'success': Event processed successfully
   * - 'already_processed': Event was already processed (idempotent)
   * - 'transient_error': Temporary failure, should be retried (returns 500)
   * - 'permanent_error': Permanent failure, logged but won't be retried by Stripe
   */
  async handleWebhookEvent(event: Stripe.Event): Promise<WebhookProcessingResult> {
    // IDEMPOTENCY CHECK: Have we already processed this event?
    const existingEvent = await db.query.billingEvents.findFirst({
      where: eq(billingEvents.stripeEventId, event.id),
    });

    let eventDbId: string | null = null;

    if (existingEvent) {
      eventDbId = existingEvent.id;

      // Event exists - check if it was successfully processed
      if (existingEvent.processedAt && !existingEvent.error) {
        logger.info('Webhook event already processed (idempotent)', {
          eventId: event.id,
          type: event.type,
          processedAt: existingEvent.processedAt,
        });
        return { status: 'already_processed' };
      }

      // Event exists but had an error - allow retry
      logger.info('Retrying previously failed webhook event', {
        eventId: event.id,
        previousError: existingEvent.error,
        retryCount: existingEvent.retryCount,
      });
    } else {
      // New event - log it for debugging and tracking
      const [inserted] = await db
        .insert(billingEvents)
        .values({
          stripeEventId: event.id,
          eventType: event.type,
          payload: event.data.object as unknown as Record<string, unknown>,
        })
        .returning({ id: billingEvents.id });
      eventDbId = inserted?.id ?? null;
    }

    try {
      switch (event.type) {
        case 'checkout.session.completed':
          await this.handleCheckoutComplete(event.data.object as Stripe.Checkout.Session);
          break;

        case 'customer.subscription.created':
        case 'customer.subscription.updated':
          await this.handleSubscriptionUpdate(event.data.object as Stripe.Subscription);
          break;

        case 'customer.subscription.deleted':
          await this.handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
          break;

        case 'invoice.payment_succeeded':
          await this.handlePaymentSucceeded(event.data.object as Stripe.Invoice);
          break;

        case 'invoice.payment_failed':
          await this.handlePaymentFailed(event.data.object as Stripe.Invoice);
          break;

        case 'charge.refunded':
          await this.handleChargeRefunded(event.data.object as Stripe.Charge);
          break;

        default:
          logger.debug(`Unhandled webhook event type: ${event.type}`);
      }

      // Mark as processed successfully
      await db
        .update(billingEvents)
        .set({
          processedAt: new Date(),
          error: null,
          lastError: null,
        })
        .where(eq(billingEvents.stripeEventId, event.id));

      return { status: 'success' };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown error';
      const isTransient = this.isTransientError(err);

      logger.error(
        `Webhook processing error for ${event.type}`,
        { eventId: event.id, isTransient },
        err as Error
      );

      // Schedule retry with exponential backoff
      if (eventDbId) {
        const currentEvent = await db.query.billingEvents.findFirst({
          where: eq(billingEvents.id, eventDbId),
        });

        if (currentEvent) {
          const newRetryCount = currentEvent.retryCount + 1;
          const nextRetryAt = this.calculateNextRetryTime(newRetryCount);

          await db
            .update(billingEvents)
            .set({
              retryCount: newRetryCount,
              nextRetryAt,
              lastError: errorMsg,
              error: newRetryCount >= currentEvent.maxRetries ? errorMsg : null,
            })
            .where(eq(billingEvents.id, eventDbId));
        }
      }

      // Return appropriate status based on error type
      if (isTransient) {
        return { status: 'transient_error', error: errorMsg };
      }

      return { status: 'permanent_error', error: errorMsg };
    }
  }

  /**
   * Determine if an error is transient (worth retrying).
   */
  private isTransientError(err: unknown): boolean {
    if (!(err instanceof Error)) return false;

    const message = err.message.toLowerCase();

    // Network/connectivity errors
    if (
      message.includes('econnrefused') ||
      message.includes('econnreset') ||
      message.includes('etimedout') ||
      message.includes('network') ||
      message.includes('timeout')
    ) {
      return true;
    }

    // Database errors that might be transient
    if (
      message.includes('deadlock') ||
      message.includes('lock timeout') ||
      message.includes('connection')
    ) {
      return true;
    }

    // Stripe rate limiting
    if (message.includes('rate limit') || message.includes('too many requests')) {
      return true;
    }

    return false;
  }

  /**
   * Calculate next retry time using exponential backoff.
   */
  private calculateNextRetryTime(retryCount: number): Date {
    const baseDelayMs = 60_000; // 1 minute
    const maxDelayMs = 4 * 60 * 60 * 1000; // 4 hours

    let delay = baseDelayMs * Math.pow(2, retryCount - 1);
    delay = Math.min(delay, maxDelayMs);

    // Add jitter (10%)
    delay = delay + delay * 0.1 * Math.random();

    return new Date(Date.now() + delay);
  }

  private async handleCheckoutComplete(session: Stripe.Checkout.Session): Promise<void> {
    const orgId = session.metadata?.organization_id;
    const planId = session.metadata?.plan_id;

    if (!orgId || !planId) {
      throw new Error('Missing metadata in checkout session');
    }

    logger.info('Checkout completed', { orgId, planId, sessionId: session.id });

    // Subscription is created automatically by Stripe, webhook will handle it
    // We just log the checkout completion here
  }

  private async handleSubscriptionUpdate(subscription: Stripe.Subscription): Promise<void> {
    const orgId = subscription.metadata?.organization_id;

    if (!orgId) {
      // Try to find org by customer ID
      const customerId = subscription.customer as string;
      const org = await db.query.organizations.findFirst({
        where: eq(organizations.stripeCustomerId, customerId),
      });

      if (!org) {
        logger.error('Cannot find organization for subscription', {
          subscriptionId: subscription.id,
          customerId,
        });
        return;
      }

      // Update subscription metadata for future events
      const stripe = getStripe();
      await stripe.subscriptions.update(subscription.id, {
        metadata: {
          ...subscription.metadata,
          organization_id: org.id,
        },
      });

      return this.handleSubscriptionUpdateForOrg(subscription, org.id);
    }

    await this.handleSubscriptionUpdateForOrg(subscription, orgId);
  }

  private async handleSubscriptionUpdateForOrg(
    subscription: Stripe.Subscription,
    orgId: string
  ): Promise<void> {
    // Find plan by Stripe Price ID
    const subscriptionItem = subscription.items.data[0];
    const priceId = subscriptionItem?.price.id;
    const newPlan = await db.query.plans.findFirst({
      where: eq(plans.stripePriceId, priceId),
    });

    if (!newPlan) {
      logger.error('Cannot find plan for subscription price', { priceId });
      return;
    }

    // Get existing subscription to detect plan changes
    const existingSub = await db.query.subscriptions.findFirst({
      where: eq(subscriptions.organizationId, orgId),
      with: { plan: true },
    });

    const previousPlan = existingSub?.plan;
    const previousStatus = existingSub?.status;

    // In Stripe SDK v20, current_period dates are on the subscription item
    const currentPeriodStart = subscriptionItem?.current_period_start
      ? new Date(subscriptionItem.current_period_start * 1000)
      : new Date();
    const currentPeriodEnd = subscriptionItem?.current_period_end
      ? new Date(subscriptionItem.current_period_end * 1000)
      : new Date();

    // Upsert subscription record
    await db
      .insert(subscriptions)
      .values({
        organizationId: orgId,
        planId: newPlan.id,
        stripeSubscriptionId: subscription.id,
        status: subscription.status,
        currentPeriodStart,
        currentPeriodEnd,
        trialStart: subscription.trial_start ? new Date(subscription.trial_start * 1000) : null,
        trialEnd: subscription.trial_end ? new Date(subscription.trial_end * 1000) : null,
        cancelAtPeriodEnd: subscription.cancel_at_period_end,
        canceledAt: subscription.canceled_at ? new Date(subscription.canceled_at * 1000) : null,
      })
      .onConflictDoUpdate({
        target: subscriptions.organizationId,
        set: {
          planId: newPlan.id,
          stripeSubscriptionId: subscription.id,
          status: subscription.status,
          currentPeriodStart,
          currentPeriodEnd,
          trialStart: subscription.trial_start ? new Date(subscription.trial_start * 1000) : null,
          trialEnd: subscription.trial_end ? new Date(subscription.trial_end * 1000) : null,
          cancelAtPeriodEnd: subscription.cancel_at_period_end,
          canceledAt: subscription.canceled_at ? new Date(subscription.canceled_at * 1000) : null,
          updatedAt: new Date(),
        },
      });

    // Update organization's planId for quick access
    await db.update(organizations).set({ planId: newPlan.id }).where(eq(organizations.id, orgId));

    logger.info('Subscription updated', {
      orgId,
      planId: newPlan.id,
      status: subscription.status,
    });

    // Audit log for subscription changes
    const action = previousPlan ? 'subscription.updated' : 'subscription.created';
    await db.insert(auditLogs).values({
      userId: null, // Webhook-triggered, no user context
      organizationId: orgId,
      action,
      metadata: {
        stripeSubscriptionId: subscription.id,
        planId: newPlan.id,
        planName: newPlan.name,
        previousPlanId: previousPlan?.id || null,
        previousPlanName: previousPlan?.name || null,
        status: subscription.status,
        previousStatus: previousStatus || null,
      },
    });

    // Detect and send subscription change emails
    await this.detectAndSendSubscriptionChangeEmail(
      orgId,
      newPlan,
      previousPlan || null,
      subscription.status,
      previousStatus || null
    );
  }

  /**
   * Detect subscription changes and send appropriate email.
   */
  private async detectAndSendSubscriptionChangeEmail(
    orgId: string,
    newPlan: { id: string; name: string; price: number },
    previousPlan: { id: string; name: string; price: number } | null,
    newStatus: string,
    previousStatus: string | null
  ): Promise<void> {
    // Reactivation: was canceled/past_due, now active
    if (
      previousStatus &&
      ['canceled', 'past_due', 'unpaid'].includes(previousStatus) &&
      newStatus === 'active'
    ) {
      await this.sendSubscriptionChangedEmail(
        orgId,
        'reactivated',
        newPlan.name,
        previousPlan?.name
      );
      return;
    }

    // Plan change detection
    if (previousPlan && previousPlan.id !== newPlan.id) {
      const changeType = newPlan.price > previousPlan.price ? 'upgrade' : 'downgrade';
      await this.sendSubscriptionChangedEmail(orgId, changeType, newPlan.name, previousPlan.name);
      return;
    }

    // New subscription (no previous plan or status was null)
    // Don't send email for new subscriptions - the welcome flow handles that
  }

  private async handleSubscriptionDeleted(subscription: Stripe.Subscription): Promise<void> {
    // Get the subscription before updating to find org and plan
    const existingSub = await db.query.subscriptions.findFirst({
      where: eq(subscriptions.stripeSubscriptionId, subscription.id),
      with: { plan: true },
    });

    await db
      .update(subscriptions)
      .set({
        status: 'canceled',
        canceledAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(subscriptions.stripeSubscriptionId, subscription.id));

    logger.info('Subscription canceled', { subscriptionId: subscription.id });

    // Audit log for cancellation
    if (existingSub) {
      await db.insert(auditLogs).values({
        userId: null, // Webhook-triggered, no user context
        organizationId: existingSub.organizationId,
        action: 'subscription.canceled',
        metadata: {
          stripeSubscriptionId: subscription.id,
          planId: existingSub.planId,
          planName: existingSub.plan?.name || null,
        },
      });
    }

    // Send cancellation email
    if (existingSub) {
      await this.sendSubscriptionChangedEmail(
        existingSub.organizationId,
        'canceled',
        existingSub.plan?.name || 'Subscription'
      );
    }
  }

  private async handlePaymentSucceeded(invoice: Stripe.Invoice): Promise<void> {
    const customerId = invoice.customer as string;

    const org = await db.query.organizations.findFirst({
      where: eq(organizations.stripeCustomerId, customerId),
    });

    if (!org) {
      logger.warn('Cannot find organization for invoice', { customerId });
      return;
    }

    // In Stripe SDK v20, payment_intent is accessed through the payments array
    // For backwards compatibility, we'll extract it if available
    const paymentIntentId =
      (invoice.payments?.data?.[0]?.payment?.payment_intent as string | null) ?? null;

    // Record payment
    await db
      .insert(paymentHistory)
      .values({
        organizationId: org.id,
        stripeInvoiceId: invoice.id,
        stripePaymentIntentId: paymentIntentId,
        amountCents: invoice.amount_paid,
        currency: invoice.currency,
        status: 'succeeded',
        description: invoice.description || 'Subscription payment',
        invoicePdfUrl: invoice.invoice_pdf || null,
        receiptUrl: invoice.hosted_invoice_url || null,
      })
      .onConflictDoNothing();

    logger.info('Payment succeeded', {
      orgId: org.id,
      amount: formatAmount(invoice.amount_paid, invoice.currency),
    });

    // Audit log for successful payment
    await db.insert(auditLogs).values({
      userId: null, // Webhook-triggered, no user context
      organizationId: org.id,
      action: 'payment.succeeded',
      metadata: {
        stripeInvoiceId: invoice.id,
        amountCents: invoice.amount_paid,
        currency: invoice.currency,
      },
    });

    // Send payment receipt email
    await this.sendPaymentReceiptEmail(org.id, invoice);
  }

  private async handlePaymentFailed(invoice: Stripe.Invoice): Promise<void> {
    const customerId = invoice.customer as string;

    const org = await db.query.organizations.findFirst({
      where: eq(organizations.stripeCustomerId, customerId),
    });

    if (!org) {
      logger.warn('Cannot find organization for failed invoice', { customerId });
      return;
    }

    // Record failed payment
    await db
      .insert(paymentHistory)
      .values({
        organizationId: org.id,
        stripeInvoiceId: invoice.id,
        amountCents: invoice.amount_due,
        currency: invoice.currency,
        status: 'failed',
        description: 'Payment failed',
      })
      .onConflictDoNothing();

    logger.warn('Payment failed', {
      orgId: org.id,
      amount: formatAmount(invoice.amount_due, invoice.currency),
    });

    // Alert ops team about payment failure (non-blocking)
    getAlertingService()
      .warning(
        'Payment Failed',
        `Payment of ${formatAmount(invoice.amount_due, invoice.currency)} failed for ${org.name}`,
        {
          organizationId: org.id,
          metadata: {
            amount: formatAmount(invoice.amount_due, invoice.currency),
            stripeInvoiceId: invoice.id,
            stripeCustomerId: customerId,
          },
        }
      )
      .catch(() => {}); // Fire and forget

    // Audit log for failed payment
    await db.insert(auditLogs).values({
      userId: null, // Webhook-triggered, no user context
      organizationId: org.id,
      action: 'payment.failed',
      metadata: {
        stripeInvoiceId: invoice.id,
        amountCents: invoice.amount_due,
        currency: invoice.currency,
      },
    });

    // Send payment failed email
    await this.sendPaymentFailedEmail(org.id, invoice);
  }

  // ========================================================================
  // EMAIL HELPERS
  // ========================================================================

  /**
   * Get billing contact(s) for an organization.
   * Returns the CEO/owner first, then falls back to any admin user.
   */
  private async getBillingContact(orgId: string): Promise<BillingContact | null> {
    const org = await db.query.organizations.findFirst({
      where: eq(organizations.id, orgId),
    });

    if (!org) return null;

    // Find the primary billing contact (CEO or first admin)
    const adminRoles = ['org_owner', 'system_admin'];
    const adminUser = await db.query.users.findFirst({
      where: and(eq(users.organizationId, orgId), inArray(users.role, adminRoles)),
    });

    // Fallback to any user in the org
    const fallbackUser =
      adminUser ||
      (await db.query.users.findFirst({
        where: eq(users.organizationId, orgId),
      }));

    if (!fallbackUser) return null;

    return {
      email: fallbackUser.email,
      fullName: fallbackUser.fullName,
      orgName: org.name,
    };
  }

  /**
   * Send payment receipt email after successful payment.
   */
  private async sendPaymentReceiptEmail(orgId: string, invoice: Stripe.Invoice): Promise<void> {
    try {
      const contact = await this.getBillingContact(orgId);
      if (!contact) {
        logger.warn('No billing contact found for payment receipt email', { orgId });
        return;
      }

      // Get subscription and plan info
      const sub = await db.query.subscriptions.findFirst({
        where: eq(subscriptions.organizationId, orgId),
        with: { plan: true },
      });

      const planName = sub?.plan?.name || 'Subscription';
      const amount = formatAmount(invoice.amount_paid, invoice.currency);

      // Format dates
      const paymentDate = new Date().toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });

      const periodStart = sub?.currentPeriodStart
        ? new Date(sub.currentPeriodStart).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
          })
        : paymentDate;

      const periodEnd = sub?.currentPeriodEnd
        ? new Date(sub.currentPeriodEnd).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
          })
        : 'N/A';

      const html = renderPaymentReceiptEmail({
        userName: contact.fullName,
        orgName: contact.orgName,
        amount,
        planName,
        billingPeriod: `${periodStart} - ${periodEnd}`,
        receiptUrl: invoice.hosted_invoice_url || getEnv('APP_URL') + '/settings/billing',
        paymentDate,
      });

      const emailService = getEmailService();
      await emailService.send({
        to: contact.email,
        subject: `Payment received - ${amount} for ${planName}`,
        html,
      });

      logger.info('Sent payment receipt email', { orgId, email: contact.email });
    } catch (err) {
      logger.error('Failed to send payment receipt email', { orgId }, err as Error);
    }
  }

  /**
   * Send payment failed email.
   */
  private async sendPaymentFailedEmail(orgId: string, invoice: Stripe.Invoice): Promise<void> {
    try {
      const contact = await this.getBillingContact(orgId);
      if (!contact) {
        logger.warn('No billing contact found for payment failed email', { orgId });
        return;
      }

      // Get subscription info
      const sub = await db.query.subscriptions.findFirst({
        where: eq(subscriptions.organizationId, orgId),
        with: { plan: true },
      });

      const planName = sub?.plan?.name || 'Subscription';
      const amount = formatAmount(invoice.amount_due, invoice.currency);
      const appUrl = getEnv('APP_URL') || 'http://localhost:5173';

      // Calculate days until suspension (typically 7 days after first failure)
      const daysUntilSuspension = 7;

      // Extract failure reason from invoice if available
      const failureReason = invoice.last_finalization_error?.message || undefined;

      const html = renderPaymentFailedEmail({
        userName: contact.fullName,
        amount,
        planName,
        updatePaymentUrl: `${appUrl}/settings/billing`,
        daysUntilSuspension,
        failureReason,
      });

      const emailService = getEmailService();
      await emailService.send({
        to: contact.email,
        subject: `Action required: Payment of ${amount} failed`,
        html,
      });

      logger.info('Sent payment failed email', { orgId, email: contact.email });
    } catch (err) {
      logger.error('Failed to send payment failed email', { orgId }, err as Error);
    }
  }

  /**
   * Send subscription changed email (upgrade/downgrade/cancel/reactivate).
   */
  async sendSubscriptionChangedEmail(
    orgId: string,
    changeType: 'upgrade' | 'downgrade' | 'canceled' | 'reactivated',
    newPlanName: string,
    previousPlanName?: string
  ): Promise<void> {
    try {
      const contact = await this.getBillingContact(orgId);
      if (!contact) {
        logger.warn('No billing contact found for subscription changed email', { orgId });
        return;
      }

      const appUrl = getEnv('APP_URL') || 'http://localhost:5173';
      const effectiveDate = new Date().toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });

      const html = renderSubscriptionChangedEmail({
        userName: contact.fullName,
        changeType,
        previousPlan: previousPlanName,
        newPlan: newPlanName,
        effectiveDate,
        billingUrl: `${appUrl}/settings/billing`,
      });

      const subjects: Record<string, string> = {
        upgrade: `Subscription upgraded to ${newPlanName}`,
        downgrade: `Plan changed to ${newPlanName}`,
        canceled: 'Subscription canceled',
        reactivated: `Welcome back! ${newPlanName} subscription activated`,
      };

      const emailService = getEmailService();
      await emailService.send({
        to: contact.email,
        subject: subjects[changeType],
        html,
      });

      logger.info('Sent subscription changed email', { orgId, changeType, email: contact.email });
    } catch (err) {
      logger.error(
        'Failed to send subscription changed email',
        { orgId, changeType },
        err as Error
      );
    }
  }

  // ========================================================================
  // SUBSCRIPTION MANAGEMENT
  // ========================================================================

  /**
   * Change subscription to a different plan.
   * Performs immediate proration by default.
   */
  async changePlan(
    organizationId: string,
    newPlanId: string,
    options?: {
      prorationBehavior?: 'create_prorations' | 'none' | 'always_invoice';
      actorId?: string;
    }
  ): Promise<{ success: boolean; subscription: { id: string; status: string } }> {
    const stripe = getStripe();

    // Get current subscription
    const subscription = await db.query.subscriptions.findFirst({
      where: eq(subscriptions.organizationId, organizationId),
    });

    if (!subscription?.stripeSubscriptionId) {
      throw new Error('No active subscription found');
    }

    // Get current plan for audit logging
    const currentPlan = subscription.planId
      ? await db.query.plans.findFirst({
          where: eq(plans.id, subscription.planId),
        })
      : null;

    // Get new plan
    const newPlan = await db.query.plans.findFirst({
      where: eq(plans.id, newPlanId),
    });

    if (!newPlan) {
      throw new Error('Plan not found');
    }

    if (!newPlan.stripePriceId) {
      throw new Error('Plan is not configured for billing');
    }

    // Get current Stripe subscription
    const stripeSubscription = await stripe.subscriptions.retrieve(
      subscription.stripeSubscriptionId
    );

    if (!stripeSubscription || stripeSubscription.status === 'canceled') {
      throw new Error('Subscription is not active');
    }

    // Update subscription in Stripe
    const subscriptionItemId = stripeSubscription.items.data[0]?.id;
    if (!subscriptionItemId) {
      throw new Error('Subscription item not found');
    }

    const updatedSubscription = await stripe.subscriptions.update(
      subscription.stripeSubscriptionId,
      {
        items: [
          {
            id: subscriptionItemId,
            price: newPlan.stripePriceId,
          },
        ],
        proration_behavior: options?.prorationBehavior || 'create_prorations',
        metadata: {
          ...stripeSubscription.metadata,
          plan_id: newPlanId,
        },
      }
    );

    logger.info('Plan changed via API', {
      organizationId,
      newPlanId,
      stripeSubscriptionId: subscription.stripeSubscriptionId,
    });

    // Audit log the plan change
    await db.insert(auditLogs).values({
      userId: options?.actorId || null,
      organizationId,
      action: 'subscription.plan_changed',
      metadata: {
        previousPlanId: currentPlan?.id || null,
        previousPlanName: currentPlan?.name || null,
        newPlanId: newPlan.id,
        newPlanName: newPlan.name,
        stripeSubscriptionId: subscription.stripeSubscriptionId,
        prorationBehavior: options?.prorationBehavior || 'create_prorations',
      },
    });

    // Note: The webhook will handle updating our database when Stripe notifies us
    // But we return the immediate status here
    return {
      success: true,
      subscription: {
        id: updatedSubscription.id,
        status: updatedSubscription.status,
      },
    };
  }

  /**
   * Cancel subscription.
   * By default, cancels at the end of the current billing period.
   */
  async cancelSubscription(
    organizationId: string,
    options?: { cancelImmediately?: boolean; reason?: string; actorId?: string }
  ): Promise<{ success: boolean; cancelAt: Date | null }> {
    const stripe = getStripe();

    // Get current subscription
    const subscription = await db.query.subscriptions.findFirst({
      where: eq(subscriptions.organizationId, organizationId),
    });

    if (!subscription?.stripeSubscriptionId) {
      throw new Error('No active subscription found');
    }

    // Get plan info for audit log
    const plan = subscription.planId
      ? await db.query.plans.findFirst({
          where: eq(plans.id, subscription.planId),
        })
      : null;

    let updatedSubscription: Stripe.Subscription;

    if (options?.cancelImmediately) {
      // Cancel immediately - deletes the subscription
      updatedSubscription = await stripe.subscriptions.cancel(subscription.stripeSubscriptionId, {
        cancellation_details: {
          comment: options.reason,
        },
      });
    } else {
      // Cancel at period end
      updatedSubscription = await stripe.subscriptions.update(subscription.stripeSubscriptionId, {
        cancel_at_period_end: true,
        cancellation_details: {
          comment: options?.reason,
        },
      });
    }

    logger.info('Subscription canceled via API', {
      organizationId,
      immediate: options?.cancelImmediately || false,
      stripeSubscriptionId: subscription.stripeSubscriptionId,
    });

    // The webhook will handle updating our database, but return immediate status
    // Note: current_period_end exists at runtime but may not be in Stripe v20 types
    const periodEnd = (updatedSubscription as unknown as { current_period_end?: number })
      .current_period_end;
    const cancelAt = options?.cancelImmediately
      ? new Date()
      : periodEnd
        ? new Date(periodEnd * 1000)
        : null;

    // Audit log the cancellation
    await db.insert(auditLogs).values({
      userId: options?.actorId || null,
      organizationId,
      action: 'subscription.canceled',
      metadata: {
        planId: plan?.id || null,
        planName: plan?.name || null,
        cancelImmediately: options?.cancelImmediately || false,
        reason: options?.reason || null,
        cancelAt: cancelAt?.toISOString() || null,
        stripeSubscriptionId: subscription.stripeSubscriptionId,
      },
    });

    return {
      success: true,
      cancelAt,
    };
  }

  /**
   * Reactivate a subscription that was set to cancel at period end.
   */
  async reactivateSubscription(
    organizationId: string,
    options?: { actorId?: string }
  ): Promise<{ success: boolean; subscription: { id: string; status: string } }> {
    const stripe = getStripe();

    // Get current subscription
    const subscription = await db.query.subscriptions.findFirst({
      where: eq(subscriptions.organizationId, organizationId),
    });

    if (!subscription?.stripeSubscriptionId) {
      throw new Error('No subscription found');
    }

    // Get plan info for audit log
    const plan = subscription.planId
      ? await db.query.plans.findFirst({
          where: eq(plans.id, subscription.planId),
        })
      : null;

    // Check if subscription is pending cancellation
    const stripeSubscription = await stripe.subscriptions.retrieve(
      subscription.stripeSubscriptionId
    );

    if (!stripeSubscription.cancel_at_period_end) {
      throw new Error('Subscription is not pending cancellation');
    }

    if (stripeSubscription.status === 'canceled') {
      throw new Error('Subscription has already been canceled. Please create a new subscription.');
    }

    // Reactivate by removing the cancel_at_period_end flag
    const updatedSubscription = await stripe.subscriptions.update(
      subscription.stripeSubscriptionId,
      {
        cancel_at_period_end: false,
      }
    );

    logger.info('Subscription reactivated', {
      organizationId,
      stripeSubscriptionId: subscription.stripeSubscriptionId,
    });

    // Update local record immediately (webhook will also update, but this provides immediate feedback)
    await db
      .update(subscriptions)
      .set({
        cancelAtPeriodEnd: false,
        updatedAt: new Date(),
      })
      .where(eq(subscriptions.organizationId, organizationId));

    // Audit log the reactivation
    await db.insert(auditLogs).values({
      userId: options?.actorId || null,
      organizationId,
      action: 'subscription.reactivated',
      metadata: {
        planId: plan?.id || null,
        planName: plan?.name || null,
        stripeSubscriptionId: subscription.stripeSubscriptionId,
      },
    });

    return {
      success: true,
      subscription: {
        id: updatedSubscription.id,
        status: updatedSubscription.status,
      },
    };
  }

  // ========================================================================
  // REFUNDS
  // ========================================================================

  /**
   * Get a payment by ID (for admin refund view).
   */
  async getPaymentById(paymentId: string): Promise<{
    id: string;
    organizationId: string;
    stripeInvoiceId: string | null;
    stripePaymentIntentId: string | null;
    amountCents: number;
    currency: string;
    status: string;
    refundedAmountCents: number | null;
    refundedAt: Date | null;
    refundReason: string | null;
    createdAt: Date;
  } | null> {
    const payment = await db.query.paymentHistory.findFirst({
      where: eq(paymentHistory.id, paymentId),
    });

    if (!payment) return null;

    return {
      id: payment.id,
      organizationId: payment.organizationId,
      stripeInvoiceId: payment.stripeInvoiceId,
      stripePaymentIntentId: payment.stripePaymentIntentId,
      amountCents: payment.amountCents,
      currency: payment.currency,
      status: payment.status,
      refundedAmountCents: payment.refundedAmountCents,
      refundedAt: payment.refundedAt,
      refundReason: payment.refundReason,
      createdAt: payment.createdAt,
    };
  }

  /**
   * Issue a refund for a payment.
   * Can be full or partial refund.
   */
  async issueRefund(input: IssueRefundInput): Promise<RefundResult> {
    const stripe = getStripe();

    // Get the payment
    const payment = await db.query.paymentHistory.findFirst({
      where: eq(paymentHistory.id, input.paymentId),
    });

    if (!payment) {
      throw new Error('Payment not found');
    }

    if (payment.status === 'refunded') {
      throw new Error('Payment has already been fully refunded');
    }

    if (!payment.stripePaymentIntentId) {
      throw new Error('Payment cannot be refunded - no Stripe payment intent');
    }

    // Calculate refund amount
    const alreadyRefunded = payment.refundedAmountCents || 0;
    const maxRefundable = payment.amountCents - alreadyRefunded;

    if (maxRefundable <= 0) {
      throw new Error('No refundable amount remaining');
    }

    const refundAmount = input.amountCents
      ? Math.min(input.amountCents, maxRefundable)
      : maxRefundable;

    const isFullRefund = refundAmount === payment.amountCents && alreadyRefunded === 0;

    // Create refund in Stripe
    const refund = await stripe.refunds.create({
      payment_intent: payment.stripePaymentIntentId,
      amount: refundAmount,
      reason: 'requested_by_customer',
      metadata: {
        payment_id: payment.id,
        organization_id: payment.organizationId,
        refund_reason: input.reason,
        actor_id: input.actorId,
      },
    });

    // Update payment record
    const newRefundedTotal = alreadyRefunded + refundAmount;
    const newStatus = newRefundedTotal >= payment.amountCents ? 'refunded' : 'partially_refunded';

    await db
      .update(paymentHistory)
      .set({
        stripeRefundId: refund.id,
        refundedAmountCents: newRefundedTotal,
        refundedAt: new Date(),
        refundReason: input.reason,
        status: newStatus,
      })
      .where(eq(paymentHistory.id, input.paymentId));

    logger.info('Refund processed', {
      paymentId: input.paymentId,
      refundId: refund.id,
      amountRefunded: refundAmount,
      isFullRefund,
      actorId: input.actorId,
    });

    // Audit log
    await db.insert(auditLogs).values({
      userId: input.actorId,
      organizationId: payment.organizationId,
      action: 'payment.refunded',
      metadata: {
        paymentId: payment.id,
        stripeRefundId: refund.id,
        amountRefunded: refundAmount,
        totalRefunded: newRefundedTotal,
        originalAmount: payment.amountCents,
        isFullRefund,
        reason: input.reason,
        currency: payment.currency,
      },
    });

    // Send refund confirmation email
    await this.sendRefundConfirmationEmail(payment.organizationId, {
      refundAmount,
      originalAmount: payment.amountCents,
      isFullRefund,
      reason: input.reason,
      currency: payment.currency,
    });

    return {
      success: true,
      refundId: refund.id,
      amountRefunded: refundAmount,
      isFullRefund,
    };
  }

  /**
   * Handle charge.refunded webhook for refunds initiated outside our system.
   * This handles refunds made directly in Stripe Dashboard.
   */
  private async handleChargeRefunded(charge: Stripe.Charge): Promise<void> {
    const paymentIntentId = charge.payment_intent as string | null;

    if (!paymentIntentId) {
      logger.warn('Charge refunded without payment intent', { chargeId: charge.id });
      return;
    }

    // Find the payment by payment intent
    const payment = await db.query.paymentHistory.findFirst({
      where: eq(paymentHistory.stripePaymentIntentId, paymentIntentId),
    });

    if (!payment) {
      logger.warn('Cannot find payment for refunded charge', {
        chargeId: charge.id,
        paymentIntentId,
      });
      return;
    }

    // Calculate refunded amount from charge
    const refundedAmount = charge.amount_refunded;
    const isFullRefund = charge.refunded && refundedAmount >= charge.amount;

    // Get the refund ID if available
    const latestRefund = charge.refunds?.data?.[0];
    const stripeRefundId = latestRefund?.id || null;

    // Update payment record if not already updated
    if (
      payment.refundedAmountCents !== refundedAmount ||
      payment.status !== (isFullRefund ? 'refunded' : 'partially_refunded')
    ) {
      await db
        .update(paymentHistory)
        .set({
          stripeRefundId: stripeRefundId || payment.stripeRefundId,
          refundedAmountCents: refundedAmount,
          refundedAt: new Date(),
          refundReason: payment.refundReason || 'Refunded via Stripe Dashboard',
          status: isFullRefund ? 'refunded' : 'partially_refunded',
        })
        .where(eq(paymentHistory.id, payment.id));

      logger.info('Payment updated from charge.refunded webhook', {
        paymentId: payment.id,
        refundedAmount,
        isFullRefund,
      });

      // Audit log for external refund
      await db.insert(auditLogs).values({
        userId: null, // Webhook-triggered
        organizationId: payment.organizationId,
        action: 'payment.refunded',
        metadata: {
          paymentId: payment.id,
          stripeRefundId,
          amountRefunded: refundedAmount,
          originalAmount: payment.amountCents,
          isFullRefund,
          source: 'stripe_webhook',
          currency: payment.currency,
        },
      });

      // Send refund confirmation email
      await this.sendRefundConfirmationEmail(payment.organizationId, {
        refundAmount: refundedAmount,
        originalAmount: payment.amountCents,
        isFullRefund,
        reason: 'Refund processed',
        currency: payment.currency,
      });
    }
  }

  /**
   * Send refund confirmation email.
   */
  private async sendRefundConfirmationEmail(
    orgId: string,
    data: {
      refundAmount: number;
      originalAmount: number;
      isFullRefund: boolean;
      reason: string;
      currency: string;
    }
  ): Promise<void> {
    try {
      const contact = await this.getBillingContact(orgId);
      if (!contact) {
        logger.warn('No billing contact found for refund email', { orgId });
        return;
      }

      const appUrl = getEnv('APP_URL') || 'http://localhost:5173';
      const refundDate = new Date().toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });

      const html = renderRefundConfirmationEmail({
        userName: contact.fullName,
        orgName: contact.orgName,
        refundAmount: formatAmount(data.refundAmount, data.currency),
        originalAmount: formatAmount(data.originalAmount, data.currency),
        isFullRefund: data.isFullRefund,
        reason: data.reason,
        refundDate,
        billingUrl: `${appUrl}/settings/billing`,
      });

      const emailService = getEmailService();
      await emailService.send({
        to: contact.email,
        subject: `Refund processed: ${formatAmount(data.refundAmount, data.currency)}`,
        html,
      });

      logger.info('Sent refund confirmation email', { orgId, email: contact.email });
    } catch (err) {
      logger.error('Failed to send refund confirmation email', { orgId }, err as Error);
    }
  }
}
