-- ============================================================================
-- COUPONS & PROMOTIONS SYSTEM
-- Phase 6: Discount codes managed in admin, synced to Stripe
-- ============================================================================

-- 1. Coupons table
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS coupons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Identity
  code VARCHAR(50) NOT NULL UNIQUE,
  name VARCHAR(100) NOT NULL,
  description TEXT,

  -- Discount type: 'percent' (value is 0-100) or 'fixed' (value is cents)
  discount_type VARCHAR(20) NOT NULL CHECK (discount_type IN ('percent', 'fixed')),
  discount_value INTEGER NOT NULL CHECK (discount_value > 0),
  currency VARCHAR(3) DEFAULT 'USD',

  -- Usage limits
  max_uses INTEGER,                    -- null = unlimited
  current_uses INTEGER NOT NULL DEFAULT 0,
  max_uses_per_user INTEGER DEFAULT 1, -- null = unlimited per user

  -- Validity period
  valid_from TIMESTAMPTZ NOT NULL DEFAULT now(),
  valid_until TIMESTAMPTZ,             -- null = no expiry

  -- Plan restrictions (empty array = all plans)
  applicable_plan_ids JSONB DEFAULT '[]',

  -- Minimum purchase requirement
  minimum_amount_cents INTEGER DEFAULT 0,

  -- Duration for subscription discounts
  -- 'once' = first invoice only
  -- 'forever' = all invoices
  -- 'repeating' = X months (see duration_in_months)
  duration VARCHAR(20) DEFAULT 'once' CHECK (duration IN ('once', 'forever', 'repeating')),
  duration_in_months INTEGER,

  -- Status
  is_active BOOLEAN NOT NULL DEFAULT true,

  -- Stripe integration
  stripe_coupon_id TEXT UNIQUE,
  stripe_promotion_code_id TEXT UNIQUE,

  -- Audit
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Coupon usages tracking
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS coupon_usages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coupon_id UUID NOT NULL REFERENCES coupons(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,

  -- Discount amount actually applied
  discount_amount_cents INTEGER NOT NULL,

  -- Stripe reference
  stripe_invoice_id TEXT,
  stripe_subscription_id TEXT,

  -- Timestamp
  used_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Indexes
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_coupons_code ON coupons(code);
CREATE INDEX IF NOT EXISTS idx_coupons_active ON coupons(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_coupons_validity ON coupons(valid_from, valid_until);
CREATE INDEX IF NOT EXISTS idx_coupons_stripe_coupon ON coupons(stripe_coupon_id);
CREATE INDEX IF NOT EXISTS idx_coupons_stripe_promo ON coupons(stripe_promotion_code_id);

CREATE INDEX IF NOT EXISTS idx_coupon_usages_coupon ON coupon_usages(coupon_id);
CREATE INDEX IF NOT EXISTS idx_coupon_usages_org ON coupon_usages(organization_id);
CREATE INDEX IF NOT EXISTS idx_coupon_usages_user ON coupon_usages(user_id);

-- 4. RLS Policies
-- ----------------------------------------------------------------------------
ALTER TABLE coupons ENABLE ROW LEVEL SECURITY;
ALTER TABLE coupon_usages ENABLE ROW LEVEL SECURITY;

-- Coupons: Only system admins can manage
CREATE POLICY coupons_all_system ON coupons
  FOR ALL
  USING (public.is_system_admin());

-- Coupon usages: Users can see their org's usage, system admins can see all
CREATE POLICY coupon_usages_select_own ON coupon_usages
  FOR SELECT
  USING (organization_id = public.get_user_org_id() OR public.is_system_admin());

CREATE POLICY coupon_usages_insert_system ON coupon_usages
  FOR INSERT
  WITH CHECK (public.is_system_admin());

CREATE POLICY coupon_usages_all_system ON coupon_usages
  FOR ALL
  USING (public.is_system_admin());

-- 5. Trigger for updated_at
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION update_coupons_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER coupons_updated_at
  BEFORE UPDATE ON coupons
  FOR EACH ROW
  EXECUTE FUNCTION update_coupons_updated_at();

-- 6. Comments
-- ----------------------------------------------------------------------------
COMMENT ON TABLE coupons IS 'Discount codes for billing, synced to Stripe Promotion Codes';
COMMENT ON TABLE coupon_usages IS 'Tracks which organizations used which coupons';
COMMENT ON COLUMN coupons.discount_type IS 'percent = percentage off (0-100), fixed = amount in cents';
COMMENT ON COLUMN coupons.duration IS 'How long the discount applies to subscription';
COMMENT ON COLUMN coupons.stripe_coupon_id IS 'Stripe Coupon ID (discount definition)';
COMMENT ON COLUMN coupons.stripe_promotion_code_id IS 'Stripe Promotion Code ID (user-facing code)';
