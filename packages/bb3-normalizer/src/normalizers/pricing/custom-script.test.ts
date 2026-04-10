import { describe, expect, it } from 'vitest';
import { normalizeCustomScript, type CustomComputationIR } from './custom-script.ts';
import type { AssessmentFindingInput } from '@revbrain/contract';
import { runBaselineSuite } from '../__test-helpers__/baseline.ts';
import { prepareCatalog } from '../../stages/s2-5-schema-catalog.ts';

function validCS(over: Partial<AssessmentFindingInput> = {}): AssessmentFindingInput {
  return {
    domain: 'pricing',
    collectorName: 'pricing',
    artifactType: 'SBQQ__CustomScript__c',
    artifactName: 'ComputeRoyalty',
    findingKey: 'cs-1',
    sourceType: 'object',
    detected: true,
    textValue: 'function compute(q) { return q.amount * 0.1; }',
    evidenceRefs: [],
    schemaVersion: '1.0',
    ...over,
  };
}

runBaselineSuite({
  fn: normalizeCustomScript,
  taskId: 'PH6.11',
  nodeType: 'CustomComputation',
  validFinding: validCS,
  malformedFinding: null,
  renameMutation: (f) => ({ ...f, artifactId: 'a0V3x00000newid' }),
  contentChangeMutation: (f) => ({
    ...f,
    textValue: (f.textValue ?? '') + '\n// new version',
  }),
});

describe('PH6.11 — CustomComputation QCP placeholder', () => {
  const ctx = { catalog: prepareCatalog(), diagnostics: [] };

  it('parseStatus is deferred-to-bb3b', () => {
    const result = normalizeCustomScript(validCS(), ctx);
    const node = result.nodes[0]! as CustomComputationIR;
    expect(node.parseStatus).toBe('deferred-to-bb3b');
    expect(node.functionName).toBeNull();
  });

  it('preserves rawSource verbatim', () => {
    const source = 'function foo() { return "magic"; }';
    const result = normalizeCustomScript(validCS({ textValue: source }), ctx);
    const node = result.nodes[0]! as CustomComputationIR;
    expect(node.rawSource).toBe(source);
  });

  it('warns about BB-3b pending', () => {
    const result = normalizeCustomScript(validCS(), ctx);
    expect(result.nodes[0]!.warnings).toContain('QCP AST decomposition pending BB-3b');
  });

  it('handles 10K-line input without crashing (A8)', () => {
    const lines: string[] = [];
    for (let i = 0; i < 10_000; i++) lines.push(`// line ${i}`);
    const source = lines.join('\n');
    const result = normalizeCustomScript(validCS({ textValue: source }), ctx);
    const node = result.nodes[0]! as CustomComputationIR;
    expect(node.lineCount).toBe(10_000);
  });
});
