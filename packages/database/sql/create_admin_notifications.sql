-- Admin Notifications Table
-- Run this against the staging DB to create the table.
-- This avoids drizzle-kit push (interactive).

CREATE TABLE IF NOT EXISTS admin_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type VARCHAR(50) NOT NULL,
  severity VARCHAR(20) NOT NULL,
  title VARCHAR(200) NOT NULL,
  message TEXT NOT NULL,
  metadata JSONB,
  is_read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for fast lookups by admin user + read status
CREATE INDEX IF NOT EXISTS idx_admin_notifications_user_read
  ON admin_notifications(admin_user_id, is_read);

-- Index for dedup lookups by type + entity
CREATE INDEX IF NOT EXISTS idx_admin_notifications_type_created
  ON admin_notifications(type, created_at DESC);
