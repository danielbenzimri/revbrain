/**
 * PH9.10 — writeIRGraph unit tests.
 *
 * Mocks postgres.js's tagged-template SQL API to verify that
 * writeIRGraph() emits an UPDATE statement against assessment_runs
 * with the graph payload serialized as JSON, and that errors are
 * swallowed (not rethrown) per the PH9.9 contract.
 */
import { describe, it, expect, vi } from 'vitest';
import type { IRGraph } from '@revbrain/migration-ir-contract';

function makeGraph(nodeCount = 0): IRGraph {
  return {
    irSchemaVersion: '1.0.0',
    bb3Version: '0.0.0-test',
    orgFingerprint: {
      id: 'org:test',
      contentHash: 'h',
      nodeType: 'OrgFingerprint',
      displayName: 'Org',
      warnings: [],
      evidence: {
        sourceFindingKeys: [],
        classificationReasons: [],
        cpqFieldsRead: [],
        cpqFieldsWritten: [],
        sourceSalesforceRecordIds: [],
        sourceCollectors: [],
      },
    },
    extractedAt: '2026-04-10T00:00:00Z',
    nodes: Array.from({ length: nodeCount }, (_, i) => ({
      id: `n-${i}`,
      contentHash: `c-${i}`,
      nodeType: 'Product',
      displayName: `Node ${i}`,
      warnings: [],
      evidence: {
        sourceFindingKeys: [`f-${i}`],
        classificationReasons: [],
        cpqFieldsRead: [],
        cpqFieldsWritten: [],
        sourceSalesforceRecordIds: [],
        sourceCollectors: ['catalog'],
      },
    })),
    edges: [],
    referenceIndex: {
      byObject: {},
      byField: {},
      byPath: {},
      byNodeId: {},
      dynamicRefs: [],
      unresolvedRefs: [],
    },
    metadata: {
      collectorCoverage: {},
      collectorWarnings: {},
      degradedInputs: [],
      quarantineCount: 0,
      totalFindingsConsumed: 0,
      totalIRNodesEmitted: nodeCount,
      cycleCount: 0,
      unknownArtifactCount: 0,
      unresolvedRefCount: 0,
      schemaCatalogHash: null,
    },
    quarantine: [],
  } as unknown as IRGraph;
}

describe('PH9.10 — writeIRGraph', () => {
  it('emits an UPDATE assessment_runs SET ir_graph = $1::jsonb', async () => {
    const { writeIRGraph } = await import('../../src/db/write-ir-graph.ts');
    const calls: Array<{ query: string; values: unknown[] }> = [];

    const mockSql = (strings: TemplateStringsArray, ...values: unknown[]) => {
      calls.push({ query: strings.join('?'), values });
      return Promise.resolve([]);
    };

    const ok = await writeIRGraph({
      sql: mockSql as never,
      runId: 'run-1',
      graph: makeGraph(3),
    });

    expect(ok).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.query).toContain('UPDATE');
    expect(calls[0]?.query).toContain('assessment_runs');
    expect(calls[0]?.query).toContain('ir_graph');
    expect(calls[0]?.values[0]).toEqual(expect.any(String));
    // The first interpolated value is the JSON payload; the second
    // is the run id.
    const payload = JSON.parse(calls[0]?.values[0] as string);
    expect(payload.irSchemaVersion).toBe('1.0.0');
    expect(payload.nodes).toHaveLength(3);
    expect(calls[0]?.values[1]).toBe('run-1');
  });

  it('swallows errors and returns false when the DB throws', async () => {
    const { writeIRGraph } = await import('../../src/db/write-ir-graph.ts');
    const mockSql = vi.fn().mockRejectedValue(new Error('connection refused'));

    const ok = await writeIRGraph({
      sql: mockSql as never,
      runId: 'run-1',
      graph: makeGraph(),
    });

    expect(ok).toBe(false);
    expect(mockSql).toHaveBeenCalledOnce();
  });

  it('empty graph is serialized and written (edge case, not skipped)', async () => {
    const { writeIRGraph } = await import('../../src/db/write-ir-graph.ts');
    const calls: Array<{ query: string; values: unknown[] }> = [];

    const mockSql = (strings: TemplateStringsArray, ...values: unknown[]) => {
      calls.push({ query: strings.join('?'), values });
      return Promise.resolve([]);
    };

    const ok = await writeIRGraph({
      sql: mockSql as never,
      runId: 'run-2',
      graph: makeGraph(0),
    });

    expect(ok).toBe(true);
    const payload = JSON.parse(calls[0]?.values[0] as string);
    expect(payload.nodes).toEqual([]);
  });
});
