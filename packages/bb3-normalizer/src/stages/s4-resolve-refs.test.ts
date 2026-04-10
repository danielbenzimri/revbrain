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
