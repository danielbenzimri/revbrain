import { describe, expect, it } from 'vitest';
import { normalizeOutboundMessage } from './outbound-message.ts';
import type { AssessmentFindingInput } from '@revbrain/contract';
import type { OutboundMessageAutomationIR } from '@revbrain/migration-ir-contract';
import { runBaselineSuite } from '../__test-helpers__/baseline.ts';
import { prepareCatalog } from '../../stages/s2-5-schema-catalog.ts';

function validOM(over: Partial<AssessmentFindingInput> = {}): AssessmentFindingInput {
  return {
    domain: 'integration',
    collectorName: 'integration',
    artifactType: 'OutboundMessage',
    artifactName: 'Notify_ERP',
    findingKey: 'om-1',
    sourceType: 'metadata',
    detected: true,
    textValue: 'https://erp.internal/webhooks/quote',
    evidenceRefs: [{ type: 'object-ref', value: 'SBQQ__Quote__c' }],
    schemaVersion: '1.0',
    ...over,
  };
}

runBaselineSuite({
  fn: normalizeOutboundMessage,
  taskId: 'PH6.10',
  nodeType: 'OutboundMessageAutomationIR',
  validFinding: validOM,
  malformedFinding: null,
  renameMutation: (f) => ({ ...f, artifactId: 'a0V3x00000newid' }),
  contentChangeMutation: (f) => ({ ...f, detected: !f.detected }),
});

describe('PH6.10 — OutboundMessageAutomationIR extras', () => {
  const ctx = { catalog: prepareCatalog(), diagnostics: [] };

  it('sourceType is OutboundMessage', () => {
    const result = normalizeOutboundMessage(validOM(), ctx);
    expect(result.nodes[0]!).toMatchObject({ sourceType: 'OutboundMessage' });
  });

  it('populates endpointUrl + targetObject', () => {
    const result = normalizeOutboundMessage(validOM(), ctx);
    const node = result.nodes[0]! as OutboundMessageAutomationIR;
    expect(node.endpointUrl).toContain('webhooks');
    expect(node.targetObject).toBe('SBQQ__Quote__c');
  });
});
