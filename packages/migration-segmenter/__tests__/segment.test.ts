/**
 * Integration tests for the public `segment()` API.
 * Covers T1–T9, T11–T16, T19–T28 from acceptance matrix.
 * T10 (real staging graph) is in SEG-4.3 (worker smoke test).
 */
import { describe, expect, it } from 'vitest';
import { segment } from '../src/segment.ts';
import type { IRGraph, IREdge, IRNodeBase } from '@revbrain/migration-ir-contract';

function node(id: string, nodeType = 'Product', complexity?: string): IRNodeBase {
  return {
    id,
    contentHash: `h-${id}`,
    nodeType,
    displayName: `Display ${id}`,
    complexitySignal: complexity,
    evidence: {
      sourceFindingKeys: [`fk-${id}`],
      sourceSalesforceRecordIds: [],
      classificationReasons: [],
      cpqFieldsRead: [],
      cpqFieldsWritten: [],
      sourceCollectors: [],
    },
    warnings: [],
  } as unknown as IRNodeBase;
}

function edge(src: string, tgt: string, type: IREdge['edgeType']): IREdge {
  return { sourceId: src, targetId: tgt, edgeType: type, sourceField: 'test' };
}

function makeGraph(nodes: IRNodeBase[], edges: IREdge[]): IRGraph {
  return {
    irSchemaVersion: '1.0.0',
    bb3Version: '0.0.0-test',
    orgFingerprint: {} as IRGraph['orgFingerprint'],
    extractedAt: '2026-01-01T00:00:00Z',
    nodes,
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
  } as IRGraph;
}

