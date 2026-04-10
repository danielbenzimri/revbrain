import { normalizeNamedCredential } from './named-credential.ts';
import type { AssessmentFindingInput } from '@revbrain/contract';
import { runBaselineSuite } from '../__test-helpers__/baseline.ts';

function validNC(over: Partial<AssessmentFindingInput> = {}): AssessmentFindingInput {
  return {
    domain: 'integration',
    collectorName: 'integration',
    artifactType: 'NamedCredential',
    artifactName: 'Stripe_API',
    findingKey: 'nc-1',
    sourceType: 'metadata',
    detected: true,
    textValue: 'https://api.stripe.com/v1',
    notes: 'OAuth2',
    evidenceRefs: [],
    schemaVersion: '1.0',
    ...over,
  };
}

runBaselineSuite({
  fn: normalizeNamedCredential,
  taskId: 'PH6.6',
  nodeType: 'NamedCredential',
  validFinding: validNC,
  malformedFinding: null,
  renameMutation: (f) => ({ ...f, artifactId: 'a0V3x00000newid' }),
  contentChangeMutation: (f) => ({ ...f, notes: 'Basic' }),
});
