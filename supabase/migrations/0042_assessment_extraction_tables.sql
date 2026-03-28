-- ============================================================
-- Salesforce Connection + Assessment Extraction Tables
-- ============================================================
-- Prerequisites: salesforce_connections, salesforce_connection_secrets, oauth_pending_flows
-- Main: 7 assessment tables for the CPQ extraction worker + assessment API.
-- Includes: state machine trigger, partial indexes, security definer, RLS.
--
-- See: docs/CPQ-EXTRACTION-IMPLEMENTATION-PLAN.md Task 0.4 + 13.1
-- Schema source: packages/database/src/schema.ts
-- ============================================================

-- 0a. Salesforce Connections (prerequisite for assessment_runs FK)
CREATE TABLE IF NOT EXISTS salesforce_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  connection_role VARCHAR(10) NOT NULL DEFAULT 'source',
  salesforce_org_id VARCHAR(18) NOT NULL,
  salesforce_instance_url TEXT NOT NULL,
  custom_login_url TEXT,
  oauth_base_url TEXT NOT NULL,
  salesforce_user_id VARCHAR(18),
  salesforce_username TEXT,
  instance_type VARCHAR(10) NOT NULL,
  api_version VARCHAR(10),
  connection_metadata JSONB,
  status VARCHAR(30) NOT NULL DEFAULT 'active',
  last_used_at TIMESTAMPTZ,
  last_successful_api_call_at TIMESTAMPTZ,
  last_error TEXT,
  last_error_at TIMESTAMPTZ,
  connected_by UUID REFERENCES users(id),
  disconnected_by UUID REFERENCES users(id),
  disconnected_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT sf_conn_project_role_unique UNIQUE (project_id, connection_role)
);

CREATE INDEX IF NOT EXISTS idx_sf_connections_org ON salesforce_connections (organization_id);
CREATE INDEX IF NOT EXISTS idx_sf_connections_status ON salesforce_connections (status);
CREATE INDEX IF NOT EXISTS idx_sf_connections_sf_org ON salesforce_connections (salesforce_org_id);

-- 0b. Salesforce Connection Secrets (encrypted tokens)
CREATE TABLE IF NOT EXISTS salesforce_connection_secrets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id UUID NOT NULL UNIQUE REFERENCES salesforce_connections(id) ON DELETE CASCADE,
  encrypted_access_token BYTEA NOT NULL,
  encrypted_refresh_token BYTEA NOT NULL,
  encryption_key_version INT NOT NULL DEFAULT 1,
  token_version INT NOT NULL DEFAULT 1,
  token_issued_at TIMESTAMPTZ,
  token_scopes TEXT,
  last_refresh_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 0c. OAuth Pending Flows (PKCE state for OAuth)
CREATE TABLE IF NOT EXISTS oauth_pending_flows (
  nonce UUID PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES projects(id),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  user_id UUID NOT NULL REFERENCES users(id),
  connection_role VARCHAR(10) NOT NULL,
  code_verifier TEXT NOT NULL,
  oauth_base_url TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_oauth_pending_project_role
  ON oauth_pending_flows (project_id, connection_role);

-- 0d. Salesforce Connection Logs
CREATE TABLE IF NOT EXISTS salesforce_connection_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id UUID NOT NULL REFERENCES salesforce_connections(id) ON DELETE CASCADE,
  event_type VARCHAR(50) NOT NULL,
  event_data JSONB DEFAULT '{}',
  performed_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sf_conn_logs_connection ON salesforce_connection_logs (connection_id, created_at);

-- ============================================================
-- Assessment Tables
-- ============================================================

-- 1. assessment_runs — Main run record with state machine + lease model
CREATE TABLE IF NOT EXISTS assessment_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  connection_id UUID NOT NULL REFERENCES salesforce_connections(id) ON DELETE RESTRICT,

  -- State machine
  status VARCHAR(30) NOT NULL DEFAULT 'queued',
  status_reason TEXT,

  -- Scope & config
  scope JSONB,
  mode VARCHAR(20) NOT NULL DEFAULT 'full',
  disabled_collectors JSONB DEFAULT '[]',
  raw_snapshot_mode VARCHAR(20) NOT NULL DEFAULT 'errors_only',

  -- Progress (updated with heartbeat)
  progress JSONB DEFAULT '{}',
  org_fingerprint JSONB,
  normalization_status VARCHAR(20) DEFAULT 'pending',

  -- Lease model
  worker_id TEXT,
  lease_expires_at TIMESTAMPTZ,
  last_heartbeat_at TIMESTAMPTZ,

  -- Provider tracking
  provider_execution_id TEXT,

  -- Versioning / provenance
  spec_version TEXT,
  worker_version TEXT,

  -- Retry
  retry_count INT NOT NULL DEFAULT 0,
  max_retries INT NOT NULL DEFAULT 2,

  -- Idempotency
  idempotency_key VARCHAR(64),

  -- Lifecycle timestamps
  dispatched_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  cancel_requested_at TIMESTAMPTZ,

  -- Metrics
  duration_ms INT,
  api_calls_used INT DEFAULT 0,
  records_extracted INT DEFAULT 0,
  completeness_pct INT DEFAULT 0,

  -- Audit
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  error TEXT
);

