/**
 * canonicalJson — deterministic JSON serializer used by every
 * identity hash and the final graph serialization.
 *
 * Spec: §8.1 (tightened contract), §5.1 (determinism), §5.2 (identity).
 *
 * The single most load-bearing function in BB-3. Any divergence
 * between "the serializer BB-3 writes with" and "the serializer the
 * determinism test reads with" is a silent correctness bug, so both
 * code paths use this exact implementation.
 *
 * ACCEPTS:
 *   - `string`   — NFC-normalized, escaped as `\uXXXX` for non-ASCII.
 *   - `number`   — finite float64 only; `-0` folds to `0`.
 *   - `boolean`
 *   - `null`
 *   - plain `Array`
 *   - plain `Object` (own enumerable string-keyed props)
 *   - Object properties with value `undefined` are SILENTLY OMITTED
 *     (v1.2 undefined policy, Auditor 3 P1 #6).
 *
 * REJECTS (throws `BB3InternalError` with a stage-prefixed code):
 *   - top-level `undefined`
 *   - array elements equal to `undefined`
 *   - `NaN`, `Infinity`, `-Infinity`
 *   - `BigInt`, `Date`, `RegExp`, `Function`, `Symbol`
 *   - `Map`, `Set`, typed arrays
 *   - cycles in the input graph
 *   - Symbol-keyed properties on plain objects
 *
 * RULES:
 *   - Object keys sorted lexicographically (UTF-16 code-unit order,
 *     matching `Array.prototype.sort`).
 *   - Arrays preserve input order.
 *   - Strings are NFC-normalized.
 *   - Non-ASCII + JSON specials escaped as `\uXXXX`.
 *   - Numbers via ECMAScript `ToString(Number)` — no trailing zeros,
 *     no `+`, no locale.
 *   - No whitespace. No trailing newline.
 */

import { BB3InternalError } from '../types/errors.ts';

/** Stable error codes emitted by canonicalJson. Surface to callers via `detail.code`. */
export const CANONICAL_JSON_ERROR_CODES = {
  TOP_LEVEL_UNDEFINED: 'BB3_CJ001',
  ARRAY_UNDEFINED_ELEMENT: 'BB3_CJ002',
  NON_FINITE_NUMBER: 'BB3_CJ003',
  BIGINT: 'BB3_CJ004',
  DATE: 'BB3_CJ005',
  REGEXP: 'BB3_CJ006',
  FUNCTION: 'BB3_CJ007',
  SYMBOL: 'BB3_CJ008',
  MAP: 'BB3_CJ009',
  SET: 'BB3_CJ010',
  TYPED_ARRAY: 'BB3_CJ011',
  CYCLE: 'BB3_CJ012',
  SYMBOL_KEY: 'BB3_CJ013',
  UNKNOWN_KIND: 'BB3_CJ014',
} as const;

type CanonicalJsonErrorCode =
  (typeof CANONICAL_JSON_ERROR_CODES)[keyof typeof CANONICAL_JSON_ERROR_CODES];

function reject(code: CanonicalJsonErrorCode, message: string, detail?: unknown): never {
  throw new BB3InternalError(`canonicalJson: ${message}`, {
    code,
    ...(detail === undefined ? {} : { detail }),
  });
}

/** Escape a string: NFC-normalize, then escape all non-printable-ASCII + JSON specials. */
function escapeString(raw: string): string {
  const normalized = raw.normalize('NFC');
  let out = '"';
  for (let i = 0; i < normalized.length; i++) {
    const code = normalized.charCodeAt(i);
    // JSON specials that MUST be escaped.
    if (code === 0x22 /* " */) {
      out += '\\"';
      continue;
    }
    if (code === 0x5c /* \ */) {
      out += '\\\\';
      continue;
    }
    // Printable ASCII (0x20..0x7e) excluding the two escaped above goes raw.
    if (code >= 0x20 && code <= 0x7e) {
      out += normalized[i];
      continue;
    }
    // Everything else: \uXXXX. This includes control chars < 0x20,
    // DEL (0x7f), and all non-ASCII. Escaping everything non-printable
    // guarantees byte-identity across every JSON engine in existence.
    out += '\\u' + code.toString(16).padStart(4, '0');
  }
  out += '"';
  return out;
}

/** Serialize a finite number with `-0` folded to `0`. */
function serializeNumber(n: number): string {
  if (!Number.isFinite(n)) {
    reject(
      CANONICAL_JSON_ERROR_CODES.NON_FINITE_NUMBER,
      `number must be finite (got ${String(n)})`
    );
  }
  // `-0 === 0` is true, so we have to detect it via `1/n === -Infinity`.
  if (n === 0 && 1 / n === -Infinity) {
    return '0';
  }
  return String(n);
}

