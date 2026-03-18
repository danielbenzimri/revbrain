-- ============================================================================
-- FIX YEARLY DISCOUNT VALUES
-- Ensure all paid plans have proper yearly discounts set
-- ============================================================================

-- Set 20% yearly discount for Professional plan
UPDATE plans
SET yearly_discount_percent = 20
WHERE code = 'pro' OR name = 'Professional';

-- Set 20% yearly discount for Business plan
UPDATE plans
SET yearly_discount_percent = 20
WHERE code = 'business' OR name = 'Business';

-- Set 15% yearly discount for Enterprise plan
UPDATE plans
SET yearly_discount_percent = 15
WHERE code = 'enterprise' OR name = 'Enterprise';

-- Free plan has no yearly discount
UPDATE plans
SET yearly_discount_percent = 0
WHERE code = 'free' OR name = 'Free';
