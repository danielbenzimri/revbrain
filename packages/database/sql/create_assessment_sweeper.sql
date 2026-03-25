-- ============================================================
-- Assessment Run Sweeper (pg_cron job)
-- ============================================================
-- Runs every 2 minutes. Handles:
-- 1. Expired leases: running → stalled (with 30s buffer)
-- 2. Cold-start timeout: dispatched → stalled (after 5 min)
-- 3. Retry gating: stalled → queued (if retries remain) or → failed
-- 4. Dangling run_attempts cleanup
-- 5. Normalization timeout: completed + pending → mark failed
-- 6. Idempotency key TTL cleanup
--
-- Total detection time: lease(90s) + buffer(30s) + sweeper(120s) = ~4min
-- Within 5-minute SLO.
--
-- See: Implementation Plan Tasks 9.2, 9.3
-- ============================================================

-- Schedule: every 2 minutes
-- SELECT cron.schedule('assessment-sweeper', '*/2 * * * *', $$

-- 1. Mark running runs with expired leases as stalled
-- 30s buffer prevents racing with a heartbeat in flight
UPDATE assessment_runs
SET status = 'stalled',
    status_reason = 'heartbeat_timeout',
    worker_id = NULL,
    lease_expires_at = NULL
WHERE status = 'running'
  AND lease_expires_at < NOW() - INTERVAL '30 seconds';

-- 2. Mark dispatched runs with cold-start timeout as stalled
UPDATE assessment_runs
SET status = 'stalled',
    status_reason = 'container_start_timeout'
WHERE status = 'dispatched'
  AND dispatched_at < NOW() - INTERVAL '5 minutes';

-- 3a. Re-queue stalled runs that have retries remaining
UPDATE assessment_runs
SET status = 'queued',
    retry_count = retry_count + 1,
    status_reason = NULL
WHERE status = 'stalled'
  AND retry_count < max_retries;

-- 3b. Permanently fail stalled runs that exhausted retries
UPDATE assessment_runs
SET status = 'failed',
    status_reason = 'max_retries_exceeded',
    failed_at = NOW()
WHERE status = 'stalled'
  AND retry_count >= max_retries;

-- 4. Close dangling run_attempts (worker crashed without updating)
UPDATE run_attempts
SET ended_at = NOW(),
    exit_reason = 'infrastructure_kill'
WHERE ended_at IS NULL
  AND started_at < NOW() - INTERVAL '5 minutes';

-- 5. Mark normalization as failed if stuck > 10 minutes
-- (worker crashed between writing findings and completing normalization)
UPDATE assessment_runs
SET normalization_status = 'failed'
WHERE status IN ('completed', 'completed_warnings')
  AND normalization_status = 'pending'
  AND completed_at < NOW() - INTERVAL '10 minutes';

-- 6. Clean up old idempotency keys (frees unique index space)
UPDATE assessment_runs
SET idempotency_key = NULL
WHERE idempotency_key IS NOT NULL
  AND created_at < NOW() - INTERVAL '1 hour';

-- $$);

-- ============================================================
-- Re-trigger Scheduler (separate pg_cron job)
-- ============================================================
-- Picks up sweeper-requeued runs and dispatches to Cloud Run.
-- CAS dispatch prevents double-dispatch.
-- Schedule: every 2-3 minutes

-- SELECT cron.schedule('assessment-retrigger', '1-59/3 * * * *', $$

-- CAS: only transition if still queued and not recently created
-- (30s delay prevents racing with initial trigger)
-- The application layer calls Cloud Run API for each row returned.
-- This SQL just identifies candidates.
-- SELECT id, connection_id
-- FROM assessment_runs
-- WHERE status = 'queued'
--   AND updated_at < NOW() - INTERVAL '30 seconds'
-- FOR UPDATE SKIP LOCKED;

-- $$);