/** Detect typed arrays without relying on individual constructors. */
function isTypedArray(value: object): boolean {
  return ArrayBuffer.isView(value) && !(value instanceof DataView);
}

/**
 * Walk a value recursively and serialize it. Cycle detection via a
 * `Set` passed by reference; entries are added on descent and
 * removed on ascent so sibling subtrees don't falsely report as
 * cycles.
 *
 * Recursion depth is bounded in practice by the IR graph shape —
 * real-world inputs are shallow (≤ ~30 levels). Node's default
 * stack comfortably handles this. If a future pathological input
 * ever blows the stack, migrate to an explicit stack here.
 */
function walk(value: unknown, seen: Set<object>): string {
  // Primitive branches first.
  if (value === null) return 'null';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') return serializeNumber(value);
  if (typeof value === 'string') return escapeString(value);

  // Rejected primitives.
  if (typeof value === 'bigint') {
    reject(CANONICAL_JSON_ERROR_CODES.BIGINT, 'BigInt is not representable in canonical JSON');
  }
  if (typeof value === 'symbol') {
    reject(CANONICAL_JSON_ERROR_CODES.SYMBOL, 'Symbol is not representable in canonical JSON');
  }
  if (typeof value === 'function') {
    reject(CANONICAL_JSON_ERROR_CODES.FUNCTION, 'Function is not representable in canonical JSON');
  }
  if (value === undefined) {
    // Reached from top-level or inside an array — both illegal.
    // Object-property undefineds are filtered before this function sees them.
    reject(
      CANONICAL_JSON_ERROR_CODES.TOP_LEVEL_UNDEFINED,
      'undefined is not representable at the top level or inside an array'
    );
  }

  // Object-like branches.
  if (typeof value === 'object') {
    const obj = value as object;

    // Cycle detection.
    if (seen.has(obj)) {
      reject(CANONICAL_JSON_ERROR_CODES.CYCLE, 'cycle detected in input graph');
    }

    // Built-ins that look like objects but aren't plain JSON.
    if (obj instanceof Date) {
      reject(
        CANONICAL_JSON_ERROR_CODES.DATE,
        'Date is not representable; convert to ISO 8601 string first'
      );
    }
    if (obj instanceof RegExp) {
      reject(CANONICAL_JSON_ERROR_CODES.REGEXP, 'RegExp is not representable');
    }
    if (obj instanceof Map) {
      reject(
        CANONICAL_JSON_ERROR_CODES.MAP,
        'Map is not representable; convert to plain object first'
      );
    }
    if (obj instanceof Set) {
      reject(
        CANONICAL_JSON_ERROR_CODES.SET,
        'Set is not representable; convert to plain array first'
      );
    }
    if (isTypedArray(obj)) {
      reject(
        CANONICAL_JSON_ERROR_CODES.TYPED_ARRAY,
        'typed arrays are not representable; convert to plain array first'
      );
    }

    seen.add(obj);
    try {
      if (Array.isArray(obj)) {
        const parts: string[] = [];
        for (let i = 0; i < obj.length; i++) {
          const el = obj[i];
          if (el === undefined) {
            reject(
              CANONICAL_JSON_ERROR_CODES.ARRAY_UNDEFINED_ELEMENT,
              `array element at index ${i} is undefined`
            );
          }
          parts.push(walk(el, seen));
        }
        return '[' + parts.join(',') + ']';
      }

      // Plain object.
      // Symbol-keyed properties are forbidden — iteration order is implementation-defined.
      if (Object.getOwnPropertySymbols(obj).length > 0) {
        reject(
          CANONICAL_JSON_ERROR_CODES.SYMBOL_KEY,
          'Symbol-keyed properties are not representable'
        );
      }
      const record = obj as Record<string, unknown>;
      const keys = Object.keys(record).sort();
      const parts: string[] = [];
      for (const key of keys) {
        const v = record[key];
        // v1.2 undefined policy: silently omit undefined-valued properties.
        if (v === undefined) continue;
        parts.push(escapeString(key) + ':' + walk(v, seen));
      }
      return '{' + parts.join(',') + '}';
    } finally {
      seen.delete(obj);
    }
  }

  // Shouldn't be reachable, but surface a clear error if it is.
  reject(CANONICAL_JSON_ERROR_CODES.UNKNOWN_KIND, `unsupported value kind: ${typeof value}`);
}

/**
 * Canonical JSON serializer.
 */
export function canonicalJson(value: unknown): string {
  if (value === undefined) {
    reject(
      CANONICAL_JSON_ERROR_CODES.TOP_LEVEL_UNDEFINED,
      'undefined is not representable at the top level'
    );
  }
  return walk(value, new Set<object>());
}
