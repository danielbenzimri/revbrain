/**
 * FieldRefIR — reference to a Salesforce field, with path support.
 *
 * Spec: §5.3 (v1.1 discriminated-union rewrite, Auditor 1 P1).
 *
 * v1.0's single-shape `FieldRefIR` couldn't represent relationship
 * paths (`Account__r.Owner.Profile.Name`), which is a real QCP and
 * formula idiom. v1.1 splits into two kinds discriminated on `kind`:
 *
 * - `'field'` — a direct reference on a single object
 * - `'path'`  — a relationship traversal reaching a terminal field
 *               through reference fields
 *
 * Every variant carries `isResolved: boolean`. Unresolved refs also
 * carry an `unresolvedReason` and an optional `hint`.
 */

/**
 * Reasons a field reference could not be resolved against the
 * `SchemaCatalog` (§4.4a).
 */
export type FieldRefUnresolvedReason =
  | 'no-catalog'
  | 'object-not-in-catalog'
  | 'field-not-in-catalog'
  | 'dynamic'
  | 'parse-failure';

/** Common fields on every FieldRefIR variant. */
interface FieldRefBase {
  /** True iff the terminal field name ends in `__c`. */
  isCustom: boolean;
  /** True iff it's in the `SBQQ__` / `sbaa__` / `blng__` namespace. */
  isCpqManaged: boolean;
  /** True iff BB-3 verified the ref against the SchemaCatalog. */
  isResolved: boolean;
  /** When `isResolved === false`, why. */
  unresolvedReason?: FieldRefUnresolvedReason;
  /** For dynamic refs, a human-readable hint (e.g. variable name). */
  hint?: string;
  /** `file:line` in the source, when available from the parser. */
  sourceLocation?: string;
}

/**
 * A direct field reference on a single object.
 *
 * Example: `SBQQ__Quote__c.SBQQ__NetAmount__c` →
 *   `{ kind: 'field', object: 'SBQQ__Quote__c', field: 'SBQQ__NetAmount__c' }`
 */
export interface DirectFieldRef extends FieldRefBase {
  kind: 'field';
  /** Fully qualified with namespace where present, case-canonicalized. */
  object: string;
  field: string;
}

/**
 * A relationship-path field reference.
 *
 * Example: `Account__r.Owner.Profile.Name` →
 *   `{ kind: 'path', rootObject: 'SBQQ__Quote__c',
 *      path: ['Account__r', 'Owner'], terminalField: 'Profile.Name' }`
 */
export interface PathFieldRef extends FieldRefBase {
  kind: 'path';
  rootObject: string;
  /** Relationship traversal. e.g. `['Account__r', 'Owner']` */
  path: string[];
  /** Terminal field on the last hop of the path. */
  terminalField: string;
}

/** Discriminated union of direct and path field refs. */
export type FieldRefIR = DirectFieldRef | PathFieldRef;
