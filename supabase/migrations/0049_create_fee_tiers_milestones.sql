-- Create fee_agreement_tiers and fee_milestones tables for SI billing

-- Rate brackets (normalized, not JSONB)
CREATE TABLE fee_agreement_tiers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fee_agreement_id uuid NOT NULL REFERENCES fee_agreements(id) ON DELETE CASCADE,
  bracket_ceiling bigint, -- null = unlimited (final bracket)
  rate_bps integer NOT NULL,
  sort_order integer NOT NULL DEFAULT 100,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_fee_agreement_tiers_agreement ON fee_agreement_tiers(fee_agreement_id);

-- Billing milestones
CREATE TABLE fee_milestones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fee_agreement_id uuid NOT NULL REFERENCES fee_agreements(id),
  name varchar(100) NOT NULL,
  phase varchar(20) NOT NULL, -- assessment | migration
  trigger_type varchar(20) NOT NULL, -- automatic | admin_approved
  percentage_bps integer, -- nullable for assessment (flat fee)
  amount bigint NOT NULL, -- cents
  status varchar(20) NOT NULL DEFAULT 'pending',
  paid_via varchar(20) NOT NULL DEFAULT 'stripe_invoice', -- stripe_invoice | carried_credit

  -- SI completion request
  request_reason text,
  requested_by uuid REFERENCES users(id),
  requested_at timestamptz,

  -- Admin rejection
  rejection_reason text,

  -- Completion
  completed_by uuid REFERENCES users(id),
  completed_at timestamptz,
  completion_evidence text,

  -- Stripe references
  stripe_invoice_id text,
  stripe_invoice_url text,
  stripe_payment_intent_id text,

  -- Timestamps
  invoiced_at timestamptz,
  paid_at timestamptz,
  overdue_at timestamptz,

  -- Overdue reminder deduplication
  overdue_reminder_sent_day1_at timestamptz,
  overdue_reminder_sent_day7_at timestamptz,
  overdue_reminder_sent_day14_at timestamptz,

  -- Ordering
  sort_order integer NOT NULL DEFAULT 100,

  -- Audit
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_fee_milestones_agreement ON fee_milestones(fee_agreement_id);
CREATE INDEX idx_fee_milestones_status ON fee_milestones(status);
