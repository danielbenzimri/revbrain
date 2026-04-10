/**
 * Drizzle AssessmentIRRepository (PH8.2).
 *
 * Reads / writes the `ir_graph` JSONB column on `assessment_runs`.
 * Kept separate from the main assessment repository because
 * IRGraph payloads are large and we don't want every run-lookup
 * to pay the cost of deserializing them.
 */

import { eq, sql } from 'drizzle-orm';
import { db as defaultDb } from '@revbrain/database/client';
import { assessmentRuns } from '@revbrain/database';
import type { AssessmentIRRepository } from '@revbrain/contract';
import type { DrizzleDB } from './index.ts';

export class DrizzleAssessmentIRRepository implements AssessmentIRRepository {
  constructor(private db: DrizzleDB = defaultDb) {}

  async saveIRGraph(runId: string, graph: unknown): Promise<void> {
    await this.db
      .update(assessmentRuns)
      .set({ irGraph: graph as Record<string, unknown> })
      .where(eq(assessmentRuns.id, runId));
  }

  async findIRGraphByRunId(runId: string): Promise<unknown | null> {
    const [row] = await this.db
      .select({ irGraph: assessmentRuns.irGraph })
      .from(assessmentRuns)
      .where(eq(assessmentRuns.id, runId))
      .limit(1);
    return row?.irGraph ?? null;
  }

  async deleteIRGraphByRunId(runId: string): Promise<void> {
    await this.db
      .update(assessmentRuns)
      .set({ irGraph: sql`NULL` })
      .where(eq(assessmentRuns.id, runId));
  }
}
