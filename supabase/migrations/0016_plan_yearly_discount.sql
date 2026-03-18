-- ============================================================================
-- ADD YEARLY DISCOUNT PERCENT TO PLANS
-- Simplifies pricing model: one plan entry with monthly price + yearly discount
-- ============================================================================

-- Add yearly_discount_percent column (0-100, where 20 means 20% off for yearly)
ALTER TABLE plans ADD COLUMN IF NOT EXISTS yearly_discount_percent INTEGER DEFAULT 0;

-- Add constraint to ensure discount is between 0 and 100
ALTER TABLE plans ADD CONSTRAINT plans_yearly_discount_check
  CHECK (yearly_discount_percent >= 0 AND yearly_discount_percent <= 100);

-- Update existing yearly plans to have 20% discount (from the seed data)
-- Then we'll consolidate to monthly-only entries
UPDATE plans
SET yearly_discount_percent = 20
WHERE interval = 'month' AND code IN ('pro-monthly', 'business-monthly');

-- For plans that don't have a yearly variant, set to 0
UPDATE plans
SET yearly_discount_percent = 0
WHERE yearly_discount_percent IS NULL;

-- Make yearly_discount_percent NOT NULL after setting defaults
ALTER TABLE plans ALTER COLUMN yearly_discount_percent SET NOT NULL;

-- Remove duplicate yearly plans since we now calculate yearly from monthly + discount
-- First, migrate any subscriptions from yearly to monthly plans
UPDATE subscriptions
SET plan_id = (SELECT id FROM plans WHERE code = 'pro-monthly' LIMIT 1)
WHERE plan_id = (SELECT id FROM plans WHERE code = 'pro-yearly' LIMIT 1);

UPDATE subscriptions
SET plan_id = (SELECT id FROM plans WHERE code = 'business-monthly' LIMIT 1)
WHERE plan_id = (SELECT id FROM plans WHERE code = 'business-yearly' LIMIT 1);

-- Now delete the yearly plan entries (keeping only monthly)
DELETE FROM plans WHERE code = 'pro-yearly';
DELETE FROM plans WHERE code = 'business-yearly';

-- Rename the monthly plans to remove '-monthly' suffix since all plans are now monthly-based
UPDATE plans SET code = 'pro' WHERE code = 'pro-monthly';
UPDATE plans SET code = 'business' WHERE code = 'business-monthly';

-- Add comment for documentation
COMMENT ON COLUMN plans.yearly_discount_percent IS 'Discount percentage for yearly billing (0-100). Yearly price = monthly * 12 * (1 - discount/100)';
