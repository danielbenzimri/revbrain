/**
 * Shared helpers every normalizer uses to build IR nodes.
 *
 * Spec: §5.2 (identity), §5.4 (evidence), normalizer card template
 * reminder in §Phase 4 of TASKS.md.
 *
 * Every normalizer needs the same scaffolding:
 *
 * - Standard `EvidenceBlock` from the input finding.
 * - Namespace detection from the artifact name prefix.
 * - Usage / complexity signal passthrough.
 * - Identity pair via `buildIdentityPair`.
 * - A default `warnings: []` field.
 *
 * Extracting it once keeps the 17 per-type normalizer files small
 * and focused on the fields that actually distinguish them.
 */

import type { AssessmentFindingInput } from '@revbrain/contract';
import {
  buildIdentityPair,
  type ComplexityLevel,
  type EvidenceBlock,
  type FieldRefIR,
  type IRNodeBase,
  type IRNodeType,
  type NodeNamespace,
  type UsageLevel,
} from '@revbrain/migration-ir-contract';

/**
 * Detect the namespace from an artifact name or object prefix.
 */
export function detectNamespace(name: string): NodeNamespace {
  const lower = name.toLowerCase();
  if (lower.startsWith('sbqq__')) return 'SBQQ';
  if (lower.startsWith('sbaa__')) return 'sbaa';
  if (lower.startsWith('blng__')) return 'blng';
  if (lower.endsWith('__c')) return 'custom';
  return null;
}

/** Build a standard `EvidenceBlock` from a single finding. */
export function buildEvidence(
  finding: AssessmentFindingInput,
  extras: {
    cpqFieldsRead?: FieldRefIR[];
    cpqFieldsWritten?: FieldRefIR[];
    classificationReasons?: EvidenceBlock['classificationReasons'];
  } = {}
): EvidenceBlock {
  const sourceSalesforceRecordIds: string[] = [];
  if (finding.artifactId) sourceSalesforceRecordIds.push(finding.artifactId);
  return {
    sourceFindingKeys: [finding.findingKey],
    classificationReasons: extras.classificationReasons ?? [],
    cpqFieldsRead: extras.cpqFieldsRead ?? [],
    cpqFieldsWritten: extras.cpqFieldsWritten ?? [],
    sourceSalesforceRecordIds,
    sourceCollectors: [finding.collectorName],
  };
}

/** Map a finding's usage level to an IR usageSignal. */
export function mapUsage(finding: AssessmentFindingInput): UsageLevel | undefined {
  return finding.usageLevel;
}

/** Map a finding's complexity level to an IR complexitySignal. */
export function mapComplexity(finding: AssessmentFindingInput): ComplexityLevel | undefined {
  // The contract package's ComplexityLevel = 'simple' | 'moderate' | 'complex' | 'unknown'.
  // The extraction findings use a different spelling ('very-high' | 'high' | 'medium' | 'low').
  // Project the finding's scale onto the IR enum.
  switch (finding.complexityLevel) {
    case 'very-high':
      return 'complex';
    case 'high':
      return 'complex';
    case 'medium':
      return 'moderate';
    case 'low':
      return 'simple';
    default:
      return undefined;
  }
}

/**
 * Arguments for `buildBaseNode` — everything a normalizer has to
 * supply to get a fully populated `IRNodeBase`.
 */
export interface BuildBaseNodeArgs {
  finding: AssessmentFindingInput;
  nodeType: IRNodeType;
  /** Stable-identity payload for the `id` hash. */
  stableIdentity: unknown;
  /** Semantic-content payload for the `contentHash`. */
  semanticPayload: unknown;
  /** Optional display name override (defaults to `finding.artifactName`). */
  displayName?: string;
  /** Optional developer name (for metadata-backed types). */
  developerName?: string;
  /** Additional evidence extras passed through to `buildEvidence`. */
  evidenceExtras?: Parameters<typeof buildEvidence>[1];
  /** Any normalizer-raised warnings to attach to the node. */
  warnings?: string[];
}

/**
 * Build a fully populated `IRNodeBase` from a finding and a per-type
 * identity recipe. Normalizers spread this into their own interface.
 */
export function buildBaseNode(args: BuildBaseNodeArgs): IRNodeBase {
  const pair = buildIdentityPair(args.nodeType, args.stableIdentity, args.semanticPayload);
  const node: IRNodeBase = {
    id: pair.id,
    contentHash: pair.contentHash,
    nodeType: args.nodeType,
    displayName: args.displayName ?? args.finding.artifactName,
    warnings: args.warnings ?? [],
    evidence: buildEvidence(args.finding, args.evidenceExtras),
  };
  if (args.developerName !== undefined) node.developerName = args.developerName;
  const usage = mapUsage(args.finding);
  if (usage !== undefined) node.usageSignal = usage;
  const complexity = mapComplexity(args.finding);
  if (complexity !== undefined) node.complexitySignal = complexity;
  const ns = detectNamespace(args.finding.artifactName);
  if (ns !== null) node.namespace = ns;
  return node;
}

/**
 * Safe accessor: read an `evidenceRefs` entry's value when it has a
 * given type. Used by normalizers that need to pluck one specific
 * ref out of a finding's evidence refs array.
 */
export function findEvidenceRef(finding: AssessmentFindingInput, type: string): string | null {
  const match = finding.evidenceRefs.find((r) => r.type === type);
  return match?.value ?? null;
}
