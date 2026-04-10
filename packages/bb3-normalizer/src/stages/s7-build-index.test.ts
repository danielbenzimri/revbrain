import { describe, expect, it } from 'vitest';
import { buildIndex } from './s7-build-index.ts';
import {
  resolvedRef,
  unresolvedRef,
  type FieldRefIR,
  type IRNodeBase,
} from '@revbrain/migration-ir-contract';

function directFieldRef(object: string, field: string, isResolved = true): FieldRefIR {
  return {
    kind: 'field',
    object,
    field,
    isCustom: field.endsWith('__c'),
    isCpqManaged: object.startsWith('SBQQ__') || field.startsWith('SBQQ__'),
    isResolved,
    ...(isResolved ? {} : { unresolvedReason: 'field-not-in-catalog' }),
  };
}

function dynamicRef(hint: string): FieldRefIR {
  return {
    kind: 'field',
    object: 'SBQQ__Quote__c',
    field: '<dynamic>',
    isCustom: false,
    isCpqManaged: true,
    isResolved: false,
    unresolvedReason: 'dynamic',
    hint,
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
      sourceFindingKeys: ['f-' + id],
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

describe('PH3.8 — buildIndex (Stage 7)', () => {
  it('byField populated from cpqFieldsRead', () => {
    const n = node('rule-1', {
      evidence: {
        sourceFindingKeys: ['f1'],
        classificationReasons: [],
        cpqFieldsRead: [directFieldRef('SBQQ__Quote__c', 'Amount__c')],
        cpqFieldsWritten: [],
        sourceSalesforceRecordIds: [],
        sourceCollectors: ['pricing'],
      },
    });
    const result = buildIndex({
      nodes: [n],
      syntheticEdges: [],
      projectedDescriptors: [],
    });
    expect(result.referenceIndex.byField['SBQQ__Quote__c.Amount__c']).toEqual(['rule-1']);
    expect(result.referenceIndex.byObject.SBQQ__Quote__c).toEqual(['rule-1']);
    expect(result.referenceIndex.byNodeId['rule-1']?.fields).toEqual(['SBQQ__Quote__c.Amount__c']);
  });

  it('byPath populated for path field refs', () => {
    const pathRef: FieldRefIR = {
      kind: 'path',
      rootObject: 'SBQQ__Quote__c',
      path: ['Account__r', 'Owner'],
      terminalField: 'Name',
      isCustom: false,
      isCpqManaged: true,
      isResolved: true,
    };
    const n = node('rule-1', {
      evidence: {
        sourceFindingKeys: ['f1'],
        classificationReasons: [],
        cpqFieldsRead: [pathRef],
        cpqFieldsWritten: [],
        sourceSalesforceRecordIds: [],
        sourceCollectors: ['pricing'],
      },
    });
    const result = buildIndex({
      nodes: [n],
      syntheticEdges: [],
      projectedDescriptors: [],
    });
    expect(result.referenceIndex.byPath['SBQQ__Quote__c.Account__r.Owner.Name']).toEqual([
      'rule-1',
    ]);
  });

  it('dynamic refs go to dynamicRefs bucket, not byField', () => {
    const n = node('rule-1', {
      evidence: {
        sourceFindingKeys: ['f1'],
        classificationReasons: [],
        cpqFieldsRead: [dynamicRef('fieldVar')],
        cpqFieldsWritten: [],
        sourceSalesforceRecordIds: [],
        sourceCollectors: ['pricing'],
      },
    });
    const result = buildIndex({
      nodes: [n],
      syntheticEdges: [],
      projectedDescriptors: [],
    });
    expect(result.referenceIndex.dynamicRefs).toEqual([{ nodeId: 'rule-1', hint: 'fieldVar' }]);
    expect(Object.keys(result.referenceIndex.byField).length).toBe(0);
  });

  it('unresolved refs go to unresolvedRefs bucket (AND still appear in byField)', () => {
    const n = node('rule-1', {
      evidence: {
        sourceFindingKeys: ['f1'],
        classificationReasons: [],
        cpqFieldsRead: [directFieldRef('SBQQ__Quote__c', 'Nope__c', false)],
        cpqFieldsWritten: [],
        sourceSalesforceRecordIds: [],
        sourceCollectors: ['pricing'],
      },
    });
    const result = buildIndex({
      nodes: [n],
      syntheticEdges: [],
      projectedDescriptors: [],
    });
    expect(result.referenceIndex.unresolvedRefs.length).toBe(1);
    expect(result.referenceIndex.unresolvedRefs[0]!.nodeId).toBe('rule-1');
    // byField still contains the entry — downstream can find the node;
    // resolution is a separate concern.
    expect(result.referenceIndex.byField['SBQQ__Quote__c.Nope__c']).toEqual(['rule-1']);
  });

  it('projected + synthetic edges merge into a single sorted edges[]', () => {
    const rule = node('rule-1', { conditions: [resolvedRef('cond-1')] });
    const cond = node('cond-1', { nodeType: 'PriceCondition' });
    const group = node('cycle-1', { nodeType: 'CyclicDependency' });
    const result = buildIndex({
      nodes: [rule, cond, group],
      syntheticEdges: [
        {
          sourceId: 'cycle-1',
          targetId: 'rule-1',
          edgeType: 'cycle-contains',
          sourceField: 'members',
        },
      ],
      projectedDescriptors: [{ fieldName: 'conditions', edgeType: 'parent-of' }],
    });
    expect(result.edges.length).toBe(2);
    // Sorted by sourceId: cycle-1 before rule-1
    expect(result.edges[0]!.sourceId).toBe('cycle-1');
    expect(result.edges[1]!.sourceId).toBe('rule-1');
  });

  it('NO edge has edgeType reads-field or writes-field (v1.2 field-access split)', () => {
    const n = node('rule-1', {
      evidence: {
        sourceFindingKeys: ['f1'],
        classificationReasons: [],
        cpqFieldsRead: [directFieldRef('Quote', 'Amount')],
        cpqFieldsWritten: [directFieldRef('Quote', 'Net')],
        sourceSalesforceRecordIds: [],
        sourceCollectors: ['pricing'],
      },
    });
    const result = buildIndex({
      nodes: [n],
      syntheticEdges: [],
      projectedDescriptors: [],
    });
    for (const e of result.edges) {
      expect(e.edgeType).not.toBe('reads-field');
      expect(e.edgeType).not.toBe('writes-field');
    }
  });

  it('duplicate projected edges collapse with a diagnostic', () => {
    // Two descriptors mapping the SAME field name to the SAME edge
    // type would produce duplicates. We simulate this by using the
    // same descriptor twice (the PH2.6 implementation pre-sorts and
    // iterates descriptors, so duplicates flow through to Stage 7).
    const rule = node('rule-1', { conditions: [resolvedRef('cond-1')] });
    const cond = node('cond-1', { nodeType: 'PriceCondition' });
    const result = buildIndex({
      nodes: [rule, cond],
      syntheticEdges: [
        {
          sourceId: 'rule-1',
          targetId: 'cond-1',
          edgeType: 'parent-of',
          sourceField: 'conditions',
        },
      ],
      projectedDescriptors: [{ fieldName: 'conditions', edgeType: 'parent-of' }],
    });
    // One projected + one synthetic colliding at the same edge tuple.
    // Stage 7 keeps ONE and fires a duplicate-edge diagnostic.
    expect(result.edges.length).toBe(1);
    expect(result.diagnostics.some((d) => d.code === 'BB3_E002')).toBe(true);
  });

  it('unresolved-ref-count is propagated from projectEdges', () => {
    const rule = node('rule-1', {
      conditions: [resolvedRef('cond-1'), unresolvedRef('orphaned')],
    });
    const result = buildIndex({
      nodes: [rule],
      syntheticEdges: [],
      projectedDescriptors: [{ fieldName: 'conditions', edgeType: 'parent-of' }],
    });
    expect(result.unresolvedRefCount).toBe(1);
  });

  it('every bucket is sorted deterministically', () => {
    const n1 = node('z-node', {
      evidence: {
        sourceFindingKeys: ['f1'],
        classificationReasons: [],
        cpqFieldsRead: [directFieldRef('Z', 'A')],
        cpqFieldsWritten: [],
        sourceSalesforceRecordIds: [],
        sourceCollectors: ['pricing'],
      },
    });
    const n2 = node('a-node', {
      evidence: {
        sourceFindingKeys: ['f2'],
        classificationReasons: [],
        cpqFieldsRead: [directFieldRef('Z', 'A')],
        cpqFieldsWritten: [],
        sourceSalesforceRecordIds: [],
        sourceCollectors: ['pricing'],
      },
    });
    const result = buildIndex({
      nodes: [n1, n2],
      syntheticEdges: [],
      projectedDescriptors: [],
    });
    expect(result.referenceIndex.byField['Z.A']).toEqual(['a-node', 'z-node']);
  });
});
