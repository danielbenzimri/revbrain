/**
 * Auth User Reconciliation
 *
 * Creates or maps Supabase Auth users for seed data users.
 * Handles all edge cases: existing users, orphaned records, failures.
 *
 * Note: Must work against both staging (revbrain-stg) and production
 * (revbrain-prd) Supabase projects.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { eq } from 'drizzle-orm';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DrizzleDB = any;
import { users } from '../schema';
import { SEED_USERS } from '@revbrain/seed-data';

export interface AuthReconcileResult {
  email: string;
  role: string;
  status: 'created' | 'mapped_existing' | 'already_reconciled' | 'skipped' | 'auth_failed';
  authId?: string;
  error?: string;
}

/**
 * Create a Supabase admin client for auth operations.
 * Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.
 */
export function createSupabaseAdmin(): SupabaseClient {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error(
      'SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for auth reconciliation.\n' +
        'Set them in .env.stg or pass --skip-auth to skip auth user creation.'
    );
  }

  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/**
 * Reconcile all seed users with Supabase Auth.
 * Creates auth users for active seed users, skips inactive (pending).
 */
export async function reconcileAuthUsers(
  db: DrizzleDB,
  options?: { password?: string; timeout?: number }
): Promise<AuthReconcileResult[]> {
  const supabase = createSupabaseAdmin();
  const password = options?.password || process.env.SEED_PASSWORD || 'RevBrain-Dev-2026!';
  const timeout = options?.timeout || 10000;
  const results: AuthReconcileResult[] = [];

  for (const seedUser of SEED_USERS) {
    try {
      const result = await reconcileOneUser(supabase, db, seedUser, password, timeout);
      results.push(result);
      console.log(
        `  ${seedUser.email}  ${statusIcon(result.status)} ${result.status}${result.error ? ' — ' + result.error : ''}`
      );
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Unknown error';
      results.push({
        email: seedUser.email,
        role: seedUser.role,
        status: 'auth_failed',
        error,
      });
      console.log(`  ${seedUser.email}  ✗ auth_failed — ${error}`);
    }
  }

  return results;
}

/**
 * Reconcile a single seed user with Supabase Auth.
 * Implements the edge case matrix from DATABASE-SEEDER-SPEC.md §7.
 */
async function reconcileOneUser(
  supabase: SupabaseClient,
  db: DrizzleDB,
  seedUser: (typeof SEED_USERS)[number],
  password: string,
  _timeout: number
): Promise<AuthReconcileResult> {
  const base = { email: seedUser.email, role: seedUser.role };

  // Skip pending/inactive users — they shouldn't have auth accounts
  if (!seedUser.isActive) {
    return { ...base, status: 'skipped' };
  }

  // Check if DB user already has a supabaseUserId set
  const [dbUser] = await db
    .select({ supabaseUserId: users.supabaseUserId })
    .from(users)
    .where(eq(users.id, seedUser.id))
    .limit(1);

  if (dbUser?.supabaseUserId) {
    // Verify the auth user still exists
    try {
      const { data } = await supabase.auth.admin.getUserById(dbUser.supabaseUserId);
      if (data.user) {
        return { ...base, status: 'already_reconciled', authId: data.user.id };
      }
    } catch {
      // Auth user doesn't exist — will create below and update the reference
    }
    // Auth user gone — don't clear (NOT NULL constraint), will be overwritten below
  }

  // Check if an auth user already exists with this email
  const { data: listData } = await supabase.auth.admin.listUsers({ perPage: 1000 });
  const existingAuth = listData?.users?.find(
    (u) => u.email?.toLowerCase() === seedUser.email.toLowerCase()
  );

  if (existingAuth) {
    // Map DB user to existing auth user
    await db
      .update(users)
      .set({ supabaseUserId: existingAuth.id })
      .where(eq(users.id, seedUser.id));
    return { ...base, status: 'mapped_existing', authId: existingAuth.id };
  }

  // Create new auth user
  const { data, error } = await supabase.auth.admin.createUser({
    email: seedUser.email,
    password,
    email_confirm: true,
    user_metadata: {
      full_name: seedUser.fullName,
      role: seedUser.role,
      organization_id: seedUser.organizationId,
    },
  });

  if (error) {
    return { ...base, status: 'auth_failed', error: error.message };
  }

  // Update DB user with auth ID
  await db.update(users).set({ supabaseUserId: data.user.id }).where(eq(users.id, seedUser.id));

  return { ...base, status: 'created', authId: data.user.id };
}

/**
 * Delete auth users for cleanup.
 * IMPORTANT: Reads supabaseUserId from DB BEFORE deleting DB records.
 */
export async function cleanupAuthUsers(db: DrizzleDB): Promise<void> {
  const supabase = createSupabaseAdmin();

  // Cache auth IDs before any DB deletions
  const dbUsers = await db
    .select({ id: users.id, email: users.email, supabaseUserId: users.supabaseUserId })
    .from(users)
    .where(eq(users.id, SEED_USERS[0].id)); // Just check if seed users exist

  // Get all seed user auth IDs
  const seedUserIds = SEED_USERS.map((u) => u.id);
  const authMappings = await db
    .select({ supabaseUserId: users.supabaseUserId, email: users.email })
    .from(users);

  // Delete auth users by their supabaseUserId
  for (const user of authMappings as { supabaseUserId: string | null; email: string }[]) {
    if (user.supabaseUserId) {
      try {
        await supabase.auth.admin.deleteUser(user.supabaseUserId);
        console.log(`  Deleted auth user: ${user.email}`);
      } catch {
        // Auth user may already be gone
      }
    }
  }
}

function statusIcon(status: string): string {
  switch (status) {
    case 'created':
      return '✓';
    case 'mapped_existing':
      return '↔';
    case 'already_reconciled':
      return '✓';
    case 'skipped':
      return '⊘';
    case 'auth_failed':
      return '✗';
    default:
      return '?';
  }
}
