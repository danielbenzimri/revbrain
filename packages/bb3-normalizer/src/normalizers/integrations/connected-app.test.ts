import { describe, expect, it } from 'vitest';
import { normalizeConnectedApp, type ConnectedAppIR } from './connected-app.ts';
import type { AssessmentFindingInput } from '@revbrain/contract';
import { runBaselineSuite } from '../__test-helpers__/baseline.ts';
import { prepareCatalog } from '../../stages/s2-5-schema-catalog.ts';

function validCA(over: Partial<AssessmentFindingInput> = {}): AssessmentFindingInput {
  return {
    domain: 'integration',
    collectorName: 'integration',
    artifactType: 'ConnectedApp',
    artifactName: 'External_Integrator',
    findingKey: 'ca-1',
    sourceType: 'metadata',
    detected: true,
    textValue: 'api, refresh_token, offline_access',
    // PH9 §8.3 — canonical field-ref shape: value=path, label=value.
    evidenceRefs: [
      {
        type: 'field-ref',
        value: 'ConnectedApplication.OauthConsumerKey',
        label: '3MVG9CONSUMER_KEY_EXAMPLE',
      },
    ],
    schemaVersion: '1.0',
    ...over,
  };
}

runBaselineSuite({
  fn: normalizeConnectedApp,
  taskId: 'PH6.8',
  nodeType: 'ConnectedApp',
  validFinding: validCA,
  malformedFinding: null,
  renameMutation: (f) => ({ ...f, artifactId: 'a0V3x00000newid' }),
  contentChangeMutation: (f) => ({ ...f, textValue: 'api, web' }),
});

describe('PH6.8 — ConnectedApp secret redaction', () => {
  it('never stores the OAuth secret — only the consumer key', () => {
    const result = normalizeConnectedApp(validCA(), { catalog: prepareCatalog(), diagnostics: [] });
    const node = result.nodes[0]! as ConnectedAppIR;
    const json = JSON.stringify(node);
    // Assert nothing labeled "secret" leaked
    expect(json).not.toMatch(/oauthConsumerSecret/i);
    expect(json).not.toMatch(/CONSUMER_SECRET/i);
    expect(node.oauthConsumerKey).toContain('CONSUMER_KEY');
  });
});
