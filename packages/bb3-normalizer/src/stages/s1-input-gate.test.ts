import { describe, expect, it } from 'vitest';
import { inputGate, DEFAULT_INPUT_GATE_OPTIONS } from './s1-input-gate.ts';
import { BB3InputError } from '@revbrain/migration-ir-contract';
import type { AssessmentFindingInput } from '@revbrain/contract';

function validFinding(over: Partial<AssessmentFindingInput> = {}): AssessmentFindingInput {
  return {
    domain: 'catalog',
    collectorName: 'catalog',
    artifactType: 'Product2',
    artifactName: 'Prod',
    findingKey: `f-${Math.random().toString(36).slice(2)}`,
    sourceType: 'object',
    detected: true,
    evidenceRefs: [],
    schemaVersion: '1.0',
    ...over,
  };
}

describe('PH3.1 — inputGate', () => {
  it('all valid input: passes everything through, zero quarantine', () => {
    const findings = [validFinding(), validFinding(), validFinding()];
    const result = inputGate(findings);
    expect(result.validFindings.length).toBe(3);
    expect(result.quarantine).toEqual([]);
  });

  it('one malformed in 100: quarantines that one, rest passes', () => {
    const findings: unknown[] = [];
    for (let i = 0; i < 99; i++) findings.push(validFinding());
    findings.push({ broken: true });
    const result = inputGate(findings);
    expect(result.validFindings.length).toBe(99);
    expect(result.quarantine.length).toBe(1);
  });

  it('50 malformed in 100 with default 10% threshold: throws BB3InputError', () => {
    const findings: unknown[] = [];
    for (let i = 0; i < 50; i++) findings.push(validFinding());
    for (let i = 0; i < 50; i++) findings.push({ broken: true });
    expect(() => inputGate(findings)).toThrow(BB3InputError);
  });

  it('11 malformed in 100 with 0.1 threshold: throws', () => {
    const findings: unknown[] = [];
    for (let i = 0; i < 89; i++) findings.push(validFinding());
    for (let i = 0; i < 11; i++) findings.push({ broken: true });
    expect(() => inputGate(findings)).toThrow(BB3InputError);
  });

  it('10 malformed in 100 with 0.1 threshold: does NOT throw (boundary, strictly greater)', () => {
    const findings: unknown[] = [];
    for (let i = 0; i < 90; i++) findings.push(validFinding());
    for (let i = 0; i < 10; i++) findings.push({ broken: true });
    const result = inputGate(findings);
    expect(result.quarantine.length).toBe(10);
  });

  it('non-array input: throws BB3InputError', () => {
    expect(() => inputGate('not an array' as unknown)).toThrow(BB3InputError);
    expect(() => inputGate({ findings: [] } as unknown)).toThrow(BB3InputError);
    expect(() => inputGate(null as unknown)).toThrow(BB3InputError);
  });

  it('strict mode: any quarantine entry causes a throw', () => {
    const findings: unknown[] = [validFinding(), { broken: true }];
    expect(() => inputGate(findings, { ...DEFAULT_INPUT_GATE_OPTIONS, strict: true })).toThrow(
      BB3InputError
    );
  });

  it('missing findingKey → quarantine reason is missing-required-field', () => {
    const partial = validFinding();
    delete (partial as Partial<AssessmentFindingInput>).findingKey;
    const result = inputGate([partial as unknown], {
      ...DEFAULT_INPUT_GATE_OPTIONS,
      maxInvalidRate: 1,
    });
    expect(result.quarantine[0]?.reason).toBe('missing-required-field');
  });

  it('wrong shape in another field → quarantine reason is malformed-shape', () => {
    const broken = { ...validFinding(), domain: 'not-a-domain' };
    const result = inputGate([broken as unknown], {
      ...DEFAULT_INPUT_GATE_OPTIONS,
      maxInvalidRate: 1,
    });
    expect(result.quarantine[0]?.reason).toBe('malformed-shape');
  });

  it('quarantine entry preserves raw payload for post-mortem', () => {
    const broken = { findingKey: 'abc', junk: 42 };
    const result = inputGate([broken], { ...DEFAULT_INPUT_GATE_OPTIONS, maxInvalidRate: 1 });
    expect(result.quarantine[0]?.raw).toEqual(broken);
  });

  it('emits diagnostics with stable codes', () => {
    const result = inputGate([{ broken: true }], {
      ...DEFAULT_INPUT_GATE_OPTIONS,
      maxInvalidRate: 1.0,
    });
    expect(result.diagnostics.length).toBe(1);
    expect(result.diagnostics[0]?.stage).toBe('input-gate');
    expect(['BB3_Q001', 'BB3_Q002']).toContain(result.diagnostics[0]?.code);
  });
});
