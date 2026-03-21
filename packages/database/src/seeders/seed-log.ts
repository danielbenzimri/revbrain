/**
 * Seed Run Logging
 *
 * Tracks seed operations in a `_seed_runs` metadata table.
 * This table is NOT managed by Drizzle migrations — it is created
 * via raw SQL on first use.
 */
import { sql } from 'drizzle-orm';
import type { DrizzleDB } from '../client';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export interface SeedRunRecord {
  runId: string;
  datasetName: string;
  status: 'running' | 'completed' | 'failed';
  startedAt: Date;
  completedAt: Date | null;
  environment: string | null;
  entityCounts: Record<string, number> | null;
  errorSummary: string | null;
}

// ---------------------------------------------------------------------------
// Ensure the _seed_runs table exists
// ---------------------------------------------------------------------------
export async function ensureSeedTables(db: DrizzleDB): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS _seed_runs (
      run_id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      dataset_name   TEXT NOT NULL,
      status         TEXT NOT NULL,
      started_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
      completed_at   TIMESTAMPTZ,
      environment    TEXT,
      entity_counts  JSONB,
      error_summary  TEXT
    );
  `);
}

// ---------------------------------------------------------------------------
// Insert a new run record
// ---------------------------------------------------------------------------
export async function recordSeedRun(
  db: DrizzleDB,
  data: {
    datasetName: string;
    status: string;
    environment?: string;
  }
): Promise<string> {
  const rows = await db.execute(sql`
    INSERT INTO _seed_runs (dataset_name, status, environment)
    VALUES (${data.datasetName}, ${data.status}, ${data.environment ?? null})
    RETURNING run_id;
  `);
  // postgres.js returns an array of row objects
  return (rows as unknown as Array<{ run_id: string }>)[0].run_id;
}

// ---------------------------------------------------------------------------
// Update an existing run record
// ---------------------------------------------------------------------------
export async function updateSeedRun(
  db: DrizzleDB,
  runId: string,
  updates: {
    status?: string;
    completedAt?: Date;
    entityCounts?: Record<string, number>;
    errorSummary?: string;
  }
): Promise<void> {
  // Build SET clauses dynamically
  const setClauses: string[] = [];
  const values: unknown[] = [];
  let idx = 1;

  if (updates.status !== undefined) {
    setClauses.push(`status = $${idx++}`);
    values.push(updates.status);
  }
  if (updates.completedAt !== undefined) {
    setClauses.push(`completed_at = $${idx++}`);
    values.push(updates.completedAt.toISOString());
  }
  if (updates.entityCounts !== undefined) {
    setClauses.push(`entity_counts = $${idx++}`);
    values.push(JSON.stringify(updates.entityCounts));
  }
  if (updates.errorSummary !== undefined) {
    setClauses.push(`error_summary = $${idx++}`);
    values.push(updates.errorSummary);
  }

  if (setClauses.length === 0) return;

  // Use drizzle sql tagged template for parameterised queries
  if (updates.status && updates.completedAt && updates.entityCounts && !updates.errorSummary) {
    await db.execute(sql`
      UPDATE _seed_runs
      SET status = ${updates.status},
          completed_at = ${updates.completedAt.toISOString()},
          entity_counts = ${JSON.stringify(updates.entityCounts)}
      WHERE run_id = ${runId}::uuid;
    `);
    return;
  }

  if (updates.status && updates.errorSummary) {
    await db.execute(sql`
      UPDATE _seed_runs
      SET status = ${updates.status},
          completed_at = ${(updates.completedAt ?? new Date()).toISOString()},
          error_summary = ${updates.errorSummary}
      WHERE run_id = ${runId}::uuid;
    `);
    return;
  }

  // Generic fallback — update only status
  if (updates.status) {
    await db.execute(sql`
      UPDATE _seed_runs
      SET status = ${updates.status}
      WHERE run_id = ${runId}::uuid;
    `);
  }
}

// ---------------------------------------------------------------------------
// Get the most recent seed run
// ---------------------------------------------------------------------------
export async function getLastRun(db: DrizzleDB): Promise<SeedRunRecord | null> {
  const rows = await db.execute(sql`
    SELECT run_id, dataset_name, status, started_at, completed_at,
           environment, entity_counts, error_summary
    FROM _seed_runs
    ORDER BY started_at DESC
    LIMIT 1;
  `);

  const arr = rows as unknown as Array<{
    run_id: string;
    dataset_name: string;
    status: string;
    started_at: string;
    completed_at: string | null;
    environment: string | null;
    entity_counts: Record<string, number> | null;
    error_summary: string | null;
  }>;

  if (!arr || arr.length === 0) return null;

  const row = arr[0];
  return {
    runId: row.run_id,
    datasetName: row.dataset_name,
    status: row.status as SeedRunRecord['status'],
    startedAt: new Date(row.started_at),
    completedAt: row.completed_at ? new Date(row.completed_at) : null,
    environment: row.environment,
    entityCounts: row.entity_counts,
    errorSummary: row.error_summary,
  };
}
