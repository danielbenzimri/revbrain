import { describe, expect, it } from 'vitest';
import { normalizeFlow } from './flow.ts';
import type { AssessmentFindingInput } from '@revbrain/contract';
import type { FlowAutomationIR } from '@revbrain/migration-ir-contract';
import { runBaselineSuite } from '../__test-helpers__/baseline.ts';
import { prepareCatalog } from '../../stages/s2-5-schema-catalog.ts';

function validFlow(over: Partial<AssessmentFindingInput> = {}): AssessmentFindingInput {
  return {
    domain: 'dependency',
    collectorName: 'dependency',
    artifactType: 'Flow',
    artifactName: 'Auto_Discount_Flow',
    findingKey: 'fl-1',
    sourceType: 'metadata',
    detected: true,
    countValue: 3,
    notes: 'record-triggered',
    sourceRef: 'SBQQ__Quote__c',
    evidenceRefs: [],
    schemaVersion: '1.0',
    ...over,
  };
}

runBaselineSuite({
  fn: normalizeFlow,
  taskId: 'PH5.3',
  nodeType: 'FlowAutomationIR',
  validFinding: validFlow,
  malformedFinding: null,
  renameMutation: (f) => ({ ...f, artifactId: 'a0V3x00000newid' }),
  contentChangeMutation: (f) => ({ ...f, countValue: (f.countValue ?? 0) + 1 }),
});

describe('PH5.3 — FlowAutomationIR extras', () => {
  const ctx = { catalog: prepareCatalog(), diagnostics: [] };

  it('sourceType is Flow', () => {
    const result = normalizeFlow(validFlow(), ctx);
    expect(result.nodes[0]!).toMatchObject({ sourceType: 'Flow' });
  });

  it('parses flowType from notes', () => {
    const r1 = normalizeFlow(validFlow({ notes: 'screen' }), ctx);
    const r2 = normalizeFlow(validFlow({ notes: 'autolaunched' }), ctx);
    expect((r1.nodes[0]! as FlowAutomationIR).flowType).toBe('screen');
    expect((r2.nodes[0]! as FlowAutomationIR).flowType).toBe('autolaunched');
  });

  it('active flow carries activeVersionNumber', () => {
    const result = normalizeFlow(validFlow({ detected: true, countValue: 5 }), ctx);
    expect((result.nodes[0]! as FlowAutomationIR).activeVersionNumber).toBe(5);
  });

  it('inactive flow sets activeVersionNumber to null', () => {
    const result = normalizeFlow(validFlow({ detected: false }), ctx);
    expect((result.nodes[0]! as FlowAutomationIR).activeVersionNumber).toBeNull();
  });

  it('record-triggered flow carries triggerObject and triggerEvents', () => {
    const result = normalizeFlow(validFlow({ notes: 'record-triggered' }), ctx);
    const node = result.nodes[0]! as FlowAutomationIR;
    expect(node.triggerObject).toBe('SBQQ__Quote__c');
    expect(node.triggerEvents).toEqual(['create-or-update']);
  });

  it('screen flow has triggerObject and triggerEvents as null', () => {
    const result = normalizeFlow(validFlow({ notes: 'screen' }), ctx);
    const node = result.nodes[0]! as FlowAutomationIR;
    expect(node.triggerObject).toBeNull();
    expect(node.triggerEvents).toBeNull();
  });

  it('parseStatus is metadata-only (v1 does not parse flow body)', () => {
    const result = normalizeFlow(validFlow(), ctx);
    expect((result.nodes[0]! as FlowAutomationIR).parseStatus).toBe('metadata-only');
  });
});