describe('segment() public API', () => {
  it('T1: empty graph → empty manifest', async () => {
    const result = await segment(makeGraph([], []));
    expect(result.manifest.segmentCount).toBe(0);
    expect(result.manifest.waveCount).toBe(0);
    expect(result.manifest.segments).toHaveLength(0);
  });

  it('T2: single node → 1 singleton, wave 0, island', async () => {
    const result = await segment(makeGraph([node('a')], []));
    expect(result.manifest.realSegmentCount).toBe(1);
    const seg = result.manifest.segments[0]!;
    expect(seg.migrationOrder).toBe(0);
    expect(seg.isIsland).toBe(true);
    expect(seg.nodeCount).toBe(1);
  });

  it('T3: PricingRule + 2 conds + 1 action → 1 segment, 4 nodes', async () => {
    const g = makeGraph(
      [
        node('r', 'PricingRule'),
        node('c1', 'PriceCondition'),
        node('c2', 'PriceCondition'),
        node('a', 'PriceAction'),
      ],
      [edge('r', 'c1', 'parent-of'), edge('r', 'c2', 'parent-of'), edge('r', 'a', 'parent-of')]
    );
    const result = await segment(g);
    expect(result.manifest.realSegmentCount).toBe(1);
    expect(result.manifest.segments[0]!.nodeCount).toBe(4);
    expect(result.manifest.segments[0]!.rootNodeId).toBe('r');
  });

  it('T4: 2 independent rules → 2 segments, both wave 0', async () => {
    const g = makeGraph(
      [
        node('r1', 'PricingRule'),
        node('c1', 'PriceCondition'),
        node('r2', 'PricingRule'),
        node('c2', 'PriceCondition'),
      ],
      [edge('r1', 'c1', 'parent-of'), edge('r2', 'c2', 'parent-of')]
    );
    const result = await segment(g);
    expect(result.manifest.realSegmentCount).toBe(2);
    for (const seg of result.manifest.segments) {
      expect(seg.migrationOrder).toBe(0);
    }
  });

  it('T5: depends-on → 2 segments, correct wave ordering + provenance', async () => {
    const g = makeGraph(
      [node('a', 'PricingRule'), node('b', 'PricingRule')],
      [edge('a', 'b', 'depends-on')]
    );
    const result = await segment(g);
    expect(result.manifest.realSegmentCount).toBe(2);
    // b is prerequisite (target), so b = wave 0, a = wave 1
    const segA = result.manifest.segments.find((s) => s.memberNodeIds.includes('a'))!;
    const segB = result.manifest.segments.find((s) => s.memberNodeIds.includes('b'))!;
    expect(segB.migrationOrder).toBeLessThan(segA.migrationOrder);
    // Provenance
    expect(result.manifest.dependencies).toHaveLength(1);
    expect(result.manifest.dependencies[0]!.byEdgeType['depends-on']).toBe(1);
  });

  it('T8: mutual depends-on → SCC merge → 1 segment', async () => {
    const g = makeGraph(
      [node('r1', 'PricingRule'), node('r2', 'PricingRule')],
      [edge('r1', 'r2', 'depends-on'), edge('r2', 'r1', 'depends-on')]
    );
    const result = await segment(g);
    expect(result.manifest.realSegmentCount).toBe(1);
    expect(result.manifest.crossSegmentCycleMergeCount).toBe(1);
    expect(result.diagnostics.some((d) => d.code === 'SEG_W002')).toBe(true);
  });

  it('T9: determinism — same graph twice → identical output', async () => {
    const g = makeGraph(
      [node('a', 'PricingRule'), node('b', 'PriceCondition'), node('c')],
      [edge('a', 'b', 'parent-of')]
    );
    const r1 = await segment(g);
    const r2 = await segment(g);
    expect(JSON.stringify(r1.assignment)).toBe(JSON.stringify(r2.assignment));
    expect(JSON.stringify(r1.manifest)).toBe(JSON.stringify(r2.manifest));
  });

  it('T9 (shuffled): same content, different array order → identical output', async () => {
    const nodes1 = [node('a', 'PricingRule'), node('b', 'PriceCondition'), node('c', 'Product')];
    const nodes2 = [node('c', 'Product'), node('a', 'PricingRule'), node('b', 'PriceCondition')];
    const edges1 = [edge('a', 'b', 'parent-of')];
    const edges2 = [edge('a', 'b', 'parent-of')];
    const r1 = await segment(makeGraph(nodes1, edges1));
    const r2 = await segment(makeGraph(nodes2, edges2));
    // Compare assignment with sorted keys (JSON.stringify order depends on insertion)
    const sortedAssignment = (a: Record<string, string>) =>
      JSON.stringify(Object.entries(a).sort(([ka], [kb]) => (ka < kb ? -1 : 1)));
    expect(sortedAssignment(r1.assignment.nodeToSegment)).toBe(
      sortedAssignment(r2.assignment.nodeToSegment)
    );
    // Manifest is already sorted by spec (migrationOrder, id)
    expect(JSON.stringify(r1.manifest)).toBe(JSON.stringify(r2.manifest));
  });

  it('T11: unknown edge type → throws', async () => {
    const g = makeGraph([node('a'), node('b')], [edge('a', 'b', 'made-up' as IREdge['edgeType'])]);
    await expect(segment(g)).rejects.toThrow(/UnclassifiedEdgeTypeError/);
  });

  it('T12: zero-edge graph → all singletons + SEG_W001', async () => {
    const g = makeGraph([node('a'), node('b'), node('c')], []);
    const result = await segment(g);
    expect(result.manifest.realSegmentCount).toBe(3);
    expect(result.manifest.sizeHistogram.singleton).toBe(3);
    expect(result.diagnostics.some((d) => d.code === 'SEG_W001')).toBe(true);
  });

  it('T15: consumes-variable → ordering + ValidationConstraint', async () => {
    const g = makeGraph(
      [node('rule', 'PricingRule'), node('var', 'SummaryVariable')],
      [edge('rule', 'var', 'consumes-variable')]
    );
    const result = await segment(g);
    expect(result.manifest.realSegmentCount).toBe(2);
    const ruleSeg = result.manifest.segments.find((s) => s.memberNodeIds.includes('rule'))!;
    expect(ruleSeg.validationConstraints).toHaveLength(1);
    expect(ruleSeg.validationConstraints[0]!.type).toBe('prereq-exists');
    expect(ruleSeg.validationConstraints[0]!.nodeId).toBe('var');
  });

  it('T19: triggers → CoordinationHazard, NO ordering', async () => {
    const g = makeGraph(
      [node('auto', 'Automation'), node('rule', 'PricingRule')],
      [edge('auto', 'rule', 'triggers')]
    );
    const result = await segment(g);
    // 2 separate segments (triggers is hazard, not ordering)
    expect(result.manifest.realSegmentCount).toBe(2);
    // No ordering dependency
    expect(result.manifest.dependencies).toHaveLength(0);
    // But has coordination hazard
    expect(result.manifest.coordinationHazards).toHaveLength(1);
    expect(result.manifest.coordinationHazards[0]!.edgeType).toBe('triggers');
  });

  it('T20: external references edge → virtual segment', async () => {
    const g = makeGraph([node('a')], [edge('a', 'external-object', 'references')]);
    const result = await segment(g);
    expect(result.manifest.virtualSegmentCount).toBe(1);
    const vs = result.manifest.segments.find((s) => s.isVirtual)!;
    expect(vs).toBeDefined();
    expect(vs.migrationOrder).toBe(-1);
    expect(vs.id.startsWith('seg:ext:')).toBe(true);
    // Real segment should have a validation constraint
    const realSeg = result.manifest.segments.find((s) => !s.isVirtual)!;
    expect(realSeg.validationConstraints.some((c) => c.nodeId === 'external-object')).toBe(true);
  });

  it('T21: segment IDs unique', async () => {
    const g = makeGraph([node('a'), node('b'), node('c')], [edge('a', 'b', 'parent-of')]);
    const result = await segment(g);
    const ids = result.manifest.segments.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('T26: CoordinationHazard fingerprint is deterministic', async () => {
    const g = makeGraph(
      [node('a', 'Automation'), node('b', 'PricingRule')],
      [edge('a', 'b', 'triggers')]
    );
    const r1 = await segment(g);
    const r2 = await segment(g);
    expect(r1.manifest.coordinationHazards[0]!.fingerprint).toBe(
      r2.manifest.coordinationHazards[0]!.fingerprint
    );
  });

  it('T27: custom options override behavior', async () => {
    const g = makeGraph([node('a', 'Product', 'simple')], []);
    // Default weight for simple = 1
    const r1 = await segment(g);
    expect(r1.manifest.segments[0]!.weight).toBe(1);
    // Override weight
    const r2 = await segment(g, { weights: { simple: 5 } });
    expect(r2.manifest.segments[0]!.weight).toBe(5);
  });

  it('T28: virtual segment ID does not collide with real', async () => {
    const g = makeGraph([node('a')], [edge('a', 'ext-1', 'references')]);
    const result = await segment(g);
    const realIds = result.manifest.segments.filter((s) => !s.isVirtual).map((s) => s.id);
    const virtualIds = result.manifest.segments.filter((s) => s.isVirtual).map((s) => s.id);
    for (const rid of realIds) {
      expect(rid.startsWith('seg:ext:')).toBe(false);
    }
    for (const vid of virtualIds) {
      expect(vid.startsWith('seg:ext:')).toBe(true);
    }
  });

  it('histogram boundary: segments with 1, 2, 6, 21 nodes', async () => {
    // Create 4 segments of different sizes
    const nodes: IRNodeBase[] = [];
    const edges: IREdge[] = [];

    // Segment 1: singleton
    nodes.push(node('solo'));

    // Segment 2: 2 nodes (small)
    nodes.push(node('s2-root', 'PricingRule'), node('s2-child', 'PriceCondition'));
    edges.push(edge('s2-root', 's2-child', 'parent-of'));

    // Segment 3: 6 nodes (medium)
    nodes.push(node('s3-root', 'BundleStructure'));
    for (let i = 0; i < 5; i++) {
      nodes.push(node(`s3-opt-${i}`, 'BundleOption'));
      edges.push(edge('s3-root', `s3-opt-${i}`, 'parent-of'));
    }

    // Segment 4: 21 nodes (large)
    nodes.push(node('s4-root', 'DiscountSchedule'));
    for (let i = 0; i < 20; i++) {
      nodes.push(node(`s4-tier-${i}`, 'DiscountTier'));
      edges.push(edge('s4-root', `s4-tier-${i}`, 'parent-of'));
    }

    const result = await segment(makeGraph(nodes, edges));
    expect(result.manifest.sizeHistogram.singleton).toBe(1);
    expect(result.manifest.sizeHistogram.small).toBe(1);
    expect(result.manifest.sizeHistogram.medium).toBe(1);
    expect(result.manifest.sizeHistogram.large).toBe(1);
    expect(result.manifest.sizeHistogram.xlarge).toBe(0);
  });
});
