import { describe, expect, it } from 'vitest';
import { canonicalJson, CANONICAL_JSON_ERROR_CODES } from './canonical-json.ts';
import { BB3InternalError } from '../types/errors.ts';

/** Helper: assert canonicalJson throws with a specific code. */
function expectRejectWithCode(value: unknown, code: string): void {
  let caught: unknown;
  try {
    canonicalJson(value);
  } catch (e) {
    caught = e;
  }
  expect(caught, `expected canonicalJson(${String(value)}) to throw`).toBeInstanceOf(
    BB3InternalError
  );
  const detail = (caught as BB3InternalError).detail as { code?: string } | undefined;
  expect(detail?.code).toBe(code);
}

describe('PH1.1 — canonicalJson()', () => {
  describe('primitives', () => {
    it('serializes null', () => {
      expect(canonicalJson(null)).toBe('null');
    });

    it('serializes booleans', () => {
      expect(canonicalJson(true)).toBe('true');
      expect(canonicalJson(false)).toBe('false');
    });

    it('serializes finite numbers', () => {
      expect(canonicalJson(0)).toBe('0');
      expect(canonicalJson(1)).toBe('1');
      expect(canonicalJson(-1)).toBe('-1');
      expect(canonicalJson(1.5)).toBe('1.5');
      expect(canonicalJson(1e-10)).toBe('1e-10');
    });

    it('folds negative zero to zero', () => {
      expect(canonicalJson(-0)).toBe('0');
      expect(canonicalJson(-0)).toBe(canonicalJson(0));
    });

    it('serializes simple ASCII strings', () => {
      expect(canonicalJson('hello')).toBe('"hello"');
      expect(canonicalJson('')).toBe('""');
    });

    it('escapes JSON specials in strings', () => {
      expect(canonicalJson('a"b')).toBe('"a\\"b"');
      expect(canonicalJson('a\\b')).toBe('"a\\\\b"');
    });

    it('escapes control characters as \\uXXXX', () => {
      expect(canonicalJson('\n')).toBe('"\\u000a"');
      expect(canonicalJson('\t')).toBe('"\\u0009"');
    });

    it('escapes non-ASCII as \\uXXXX for byte-identity across engines', () => {
      // 'café' — "é" is U+00E9
      expect(canonicalJson('café')).toBe('"caf\\u00e9"');
    });

    it('NFC-normalizes strings before serialization', () => {
      // 'café' composed (U+00E9) vs decomposed (e + U+0301).
      const composed = 'caf\u00e9';
      const decomposed = 'cafe\u0301';
      expect(composed).not.toBe(decomposed);
      expect(canonicalJson(composed)).toBe(canonicalJson(decomposed));
    });
  });

  describe('objects', () => {
    it('sorts keys lexicographically', () => {
      expect(canonicalJson({ b: 2, a: 1 })).toBe('{"a":1,"b":2}');
      expect(canonicalJson({ z: 1, a: 2 })).toBe('{"a":2,"z":1}');
    });

    it('key order is insertion-independent', () => {
      expect(canonicalJson({ a: 1, b: 2 })).toBe(canonicalJson({ b: 2, a: 1 }));
    });

    it('serializes empty object', () => {
      expect(canonicalJson({})).toBe('{}');
    });

    it('silently omits undefined properties (v1.2 undefined policy)', () => {
      expect(canonicalJson({ a: 1, b: undefined, c: 3 })).toBe('{"a":1,"c":3}');
      expect(canonicalJson({ a: 1, b: undefined, c: 3 })).toBe(canonicalJson({ a: 1, c: 3 }));
      expect(canonicalJson({ a: undefined })).toBe('{}');
    });

    it('distinguishes null from undefined in object values', () => {
      // null is kept; undefined is omitted.
      expect(canonicalJson({ a: 1, b: null })).not.toBe(canonicalJson({ a: 1, b: undefined }));
      expect(canonicalJson({ a: 1, b: null })).toBe('{"a":1,"b":null}');
      expect(canonicalJson({ a: 1, b: undefined })).toBe('{"a":1}');
    });

    it('nested objects serialize with sorted keys at every level', () => {
      const input = { z: { b: 2, a: 1 }, a: { y: 2, x: 1 } };
      expect(canonicalJson(input)).toBe('{"a":{"x":1,"y":2},"z":{"a":1,"b":2}}');
    });
  });

  describe('arrays', () => {
    it('preserves array order (arrays are ordered data)', () => {
      expect(canonicalJson([1, 2])).toBe('[1,2]');
      expect(canonicalJson([2, 1])).toBe('[2,1]');
      expect(canonicalJson([1, 2])).not.toBe(canonicalJson([2, 1]));
    });

    it('serializes empty array', () => {
      expect(canonicalJson([])).toBe('[]');
    });

    it('serializes nested arrays', () => {
      expect(canonicalJson([[1, 2], [3]])).toBe('[[1,2],[3]]');
    });
  });

  describe('reject cases', () => {
    it('rejects top-level undefined', () => {
      expectRejectWithCode(undefined, CANONICAL_JSON_ERROR_CODES.TOP_LEVEL_UNDEFINED);
    });

    it('rejects undefined inside an array', () => {
      expectRejectWithCode([1, undefined, 3], CANONICAL_JSON_ERROR_CODES.ARRAY_UNDEFINED_ELEMENT);
    });

    it('rejects NaN', () => {
      expectRejectWithCode(Number.NaN, CANONICAL_JSON_ERROR_CODES.NON_FINITE_NUMBER);
    });

    it('rejects Infinity', () => {
      expectRejectWithCode(Number.POSITIVE_INFINITY, CANONICAL_JSON_ERROR_CODES.NON_FINITE_NUMBER);
      expectRejectWithCode(Number.NEGATIVE_INFINITY, CANONICAL_JSON_ERROR_CODES.NON_FINITE_NUMBER);
    });

    it('rejects BigInt', () => {
      expectRejectWithCode(1n, CANONICAL_JSON_ERROR_CODES.BIGINT);
    });

    it('rejects Date (caller must ISO-stringify first)', () => {
      expectRejectWithCode(new Date(0), CANONICAL_JSON_ERROR_CODES.DATE);
    });

    it('rejects RegExp', () => {
      expectRejectWithCode(/abc/, CANONICAL_JSON_ERROR_CODES.REGEXP);
    });

    it('rejects Function', () => {
      expectRejectWithCode(() => 1, CANONICAL_JSON_ERROR_CODES.FUNCTION);
    });

    it('rejects Symbol', () => {
      expectRejectWithCode(Symbol('x'), CANONICAL_JSON_ERROR_CODES.SYMBOL);
    });

    it('rejects Map', () => {
      expectRejectWithCode(new Map(), CANONICAL_JSON_ERROR_CODES.MAP);
    });

    it('rejects Set', () => {
      expectRejectWithCode(new Set(), CANONICAL_JSON_ERROR_CODES.SET);
    });

    it('rejects typed arrays', () => {
      expectRejectWithCode(new Uint8Array([1, 2, 3]), CANONICAL_JSON_ERROR_CODES.TYPED_ARRAY);
    });

    it('rejects cycles', () => {
      const a: Record<string, unknown> = { name: 'a' };
      const b: Record<string, unknown> = { name: 'b', a };
      a.b = b; // a → b → a
      expectRejectWithCode(a, CANONICAL_JSON_ERROR_CODES.CYCLE);
    });

    it('rejects Symbol-keyed properties on plain objects', () => {
      const obj = { a: 1 } as Record<string | symbol, unknown>;
      obj[Symbol('x')] = 2;
      expectRejectWithCode(obj, CANONICAL_JSON_ERROR_CODES.SYMBOL_KEY);
    });
  });

  describe('sibling subtrees are not false cycles', () => {
    it('a value repeated as a sibling is OK', () => {
      const shared = { name: 'shared' };
      // shared appears twice in sibling positions — not a cycle.
      const input = { a: shared, b: shared };
      expect(canonicalJson(input)).toBe('{"a":{"name":"shared"},"b":{"name":"shared"}}');
    });
  });

  describe('acceptance cases from spec §8.1', () => {
    it('sorted-key equivalence', () => {
      expect(canonicalJson({ a: 1, b: 2 })).toBe(canonicalJson({ b: 2, a: 1 }));
    });

    it('array order matters', () => {
      expect(canonicalJson([1, 2])).not.toBe(canonicalJson([2, 1]));
    });

    it('undefined property omission is invisible in output', () => {
      expect(canonicalJson({ a: 1, b: undefined, c: 3 })).toBe(canonicalJson({ a: 1, c: 3 }));
    });

    it('{} is invariant under all-undefined', () => {
      expect(canonicalJson({ a: undefined })).toBe(canonicalJson({}));
    });

    it('null and undefined differ in object values', () => {
      expect(canonicalJson({ a: 1, b: null })).not.toBe(canonicalJson({ a: 1, b: undefined }));
    });
  });
});
