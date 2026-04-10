import { describe, expect, it } from 'vitest';
import { BB3_VERSION } from './index.ts';

describe('PH0.2 — bb3-normalizer package smoke test', () => {
  it('exports BB3_VERSION as a non-empty string', () => {
    expect(typeof BB3_VERSION).toBe('string');
    expect(BB3_VERSION.length).toBeGreaterThan(0);
  });
});
