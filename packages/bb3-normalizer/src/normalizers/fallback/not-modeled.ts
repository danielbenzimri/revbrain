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
  // EXT-1.7 — components.ts emits these. Modeled in BB-3 v2 once
  // BB-4 segmentation has a use case; for now they're explicitly
  // quarantined so the §5 non-negotiable (no silent fall-through)
  // is satisfied AND the G1 conservation invariant holds.
  'LightningComponentBundle',
  'AuraDefinitionBundle',
  'ApexPage',
  'ApexComponent',
  'StaticResource',
  // EXT-1.2 — plugin-activation findings (PluginActivation
  // artifactType) are sidecar metadata that the worker emits when
  // joinPluginActivation runs. They are not load-bearing for BB-3
  // identity; the active-plugin info is already on the underlying
  // ApexClass finding's evidenceRefs. Quarantine them with reason
  // 'not-modeled-v1' for explicit accounting.
  'PluginActivation',
  // EXT-2.x — Tier 2 inventory backlog. Quarantined explicitly so
  // G1 conservation holds. Modeled in BB-3 v2 once BB-4
  // segmentation surfaces a use case.
  'EmailTemplate',
  'CustomPermission',
  'PermissionSetGroup',
  'ScheduledApex',
  'RemoteSiteSetting',
  'CustomLabel',
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
