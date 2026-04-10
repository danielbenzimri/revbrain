import { describe, expect, it } from 'vitest';
import { normalizeApexTrigger } from './apex-trigger.ts';
import type { AssessmentFindingInput } from '@revbrain/contract';
import type { ApexTriggerAutomationIR } from '@revbrain/migration-ir-contract';
import { runBaselineSuite } from '../__test-helpers__/baseline.ts';
import { prepareCatalog } from '../../stages/s2-5-schema-catalog.ts';

function validTrigger(over: Partial<AssessmentFindingInput> = {}): AssessmentFindingInput {
  return {
    domain: 'dependency',
    collectorName: 'dependency',
    artifactType: 'ApexTrigger',
    artifactName: 'QuoteTrigger',
    findingKey: 'at-1',
    sourceType: 'metadata',
    detected: true,
    textValue: 'trigger QuoteTrigger on SBQQ__Quote__c (before insert, before update) {\n}',
    evidenceRefs: [],
    schemaVersion: '1.0',
    ...over,
  };
}

runBaselineSuite({
  fn: normalizeApexTrigger,
  taskId: 'PH5.2',
  nodeType: 'ApexTriggerAutomationIR',
  validFinding: validTrigger,
  malformedFinding: null,
  renameMutation: (f) => ({ ...f, artifactId: 'a0V3x00000newid' }),
  contentChangeMutation: (f) => ({ ...f, textValue: (f.textValue ?? '') + '\n// edit' }),
});

describe('PH5.2 — ApexTriggerAutomationIR extras', () => {
  const ctx = { catalog: prepareCatalog(), diagnostics: [] };

  it('sourceType is ApexTrigger', () => {
    const result = normalizeApexTrigger(validTrigger(), ctx);
    expect(result.nodes[0]!).toMatchObject({ sourceType: 'ApexTrigger' });
  });

  it('parses triggerObject from the declaration', () => {
    const result = normalizeApexTrigger(validTrigger(), ctx);
    const node = result.nodes[0]! as ApexTriggerAutomationIR;
    expect(node.triggerObject).toBe('SBQQ__Quote__c');
  });

  it('parses triggerEvents (insert + update, deduped, sorted)', () => {
    const result = normalizeApexTrigger(validTrigger(), ctx);
    const node = result.nodes[0]! as ApexTriggerAutomationIR;
    expect(node.triggerEvents).toEqual(['insert', 'update']);
  });

  it('unknown trigger header falls back to <unknown>', () => {
    const result = normalizeApexTrigger(validTrigger({ textValue: 'not a trigger' }), ctx);
    const node = result.nodes[0]! as ApexTriggerAutomationIR;
    expect(node.triggerObject).toBe('<unknown>');
  });
});
