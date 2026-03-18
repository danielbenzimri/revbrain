# Phase 2: Billing & Subscriptions (Stripe)

## Overview

This is the most critical phase. Without billing, you don't have a business. This phase implements the complete subscription lifecycle: plan creation, checkout, payment processing, subscription management, and handling edge cases.

---

## Stripe Concepts Primer

| Stripe Concept       | What It Is                               | Our Equivalent        |
| -------------------- | ---------------------------------------- | --------------------- |
| **Product**          | A service you sell (e.g., "Pro Plan")    | Plan name             |
| **Price**            | How much and how often (e.g., $49/month) | Plan price + interval |
| **Customer**         | A billing entity                         | Organization          |
| **Subscription**     | Customer → Price relationship            | Org's active plan     |
| **Checkout Session** | Hosted payment page                      | Our checkout flow     |
| **Customer Portal**  | Self-service billing management          | Tenant billing page   |
| **Webhook**          | Event notifications                      | How we stay in sync   |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Our Application                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐         │
│  │   Plans     │    │   Orgs      │    │ Subscriptions│         │
│  │   Table     │───▶│   Table     │───▶│   Table      │         │
│  │             │    │             │    │ (new)        │         │
│  │ stripe_     │    │ stripe_     │    │              │         │
│  │ product_id  │    │ customer_id │    │ stripe_      │         │
│  │ stripe_     │    │             │    │ subscription │         │
│  │ price_id    │    │             │    │ _id          │         │
│  └─────────────┘    └─────────────┘    └─────────────┘         │
│         ▲                  ▲                  ▲                  │
│         │                  │                  │                  │
│         │         Stripe Webhooks             │                  │
│         │              │                      │                  │
└─────────│──────────────│──────────────────────│──────────────────┘
          │              │                      │
          ▼              ▼                      ▼
┌─────────────────────────────────────────────────────────────────┐
│                         Stripe                                   │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐         │
│  │  Products   │    │  Customers  │    │Subscriptions│         │
│  │  & Prices   │    │             │    │             │         │
│  └─────────────┘    └─────────────┘    └─────────────┘         │
└─────────────────────────────────────────────────────────────────┘
```

---

## Database Changes

### New Tables & Columns

```sql
-- Migration: 0015_billing_stripe.sql

-- 1. Add Stripe IDs to existing tables
ALTER TABLE plans ADD COLUMN stripe_product_id TEXT UNIQUE;
ALTER TABLE plans ADD COLUMN stripe_price_id TEXT UNIQUE;

ALTER TABLE organizations ADD COLUMN stripe_customer_id TEXT UNIQUE;

-- 2. New subscriptions table (source of truth for billing state)
CREATE TABLE subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  plan_id UUID NOT NULL REFERENCES plans(id),
  stripe_subscription_id TEXT UNIQUE,

  -- Subscription state
  status TEXT NOT NULL DEFAULT 'active',
    -- active, trialing, past_due, canceled, unpaid, incomplete

  -- Billing period
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,

  -- Trial info
  trial_start TIMESTAMPTZ,
  trial_end TIMESTAMPTZ,

  -- Cancellation
  cancel_at_period_end BOOLEAN DEFAULT false,
  canceled_at TIMESTAMPTZ,

  -- Metadata
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE(organization_id) -- One active subscription per org
);

CREATE INDEX idx_subscriptions_org ON subscriptions(organization_id);
CREATE INDEX idx_subscriptions_stripe ON subscriptions(stripe_subscription_id);
CREATE INDEX idx_subscriptions_status ON subscriptions(status);

-- 3. Payment history for audit/display
CREATE TABLE payment_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  stripe_invoice_id TEXT UNIQUE,
  stripe_payment_intent_id TEXT,

  amount_cents INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'usd',
  status TEXT NOT NULL, -- succeeded, failed, pending, refunded

  description TEXT,
  invoice_pdf_url TEXT,
  receipt_url TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_payments_org ON payment_history(organization_id);

