import { describe, expect, it } from 'vitest';
import { normalizeApprovalChainRule } from './approval-chain-rule.ts';
import type { AssessmentFindingInput } from '@revbrain/contract';
import { runBaselineSuite } from '../__test-helpers__/baseline.ts';
import { prepareCatalog } from '../../stages/s2-5-schema-catalog.ts';

function validACR(over: Partial<AssessmentFindingInput> = {}): AssessmentFindingInput {
  return {
    domain: 'approvals',
    collectorName: 'approvals',
    artifactType: 'sbaa__ApprovalChainRule__c',
    artifactName: 'sbaa__Standard_Chain',
    findingKey: 'acr-1',
    sourceType: 'object',
    detected: true,
    countValue: 2,
    evidenceRefs: [{ type: 'object-ref', value: 'SBQQ__Quote__c' }],
    schemaVersion: '1.0',
    ...over,
  };
}

runBaselineSuite({
  fn: normalizeApprovalChainRule,
  taskId: 'PH6.3',
  nodeType: 'ApprovalChainRule',
  validFinding: validACR,
  malformedFinding: null,
  renameMutation: (f) => ({ ...f, artifactId: 'a0V3x00000newid' }),
  contentChangeMutation: (f) => ({ ...f, countValue: (f.countValue ?? 0) + 1 }),
});

describe('PH6.3 — ApprovalChainRule namespace', () => {
  it('preserves sbaa namespace', () => {
    const result = normalizeApprovalChainRule(validACR(), {
      catalog: prepareCatalog(),
      diagnostics: [],
    });
    expect(result.nodes[0]!.namespace).toBe('sbaa');
  });
});
