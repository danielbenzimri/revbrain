import { describe, expect, it } from 'vitest';
import {
  computeSegmentId,
  computePersistentId,
  computeComplexity,
  materializeSegments,
} from '../src/materialize.ts';
import { UnionFind } from '../src/union-find.ts';
import type { IRNodeBase, IREdge } from '@revbrain/migration-ir-contract';

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

function edge(src: string, tgt: string, edgeType: IREdge['edgeType']): IREdge {
  return { sourceId: src, targetId: tgt, edgeType, sourceField: 'test' };
}

describe('SEG-2.1 — segment materialization', () => {
  describe('computeSegmentId', () => {
    it('same members → same id', () => {
      const a = computeSegmentId(['a', 'b', 'c']);
      const b = computeSegmentId(['a', 'b', 'c']);
      expect(a).toBe(b);
    });

    it('different members → different id', () => {
      const a = computeSegmentId(['a', 'b']);
      const b = computeSegmentId(['a', 'c']);
      expect(a).not.toBe(b);
    });

    it('format starts with seg:', () => {
      const id = computeSegmentId(['x']);
      expect(id.startsWith('seg:')).toBe(true);
    });

    it('no +, /, or = in the hash (base64url)', () => {
      const id = computeSegmentId(['test-node-with-long-id-to-get-variety']);
      const hashPart = id.slice(4); // after "seg:"
      expect(hashPart).not.toContain('+');
      expect(hashPart).not.toContain('/');
      expect(hashPart).not.toContain('=');
    });

    it('length-prefix prevents ambiguity: ["ab","c"] ≠ ["a","bc"]', () => {
      const a = computeSegmentId(['ab', 'c']);
      const b = computeSegmentId(['a', 'bc']);
      expect(a).not.toBe(b);
    });
  });

  describe('computePersistentId', () => {
    it('format is pseg:<full-root-id>', () => {
      expect(computePersistentId('abc123')).toBe('pseg:abc123');
    });

    it('uses full ID (no truncation)', () => {
      const longId = 'a'.repeat(100);
      expect(computePersistentId(longId)).toBe(`pseg:${longId}`);
    });
  });

  describe('computeComplexity', () => {
    it('single simple node → simple', () => {
      const { estimate, weight } = computeComplexity([node('a', 'Product', 'simple')]);
      expect(estimate).toBe('simple');
      expect(weight).toBe(1);
    });

    it('single complex node → complex', () => {
      const { estimate } = computeComplexity([node('a', 'Product', 'complex')]);
      expect(estimate).toBe('complex');
    });

    it('many simple nodes → bumped by log2(count)', () => {
      // 16 simple nodes: base=1, bump=floor(log2(16))=4, score=5 → moderate
      const members = Array.from({ length: 16 }, (_, i) => node(`n${i}`, 'Product', 'simple'));
      const { estimate } = computeComplexity(members);
      expect(estimate).toBe('moderate');
    });

    it('weight = sum of per-node weights', () => {
      const members = [
        node('a', 'X', 'simple'), // 1
        node('b', 'X', 'moderate'), // 3
        node('c', 'X', 'complex'), // 9
      ];
      const { weight } = computeComplexity(members);
      expect(weight).toBe(13);
    });

    it('unknown complexity defaults to weight 1', () => {
      const { weight } = computeComplexity([node('a', 'X')]);
      expect(weight).toBe(1);
    });
  });

  describe('materializeSegments', () => {
    it('single node → 1 segment with correct fields', () => {
      const uf = new UnionFind();
      uf.add('a');
      const n = [node('a', 'PricingRule')];
      const waves = new Map([['a', 0]]);

      const { segments, nodeToSegment } = materializeSegments(uf, n, [], waves);

      expect(segments).toHaveLength(1);
      const seg = segments[0]!;
      expect(seg.id.startsWith('seg:')).toBe(true);
      expect(seg.persistentId).toBe('pseg:a');
      expect(seg.label).toBe('PricingRule: Display a');
      expect(seg.rootNodeId).toBe('a');
      expect(seg.nodeCount).toBe(1);
      expect(seg.memberNodeIds).toEqual(['a']);
      expect(seg.migrationOrder).toBe(0);
      expect(seg.isVirtual).toBe(false);
      expect(nodeToSegment['a']).toBe(seg.id);
    });

    it('root is highest-authority node', () => {
      const uf = new UnionFind();
      uf.add('cond');
      uf.add('rule');
      uf.union('cond', 'rule');

      const n = [node('cond', 'PriceCondition'), node('rule', 'PricingRule')];
      const waves = new Map([[uf.find('rule'), 0]]);

      const { segments } = materializeSegments(uf, n, [], waves);
      // PricingRule (80) > PriceCondition (10)
      expect(segments[0]!.rootNodeId).toBe('rule');
    });

    it('persistentId stable when leaf added (T24)', () => {
      // Original: rule + cond1
      const uf1 = new UnionFind();
      uf1.add('rule');
      uf1.add('cond1');
      uf1.union('rule', 'cond1');
      const n1 = [node('rule', 'PricingRule'), node('cond1', 'PriceCondition')];
      const w1 = new Map([[uf1.find('rule'), 0]]);
      const { segments: s1 } = materializeSegments(uf1, n1, [], w1);

      // After: rule + cond1 + cond2
      const uf2 = new UnionFind();
      uf2.add('rule');
      uf2.add('cond1');
      uf2.add('cond2');
      uf2.union('rule', 'cond1');
      uf2.union('rule', 'cond2');
      const n2 = [
        node('rule', 'PricingRule'),
        node('cond1', 'PriceCondition'),
        node('cond2', 'PriceCondition'),
      ];
      const w2 = new Map([[uf2.find('rule'), 0]]);
      const { segments: s2 } = materializeSegments(uf2, n2, [], w2);

      // persistentId stable (root unchanged)
      expect(s1[0]!.persistentId).toBe(s2[0]!.persistentId);
      // id changed (membership changed)
      expect(s1[0]!.id).not.toBe(s2[0]!.id);
    });

    it('segments sorted by (migrationOrder ASC, id ASC)', () => {
      const uf = new UnionFind();
      uf.add('a');
      uf.add('b');
      uf.add('c');
      const n = [node('a'), node('b'), node('c')];
      const waves = new Map([
        ['a', 1],
        ['b', 0],
        ['c', 0],
      ]);
      const { segments } = materializeSegments(uf, n, [], waves);
      // Wave 0 first, then wave 1. Within wave 0, sorted by id.
      expect(segments[0]!.migrationOrder).toBe(0);
      expect(segments[1]!.migrationOrder).toBe(0);
      expect(segments[2]!.migrationOrder).toBe(1);
      // Within wave 0, stable sort by id
      expect(segments[0]!.id < segments[1]!.id).toBe(true);
    });

    it('nodeToSegment maps every member to its segment id', () => {
      const uf = new UnionFind();
      uf.add('x');
      uf.add('y');
      uf.union('x', 'y');
      const n = [node('x'), node('y')];
      const waves = new Map([[uf.find('x'), 0]]);
      const { segments, nodeToSegment } = materializeSegments(uf, n, [], waves);
      expect(nodeToSegment['x']).toBe(segments[0]!.id);
      expect(nodeToSegment['y']).toBe(segments[0]!.id);
    });
  });
});
