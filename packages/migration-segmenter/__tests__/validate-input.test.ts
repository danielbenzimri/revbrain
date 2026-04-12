import { describe, expect, it } from 'vitest';
import { validateInput } from '../src/validate-input.ts';
import {
  DanglingEdgeError,
  DuplicateNodeIdError,
  IncompatibleSchemaError,
  UnclassifiedEdgeTypeError,
} from '../src/errors.ts';
import type { IRGraph, IREdge, IRNodeBase } from '@revbrain/migration-ir-contract';

function makeGraph(
  nodes: Array<Partial<IRNodeBase>>,
  edges: IREdge[] = [],
  overrides?: Partial<IRGraph>
): IRGraph {
  return {
    irSchemaVersion: '1.0.0',
    bb3Version: '0.0.0-test',
    orgFingerprint: {} as IRGraph['orgFingerprint'],
    extractedAt: '2026-01-01T00:00:00Z',
    nodes: nodes.map((n) => ({
      id: n.id ?? 'node-1',
      contentHash: 'h',
      nodeType: n.nodeType ?? 'Product',
      displayName: n.displayName ?? 'Test',
      evidence: { sourceFindingKeys: [], sourceSalesforceRecordIds: [] },
      warnings: [],
      ...n,
    })) as IRNodeBase[],
    edges,
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
      totalIRNodesEmitted: nodes.length,
      cycleCount: 0,
      unknownArtifactCount: 0,
      unresolvedRefCount: 0,
      schemaCatalogHash: null,
    },
    quarantine: [],
    ...overrides,
  } as IRGraph;
}

function edge(source: string, target: string, type: IREdge['edgeType']): IREdge {
  return { sourceId: source, targetId: target, edgeType: type, sourceField: 'test' };
}

describe('SEG-1.1 — input validation', () => {
  it('passes on a valid graph with resolved edges', () => {
    const g = makeGraph([{ id: 'a' }, { id: 'b' }], [edge('a', 'b', 'parent-of')]);
    const result = validateInput(g);
    expect(result.resolvedEdges).toHaveLength(1);
    expect(result.externalEdges).toHaveLength(0);
    expect(result.nodeIndex.size).toBe(2);
  });

  it('passes on empty graph', () => {
    const g = makeGraph([], []);
    const result = validateInput(g);
    expect(result.resolvedEdges).toHaveLength(0);
    expect(result.nodeIndex.size).toBe(0);
  });

  it('IV1: throws DanglingEdgeError when source is missing', () => {
    const g = makeGraph([{ id: 'b' }], [edge('missing', 'b', 'parent-of')]);
    expect(() => validateInput(g)).toThrow(DanglingEdgeError);
  });

  it('IV2: throws DanglingEdgeError for structural edge to missing target', () => {
    const g = makeGraph([{ id: 'a' }], [edge('a', 'missing', 'parent-of')]);
    expect(() => validateInput(g)).toThrow(DanglingEdgeError);
  });

  it('IV2: classifies external-allowed edge to missing target as external', () => {
    const g = makeGraph([{ id: 'a' }], [edge('a', 'external-obj', 'references')]);
    const result = validateInput(g);
    expect(result.resolvedEdges).toHaveLength(0);
    expect(result.externalEdges).toHaveLength(1);
    expect(result.externalEdges[0]!.targetId).toBe('external-obj');
  });

  it('IV2: depends-on to missing target is a hard error (not external-allowed)', () => {
    const g = makeGraph([{ id: 'a' }], [edge('a', 'missing', 'depends-on')]);
    expect(() => validateInput(g)).toThrow(DanglingEdgeError);
  });

  it('IV3: throws DuplicateNodeIdError on duplicate IDs', () => {
    const g = makeGraph([{ id: 'x' }, { id: 'x' }]);
    expect(() => validateInput(g)).toThrow(DuplicateNodeIdError);
  });

  it('IV4: throws UnclassifiedEdgeTypeError on unknown edge type', () => {
    const g = makeGraph(
      [{ id: 'a' }, { id: 'b' }],
      [edge('a', 'b', 'invented-type' as IREdge['edgeType'])]
    );
    expect(() => validateInput(g)).toThrow(UnclassifiedEdgeTypeError);
  });

  it('IV5: throws IncompatibleSchemaError on bad version', () => {
    const g = makeGraph([], [], { irSchemaVersion: '2.0.0' });
    expect(() => validateInput(g)).toThrow(IncompatibleSchemaError);
  });

  it('IV5: accepts version 1.x.x', () => {
    const g = makeGraph([], [], { irSchemaVersion: '1.2.3' });
    expect(() => validateInput(g)).not.toThrow();
  });

  it('DanglingEdgeError includes first 10 edges', () => {
    const nodes = [{ id: 'a' }];
    const edges = Array.from({ length: 15 }, (_, i) => edge('a', `missing-${i}`, 'parent-of'));
    const g = makeGraph(nodes, edges);
    try {
      validateInput(g);
      expect.fail('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(DanglingEdgeError);
      expect((err as DanglingEdgeError).edges).toHaveLength(15);
      expect((err as DanglingEdgeError).message).toContain('First 10');
    }
  });
});
