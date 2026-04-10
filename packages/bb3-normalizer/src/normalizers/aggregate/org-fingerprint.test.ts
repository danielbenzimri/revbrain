import { describe, expect, it } from 'vitest';
import { normalizeOrgFingerprint, type OrgFingerprintNode } from './org-fingerprint.ts';
import type { AssessmentFindingInput } from '@revbrain/contract';
import { runBaselineSuite } from '../__test-helpers__/baseline.ts';
import { prepareCatalog } from '../../stages/s2-5-schema-catalog.ts';

function validOrg(over: Partial<AssessmentFindingInput> = {}): AssessmentFindingInput {
  return {
    domain: 'customization',
    collectorName: 'discovery',
    artifactType: 'OrgFingerprint',
    artifactName: 'Acme Production',
    findingKey: 'org-1',
    sourceType: 'api-response' as unknown as AssessmentFindingInput['sourceType'],
    detected: true,
    notes: 'Enterprise Edition',
    sourceRef: 'https://acme.my.salesforce.com',
    evidenceRefs: [{ type: 'record-id', value: '00D3x0000000001EAA' }],
    schemaVersion: '1.0',
    ...over,
  };
}

// OrgFingerprint's source type 'api-response' isn't in the baseline
// enum, so fall back to 'metadata' for the baseline suite.
function validOrgForBaseline(over: Partial<AssessmentFindingInput> = {}): AssessmentFindingInput {
  return { ...validOrg(), sourceType: 'metadata', ...over };
}

runBaselineSuite({
  fn: normalizeOrgFingerprint,
  taskId: 'PH6.14',
  nodeType: 'OrgFingerprint',
  validFinding: validOrgForBaseline,
  malformedFinding: null,
  renameMutation: (f) => ({ ...f, artifactId: 'a0V3x00000newid' }),
  // orgId is in semanticPayload but not stableIdentity — mutate it
  // via evidenceRefs.
  contentChangeMutation: (f) => ({
    ...f,
    evidenceRefs: [{ type: 'record-id', value: '00D3xDIFFERENTID00EAA' }],
  }),
});

describe('PH6.14 — OrgFingerprint identity stability', () => {
  it('orgId is stored but NOT used in identity (G5 sandbox-refresh safety)', () => {
    const ctx = { catalog: prepareCatalog(), diagnostics: [] };
    const a = normalizeOrgFingerprint(validOrgForBaseline(), ctx);
    const b = normalizeOrgFingerprint(
      validOrgForBaseline({
        evidenceRefs: [{ type: 'record-id', value: '00D3xDIFFERENT0000EAA' }],
      }),
      ctx
    );
    // id stable under orgId change (sandbox refresh simulation)
    expect(a.nodes[0]!.id).toBe(b.nodes[0]!.id);
    // orgId is actually stored
    expect((a.nodes[0]! as OrgFingerprintNode).orgId).toContain('00D');
  });
});
