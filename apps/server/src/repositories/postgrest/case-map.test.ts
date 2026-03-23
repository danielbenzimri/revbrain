import { describe, it, expect } from 'vitest';
import { toCamelCase, toSnakeCase } from './case-map.ts';

describe('case-map', () => {
  describe('toCamelCase', () => {
    it('converts snake_case keys to camelCase', () => {
      const input = {
        full_name: 'John Doe',
        is_active: true,
        organization_id: 'org-1',
      };
      const result = toCamelCase<{ fullName: string; isActive: boolean; organizationId: string }>(
        input
      );
      expect(result.fullName).toBe('John Doe');
      expect(result.isActive).toBe(true);
      expect(result.organizationId).toBe('org-1');
    });

    it('converts timestamp strings to Date objects for _at fields', () => {
      const input = {
        created_at: '2026-01-01T00:00:00Z',
        last_login_at: '2026-03-15T10:30:00Z',
        name: 'not a date',
      };
      const result = toCamelCase<{ createdAt: Date; lastLoginAt: Date; name: string }>(input);
      expect(result.createdAt).toBeInstanceOf(Date);
      expect(result.lastLoginAt).toBeInstanceOf(Date);
      expect(result.name).toBe('not a date');
    });

    it('converts _date fields to Date objects', () => {
      const input = { start_date: '2026-06-01T00:00:00Z' };
      const result = toCamelCase<{ startDate: Date }>(input);
      expect(result.startDate).toBeInstanceOf(Date);
    });

    it('handles null values', () => {
      const input = { avatar_url: null, phone_number: null };
      const result = toCamelCase<{ avatarUrl: null; phoneNumber: null }>(input);
      expect(result.avatarUrl).toBeNull();
      expect(result.phoneNumber).toBeNull();
    });

    it('handles already camelCase keys (no underscore)', () => {
      const input = { id: '123', email: 'test@example.com' };
      const result = toCamelCase<{ id: string; email: string }>(input);
      expect(result.id).toBe('123');
      expect(result.email).toBe('test@example.com');
    });

    it('preserves JSON/object values', () => {
      const input = {
        metadata: { key: 'value' },
        preferences: { theme: 'dark' },
      };
      const result = toCamelCase<{ metadata: object; preferences: object }>(input);
      expect(result.metadata).toEqual({ key: 'value' });
      expect(result.preferences).toEqual({ theme: 'dark' });
    });
  });

  describe('toSnakeCase', () => {
    it('converts camelCase keys to snake_case', () => {
      const input = {
        fullName: 'John Doe',
        isActive: true,
        organizationId: 'org-1',
      };
      const result = toSnakeCase(input);
      expect(result.full_name).toBe('John Doe');
      expect(result.is_active).toBe(true);
      expect(result.organization_id).toBe('org-1');
    });

    it('handles already snake_case keys (no uppercase)', () => {
      const input = { id: '123', email: 'test@example.com' };
      const result = toSnakeCase(input);
      expect(result.id).toBe('123');
      expect(result.email).toBe('test@example.com');
    });

    it('preserves null/undefined values', () => {
      const input = { avatarUrl: null, phoneNumber: undefined };
      const result = toSnakeCase(input);
      expect(result.avatar_url).toBeNull();
      expect(result.phone_number).toBeUndefined();
    });
  });
});