-- 4. Billing events log (for debugging webhook issues)
CREATE TABLE billing_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stripe_event_id TEXT UNIQUE NOT NULL,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  processed_at TIMESTAMPTZ,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_billing_events_type ON billing_events(event_type);
```

---

## Deliverables

### 2.1 Stripe SDK Setup

1. **Install Stripe SDK**

   ```bash
   pnpm add stripe -w --filter @geometrix/server
   ```

2. **Stripe Client Configuration**

   ```typescript
   // apps/server/src/lib/stripe.ts
   import Stripe from 'stripe';

   if (!process.env.STRIPE_SECRET_KEY) {
     throw new Error('STRIPE_SECRET_KEY is required');
   }

   export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
     apiVersion: '2024-04-10', // Use latest stable
     typescript: true,
   });

   // Helper to format amounts
   export function formatAmount(cents: number, currency = 'usd'): string {
     return new Intl.NumberFormat('en-US', {
       style: 'currency',
       currency: currency.toUpperCase(),
     }).format(cents / 100);
   }
   ```

3. **Environment Variables**

   ```env
   # Stripe Keys
   STRIPE_SECRET_KEY=sk_test_xxx          # sk_live_xxx in production
   STRIPE_PUBLISHABLE_KEY=pk_test_xxx     # pk_live_xxx in production
   STRIPE_WEBHOOK_SECRET=whsec_xxx

   # App URLs for Stripe redirects
   STRIPE_SUCCESS_URL=https://app.geometrix.io/billing/success
   STRIPE_CANCEL_URL=https://app.geometrix.io/billing/cancel
   ```

---

### 2.2 Plan Sync (Database ↔ Stripe)

**When admin creates/updates a plan, sync to Stripe**:

```typescript
// apps/server/src/services/billing.service.ts
import { stripe } from '../lib/stripe';
import { db } from '@geometrix/database';
import { plans } from '@geometrix/database/schema';

export class BillingService {
  /**
   * Create plan in both database and Stripe
   */
  async createPlan(data: CreatePlanInput): Promise<Plan> {
    // 1. Create Stripe Product
    const product = await stripe.products.create({
      name: data.name,
      description: data.description,
      metadata: {
        app_plan_code: data.code,
      },
    });

    // 2. Create Stripe Price
    const price = await stripe.prices.create({
      product: product.id,
      unit_amount: data.price * 100, // Convert to cents
      currency: 'usd',
      recurring: {
        interval: data.interval, // 'month' or 'year'
      },
      metadata: {
        app_plan_code: data.code,
      },
    });

    // 3. Create in database with Stripe IDs
    const [plan] = await db
      .insert(plans)
      .values({
        name: data.name,
        code: data.code,
        description: data.description,
        price: data.price,
        interval: data.interval,
        features: data.features,
        limits: data.limits,
        isPublic: data.isPublic,
        stripeProductId: product.id,
        stripePriceId: price.id,
      })
      .returning();

    return plan;
  }

  /**
   * Update plan - creates new Stripe Price (prices are immutable)
   */
  async updatePlan(id: string, data: UpdatePlanInput): Promise<Plan> {
    const existing = await db.query.plans.findFirst({
      where: eq(plans.id, id),
    });

    if (!existing) throw new Error('Plan not found');

    let newStripePriceId = existing.stripePriceId;

    // If price changed, create new Stripe Price
    if (data.price !== undefined && data.price !== existing.price) {
      const newPrice = await stripe.prices.create({
        product: existing.stripeProductId!,
        unit_amount: data.price * 100,
        currency: 'usd',
        recurring: {
          interval: data.interval || existing.interval,
        },
      });

      // Archive old price
      if (existing.stripePriceId) {
        await stripe.prices.update(existing.stripePriceId, {
          active: false,
        });
      }

      newStripePriceId = newPrice.id;
    }

    // Update Stripe Product metadata
    if (data.name || data.description) {
      await stripe.products.update(existing.stripeProductId!, {
        name: data.name || existing.name,
        description: data.description || existing.description,
      });
    }

    // Update database
    const [updated] = await db
      .update(plans)
      .set({
        ...data,
        stripePriceId: newStripePriceId,
      })
      .where(eq(plans.id, id))
      .returning();

    return updated;
  }

