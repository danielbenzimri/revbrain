-- ============================================================
-- Assessment Extraction Tables — Supplementary DDL
-- ============================================================
-- This file contains constraints that Drizzle ORM 0.29 cannot express:
-- - Partial unique indexes
-- - State machine enforcement trigger
-- - Security definer function for token refresh
-- - RLS policies
--
-- Run AFTER Drizzle migrations. Idempotent (IF NOT EXISTS / OR REPLACE).
-- See: docs/CPQ-EXTRACTION-IMPLEMENTATION-PLAN.md Task 0.4
-- ============================================================

-- Prevent concurrent runs for same project
-- Includes 'stalled' because it's non-terminal (may be retried)
CREATE UNIQUE INDEX IF NOT EXISTS idx_one_active_run_per_project
  ON assessment_runs (project_id)
  WHERE status IN ('queued', 'dispatched', 'running', 'stalled', 'cancel_requested');

-- Idempotency key unique index
CREATE UNIQUE INDEX IF NOT EXISTS idx_assessment_runs_idempotency_key
  ON assessment_runs (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- Finding dedup via deterministic finding key
CREATE UNIQUE INDEX IF NOT EXISTS idx_findings_dedup
  ON assessment_findings (run_id, finding_key)
  WHERE detected = true;

-- Summary uniqueness (one per type + domain per run)
CREATE UNIQUE INDEX IF NOT EXISTS idx_summaries_unique
  ON assessment_summaries (run_id, summary_type, COALESCE(domain, '_global'));

-- ============================================================
-- State Machine Enforcement Trigger
-- ============================================================
-- Validates all status transitions. Terminal states cannot be changed.
-- Full transition matrix:
--   queued → dispatched, cancelled
--   dispatched → running, stalled, cancelled
--   running → completed, completed_warnings, failed, stalled, cancel_requested
--   stalled → queued, failed, cancelled
--   cancel_requested → cancelled, failed
--   completed, completed_warnings, failed, cancelled → (terminal)

CREATE OR REPLACE FUNCTION enforce_run_state_machine()
RETURNS TRIGGER AS $$
DECLARE
  valid_transitions JSONB := '{
    "queued": ["dispatched", "cancelled"],
    "dispatched": ["running", "stalled", "cancelled"],
    "running": ["completed", "completed_warnings", "failed", "stalled", "cancel_requested"],
    "stalled": ["queued", "failed", "cancelled"],
    "cancel_requested": ["cancelled", "failed"]
  }'::jsonb;
BEGIN
  -- Allow no-op updates (same status)
  IF OLD.status = NEW.status THEN RETURN NEW; END IF;

  -- Block transitions FROM terminal states
  IF OLD.status IN ('completed', 'completed_warnings', 'failed', 'cancelled') THEN
    RAISE EXCEPTION 'Cannot transition from terminal state %', OLD.status;
  END IF;

  -- Validate transition is in allowed list
  IF NOT (valid_transitions -> OLD.status) ? NEW.status THEN
    RAISE EXCEPTION 'Invalid state transition: % → %', OLD.status, NEW.status;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_run_state_machine ON assessment_runs;
CREATE TRIGGER trg_run_state_machine
BEFORE UPDATE OF status ON assessment_runs
FOR EACH ROW EXECUTE FUNCTION enforce_run_state_machine();

-- ============================================================
-- Security Definer Function: Token Refresh with Row-Level Scoping
-- ============================================================
-- Worker calls this instead of directly UPDATEing salesforce_connection_secrets.
-- Validates that the run actually references the given connection.
-- Uses optimistic locking on token_version.

CREATE OR REPLACE FUNCTION update_connection_tokens(
  p_run_id UUID,
  p_connection_id UUID,
  p_access_token BYTEA,
  p_refresh_token BYTEA,
  p_expected_token_version INT
) RETURNS INT AS $$
DECLARE
  rows_updated INT;
BEGIN
  -- Validate run references this connection
  IF NOT EXISTS (
    SELECT 1 FROM assessment_runs
    WHERE id = p_run_id AND connection_id = p_connection_id
  ) THEN
    RAISE EXCEPTION 'Run % does not reference connection %', p_run_id, p_connection_id;
  END IF;

  -- Update with optimistic locking
  UPDATE salesforce_connection_secrets
  SET
    encrypted_access_token = p_access_token,
    encrypted_refresh_token = p_refresh_token,
    token_version = token_version + 1,
    last_refresh_at = NOW(),
    updated_at = NOW()
  WHERE connection_id = p_connection_id
    AND token_version = p_expected_token_version;

  GET DIAGNOSTICS rows_updated = ROW_COUNT;
  RETURN rows_updated;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- Row-Level Security
-- ============================================================
ALTER TABLE assessment_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE run_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE collector_checkpoints ENABLE ROW LEVEL SECURITY;
ALTER TABLE assessment_findings ENABLE ROW LEVEL SECURITY;
ALTER TABLE assessment_relationships ENABLE ROW LEVEL SECURITY;
ALTER TABLE collector_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE assessment_summaries ENABLE ROW LEVEL SECURITY;

-- SELECT: users see only their org's data
-- assessment_runs + assessment_findings have denormalized organization_id for O(1) checks
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'org_read_runs') THEN
    CREATE POLICY org_read_runs ON assessment_runs
      FOR SELECT USING (organization_id = (auth.jwt() ->> 'organization_id')::uuid);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'org_read_findings') THEN
    CREATE POLICY org_read_findings ON assessment_findings
      FOR SELECT USING (organization_id = (auth.jwt() ->> 'organization_id')::uuid);
  END IF;
END $$;

-- UPDATE: users can only cancel runs in their org
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'org_cancel_runs') THEN
    CREATE POLICY org_cancel_runs ON assessment_runs
      FOR UPDATE USING (organization_id = (auth.jwt() ->> 'organization_id')::uuid)
      WITH CHECK (status IN ('cancel_requested', 'cancelled'));
  END IF;
END $$;

-- Child tables: subquery through parent (infrequently queried directly)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'org_read_attempts') THEN
    CREATE POLICY org_read_attempts ON run_attempts
      FOR SELECT USING (run_id IN (
        SELECT id FROM assessment_runs
        WHERE organization_id = (auth.jwt() ->> 'organization_id')::uuid));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'org_read_checkpoints') THEN
    CREATE POLICY org_read_checkpoints ON collector_checkpoints
      FOR SELECT USING (run_id IN (
        SELECT id FROM assessment_runs
        WHERE organization_id = (auth.jwt() ->> 'organization_id')::uuid));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'org_read_relationships') THEN
    CREATE POLICY org_read_relationships ON assessment_relationships
      FOR SELECT USING (run_id IN (
        SELECT id FROM assessment_runs
        WHERE organization_id = (auth.jwt() ->> 'organization_id')::uuid));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'org_read_metrics') THEN
    CREATE POLICY org_read_metrics ON collector_metrics
      FOR SELECT USING (run_id IN (
        SELECT id FROM assessment_runs
        WHERE organization_id = (auth.jwt() ->> 'organization_id')::uuid));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'org_read_summaries') THEN
    CREATE POLICY org_read_summaries ON assessment_summaries
      FOR SELECT USING (run_id IN (
        SELECT id FROM assessment_runs
        WHERE organization_id = (auth.jwt() ->> 'organization_id')::uuid));
  END IF;
END $$;
