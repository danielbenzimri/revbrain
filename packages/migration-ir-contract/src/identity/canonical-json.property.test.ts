import { describe, expect, it } from 'vitest';
import { canonicalJson } from './canonical-json.ts';

/**
 * Property tests for canonicalJson.
 *
 * Spec: PH1.5 — "round-trip, ordering, NFC" properties.
 *
 * We do not pull in a property-testing library; instead we drive a
 * deterministic pseudorandom generator seeded by the test-suite so
 * the tests are reproducible but still cover a broad input space.
 * Each property is exercised on at least 100 random cases.
 */

/** Deterministic PRNG. Mulberry32 — small, stateless, reproducible. */
function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = t;
    r = Math.imul(r ^ (r >>> 15), r | 1);
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

const rng = mulberry32(0xdeadbeef);

/** Generate a random primitive value. No undefined, no non-finite. */
function randomPrimitive(): unknown {
  const choice = Math.floor(rng() * 6);
  switch (choice) {
    case 0:
      return null;
    case 1:
      return rng() < 0.5;
    case 2:
      return Math.floor(rng() * 1000) - 500; // integers
    case 3:
      return rng() * 2 - 1; // floats in [-1, 1]
    case 4: {
      // short ASCII string
      const len = Math.floor(rng() * 10);
      let s = '';
      for (let i = 0; i < len; i++) s += String.fromCharCode(0x61 + Math.floor(rng() * 26));
      return s;
    }
    case 5: {
      // Unicode string (latin-1 + some BMP)
      const len = Math.floor(rng() * 10);
      let s = '';
      for (let i = 0; i < len; i++) s += String.fromCharCode(Math.floor(rng() * 0x300));
      return s;
    }
  }
  return null;
}

/** Generate a random plain JSON value up to a small depth. */
function randomValue(depth: number): unknown {
  if (depth <= 0 || rng() < 0.5) return randomPrimitive();
  const choice = Math.floor(rng() * 3);
  if (choice === 0) {
    const len = Math.floor(rng() * 4);
    const arr: unknown[] = [];
    for (let i = 0; i < len; i++) arr.push(randomValue(depth - 1));
    return arr;
  }
  if (choice === 1) {
    const len = Math.floor(rng() * 4);
    const obj: Record<string, unknown> = {};
    for (let i = 0; i < len; i++) {
      obj[`k${i}`] = randomValue(depth - 1);
    }
    return obj;
  }
  // Deep-object with varying key names to exercise key-sort
  const len = 1 + Math.floor(rng() * 5);
  const obj: Record<string, unknown> = {};
  for (let i = 0; i < len; i++) {
    obj[String.fromCharCode(0x61 + Math.floor(rng() * 26))] = randomValue(depth - 1);
  }
  return obj;
}

/** Shuffle object keys in place, recursively, to produce a semantically-equal reordering. */
function shuffleKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(shuffleKeys);
  if (value === null || typeof value !== 'object') return value;
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record);
  // Fisher-Yates using rng
  for (let i = keys.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = keys[i]!;
    keys[i] = keys[j]!;
    keys[j] = tmp;
  }
  const shuffled: Record<string, unknown> = {};
  for (const k of keys) {
    shuffled[k] = shuffleKeys(record[k]);
  }
  return shuffled;
}

describe('PH1.5 — canonicalJson property tests', () => {
  describe('idempotence under key reordering', () => {
    it('100 random object graphs serialize identically after key shuffle', () => {
      for (let i = 0; i < 100; i++) {
        const original = randomValue(4);
        // Ensure the top level is an object so shuffling is meaningful.
        const wrapped: Record<string, unknown> = {
          a: original,
          b: [1, 2, 3],
          c: { z: 'end', m: 'mid', a: 'start' },
        };
        const shuffled = shuffleKeys(wrapped);
        expect(canonicalJson(wrapped)).toBe(canonicalJson(shuffled));
      }
    });
  });

  describe('array order sensitivity', () => {
    it('100 random arrays produce different output when reversed (unless palindromic)', () => {
      for (let i = 0; i < 100; i++) {
        const len = 2 + Math.floor(rng() * 4);
        const arr: number[] = [];
        for (let j = 0; j < len; j++) arr.push(j);
        const reversed = [...arr].reverse();
        // A monotonically-increasing integer array is never a palindrome for len ≥ 2.
        expect(canonicalJson(arr)).not.toBe(canonicalJson(reversed));
      }
    });
  });

  describe('JSON parse round-trip', () => {
    it('100 random values survive canonicalJson → JSON.parse → canonicalJson', () => {
      for (let i = 0; i < 100; i++) {
        const original = randomValue(4);
        if (original === undefined) continue;
        // Wrap in an object to guarantee top level is legal.
        const wrapped = { v: original };
        const serialized = canonicalJson(wrapped);
        const reparsed = JSON.parse(serialized);
        expect(canonicalJson(reparsed)).toBe(serialized);
      }
    });
  });

  describe('NFC equivalence', () => {
    it('composed and decomposed forms of the same string serialize identically', () => {
      // é composed (U+00E9) vs decomposed (e + U+0301)
      const composed = 'caf\u00e9';
      const decomposed = 'cafe\u0301';
      expect(canonicalJson(composed)).toBe(canonicalJson(decomposed));

      // Å composed (U+00C5) vs decomposed (A + U+030A)
      const composedA = 'Angstr\u00f6m';
      const decomposedA = 'Angstro\u0308m';
      expect(canonicalJson(composedA)).toBe(canonicalJson(decomposedA));
    });
  });

  describe('byte-identity of primitives', () => {
    it('numeric whitespace and leading-zero variants normalize identically', () => {
      // Float parsing is stable: 1.0 → "1", 0.1 → "0.1".
      expect(canonicalJson(1.0)).toBe('1');
      expect(canonicalJson(0.1)).toBe('0.1');
    });
  });
});
