import { describe, expect, it } from 'vitest';
import { detectCycles } from './s6-detect-cycles.ts';
import type { IRNodeBase } from '@revbrain/migration-ir-contract';

function node(id: string, contentHash = 'h-' + id): IRNodeBase {
  return {
    id,
    contentHash,
    nodeType: 'PricingRule',
    displayName: 'Rule ' + id,
    warnings: [],
    evidence: {
      sourceFindingKeys: ['f-' + id],
      classificationReasons: [],
      cpqFieldsRead: [],
      cpqFieldsWritten: [],
      sourceSalesforceRecordIds: [],
      sourceCollectors: ['pricing'],
    },
  };
}

function edges(map: Record<string, string[]>): Map<string, readonly string[]> {
  return new Map(Object.entries(map));
}

describe('PH3.7 — detectCycles', () => {
  it('acyclic graph → no cycle groups, no edges', () => {
    const result = detectCycles({
      nodes: [node('A'), node('B'), node('C')],
      outEdges: edges({ A: ['B'], B: ['C'] }),
      bb3Version: '0.0.0',
    });
    expect(result.nodes.length).toBe(3);
    expect(result.syntheticEdges).toEqual([]);
    expect(result.selfLoopNodeIds).toEqual([]);
  });

  it('A→B→A: one CyclicDependencyIR with 2 members, both still in nodes[]', () => {
    const result = detectCycles({
      nodes: [node('A'), node('B')],
      outEdges: edges({ A: ['B'], B: ['A'] }),
      bb3Version: '0.0.0',
    });
    expect(result.nodes.length).toBe(3); // original 2 + 1 group
    const group = result.nodes.find((n) => n.nodeType === 'CyclicDependency');
    expect(group).toBeDefined();
    const groupCast = group as IRNodeBase & { members: Array<{ id: string; resolved: boolean }> };
    expect(groupCast.members.length).toBe(2);
    expect(groupCast.members.every((m) => m.resolved === true)).toBe(true);
    expect(groupCast.members.map((m) => m.id)).toEqual(['A', 'B']); // sorted
  });

  it('emits two cycle-contains edges (group → member direction)', () => {
    const result = detectCycles({
      nodes: [node('A'), node('B')],
      outEdges: edges({ A: ['B'], B: ['A'] }),
      bb3Version: '0.0.0',
    });
    expect(result.syntheticEdges.length).toBe(2);
    const group = result.nodes.find((n) => n.nodeType === 'CyclicDependency')!;
    for (const edge of result.syntheticEdges) {
      expect(edge.sourceId).toBe(group.id); // group is the source (v1.2)
      expect(['A', 'B']).toContain(edge.targetId);
      expect(edge.edgeType).toBe('cycle-contains');
      expect(edge.sourceField).toBe('members');
    }
  });

  it('v1.2 contentHash propagation: editing a member contentHash changes group contentHash', () => {
    const before = detectCycles({
      nodes: [node('A', 'h-A-v1'), node('B', 'h-B-v1')],
      outEdges: edges({ A: ['B'], B: ['A'] }),
      bb3Version: '0.0.0',
    });
    const after = detectCycles({
      nodes: [node('A', 'h-A-v2'), node('B', 'h-B-v1')], // A edited
      outEdges: edges({ A: ['B'], B: ['A'] }),
      bb3Version: '0.0.0',
    });
    const groupBefore = before.nodes.find((n) => n.nodeType === 'CyclicDependency')!;
    const groupAfter = after.nodes.find((n) => n.nodeType === 'CyclicDependency')!;
    // id stays stable (membership unchanged)
    expect(groupBefore.id).toBe(groupAfter.id);
    // contentHash changed (member contentHash propagated)
    expect(groupBefore.contentHash).not.toBe(groupAfter.contentHash);
  });

  it('v1.2 id stability: renaming a member (contentHash changes) does NOT change group id', () => {
    const before = detectCycles({
      nodes: [node('A', 'h-A-v1'), node('B', 'h-B-v1')],
      outEdges: edges({ A: ['B'], B: ['A'] }),
      bb3Version: '0.0.0',
    });
    const after = detectCycles({
      nodes: [node('A', 'h-A-v2'), node('B', 'h-B-v2')],
      outEdges: edges({ A: ['B'], B: ['A'] }),
      bb3Version: '0.0.0',
    });
    const groupBefore = before.nodes.find((n) => n.nodeType === 'CyclicDependency')!;
    const groupAfter = after.nodes.find((n) => n.nodeType === 'CyclicDependency')!;
    expect(groupBefore.id).toBe(groupAfter.id);
  });

  it('self-loop A→A: flagged as self-loop, no group node, no edges', () => {
    const result = detectCycles({
      nodes: [node('A')],
      outEdges: edges({ A: ['A'] }),
      bb3Version: '0.0.0',
    });
    expect(result.selfLoopNodeIds).toEqual(['A']);
    expect(result.syntheticEdges).toEqual([]);
    const group = result.nodes.find((n) => n.nodeType === 'CyclicDependency');
    expect(group).toBeUndefined();
  });

  it('3-node SCC A→B→C→A produces one group with 3 members and 3 edges', () => {
    const result = detectCycles({
      nodes: [node('A'), node('B'), node('C')],
      outEdges: edges({ A: ['B'], B: ['C'], C: ['A'] }),
      bb3Version: '0.0.0',
    });
    const group = result.nodes.find((n) => n.nodeType === 'CyclicDependency')!;
    const groupCast = group as IRNodeBase & { members: Array<{ id: string }>; sccSize: number };
    expect(groupCast.members.length).toBe(3);
    expect(groupCast.sccSize).toBe(3);
    expect(result.syntheticEdges.length).toBe(3);
  });

  it('input order does not affect output', () => {
    const a = detectCycles({
      nodes: [node('A'), node('B')],
      outEdges: edges({ A: ['B'], B: ['A'] }),
      bb3Version: '0.0.0',
    });
    const b = detectCycles({
      nodes: [node('B'), node('A')],
      outEdges: edges({ B: ['A'], A: ['B'] }),
      bb3Version: '0.0.0',
    });
    const groupA = a.nodes.find((n) => n.nodeType === 'CyclicDependency')!;
    const groupB = b.nodes.find((n) => n.nodeType === 'CyclicDependency')!;
    expect(groupA.id).toBe(groupB.id);
    expect(groupA.contentHash).toBe(groupB.contentHash);
  });
});
