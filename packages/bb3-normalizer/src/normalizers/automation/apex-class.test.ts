import { describe, expect, it } from 'vitest';
import { normalizeApexClass, enrichApexClass } from './apex-class.ts';
import type { AssessmentFindingInput } from '@revbrain/contract';
import type { ApexClassAutomationIR } from '@revbrain/migration-ir-contract';
import { runBaselineSuite } from '../__test-helpers__/baseline.ts';
import { prepareCatalog } from '../../stages/s2-5-schema-catalog.ts';

function validApex(over: Partial<AssessmentFindingInput> = {}): AssessmentFindingInput {
  return {
    domain: 'dependency',
    collectorName: 'dependency',
    artifactType: 'ApexClass',
    artifactName: 'MyPricingHandler',
    findingKey: 'ac-1',
    sourceType: 'metadata',
    detected: true,
    textValue: 'public class MyPricingHandler {\n  public Decimal compute() { return 1; }\n}',
    evidenceRefs: [],
    schemaVersion: '1.0',
    ...over,
  };
}

runBaselineSuite({
  fn: normalizeApexClass,
  taskId: 'PH5.1',
  nodeType: 'ApexClassAutomationIR',
  validFinding: validApex,
  malformedFinding: null,
  renameMutation: (f) => ({ ...f, artifactId: 'a0V3x00000newid' }),
  contentChangeMutation: (f) => ({
    ...f,
    textValue: (f.textValue ?? '') + '\n// comment added',
  }),
});

describe('PH5.1 — ApexClassAutomationIR extras', () => {
  const ctx = { catalog: prepareCatalog(), diagnostics: [] };

  it('emits sourceType: ApexClass (discriminated union narrowing)', () => {
    const result = normalizeApexClass(validApex(), ctx);
    const node = result.nodes[0]! as ApexClassAutomationIR;
    expect(node.sourceType).toBe('ApexClass');
  });

  it('test class is flagged isTestClass: true', () => {
    const source = '@isTest public class MyTest { public static void t() {} }';
    const result = normalizeApexClass(validApex({ textValue: source }), ctx);
    const node = result.nodes[0]! as ApexClassAutomationIR;
    expect(node.isTestClass).toBe(true);
  });

  it('detects SBQQ.TriggerControl pattern', () => {
    const source = 'public class Foo { public void m() { SBQQ.TriggerControl.disable(); } }';
    const result = normalizeApexClass(validApex({ textValue: source }), ctx);
    const node = result.nodes[0]! as ApexClassAutomationIR;
    expect(node.hasTriggerControl).toBe(true);
  });

  it('lineCount is populated even before Stage 5 enrichment', () => {
    const source = 'line1\nline2\nline3';
    const result = normalizeApexClass(validApex({ textValue: source }), ctx);
    expect((result.nodes[0]! as ApexClassAutomationIR).lineCount).toBe(3);
  });

  it('enrichApexClass upgrades parseStatus and field refs (Stage 5 path)', async () => {
    const draft = normalizeApexClass(validApex(), ctx).nodes[0]! as ApexClassAutomationIR;
    const source = validApex().textValue ?? '';
    const enriched = await enrichApexClass(draft, source);
    expect(enriched.parseStatus).not.toBe('partial');
  });
});
