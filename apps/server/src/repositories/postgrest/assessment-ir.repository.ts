/**
 * PostgREST AssessmentIRRepository (PH8.2).
 *
 * Reads / writes the `ir_graph` JSONB column on `assessment_runs`
 * via the Supabase JS client (HTTP API). Mirrors the Drizzle
 * implementation semantically so the triple-adapter contract
 * holds.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { AssessmentIRRepository } from '@revbrain/contract';

export class PostgRESTAssessmentIRRepository implements AssessmentIRRepository {
  constructor(private supabase: SupabaseClient) {}

  async saveIRGraph(runId: string, graph: unknown): Promise<void> {
    const { error } = await this.supabase
      .from('assessment_runs')
      .update({ ir_graph: graph })
      .eq('id', runId);
    if (error) {
      throw new Error(`saveIRGraph failed for run ${runId}: ${error.message}`);
    }
  }

  async findIRGraphByRunId(runId: string): Promise<unknown | null> {
    const { data, error } = await this.supabase
      .from('assessment_runs')
      .select('ir_graph')
      .eq('id', runId)
      .maybeSingle();
    if (error) {
      throw new Error(`findIRGraphByRunId failed for run ${runId}: ${error.message}`);
    }
    return (data?.ir_graph as unknown) ?? null;
  }

  async deleteIRGraphByRunId(runId: string): Promise<void> {
    const { error } = await this.supabase
      .from('assessment_runs')
      .update({ ir_graph: null })
      .eq('id', runId);
    if (error) {
      throw new Error(`deleteIRGraphByRunId failed for run ${runId}: ${error.message}`);
    }
  }
}
