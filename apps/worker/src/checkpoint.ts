/**
 * Checkpoint manager for resumable runs.
 *
 * Each collector writes a checkpoint row on completion (or partial completion).
 * On resume, the pipeline reads checkpoints to skip already-completed collectors.
 *
 * See: Architecture Spec Section 9.2 (collector_checkpoints table)
 */

import type postgres from 'postgres';
import { logger } from './lib/logger.ts';

export interface CheckpointData {
  collectorName: string;
  status: 'pending' | 'running' | 'success' | 'partial' | 'failed' | 'skipped';
  criticality: 'tier0' | 'tier1' | 'tier2';
  phase?: string;
  substep?: string;
  cursorJson?: Record<string, unknown>;
  bulkJobIds?: string[];
  recordsExtracted?: number;
  warnings?: string[];
  error?: string;
}

export class CheckpointManager {
  constructor(
    private sql: postgres.Sql,
    private runId: string
  ) {}

  /**
   * Write or update a checkpoint for a collector.
   * Uses ON CONFLICT for idempotent upsert.
   */
  async write(data: CheckpointData): Promise<void> {
    await this.sql`
      INSERT INTO collector_checkpoints (
        run_id, collector_name, criticality, status, phase, substep,
        cursor_json, bulk_job_ids, records_extracted, warnings, error,
        started_at
      ) VALUES (
        ${this.runId}, ${data.collectorName}, ${data.criticality},
        ${data.status}, ${data.phase ?? null}, ${data.substep ?? null},
        ${data.cursorJson ? JSON.stringify(data.cursorJson) : null}::jsonb,
        ${data.bulkJobIds ? JSON.stringify(data.bulkJobIds) : '[]'}::jsonb,
        ${data.recordsExtracted ?? 0},
        ${data.warnings ? JSON.stringify(data.warnings) : '[]'}::jsonb,
        ${data.error ?? null},
        NOW()
      )
      ON CONFLICT (run_id, collector_name) DO UPDATE SET
        status = EXCLUDED.status,
        phase = EXCLUDED.phase,
        substep = EXCLUDED.substep,
        cursor_json = EXCLUDED.cursor_json,
        bulk_job_ids = EXCLUDED.bulk_job_ids,
        records_extracted = EXCLUDED.records_extracted,
        warnings = EXCLUDED.warnings,
        error = EXCLUDED.error,
        completed_at = CASE WHEN EXCLUDED.status IN ('success', 'partial', 'failed', 'skipped')
          THEN NOW() ELSE NULL END,
        retry_count = collector_checkpoints.retry_count + CASE
          WHEN collector_checkpoints.status IN ('failed', 'running') AND EXCLUDED.status = 'running'
          THEN 1 ELSE 0 END
    `;
  }

  /**
   * Read all checkpoints for this run.
   * Used on resume to determine which collectors to skip.
   */
  async readAll(): Promise<CheckpointData[]> {
    const rows = await this.sql`
      SELECT collector_name, status, criticality, phase, substep,
             cursor_json, bulk_job_ids, records_extracted, warnings, error
      FROM collector_checkpoints
      WHERE run_id = ${this.runId}
    `;

    return rows.map((row) => ({
      collectorName: row.collector_name as string,
      status: row.status as CheckpointData['status'],
      criticality: row.criticality as CheckpointData['criticality'],
      phase: row.phase as string | undefined,
      substep: row.substep as string | undefined,
      cursorJson: row.cursor_json as Record<string, unknown> | undefined,
      bulkJobIds: row.bulk_job_ids as string[] | undefined,
      recordsExtracted: row.records_extracted as number | undefined,
      warnings: row.warnings as string[] | undefined,
      error: row.error as string | undefined,
    }));
  }

  /**
   * Determine which collectors should be re-run on resume.
   * - `success` → skip
   * - `failed`, `running`, `pending` → re-run
   * - `partial` → re-run (may have incomplete data)
   * - `skipped` → skip
   */
  getCollectorsToRerun(checkpoints: CheckpointData[]): Set<string> {
    const toRerun = new Set<string>();
    for (const cp of checkpoints) {
      if (cp.status === 'success' || cp.status === 'skipped') {
        continue;
      }
      toRerun.add(cp.collectorName);
    }
    return toRerun;
  }

  /**
   * Get orphaned Bulk API job IDs from checkpoints.
   * On resume, these should be aborted before starting new jobs.
   */
  getOrphanedBulkJobs(checkpoints: CheckpointData[]): string[] {
    const orphans: string[] = [];
    for (const cp of checkpoints) {
      if (cp.status === 'running' && cp.bulkJobIds && cp.bulkJobIds.length > 0) {
        orphans.push(...cp.bulkJobIds);
      }
    }
    if (orphans.length > 0) {
      logger.info({ count: orphans.length }, 'orphaned_bulk_jobs_found');
    }
    return orphans;
  }
}
