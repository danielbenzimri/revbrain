/**
 * IR node base + discriminated-union type catalog.
 *
 * Spec: §5.3 (node type catalog, v1.1/v1.2 rewrites).
 *
 * `IRNodeBase` is the shared shape every IR node extends. Every
 * concrete node type adds a `nodeType` discriminator plus its own
 * domain-specific fields (pricing rules have conditions/actions;
 * automation variants carry Apex or Flow metrics; etc.).
 *
 * This file intentionally does NOT define every concrete node
 * interface exhaustively — the normalizer packages (PH4–PH6) are the
 * source of truth for per-type shapes. What this file DOES guarantee:
 *
 * 1. `IRNodeBase` with the `id` + `contentHash` identity split (§5.2).
 * 2. `IRNodeType` union covering every node kind the normalizer can
 *    emit — so downstream consumers doing exhaustive `switch` get a
 *    compiler error when a new type is added.
 * 3. The `Automation` entry delegates to the 5-variant discriminated
 *    union in `automation.ts`.
 */

import type { EvidenceBlock } from './evidence.ts';

/**
 * Usage intensity carried from the extraction findings. Unchanged
 * between v1.0 and v1.2.
 */
export type UsageLevel = 'high' | 'medium' | 'low' | 'dormant';

/**
 * Complexity classification carried from the findings.
 */
export type ComplexityLevel = 'simple' | 'moderate' | 'complex' | 'unknown';

/**
 * Namespace in which the node originates. `'custom'` covers the
 * customer's own unmanaged namespace; `null` means the node is not
 * namespace-scoped (e.g. `UsageStatistic`, `OrgFingerprint`).
 */
export type NodeNamespace = 'SBQQ' | 'sbaa' | 'blng' | 'custom' | null;

/**
 * Base interface every IR node extends.
 *
 * The `id` + `contentHash` split (§5.2) is the spine of BB-3's
 * determinism and re-assessment story:
 *
 * - `id` is stable under renames and sandbox refreshes — used by
 *   BB-17 to match nodes across re-runs.
 *
 * - `contentHash` changes iff the node's behavior-relevant content
 *   changes — used to detect when SI edits have drifted from the
 *   shipped normalizer output.
 *
 * Both are populated by the normalizer in Stage 3. Both are derived
 * via `canonicalJson` (PH1.1), NEVER `JSON.stringify`.
 */
export interface IRNodeBase {
  /** Stable business identity (§5.2). Survives rename + sandbox refresh. */
  id: string;
  /** Semantic change detector (§5.2). Changes iff behavior-relevant content changes. */
  contentHash: string;
  /** Discriminator for the node type. */
  nodeType: IRNodeType;
  /** Human-readable label, safe for reports. May be truncated (see E18). */
  displayName: string;
  /** Stable API name where one exists (§5.2). */
  developerName?: string;
  /** Provenance — §5.4. */
  evidence: EvidenceBlock;
  /** Usage intensity — carried from the source findings. */
  usageSignal?: UsageLevel;
  /** Complexity classification — carried from the source findings. */
  complexitySignal?: ComplexityLevel;
  /** Namespace. `null` for non-scoped nodes. */
  namespace?: NodeNamespace;
  /** Normalizer warnings — NOT fatal errors. */
  warnings: string[];
}

/**
 * Discriminated union of every IR node type emitted by BB-3.
 *
 * v1.1 changes (vs v1.0):
 * - ADDED:   `'ConnectedApp'`, `'CPQSettingsBundle'` (were referenced in
 *   §7 but missing from the v1.0 union).
 * - REMOVED: `'ProcessBuilder'` (no collector emits it),
 *            `'SubscriptionLifecycle'` (deferred to Wave 4; re-added there),
 *            `'CustomField'` (synthesized during parsing, not a top-level type).
 *
 * `'Flow'` is modeled as `'Automation'` with `sourceType: 'Flow'` —
 * consistent with how `ApexClass` / `ApexTrigger` are already
 * handled in the `AutomationIR` union.
 */
export type IRNodeType =
  | 'PricingRule'
  | 'PriceCondition'
  | 'PriceAction'
  | 'DiscountSchedule'
  | 'DiscountTier'
  | 'BlockPrice'
  | 'ContractedPrice'
  | 'SummaryVariable'
  | 'LookupQuery'
  | 'BundleStructure'
  | 'BundleOption'
  | 'BundleFeature'
  | 'ConfigConstraint'
  | 'Product'
  | 'ConfigurationAttribute'
  | 'Automation'
  | 'ValidationRule'
  | 'FormulaField'
  | 'CustomMetadataType'
  | 'RecordType'
  | 'DocumentTemplate'
  | 'QuoteTermBlock'
  | 'CustomAction'
  | 'ApprovalProcess'
  | 'ApprovalChainRule'
  | 'NamedCredential'
  | 'ExternalDataSource'
  | 'ConnectedApp'
  | 'PlatformEvent'
  | 'CustomComputation'
  | 'LocalizationBundle'
  | 'UsageStatistic'
  | 'CPQSettingsBundle'
  | 'OrgFingerprint'
  | 'CyclicDependency'
  | 'UnknownArtifact';

/**
 * All IR node types as a runtime-available constant. Keep in sync
 * with `IRNodeType`. Used by the dispatcher (PH3.4) and the
 * exhaustiveness test in `nodes.test.ts`.
 */
export const IR_NODE_TYPES: readonly IRNodeType[] = [
  'PricingRule',
  'PriceCondition',
  'PriceAction',
  'DiscountSchedule',
  'DiscountTier',
  'BlockPrice',
  'ContractedPrice',
  'SummaryVariable',
  'LookupQuery',
  'BundleStructure',
  'BundleOption',
  'BundleFeature',
  'ConfigConstraint',
  'Product',
  'ConfigurationAttribute',
  'Automation',
  'ValidationRule',
  'FormulaField',
  'CustomMetadataType',
  'RecordType',
  'DocumentTemplate',
  'QuoteTermBlock',
  'CustomAction',
  'ApprovalProcess',
  'ApprovalChainRule',
  'NamedCredential',
  'ExternalDataSource',
  'ConnectedApp',
  'PlatformEvent',
  'CustomComputation',
  'LocalizationBundle',
  'UsageStatistic',
  'CPQSettingsBundle',
  'OrgFingerprint',
  'CyclicDependency',
  'UnknownArtifact',
] as const;
