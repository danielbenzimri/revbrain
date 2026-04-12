import { describe, expect, it } from 'vitest';
import {
  STRONG_EDGE_TYPES,
  ORDERING_EDGE_TYPES,
  HAZARD_EDGE_TYPES,
  ALL_CLASSIFIED_EDGE_TYPES,
  EXTERNAL_ALLOWED_EDGE_TYPES,
  classifyEdgeType,
  getOrderingDirection,
} from '../src/edge-classification.ts';
import type { IREdgeType } from '@revbrain/migration-ir-contract';

describe('SEG-1.1 — edge classification', () => {
  it('STRONG has exactly 2 entries', () => {
    expect(STRONG_EDGE_TYPES.size).toBe(2);
    expect(STRONG_EDGE_TYPES.has('parent-of')).toBe(true);
    expect(STRONG_EDGE_TYPES.has('cycle-contains')).toBe(true);
  });

  it('ORDERING has exactly 6 entries', () => {
    expect(ORDERING_EDGE_TYPES.size).toBe(6);
    expect(ORDERING_EDGE_TYPES.has('depends-on')).toBe(true);
    expect(ORDERING_EDGE_TYPES.has('references')).toBe(true);
    expect(ORDERING_EDGE_TYPES.has('calls')).toBe(true);
    expect(ORDERING_EDGE_TYPES.has('uses-formula')).toBe(true);
    expect(ORDERING_EDGE_TYPES.has('uses-discount-schedule')).toBe(true);
    expect(ORDERING_EDGE_TYPES.has('consumes-variable')).toBe(true);
  });

  it('HAZARD has exactly 1 entry (triggers)', () => {
    expect(HAZARD_EDGE_TYPES.size).toBe(1);
    expect(HAZARD_EDGE_TYPES.has('triggers')).toBe(true);
  });

  it('ALL_CLASSIFIED = STRONG ∪ ORDERING ∪ HAZARD, size = 9', () => {
    expect(ALL_CLASSIFIED_EDGE_TYPES.size).toBe(9);
    for (const t of STRONG_EDGE_TYPES) expect(ALL_CLASSIFIED_EDGE_TYPES.has(t)).toBe(true);
    for (const t of ORDERING_EDGE_TYPES) expect(ALL_CLASSIFIED_EDGE_TYPES.has(t)).toBe(true);
    for (const t of HAZARD_EDGE_TYPES) expect(ALL_CLASSIFIED_EDGE_TYPES.has(t)).toBe(true);
  });

  it('no overlap between the three sets', () => {
    for (const t of STRONG_EDGE_TYPES) {
      expect(ORDERING_EDGE_TYPES.has(t)).toBe(false);
      expect(HAZARD_EDGE_TYPES.has(t)).toBe(false);
    }
    for (const t of ORDERING_EDGE_TYPES) {
      expect(STRONG_EDGE_TYPES.has(t)).toBe(false);
      expect(HAZARD_EDGE_TYPES.has(t)).toBe(false);
    }
    for (const t of HAZARD_EDGE_TYPES) {
      expect(STRONG_EDGE_TYPES.has(t)).toBe(false);
      expect(ORDERING_EDGE_TYPES.has(t)).toBe(false);
    }
  });

  it('EXTERNAL_ALLOWED is a subset of ORDERING ∪ HAZARD', () => {
    for (const t of EXTERNAL_ALLOWED_EDGE_TYPES) {
      expect(STRONG_EDGE_TYPES.has(t)).toBe(false);
    }
  });

  it('classifyEdgeType returns the correct category', () => {
    expect(classifyEdgeType('parent-of')).toBe('strong');
    expect(classifyEdgeType('cycle-contains')).toBe('strong');
    expect(classifyEdgeType('depends-on')).toBe('ordering');
    expect(classifyEdgeType('references')).toBe('ordering');
    expect(classifyEdgeType('triggers')).toBe('hazard');
  });

  it('classifyEdgeType throws on unknown type', () => {
    expect(() => classifyEdgeType('invented-type' as IREdgeType)).toThrow(/unknown edge type/);
  });

  it('getOrderingDirection returns correct directions', () => {
    // For all ordering types, target is the prerequisite
    const dir = getOrderingDirection('depends-on');
    expect(dir.prerequisite).toBe('target');
    expect(dir.dependent).toBe('source');

    expect(getOrderingDirection('calls').prerequisite).toBe('target');
    expect(getOrderingDirection('consumes-variable').prerequisite).toBe('target');
  });

  it('getOrderingDirection throws for non-ordering types', () => {
    expect(() => getOrderingDirection('parent-of')).toThrow();
    expect(() => getOrderingDirection('triggers')).toThrow();
  });

  it('every ordering type has a direction entry', () => {
    for (const edgeType of ORDERING_EDGE_TYPES) {
      const dir = getOrderingDirection(edgeType);
      expect(dir.prerequisite).toBeDefined();
      expect(dir.dependent).toBeDefined();
      expect(dir.prerequisite).not.toBe(dir.dependent);
    }
  });
});
