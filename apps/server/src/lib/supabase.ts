import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { getEnv } from './env.ts';
import { logger } from './logger.ts';
import { isProduction } from './config.ts';

// Singleton instance to avoid overhead per request
let supabaseAdmin: SupabaseClient | null = null;

/**
 * Provides a Supabase Admin client for server-side operations.
 */
export function getSupabaseAdmin(): SupabaseClient {
  if (supabaseAdmin) return supabaseAdmin;

  const url = getEnv('SUPABASE_URL');
  const key = getEnv('SUPABASE_SERVICE_ROLE_KEY');

  // Check for missing or placeholder credentials
  const isMissingCredentials = !url || !key || key === 'your-service-role-key-here';

  if (isMissingCredentials) {
    // CRITICAL: In production, fail fast - never silently mock auth operations
    if (isProduction()) {
      const error = new Error(
        'FATAL: Supabase credentials missing in production. ' +
          'Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables.'
      );
      logger.error('Supabase credentials missing in production', {}, error);
      throw error;
    }

    // Development only: Return mock client with warning
    logger.warn(
      '⚠️ MOCK Supabase client active - auth operations will NOT persist. ' +
        'Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to connect to real Supabase.'
    );
    return {
      auth: {
        admin: {
          inviteUserByEmail: async (email: string) => ({
            data: { user: { id: crypto.randomUUID(), email } },
            error: null,
          }),
          deleteUser: async () => ({ error: null }),
          listUsers: async () => ({ data: { users: [] }, error: null }),
          updateUserById: async () => ({ data: { user: null }, error: null }),
        },
        getUser: async () => ({ data: { user: null }, error: null }),
      },
    } as unknown as SupabaseClient;
  }

  supabaseAdmin = createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  return supabaseAdmin;
}
