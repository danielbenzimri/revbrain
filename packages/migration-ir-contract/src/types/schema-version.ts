/**
 * IR schema version constants.
 *
 * Spec: §5.8.
 *
 * `IR_SCHEMA_VERSION` follows semver. Bump rules:
 *
 * - PATCH: additive, non-breaking. Adding an optional field to an
 *   existing node, adding a new entry to an enum's `'unknown'`
 *   fallback, adding a new warning class.
 *
 * - MINOR: adding a new IR node type. Downstream consumers that
 *   ignore unknown types keep working; consumers that enumerate
 *   exhaustively need a case clause.
 *
 * - MAJOR: renaming a field, changing a field's type, removing a
 *   field, changing the identity hash recipe. Consumers MUST be
 *   updated in lockstep. A MAJOR bump that touches identity-hash
 *   recipes MUST be accompanied by a migration routine that rewrites
 *   historical `irSchemaVersion < N` graphs.
 *
 * PH0.10 lands the initial value `'1.0.0'`. It will be bumped by
 * future tasks as the schema evolves during the waves.
 */

export const IR_SCHEMA_VERSION = '1.0.0';
