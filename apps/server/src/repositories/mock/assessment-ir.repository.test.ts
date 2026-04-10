/**
 * PH8.2 — MockAssessmentIRRepository unit tests.
 *
 * Includes the round-trip invariant required by the spec:
 * canonicalJson(saved) === canonicalJson(fetched).
 */

import { describe, expect, it } from 'vitest';
import { canonicalJson } from '@revbrain/migration-ir-contract';
import { MockAssessmentIRRepository } from './assessment-ir.repository.ts';

describe('PH8.2 — MockAssessmentIRRepository', () => {
  it('save → findIRGraphByRunId returns the same graph', async () => {
    const repo = new MockAssessmentIRRepository();
    const graph = { irSchemaVersion: '1.0.0', nodes: [{ id: 'a' }] };
    await repo.saveIRGraph('run-1', graph);
    const fetched = await repo.findIRGraphByRunId('run-1');
    expect(fetched).toEqual(graph);
  });

  it('round-trip preserves canonicalJson byte-identity', async () => {
    const repo = new MockAssessmentIRRepository();
    const graph = {
      irSchemaVersion: '1.0.0',
      nodes: [
        { id: 'b', nodeType: 'Product' },
        { id: 'a', nodeType: 'Product' },
      ],
      edges: [],
      extractedAt: '2026-04-10T00:00:00Z',
    };
    await repo.saveIRGraph('run-2', graph);
    const fetched = await repo.findIRGraphByRunId('run-2');
    // canonicalJson sorts keys deterministically — the round-trip
    // must land on the exact same bytes.
    expect(canonicalJson(fetched)).toBe(canonicalJson(graph));
  });

  it('findIRGraphByRunId returns null when no graph is stored', async () => {
    const repo = new MockAssessmentIRRepository();
    const fetched = await repo.findIRGraphByRunId('unknown');
    expect(fetched).toBeNull();
  });

  it('deleteIRGraphByRunId removes the stored graph', async () => {
    const repo = new MockAssessmentIRRepository();
    await repo.saveIRGraph('run-3', { x: 1 });
    await repo.deleteIRGraphByRunId('run-3');
    const fetched = await repo.findIRGraphByRunId('run-3');
    expect(fetched).toBeNull();
  });

  it('saveIRGraph overwrites a previously stored graph', async () => {
    const repo = new MockAssessmentIRRepository();
    await repo.saveIRGraph('run-4', { v: 1 });
    await repo.saveIRGraph('run-4', { v: 2 });
    const fetched = await repo.findIRGraphByRunId('run-4');
    expect(fetched).toEqual({ v: 2 });
  });
});
