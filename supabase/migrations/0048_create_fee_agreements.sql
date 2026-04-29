-- Create fee_agreements table for SI billing
-- Core billing entity: two-phase model (assessment + migration)
-- Each project can have multiple versions via amendments

CREATE TABLE fee_agreements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Link to project
  project_id uuid NOT NULL REFERENCES projects(id),

  -- Amendment chain (self-referential)
  supersedes_agreement_id uuid REFERENCES fee_agreements(id),
  version integer NOT NULL DEFAULT 1,

  -- Lifecycle status
  status varchar(30) NOT NULL DEFAULT 'draft',

  -- Assessment fee (flat, IS the floor)
  assessment_fee bigint NOT NULL,

  -- Migration-phase fields (nullable until migration transition)
  declared_project_value bigint,
  cap_amount bigint,
  calculated_total_fee bigint,
  calculated_remaining_fee bigint,

  -- Amendment credit carry-forward
  carried_credit_amount bigint NOT NULL DEFAULT 0,
  carried_credit_source_agreement_id uuid REFERENCES fee_agreements(id),

  -- Payment terms
  payment_terms varchar(20) NOT NULL DEFAULT 'net_30',
  currency varchar(3) NOT NULL DEFAULT 'usd',

  -- Created by (admin)
  created_by uuid REFERENCES users(id),

  -- Assessment acceptance
  assessment_terms_snapshot jsonb,
  assessment_terms_snapshot_hash text,
  accepted_by uuid REFERENCES users(id),
  accepted_at timestamptz,
  accepted_from_ip text,

  -- SOW (uploaded at migration transition)
  sow_file_id text,

  -- Migration acceptance
  migration_terms_snapshot jsonb,
  migration_terms_snapshot_hash text,
  migration_accepted_by uuid REFERENCES users(id),
  migration_accepted_at timestamptz,
  migration_accepted_from_ip text,

  -- Assessment-only closure
  assessment_close_reason varchar(30),
  assessment_close_notes text,

  -- Cancellation
  cancelled_by uuid REFERENCES users(id),
  cancellation_reason text,
  cancelled_at timestamptz,

  -- Completion
  completed_at timestamptz,

  -- Audit
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  -- CHECK constraints (billing correctness)
  CONSTRAINT chk_assessment_fee_positive CHECK (assessment_fee > 0),
  CONSTRAINT chk_cap_gte_assessment CHECK (cap_amount IS NULL OR cap_amount >= assessment_fee),
  CONSTRAINT chk_declared_value_positive CHECK (declared_project_value IS NULL OR declared_project_value > 0),
  CONSTRAINT chk_carried_credit_nonneg CHECK (carried_credit_amount >= 0)
);

-- Indexes
CREATE INDEX idx_fee_agreements_project ON fee_agreements(project_id);
CREATE INDEX idx_fee_agreements_status ON fee_agreements(status);
