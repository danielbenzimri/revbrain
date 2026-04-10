/**
 * QuarantineEntry — findings BB-3 could not normalize.
 *
 * Spec: §5.7, §10.2.
 *
 * Quarantine means "the finding does not become an IR node, but the
 * pipeline continues". A healthy graph has zero or a handful of
 * quarantined findings; a degraded extraction has more. Quarantine
 * is NEVER a hard failure — see §10.1 for the bounded list of
 * situations that do hard-fail.
 *
 * The reason enum has 8 values (v1.1). Two of them were added in
 * v1.1 to close Auditor 2 C4:
 *
 * - `'not-modeled-v1'` — BB-3 v1 intentionally doesn't model this
 *   type (SearchFilter, SharingRule, SBQQ__LookupData__c, ESignature,
 *   LanguageDistribution, FieldCompleteness). Every finding is now
 *   either a node, merged into one, or quarantined here.
 *
 * - `'not-detected'` — finding had `detected: false` (E27). This is
 *   informational, not an error — it just lives in the audit trail.
 */

/**
 * Closed set of reasons a finding ends up in quarantine.
 */
export type QuarantineReason =
  | 'missing-required-field'
  | 'malformed-shape'
  | 'parse-failure'
  | 'unknown-artifact'
  | 'duplicate-identity'
  | 'orphaned-reference'
  | 'not-modeled-v1'
  | 'not-detected';

/**
 * One quarantine entry. Includes the raw finding payload (post
 * redaction per §17) so a caller can do post-mortem.
 */
export interface QuarantineEntry {
  findingKey: string;
  artifactType: string;
  reason: QuarantineReason;
  detail: string;
  /**
   * The original finding payload. Typed as `unknown` to force a type
   * guard before use and to make it explicit that BB-3 does NOT
   * trust the shape of quarantined content.
   */
  raw: unknown;
}
