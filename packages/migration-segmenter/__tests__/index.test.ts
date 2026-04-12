import { describe, expect, it } from 'vitest';
import { DEFAULT_COMPLEXITY_WEIGHTS, DEFAULT_AUTHORITY_SCORES } from '../src/index.ts';

describe('migration-segmenter package', () => {
  it('re-exports segment constants from the contract package', () => {
    expect(DEFAULT_COMPLEXITY_WEIGHTS.simple).toBe(1);
    expect(DEFAULT_COMPLEXITY_WEIGHTS.complex).toBe(9);
    expect(DEFAULT_AUTHORITY_SCORES.PricingRule).toBe(80);
    expect(DEFAULT_AUTHORITY_SCORES.CyclicDependency).toBe(100);
  });
});