  /**
   * Sync existing plans to Stripe (one-time migration)
   */
  async syncAllPlansToStripe(): Promise<void> {
    const allPlans = await db.query.plans.findMany({
      where: isNull(plans.stripeProductId),
    });

    for (const plan of allPlans) {
      const product = await stripe.products.create({
        name: plan.name,
        metadata: { app_plan_code: plan.code },
      });

      const price = await stripe.prices.create({
        product: product.id,
        unit_amount: plan.price * 100,
        currency: 'usd',
        recurring: { interval: plan.interval as 'month' | 'year' },
      });

      await db
        .update(plans)
        .set({
          stripeProductId: product.id,
          stripePriceId: price.id,
        })
        .where(eq(plans.id, plan.id));

      console.log(`Synced plan ${plan.code} to Stripe`);
    }
  }
}
```

---

### 2.3 Checkout Flow

**The user journey**:

```
1. User clicks "Upgrade to Pro"
2. Frontend calls POST /billing/checkout
3. Backend creates Stripe Checkout Session
4. User redirected to Stripe-hosted checkout page
5. User enters payment info
6. Stripe processes payment
7. Stripe redirects to success URL
8. Webhook fires → we provision the subscription
```

**Implementation**:

```typescript
// apps/server/src/v1/routes/billing.ts
import { Hono } from 'hono';
import { stripe } from '../../lib/stripe';
import { billingService } from '../../services';

const billing = new Hono();

/**
 * Create Checkout Session
 * POST /billing/checkout
 */
billing.post('/checkout', authMiddleware, async (c) => {
  const user = c.get('user');
  const { planId } = await c.req.json<{ planId: string }>();

  // Get plan with Stripe Price ID
  const plan = await db.query.plans.findFirst({
    where: eq(plans.id, planId),
  });

  if (!plan?.stripePriceId) {
    return c.json({ error: 'Plan not available for purchase' }, 400);
  }

  // Get or create Stripe Customer
  const org = await db.query.organizations.findFirst({
    where: eq(organizations.id, user.organizationId),
  });

  let customerId = org?.stripeCustomerId;

  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email,
      name: org!.name,
      metadata: {
        organization_id: org!.id,
      },
    });
    customerId = customer.id;

    // Save customer ID
    await db
      .update(organizations)
      .set({ stripeCustomerId: customerId })
      .where(eq(organizations.id, org!.id));
  }

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
    success_url: `${process.env.APP_URL}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${process.env.APP_URL}/billing/cancel`,
    metadata: {
      organization_id: org!.id,
      plan_id: planId,
    },
    subscription_data: {
      metadata: {
        organization_id: org!.id,
        plan_id: planId,
      },
      trial_period_days: plan.trialDays || undefined,
    },
    // Enable automatic tax if configured
    // automatic_tax: { enabled: true },

    // Allow promo codes
    allow_promotion_codes: true,

    // Collect billing address (required for tax)
    billing_address_collection: 'required',
  });

  return c.json({ checkoutUrl: session.url });
});

/**
 * Get billing portal URL
 * POST /billing/portal
 */
billing.post('/portal', authMiddleware, async (c) => {
  const user = c.get('user');

  const org = await db.query.organizations.findFirst({
    where: eq(organizations.id, user.organizationId),
  });

  if (!org?.stripeCustomerId) {
    return c.json({ error: 'No billing account found' }, 400);
  }

  const session = await stripe.billingPortal.sessions.create({
    customer: org.stripeCustomerId,
    return_url: `${process.env.APP_URL}/settings/billing`,
  });

  return c.json({ portalUrl: session.url });
});

