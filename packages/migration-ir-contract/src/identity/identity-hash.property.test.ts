import { describe, expect, it } from 'vitest';
import { identityHash } from './identity-hash.ts';
import type { IRNodeType } from '../types/nodes.ts';

/**
 * PH1.6 — identityHash collision + stability property tests.
 *
 * Spec: §5.2.
 *
 * Deterministic Mulberry32 PRNG so the tests are reproducible but
 * still exercise a broad input space.
 */

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

const NODE_TYPES: readonly IRNodeType[] = [
  'PricingRule',
  'PriceCondition',
  'PriceAction',
  'DiscountSchedule',
  'BundleStructure',
  'Product',
  'FormulaField',
  'ValidationRule',
];

describe('PH1.6 — identityHash collision resistance', () => {
  it('10,000 distinct random payloads produce 10,000 distinct hashes (no collisions)', () => {
    const rng = mulberry32(0xc0ffee);
    const seen = new Set<string>();
    for (let i = 0; i < 10_000; i++) {
      // Build a random but distinct payload by embedding the iteration
      // counter alongside random fields. The counter guarantees
      // distinctness in the payload space; the random fields exercise
      // the hash's diffusion.
      const payload = {
        iter: i,
        parentObject: `Obj${Math.floor(rng() * 1000)}`,
        scope: Math.floor(rng() * 16),
        order: rng() * 1000,
        flag: rng() < 0.5,
      };
      const nodeType = NODE_TYPES[i % NODE_TYPES.length]!;
      const hash = identityHash(nodeType, 'id', payload);
      expect(seen.has(hash), `collision at iteration ${i}: ${hash}`).toBe(false);
      seen.add(hash);
    }
    expect(seen.size).toBe(10_000);
  });
});

describe('PH1.6 — identityHash stability across re-runs', () => {
  it('100 random payloads produce identical hashes across 3 consecutive runs', () => {
    const rng = mulberry32(0xfeedface);
    for (let i = 0; i < 100; i++) {
      const payload = {
        parentObject: `Obj${Math.floor(rng() * 1000)}`,
        scope: Math.floor(rng() * 16),
        order: rng() * 1000,
        nested: { a: rng() * 100, b: rng() < 0.5 ? 'yes' : 'no' },
      };
      const nodeType = NODE_TYPES[i % NODE_TYPES.length]!;
      const h1 = identityHash(nodeType, 'id', payload);
      const h2 = identityHash(nodeType, 'id', payload);
      const h3 = identityHash(nodeType, 'id', payload);
      expect(h1).toBe(h2);
      expect(h2).toBe(h3);
    }
  });

  it('stability is invariant under object key reordering', () => {
    const rng = mulberry32(0xdeadbeef);
    for (let i = 0; i < 50; i++) {
      const a = Math.floor(rng() * 1000);
      const b = Math.floor(rng() * 1000);
      const c = rng() < 0.5;
      const payloadA = { x: a, y: b, z: c };
      const payloadB = { z: c, x: a, y: b };
      expect(identityHash('PricingRule', 'id', payloadA)).toBe(
        identityHash('PricingRule', 'id', payloadB)
      );
    }
  });
});
