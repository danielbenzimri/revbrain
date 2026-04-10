import { describe, expect, it } from 'vitest';
import { resolveReferences } from './s4-resolve-refs.ts';
import type { IRNodeBase } from '@revbrain/migration-ir-contract';

function draft(over: Partial<IRNodeBase> & { id: string }): IRNodeBase {
  const { id, contentHash, nodeType, displayName, warnings, evidence, ...rest } = over;
  return {
    id,
    contentHash: contentHash ?? 'h-' + id,
    nodeType: nodeType ?? 'PricingRule',
    displayName: displayName ?? 'Rule ' + id,
    warnings: warnings ?? [],
    evidence: {
      sourceFindingKeys: ['f-' + id],
      classificationReasons: [],
      cpqFieldsRead: [],
      cpqFieldsWritten: [],
      sourceSalesforceRecordIds: [],
      sourceCollectors: ['pricing'],
      ...(evidence ?? {}),
    },
    ...rest,
  } as IRNodeBase;
}

describe('PH3.5 — resolveReferences', () => {
  it('pass-through: distinct ids produce distinct nodes', () => {
    const a = draft({ id: 'a' });
    const b = draft({ id: 'b' });
    const result = resolveReferences({ drafts: [a, b] });
    expect(result.nodes.length).toBe(2);
    expect(result.nodes.map((n) => n.id)).toEqual(['a', 'b']);
  });

  it('same id from two collectors: merged into one with unioned evidence', () => {
    const a = draft({
      id: 'x',
      evidence: {
        sourceFindingKeys: ['f-pricing-1'],
        classificationReasons: [],
        cpqFieldsRead: [],
        cpqFieldsWritten: [],
        sourceSalesforceRecordIds: [],
        sourceCollectors: ['pricing'],
      },
    });
    const b = draft({
      id: 'x',
      evidence: {
        sourceFindingKeys: ['f-dep-1'],
        classificationReasons: [],
        cpqFieldsRead: [],
        cpqFieldsWritten: [],
        sourceSalesforceRecordIds: [],
        sourceCollectors: ['dependency'],
      },
    });
    const result = resolveReferences({ drafts: [a, b] });
    expect(result.nodes.length).toBe(1);
    const merged = result.nodes[0]!;
    expect(merged.evidence.sourceCollectors.sort()).toEqual(['dependency', 'pricing']);
    expect(merged.evidence.sourceFindingKeys.sort()).toEqual(['f-dep-1', 'f-pricing-1']);
  });

  it('output is sorted by id', () => {
    const result = resolveReferences({
      drafts: [draft({ id: 'z' }), draft({ id: 'a' }), draft({ id: 'm' })],
    });
    expect(result.nodes.map((n) => n.id)).toEqual(['a', 'm', 'z']);
  });

  it('input order does not affect output (deterministic)', () => {
    const a = resolveReferences({
      drafts: [draft({ id: 'a' }), draft({ id: 'b' }), draft({ id: 'c' })],
    });
    const b = resolveReferences({
      drafts: [draft({ id: 'c' }), draft({ id: 'a' }), draft({ id: 'b' })],
    });
    expect(a.nodes.map((n) => n.id)).toEqual(b.nodes.map((n) => n.id));
  });

  it('scalar disagreement on a known-authority field records a merge warning', () => {
    const a = draft({
      id: 'x',
      evidence: {
        sourceFindingKeys: ['pricing'],
        classificationReasons: [],
        cpqFieldsRead: [],
        cpqFieldsWritten: [],
        sourceSalesforceRecordIds: [],
        sourceCollectors: ['pricing'],
      },
    }) as IRNodeBase & { evaluationScope: string };
    a.evaluationScope = 'calculator';
    const b = draft({
      id: 'x',
      evidence: {
        sourceFindingKeys: ['dep'],
        classificationReasons: [],
        cpqFieldsRead: [],
        cpqFieldsWritten: [],
        sourceSalesforceRecordIds: [],
        sourceCollectors: ['dependency'],
      },
    }) as IRNodeBase & { evaluationScope: string };
    b.evaluationScope = 'configurator';

    const result = resolveReferences({ drafts: [a, b] });
    expect(result.mergeWarnings.length).toBeGreaterThan(0);
    // Pricing has authority 10 on evaluationScope; dependency has 5.
    const mergedScope = (result.nodes[0]! as IRNodeBase & { evaluationScope: string })
      .evaluationScope;
    expect(mergedScope).toBe('calculator');
  });

  it('empty input → empty output, no throw', () => {
    const result = resolveReferences({ drafts: [] });
    expect(result.nodes).toEqual([]);
    expect(result.quarantine).toEqual([]);
  });
});

