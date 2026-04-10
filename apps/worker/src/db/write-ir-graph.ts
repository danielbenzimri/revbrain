/**
 * PH9.10 — Persist a BB-3 IRGraph onto the assessment run row.
 *
 * Writes the canonical JSON of the IRGraph to
 * `assessment_runs.ir_graph` via the existing postgres.Sql handle
 * the worker already uses for collector data. Mirrors the
 * PH8.2 AssessmentIRRepository interface but lives in the worker
 * package because the worker uses direct SQL rather than the
 * server's triple-adapter repository layer.
 *
 * Spec: docs/MIGRATION-PLANNER-BB3-DESIGN.md §6.4 persistence.
 */

import type postgres from 'postgres';
import type { IRGraph } from '@revbrain/migration-ir-contract';
import { logger } from '../lib/logger.ts';

export interface WriteIRGraphParams {
  sql: postgres.Sql;
  runId: string;
  /** The normalized graph. Never `null` — use `clearIRGraph()` instead. */
  graph: IRGraph;
}

/**
 * Upsert the IRGraph onto `assessment_runs.ir_graph`. Errors are
 * logged and swallowed — per the PH9.9 contract, BB-3 persistence
 * failures do NOT fail the extraction run.
 */
export async function writeIRGraph(params: WriteIRGraphParams): Promise<boolean> {
  const { sql, runId, graph } = params;
  try {
    // JSONB does not preserve key order, so storing the canonical
    // JSON on write has no advantage over JSON.stringify — the
    // round-trip through canonicalJson on read is what guarantees
    // deterministic output for BB-17. We use the standard worker
    // pattern: stringify + ::jsonb cast.
    const payload = JSON.stringify(graph);
    await sql`
      UPDATE assessment_runs
      SET ir_graph = ${payload}::jsonb
      WHERE id = ${runId}
    `;
    return true;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn({ runId, error: msg }, 'write_ir_graph_failed');
    return false;
  }
}
