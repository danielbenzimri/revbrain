import { describe, expect, it } from 'vitest';
import { validateGraph } from './s8-validate.ts';
import { VALIDATOR_CODES } from './diagnostic-codes.ts';
import {
  resolvedRef,
  type IREdge,
  type IRNodeBase,
  type ReferenceIndex,
} from '@revbrain/migration-ir-contract';

function emptyIndex(): ReferenceIndex {
  return {
    byObject: {},
    byField: {},
    byPath: {},
    byNodeId: {},
    dynamicRefs: [],
    unresolvedRefs: [],
  };
}

function node(
  id: string,
  over: Partial<IRNodeBase> & { conditions?: unknown; members?: unknown } = {}
): IRNodeBase {
  return {
    id,
    contentHash: 'h-' + id,
    nodeType: over.nodeType ?? 'PricingRule',
    displayName: id,
    warnings: [],
    evidence: {
      sourceFindingKeys: over.nodeType === 'CyclicDependency' ? [] : ['f-' + id],
      classificationReasons: [],
      cpqFieldsRead: [],
      cpqFieldsWritten: [],
      sourceSalesforceRecordIds: [],
      sourceCollectors: ['pricing'],
      ...(over.evidence ?? {}),
    },
    ...over,
  } as IRNodeBase;
}

