import { describe, expect, it } from 'vitest';
import { validateOptions } from '../src/validate-options.ts';
import { InvalidOptionsError } from '../src/errors.ts';

describe('SEG-1.1 — options validation', () => {
  it('accepts undefined (all defaults)', () => {
    expect(() => validateOptions(undefined)).not.toThrow();
  });

  it('accepts empty object', () => {
    expect(() => validateOptions({})).not.toThrow();
  });

  it('accepts valid thresholds', () => {
    const opts = validateOptions({
      thresholds: { largeSegment: 100, heavyWave: 300, maxArticulationHints: 10 },
    });
    expect(opts.thresholds?.largeSegment).toBe(100);
  });

  it('rejects negative thresholds', () => {
    expect(() => validateOptions({ thresholds: { largeSegment: -1 } })).toThrow(
      InvalidOptionsError
    );
  });

  it('rejects zero thresholds', () => {
    expect(() => validateOptions({ thresholds: { heavyWave: 0 } })).toThrow(InvalidOptionsError);
  });

  it('rejects non-integer largeSegment', () => {
    expect(() => validateOptions({ thresholds: { largeSegment: 1.5 } })).toThrow(
      InvalidOptionsError
    );
  });

  it('accepts valid weights', () => {
    expect(() => validateOptions({ weights: { simple: 2, complex: 15 } })).not.toThrow();
  });

  it('rejects negative weights', () => {
    expect(() => validateOptions({ weights: { simple: -1 } })).toThrow(InvalidOptionsError);
  });

  it('accepts valid authority scores (including zero)', () => {
    expect(() =>
      validateOptions({ authorityScores: { Product: 0, PricingRule: 99 } })
    ).not.toThrow();
  });

  it('rejects negative authority scores', () => {
    expect(() => validateOptions({ authorityScores: { Product: -5 } })).toThrow(
      InvalidOptionsError
    );
  });

  it('rejects unknown top-level keys', () => {
    expect(() => validateOptions({ unknownKey: true } as never)).toThrow(InvalidOptionsError);
  });

  it('accepts enableHeuristics flag', () => {
    const opts = validateOptions({ enableHeuristics: true });
    expect(opts.enableHeuristics).toBe(true);
  });
});
