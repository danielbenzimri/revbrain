import { describe, it, expect } from 'vitest';
import { normalizeSalesforceId } from '../../src/salesforce/auth.ts';

describe('normalizeSalesforceId', () => {
  it('should convert 15-char ID to 18-char', () => {
    // Known conversion: 001D000000IH2Qp → 001D000000IH2QpIAL
    const id15 = '001D000000IH2Qp';
    const id18 = normalizeSalesforceId(id15);
    expect(id18).toHaveLength(18);
    expect(id18).toBe('001D000000IH2QpIAL');
  });

  it('should return 18-char IDs unchanged', () => {
    const id18 = '001D000000IH2QpIAL';
    expect(normalizeSalesforceId(id18)).toBe(id18);
  });

  it('should return empty/invalid IDs unchanged', () => {
    expect(normalizeSalesforceId('')).toBe('');
    expect(normalizeSalesforceId('abc')).toBe('abc');
  });

  it('should handle all-lowercase 15-char ID', () => {
    const id = '001d000000ih2qp';
    const result = normalizeSalesforceId(id);
    expect(result).toHaveLength(18);
    // All lowercase → checksum should be AAA
    expect(result).toBe('001d000000ih2qpAAA');
  });
});

describe('SalesforceAuth', () => {
  // SalesforceAuth requires a real DB connection and encryption keys.
  // These tests would be integration tests. For unit tests, we verify
  // the normalization utility and the module imports correctly.

  it('should export SalesforceAuth class', async () => {
    const mod = await import('../../src/salesforce/auth.ts');
    expect(mod.SalesforceAuth).toBeDefined();
  });
});
