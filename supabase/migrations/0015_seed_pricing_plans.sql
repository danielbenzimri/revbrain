-- ============================================================================
-- SEED PRICING PLANS
-- Production-ready pricing tiers for Geometrix SaaS
-- ============================================================================

-- First, remove any existing test/debug plans
DELETE FROM plans WHERE code IN ('free', 'pro-monthly', 'pro-yearly', 'business-monthly', 'business-yearly', 'enterprise', 'debug');

-- ============================================================================
-- FREE TIER
-- For solo contractors and freelancers getting started
-- ============================================================================
INSERT INTO plans (
  name, code, description, price, currency, interval, trial_days,
  limits, features, is_active, is_public
) VALUES (
  'Free',
  'free',
  'Perfect for solo contractors and freelancers getting started with project management',
  0,
  'USD',
  'month',
  0,
  '{"maxUsers": 1, "maxProjects": 2, "storageGB": 1}'::jsonb,
  '{"aiLevel": "none", "modules": ["dashboard", "projects", "tasks", "docs"], "customBranding": false, "sso": false}'::jsonb,
  true,
  true
);

-- ============================================================================
-- PROFESSIONAL TIER - MONTHLY
-- For small contractor teams managing multiple projects
-- ============================================================================
INSERT INTO plans (
  name, code, description, price, currency, interval, trial_days,
  limits, features, is_active, is_public
) VALUES (
  'Professional',
  'pro-monthly',
  'Ideal for small contractor teams managing multiple projects with billing and quantity tracking',
  4900, -- $49.00
  'USD',
  'month',
  14,
  '{"maxUsers": 5, "maxProjects": 10, "storageGB": 25}'::jsonb,
  '{"aiLevel": "basic", "modules": ["dashboard", "projects", "tasks", "docs", "billing", "execution", "work_logs", "payments"], "customBranding": false, "sso": false}'::jsonb,
  true,
  true
);

-- ============================================================================
-- PROFESSIONAL TIER - YEARLY (20% discount)
-- ============================================================================
INSERT INTO plans (
  name, code, description, price, currency, interval, trial_days,
  limits, features, is_active, is_public
) VALUES (
  'Professional',
  'pro-yearly',
  'Ideal for small contractor teams - Save 20% with annual billing',
  47000, -- $470.00/year (~$39.17/mo)
  'USD',
  'year',
  14,
  '{"maxUsers": 5, "maxProjects": 10, "storageGB": 25}'::jsonb,
  '{"aiLevel": "basic", "modules": ["dashboard", "projects", "tasks", "docs", "billing", "execution", "work_logs", "payments"], "customBranding": false, "sso": false}'::jsonb,
  true,
  true
);

-- ============================================================================
-- BUSINESS TIER - MONTHLY
-- For growing construction firms with advanced collaboration needs
-- ============================================================================
INSERT INTO plans (
  name, code, description, price, currency, interval, trial_days,
  limits, features, is_active, is_public
) VALUES (
  'Business',
  'business-monthly',
  'For growing construction firms needing advanced collaboration, CAD integration, and client billing',
  14900, -- $149.00
  'USD',
  'month',
  14,
  '{"maxUsers": 25, "maxProjects": 50, "storageGB": 100}'::jsonb,
  '{"aiLevel": "advanced", "modules": ["dashboard", "projects", "tasks", "docs", "billing", "execution", "work_logs", "payments", "workspace", "geo_whatsapp", "client_billing", "users"], "customBranding": true, "sso": false}'::jsonb,
  true,
  true
);

-- ============================================================================
-- BUSINESS TIER - YEARLY (20% discount)
-- ============================================================================
INSERT INTO plans (
  name, code, description, price, currency, interval, trial_days,
  limits, features, is_active, is_public
) VALUES (
  'Business',
  'business-yearly',
  'For growing construction firms - Save 20% with annual billing',
  143000, -- $1,430.00/year (~$119.17/mo)
  'USD',
  'year',
  14,
  '{"maxUsers": 25, "maxProjects": 50, "storageGB": 100}'::jsonb,
  '{"aiLevel": "advanced", "modules": ["dashboard", "projects", "tasks", "docs", "billing", "execution", "work_logs", "payments", "workspace", "geo_whatsapp", "client_billing", "users"], "customBranding": true, "sso": false}'::jsonb,
  true,
  true
);

-- ============================================================================
-- ENTERPRISE TIER
-- Custom solutions for large construction enterprises
-- Note: is_public = false - shown only via "Contact Sales"
-- ============================================================================
INSERT INTO plans (
  name, code, description, price, currency, interval, trial_days,
  limits, features, is_active, is_public
) VALUES (
  'Enterprise',
  'enterprise',
  'Custom solutions for large construction enterprises with unlimited scale and dedicated support',
  0, -- Custom pricing via sales
  'USD',
  'year',
  30,
  '{"maxUsers": 0, "maxProjects": 0, "storageGB": 0}'::jsonb, -- 0 = unlimited
  '{"aiLevel": "full", "modules": ["dashboard", "projects", "tasks", "docs", "billing", "execution", "work_logs", "payments", "workspace", "geo_whatsapp", "client_billing", "users", "settings", "api_access", "audit_logs"], "customBranding": true, "sso": true}'::jsonb,
  true,
  false -- Hidden from public pricing page - contact sales
);

-- ============================================================================
-- SUMMARY
-- ============================================================================
-- Plans created:
-- 1. Free       - $0/mo       - 1 user, 2 projects, 1 GB
-- 2. Pro (mo)   - $49/mo      - 5 users, 10 projects, 25 GB, 14d trial
-- 3. Pro (yr)   - $470/yr     - 5 users, 10 projects, 25 GB, 14d trial (save 20%)
-- 4. Biz (mo)   - $149/mo     - 25 users, 50 projects, 100 GB, 14d trial
-- 5. Biz (yr)   - $1,430/yr   - 25 users, 50 projects, 100 GB, 14d trial (save 20%)
-- 6. Enterprise - Custom      - Unlimited, contact sales
