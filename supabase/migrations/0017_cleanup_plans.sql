-- ============================================================================
-- CLEANUP PLANS - Keep only 4 plans: Free, Pro, Business, Enterprise
-- Also adds unique constraint on plan name
-- ============================================================================

-- Add unique constraint on plan name to prevent duplicates
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'plans_name_unique'
  ) THEN
    ALTER TABLE plans ADD CONSTRAINT plans_name_unique UNIQUE (name);
  END IF;
END $$;

-- First, migrate any subscriptions that might reference plans we're about to delete
-- Map any plan not in our final 4 to the Free plan
UPDATE subscriptions
SET plan_id = (SELECT id FROM plans WHERE code = 'free' LIMIT 1)
WHERE plan_id NOT IN (
  SELECT id FROM plans WHERE code IN ('free', 'pro', 'business', 'enterprise')
);

-- Also update organization plan_ids if any exist
UPDATE organizations
SET plan_id = (SELECT id FROM plans WHERE code = 'free' LIMIT 1)
WHERE plan_id IS NOT NULL
AND plan_id NOT IN (
  SELECT id FROM plans WHERE code IN ('free', 'pro', 'business', 'enterprise')
);

-- Now hard delete all plans except our final 4
DELETE FROM plans
WHERE code NOT IN ('free', 'pro', 'business', 'enterprise');

-- Ensure our 4 main plans have correct yearly discount values
UPDATE plans SET yearly_discount_percent = 0 WHERE code = 'free';
UPDATE plans SET yearly_discount_percent = 20 WHERE code = 'pro';
UPDATE plans SET yearly_discount_percent = 20 WHERE code = 'business';
UPDATE plans SET yearly_discount_percent = 15 WHERE code = 'enterprise';

-- Update plan names to ensure uniqueness (remove any suffix)
UPDATE plans SET name = 'Free' WHERE code = 'free';
UPDATE plans SET name = 'Professional' WHERE code = 'pro';
UPDATE plans SET name = 'Business' WHERE code = 'business';
UPDATE plans SET name = 'Enterprise' WHERE code = 'enterprise';

-- ============================================================================
-- RESULT: Exactly 4 plans remain
-- Free       - $0/mo,   0% yearly discount
-- Pro        - $49/mo,  20% yearly discount
-- Business   - $149/mo, 20% yearly discount
-- Enterprise - Custom,  15% yearly discount
-- ============================================================================
