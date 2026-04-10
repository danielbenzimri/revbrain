/**
 * Diagnostic code registry for the validator (Stage 8).
 *
 * Spec: §10.4.
 *
 * Every validator rule owns a single stable code so downstream
 * consumers can filter diagnostics programmatically. Codes are
 * frozen — renaming one is a breaking change for the public API.
 */

export const VALIDATOR_CODES = {
  /** V1: projected-edge ↔ inline NodeRef round-trip failure. */
  V1_PROJECTED_EDGE_MISSING_INLINE: 'BB3_V1A',
  V1_INLINE_REF_MISSING_EDGE: 'BB3_V1B',
  /** V1: synthetic cycle-contains edge's source is not a CyclicDependencyIR. */
  V1_SYNTHETIC_CYCLE_SOURCE_INVALID: 'BB3_V1C',
  /** V1: cycle-contains edge target is not in the group's members list. */
  V1_SYNTHETIC_CYCLE_TARGET_MISSING: 'BB3_V1D',
  /** V1: group member has no matching cycle-contains edge. */
  V1_SYNTHETIC_CYCLE_MEMBER_MISSING_EDGE: 'BB3_V1E',
  /** V2: node with empty sourceFindingKeys. */
  V2_EMPTY_EVIDENCE: 'BB3_V2',
  /** V3: duplicate node id. */
  V3_DUPLICATE_ID: 'BB3_V3',
  /** V4: unresolved field reference against the catalog. */
  V4_UNRESOLVED_FIELD_REF: 'BB3_V4',
  /** V4: degraded — no catalog, only syntactic checks ran. */
  V4_DEGRADED: 'BB3_V4D',
  /** V5: cycle group well-formedness violation. */
  V5_CYCLE_WELL_FORMED: 'BB3_V5',
  /** V8: unresolved-ref ratio exceeds threshold. */
  V8_UNRESOLVED_RATIO: 'BB3_V8',
} as const;

export type ValidatorCode = (typeof VALIDATOR_CODES)[keyof typeof VALIDATOR_CODES];
