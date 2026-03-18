-- Migration: Add Filter Column Indexes
-- Session 03 CP2: Database Optimization
--
-- Indexes on columns frequently used in WHERE clauses.
-- Boolean and enum-like columns benefit from partial indexes in high-cardinality scenarios,
-- but standard B-tree indexes work well for our expected data volumes.

-- ============================================================================
-- USERS TABLE FILTER INDEXES
-- ============================================================================

-- Index on role for:
-- - Filtering users by role (admin queries)
-- - Role-based access control checks
CREATE INDEX IF NOT EXISTS "idx_users_role"
  ON "users" ("role");

-- Index on is_active for:
-- - Filtering active/inactive users
-- - Login eligibility checks
CREATE INDEX IF NOT EXISTS "idx_users_is_active"
  ON "users" ("is_active");

-- Index on is_org_admin for:
-- - Finding organization administrators
-- - Permission checks
CREATE INDEX IF NOT EXISTS "idx_users_is_org_admin"
  ON "users" ("is_org_admin");

-- ============================================================================
-- ORGANIZATIONS TABLE FILTER INDEXES
-- ============================================================================

-- Index on is_active for:
-- - Filtering active organizations
-- - Subscription status checks
CREATE INDEX IF NOT EXISTS "idx_organizations_is_active"
  ON "organizations" ("is_active");

-- Index on type for:
-- - Filtering by organization type (contractor/client)
-- - Type-specific queries
CREATE INDEX IF NOT EXISTS "idx_organizations_type"
  ON "organizations" ("type");

-- ============================================================================
-- PLANS TABLE FILTER INDEXES
-- ============================================================================

-- Index on is_active for:
-- - Filtering active plans
-- - Plan selection UI
CREATE INDEX IF NOT EXISTS "idx_plans_is_active"
  ON "plans" ("is_active");

-- Index on is_public for:
-- - Filtering public plans (for signup page)
-- - Plan visibility queries
CREATE INDEX IF NOT EXISTS "idx_plans_is_public"
  ON "plans" ("is_public");

-- ============================================================================
-- AUDIT_LOGS TABLE FILTER INDEXES
-- ============================================================================

-- Index on action for:
-- - Filtering by action type
-- - Security event queries (e.g., all logins)
CREATE INDEX IF NOT EXISTS "idx_audit_logs_action"
  ON "audit_logs" ("action");

-- Index on created_at for:
-- - Time-range queries
-- - Recent activity views
-- - Audit log pagination
CREATE INDEX IF NOT EXISTS "idx_audit_logs_created_at"
  ON "audit_logs" ("created_at" DESC);
