-- Webhook Retry Tracking
--
-- Adds retry tracking columns to billing_events for exponential backoff
-- retry mechanism. This allows us to properly handle transient failures
-- and implement our own retry logic.

-- Add retry tracking columns
ALTER TABLE billing_events
ADD COLUMN retry_count INTEGER NOT NULL DEFAULT 0,
ADD COLUMN next_retry_at TIMESTAMPTZ,
ADD COLUMN max_retries INTEGER NOT NULL DEFAULT 5,
ADD COLUMN last_error TEXT;

-- Index for finding events that need retry
CREATE INDEX idx_billing_events_pending_retry
ON billing_events (next_retry_at)
WHERE next_retry_at IS NOT NULL
  AND processed_at IS NULL
  AND retry_count < max_retries;

-- Index for finding failed events
CREATE INDEX idx_billing_events_failed
ON billing_events (created_at)
WHERE error IS NOT NULL;

-- Comment on new columns
COMMENT ON COLUMN billing_events.retry_count IS 'Number of retry attempts made';
COMMENT ON COLUMN billing_events.next_retry_at IS 'When to attempt next retry (exponential backoff)';
COMMENT ON COLUMN billing_events.max_retries IS 'Maximum number of retries before giving up';
COMMENT ON COLUMN billing_events.last_error IS 'Error from the most recent attempt';
