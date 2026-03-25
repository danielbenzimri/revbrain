-- ============================================================
-- Dedicated DB Role for Extraction Worker
-- ============================================================
-- Least-privilege role for the CPQ extraction worker.
-- Uses direct connections (not PgBouncer) because custom roles
-- can't authenticate through Supabase's connection pooler.
--
-- Connection limit: 6 per worker (5 main + 1 heartbeat).
-- Max ~10 concurrent workers on Supabase Pro (60 direct connection limit).
--
-- See: docs/CPQ-EXTRACTION-IMPLEMENTATION-PLAN.md Task 0.5
-- ============================================================

-- Create role (idempotent)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'extractor_worker') THEN
    CREATE ROLE extractor_worker LOGIN PASSWORD 'CHANGE_ME_IN_SECRET_MANAGER';
  END IF;
END $$;

-- ============================================================
-- Assessment extraction tables: full CRUD
-- ============================================================
GRANT SELECT, INSERT, UPDATE, DELETE ON assessment_runs TO extractor_worker;
GRANT SELECT, INSERT, UPDATE, DELETE ON run_attempts TO extractor_worker;
GRANT SELECT, INSERT, UPDATE, DELETE ON collector_checkpoints TO extractor_worker;
GRANT SELECT, INSERT, UPDATE, DELETE ON assessment_findings TO extractor_worker;
GRANT SELECT, INSERT, UPDATE, DELETE ON assessment_relationships TO extractor_worker;
GRANT SELECT, INSERT, UPDATE, DELETE ON collector_metrics TO extractor_worker;
GRANT SELECT, INSERT, UPDATE, DELETE ON assessment_summaries TO extractor_worker;

-- ============================================================
-- Salesforce connection tables: read-only + security definer
-- ============================================================
GRANT SELECT ON salesforce_connections TO extractor_worker;
GRANT SELECT ON salesforce_connection_secrets TO extractor_worker;
-- No direct UPDATE on secrets — token refresh uses security definer function
GRANT EXECUTE ON FUNCTION update_connection_tokens(UUID, UUID, BYTEA, BYTEA, INT) TO extractor_worker;

-- ============================================================
-- Project table: read-only (for run config)
-- ============================================================
GRANT SELECT ON projects TO extractor_worker;

-- ============================================================
-- Explicitly DENY access to sensitive tables
-- (PostgreSQL denies by default, but being explicit for documentation)
-- ============================================================
-- extractor_worker has NO access to:
--   users, organizations, plans, subscriptions, payment_history,
--   billing_events, coupons, audit_logs, admin_notifications,
--   oauth_pending_flows, salesforce_connection_logs
-- These are not granted, so access is denied by default.

-- ============================================================
-- SSL requirement note
-- ============================================================
-- The worker's DATABASE_URL must use sslmode=require:
--   postgresql://extractor_worker:PASSWORD@HOST:PORT/postgres?sslmode=require
-- This is enforced in the worker's config.ts, not in the DB role.
