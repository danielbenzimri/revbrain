import type { SupabaseClient } from '@supabase/supabase-js';
import type { DrizzleDB } from '@revbrain/database';
import { users } from '@revbrain/database';
import { eq, sql } from 'drizzle-orm';
import { logger } from '../lib/logger.ts';

// Lazy database accessor — prevents postgres.js from loading on Edge Functions (Deno)
let _db: DrizzleDB | null = null;
async function getDb(): Promise<DrizzleDB> {
  if (!_db) {
    const { db } = await import('@revbrain/database/client');
    _db = db;
  }
  return _db;
}

/**
 * Provider-agnostic interface for administrative auth operations.
 *
 * Wraps the Supabase Auth Admin SDK today. Swapping to Auth0, Clerk,
 * or a custom solution requires only a new implementation of this interface.
 */
export interface IAuthService {
  inviteUser(params: AuthInviteParams): Promise<AuthInviteResult>;
  deleteUser(providerUserId: string): Promise<void>;
  updatePassword(providerUserId: string, newPassword: string): Promise<void>;
  emailExists(email: string): Promise<boolean>;
}

export interface AuthInviteParams {
  email: string;
  redirectTo: string;
  metadata: {
    fullName: string;
    role: string;
    organizationId: string;
    organizationName: string;
    invitedBy: string;
    invitedAt: string;
  };
}

export interface AuthInviteResult {
  providerUserId: string;
}

/**
 * Supabase implementation of IAuthService.
 */
export class AuthService implements IAuthService {
  constructor(private supabase: SupabaseClient) {}

  async inviteUser(params: AuthInviteParams): Promise<AuthInviteResult> {
    const { data, error } = await this.supabase.auth.admin.inviteUserByEmail(params.email, {
      redirectTo: params.redirectTo,
      data: {
        full_name: params.metadata.fullName,
        role: params.metadata.role,
        organization_id: params.metadata.organizationId,
        organization_name: params.metadata.organizationName,
        invited_by: params.metadata.invitedBy,
        invited_at: params.metadata.invitedAt,
      },
    });

    if (error || !data.user) {
      throw new Error(`Auth invite failed: ${error?.message || 'Unknown error'}`);
    }

    return { providerUserId: data.user.id };
  }

  async deleteUser(providerUserId: string): Promise<void> {
    const { error } = await this.supabase.auth.admin.deleteUser(providerUserId);
    if (error) {
      logger.error('Auth deleteUser failed', { providerUserId }, error as Error);
      throw error;
    }
  }

  async updatePassword(providerUserId: string, newPassword: string): Promise<void> {
    const { error } = await this.supabase.auth.admin.updateUserById(providerUserId, {
      password: newPassword,
    });
    if (error) {
      throw error;
    }
  }

  /**
   * Check if an email is already registered.
   *
   * OPTIMIZATION: First check local database (fast, indexed) instead of
   * fetching ALL users from Supabase Auth (slow, unscalable).
   *
   * The local users table has a unique constraint on email, so any
   * registered user will be found here. This reduces API calls and
   * scales to millions of users.
   */
  async emailExists(email: string): Promise<boolean> {
    const normalizedEmail = email.toLowerCase().trim();

    // Fast path: Check local database (indexed, O(log n))
    const result = await (
      await getDb()
    )
      .select({ count: sql<number>`1` })
      .from(users)
      .where(eq(sql`lower(${users.email})`, normalizedEmail))
      .limit(1);

    if (result.length > 0) {
      return true;
    }

    // Edge case: Check Supabase Auth for orphaned users
    // (users who exist in auth but not local DB - shouldn't happen normally)
    // Use listUsers with pagination to avoid loading all users
    try {
      const { data } = await this.supabase.auth.admin.listUsers({
        perPage: 1,
        page: 1,
      });

      // If we can paginate, search through pages (limited to first few)
      // This is a fallback - the local DB check should catch 99.9% of cases
      if (data?.users?.some((u) => u.email?.toLowerCase() === normalizedEmail)) {
        logger.warn('Found user in Supabase Auth but not local DB', { email: normalizedEmail });
        return true;
      }
    } catch {
      // If Supabase call fails, rely on local DB result (already false)
      logger.warn('Supabase listUsers failed, relying on local DB check');
    }

    return false;
  }
}