describe('PH9.3 — parent-child wiring', () => {
  it('PriceCondition with matching parent → appears in PricingRule.conditions + back-pointer rewritten', () => {
    const rule = draft({
      id: 'rule:hash:abc',
      nodeType: 'PricingRule',
      evidence: {
        sourceFindingKeys: ['f-rule-1'],
        classificationReasons: [],
        cpqFieldsRead: [],
        cpqFieldsWritten: [],
        sourceSalesforceRecordIds: ['a001000000000001'],
        sourceCollectors: ['pricing'],
      },
    }) as IRNodeBase & { conditions: unknown };
    rule.conditions = [];

    const cond = draft({
      id: 'cond:hash:def',
      nodeType: 'PriceCondition',
      evidence: {
        sourceFindingKeys: ['f-cond-1'],
        classificationReasons: [],
        cpqFieldsRead: [],
        cpqFieldsWritten: [],
        sourceSalesforceRecordIds: ['a002000000000001'],
        sourceCollectors: ['pricing'],
      },
    }) as IRNodeBase & { ownerRule: unknown };
    cond.ownerRule = { id: 'a001000000000001', resolved: true };

    const result = resolveReferences({ drafts: [rule, cond] });
    expect(result.quarantine).toHaveLength(0);

    const mergedRule = result.nodes.find((n) => n.nodeType === 'PricingRule') as IRNodeBase & {
      conditions: { id: string; resolved: boolean }[];
    };
    expect(mergedRule.conditions).toEqual([{ id: 'cond:hash:def', resolved: true }]);

    const mergedCond = result.nodes.find((n) => n.nodeType === 'PriceCondition') as IRNodeBase & {
      ownerRule: { id: string; resolved: boolean };
    };
    expect(mergedCond.ownerRule).toEqual({ id: 'rule:hash:abc', resolved: true });
  });

  it('PriceCondition with missing parent → orphaned quarantine + back-pointer flipped to unresolved, node preserved', () => {
    const cond = draft({
      id: 'cond:orphan',
      nodeType: 'PriceCondition',
      evidence: {
        sourceFindingKeys: ['f-orphan'],
        classificationReasons: [],
        cpqFieldsRead: [],
        cpqFieldsWritten: [],
        sourceSalesforceRecordIds: ['a002000000000001'],
        sourceCollectors: ['pricing'],
      },
    }) as IRNodeBase & { ownerRule: unknown };
    cond.ownerRule = { id: 'a001999999999999', resolved: true };

    const result = resolveReferences({ drafts: [cond] });
    expect(result.quarantine).toHaveLength(1);
    expect(result.quarantine[0]?.reason).toBe('orphaned-reference');
    expect(result.quarantine[0]?.findingKey).toBe('f-orphan');
    // The orphaned child is PRESERVED in the final node list (spec §6.1
    // Stage 4 explicitly says "preserve the draft's evidence, not deletion").
    const survivor = result.nodes.find((n) => n.id === 'cond:orphan') as
      | (IRNodeBase & { ownerRule: { id: string | null; resolved: boolean; reason?: string } })
      | undefined;
    expect(survivor).toBeDefined();
    // Back-pointer flipped to a full UnresolvedNodeRef so downstream
    // stages carry the orphaned reason + hint.
    expect(survivor?.ownerRule.resolved).toBe(false);
    expect(survivor?.ownerRule.id).toBeNull();
    expect(survivor?.ownerRule.reason).toBe('orphaned');
  });

  it('BundleOption with synthetic parentBundle → resolved into BundleStructure.options', () => {
    const structure = draft({
      id: 'bundle:hash:A',
      nodeType: 'BundleStructure',
    }) as IRNodeBase & { parentProductCode: string; options: unknown };
    structure.parentProductCode = 'SBQQ__Bundle__c.PROD-1';
    structure.options = [];

    const option = draft({
      id: 'opt:hash:B',
      nodeType: 'BundleOption',
    }) as IRNodeBase & { parentBundle: unknown };
    option.parentBundle = { id: 'bundle:SBQQ__Bundle__c.PROD-1', resolved: true };

    const result = resolveReferences({ drafts: [structure, option] });
    expect(result.quarantine).toHaveLength(0);

    const mergedStruct = result.nodes.find(
      (n) => n.nodeType === 'BundleStructure'
    ) as IRNodeBase & {
      options: { id: string; resolved: boolean }[];
    };
    expect(mergedStruct.options).toEqual([{ id: 'opt:hash:B', resolved: true }]);

    const mergedOption = result.nodes.find((n) => n.nodeType === 'BundleOption') as IRNodeBase & {
      parentBundle: { id: string; resolved: boolean };
    };
    expect(mergedOption.parentBundle).toEqual({ id: 'bundle:hash:A', resolved: true });
  });

  it('multiple children are sorted by id in the parent array (determinism)', () => {
    const rule = draft({
      id: 'rule:hash:abc',
      nodeType: 'PricingRule',
      evidence: {
        sourceFindingKeys: ['f-r'],
        classificationReasons: [],
        cpqFieldsRead: [],
        cpqFieldsWritten: [],
        sourceSalesforceRecordIds: ['a001'],
        sourceCollectors: ['pricing'],
      },
    }) as IRNodeBase & { conditions: unknown };
    rule.conditions = [];

    const makeCond = (id: string) => {
      const c = draft({
        id,
        nodeType: 'PriceCondition',
        evidence: {
          sourceFindingKeys: ['f-' + id],
          classificationReasons: [],
          cpqFieldsRead: [],
          cpqFieldsWritten: [],
          sourceSalesforceRecordIds: [`x-${id}`],
          sourceCollectors: ['pricing'],
        },
      }) as IRNodeBase & { ownerRule: unknown };
      c.ownerRule = { id: 'a001', resolved: true };
      return c;
    };

    // Insert in reverse order; result should still be sorted
    const result = resolveReferences({
      drafts: [makeCond('cond:z'), makeCond('cond:a'), makeCond('cond:m'), rule],
    });

    const mergedRule = result.nodes.find((n) => n.nodeType === 'PricingRule') as IRNodeBase & {
      conditions: { id: string }[];
    };
    expect(mergedRule.conditions.map((c) => c.id)).toEqual(['cond:a', 'cond:m', 'cond:z']);
  });

  it('PriceAction is wired into PricingRule.actions (not conditions)', () => {
    const rule = draft({
      id: 'rule:hash:r1',
      nodeType: 'PricingRule',
      evidence: {
        sourceFindingKeys: ['f-r'],
        classificationReasons: [],
        cpqFieldsRead: [],
        cpqFieldsWritten: [],
        sourceSalesforceRecordIds: ['a001'],
        sourceCollectors: ['pricing'],
      },
    }) as IRNodeBase & { conditions: unknown; actions: unknown };
    rule.conditions = [];
    rule.actions = [];

    const action = draft({
      id: 'act:hash:1',
      nodeType: 'PriceAction',
    }) as IRNodeBase & { ownerRule: unknown };
    action.ownerRule = { id: 'a001', resolved: true };

    const result = resolveReferences({ drafts: [rule, action] });
    const mergedRule = result.nodes.find((n) => n.nodeType === 'PricingRule') as IRNodeBase & {
      conditions: unknown[];
      actions: { id: string }[];
    };
    expect(mergedRule.conditions).toEqual([]);
    expect(mergedRule.actions.map((a) => a.id)).toEqual(['act:hash:1']);
  });

  it('identity merge and parent wiring compose (merge happens first)', () => {
    // Two drafts of the same PricingRule from different collectors,
    // plus a PriceCondition pointing at them. The merged rule should
    // pick up the condition in its `conditions` array.
    const ruleA = draft({
      id: 'rule:merged',
      nodeType: 'PricingRule',
      evidence: {
        sourceFindingKeys: ['f-ra'],
        classificationReasons: [],
        cpqFieldsRead: [],
        cpqFieldsWritten: [],
        sourceSalesforceRecordIds: ['a001'],
        sourceCollectors: ['pricing'],
      },
    }) as IRNodeBase & { conditions: unknown };
    ruleA.conditions = [];

    const ruleB = draft({
      id: 'rule:merged',
      nodeType: 'PricingRule',
      evidence: {
        sourceFindingKeys: ['f-rb'],
        classificationReasons: [],
        cpqFieldsRead: [],
        cpqFieldsWritten: [],
        sourceSalesforceRecordIds: ['a001'],
        sourceCollectors: ['dependency'],
      },
    }) as IRNodeBase & { conditions: unknown };
    ruleB.conditions = [];

    const cond = draft({
      id: 'cond:1',
      nodeType: 'PriceCondition',
      evidence: {
        sourceFindingKeys: ['f-c1'],
        classificationReasons: [],
        cpqFieldsRead: [],
        cpqFieldsWritten: [],
        sourceSalesforceRecordIds: ['a002'],
        sourceCollectors: ['pricing'],
      },
    }) as IRNodeBase & { ownerRule: unknown };
    cond.ownerRule = { id: 'a001', resolved: true };

    const result = resolveReferences({ drafts: [ruleA, ruleB, cond] });
    // One merged rule + one condition = 2 nodes.
    expect(result.nodes.length).toBe(2);
    const mergedRule = result.nodes.find((n) => n.nodeType === 'PricingRule') as IRNodeBase & {
      conditions: { id: string }[];
    };
    expect(mergedRule.conditions.map((c) => c.id)).toEqual(['cond:1']);
  });
});
