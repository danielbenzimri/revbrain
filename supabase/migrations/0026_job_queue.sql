-- ============================================================================
-- Background Job Queue
-- Simple database-backed job queue for async processing (emails, etc.)
-- ============================================================================

-- Job status enum
CREATE TYPE job_status AS ENUM ('pending', 'processing', 'completed', 'failed', 'dead');

-- Job queue table
CREATE TABLE IF NOT EXISTS job_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Job identification
  type VARCHAR(100) NOT NULL,  -- 'email', 'webhook', 'report', etc.

  -- Job data (JSON payload)
  payload JSONB NOT NULL DEFAULT '{}',

  -- Execution status
  status job_status NOT NULL DEFAULT 'pending',
  priority INTEGER NOT NULL DEFAULT 0,  -- Higher = more urgent

  -- Retry handling
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 3,
  last_error TEXT,

  -- Scheduling
  scheduled_at TIMESTAMPTZ NOT NULL DEFAULT now(),  -- When to run
  locked_until TIMESTAMPTZ,  -- For distributed locking
  locked_by VARCHAR(100),    -- Worker ID that locked the job

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,

  -- Optional context
  organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,

  -- Metadata for debugging/auditing
  metadata JSONB DEFAULT '{}'
);

-- Indexes for efficient job fetching
CREATE INDEX IF NOT EXISTS idx_job_queue_status_scheduled
  ON job_queue(status, scheduled_at)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_job_queue_type_status
  ON job_queue(type, status);

CREATE INDEX IF NOT EXISTS idx_job_queue_locked_until
  ON job_queue(locked_until)
  WHERE locked_until IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_job_queue_org
  ON job_queue(organization_id)
  WHERE organization_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_job_queue_created
  ON job_queue(created_at DESC);

-- Function to claim a batch of jobs atomically
CREATE OR REPLACE FUNCTION claim_jobs(
  p_worker_id VARCHAR(100),
  p_job_types VARCHAR(100)[],
  p_batch_size INTEGER DEFAULT 10,
  p_lock_duration INTERVAL DEFAULT '5 minutes'
)
RETURNS SETOF job_queue AS $$
BEGIN
  RETURN QUERY
  WITH claimed AS (
    SELECT jq.id
    FROM job_queue jq
    WHERE jq.status = 'pending'
      AND jq.scheduled_at <= now()
      AND (jq.locked_until IS NULL OR jq.locked_until < now())
      AND (p_job_types IS NULL OR jq.type = ANY(p_job_types))
    ORDER BY jq.priority DESC, jq.scheduled_at ASC
    LIMIT p_batch_size
    FOR UPDATE SKIP LOCKED
  )
  UPDATE job_queue
  SET
    status = 'processing',
    locked_until = now() + p_lock_duration,
    locked_by = p_worker_id,
    started_at = COALESCE(started_at, now()),
    attempts = attempts + 1
  WHERE id IN (SELECT id FROM claimed)
  RETURNING job_queue.*;
END;
$$ LANGUAGE plpgsql;

-- Function to mark job as completed
CREATE OR REPLACE FUNCTION complete_job(
  p_job_id UUID,
  p_result JSONB DEFAULT NULL
)
RETURNS VOID AS $$
BEGIN
  UPDATE job_queue
  SET
    status = 'completed',
    completed_at = now(),
    locked_until = NULL,
    locked_by = NULL,
    metadata = CASE
      WHEN p_result IS NOT NULL
      THEN metadata || jsonb_build_object('result', p_result)
      ELSE metadata
    END
  WHERE id = p_job_id;
END;
$$ LANGUAGE plpgsql;

-- Function to mark job as failed (with retry logic)
CREATE OR REPLACE FUNCTION fail_job(
  p_job_id UUID,
  p_error TEXT,
  p_retry_delay INTERVAL DEFAULT '1 minute'
)
RETURNS VOID AS $$
DECLARE
  v_job job_queue;
BEGIN
  SELECT * INTO v_job FROM job_queue WHERE id = p_job_id;

  IF v_job.attempts >= v_job.max_attempts THEN
    -- Max retries exceeded, mark as dead
    UPDATE job_queue
    SET
      status = 'dead',
      failed_at = now(),
      last_error = p_error,
      locked_until = NULL,
      locked_by = NULL
    WHERE id = p_job_id;
  ELSE
    -- Schedule retry with exponential backoff
    UPDATE job_queue
    SET
      status = 'pending',
      last_error = p_error,
      locked_until = NULL,
      locked_by = NULL,
      scheduled_at = now() + (p_retry_delay * power(2, v_job.attempts - 1))
    WHERE id = p_job_id;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Cleanup old completed/dead jobs (run periodically)
CREATE OR REPLACE FUNCTION cleanup_old_jobs(
  p_retention_days INTEGER DEFAULT 7
)
RETURNS INTEGER AS $$
DECLARE
  v_deleted INTEGER;
BEGIN
  WITH deleted AS (
    DELETE FROM job_queue
    WHERE (status = 'completed' OR status = 'dead')
      AND created_at < now() - (p_retention_days || ' days')::INTERVAL
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_deleted FROM deleted;

  RETURN v_deleted;
END;
$$ LANGUAGE plpgsql;

-- View for job queue statistics
CREATE OR REPLACE VIEW job_queue_stats AS
SELECT
  type,
  status,
  COUNT(*) as count,
  AVG(attempts) as avg_attempts,
  MIN(created_at) as oldest_job,
  MAX(created_at) as newest_job
FROM job_queue
GROUP BY type, status;

-- RLS (service role only - jobs are internal)
ALTER TABLE job_queue ENABLE ROW LEVEL SECURITY;

-- No user policies - only service role can access
COMMENT ON TABLE job_queue IS 'Background job queue for async processing';
