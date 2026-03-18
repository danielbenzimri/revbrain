-- Migration: Add cron job tracking fields to subscriptions
-- Purpose: Track when trial notification emails have been sent

-- Add tracking columns for trial notification emails
ALTER TABLE subscriptions
ADD COLUMN IF NOT EXISTS trial_ending_notified_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS trial_ended_notified_at TIMESTAMPTZ;

-- Add index for efficient cron job queries
-- Finds trialing subscriptions that need notification
CREATE INDEX IF NOT EXISTS idx_subscriptions_trial_cron
ON subscriptions (status, trial_end)
WHERE status = 'trialing';

-- Comment for documentation
COMMENT ON COLUMN subscriptions.trial_ending_notified_at IS 'Timestamp when "trial ending" email was sent (3 days before trial end)';
COMMENT ON COLUMN subscriptions.trial_ended_notified_at IS 'Timestamp when "trial ended" email was sent (after trial expiration)';
