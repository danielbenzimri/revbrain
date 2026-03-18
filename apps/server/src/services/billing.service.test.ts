/**
 * Unit tests for BillingService
 *
 * Tests the critical billing operations: checkout, portal, subscription management.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type Stripe from 'stripe';

/**
 * Use vi.hoisted() to create mock functions that are available when vi.mock runs.
 */
const {
  mockPlansFindFirst,
  mockOrgsFindFirst,
  mockSubsFindFirst,
  mockPaymentHistoryFindMany,
  mockBillingEventsFindFirst,
  mockPlansUpdate,
  mockOrgsUpdate,
  _mockSubsInsert,
  mockSubsUpdate,
  _mockBillingEventsInsert,
  mockBillingEventsUpdate,
} = vi.hoisted(() => ({
  mockPlansFindFirst: vi.fn(),
  mockOrgsFindFirst: vi.fn(),
  mockSubsFindFirst: vi.fn(),
  mockPaymentHistoryFindMany: vi.fn(),
  mockBillingEventsFindFirst: vi.fn(),
  mockPlansUpdate: vi.fn(),
  mockOrgsUpdate: vi.fn(),
  _mockSubsInsert: vi.fn(),
  mockSubsUpdate: vi.fn(),
  _mockBillingEventsInsert: vi.fn(),
  mockBillingEventsUpdate: vi.fn(),
}));

const mockStripe = vi.hoisted(() => ({
  checkout: {
    sessions: {
      create: vi.fn(),
    },
  },
  billingPortal: {
    sessions: {
      create: vi.fn(),
    },
  },
  customers: {
    create: vi.fn(),
  },
  products: {
    create: vi.fn(),
  },
  prices: {
    create: vi.fn(),
  },
  subscriptions: {
    update: vi.fn(),
    retrieve: vi.fn(),
    cancel: vi.fn(),
  },
  balance: {
    retrieve: vi.fn(),
  },
}));

const mockEmailService = vi.hoisted(() => ({
  send: vi.fn().mockResolvedValue({ success: true }),
}));

// Mock dependencies - all from @geometrix/database (including schema + drizzle utilities)
vi.mock('@geometrix/database', () => ({
  db: {
    query: {
      plans: {
        findFirst: mockPlansFindFirst,
        findMany: vi.fn().mockResolvedValue([]),
      },
      organizations: {
        findFirst: mockOrgsFindFirst,
      },
      subscriptions: {
        findFirst: mockSubsFindFirst,
      },
      paymentHistory: {
        findMany: mockPaymentHistoryFindMany,
      },
      users: {
        findFirst: vi.fn(),
      },
      billingEvents: {
        findFirst: mockBillingEventsFindFirst,
      },
    },
    insert: vi.fn(() => ({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([{ id: 'event-db-id' }]),
        onConflictDoUpdate: vi.fn().mockResolvedValue(undefined),
        onConflictDoNothing: vi.fn().mockResolvedValue(undefined),
      }),
    })),
    update: vi.fn((table) => {
      if (table === 'plans') {
        return { set: vi.fn().mockReturnValue({ where: mockPlansUpdate }) };
      }
      if (table === 'organizations') {
        return { set: vi.fn().mockReturnValue({ where: mockOrgsUpdate }) };
      }
      if (table === 'subscriptions') {
        return { set: vi.fn().mockReturnValue({ where: mockSubsUpdate }) };
      }
      if (table === 'billingEvents') {
        return { set: vi.fn().mockReturnValue({ where: mockBillingEventsUpdate }) };
      }
      return { set: vi.fn().mockReturnValue({ where: vi.fn() }) };
    }),
  },
  // Schema tables
  plans: { id: 'id', stripeProductId: 'stripe_product_id' },
  organizations: { id: 'id', stripeCustomerId: 'stripe_customer_id' },
  subscriptions: { id: 'id', organizationId: 'organization_id' },
  paymentHistory: { organizationId: 'organization_id' },
  billingEvents: { stripeEventId: 'stripe_event_id' },
  users: { organizationId: 'organization_id', role: 'role' },
  auditLogs: { id: 'id', userId: 'user_id', organizationId: 'organization_id', action: 'action' },
  // Drizzle-orm utilities
  eq: vi.fn((...args) => ({ type: 'eq', args })),
  and: vi.fn((...args) => ({ type: 'and', args })),
  isNull: vi.fn((...args) => ({ type: 'isNull', args })),
  inArray: vi.fn((...args) => ({ type: 'inArray', args })),
  desc: vi.fn((col) => ({ type: 'desc', col })),
}));

