-- Performance indexes for hot query patterns
-- Task 3.4: Add missing composite indexes identified via query pattern analysis
--
-- Approach: Using regular CREATE INDEX (not CONCURRENTLY) with IF NOT EXISTS
-- since CONCURRENTLY cannot run inside Supabase migration transactions.
-- Run during low-traffic window to minimize lock contention.

-- Support tickets: filter by user + status (ticket list page, admin dashboard)
-- Existing: idx_support_tickets_user (user_id), idx_support_tickets_status (status)
-- Missing: composite for WHERE user_id = ? AND status = ? queries
SET LOCAL lock_timeout = '5s';
CREATE INDEX IF NOT EXISTS idx_support_tickets_user_status
  ON support_tickets (user_id, status);

