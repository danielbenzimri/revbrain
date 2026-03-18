-- Migration: Add Performance Indexes
-- Session 03 CP1: Database Optimization
--
-- PostgreSQL does NOT auto-create indexes on foreign key columns.
-- These indexes are critical for:
-- 1. JOIN performance (e.g., fetching users with their org)
-- 2. Foreign key constraint checks on UPDATE/DELETE
-- 3. Common query patterns in the application

-- ============================================================================
-- USERS TABLE INDEXES
-- ============================================================================

-- Index on organization_id for:
-- - Finding all users in an organization (very common)
-- - JOIN users with organizations
CREATE INDEX IF NOT EXISTS "idx_users_organization_id"
  ON "users" ("organization_id");

-- Index on invited_by for:
-- - Finding who invited a user
-- - Cascade operations on user deletion
CREATE INDEX IF NOT EXISTS "idx_users_invited_by"
  ON "users" ("invited_by");

-- ============================================================================
-- AUDIT_LOGS TABLE INDEXES
-- ============================================================================

-- Index on user_id for:
-- - Finding all actions by a user
-- - User activity reports
CREATE INDEX IF NOT EXISTS "idx_audit_logs_user_id"
  ON "audit_logs" ("user_id");

-- Index on organization_id for:
-- - Finding all actions in an organization
-- - Organization audit trails
CREATE INDEX IF NOT EXISTS "idx_audit_logs_organization_id"
  ON "audit_logs" ("organization_id");

-- Index on target_user_id for:
-- - Finding all actions targeting a specific user
-- - User-centric audit views
CREATE INDEX IF NOT EXISTS "idx_audit_logs_target_user_id"
  ON "audit_logs" ("target_user_id");

-- ============================================================================
-- PROJECTS TABLE INDEXES
-- ============================================================================

-- Index on owner_id for:
-- - Finding all projects owned by a user
-- - Dashboard queries
CREATE INDEX IF NOT EXISTS "idx_projects_owner_id"
  ON "projects" ("owner_id");

-- ============================================================================
-- ORGANIZATIONS TABLE INDEXES
-- ============================================================================

-- Index on plan_id for:
-- - Finding all organizations on a specific plan
-- - Plan usage analytics
CREATE INDEX IF NOT EXISTS "idx_organizations_plan_id"
  ON "organizations" ("plan_id");
