/**
 * Lease manager with CAS (Compare-and-Set) semantics.
 *
 * Prevents duplicate workers from processing the same run.
 * Uses the heartbeat pool (separate 1-connection pool) to avoid
 * contention with collector DB writes.
 *
 * Timing: heartbeat every 30s, lease duration 90s.
 * Worst-case detection: 90s + 30s buffer + 120s sweeper = ~4 minutes.
 *
 * See: Architecture Spec Section 3.2
 */

import type postgres from 'postgres';
import { logger } from './lib/logger.ts';
import { randomUUID } from 'node:crypto';

/** Lease timing parameters */
const LEASE_DURATION_SECONDS = 90;
const HEARTBEAT_INTERVAL_MS = 30_000; // 30 seconds

export class LeaseManager {
  private workerId: string;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private sql: postgres.Sql,
    private runId: string
  ) {
    this.workerId = `worker-${randomUUID().slice(0, 8)}-${process.pid}`;
  }

  getWorkerId(): string {
    return this.workerId;
  }

  /**
   * Claim the run. CAS: only succeeds if unclaimed or lease expired.
   * Returns true if claimed, false if another worker holds the lease.
   */
  async claim(): Promise<boolean> {
    const result = await this.sql`
      UPDATE assessment_runs
      SET
        worker_id = ${this.workerId},
        lease_expires_at = NOW() + make_interval(secs => ${LEASE_DURATION_SECONDS}),
        status = 'running',
        started_at = NOW(),
        last_heartbeat_at = NOW()
      WHERE id = ${this.runId}
        AND status = 'dispatched'
        AND (worker_id IS NULL OR lease_expires_at < NOW())
      RETURNING id
    `;

    if (result.length === 0) {
      logger.warn({ runId: this.runId, workerId: this.workerId }, 'lease_claim_failed');
      return false;
    }

    logger.info({ runId: this.runId, workerId: this.workerId }, 'lease_claimed');
    return true;
  }

  /**
   * Renew the lease. CAS: only succeeds if still the owner.
   * Returns true if renewed, false if lease was lost (worker should exit).
   *
   * Retries 3 times with 2s backoff on transient DB errors.
   */
  async renew(progress?: Record<string, unknown>): Promise<boolean> {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const progressJson = progress ? JSON.stringify(progress) : null;

        const result = progressJson
          ? await this.sql`
              UPDATE assessment_runs
              SET
                lease_expires_at = NOW() + make_interval(secs => ${LEASE_DURATION_SECONDS}),
                last_heartbeat_at = NOW(),
                progress = ${progressJson}::jsonb
              WHERE id = ${this.runId}
                AND worker_id = ${this.workerId}
              RETURNING worker_id
            `
          : await this.sql`
              UPDATE assessment_runs
              SET
                lease_expires_at = NOW() + make_interval(secs => ${LEASE_DURATION_SECONDS}),
                last_heartbeat_at = NOW()
              WHERE id = ${this.runId}
                AND worker_id = ${this.workerId}
              RETURNING worker_id
            `;

        if (result.length === 0) {
          logger.error(
            { runId: this.runId, workerId: this.workerId },
            'lease_lost — another worker or sweeper took ownership'
          );
          return false;
        }

        return true;
      } catch (err) {
        logger.warn(
          {
            attempt,
            error: err instanceof Error ? err.message : String(err),
          },
          'heartbeat_retry'
        );
        if (attempt < 2) {
          await new Promise((resolve) => setTimeout(resolve, 2000 * (attempt + 1)));
        }
      }
    }

    logger.error('heartbeat_failed_all_retries — DB unreachable for ~10s');
    return false;
  }

  /**
   * Release the lease and set terminal status.
   */
  async release(
    finalStatus: 'completed' | 'completed_warnings' | 'failed',
    options?: { error?: string; durationMs?: number; apiCallsUsed?: number }
  ): Promise<void> {
    try {
      if (finalStatus === 'failed') {
        await this.sql`
          UPDATE assessment_runs
          SET
            worker_id = NULL,
            lease_expires_at = NULL,
            status = ${finalStatus},
            failed_at = NOW(),
            duration_ms = ${options?.durationMs ?? null},
            api_calls_used = ${options?.apiCallsUsed ?? null},
            error = ${options?.error ?? null}
          WHERE id = ${this.runId}
            AND worker_id = ${this.workerId}
        `;
      } else {
        await this.sql`
          UPDATE assessment_runs
          SET
            worker_id = NULL,
            lease_expires_at = NULL,
            status = ${finalStatus},
            completed_at = NOW(),
            duration_ms = ${options?.durationMs ?? null},
            api_calls_used = ${options?.apiCallsUsed ?? null}
          WHERE id = ${this.runId}
            AND worker_id = ${this.workerId}
        `;
      }
      logger.info({ runId: this.runId, finalStatus }, 'lease_released');
    } catch (err) {
      logger.error(
        { error: err instanceof Error ? err.message : String(err) },
        'lease_release_failed'
      );
    }
  }

  /**
   * Start the heartbeat loop. Calls `onHeartbeat` before each renewal.
   * Returns a function to stop the heartbeat.
   */
  startHeartbeat(onHeartbeat?: () => Promise<Record<string, unknown> | void>): () => void {
    this.heartbeatTimer = setInterval(async () => {
      try {
        const progress = onHeartbeat
          ? ((await onHeartbeat()) as Record<string, unknown> | undefined)
          : undefined;
        const renewed = await this.renew(progress ?? undefined);
        if (!renewed) {
          logger.error('lease_lost_during_heartbeat — initiating self-termination');
          this.stopHeartbeat();
          process.exit(1);
        }
      } catch (err) {
        logger.error(
          { error: err instanceof Error ? err.message : String(err) },
          'heartbeat_error'
        );
      }
    }, HEARTBEAT_INTERVAL_MS);

    return () => this.stopHeartbeat();
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }
}