vi.mock('../lib/stripe.ts', () => ({
  getStripe: vi.fn(() => mockStripe),
  formatAmount: vi.fn((cents, _currency) => `$${(cents / 100).toFixed(2)}`),
  isStripeConfigured: vi.fn(() => true),
}));

vi.mock('../lib/env.ts', () => ({
  getEnv: vi.fn((key: string) => {
    const env: Record<string, string> = {
      APP_URL: 'https://app.test.com',
    };
    return env[key];
  }),
}));

vi.mock('../lib/logger.ts', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('../emails/index.ts', () => ({
  getEmailService: vi.fn(() => mockEmailService),
}));

vi.mock('../emails/templates/index.ts', () => ({
  renderPaymentReceiptEmail: vi.fn(() => '<html>Receipt</html>'),
  renderPaymentFailedEmail: vi.fn(() => '<html>Failed</html>'),
  renderSubscriptionChangedEmail: vi.fn(() => '<html>Changed</html>'),
}));

// Import after mocks
import { BillingService } from './billing.service.ts';

describe('BillingService', () => {
  let billingService: BillingService;

  beforeEach(() => {
    vi.clearAllMocks();
    billingService = new BillingService();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('createCheckoutSession', () => {
    it('should create checkout session for existing customer', async () => {
      const plan = {
        id: 'plan-1',
        code: 'pro-monthly',
        name: 'Pro',
        price: 49,
        stripePriceId: 'price_test123',
        trialDays: 14,
      };

      const org = {
        id: 'org-1',
        name: 'Test Org',
        stripeCustomerId: 'cus_existing123',
      };

      mockPlansFindFirst.mockResolvedValue(plan);
      mockOrgsFindFirst.mockResolvedValue(org);
      mockStripe.checkout.sessions.create.mockResolvedValue({
        id: 'cs_test123',
        url: 'https://checkout.stripe.com/test',
      });

      const result = await billingService.createCheckoutSession({
        planId: 'plan-1',
        organizationId: 'org-1',
        userEmail: 'user@example.com',
        orgName: 'Test Org',
      });

      expect(result.checkoutUrl).toBe('https://checkout.stripe.com/test');
      expect(result.sessionId).toBe('cs_test123');
      expect(mockStripe.checkout.sessions.create).toHaveBeenCalledWith(
        expect.objectContaining({
          customer: 'cus_existing123',
          mode: 'subscription',
          allow_promotion_codes: true,
        })
      );
    });

    it('should create new Stripe customer if none exists', async () => {
      const plan = {
        id: 'plan-1',
        code: 'pro-monthly',
        name: 'Pro',
        price: 49,
        stripePriceId: 'price_test123',
        trialDays: 14,
      };

      const org = {
        id: 'org-1',
        name: 'Test Org',
        stripeCustomerId: null,
      };

      mockPlansFindFirst.mockResolvedValue(plan);
      mockOrgsFindFirst.mockResolvedValue(org);
      mockStripe.customers.create.mockResolvedValue({ id: 'cus_new123' });
      mockStripe.checkout.sessions.create.mockResolvedValue({
        id: 'cs_test123',
        url: 'https://checkout.stripe.com/test',
      });

      const result = await billingService.createCheckoutSession({
        planId: 'plan-1',
        organizationId: 'org-1',
        userEmail: 'user@example.com',
        orgName: 'Test Org',
      });

      expect(mockStripe.customers.create).toHaveBeenCalledWith(
        expect.objectContaining({
          email: 'user@example.com',
          name: 'Test Org',
        })
      );
      expect(result.sessionId).toBe('cs_test123');
    });

    it('should throw error if plan not found', async () => {
      mockPlansFindFirst.mockResolvedValue(null);

      await expect(
        billingService.createCheckoutSession({
          planId: 'nonexistent',
          organizationId: 'org-1',
          userEmail: 'user@example.com',
          orgName: 'Test Org',
        })
      ).rejects.toThrow('Plan not found');
    });

    it('should throw error if plan has no Stripe price', async () => {
      mockPlansFindFirst.mockResolvedValue({
        id: 'plan-1',
        code: 'free',
        stripePriceId: null,
      });

      await expect(
        billingService.createCheckoutSession({
          planId: 'plan-1',
          organizationId: 'org-1',
          userEmail: 'user@example.com',
          orgName: 'Test Org',
        })
      ).rejects.toThrow('Plan is not configured for billing');
    });

    it('should throw error if organization not found', async () => {
      mockPlansFindFirst.mockResolvedValue({
        id: 'plan-1',
        stripePriceId: 'price_test123',
      });
      mockOrgsFindFirst.mockResolvedValue(null);

      await expect(
        billingService.createCheckoutSession({
          planId: 'plan-1',
          organizationId: 'nonexistent',
          userEmail: 'user@example.com',
          orgName: 'Test Org',
        })
      ).rejects.toThrow('Organization not found');
    });

    it('should include trial period from plan', async () => {
      const plan = {
        id: 'plan-1',
        stripePriceId: 'price_test123',
        trialDays: 14,
      };

      mockPlansFindFirst.mockResolvedValue(plan);
      mockOrgsFindFirst.mockResolvedValue({
        id: 'org-1',
        stripeCustomerId: 'cus_test123',
      });
      mockStripe.checkout.sessions.create.mockResolvedValue({
        id: 'cs_test123',
        url: 'https://checkout.stripe.com/test',
      });

      await billingService.createCheckoutSession({
        planId: 'plan-1',
        organizationId: 'org-1',
        userEmail: 'user@example.com',
        orgName: 'Test Org',
      });

      expect(mockStripe.checkout.sessions.create).toHaveBeenCalledWith(
        expect.objectContaining({
          subscription_data: expect.objectContaining({
            trial_period_days: 14,
          }),
        })
      );
    });
  });

  describe('createPortalSession', () => {
    it('should create portal session for customer with billing account', async () => {
      mockOrgsFindFirst.mockResolvedValue({
        id: 'org-1',
        stripeCustomerId: 'cus_test123',
      });
      mockStripe.billingPortal.sessions.create.mockResolvedValue({
        url: 'https://billing.stripe.com/session/test',
      });

      const result = await billingService.createPortalSession('org-1');

      expect(result.portalUrl).toBe('https://billing.stripe.com/session/test');
      expect(mockStripe.billingPortal.sessions.create).toHaveBeenCalledWith({
        customer: 'cus_test123',
        return_url: 'https://app.test.com/settings/billing',
      });
    });

    it('should throw error if no billing account exists', async () => {
      mockOrgsFindFirst.mockResolvedValue({
        id: 'org-1',
        stripeCustomerId: null,
      });

      await expect(billingService.createPortalSession('org-1')).rejects.toThrow(
        'No billing account found'
      );
    });

    it('should use custom return URL if provided', async () => {
      mockOrgsFindFirst.mockResolvedValue({
        id: 'org-1',
        stripeCustomerId: 'cus_test123',
      });
      mockStripe.billingPortal.sessions.create.mockResolvedValue({
        url: 'https://billing.stripe.com/session/test',
      });

      await billingService.createPortalSession('org-1', 'https://custom.com/billing');

      expect(mockStripe.billingPortal.sessions.create).toHaveBeenCalledWith({
        customer: 'cus_test123',
        return_url: 'https://custom.com/billing',
      });
    });
  });

  describe('getSubscription', () => {
    it('should return subscription with plan details', async () => {
      mockSubsFindFirst.mockResolvedValue({
        id: 'sub-1',
        status: 'active',
        currentPeriodStart: new Date('2024-01-01'),
        currentPeriodEnd: new Date('2024-02-01'),
        trialStart: null,
        trialEnd: null,
        cancelAtPeriodEnd: false,
        canceledAt: null,
        plan: {
          id: 'plan-1',
          name: 'Pro',
          price: 49,
        },
      });

      const result = await billingService.getSubscription('org-1');

      expect(result.subscription).toEqual({
        id: 'sub-1',
        status: 'active',
        currentPeriodStart: expect.any(Date),
        currentPeriodEnd: expect.any(Date),
        trialStart: null,
        trialEnd: null,
        cancelAtPeriodEnd: false,
        canceledAt: null,
      });
      expect(result.plan).toEqual({
        id: 'plan-1',
        name: 'Pro',
        price: 49,
      });
    });

    it('should return null subscription if none exists', async () => {
      mockSubsFindFirst.mockResolvedValue(null);

      const result = await billingService.getSubscription('org-1');

      expect(result.subscription).toBeNull();
      expect(result.plan).toBeNull();
    });

    it('should return trialing subscription with trial dates', async () => {
      mockSubsFindFirst.mockResolvedValue({
        id: 'sub-1',
        status: 'trialing',
        currentPeriodStart: new Date('2024-01-01'),
        currentPeriodEnd: new Date('2024-02-01'),
        trialStart: new Date('2024-01-01'),
        trialEnd: new Date('2024-01-15'),
        cancelAtPeriodEnd: false,
        canceledAt: null,
        plan: { id: 'plan-1', name: 'Pro' },
      });

      const result = await billingService.getSubscription('org-1');

      expect(result.subscription?.status).toBe('trialing');
      expect(result.subscription?.trialStart).toEqual(expect.any(Date));
      expect(result.subscription?.trialEnd).toEqual(expect.any(Date));
    });
  });

  describe('getPaymentHistory', () => {
    it('should return formatted payment history', async () => {
      mockPaymentHistoryFindMany.mockResolvedValue([
        {
          id: 'pay-1',
          stripeInvoiceId: 'inv_test123',
          amountCents: 4900,
          currency: 'usd',
          status: 'paid',
          description: 'Pro subscription',
          invoicePdfUrl: 'https://stripe.com/invoice.pdf',
          receiptUrl: 'https://stripe.com/receipt',
          createdAt: new Date('2024-01-15'),
        },
        {
          id: 'pay-2',
          stripeInvoiceId: 'inv_test456',
          amountCents: 4900,
          currency: 'usd',
          status: 'paid',
          description: 'Pro subscription',
          invoicePdfUrl: null,
          receiptUrl: null,
          createdAt: new Date('2024-02-15'),
        },
      ]);

      const result = await billingService.getPaymentHistory('org-1');

      expect(result.payments).toHaveLength(2);
      expect(result.hasMore).toBe(false);
      expect(result.payments[0]).toEqual({
        id: 'pay-1',
        stripeInvoiceId: 'inv_test123',
        amount: '$49.00',
        amountCents: 4900,
        currency: 'usd',
        status: 'paid',
        description: 'Pro subscription',
        invoiceUrl: 'https://stripe.com/invoice.pdf',
        receiptUrl: 'https://stripe.com/receipt',
        createdAt: expect.any(Date),
      });
    });

    it('should return empty array if no payments exist', async () => {
      mockPaymentHistoryFindMany.mockResolvedValue([]);

      const result = await billingService.getPaymentHistory('org-1');

      expect(result.payments).toEqual([]);
      expect(result.hasMore).toBe(false);
    });

    it('should respect limit and offset parameters', async () => {
      mockPaymentHistoryFindMany.mockResolvedValue([]);

      await billingService.getPaymentHistory('org-1', { limit: 5, offset: 10 });

      expect(mockPaymentHistoryFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          limit: 6, // +1 for hasMore check
          offset: 10,
        })
      );
    });
  });

  describe('syncPlanToStripe', () => {
    it('should create Stripe product and price for new plan', async () => {
      mockPlansFindFirst.mockResolvedValue({
        id: 'plan-1',
        code: 'pro-monthly',
        name: 'Pro',
        description: 'Professional plan',
        price: 49,
        currency: 'USD',
        interval: 'month',
        stripeProductId: null,
        stripePriceId: null,
      });

      mockStripe.products.create.mockResolvedValue({ id: 'prod_test123' });
      mockStripe.prices.create.mockResolvedValue({ id: 'price_test123' });

      await billingService.syncPlanToStripe('plan-1');

      expect(mockStripe.products.create).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Pro',
          description: 'Professional plan',
        })
      );
      expect(mockStripe.prices.create).toHaveBeenCalledWith(
        expect.objectContaining({
          product: 'prod_test123',
          unit_amount: 4900,
          currency: 'usd',
          recurring: { interval: 'month' },
        })
      );
    });

    it('should skip if plan already synced', async () => {
      mockPlansFindFirst.mockResolvedValue({
        id: 'plan-1',
        code: 'pro-monthly',
        stripeProductId: 'prod_existing',
        stripePriceId: 'price_existing',
      });

      await billingService.syncPlanToStripe('plan-1');

      expect(mockStripe.products.create).not.toHaveBeenCalled();
      expect(mockStripe.prices.create).not.toHaveBeenCalled();
    });

    it('should throw error if plan not found', async () => {
      mockPlansFindFirst.mockResolvedValue(null);

      await expect(billingService.syncPlanToStripe('nonexistent')).rejects.toThrow(
        'Plan not found'
      );
    });
  });

  describe('changePlan', () => {
    it('should change subscription to new plan', async () => {
      mockSubsFindFirst.mockResolvedValue({
        id: 'sub-1',
        organizationId: 'org-1',
        stripeSubscriptionId: 'sub_stripe123',
        status: 'active',
      });

      mockPlansFindFirst.mockResolvedValue({
        id: 'plan-2',
        code: 'business-monthly',
        name: 'Business',
        stripePriceId: 'price_business123',
      });

      mockStripe.subscriptions.retrieve.mockResolvedValue({
        id: 'sub_stripe123',
        status: 'active',
        items: {
          data: [{ id: 'si_item123', price: { id: 'price_pro123' } }],
        },
        metadata: { organization_id: 'org-1' },
      });

      mockStripe.subscriptions.update.mockResolvedValue({
        id: 'sub_stripe123',
        status: 'active',
      });

      const result = await billingService.changePlan('org-1', 'plan-2');

      expect(result.success).toBe(true);
      expect(result.subscription.id).toBe('sub_stripe123');
      expect(mockStripe.subscriptions.update).toHaveBeenCalledWith(
        'sub_stripe123',
        expect.objectContaining({
          items: [{ id: 'si_item123', price: 'price_business123' }],
          proration_behavior: 'create_prorations',
        })
      );
    });

    it('should throw error if no subscription exists', async () => {
      mockSubsFindFirst.mockResolvedValue(null);

      await expect(billingService.changePlan('org-1', 'plan-2')).rejects.toThrow(
        'No active subscription found'
      );
    });

    it('should throw error if new plan not found', async () => {
      mockSubsFindFirst.mockResolvedValue({
        stripeSubscriptionId: 'sub_stripe123',
      });
      mockPlansFindFirst.mockResolvedValue(null);

      await expect(billingService.changePlan('org-1', 'nonexistent')).rejects.toThrow(
        'Plan not found'
      );
    });

    it('should throw error if plan has no Stripe price', async () => {
      mockSubsFindFirst.mockResolvedValue({
        stripeSubscriptionId: 'sub_stripe123',
      });
      mockPlansFindFirst.mockResolvedValue({
        id: 'plan-free',
        stripePriceId: null,
      });

      await expect(billingService.changePlan('org-1', 'plan-free')).rejects.toThrow(
        'Plan is not configured for billing'
      );
    });
  });

  describe('cancelSubscription', () => {
    it('should cancel subscription at period end by default', async () => {
      mockSubsFindFirst.mockResolvedValue({
        id: 'sub-1',
        stripeSubscriptionId: 'sub_stripe123',
      });

      const futureDate = Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60; // 30 days from now
      mockStripe.subscriptions.update.mockResolvedValue({
        id: 'sub_stripe123',
        status: 'active',
        cancel_at_period_end: true,
        current_period_end: futureDate,
      });

      const result = await billingService.cancelSubscription('org-1');

      expect(result.success).toBe(true);
      expect(result.cancelAt).toBeInstanceOf(Date);
      expect(mockStripe.subscriptions.update).toHaveBeenCalledWith(
        'sub_stripe123',
        expect.objectContaining({
          cancel_at_period_end: true,
        })
      );
    });

    it('should cancel subscription immediately when requested', async () => {
      mockSubsFindFirst.mockResolvedValue({
        id: 'sub-1',
        stripeSubscriptionId: 'sub_stripe123',
      });

      mockStripe.subscriptions.cancel.mockResolvedValue({
        id: 'sub_stripe123',
        status: 'canceled',
      });

      const result = await billingService.cancelSubscription('org-1', {
        cancelImmediately: true,
        reason: 'User requested cancellation',
      });

      expect(result.success).toBe(true);
      expect(mockStripe.subscriptions.cancel).toHaveBeenCalledWith('sub_stripe123', {
        cancellation_details: { comment: 'User requested cancellation' },
      });
    });

    it('should throw error if no subscription exists', async () => {
      mockSubsFindFirst.mockResolvedValue(null);

      await expect(billingService.cancelSubscription('org-1')).rejects.toThrow(
        'No active subscription found'
      );
    });
  });

  describe('reactivateSubscription', () => {
    it('should reactivate a subscription pending cancellation', async () => {
      mockSubsFindFirst.mockResolvedValue({
        id: 'sub-1',
        stripeSubscriptionId: 'sub_stripe123',
      });

      mockStripe.subscriptions.retrieve.mockResolvedValue({
        id: 'sub_stripe123',
        status: 'active',
        cancel_at_period_end: true,
      });

      mockStripe.subscriptions.update.mockResolvedValue({
        id: 'sub_stripe123',
        status: 'active',
        cancel_at_period_end: false,
      });

      const result = await billingService.reactivateSubscription('org-1');

      expect(result.success).toBe(true);
      expect(result.subscription.id).toBe('sub_stripe123');
      expect(mockStripe.subscriptions.update).toHaveBeenCalledWith('sub_stripe123', {
        cancel_at_period_end: false,
      });
    });

    it('should throw error if subscription is not pending cancellation', async () => {
      mockSubsFindFirst.mockResolvedValue({
        stripeSubscriptionId: 'sub_stripe123',
      });

      mockStripe.subscriptions.retrieve.mockResolvedValue({
        id: 'sub_stripe123',
        status: 'active',
        cancel_at_period_end: false,
      });

      await expect(billingService.reactivateSubscription('org-1')).rejects.toThrow(
        'Subscription is not pending cancellation'
      );
    });

    it('should throw error if subscription is already canceled', async () => {
      mockSubsFindFirst.mockResolvedValue({
        stripeSubscriptionId: 'sub_stripe123',
      });

      mockStripe.subscriptions.retrieve.mockResolvedValue({
        id: 'sub_stripe123',
        status: 'canceled',
        cancel_at_period_end: true,
      });

      await expect(billingService.reactivateSubscription('org-1')).rejects.toThrow(
        'Subscription has already been canceled'
      );
    });

    it('should throw error if no subscription exists', async () => {
      mockSubsFindFirst.mockResolvedValue(null);

      await expect(billingService.reactivateSubscription('org-1')).rejects.toThrow(
        'No subscription found'
      );
    });
  });

  describe('handleWebhookEvent - Idempotency', () => {
    const mockEvent = {
      id: 'evt_test123',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_test123',
          metadata: { organization_id: 'org-1', plan_id: 'plan-1' },
        },
      },
    } as unknown as Stripe.Event;

    it('should return already_processed if event was already processed successfully', async () => {
      // Event already processed (has processedAt, no error)
      mockBillingEventsFindFirst.mockResolvedValue({
        id: 'event-1',
        stripeEventId: 'evt_test123',
        processedAt: new Date('2025-01-01'),
        error: null,
      });

      const result = await billingService.handleWebhookEvent(mockEvent);

      // Should return already_processed without re-processing (idempotent)
      expect(result).toEqual({ status: 'already_processed' });
    });

    it('should retry processing if event previously failed', async () => {
      // Event exists but had an error
      mockBillingEventsFindFirst.mockResolvedValue({
        id: 'event-1',
        stripeEventId: 'evt_test123',
        processedAt: new Date('2025-01-01'),
        error: 'Previous processing failed',
        retryCount: 1,
      });

      const result = await billingService.handleWebhookEvent(mockEvent);

      // Should attempt to process again (retry failed event)
      expect(result).toEqual({ status: 'success' });
    });

    it('should process new events and return success', async () => {
      // No existing event - this is a new event
      mockBillingEventsFindFirst.mockResolvedValue(null);

      const result = await billingService.handleWebhookEvent(mockEvent);

      // Should process successfully
      expect(result).toEqual({ status: 'success' });
    });

    it('should check for existing event before processing', async () => {
      mockBillingEventsFindFirst.mockResolvedValue(null);

      await billingService.handleWebhookEvent(mockEvent);

      // Should query for existing event
      expect(mockBillingEventsFindFirst).toHaveBeenCalled();
    });
  });
});
