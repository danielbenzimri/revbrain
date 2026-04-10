import { describe, expect, it } from 'vitest';
import {
  PROJECTED_EDGE_TYPES,
  SYNTHETIC_EDGE_TYPES,
  type IREdge,
  type IREdgeType,
} from './edge.ts';

describe('PH0.5 — IREdge + IREdgeType', () => {
  it('exposes exactly 9 edge types (8 projected + 1 synthetic)', () => {
    expect(PROJECTED_EDGE_TYPES.size).toBe(8);
    expect(SYNTHETIC_EDGE_TYPES.size).toBe(1);
  });

  it('projected and synthetic sets are disjoint', () => {
    for (const t of PROJECTED_EDGE_TYPES) {
      expect(SYNTHETIC_EDGE_TYPES.has(t)).toBe(false);
    }
    for (const t of SYNTHETIC_EDGE_TYPES) {
      expect(PROJECTED_EDGE_TYPES.has(t)).toBe(false);
    }
  });

  it('union of projected and synthetic covers the full IREdgeType union', () => {
    // Type-level exhaustiveness: every IREdgeType must be in exactly one set.
    const allTypes: IREdgeType[] = [
      'depends-on',
      'parent-of',
      'triggers',
      'consumes-variable',
      'uses-formula',
      'uses-discount-schedule',
      'calls',
      'references',
      'cycle-contains',
    ];
    for (const t of allTypes) {
      const inProjected = PROJECTED_EDGE_TYPES.has(t);
      const inSynthetic = SYNTHETIC_EDGE_TYPES.has(t);
      expect(inProjected !== inSynthetic).toBe(true); // XOR
    }
    expect(allTypes.length).toBe(PROJECTED_EDGE_TYPES.size + SYNTHETIC_EDGE_TYPES.size);
  });

  it.each<IREdgeType>([
    'depends-on',
    'parent-of',
    'triggers',
    'consumes-variable',
    'uses-formula',
    'uses-discount-schedule',
    'calls',
    'references',
    'cycle-contains',
  ])('constructs an edge of type %s', (edgeType) => {
    const edge: IREdge = {
      sourceId: 'node-a',
      targetId: 'node-b',
      edgeType,
      sourceField: 'conditions',
    };
    expect(edge.edgeType).toBe(edgeType);
  });

  it('carries optional metadata.dmlEvent for triggers', () => {
    const edge: IREdge = {
      sourceId: 'trigger-1',
      targetId: 'Quote__c',
      edgeType: 'triggers',
      sourceField: 'triggerObject',
      metadata: { dmlEvent: 'insert' },
    };
    expect(edge.metadata?.dmlEvent).toBe('insert');
  });

  it('IREdge[] round-trips via JSON.stringify (byte-identical)', () => {
    const edges: IREdge[] = [
      { sourceId: 'a', targetId: 'b', edgeType: 'depends-on', sourceField: 'dependencies' },
      { sourceId: 'a', targetId: 'c', edgeType: 'parent-of', sourceField: 'conditions' },
    ];
    const serialized = JSON.stringify(edges);
    const reparsed = JSON.parse(serialized) as IREdge[];
    expect(JSON.stringify(reparsed)).toBe(serialized);
  });
});
