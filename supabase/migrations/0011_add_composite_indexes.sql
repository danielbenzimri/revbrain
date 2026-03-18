-- Migration: Add Composite Indexes
-- Session 03 CP3: Database Optimization
--
-- Composite indexes for common multi-column query patterns.
-- Column order matters: put high-selectivity and equality columns first.

-- ============================================================================
-- USERS TABLE COMPOSITE INDEXES
-- ============================================================================

-- Composite: organization + is_active
-- Optimizes: "Find all active users in organization X"
-- Very common in org admin dashboards and seat counting
CREATE INDEX IF NOT EXISTS "idx_users_org_active"
  ON "users" ("organization_id", "is_active");

-- Composite: organization + role
-- Optimizes: "Find all users with role Y in organization X"
-- Common for permission checks and role-based filtering
CREATE INDEX IF NOT EXISTS "idx_users_org_role"
  ON "users" ("organization_id", "role");

-- ============================================================================
-- AUDIT_LOGS TABLE COMPOSITE INDEXES
-- ============================================================================

-- Composite: organization + created_at
-- Optimizes: "Get recent audit logs for organization X"
-- Critical for org audit trail queries (most common audit query)
CREATE INDEX IF NOT EXISTS "idx_audit_logs_org_created"
  ON "audit_logs" ("organization_id", "created_at" DESC);

-- Composite: user + created_at
-- Optimizes: "Get recent activity for user X"
-- Common for user activity feeds
CREATE INDEX IF NOT EXISTS "idx_audit_logs_user_created"
  ON "audit_logs" ("user_id", "created_at" DESC);

-- Composite: action + created_at
-- Optimizes: "Get recent events of type X" (e.g., all recent logins)
-- Useful for security monitoring
CREATE INDEX IF NOT EXISTS "idx_audit_logs_action_created"
  ON "audit_logs" ("action", "created_at" DESC);

-- ============================================================================
-- PLANS TABLE COMPOSITE INDEXES
-- ============================================================================

-- Composite: is_active + is_public
-- Optimizes: "Find all active public plans" (signup page)
-- Small table but frequently queried pattern
CREATE INDEX IF NOT EXISTS "idx_plans_active_public"
  ON "plans" ("is_active", "is_public");
