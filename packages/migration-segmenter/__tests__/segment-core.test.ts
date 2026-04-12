import { describe, expect, it } from 'vitest';
import { buildSegments } from '../src/segment-core.ts';
import type { IREdge, IRNodeBase } from '@revbrain/migration-ir-contract';

function node(id: string, nodeType = 'Product'): IRNodeBase {
  return {
    id,
    contentHash: `h-${id}`,
    nodeType,
    displayName: id,
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

function edge(src: string, tgt: string, edgeType: IREdge['edgeType']): IREdge {
  return { sourceId: src, targetId: tgt, edgeType, sourceField: 'test' };
}

describe('SEG-1.3 — core segmentation', () => {
  it('empty graph → empty result', () => {
    const result = buildSegments([], []);
    expect(result.segmentReps.size).toBe(0);
    expect(result.crossSegmentCycleMergeCount).toBe(0);
  });

  it('single node, no edges → 1 singleton segment', () => {
    const result = buildSegments([node('a')], []);
    expect(result.segmentReps.size).toBe(1);
  });

  it('T3: PricingRule + 2 conditions + 1 action → 1 segment', () => {
    const nodes = [
      node('rule', 'PricingRule'),
      node('cond1', 'PriceCondition'),
      node('cond2', 'PriceCondition'),
      node('act1', 'PriceAction'),
    ];
    const edges = [
      edge('rule', 'cond1', 'parent-of'),
      edge('rule', 'cond2', 'parent-of'),
      edge('rule', 'act1', 'parent-of'),
    ];
    const result = buildSegments(nodes, edges);
    // All 4 nodes in one segment
    const comps = result.uf.components();
    expect(comps.size).toBe(1);
    const members = [...comps.values()][0]!;
    expect(members).toHaveLength(4);
  });

  it('T4: 2 independent PricingRules → 2 segments', () => {
    const nodes = [
      node('r1', 'PricingRule'),
      node('c1', 'PriceCondition'),
      node('r2', 'PricingRule'),
      node('c2', 'PriceCondition'),
    ];
    const edges = [edge('r1', 'c1', 'parent-of'), edge('r2', 'c2', 'parent-of')];
    const result = buildSegments(nodes, edges);
    const comps = result.uf.components();
    expect(comps.size).toBe(2);
  });

  it('T5: depends-on creates cross-segment ordering (not co-location)', () => {
    const nodes = [node('r1', 'PricingRule'), node('r2', 'PricingRule')];
    const edges = [edge('r1', 'r2', 'depends-on')];
    const result = buildSegments(nodes, edges);
    // 2 separate segments (depends-on is ordering, not strong)
    const comps = result.uf.components();
    expect(comps.size).toBe(2);
    // But there's a dependency in the DAG
    expect(result.orderingEdgeProvenance).toHaveLength(1);
  });

  it('T6: CyclicDependency group + members → 1 segment', () => {
    const nodes = [
      node('group', 'CyclicDependency'),
      node('m1', 'PricingRule'),
      node('m2', 'PricingRule'),
      node('m3', 'PricingRule'),
    ];
    const edges = [
      edge('group', 'm1', 'cycle-contains'),
      edge('group', 'm2', 'cycle-contains'),
      edge('group', 'm3', 'cycle-contains'),
    ];
    const result = buildSegments(nodes, edges);
    const comps = result.uf.components();
    expect(comps.size).toBe(1);
    expect([...comps.values()][0]).toHaveLength(4);
  });

  it('T7: BundleStructure + 10 options + 3 features → 1 segment', () => {
    const nodes = [
      node('bs', 'BundleStructure'),
      ...Array.from({ length: 10 }, (_, i) => node(`opt-${i}`, 'BundleOption')),
      ...Array.from({ length: 3 }, (_, i) => node(`feat-${i}`, 'BundleFeature')),
    ];
    const edges = [
      ...Array.from({ length: 10 }, (_, i) => edge('bs', `opt-${i}`, 'parent-of')),
      ...Array.from({ length: 3 }, (_, i) => edge('bs', `feat-${i}`, 'parent-of')),
    ];
    const result = buildSegments(nodes, edges);
    const comps = result.uf.components();
    expect(comps.size).toBe(1);
    expect([...comps.values()][0]).toHaveLength(14);
  });

  it('T8: mutual depends-on → SCC merge → 1 segment', () => {
    const nodes = [
      node('r1', 'PricingRule'),
      node('c1', 'PriceCondition'),
      node('r2', 'PricingRule'),
      node('c2', 'PriceCondition'),
    ];
    const edges = [
      edge('r1', 'c1', 'parent-of'),
      edge('r2', 'c2', 'parent-of'),
      // Mutual depends-on between the two rules
      edge('r1', 'r2', 'depends-on'),
      edge('r2', 'r1', 'depends-on'),
    ];
    const result = buildSegments(nodes, edges);
    // SCC merge should combine both rule-segments into one
    const comps = result.uf.components();
    expect(comps.size).toBe(1);
    expect([...comps.values()][0]).toHaveLength(4);
    expect(result.crossSegmentCycleMergeCount).toBe(1);
  });

  it('triggers edge is classified as hazard (not ordering)', () => {
    const nodes = [node('a'), node('b')];
    const edges = [edge('a', 'b', 'triggers')];
    const result = buildSegments(nodes, edges);
    // 2 separate segments (triggers is hazard, no ordering)
    const comps = result.uf.components();
    expect(comps.size).toBe(2);
    expect(result.hazardEdges).toHaveLength(1);
    expect(result.orderingEdgeProvenance).toHaveLength(0);
  });

  it('consumes-variable is ordering (weak), not strong', () => {
    const nodes = [node('rule', 'PricingRule'), node('var', 'SummaryVariable')];
    const edges = [edge('rule', 'var', 'consumes-variable')];
    const result = buildSegments(nodes, edges);
    // 2 separate segments
    const comps = result.uf.components();
    expect(comps.size).toBe(2);
    // Has ordering provenance
    expect(result.orderingEdgeProvenance).toHaveLength(1);
    // Direction: variable is prerequisite, rule is dependent
    expect(result.orderingEdgeProvenance[0]!.prerequisiteRep).toBe(result.uf.find('var'));
    expect(result.orderingEdgeProvenance[0]!.dependentRep).toBe(result.uf.find('rule'));
  });

  it('segment dep graph is acyclic after merge (S4)', () => {
    // Complex: 3 rules with circular depends-on
    const nodes = [node('r1', 'PricingRule'), node('r2', 'PricingRule'), node('r3', 'PricingRule')];
    const edges = [
      edge('r1', 'r2', 'depends-on'),
      edge('r2', 'r3', 'depends-on'),
      edge('r3', 'r1', 'depends-on'),
    ];
    const result = buildSegments(nodes, edges);
    // All 3 should be merged into 1 segment (circular deps)
    const comps = result.uf.components();
    expect(comps.size).toBe(1);
    // The segment dep graph should be empty (all self-loops after merge)
    let totalEdges = 0;
    for (const deps of result.segDepGraph.values()) {
      totalEdges += deps.length;
    }
    expect(totalEdges).toBe(0);
  });
});