/**
 * Get current subscription status
 * GET /billing/subscription
 */
billing.get('/subscription', authMiddleware, async (c) => {
  const user = c.get('user');

  const subscription = await db.query.subscriptions.findFirst({
    where: eq(subscriptions.organizationId, user.organizationId),
    with: {
      plan: true,
    },
  });

  if (!subscription) {
    return c.json({ subscription: null, plan: null });
  }

  return c.json({
    subscription: {
      status: subscription.status,
      currentPeriodEnd: subscription.currentPeriodEnd,
      cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
      trialEnd: subscription.trialEnd,
    },
    plan: subscription.plan,
  });
});

export { billing };
```

---

### 2.4 Webhook Handler

**Critical**: Webhooks are how Stripe tells us about subscription changes.

```typescript
// apps/server/src/v1/routes/webhooks.ts
import { Hono } from 'hono';
import { stripe } from '../../lib/stripe';
import type Stripe from 'stripe';

const webhooks = new Hono();

/**
 * Stripe Webhook Handler
 * POST /webhooks/stripe
 */
webhooks.post('/stripe', async (c) => {
  const signature = c.req.header('stripe-signature');
  const body = await c.req.text();

  if (!signature) {
    return c.json({ error: 'Missing signature' }, 400);
  }

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(body, signature, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch (err) {
    console.error('[Webhook] Signature verification failed:', err);
    return c.json({ error: 'Invalid signature' }, 400);
  }

  // Log event for debugging
  await db.insert(billingEvents).values({
    stripeEventId: event.id,
    eventType: event.type,
    payload: event.data.object as unknown as Record<string, unknown>,
  });

  try {
    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutComplete(event.data.object as Stripe.Checkout.Session);
        break;

      case 'customer.subscription.created':
      case 'customer.subscription.updated':
        await handleSubscriptionUpdate(event.data.object as Stripe.Subscription);
        break;

      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
        break;

      case 'invoice.payment_succeeded':
        await handlePaymentSucceeded(event.data.object as Stripe.Invoice);
        break;

      case 'invoice.payment_failed':
        await handlePaymentFailed(event.data.object as Stripe.Invoice);
        break;

      default:
        console.log(`[Webhook] Unhandled event type: ${event.type}`);
    }

    // Mark as processed
    await db
      .update(billingEvents)
      .set({ processedAt: new Date() })
      .where(eq(billingEvents.stripeEventId, event.id));
  } catch (err) {
    console.error(`[Webhook] Error processing ${event.type}:`, err);

    // Log error but return 200 to prevent Stripe retries for logic errors
    await db
      .update(billingEvents)
      .set({
        processedAt: new Date(),
        error: err instanceof Error ? err.message : 'Unknown error',
      })
      .where(eq(billingEvents.stripeEventId, event.id));
  }

  return c.json({ received: true });
});

/**
 * Handle successful checkout
 */
async function handleCheckoutComplete(session: Stripe.Checkout.Session) {
  const orgId = session.metadata?.organization_id;
  const planId = session.metadata?.plan_id;

  if (!orgId || !planId) {
    throw new Error('Missing metadata in checkout session');
  }

  // Subscription is created automatically, we just need to link it
  if (session.subscription) {
    const sub = await stripe.subscriptions.retrieve(session.subscription as string);
    await handleSubscriptionUpdate(sub);
  }

  console.log(`[Webhook] Checkout complete for org ${orgId}`);
}

/**
 * Handle subscription create/update
 */
