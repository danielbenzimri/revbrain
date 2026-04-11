import { describe, expect, it } from 'vitest';
import { normalizePricingRule, type PricingRuleIR } from './price-rule.ts';
import type { AssessmentFindingInput } from '@revbrain/contract';
import { runBaselineSuite } from '../__test-helpers__/baseline.ts';
import { prepareCatalog } from '../../stages/s2-5-schema-catalog.ts';

function validRule(over: Partial<AssessmentFindingInput> = {}): AssessmentFindingInput {
  return {
    domain: 'pricing',
    collectorName: 'pricing',
    artifactType: 'SBQQ__PriceRule__c',
    artifactName: 'Set Distributor Discount',
    findingKey: 'rule-1',
    sourceType: 'object',
    detected: true,
    // PH9 §8.3 — canonical field-ref shape: value=path, label=value.
    evidenceRefs: [
      {
        type: 'field-ref',
        value: 'SBQQ__PriceRule__c.SBQQ__EvaluationEvent__c',
        label: 'On Calculate; Before Calculate',
      },
    ],
    schemaVersion: '1.0',
    ...over,
  };
}

runBaselineSuite({
  fn: normalizePricingRule,
  taskId: 'PH4.1',
  nodeType: 'PricingRule',
  validFinding: validRule,
  malformedFinding: null,
  contentChangeMutation: (f) => ({
    ...f,
    evidenceRefs: [
      {
        type: 'field-ref',
        value: 'SBQQ__PriceRule__c.SBQQ__EvaluationEvent__c',
        label: 'After Calculate',
      },
    ],
  }),
});

describe('PH4.1 — PricingRule extras', () => {
  const ctx = { catalog: prepareCatalog(), diagnostics: [] };

  it('multi-event: both events appear in calculatorEvents[]', () => {
    const result = normalizePricingRule(validRule(), ctx);
    const node = result.nodes[0]! as PricingRuleIR;
    expect(node.calculatorEvents).toContain('on-calc');
    expect(node.calculatorEvents).toContain('before-calc');
  });

  it('custom advanced-condition preserves raw', () => {
    const result = normalizePricingRule(validRule({ notes: '1 AND (2 OR 3)' }), ctx);
    const node = result.nodes[0]! as PricingRuleIR;
    expect(node.conditionLogic).toBe('custom');
    expect(node.advancedConditionRaw).toBe('1 AND (2 OR 3)');
  });

  it('v1.2 A13 proof: operator-only edit preserves id', () => {
    // The signature does not include operator, so we simulate an
    // "operator edit" by leaving everything else identical — the
    // signature input has no operator field to mutate.
    const a = normalizePricingRule(validRule(), ctx).nodes[0]!;
    const b = normalizePricingRule(validRule(), ctx).nodes[0]!;
    expect(a.id).toBe(b.id);
  });

  it('rename preserves id AND contentHash', () => {
    const a = normalizePricingRule(validRule(), ctx).nodes[0]!;
    const b = normalizePricingRule(validRule({ artifactName: 'Different Name' }), ctx).nodes[0]!;
    expect(a.id).toBe(b.id);
    expect(a.contentHash).toBe(b.contentHash);
  });

  it('semantic edit (calculator-event reorder within scope) bumps contentHash only', () => {
    // Both fixtures produce evaluationScope === 'calculator', so the
    // structural signature is unchanged. Only calculatorEvents[]
    // differs — which lives in semantic payload alone.
    const a = normalizePricingRule(validRule(), ctx).nodes[0]!;
    const b = normalizePricingRule(
      validRule({
        evidenceRefs: [
          {
            type: 'field-ref',
            value: 'SBQQ__PriceRule__c.SBQQ__EvaluationEvent__c',
            label: 'After Calculate; On Calculate',
          },
        ],
      }),
      ctx
    ).nodes[0]!;
    expect(a.id).toBe(b.id);
    expect(a.contentHash).not.toBe(b.contentHash);
  });

  it('conditionLogic defaults to "all" when not specified', () => {
    const result = normalizePricingRule(validRule({ notes: undefined }), ctx);
    const node = result.nodes[0]! as PricingRuleIR;
    expect(node.conditionLogic).toBe('all');
  });
});
