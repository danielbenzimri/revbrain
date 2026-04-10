/**
 * Not-modeled-v1 quarantine router.
 *
 * Spec: §5.7, §7 mapping table.
 *
 * Routes intentionally-unmodeled artifact types to quarantine with
 * reason `'not-modeled-v1'` so G1 coverage holds (every finding is
 * accounted for, even if the accounting says "not modeled").
 */

import type { AssessmentFindingInput } from '@revbrain/contract';
import type { NormalizerFn } from '../registry.ts';

/** Closed list of artifact types intentionally deferred to later waves. */
export const NOT_MODELED_V1_TYPES = new Set<string>([
  'SearchFilter',
  'SharingRule',
  'SBQQ__LookupData__c',
  'ESignature',
  'LanguageDistribution',
  'FieldCompleteness',
]);

/** Return true iff the finding's artifactType is on the not-modeled list. */
export function isNotModeledV1(artifactType: string): boolean {
  return NOT_MODELED_V1_TYPES.has(artifactType);
}

/**
 * Not-modeled-v1 router. Emits zero nodes and one quarantine entry.
 * Stage 3's dispatcher invokes this for any artifactType on the
 * NOT_MODELED_V1_TYPES list.
 */
export const normalizeNotModeled: NormalizerFn = (finding: AssessmentFindingInput) => ({
  nodes: [],
  quarantine: {
    findingKey: finding.findingKey,
    artifactType: finding.artifactType,
    reason: 'not-modeled-v1',
    detail: `artifactType '${finding.artifactType}' is intentionally not modeled in BB-3 v1`,
    raw: finding,
  },
});
