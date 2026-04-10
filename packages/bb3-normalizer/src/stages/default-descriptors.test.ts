/**
 * PH9.1 — Tests for the default NodeRefFieldDescriptor table.
 */
import { describe, expect, it } from 'vitest';
import { DEFAULT_NODE_REF_DESCRIPTORS } from './default-descriptors.ts';
import { PROJECTED_EDGE_TYPES, SYNTHETIC_EDGE_TYPES } from '@revbrain/migration-ir-contract';
import { projectEdges } from '../graph/edge-projection.ts';

describe('PH9.1 — DEFAULT_NODE_REF_DESCRIPTORS', () => {
  it('is non-empty and frozen', () => {
    expect(DEFAULT_NODE_REF_DESCRIPTORS.length).toBeGreaterThan(0);
    expect(Object.isFrozen(DEFAULT_NODE_REF_DESCRIPTORS)).toBe(true);
  });

  it('every edgeType is a projected type, never synthetic', () => {
    for (const d of DEFAULT_NODE_REF_DESCRIPTORS) {
      expect(PROJECTED_EDGE_TYPES.has(d.edgeType)).toBe(true);
      expect(SYNTHETIC_EDGE_TYPES.has(d.edgeType)).toBe(false);
    }
  });

  it('entries are sorted by (fieldName, edgeType)', () => {
    const sorted = [...DEFAULT_NODE_REF_DESCRIPTORS].sort((a, b) => {
      if (a.fieldName !== b.fieldName) return a.fieldName < b.fieldName ? -1 : 1;
      return a.edgeType < b.edgeType ? -1 : a.edgeType > b.edgeType ? 1 : 0;
    });
    expect(DEFAULT_NODE_REF_DESCRIPTORS).toEqual(sorted);
  });

  it('no duplicate (fieldName, edgeType) pairs', () => {
    const seen = new Set<string>();
    for (const d of DEFAULT_NODE_REF_DESCRIPTORS) {
      const key = `${d.fieldName}:${d.edgeType}`;
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
  });

  it('covers the critical high-value parent-of fields from §5.3', () => {
    const parentOfFields = new Set(
      DEFAULT_NODE_REF_DESCRIPTORS.filter((d) => d.edgeType === 'parent-of').map((d) => d.fieldName)
    );
    // PricingRule + ConfigConstraint children
    expect(parentOfFields.has('conditions')).toBe(true);
    expect(parentOfFields.has('actions')).toBe(true);
    // BundleStructure children
    expect(parentOfFields.has('options')).toBe(true);
    expect(parentOfFields.has('features')).toBe(true);
    expect(parentOfFields.has('constraints')).toBe(true);
    expect(parentOfFields.has('configurationAttributes')).toBe(true);
    // DiscountSchedule children
    expect(parentOfFields.has('tiers')).toBe(true);
    // Product → BundleStructure (singleton)
    expect(parentOfFields.has('bundleStructure')).toBe(true);
  });

  it('covers the critical non-parent-of projected fields', () => {
    const byField = new Map(DEFAULT_NODE_REF_DESCRIPTORS.map((d) => [d.fieldName, d.edgeType]));
    expect(byField.get('dependencies')).toBe('depends-on');
    expect(byField.get('summaryVariablesConsumed')).toBe('consumes-variable');
    expect(byField.get('discountSchedule')).toBe('uses-discount-schedule');
    expect(byField.get('relatedRules')).toBe('references');
    expect(byField.get('usedBy')).toBe('references');
    expect(byField.get('consumers')).toBe('references');
  });

  // Back-pointer fields MUST NOT be projected — they'd double-count
  // every parent-of edge that Stage 4 emits from the parent's array
  // side. The spec is explicit (§5.1a): projection uses the parent's
  // children array, not the child's back-pointer.
  it('does NOT project back-pointer fields (ownerRule, parentBundle, etc.)', () => {
    const fields = new Set(DEFAULT_NODE_REF_DESCRIPTORS.map((d) => d.fieldName));
    expect(fields.has('ownerRule')).toBe(false);
    expect(fields.has('parentBundle')).toBe(false);
    expect(fields.has('parentProduct')).toBe(false);
    expect(fields.has('parentSchedule')).toBe(false);
    expect(fields.has('parentProductId')).toBe(false);
  });

  it('projectEdges() using the default table produces edges for an array field', () => {
    const rule = {
      id: 'rule:a',
      nodeType: 'PricingRule',
      conditions: [
        { id: 'cond:1', resolved: true },
        { id: 'cond:2', resolved: true },
      ],
    };
    const { edges } = projectEdges([rule], DEFAULT_NODE_REF_DESCRIPTORS);
    const parentOfEdges = edges.filter((e) => e.edgeType === 'parent-of');
    expect(parentOfEdges).toHaveLength(2);
    expect(parentOfEdges.every((e) => e.sourceId === 'rule:a')).toBe(true);
    expect(parentOfEdges.map((e) => e.targetId).sort()).toEqual(['cond:1', 'cond:2']);
  });

  it('projectEdges() using the default table handles singleton NodeRef | null', () => {
    const product = {
      id: 'prod:a',
      nodeType: 'Product',
      bundleStructure: { id: 'bundle:a', resolved: true },
    };
    const productNoBundle = {
      id: 'prod:b',
      nodeType: 'Product',
      bundleStructure: null,
    };
    const { edges } = projectEdges([product, productNoBundle], DEFAULT_NODE_REF_DESCRIPTORS);
    const bundleEdges = edges.filter((e) => e.sourceField === 'bundleStructure');
    expect(bundleEdges).toHaveLength(1);
    expect(bundleEdges[0]?.sourceId).toBe('prod:a');
    expect(bundleEdges[0]?.targetId).toBe('bundle:a');
    expect(bundleEdges[0]?.edgeType).toBe('parent-of');
  });

  it('projectEdges() ignores unresolved refs', () => {
    const rule = {
      id: 'rule:x',
      conditions: [
        { id: 'cond:1', resolved: true },
        { id: 'missing', resolved: false },
      ],
    };
    const { edges, unresolvedRefCount } = projectEdges([rule], DEFAULT_NODE_REF_DESCRIPTORS);
    expect(edges).toHaveLength(1);
    expect(unresolvedRefCount).toBe(1);
  });
});