async function handleSubscriptionUpdate(subscription: Stripe.Subscription) {
  const orgId = subscription.metadata?.organization_id;
  const planId = subscription.metadata?.plan_id;

  if (!orgId) {
    console.error('[Webhook] Missing organization_id in subscription metadata');
    return;
  }

  // Find plan by Stripe Price ID if not in metadata
  let actualPlanId = planId;
  if (!actualPlanId) {
    const priceId = subscription.items.data[0]?.price.id;
    const plan = await db.query.plans.findFirst({
      where: eq(plans.stripePriceId, priceId),
    });
    actualPlanId = plan?.id;
  }

  // Upsert subscription record
  await db
    .insert(subscriptions)
    .values({
      organizationId: orgId,
      planId: actualPlanId!,
      stripeSubscriptionId: subscription.id,
      status: subscription.status,
      currentPeriodStart: new Date(subscription.current_period_start * 1000),
      currentPeriodEnd: new Date(subscription.current_period_end * 1000),
      trialStart: subscription.trial_start ? new Date(subscription.trial_start * 1000) : null,
      trialEnd: subscription.trial_end ? new Date(subscription.trial_end * 1000) : null,
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
      canceledAt: subscription.canceled_at ? new Date(subscription.canceled_at * 1000) : null,
    })
    .onConflictDoUpdate({
      target: subscriptions.organizationId,
      set: {
        planId: actualPlanId!,
        stripeSubscriptionId: subscription.id,
        status: subscription.status,
        currentPeriodStart: new Date(subscription.current_period_start * 1000),
        currentPeriodEnd: new Date(subscription.current_period_end * 1000),
        trialEnd: subscription.trial_end ? new Date(subscription.trial_end * 1000) : null,
        cancelAtPeriodEnd: subscription.cancel_at_period_end,
        canceledAt: subscription.canceled_at ? new Date(subscription.canceled_at * 1000) : null,
        updatedAt: new Date(),
      },
    });

  // Update organization's planId for quick access
  await db.update(organizations).set({ planId: actualPlanId }).where(eq(organizations.id, orgId));

  console.log(`[Webhook] Subscription ${subscription.status} for org ${orgId}`);
}

/**
 * Handle subscription deletion
 */
async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
  const orgId = subscription.metadata?.organization_id;

  if (!orgId) return;

  await db
    .update(subscriptions)
    .set({
      status: 'canceled',
      canceledAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(subscriptions.stripeSubscriptionId, subscription.id));

  // Optionally downgrade to free plan
  // await db.update(organizations).set({ planId: FREE_PLAN_ID }).where(...)

  console.log(`[Webhook] Subscription canceled for org ${orgId}`);
}

/**
 * Handle successful payment
 */
async function handlePaymentSucceeded(invoice: Stripe.Invoice) {
  const customerId = invoice.customer as string;

  // Find org by customer ID
  const org = await db.query.organizations.findFirst({
    where: eq(organizations.stripeCustomerId, customerId),
  });

  if (!org) return;

  // Record payment
  await db.insert(paymentHistory).values({
    organizationId: org.id,
    stripeInvoiceId: invoice.id,
    stripePaymentIntentId: invoice.payment_intent as string,
    amountCents: invoice.amount_paid,
    currency: invoice.currency,
    status: 'succeeded',
    description: invoice.description || 'Subscription payment',
    invoicePdfUrl: invoice.invoice_pdf,
    receiptUrl: invoice.hosted_invoice_url,
  });

  // Send receipt email
  await emailService.send({
    to: invoice.customer_email!,
    subject: 'Payment Receipt - Geometrix',
    template: 'payment-receipt',
    data: {
      amount: formatAmount(invoice.amount_paid, invoice.currency),
      invoiceUrl: invoice.hosted_invoice_url,
      date: new Date().toLocaleDateString(),
    },
  });

  console.log(`[Webhook] Payment succeeded for org ${org.id}`);
}

/**
 * Handle failed payment
 */
