import { describe, it, expect } from 'vitest';
import {
  applyPagination,
  applySorting,
  generateId,
  validateFilters,
  applyFilters,
} from './helpers.ts';

describe('applyPagination', () => {
  const items = [1, 2, 3, 4, 5];

  it('returns all items with no options', () => {
    expect(applyPagination(items)).toEqual([1, 2, 3, 4, 5]);
  });

  it('applies limit', () => {
    expect(applyPagination(items, { limit: 2 })).toEqual([1, 2]);
  });

  it('applies offset', () => {
    expect(applyPagination(items, { offset: 2 })).toEqual([3, 4, 5]);
  });

  it('applies limit + offset', () => {
    expect(applyPagination(items, { limit: 2, offset: 1 })).toEqual([2, 3]);
  });

  it('handles offset beyond array length', () => {
    expect(applyPagination(items, { offset: 10 })).toEqual([]);
  });

  it('does not mutate original array', () => {
    applyPagination(items, { limit: 1 });
    expect(items.length).toBe(5);
  });
});

describe('applySorting', () => {
  const items = [
    { name: 'b', val: 2 },
    { name: 'a', val: 1 },
    { name: 'c', val: 3 },
  ];

  it('sorts ascending', () => {
    const sorted = applySorting(items, 'name', 'asc');
    expect(sorted.map((i) => i.name)).toEqual(['a', 'b', 'c']);
  });

  it('sorts descending by default', () => {
    const sorted = applySorting(items, 'val');
    expect(sorted.map((i) => i.val)).toEqual([3, 2, 1]);
  });

  it('does not mutate original array', () => {
    applySorting(items, 'name', 'asc');
    expect(items[0].name).toBe('b');
  });
});

describe('generateId', () => {
  it('returns a valid UUID', () => {
    const id = generateId();
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });

  it('returns unique values', () => {
    const ids = new Set(Array.from({ length: 10 }, () => generateId()));
    expect(ids.size).toBe(10);
  });
});

describe('validateFilters', () => {
  const allowed = ['status', 'role'] as const;

  it('accepts allowed filters', () => {
    expect(() => validateFilters({ status: 'active' }, allowed, 'Test')).not.toThrow();
  });

  it('throws for unsupported filter', () => {
    expect(() => validateFilters({ unknown: 'value' }, allowed, 'Test')).toThrow(
      '[MOCK Test] Unsupported filter: "unknown"'
    );
  });

  it('accepts empty filter object', () => {
    expect(() => validateFilters({}, allowed, 'Test')).not.toThrow();
  });
});

describe('applyFilters', () => {
  const items = [
    { status: 'active', role: 'admin' },
    { status: 'inactive', role: 'user' },
    { status: 'active', role: 'user' },
  ];

  it('returns all items with no filter', () => {
    expect(applyFilters(items)).toEqual(items);
  });

  it('filters by single field', () => {
    expect(applyFilters(items, { status: 'active' })).toHaveLength(2);
  });

  it('filters by multiple fields', () => {
    expect(applyFilters(items, { status: 'active', role: 'user' })).toHaveLength(1);
  });

  it('returns empty for no matches', () => {
    expect(applyFilters(items, { status: 'deleted' })).toHaveLength(0);
  });
});
