import { describe, expect, it } from 'vitest';
import { normalizeWorkflowRule } from './workflow-rule.ts';
import type { AssessmentFindingInput } from '@revbrain/contract';
import type { WorkflowRuleAutomationIR } from '@revbrain/migration-ir-contract';
import { runBaselineSuite } from '../__test-helpers__/baseline.ts';
import { prepareCatalog } from '../../stages/s2-5-schema-catalog.ts';

function validWR(over: Partial<AssessmentFindingInput> = {}): AssessmentFindingInput {
  return {
    domain: 'dependency',
    collectorName: 'dependency',
    artifactType: 'WorkflowRule',
    artifactName: 'Notify_On_Discount',
    findingKey: 'wr-1',
    sourceType: 'metadata',
    detected: true,
    notes: 'on create or update',
    textValue: 'Discount__c > 20',
    evidenceRefs: [{ type: 'object-ref', value: 'SBQQ__Quote__c' }],
    schemaVersion: '1.0',
    ...over,
  };
}

runBaselineSuite({
  fn: normalizeWorkflowRule,
  taskId: 'PH5.4',
  nodeType: 'WorkflowRuleAutomationIR',
  validFinding: validWR,
  malformedFinding: null,
  renameMutation: (f) => ({ ...f, artifactId: 'a0V3x00000newid' }),
  contentChangeMutation: (f) => ({ ...f, textValue: 'Discount__c > 30' }),
});

describe('PH5.4 — WorkflowRuleAutomationIR extras', () => {
  const ctx = { catalog: prepareCatalog(), diagnostics: [] };

  it('sourceType is WorkflowRule', () => {
    const result = normalizeWorkflowRule(validWR(), ctx);
    expect(result.nodes[0]!).toMatchObject({ sourceType: 'WorkflowRule' });
  });

  it('parses evaluationCriteria', () => {
    const r1 = normalizeWorkflowRule(validWR({ notes: 'on create' }), ctx);
    const r2 = normalizeWorkflowRule(validWR({ notes: 'on create or update' }), ctx);
    expect((r1.nodes[0]! as WorkflowRuleAutomationIR).evaluationCriteria).toBe('on-create');
    expect((r2.nodes[0]! as WorkflowRuleAutomationIR).evaluationCriteria).toBe(
      'on-create-or-update'
    );
  });

  it('preserves targetObject from evidenceRefs', () => {
    const result = normalizeWorkflowRule(validWR(), ctx);
    expect((result.nodes[0]! as WorkflowRuleAutomationIR).targetObject).toBe('SBQQ__Quote__c');
  });
});