describe('PH3.9 — validateGraph', () => {
  describe('V1 — edge round-trip (projected)', () => {
    it('projected edge with matching inline ref: no error', () => {
      const rule = node('r1', { conditions: [resolvedRef('c1')] });
      const cond = node('c1', { nodeType: 'PriceCondition' });
      const edges: IREdge[] = [
        { sourceId: 'r1', targetId: 'c1', edgeType: 'parent-of', sourceField: 'conditions' },
      ];
      const r = validateGraph(
        { nodes: [rule, cond], edges, referenceIndex: emptyIndex() },
        { strict: false, hasCatalog: true }
      );
      const v1Errors = r.diagnostics.filter((d) => d.code.startsWith('BB3_V1'));
      expect(v1Errors).toEqual([]);
    });

    it('projected edge without matching inline ref: fires V1a', () => {
      const rule = node('r1'); // no conditions field
      const cond = node('c1', { nodeType: 'PriceCondition' });
      const edges: IREdge[] = [
        { sourceId: 'r1', targetId: 'c1', edgeType: 'parent-of', sourceField: 'conditions' },
      ];
      const r = validateGraph(
        { nodes: [rule, cond], edges, referenceIndex: emptyIndex() },
        { strict: false, hasCatalog: true }
      );
      expect(
        r.diagnostics.some((d) => d.code === VALIDATOR_CODES.V1_PROJECTED_EDGE_MISSING_INLINE)
      ).toBe(true);
    });
  });

  describe('V1 — synthetic cycle-contains round-trip', () => {
    it('well-formed cycle group + 2 edges: no error', () => {
      const a = node('a');
      const b = node('b');
      const group = node('group-1', {
        nodeType: 'CyclicDependency',
        members: [resolvedRef('a'), resolvedRef('b')],
      });
      const edges: IREdge[] = [
        { sourceId: 'group-1', targetId: 'a', edgeType: 'cycle-contains', sourceField: 'members' },
        { sourceId: 'group-1', targetId: 'b', edgeType: 'cycle-contains', sourceField: 'members' },
      ];
      const r = validateGraph(
        { nodes: [a, b, group], edges, referenceIndex: emptyIndex() },
        { strict: false, hasCatalog: true }
      );
      const cycleErrors = r.diagnostics.filter((d) => d.code.startsWith('BB3_V1'));
      expect(cycleErrors).toEqual([]);
    });

    it('cycle-contains edge with non-CyclicDependency source: fires V1c', () => {
      const a = node('a');
      const b = node('b');
      const edges: IREdge[] = [
        { sourceId: 'a', targetId: 'b', edgeType: 'cycle-contains', sourceField: 'members' },
      ];
      const r = validateGraph(
        { nodes: [a, b], edges, referenceIndex: emptyIndex() },
        { strict: false, hasCatalog: true }
      );
      expect(
        r.diagnostics.some((d) => d.code === VALIDATOR_CODES.V1_SYNTHETIC_CYCLE_SOURCE_INVALID)
      ).toBe(true);
    });

    it('group member without a matching edge: fires V1e', () => {
      const a = node('a');
      const b = node('b');
      const group = node('group-1', {
        nodeType: 'CyclicDependency',
        members: [resolvedRef('a'), resolvedRef('b')],
      });
      // Only one edge — b is missing its cycle-contains edge.
      const edges: IREdge[] = [
        { sourceId: 'group-1', targetId: 'a', edgeType: 'cycle-contains', sourceField: 'members' },
      ];
      const r = validateGraph(
        { nodes: [a, b, group], edges, referenceIndex: emptyIndex() },
        { strict: false, hasCatalog: true }
      );
      expect(
        r.diagnostics.some((d) => d.code === VALIDATOR_CODES.V1_SYNTHETIC_CYCLE_MEMBER_MISSING_EDGE)
      ).toBe(true);
    });
  });

  describe('V2 — evidence.sourceFindingKeys', () => {
    it('non-composite with empty evidence: fires V2', () => {
      const n = node('a', {
        evidence: {
          sourceFindingKeys: [],
          classificationReasons: [],
          cpqFieldsRead: [],
          cpqFieldsWritten: [],
          sourceSalesforceRecordIds: [],
          sourceCollectors: [],
        },
      });
      const r = validateGraph(
        { nodes: [n], edges: [], referenceIndex: emptyIndex() },
        { strict: false, hasCatalog: true }
      );
      expect(r.diagnostics.some((d) => d.code === VALIDATOR_CODES.V2_EMPTY_EVIDENCE)).toBe(true);
    });

    it('CyclicDependency with empty evidence: allowed (composite)', () => {
      const group = node('g', { nodeType: 'CyclicDependency', members: [] });
      const r = validateGraph(
        { nodes: [group], edges: [], referenceIndex: emptyIndex() },
        { strict: false, hasCatalog: true }
      );
      expect(r.diagnostics.some((d) => d.code === VALIDATOR_CODES.V2_EMPTY_EVIDENCE)).toBe(false);
    });
  });

  describe('V3 — duplicate ids', () => {
    it('two nodes with the same id: fires V3', () => {
      const a1 = node('a');
      const a2 = node('a');
      const r = validateGraph(
        { nodes: [a1, a2], edges: [], referenceIndex: emptyIndex() },
        { strict: false, hasCatalog: true }
      );
      expect(r.diagnostics.some((d) => d.code === VALIDATOR_CODES.V3_DUPLICATE_ID)).toBe(true);
    });
  });

  describe('V4 — unresolved field refs', () => {
    it('with catalog + unresolvedRefs present: fires V4 per entry', () => {
      const n = node('a');
      const ri: ReferenceIndex = {
        ...emptyIndex(),
        unresolvedRefs: [
          {
            nodeId: 'a',
            reference: {
              kind: 'field',
              object: 'X',
              field: 'Y',
              isCustom: false,
              isCpqManaged: false,
              isResolved: false,
              unresolvedReason: 'field-not-in-catalog',
            },
            reason: 'field-not-in-catalog',
          },
        ],
      };
      const r = validateGraph(
        { nodes: [n], edges: [], referenceIndex: ri },
        { strict: false, hasCatalog: true }
      );
      expect(r.diagnostics.some((d) => d.code === VALIDATOR_CODES.V4_UNRESOLVED_FIELD_REF)).toBe(
        true
      );
    });

    it('without catalog: degrades with a V4D warning and skips per-entry checks', () => {
      const n = node('a');
      const r = validateGraph(
        { nodes: [n], edges: [], referenceIndex: emptyIndex() },
        { strict: false, hasCatalog: false }
      );
      expect(r.diagnostics.some((d) => d.code === VALIDATOR_CODES.V4_DEGRADED)).toBe(true);
    });
  });

  describe('V5 — cycle group well-formedness', () => {
    it('size < 2 fires V5', () => {
      const group = node('g', { nodeType: 'CyclicDependency', members: [resolvedRef('x')] });
      const x = node('x');
      const r = validateGraph(
        { nodes: [group, x], edges: [], referenceIndex: emptyIndex() },
        { strict: false, hasCatalog: true }
      );
      expect(r.diagnostics.some((d) => d.code === VALIDATOR_CODES.V5_CYCLE_WELL_FORMED)).toBe(true);
    });

    it('member referencing a missing node fires V5', () => {
      const group = node('g', {
        nodeType: 'CyclicDependency',
        members: [resolvedRef('x'), resolvedRef('missing')],
      });
      const x = node('x');
      const r = validateGraph(
        { nodes: [group, x], edges: [], referenceIndex: emptyIndex() },
        { strict: false, hasCatalog: true }
      );
      expect(r.diagnostics.some((d) => d.code === VALIDATOR_CODES.V5_CYCLE_WELL_FORMED)).toBe(true);
    });
  });

  describe('V8 — unresolved-ref ratio', () => {
    it('ratio above threshold fires V8', () => {
      const ri: ReferenceIndex = {
        ...emptyIndex(),
        byField: { 'A.B': ['n1'] }, // 1 resolved
        unresolvedRefs: [
          {
            nodeId: 'n1',
            reference: {
              kind: 'field',
              object: 'A',
              field: 'C',
              isCustom: false,
              isCpqManaged: false,
              isResolved: false,
            },
            reason: 'field-not-in-catalog',
          },
          {
            nodeId: 'n1',
            reference: {
              kind: 'field',
              object: 'A',
              field: 'D',
              isCustom: false,
              isCpqManaged: false,
              isResolved: false,
            },
            reason: 'field-not-in-catalog',
          },
        ],
      };
      const r = validateGraph(
        { nodes: [node('n1')], edges: [], referenceIndex: ri },
        { strict: false, hasCatalog: true, unresolvedRatioThreshold: 0.5 }
      );
      // 2 / (1 + 2) = 0.667 > 0.5 → fires
      expect(r.diagnostics.some((d) => d.code === VALIDATOR_CODES.V8_UNRESOLVED_RATIO)).toBe(true);
    });
  });

  describe('counts', () => {
    it('reports errorCount and warningCount', () => {
      const r = validateGraph(
        {
          nodes: [node('dup'), node('dup')],
          edges: [],
          referenceIndex: emptyIndex(),
        },
        { strict: false, hasCatalog: false }
      );
      expect(r.errorCount).toBeGreaterThan(0);
      expect(r.warningCount).toBeGreaterThan(0); // V4D
    });
  });

  describe('v1.2: field access does NOT become an edge', () => {
    it('a field in byField that is not in edges[] is CORRECT', () => {
      const n = node('rule-1', {
        evidence: {
          sourceFindingKeys: ['f1'],
          classificationReasons: [],
          cpqFieldsRead: [],
          cpqFieldsWritten: [],
          sourceSalesforceRecordIds: [],
          sourceCollectors: ['pricing'],
        },
      });
      const ri: ReferenceIndex = {
        ...emptyIndex(),
        byField: { 'SBQQ__Quote__c.Amount__c': ['rule-1'] },
      };
      const r = validateGraph(
        { nodes: [n], edges: [], referenceIndex: ri },
        { strict: false, hasCatalog: true }
      );
      // No V1 errors — field access is expected to be edge-invisible.
      expect(r.diagnostics.filter((d) => d.code.startsWith('BB3_V1'))).toEqual([]);
    });
  });
});
