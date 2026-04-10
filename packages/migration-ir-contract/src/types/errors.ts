/**
 * BB3 error classes.
 *
 * Spec: §5.3 (error classes), §10.1 (hard-fail policy).
 *
 * BB-3 raises exactly two error classes:
 *
 * - `BB3InputError` — the caller's input is structurally broken
 *   (e.g. top-level is not an array, `options.strict` is on and the
 *   validator reported an error, or the malformed-finding rate
 *   exceeds `options.maxInvalidRate`).
 *
 * - `BB3InternalError` — a programmer bug inside BB-3 fired an
 *   assertion (e.g. a pattern-match fall-through, a true identity
 *   collision with conflicting content). Callers should treat this
 *   as "BB-3 is broken" and report it upward.
 *
 * Both classes carry an optional `detail: unknown` payload so the
 * caller can inspect the structured context of the failure without
 * parsing the message string.
 */

/**
 * Thrown when the caller's input is structurally broken.
 */
export class BB3InputError extends Error {
  public override readonly name = 'BB3InputError';
  public readonly detail?: unknown;

  constructor(message: string, detail?: unknown) {
    super(message);
    if (detail !== undefined) {
      this.detail = detail;
    }
    // Preserve the prototype chain across transpilation target boundaries.
    Object.setPrototypeOf(this, BB3InputError.prototype);
  }
}

/**
 * Thrown when BB-3 hits a state that should be unreachable.
 * Represents a programmer bug inside the normalizer.
 */
export class BB3InternalError extends Error {
  public override readonly name = 'BB3InternalError';
  public readonly detail?: unknown;

  constructor(message: string, detail?: unknown) {
    super(message);
    if (detail !== undefined) {
      this.detail = detail;
    }
    Object.setPrototypeOf(this, BB3InternalError.prototype);
  }
}
