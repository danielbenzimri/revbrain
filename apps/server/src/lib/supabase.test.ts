/**
 * Supabase Client Tests
 *
 * Verifies that:
 * 1. Production throws when credentials are missing
 * 2. Development returns mock client with warning
 * 3. Valid credentials return real client
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock dependencies before importing
const mockGetEnv = vi.hoisted(() => vi.fn());
const mockIsProduction = vi.hoisted(() => vi.fn());
const mockLoggerWarn = vi.hoisted(() => vi.fn());
const mockLoggerError = vi.hoisted(() => vi.fn());
const mockCreateClient = vi.hoisted(() => vi.fn());

vi.mock('./env.ts', () => ({
  getEnv: mockGetEnv,
}));

vi.mock('./config.ts', () => ({
  isProduction: mockIsProduction,
}));

vi.mock('./logger.ts', () => ({
  logger: {
    warn: mockLoggerWarn,
    error: mockLoggerError,
  },
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: mockCreateClient,
}));

describe('Supabase Client', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset module state between tests
    vi.resetModules();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Production Environment', () => {
    it('should throw error when SUPABASE_URL is missing in production', async () => {
      mockGetEnv.mockImplementation((key: string) => {
        if (key === 'SUPABASE_URL') return undefined;
        if (key === 'SUPABASE_SERVICE_ROLE_KEY') return 'valid-key';
        return undefined;
      });
      mockIsProduction.mockReturnValue(true);

      // Dynamic import to get fresh module state
      const { getSupabaseAdmin } = await import('./supabase.ts');

      expect(() => getSupabaseAdmin()).toThrow('FATAL: Supabase credentials missing in production');
      expect(mockLoggerError).toHaveBeenCalledWith(
        'Supabase credentials missing in production',
        {},
        expect.any(Error)
      );
    });

    it('should throw error when SUPABASE_SERVICE_ROLE_KEY is missing in production', async () => {
      mockGetEnv.mockImplementation((key: string) => {
        if (key === 'SUPABASE_URL') return 'https://test.supabase.co';
        if (key === 'SUPABASE_SERVICE_ROLE_KEY') return undefined;
        return undefined;
      });
      mockIsProduction.mockReturnValue(true);

      const { getSupabaseAdmin } = await import('./supabase.ts');

      expect(() => getSupabaseAdmin()).toThrow('FATAL: Supabase credentials missing in production');
    });

    it('should throw error when key is placeholder in production', async () => {
      mockGetEnv.mockImplementation((key: string) => {
        if (key === 'SUPABASE_URL') return 'https://test.supabase.co';
        if (key === 'SUPABASE_SERVICE_ROLE_KEY') return 'your-service-role-key-here';
        return undefined;
      });
      mockIsProduction.mockReturnValue(true);

      const { getSupabaseAdmin } = await import('./supabase.ts');

      expect(() => getSupabaseAdmin()).toThrow('FATAL: Supabase credentials missing in production');
    });

    it('should return real client when credentials are valid in production', async () => {
      const mockClient = { auth: { admin: {} } };
      mockCreateClient.mockReturnValue(mockClient);
      mockGetEnv.mockImplementation((key: string) => {
        if (key === 'SUPABASE_URL') return 'https://test.supabase.co';
        if (key === 'SUPABASE_SERVICE_ROLE_KEY') return 'real-secret-key';
        return undefined;
      });
      mockIsProduction.mockReturnValue(true);

      const { getSupabaseAdmin } = await import('./supabase.ts');
      const client = getSupabaseAdmin();

      expect(client).toBe(mockClient);
      expect(mockCreateClient).toHaveBeenCalledWith(
        'https://test.supabase.co',
        'real-secret-key',
        expect.any(Object)
      );
      expect(mockLoggerError).not.toHaveBeenCalled();
    });
  });

  describe('Development Environment', () => {
    it('should return mock client when credentials are missing in development', async () => {
      mockGetEnv.mockImplementation(() => undefined);
      mockIsProduction.mockReturnValue(false);

      const { getSupabaseAdmin } = await import('./supabase.ts');
      const client = getSupabaseAdmin();

      expect(client).toBeDefined();
      expect(client.auth).toBeDefined();
      expect(mockLoggerWarn).toHaveBeenCalledWith(expect.stringContaining('MOCK Supabase client'));
      expect(mockCreateClient).not.toHaveBeenCalled();
    });

    it('should return mock client that simulates successful operations', async () => {
      mockGetEnv.mockImplementation(() => undefined);
      mockIsProduction.mockReturnValue(false);

      const { getSupabaseAdmin } = await import('./supabase.ts');
      const client = getSupabaseAdmin();

      // Test mock inviteUserByEmail
      const inviteResult = await client.auth.admin.inviteUserByEmail('test@example.com');
      expect(inviteResult.data.user).toBeDefined();
      expect(inviteResult.data.user!.email).toBe('test@example.com');
      expect(inviteResult.error).toBeNull();

      // Test mock deleteUser
      const deleteResult = await client.auth.admin.deleteUser('user-id');
      expect(deleteResult.error).toBeNull();
    });

    it('should return real client when credentials are valid in development', async () => {
      const mockClient = { auth: { admin: {} } };
      mockCreateClient.mockReturnValue(mockClient);
      mockGetEnv.mockImplementation((key: string) => {
        if (key === 'SUPABASE_URL') return 'https://test.supabase.co';
        if (key === 'SUPABASE_SERVICE_ROLE_KEY') return 'real-secret-key';
        return undefined;
      });
      mockIsProduction.mockReturnValue(false);

      const { getSupabaseAdmin } = await import('./supabase.ts');
      const client = getSupabaseAdmin();

      expect(client).toBe(mockClient);
      expect(mockLoggerWarn).not.toHaveBeenCalled();
    });
  });
});
