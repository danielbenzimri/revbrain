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
  /**
   * PH9 §8.3 — opt out of the automatic per-record discriminator.
   * Set `true` for normalizers that intentionally collapse multiple
   * findings into a single node (singletons like `OrgFingerprintIR`,
   * fallbacks like `UnknownArtifactIR` and the not-modeled-v1 router).
   * Default: `false`.
   */
  intentionalCollapse?: boolean;
}

/**
 * Build a fully populated `IRNodeBase` from a finding and a per-type
 * identity recipe. Normalizers spread this into their own interface.
 *
 * **PH9 §8.3 — automatic per-record discriminator.** The audit found
 * 31 of 40 normalizers had identity recipes with no per-record
 * discriminator, so N distinct findings of the same shape collapsed
 * into 1 node via Stage 4 identity merging. The fix is here, at the
 * common code path: `buildBaseNode` automatically wraps the caller's
 * `stableIdentity` with a `_discriminator` slot containing the
 * Salesforce record id (`finding.artifactId`) and the unique
 * extraction-layer key (`finding.findingKey`). Both are stable
 * across rename + content edit but distinct per-record, so:
 *
 *   - A5 (rename-stability) is preserved: artifactId doesn't change
 *     when the source record is renamed.
 *   - A13 (operator-edit-stability) is preserved: artifactId doesn't
 *     change when an operator inside the record is edited.
 *   - But two distinct records with the same shape produce distinct
 *     identity hashes, so they don't silently collapse.
 *
 * Normalizers that intentionally collapse multiple findings into a
 * single node (singletons like `OrgFingerprintIR`, fallbacks like
 * `UnknownArtifactIR`) opt out by passing `intentionalCollapse: true`
 * in their args.
 */
export function buildBaseNode(args: BuildBaseNodeArgs): IRNodeBase {
  // PH9 §8.3 — wrap the caller's stableIdentity with a per-record
  // discriminator unless the normalizer is an intentional singleton/
  // fallback. The wrapping is symmetric: stableIdentity stays nested
  // under `_payload` so the recipe content is preserved bit-for-bit
  // (modulo the new `_discriminator` slot), keeping rename + edit
  // stability tests passing.
  //
  // Discriminator priority:
  //
  //   1. `developerName` (when the normalizer supplies one) — this is
  //      the most stable identifier because it's metadata, not a
  //      record-id, so it survives sandbox refreshes. Apex classes,
  //      flows, custom metadata types, etc. all have one.
  //   2. `artifactId` (Salesforce record id) — stable across rename
  //      and operator-edit but NOT across sandbox refresh. The right
  //      fallback when no developerName exists.
  //   3. `findingKey` — last resort for findings that have neither.
  //      Unique per (collector, artifact, sub-artifact).
  //
  // This priority means rename tests pass for normalizers with a
  // developerName even when their custom `renameMutation` rotates
  // the artifactId (simulating sandbox refresh — see e.g.
  // apex-class.test.ts:30).
  const discriminator: Record<string, string> = {};
  if (args.developerName !== undefined && args.developerName !== '') {
    discriminator.developerName = args.developerName;
  } else if (args.finding.artifactId !== undefined) {
    discriminator.artifactId = args.finding.artifactId;
  } else {
    discriminator.findingKey = args.finding.findingKey;
  }
  const stableIdentity =
    args.intentionalCollapse === true
      ? args.stableIdentity
      : {
          _payload: args.stableIdentity,
          _discriminator: discriminator,
        };
  const pair = buildIdentityPair(args.nodeType, stableIdentity, args.semanticPayload);
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
 *
 * **DANGER:** for `type='field-ref'` evidence, the catalog collector
 * convention is `value = field path` and `label = actual field value`
 * (see [apps/worker/src/collectors/catalog.ts:178-187](apps/worker/src/collectors/catalog.ts#L178-L187)).
 * This helper returns `value`, which is the field PATH not the field
 * VALUE — call {@link extractFieldValue} when you actually want the
 * value. Calling `findEvidenceRef(finding, 'field-ref')` against
 * Product2 findings returns `'Product2.Family'` (the path of the
 * first field-ref), which is identical for every product and causes
 * silent identity collisions in Stage 4. PH9 §8.3 fix: use
 * {@link extractFieldValue} for field-ref reads in any normalizer
 * whose identity depends on it.
 */
export function findEvidenceRef(finding: AssessmentFindingInput, type: string): string | null {
  const match = finding.evidenceRefs.find((r) => r.type === type);
  return match?.value ?? null;
}

/**
 * PH9 §8.3 — Read the actual VALUE of a `field-ref` evidence entry,
 * tolerating both conventions used by the extraction layer:
 *
 *   1. **Canonical:** `{ value: 'Product2.ProductCode', label: 'SB-USER-N' }`
 *      where `value` holds the field PATH and `label` holds the
 *      actual data. Used by [catalog.ts:178-187](apps/worker/src/collectors/catalog.ts#L178-L187)
 *      for Product2 main fields.
 *
 *   2. **Inverted:** `{ value: 'SB-USER-N', label: 'Product2.ProductCode' }`
 *      where `value` holds the data and `label` holds the field name.
 *      Used by [catalog.ts:192-196](apps/worker/src/collectors/catalog.ts#L192-L196)
 *      for the IsActive flag and [catalog.ts:715-716](apps/worker/src/collectors/catalog.ts#L715-L716)
 *      for SBQQ__ProductRule__c.
 *
 * Both shapes are accepted. The lookup matches against either the
 * fully-qualified path (`'Product2.ProductCode'`) OR a bare field
 * name (`'ProductCode'`) — the trailing component after the last `.`.
 *
 * **Critical for identity correctness.** The previous helper
 * `findEvidenceRef(finding, 'field-ref')` returned the FIRST
 * field-ref's `value`, which for canonical-shape findings is the
 * field path. Path strings collide across every record of the same
 * type, so 178 of 179 staging Product2 findings collapsed to one
 * ProductIR node via Stage 4 identity merging. PH9 §8.3 fix: every
 * identity-bearing normalizer must use this helper instead.
 *
 * @param finding the finding to read from
 * @param fieldName the bare field name (e.g. `'ProductCode'`) or
 *   the fully-qualified path (e.g. `'Product2.ProductCode'`). Both
 *   match.
 * @returns the field's actual value, or `null` if not found. Returns
 *   `null` (not an empty string) for missing fields so the caller
 *   can distinguish "absent" from "present-but-empty".
 */
export function extractFieldValue(
  finding: AssessmentFindingInput,
  fieldName: string
): string | null {
  // Bare name (last segment after the final '.') for the inverted-
  // shape lookup. e.g. 'Product2.ProductCode' → 'ProductCode'.
  const bareName = fieldName.includes('.') ? fieldName.split('.').pop()! : fieldName;

  for (const ref of finding.evidenceRefs) {
    if (ref.type !== 'field-ref') continue;

    // Canonical shape: value=path, label=actual data.
    // Match by full path OR by bare name suffix.
    if (ref.value === fieldName || ref.value.endsWith('.' + bareName)) {
      // The label IS the actual data in the canonical shape.
      // null/empty label means the field exists but has no data;
      // return empty string so callers can distinguish from null.
      return ref.label ?? '';
    }

    // Inverted shape: value=actual data, label=field name (bare).
    if (ref.label === fieldName || ref.label === bareName) {
      return ref.value;
    }
  }
  return null;
}