CREATE INDEX IF NOT EXISTS idx_runs_project ON assessment_runs (project_id, created_at);
CREATE INDEX IF NOT EXISTS idx_runs_lease ON assessment_runs (status, lease_expires_at);

-- 2. run_attempts — Execution history per attempt
CREATE TABLE IF NOT EXISTS run_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES assessment_runs(id) ON DELETE CASCADE,
  attempt_no INT NOT NULL DEFAULT 1,
  worker_id TEXT,
  provider_execution_id TEXT,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  exit_code INT,
  exit_reason TEXT,
  infra_details JSONB,
  UNIQUE (run_id, attempt_no)
);

-- 3. collector_checkpoints — Substep resume state
CREATE TABLE IF NOT EXISTS collector_checkpoints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES assessment_runs(id) ON DELETE CASCADE,
  collector_name TEXT NOT NULL,
  criticality VARCHAR(10) NOT NULL DEFAULT 'tier1',
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  attempt_no INT NOT NULL DEFAULT 1,
  phase TEXT,
  substep TEXT,
  cursor_json JSONB,
  bulk_job_ids JSONB DEFAULT '[]',
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  records_extracted INT DEFAULT 0,
  warnings JSONB DEFAULT '[]',
  error TEXT,
  retry_count INT DEFAULT 0,
  UNIQUE (run_id, collector_name)
);

-- 4. assessment_findings — Extracted findings with LLM-readiness
CREATE TABLE IF NOT EXISTS assessment_findings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES assessment_runs(id) ON DELETE CASCADE,
  domain TEXT NOT NULL,
  collector_name TEXT NOT NULL,
  artifact_type TEXT NOT NULL,
  artifact_name TEXT NOT NULL,
  artifact_id TEXT,
  finding_key TEXT NOT NULL,
  source_type TEXT NOT NULL,
  source_ref TEXT,
  detected BOOLEAN DEFAULT true,
  count_value INT,
  text_value TEXT, -- Verbatim source for LLM (QCP, Apex, formulas, etc.)
  usage_level TEXT,
  risk_level TEXT,
  complexity_level TEXT,
  migration_relevance TEXT,
  rca_target_concept TEXT,
  rca_mapping_complexity TEXT,
  evidence_refs JSONB DEFAULT '[]', -- Array of EvidenceRef objects
  notes TEXT,
  organization_id UUID NOT NULL REFERENCES organizations(id),
  schema_version TEXT DEFAULT '1.0',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_findings_run ON assessment_findings (run_id);
CREATE INDEX IF NOT EXISTS idx_findings_domain ON assessment_findings (run_id, domain);
CREATE INDEX IF NOT EXISTS idx_findings_collector ON assessment_findings (run_id, collector_name);

