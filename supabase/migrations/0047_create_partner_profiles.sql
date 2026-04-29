-- Create partner_profiles table for SI billing
-- 1:1 with organizations (for si_partner orgs)
-- Tracks tier, cumulative fees, and admin override state

CREATE TABLE partner_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- 1:1 with organization
  organization_id uuid NOT NULL UNIQUE REFERENCES organizations(id),

  -- Computed tier (from cumulative fees paid)
  tier varchar(20) NOT NULL DEFAULT 'standard',

  -- Denormalized counters (reconciled nightly)
  cumulative_fees_paid bigint NOT NULL DEFAULT 0,
  completed_project_count integer NOT NULL DEFAULT 0,

  -- Admin tier override (persists through recalculation)
  tier_override varchar(20),
  tier_override_reason text,
  tier_override_set_by uuid REFERENCES users(id),
  tier_override_set_at timestamptz,

  -- Audit
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Index for fast lookup by org
CREATE INDEX idx_partner_profiles_org ON partner_profiles(organization_id);
