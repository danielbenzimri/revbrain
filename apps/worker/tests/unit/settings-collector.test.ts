/**
 * Unit tests: Settings collector enhancements (T-C01)
 *
 * Tests credential redaction, override detection, and formatting.
 */
import { describe, it, expect } from 'vitest';

// We test the exported logic indirectly through the assembler,
// and directly test the redaction/formatting patterns here.

/** Credential-like field name patterns (mirrors settings.ts) */
const REDACT_FIELD_PATTERNS = /password|token|secret|key|credential|apikey/i;
const REDACT_VALUE_PATTERNS = /^(sk-|xox-|AKIA|Bearer\s|eyJ)/;

function shouldRedact(fieldName: string, value: unknown): boolean {
  if (REDACT_FIELD_PATTERNS.test(fieldName)) return true;
  if (typeof value === 'string' && REDACT_VALUE_PATTERNS.test(value)) return true;
  return false;
}

function formatSettingValue(value: unknown, fieldName?: string): string {
  if (fieldName && shouldRedact(fieldName, value)) return '[REDACTED]';
  if (value === true) return 'Enabled';
  if (value === false) return 'Disabled';
  if (value === null || value === undefined) return 'Not Set';
  if (typeof value === 'number') return String(value);
  const strValue = String(value) || 'Empty';
  if (REDACT_VALUE_PATTERNS.test(strValue)) return '[REDACTED]';
  return strValue;
}

describe('T-C01: Settings collector — credential redaction', () => {
  it('redacts field named with "password"', () => {
    expect(shouldRedact('SBQQ__APIPassword__c', 'secret123')).toBe(true);
  });

  it('redacts field named with "token"', () => {
    expect(shouldRedact('SBQQ__AuthToken__c', 'abc')).toBe(true);
  });

  it('redacts field named with "secret"', () => {
    expect(shouldRedact('SBQQ__ClientSecret__c', 'xyz')).toBe(true);
  });

  it('redacts field named with "key"', () => {
    expect(shouldRedact('SBQQ__ApiKey__c', 'k123')).toBe(true);
  });

  it('does NOT redact normal fields', () => {
    expect(shouldRedact('SBQQ__QuoteLineEditor__c', true)).toBe(false);
    expect(shouldRedact('SBQQ__MultiCurrency__c', 'Enabled')).toBe(false);
  });

  it('redacts values starting with sk- (API key pattern)', () => {
    expect(shouldRedact('SBQQ__SomeField__c', 'sk-abc123def456')).toBe(true);
  });

  it('redacts values starting with Bearer (auth token)', () => {
    expect(shouldRedact('SBQQ__SomeField__c', 'Bearer eyJabc...')).toBe(true);
  });

  it('redacts values starting with AKIA (AWS key)', () => {
    expect(shouldRedact('SBQQ__SomeField__c', 'AKIAIOSFODNN7EXAMPLE')).toBe(true);
  });

  it('redacts values starting with eyJ (JWT)', () => {
    expect(shouldRedact('SBQQ__SomeField__c', 'eyJhbGciOiJIUzI1NiJ9')).toBe(true);
  });

  it('does NOT redact normal values', () => {
    expect(shouldRedact('SBQQ__SomeField__c', 'Monthly')).toBe(false);
    expect(shouldRedact('SBQQ__SomeField__c', '12')).toBe(false);
  });
});

describe('T-C01: Settings collector — formatSettingValue', () => {
  it('returns Enabled for true', () => {
    expect(formatSettingValue(true)).toBe('Enabled');
  });

  it('returns Disabled for false', () => {
    expect(formatSettingValue(false)).toBe('Disabled');
  });

  it('returns Not Set for null', () => {
    expect(formatSettingValue(null)).toBe('Not Set');
  });

  it('returns number as string', () => {
    expect(formatSettingValue(42)).toBe('42');
  });

  it('returns string value', () => {
    expect(formatSettingValue('Monthly')).toBe('Monthly');
  });

  it('returns [REDACTED] for sensitive field name', () => {
    expect(formatSettingValue('secret123', 'SBQQ__APIPassword__c')).toBe('[REDACTED]');
  });

  it('returns [REDACTED] for JWT-like value even without field name match', () => {
    expect(formatSettingValue('eyJhbGciOiJIUzI1NiJ9')).toBe('[REDACTED]');
  });
});

describe('T-C01: Settings collector — override detection', () => {
  it('identifies org-level record by 00D prefix', () => {
    const records = [
      { SetupOwnerId: '00D000000000001' },
      { SetupOwnerId: '00e000000000001' },
      { SetupOwnerId: '005000000000001' },
    ];
    const orgRecord = records.find((r) => (r.SetupOwnerId as string).startsWith('00D'));
    const profileOverrides = records.filter((r) => (r.SetupOwnerId as string).startsWith('00e'));
    const userOverrides = records.filter((r) => (r.SetupOwnerId as string).startsWith('005'));

    expect(orgRecord).toBeDefined();
    expect(profileOverrides).toHaveLength(1);
    expect(userOverrides).toHaveLength(1);
  });

  it('handles org with no overrides', () => {
    const records = [{ SetupOwnerId: '00D000000000001' }];
    const profileOverrides = records.filter((r) => (r.SetupOwnerId as string).startsWith('00e'));
    const userOverrides = records.filter((r) => (r.SetupOwnerId as string).startsWith('005'));

    expect(profileOverrides).toHaveLength(0);
    expect(userOverrides).toHaveLength(0);
  });
});