-- 5. assessment_relationships — Dependency graph edges
CREATE TABLE IF NOT EXISTS assessment_relationships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES assessment_runs(id) ON DELETE CASCADE,
  source_finding_id UUID NOT NULL REFERENCES assessment_findings(id) ON DELETE CASCADE,
  target_finding_id UUID NOT NULL REFERENCES assessment_findings(id) ON DELETE CASCADE,
  relationship_type TEXT NOT NULL,
  description TEXT
);

CREATE INDEX IF NOT EXISTS idx_rel_source ON assessment_relationships (source_finding_id);
CREATE INDEX IF NOT EXISTS idx_rel_target ON assessment_relationships (target_finding_id);
CREATE INDEX IF NOT EXISTS idx_rel_run ON assessment_relationships (run_id);

-- 6. collector_metrics — Per-collector metrics
CREATE TABLE IF NOT EXISTS collector_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES assessment_runs(id) ON DELETE CASCADE,
  collector_name TEXT NOT NULL,
  domain TEXT NOT NULL,
  metrics JSONB NOT NULL DEFAULT '{}',
  warnings JSONB DEFAULT '[]',
  coverage INT DEFAULT 0,
  collected_at TIMESTAMPTZ DEFAULT NOW(),
  duration_ms INT,
  schema_version TEXT DEFAULT '1.0',
  UNIQUE (run_id, collector_name)
);

-- 7. assessment_summaries — Structured summaries
CREATE TABLE IF NOT EXISTS assessment_summaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES assessment_runs(id) ON DELETE CASCADE,
  summary_type TEXT NOT NULL,
  domain TEXT,
  content JSONB NOT NULL,
  schema_version TEXT DEFAULT '1.0',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_summaries_run ON assessment_summaries (run_id, summary_type);

-- ============================================================
-- Partial Unique Indexes
-- ============================================================

-- Prevent concurrent runs for same project (includes stalled — non-terminal)
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
  IF OLD.status = NEW.status THEN RETURN NEW; END IF;

  IF OLD.status IN ('completed', 'completed_warnings', 'failed', 'cancelled') THEN
    RAISE EXCEPTION 'Cannot transition from terminal state %', OLD.status;
  END IF;

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
-- Security Definer Function: Token Refresh
-- ============================================================

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
  IF NOT EXISTS (
    SELECT 1 FROM assessment_runs
    WHERE id = p_run_id AND connection_id = p_connection_id
  ) THEN
    RAISE EXCEPTION 'Run % does not reference connection %', p_run_id, p_connection_id;
  END IF;

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

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'org_cancel_runs') THEN
    CREATE POLICY org_cancel_runs ON assessment_runs
      FOR UPDATE USING (organization_id = (auth.jwt() ->> 'organization_id')::uuid)
      WITH CHECK (status IN ('cancel_requested', 'cancelled'));
  END IF;
END $$;

-- Child tables: subquery through parent
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

-- Service role bypass (for server API + worker)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'service_all_runs') THEN
    CREATE POLICY service_all_runs ON assessment_runs
      FOR ALL USING (auth.role() = 'service_role');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'service_all_findings') THEN
    CREATE POLICY service_all_findings ON assessment_findings
      FOR ALL USING (auth.role() = 'service_role');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'service_all_attempts') THEN
    CREATE POLICY service_all_attempts ON run_attempts
      FOR ALL USING (auth.role() = 'service_role');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'service_all_checkpoints') THEN
    CREATE POLICY service_all_checkpoints ON collector_checkpoints
      FOR ALL USING (auth.role() = 'service_role');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'service_all_relationships') THEN
    CREATE POLICY service_all_relationships ON assessment_relationships
      FOR ALL USING (auth.role() = 'service_role');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'service_all_metrics') THEN
    CREATE POLICY service_all_metrics ON collector_metrics
      FOR ALL USING (auth.role() = 'service_role');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'service_all_summaries') THEN
    CREATE POLICY service_all_summaries ON assessment_summaries
      FOR ALL USING (auth.role() = 'service_role');
  END IF;
END $$;
