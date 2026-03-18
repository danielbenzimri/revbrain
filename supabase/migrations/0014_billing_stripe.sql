-- ============================================================================
-- BILLING & STRIPE INTEGRATION
-- Phase 2: Subscription lifecycle, payments, and Stripe sync
-- ============================================================================

-- 1. Add Stripe IDs to existing tables
-- ----------------------------------------------------------------------------

-- Plans: Link to Stripe Products and Prices
ALTER TABLE plans ADD COLUMN IF NOT EXISTS stripe_product_id TEXT UNIQUE;
ALTER TABLE plans ADD COLUMN IF NOT EXISTS stripe_price_id TEXT UNIQUE;
ALTER TABLE plans ADD COLUMN IF NOT EXISTS trial_days INTEGER DEFAULT 0;

-- Organizations: Link to Stripe Customers
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT UNIQUE;

-- 2. Subscriptions table (source of truth for billing state)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  plan_id UUID NOT NULL REFERENCES plans(id),
  stripe_subscription_id TEXT UNIQUE,

  -- Subscription state
  -- Possible values: active, trialing, past_due, canceled, unpaid, incomplete, incomplete_expired
  status TEXT NOT NULL DEFAULT 'active',

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

  -- One active subscription per org
  UNIQUE(organization_id)
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_org ON subscriptions(organization_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe ON subscriptions(stripe_subscription_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status);

-- 3. Payment history for audit/display
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS payment_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  stripe_invoice_id TEXT UNIQUE,
  stripe_payment_intent_id TEXT,

  amount_cents INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'usd',

  -- Possible values: succeeded, failed, pending, refunded
  status TEXT NOT NULL,

  description TEXT,
  invoice_pdf_url TEXT,
  receipt_url TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payments_org ON payment_history(organization_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payment_history(status);

-- 4. Billing events log (for debugging webhook issues)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS billing_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stripe_event_id TEXT UNIQUE NOT NULL,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  processed_at TIMESTAMPTZ,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_billing_events_type ON billing_events(event_type);
CREATE INDEX IF NOT EXISTS idx_billing_events_stripe ON billing_events(stripe_event_id);

-- 5. RLS Policies for new tables
-- ----------------------------------------------------------------------------

-- Enable RLS
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_events ENABLE ROW LEVEL SECURITY;

-- Subscriptions: Users can view their org's subscription
CREATE POLICY subscriptions_select_own ON subscriptions
  FOR SELECT
  USING (organization_id = public.get_user_org_id() OR public.is_system_admin());

-- Subscriptions: Only system can modify (via webhooks)
CREATE POLICY subscriptions_all_system ON subscriptions
  FOR ALL
  USING (public.is_system_admin());

-- Payment history: Users can view their org's payments
CREATE POLICY payment_history_select_own ON payment_history
  FOR SELECT
  USING (organization_id = public.get_user_org_id() OR public.is_system_admin());

-- Payment history: Only system can insert
CREATE POLICY payment_history_insert_system ON payment_history
  FOR INSERT
  WITH CHECK (public.is_system_admin());

-- Billing events: Only system admins can access (for debugging)
CREATE POLICY billing_events_all_system ON billing_events
  FOR ALL
  USING (public.is_system_admin());

-- 6. Add subscription relation to organizations
-- ----------------------------------------------------------------------------
COMMENT ON COLUMN organizations.stripe_customer_id IS 'Stripe Customer ID for billing';
COMMENT ON COLUMN plans.stripe_product_id IS 'Stripe Product ID';
COMMENT ON COLUMN plans.stripe_price_id IS 'Stripe Price ID (for recurring charges)';
COMMENT ON COLUMN plans.trial_days IS 'Number of trial days for new subscriptions';
