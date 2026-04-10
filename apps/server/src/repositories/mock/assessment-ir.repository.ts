/**
 * Mock AssessmentIRRepository (PH8.2).
 *
 * In-memory store keyed by runId. Used when USE_MOCK_DATA=true so
 * local development and unit tests can round-trip IRGraph payloads
 * without a database.
 */

import type { AssessmentIRRepository } from '@revbrain/contract';

export class MockAssessmentIRRepository implements AssessmentIRRepository {
  private graphs = new Map<string, unknown>();

  async saveIRGraph(runId: string, graph: unknown): Promise<void> {
    this.graphs.set(runId, graph);
  }

  async findIRGraphByRunId(runId: string): Promise<unknown | null> {
    return this.graphs.get(runId) ?? null;
  }

  async deleteIRGraphByRunId(runId: string): Promise<void> {
    this.graphs.delete(runId);
  }
}