async function handlePaymentFailed(invoice: Stripe.Invoice) {
  const customerId = invoice.customer as string;

  const org = await db.query.organizations.findFirst({
    where: eq(organizations.stripeCustomerId, customerId),
  });

  if (!org) return;

  // Record failed payment
  await db.insert(paymentHistory).values({
    organizationId: org.id,
    stripeInvoiceId: invoice.id,
    amountCents: invoice.amount_due,
    currency: invoice.currency,
    status: 'failed',
    description: 'Payment failed',
  });

  // Get org admin email
  const admin = await db.query.users.findFirst({
    where: and(
      eq(users.organizationId, org.id),
      inArray(users.role, ['contractor_ceo', 'client_owner'])
    ),
  });

  if (admin) {
    await emailService.send({
      to: admin.email,
      subject: 'Action Required: Payment Failed',
      template: 'payment-failed',
      data: {
        userName: admin.fullName,
        amount: formatAmount(invoice.amount_due, invoice.currency),
        updatePaymentUrl: `${process.env.APP_URL}/settings/billing`,
        retryDate: invoice.next_payment_attempt
          ? new Date(invoice.next_payment_attempt * 1000).toLocaleDateString()
          : 'soon',
      },
    });
  }

  console.log(`[Webhook] Payment failed for org ${org.id}`);
}

export { webhooks };
```

---

### 2.5 Frontend Billing UI

```typescript
// apps/client/src/pages/settings/BillingPage.tsx
import { useQuery, useMutation } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

export function BillingPage() {
  const { data: billing, isLoading } = useQuery({
    queryKey: ['billing', 'subscription'],
    queryFn: () => api.get('/billing/subscription'),
  });

  const portalMutation = useMutation({
    mutationFn: () => api.post('/billing/portal'),
    onSuccess: (data) => {
      window.location.href = data.portalUrl;
    },
  });

  if (isLoading) return <Loading />;

  const { subscription, plan } = billing || {};

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Billing & Subscription</h1>

      {/* Current Plan */}
      <Card className="p-6">
        <h2 className="font-semibold mb-4">Current Plan</h2>

        {subscription ? (
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <div>
                <p className="text-lg font-medium">{plan?.name}</p>
                <p className="text-slate-500">
                  ${plan?.price}/{plan?.interval}
                </p>
              </div>
              <StatusBadge status={subscription.status} />
            </div>

            {subscription.trialEnd && new Date(subscription.trialEnd) > new Date() && (
              <Alert>
                Trial ends {formatDate(subscription.trialEnd)}
              </Alert>
            )}

            {subscription.cancelAtPeriodEnd && (
              <Alert variant="warning">
                Subscription will cancel on {formatDate(subscription.currentPeriodEnd)}
              </Alert>
            )}

            <p className="text-sm text-slate-500">
              Next billing date: {formatDate(subscription.currentPeriodEnd)}
            </p>
          </div>
        ) : (
          <div className="text-center py-8">
            <p className="text-slate-500 mb-4">No active subscription</p>
            <Button onClick={() => navigate('/pricing')}>
              View Plans
            </Button>
          </div>
        )}
      </Card>

      {/* Manage Billing */}
      {subscription && (
        <Card className="p-6">
          <h2 className="font-semibold mb-4">Manage Billing</h2>
          <p className="text-slate-500 mb-4">
            Update payment method, view invoices, or cancel subscription.
          </p>
          <Button
            onClick={() => portalMutation.mutate()}
            disabled={portalMutation.isPending}
          >
            {portalMutation.isPending ? 'Loading...' : 'Manage Billing'}
          </Button>
        </Card>
      )}
    </div>
  );
}
```

---

### 2.6 Trial Period Handling

```typescript
// apps/server/src/jobs/trial-reminders.ts (Phase 7 background jobs)
// For now, run via cron or manually

