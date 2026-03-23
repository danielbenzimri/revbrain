/**
 * Unit tests for AuthService
 *
 * Tests the authentication operations: invite, delete, password update, email check.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AuthService } from './auth.service.ts';
import type { SupabaseClient } from '@supabase/supabase-js';

// Mock @revbrain/database
const mockSelect = vi.hoisted(() => vi.fn());
const mockFrom = vi.hoisted(() => vi.fn());
const mockWhere = vi.hoisted(() => vi.fn());
const mockLimit = vi.hoisted(() => vi.fn());

vi.mock('@revbrain/database/client', () => ({
  db: {
    select: mockSelect,
  },
}));

vi.mock('@revbrain/database', () => ({
  users: { email: 'email' },
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((a, b) => ({ a, b })),
  sql: vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => ({
    strings,
    values,
  })),
}));

// Mock logger
vi.mock('../lib/logger.ts', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

describe('AuthService', () => {
  let authService: AuthService;
  let mockSupabase: SupabaseClient;

  beforeEach(() => {
    vi.clearAllMocks();

    // Setup mock chain
    mockLimit.mockResolvedValue([]);
    mockWhere.mockReturnValue({ limit: mockLimit });
    mockFrom.mockReturnValue({ where: mockWhere });
    mockSelect.mockReturnValue({ from: mockFrom });

    // Create mock Supabase client
    mockSupabase = {
      auth: {
        admin: {
          inviteUserByEmail: vi.fn(),
          deleteUser: vi.fn(),
          updateUserById: vi.fn(),
          listUsers: vi.fn(),
        },
      },
    } as unknown as SupabaseClient;

    authService = new AuthService(mockSupabase);
  });

  describe('inviteUser', () => {
    it('should successfully invite a user', async () => {
      const mockUser = { id: 'provider-user-id' };
      (mockSupabase.auth.admin.inviteUserByEmail as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: { user: mockUser },
        error: null,
      });

      const result = await authService.inviteUser({
        email: 'test@example.com',
        redirectTo: 'http://localhost:5173/set-password',
        metadata: {
          fullName: 'Test User',
          role: 'admin',
          organizationId: 'org-123',
          organizationName: 'Test Org',
          invitedBy: 'admin-123',
          invitedAt: '2026-02-15T00:00:00Z',
        },
      });

      expect(result.providerUserId).toBe('provider-user-id');
      expect(mockSupabase.auth.admin.inviteUserByEmail).toHaveBeenCalledWith('test@example.com', {
        redirectTo: 'http://localhost:5173/set-password',
        data: {
          full_name: 'Test User',
          role: 'admin',
          organization_id: 'org-123',
          organization_name: 'Test Org',
          invited_by: 'admin-123',
          invited_at: '2026-02-15T00:00:00Z',
        },
      });
    });

    it('should throw error when invite fails with error message', async () => {
      (mockSupabase.auth.admin.inviteUserByEmail as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: { user: null },
        error: { message: 'Email already in use' },
      });

      await expect(
        authService.inviteUser({
          email: 'existing@example.com',
          redirectTo: 'http://localhost:5173/set-password',
          metadata: {
            fullName: 'Test User',
            role: 'admin',
            organizationId: 'org-123',
            organizationName: 'Test Org',
            invitedBy: 'admin-123',
            invitedAt: '2026-02-15T00:00:00Z',
          },
        })
      ).rejects.toThrow('Auth invite failed: Email already in use');
    });

    it('should throw error when invite returns no user', async () => {
      (mockSupabase.auth.admin.inviteUserByEmail as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: { user: null },
        error: null,
      });

      await expect(
        authService.inviteUser({
          email: 'test@example.com',
          redirectTo: 'http://localhost:5173/set-password',
          metadata: {
            fullName: 'Test User',
            role: 'admin',
            organizationId: 'org-123',
            organizationName: 'Test Org',
            invitedBy: 'admin-123',
            invitedAt: '2026-02-15T00:00:00Z',
          },
        })
      ).rejects.toThrow('Auth invite failed: Unknown error');
    });
  });

  describe('deleteUser', () => {
    it('should successfully delete a user', async () => {
      (mockSupabase.auth.admin.deleteUser as ReturnType<typeof vi.fn>).mockResolvedValue({
        error: null,
      });

      await expect(authService.deleteUser('provider-user-id')).resolves.toBeUndefined();
      expect(mockSupabase.auth.admin.deleteUser).toHaveBeenCalledWith('provider-user-id');
    });

    it('should throw error when delete fails', async () => {
      const error = new Error('User not found');
      (mockSupabase.auth.admin.deleteUser as ReturnType<typeof vi.fn>).mockResolvedValue({
        error,
      });

      await expect(authService.deleteUser('invalid-user-id')).rejects.toThrow('User not found');
    });
  });

  describe('updatePassword', () => {
    it('should successfully update password', async () => {
      (mockSupabase.auth.admin.updateUserById as ReturnType<typeof vi.fn>).mockResolvedValue({
        error: null,
      });

      await expect(
        authService.updatePassword('provider-user-id', 'NewPassword123!')
      ).resolves.toBeUndefined();
      expect(mockSupabase.auth.admin.updateUserById).toHaveBeenCalledWith('provider-user-id', {
        password: 'NewPassword123!',
      });
    });

    it('should throw error when password update fails', async () => {
      const error = new Error('Password too weak');
      (mockSupabase.auth.admin.updateUserById as ReturnType<typeof vi.fn>).mockResolvedValue({
        error,
      });

      await expect(authService.updatePassword('provider-user-id', 'weak')).rejects.toThrow(
        'Password too weak'
      );
    });
  });

  describe('emailExists', () => {
    it('should return true when email exists in local database', async () => {
      mockLimit.mockResolvedValue([{ count: 1 }]);

      const result = await authService.emailExists('existing@example.com');

      expect(result).toBe(true);
      expect(mockSupabase.auth.admin.listUsers).not.toHaveBeenCalled();
    });

    it('should return false when email does not exist anywhere', async () => {
      mockLimit.mockResolvedValue([]);
      (mockSupabase.auth.admin.listUsers as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: { users: [] },
      });

      const result = await authService.emailExists('new@example.com');

      expect(result).toBe(false);
    });

    it('should normalize email to lowercase before checking', async () => {
      mockLimit.mockResolvedValue([{ count: 1 }]);

      const result = await authService.emailExists('TEST@EXAMPLE.COM');

      expect(result).toBe(true);
    });

    it('should check Supabase Auth as fallback when not in local DB', async () => {
      mockLimit.mockResolvedValue([]);
      (mockSupabase.auth.admin.listUsers as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: { users: [{ email: 'orphan@example.com' }] },
      });

      const result = await authService.emailExists('orphan@example.com');

      expect(result).toBe(true);
      expect(mockSupabase.auth.admin.listUsers).toHaveBeenCalled();
    });

    it('should return false if Supabase call fails', async () => {
      mockLimit.mockResolvedValue([]);
      (mockSupabase.auth.admin.listUsers as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('Network error')
      );

      const result = await authService.emailExists('test@example.com');

      expect(result).toBe(false);
    });
  });
});
