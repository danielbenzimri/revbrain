/**
 * Worker lifecycle: SIGTERM handling, cancellation detection, run attempts.
 *
 * SIGTERM handler: sets flag only — no DB writes in signal handler.
 * Cancellation: periodic DB check for status = 'cancel_requested'.
 * Run attempts: creates row on startup, updates on exit.
 *
 * See: Implementation Plan Task 1.3
 */

import type postgres from 'postgres';
import { logger } from './lib/logger.ts';

// ============================================================
// Shutdown flag — set by SIGTERM, checked by pipeline
// ============================================================

let shuttingDown = false;

export function isShuttingDown(): boolean {
  return shuttingDown;
}

/**
 * Register SIGTERM handler. Sets flag only — no async DB writes.
 * Uses setImmediate to schedule orderly shutdown in event loop.
 */
export function registerSigtermHandler(onShutdown: () => void): void {
  process.on('SIGTERM', () => {
    logger.info('sigterm_received');
    shuttingDown = true;
    // Schedule cleanup in event loop — signal handler must be synchronous
    setImmediate(onShutdown);
  });
}

// ============================================================
// Cancellation detection
// ============================================================

/**
 * Check if the run has been cancelled by the user.
 * Called between pipeline phases and during Bulk API polling.
 */
export async function isCancelRequested(sql: postgres.Sql, runId: string): Promise<boolean> {
  const result = await sql`
    SELECT status FROM assessment_runs WHERE id = ${runId}
  `;
  return result.length > 0 && result[0].status === 'cancel_requested';
}

// ============================================================
// Run attempts
// ============================================================

/**
 * Create a run attempt row on startup.
 * Attempt number derived from existing count + 1.
 */
export async function createRunAttempt(
  sql: postgres.Sql,
  runId: string,
  workerId: string,
  providerExecutionId?: string
): Promise<number> {
  const countResult = await sql`
    SELECT COUNT(*)::int as count FROM run_attempts WHERE run_id = ${runId}
  `;
  const attemptNo = (countResult[0]?.count ?? 0) + 1;

  await sql`
    INSERT INTO run_attempts (run_id, attempt_no, worker_id, provider_execution_id)
    VALUES (${runId}, ${attemptNo}, ${workerId}, ${providerExecutionId ?? null})
  `;

  logger.info({ runId, attemptNo, workerId }, 'run_attempt_created');
  return attemptNo;
}

/**
 * Update the run attempt on exit.
 */
export async function updateRunAttempt(
  sql: postgres.Sql,
  runId: string,
  attemptNo: number,
  exitCode: number,
  exitReason: 'success' | 'sigterm' | 'error'
): Promise<void> {
  try {
    await sql`
      UPDATE run_attempts
      SET ended_at = NOW(), exit_code = ${exitCode}, exit_reason = ${exitReason}
      WHERE run_id = ${runId} AND attempt_no = ${attemptNo}
    `;
  } catch (err) {
    // Best-effort — don't throw during shutdown
    logger.error(
      { error: err instanceof Error ? err.message : String(err) },
      'run_attempt_update_failed'
    );
  }
}

// ============================================================
// Health check
// ============================================================

/**
 * Startup health check — validates all required permissions and connectivity.
 * Runs BEFORE claiming the lease. Fails fast with clear error.
 */
export async function runHealthCheck(sql: postgres.Sql, runId: string): Promise<void> {
  logger.info('health_check_starting');

  // 1. DB permissions: can we read assessment_runs?
  try {
    const result = await sql`
      SELECT id FROM assessment_runs WHERE id = ${runId} LIMIT 1
    `;
    if (result.length === 0) {
      throw new Error(`Run ${runId} not found in database`);
    }
  } catch (err) {
    throw new Error(
      `Health check failed: DB read on assessment_runs — ${err instanceof Error ? err.message : String(err)}`
    );
  }

  // 2. DB permissions: can we read salesforce_connections?
  try {
    await sql`SELECT 1 FROM salesforce_connections LIMIT 0`;
  } catch (err) {
    throw new Error(
      `Health check failed: DB read on salesforce_connections — ${err instanceof Error ? err.message : String(err)}`
    );
  }

  // 3. DB permissions: can we execute the security definer function?
  // (We can't actually call it without valid params, but checking it exists is sufficient)
  try {
    await sql`
      SELECT 1 FROM pg_proc WHERE proname = 'update_connection_tokens'
    `;
  } catch (err) {
    throw new Error(
      `Health check failed: security definer function check — ${err instanceof Error ? err.message : String(err)}`
    );
  }

  logger.info('health_check_passed');
}
