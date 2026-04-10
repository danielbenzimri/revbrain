/**
 * NodeRef — reference from one IR node to another.
 *
 * Spec: §5.1a (new in v1.1, tightened in v1.2).
 *
 * Every place one IR node points at another, BB-3 uses a `NodeRef`
 * rather than a bare `string`. This mechanically enforces G7
 * (dangling-reference safety): an unresolved reference is a typed
 * state the compiler cannot ignore, not a silently-missing string.
 */

/**
 * Reasons a reference could not be resolved to a target node.
 *
 * - `'orphaned'`       — parent referenced but not present in findings
 * - `'out-of-scope'`   — reference points outside the extraction scope
 * - `'parse-failure'`  — Apex/formula couldn't be parsed to recover the ref
 * - `'dynamic'`        — dynamic field reference (e.g. string-concatenated)
 * - `'unknown-target'` — catch-all with a hint
 */
export type UnresolvedReason =
  | 'orphaned'
  | 'out-of-scope'
  | 'parse-failure'
  | 'dynamic'
  | 'unknown-target';

/**
 * A resolved reference — `id` points at a real node in `IRGraph.nodes`.
 */
export interface ResolvedNodeRef {
  /** The target node's `id`. */
  id: string;
  resolved: true;
}

/**
 * An unresolved reference — the normalizer tried and failed.
 * This is NOT a runtime error: it is a first-class state that
 * downstream consumers MUST handle.
 */
export interface UnresolvedNodeRef {
  id: null;
  resolved: false;
  reason: UnresolvedReason;
  /** Human-readable hint, e.g. 'parent rule id a0V3... not in findings'. */
  hint?: string;
  /** The finding field that would have carried the resolution, if any. */
  sourceField?: string;
}

/**
 * Discriminated union on `resolved: boolean`. Never a bare string.
 */
export type NodeRef = ResolvedNodeRef | UnresolvedNodeRef;

/** Construct a resolved NodeRef pointing at `id`. */
export function resolvedRef(id: string): NodeRef {
  return { id, resolved: true };
}

/** Construct an unresolved NodeRef with a structured reason. */
export function unresolvedRef(
  reason: UnresolvedReason,
  hint?: string,
  sourceField?: string
): NodeRef {
  const ref: UnresolvedNodeRef = { id: null, resolved: false, reason };
  if (hint !== undefined) ref.hint = hint;
  if (sourceField !== undefined) ref.sourceField = sourceField;
  return ref;
}
