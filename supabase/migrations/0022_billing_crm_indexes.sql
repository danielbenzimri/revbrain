-- Migration: Add Indexes for Billing and CRM Tables
-- Iteration 10: Performance optimization for newer tables
--
-- These indexes cover tables added in recent migrations:
-- - subscriptions
-- - payment_history
-- - billing_events
-- - coupons
-- - coupon_usages
-- - leads
-- - lead_activities

-- ============================================================================
-- SUBSCRIPTIONS TABLE INDEXES
-- ============================================================================

-- Index on plan_id for:
-- - JOIN subscriptions to plans
-- - Finding all subscriptions on a specific plan
CREATE INDEX IF NOT EXISTS "idx_subscriptions_plan_id"
  ON "subscriptions" ("plan_id");

-- Index on status for:
-- - Filtering by subscription status (active, trialing, past_due, etc.)
-- - Dashboard metrics
CREATE INDEX IF NOT EXISTS "idx_subscriptions_status"
  ON "subscriptions" ("status");

-- Index on trial_end for:
-- - Cron job: finding subscriptions with trials ending soon
-- - Trial expiration checks
CREATE INDEX IF NOT EXISTS "idx_subscriptions_trial_end"
  ON "subscriptions" ("trial_end");

-- Composite: status + trial_end
-- Optimizes: "Find trialing subscriptions ending before date X"
-- Critical for trial notification cron jobs
CREATE INDEX IF NOT EXISTS "idx_subscriptions_status_trial_end"
  ON "subscriptions" ("status", "trial_end");

-- ============================================================================
-- PAYMENT_HISTORY TABLE INDEXES
-- ============================================================================

-- Index on organization_id for:
-- - JOIN payments to organizations
-- - Finding all payments for an organization
CREATE INDEX IF NOT EXISTS "idx_payment_history_organization_id"
  ON "payment_history" ("organization_id");

-- Index on status for:
-- - Filtering by payment status (succeeded, failed, refunded)
-- - Failed payment reports
CREATE INDEX IF NOT EXISTS "idx_payment_history_status"
  ON "payment_history" ("status");

-- Index on created_at for:
-- - Recent payments queries
-- - Billing page pagination
CREATE INDEX IF NOT EXISTS "idx_payment_history_created_at"
  ON "payment_history" ("created_at" DESC);

-- Composite: organization_id + created_at
-- Optimizes: "Get recent payments for organization X"
CREATE INDEX IF NOT EXISTS "idx_payment_history_org_created"
  ON "payment_history" ("organization_id", "created_at" DESC);

-- ============================================================================
-- BILLING_EVENTS TABLE INDEXES
-- ============================================================================

-- Index on event_type for:
-- - Filtering webhook events by type
-- - Debugging specific event types
CREATE INDEX IF NOT EXISTS "idx_billing_events_event_type"
  ON "billing_events" ("event_type");

-- Index on created_at for:
-- - Recent webhook events
-- - Debug queries
CREATE INDEX IF NOT EXISTS "idx_billing_events_created_at"
  ON "billing_events" ("created_at" DESC);

-- Index on processed_at for:
-- - Finding unprocessed events (NULL processed_at)
-- - Retry logic
CREATE INDEX IF NOT EXISTS "idx_billing_events_processed_at"
  ON "billing_events" ("processed_at");

-- ============================================================================
-- COUPONS TABLE INDEXES
-- ============================================================================

-- Index on is_active for:
-- - Filtering active coupons
-- - Admin coupon list
CREATE INDEX IF NOT EXISTS "idx_coupons_is_active"
  ON "coupons" ("is_active");

-- Index on valid_until for:
-- - Finding expired coupons
-- - Cleanup jobs
CREATE INDEX IF NOT EXISTS "idx_coupons_valid_until"
  ON "coupons" ("valid_until");

-- Composite: is_active + valid_until
-- Optimizes: "Find active, non-expired coupons"
CREATE INDEX IF NOT EXISTS "idx_coupons_active_valid"
  ON "coupons" ("is_active", "valid_until");

-- ============================================================================
-- COUPON_USAGES TABLE INDEXES
-- ============================================================================

-- Index on coupon_id for:
-- - JOIN usages to coupons
-- - Finding all uses of a coupon
CREATE INDEX IF NOT EXISTS "idx_coupon_usages_coupon_id"
  ON "coupon_usages" ("coupon_id");

-- Index on organization_id for:
-- - JOIN usages to organizations
-- - Finding coupons used by an organization
CREATE INDEX IF NOT EXISTS "idx_coupon_usages_organization_id"
  ON "coupon_usages" ("organization_id");

-- Index on user_id for:
-- - JOIN usages to users
-- - Per-user usage limits
CREATE INDEX IF NOT EXISTS "idx_coupon_usages_user_id"
  ON "coupon_usages" ("user_id");

-- ============================================================================
-- LEADS TABLE INDEXES
-- ============================================================================

-- Index on status for:
-- - Pipeline stage filtering
-- - CRM dashboard queries
CREATE INDEX IF NOT EXISTS "idx_leads_status"
  ON "leads" ("status");

-- Index on assigned_to for:
-- - Finding leads assigned to a sales rep
-- - Workload distribution
CREATE INDEX IF NOT EXISTS "idx_leads_assigned_to"
  ON "leads" ("assigned_to");

-- Index on contact_email for:
-- - Duplicate lead detection
-- - Lead lookup by email
CREATE INDEX IF NOT EXISTS "idx_leads_contact_email"
  ON "leads" ("contact_email");

-- Index on created_at for:
-- - Recent leads queries
-- - Lead list pagination
CREATE INDEX IF NOT EXISTS "idx_leads_created_at"
  ON "leads" ("created_at" DESC);

-- Index on next_follow_up_at for:
-- - Follow-up reminder queries
-- - Sales task prioritization
CREATE INDEX IF NOT EXISTS "idx_leads_next_follow_up_at"
  ON "leads" ("next_follow_up_at");

-- Composite: status + created_at
-- Optimizes: "Get recent leads in pipeline stage X"
CREATE INDEX IF NOT EXISTS "idx_leads_status_created"
  ON "leads" ("status", "created_at" DESC);

-- Composite: assigned_to + status
-- Optimizes: "Get all open leads for sales rep X"
CREATE INDEX IF NOT EXISTS "idx_leads_assigned_status"
  ON "leads" ("assigned_to", "status");

-- ============================================================================
-- LEAD_ACTIVITIES TABLE INDEXES
-- ============================================================================

-- Index on lead_id for:
-- - JOIN activities to leads
-- - Activity timeline queries
CREATE INDEX IF NOT EXISTS "idx_lead_activities_lead_id"
  ON "lead_activities" ("lead_id");

-- Index on created_by for:
-- - Finding activities by a user
-- - Activity attribution
CREATE INDEX IF NOT EXISTS "idx_lead_activities_created_by"
  ON "lead_activities" ("created_by");

-- Index on activity_type for:
-- - Filtering by activity type
-- - Activity analytics
CREATE INDEX IF NOT EXISTS "idx_lead_activities_activity_type"
  ON "lead_activities" ("activity_type");

-- Index on created_at for:
-- - Recent activities
-- - Timeline ordering
CREATE INDEX IF NOT EXISTS "idx_lead_activities_created_at"
  ON "lead_activities" ("created_at" DESC);

-- Composite: lead_id + created_at
-- Optimizes: "Get activity timeline for lead X"
CREATE INDEX IF NOT EXISTS "idx_lead_activities_lead_created"
  ON "lead_activities" ("lead_id", "created_at" DESC);
