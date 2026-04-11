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
  // EXT-CC4 — Third-party packaged Apex (DocuSign Gen, Conga,
  // Drawloop, etc.) is emitted by the dependencies collector as
  // `ThirdPartyPackagedApexClass` (NOT `ApexClass`) so the report
  // layer, BB-3 normalizer, and any downstream consumer keep it
  // on a separate track from customer-namespace Apex. The classes
  // themselves are managed-package code and do not migrate via
  // Apex rewrite — they need a vendor migration plan. Quarantined
  // explicitly so G1 conservation holds; the per-namespace summary
  // is built in the report layer from the flat finding list.
  'ThirdPartyPackagedApexClass',
  // Phase 4.1 CTO audit 2026-04-12 — PDF-analytics and sidecar
  // metadata types. None of these are business-logic IR nodes:
  // they are either aggregate rows the assembler reads directly
  // (UsageOverview, DiscountDistribution, TopQuotedProduct, etc.)
  // or observability findings (PluginStatus, CPQSettingValue,
  // CPQReport). Routing them to not-modeled-v1 quarantine (rather
  // than letting them fall through to UnknownArtifact) makes the
  // coverage map explicit — every raw finding is accounted for.
  'CPQReport',
  'CPQSettingValue',
  'CPQSetting',
  'DataCount',
  'DataQualityFlag',
  'InstalledPackage',
  'TopQuotedProduct',
  'ProductFieldUtilization',
  'PluginStatus',
  'PermissionSet',
  'ConversionSegment',
  'ExternalIdField',
  'UserAdoption',
  'UserBehavior',
  'DiscountDistribution',
  'PriceOverrideAnalysis',
  'TrendIndicator',
  'UsageOverview',
  'OrderLifecycleOverview',
  'Document',
  'ExperienceCloud',
  'TaxCalculator',
  'LocalizationSummary',
  'LanguageTranslation',
  'TemplateContent',
  'TemplateSection',
  'QuoteTerm',
  'AdvancedApprovalRule',
  'AdvancedApprovals',
  // CustomAction — the approvals.ts collector emits this short
  // name (distinct from SBQQ__CustomAction__c which has its own
  // normalizer). These are ProcessDefinition-backed approval
  // buttons, rendered directly in §6 Approvals; not an IR node.
  'CustomAction',
  // QuoteTemplate — the templates collector emits the short name;
  // the normalizer is registered for SBQQ__QuoteTemplate__c (full
  // API name). Both coexist on real staging. The short-name form
  // is quarantined as a deliberate "not via this alias" signal;
  // the full-form findings still produce IR nodes.
  'QuoteTemplate',
  // Phase 4.1 CTO audit 2026-04-12 (round 2) — integrations.ts,
  // localization.ts, and metadata.ts collectors can emit these
  // artifactTypes on orgs with the relevant features. They are
  // observability / sidecar findings consumed by the PDF layer
  // (integrations summary, translation workbench section) or by
  // `buildSchemaCatalogFromFindings` (ObjectConfiguration), and
  // are not business-logic IR nodes. The current staging org does
  // not emit any of them, but a different tenant might — quarantine
  // them now so the coverage map stays explicit.
  'ApexCallout',
  'BillingDetection',
  'ESignatureIntegration',
  'ExperienceCloudSite',
  'ExternalService',
  'ObjectConfiguration',
  'TranslationWorkbench',
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
