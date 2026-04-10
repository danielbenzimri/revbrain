import { describe, expect, it } from 'vitest';
import { projectEdges, type NodeWithRefs } from './edge-projection.ts';
import { resolvedRef, unresolvedRef } from '@revbrain/migration-ir-contract';

describe('PH2.6 — projectEdges', () => {
  it('empty inputs produce zero edges', () => {
    const result = projectEdges([], []);
    expect(result.edges).toEqual([]);
    expect(result.unresolvedRefCount).toBe(0);
  });

  it('projects a single resolved ref into one edge', () => {
    const rule: NodeWithRefs = { id: 'rule-1', conditions: [resolvedRef('cond-1')] };
    const result = projectEdges([rule], [{ fieldName: 'conditions', edgeType: 'parent-of' }]);
    expect(result.edges).toEqual([
      {
        sourceId: 'rule-1',
        targetId: 'cond-1',
        edgeType: 'parent-of',
        sourceField: 'conditions',
      },
    ]);
    expect(result.unresolvedRefCount).toBe(0);
  });

  it('skips unresolved refs and increments the counter', () => {
    const rule: NodeWithRefs = {
      id: 'rule-1',
      conditions: [resolvedRef('cond-1'), unresolvedRef('orphaned', 'missing cond')],
    };
    const result = projectEdges([rule], [{ fieldName: 'conditions', edgeType: 'parent-of' }]);
    expect(result.edges.length).toBe(1);
    expect(result.unresolvedRefCount).toBe(1);
  });

  it('handles multiple NodeRef fields on one node', () => {
    const rule: NodeWithRefs = {
      id: 'rule-1',
      conditions: [resolvedRef('cond-1')],
      actions: [resolvedRef('act-1')],
    };
    const result = projectEdges(
      [rule],
      [
        { fieldName: 'conditions', edgeType: 'parent-of' },
        { fieldName: 'actions', edgeType: 'parent-of' },
      ]
    );
    expect(result.edges.length).toBe(2);
  });

  it('sorts output by (sourceId, targetId, edgeType)', () => {
    const nodeA: NodeWithRefs = { id: 'node-b', conditions: [resolvedRef('node-z')] };
    const nodeB: NodeWithRefs = { id: 'node-a', conditions: [resolvedRef('node-y')] };
    const result = projectEdges(
      [nodeA, nodeB],
      [{ fieldName: 'conditions', edgeType: 'depends-on' }]
    );
    expect(result.edges.map((e) => e.sourceId)).toEqual(['node-a', 'node-b']);
  });

  it('input order of nodes does not affect edge ordering', () => {
    const n1: NodeWithRefs = { id: 'a', conditions: [resolvedRef('x')] };
    const n2: NodeWithRefs = { id: 'b', conditions: [resolvedRef('y')] };
    const forward = projectEdges([n1, n2], [{ fieldName: 'conditions', edgeType: 'depends-on' }]);
    const reverse = projectEdges([n2, n1], [{ fieldName: 'conditions', edgeType: 'depends-on' }]);
    expect(forward.edges).toEqual(reverse.edges);
  });

  it('input order of descriptors does not affect edge ordering', () => {
    const node: NodeWithRefs = {
      id: 'rule-1',
      conditions: [resolvedRef('cond-1')],
      actions: [resolvedRef('act-1')],
    };
    const ab = projectEdges(
      [node],
      [
        { fieldName: 'actions', edgeType: 'parent-of' },
        { fieldName: 'conditions', edgeType: 'parent-of' },
      ]
    );
    const ba = projectEdges(
      [node],
      [
        { fieldName: 'conditions', edgeType: 'parent-of' },
        { fieldName: 'actions', edgeType: 'parent-of' },
      ]
    );
    expect(ab.edges).toEqual(ba.edges);
  });

  it('missing field on a node is treated as empty (no crash)', () => {
    const node: NodeWithRefs = { id: 'rule-1' };
    const result = projectEdges([node], [{ fieldName: 'conditions', edgeType: 'parent-of' }]);
    expect(result.edges).toEqual([]);
  });

  it('non-array value is treated as empty', () => {
    const node: NodeWithRefs = { id: 'rule-1', conditions: 'not an array' };
    const result = projectEdges([node], [{ fieldName: 'conditions', edgeType: 'parent-of' }]);
    expect(result.edges).toEqual([]);
  });

  it('supports metadata factory', () => {
    const rule: NodeWithRefs = { id: 'trigger-1', triggers: [resolvedRef('Quote__c')] };
    const result = projectEdges(
      [rule],
      [
        {
          fieldName: 'triggers',
          edgeType: 'triggers',
          metadata: () => ({ dmlEvent: 'insert' }),
        },
      ]
    );
    expect(result.edges[0]!.metadata?.dmlEvent).toBe('insert');
  });

  it('IREdge[] round-trips byte-identically via canonical sort', () => {
    const nodes: NodeWithRefs[] = [
      { id: 'b', conditions: [resolvedRef('c1')] },
      { id: 'a', conditions: [resolvedRef('c2')] },
    ];
    const a = projectEdges(nodes, [{ fieldName: 'conditions', edgeType: 'parent-of' }]);
    const b = projectEdges([...nodes].reverse(), [
      { fieldName: 'conditions', edgeType: 'parent-of' },
    ]);
    expect(JSON.stringify(a.edges)).toBe(JSON.stringify(b.edges));
  });
});