async function sendTrialEndingReminders() {
  // Find subscriptions where trial ends in 3 days
  const threeDaysFromNow = new Date();
  threeDaysFromNow.setDate(threeDaysFromNow.getDate() + 3);

  const endingTrials = await db.query.subscriptions.findMany({
    where: and(
      eq(subscriptions.status, 'trialing'),
      between(subscriptions.trialEnd, new Date(), threeDaysFromNow)
    ),
    with: {
      organization: true,
    },
  });

  for (const sub of endingTrials) {
    const admin = await getOrgAdmin(sub.organizationId);
    if (admin) {
      await emailService.send({
        to: admin.email,
        subject: 'Your trial is ending soon',
        template: 'trial-ending',
        data: {
          userName: admin.fullName,
          trialEndDate: sub.trialEnd,
          upgradeUrl: `${process.env.APP_URL}/settings/billing`,
        },
      });
    }
  }
}
```

---

## Stripe Dashboard Configuration

### 1. Products & Prices

- Create products matching your plans
- Or use API sync (recommended)

### 2. Customer Portal

```
Dashboard → Settings → Billing → Customer portal
- Enable: Update payment method
- Enable: View billing history
- Enable: Cancel subscription
- Disable: Switch plans (control this in your app)
```

### 3. Webhooks

```
Dashboard → Developers → Webhooks
Endpoint URL: https://api.geometrix.io/webhooks/stripe
Events to send:
- checkout.session.completed
- customer.subscription.created
- customer.subscription.updated
- customer.subscription.deleted
- invoice.payment_succeeded
- invoice.payment_failed
- invoice.upcoming
```

### 4. Test Mode

- Use test API keys during development
- Use Stripe CLI for local webhook testing:
  ```bash
  stripe listen --forward-to localhost:3001/webhooks/stripe
  ```

---

## Testing Checklist

### Checkout Flow

- [ ] Can create checkout session
- [ ] Redirects to Stripe checkout
- [ ] Successful payment creates subscription
- [ ] User redirected to success page
- [ ] Canceled checkout handles gracefully

### Subscription Lifecycle

- [ ] New subscription shows in database
- [ ] Plan change updates subscription
- [ ] Cancellation marks cancel_at_period_end
- [ ] Reactivation clears cancellation

### Payments

- [ ] Successful payment recorded
- [ ] Receipt email sent
- [ ] Failed payment recorded
- [ ] Failed payment email sent

### Webhooks

- [ ] Webhook signature validated
- [ ] Events logged to billing_events
- [ ] Duplicate events handled (idempotency)
- [ ] Unknown events don't crash

### Customer Portal

- [ ] Portal link generated
- [ ] Can update payment method
- [ ] Can view invoices
- [ ] Can cancel subscription

### Test Cards

```
Success: 4242 4242 4242 4242
Decline: 4000 0000 0000 0002
Requires auth: 4000 0025 0000 3155
```

---

## Files to Create

```
apps/server/src/
├── lib/
│   └── stripe.ts
├── services/
│   └── billing.service.ts
├── v1/routes/
│   ├── billing.ts
│   └── webhooks.ts

apps/client/src/
├── pages/
│   ├── pricing/PricingPage.tsx
│   └── settings/BillingPage.tsx
├── features/billing/
│   ├── hooks/
│   │   ├── use-subscription.ts
│   │   └── use-checkout.ts
│   └── components/
│       ├── PlanCard.tsx
│       ├── SubscriptionStatus.tsx
│       └── PaymentHistory.tsx

packages/database/src/schema/
├── subscriptions.ts
├── payment-history.ts
└── billing-events.ts

supabase/migrations/
└── 0015_billing_stripe.sql
```

---

## Security Considerations

1. **Webhook signature verification** - Always verify Stripe signatures
2. **Customer isolation** - Verify org ownership before creating portal session
3. **Idempotency** - Handle duplicate webhook events gracefully
4. **Secret management** - Never log full API keys or webhook secrets
5. **PCI compliance** - Never handle card data directly (Stripe Checkout handles this)

---

## Success Metrics

- Checkout completion rate > 80%
- Payment success rate > 95%
- Webhook processing time < 500ms
- Zero double-charges
- < 1% involuntary churn (failed payments)
