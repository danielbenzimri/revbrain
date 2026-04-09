/**
 * Unit tests for checkbox computation logic (Task T-01)
 *
 * Tests getCheckboxCategory(), isAccessible(), getCountOrNull(), isPopulated()
 * from the report assembler.
 */
import { describe, it, expect } from 'vitest';
import {
  getCheckboxCategory,
  isAccessible,
  getCountOrNull,
  isPopulated,
  CHECKBOX_THRESHOLDS,
} from '../../src/report/assembler.ts';

describe('getCheckboxCategory', () => {
  it('returns NOT_USED when population is 0%', () => {
    expect(getCheckboxCategory(0, 100)).toBe('NOT_USED');
  });

  it('returns SOMETIMES at 1% (lower boundary)', () => {
    expect(getCheckboxCategory(1, 100)).toBe('SOMETIMES');
  });

  it('returns SOMETIMES at 50% (upper boundary)', () => {
    expect(getCheckboxCategory(50, 100)).toBe('SOMETIMES');
  });

  it('returns MOST_TIMES at 51% (lower boundary)', () => {
    expect(getCheckboxCategory(51, 100)).toBe('MOST_TIMES');
  });

  it('returns MOST_TIMES at 95% (upper boundary)', () => {
    expect(getCheckboxCategory(95, 100)).toBe('MOST_TIMES');
  });

  it('returns ALWAYS at 96% (lower boundary)', () => {
    expect(getCheckboxCategory(96, 100)).toBe('ALWAYS');
  });

  it('returns ALWAYS at 100%', () => {
    expect(getCheckboxCategory(100, 100)).toBe('ALWAYS');
  });

  it('returns NOT_APPLICABLE when totalCount is 0 (division by zero guard)', () => {
    expect(getCheckboxCategory(0, 0)).toBe('NOT_APPLICABLE');
  });

  it('returns NOT_APPLICABLE when totalCount is negative', () => {
    expect(getCheckboxCategory(5, -1)).toBe('NOT_APPLICABLE');
  });

  it('returns NOT_APPLICABLE when populatedCount is null (FLS-blocked)', () => {
    expect(getCheckboxCategory(null, 100)).toBe('NOT_APPLICABLE');
  });

  it('returns NOT_APPLICABLE when populatedCount is undefined', () => {
    expect(getCheckboxCategory(undefined as unknown as null, 100)).toBe('NOT_APPLICABLE');
  });

  it('returns NOT_APPLICABLE when populatedCount is negative', () => {
    expect(getCheckboxCategory(-5, 100)).toBe('NOT_APPLICABLE');
  });

  it('handles very large numbers correctly', () => {
    expect(getCheckboxCategory(999_999, 1_000_000)).toBe('ALWAYS');
    expect(getCheckboxCategory(500_000, 1_000_000)).toBe('SOMETIMES');
    expect(getCheckboxCategory(510_000, 1_000_000)).toBe('MOST_TIMES');
  });

  it('handles edge case: 1 of 1 = 100% = ALWAYS', () => {
    expect(getCheckboxCategory(1, 1)).toBe('ALWAYS');
  });

  it('handles edge case: 1 of 2 = 50% = SOMETIMES', () => {
    expect(getCheckboxCategory(1, 2)).toBe('SOMETIMES');
  });

  it('threshold constants are correct', () => {
    expect(CHECKBOX_THRESHOLDS.SOMETIMES_MIN).toBe(1);
    expect(CHECKBOX_THRESHOLDS.MOST_TIMES_MIN).toBe(51);
    expect(CHECKBOX_THRESHOLDS.ALWAYS_MIN).toBe(96);
  });
});

describe('isAccessible', () => {
  it('returns true for numeric countValue', () => {
    expect(isAccessible({ countValue: 42 })).toBe(true);
  });

  it('returns true for zero countValue', () => {
    expect(isAccessible({ countValue: 0 })).toBe(true);
  });

  it('returns false for null countValue', () => {
    expect(isAccessible({ countValue: null })).toBe(false);
  });

  it('returns false for undefined countValue', () => {
    expect(isAccessible({ countValue: undefined })).toBe(false);
  });

  it('returns false for missing countValue field', () => {
    expect(isAccessible({})).toBe(false);
  });
});

describe('getCountOrNull', () => {
  it('returns the count for numeric values', () => {
    expect(getCountOrNull({ countValue: 42 })).toBe(42);
  });

  it('returns 0 for zero values (not null)', () => {
    expect(getCountOrNull({ countValue: 0 })).toBe(0);
  });

  it('returns null for null values', () => {
    expect(getCountOrNull({ countValue: null })).toBeNull();
  });

  it('returns null for undefined values', () => {
    expect(getCountOrNull({ countValue: undefined })).toBeNull();
  });

  it('returns null for missing field', () => {
    expect(getCountOrNull({})).toBeNull();
  });
});

describe('isPopulated', () => {
  // null/undefined = not populated
  it('returns false for null', () => {
    expect(isPopulated(null)).toBe(false);
  });

  it('returns false for undefined', () => {
    expect(isPopulated(undefined)).toBe(false);
  });

  // string rules
  it('returns false for empty string', () => {
    expect(isPopulated('')).toBe(false);
  });

  it('returns false for whitespace-only string', () => {
    expect(isPopulated('   ')).toBe(false);
  });

  it('returns false for picklist "--None--"', () => {
    expect(isPopulated('--None--')).toBe(false);
  });

  it('returns true for non-empty string', () => {
    expect(isPopulated('List')).toBe(true);
  });

  // boolean rules
  it('returns true for boolean false (it is a real value)', () => {
    expect(isPopulated(false)).toBe(true);
  });

  it('returns true for boolean true', () => {
    expect(isPopulated(true)).toBe(true);
  });

  // number rules
  it('returns true for numeric 0 (it is a real value)', () => {
    expect(isPopulated(0)).toBe(true);
  });

  it('returns true for positive number', () => {
    expect(isPopulated(42)).toBe(true);
  });

  it('returns true for negative number', () => {
    expect(isPopulated(-1)).toBe(true);
  });

  // object/array
  it('returns true for empty object', () => {
    expect(isPopulated({})).toBe(true);
  });

  it('returns true for array', () => {
    expect(isPopulated([1, 2])).toBe(true);
  });
});
