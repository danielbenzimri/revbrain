/**
 * Runtime-Aware User Lookup
 *
 * Used by auth middleware to find users by Supabase ID or email.
 * On Edge Functions: uses PostgREST (Supabase JS client) — instant init.
 * On Node.js: uses Drizzle ORM (postgres.js) — type-safe, already connected.
 *
 * This solves the cold start bottleneck: auth middleware imports @revbrain/database
 * at module level, triggering postgres.js init (3-5s on Deno). By using PostgREST
 * on Edge, we bypass postgres.js entirely.
 */
import type { UserEntity } from '@revbrain/contract';
import { getEnv } from './env.ts';
import { toCamelCase } from '../repositories/postgrest/case-map.ts';

// Cache to avoid lookups on every request
const userCache = new Map<string, { user: UserEntity; expiresAt: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/** Check if running in Deno (Supabase Edge Functions) */
function isEdge(): boolean {
  // @ts-expect-error — Deno global may not exist
  return typeof Deno !== 'undefined';
}

/** Check if PostgREST should be used for user lookups */
function shouldUsePostgREST(): boolean {
  if (!isEdge()) return false;
  const url = getEnv('SUPABASE_URL');
  const key = getEnv('SUPABASE_SERVICE_ROLE_KEY');
  return !!(url && key && key !== 'your-service-role-key-here');
}

/**
 * Look up a user by Supabase Auth ID.
 * Uses PostgREST on Edge, Drizzle on Node.js.
 */
export async function lookupUserBySubject(sub: string): Promise<UserEntity | null> {
  // Check cache first
  const cached = userCache.get(`sub:${sub}`);
  if (cached && cached.expiresAt > Date.now()) return cached.user;

  let user: UserEntity | null = null;

  if (shouldUsePostgREST()) {
    user = await postgrestLookup('supabase_user_id', sub);
  } else {
    user = await drizzleLookup('supabaseUserId', sub);
  }

  if (user) {
    userCache.set(`sub:${sub}`, { user, expiresAt: Date.now() + CACHE_TTL_MS });
  }

  return user;
}

/**
 * Look up a user by email.
 */
export async function lookupUserByEmail(email: string): Promise<UserEntity | null> {
  const normalizedEmail = email.toLowerCase();
  const cached = userCache.get(`email:${normalizedEmail}`);
  if (cached && cached.expiresAt > Date.now()) return cached.user;

  let user: UserEntity | null = null;

  if (shouldUsePostgREST()) {
    user = await postgrestLookup('email', normalizedEmail);
  } else {
    user = await drizzleLookup('email', normalizedEmail);
  }

  if (user) {
    userCache.set(`email:${normalizedEmail}`, { user, expiresAt: Date.now() + CACHE_TTL_MS });
  }

  return user;
}

/**
 * Look up a user with their organization data.
 */
export async function lookupUserWithOrg(
  sub: string
): Promise<(UserEntity & { organizationName?: string }) | null> {
  const user = await lookupUserBySubject(sub);
  if (!user) return null;

  // Fetch org name for the user
  if (shouldUsePostgREST()) {
    const { getSupabaseAdmin } = await import('./supabase.ts');
    const supabase = getSupabaseAdmin();
    const { data } = await supabase
      .from('organizations')
      .select('name')
      .eq('id', user.organizationId)
      .maybeSingle();
    return { ...user, organizationName: data?.name ?? undefined };
  } else {
    const _dbMod = await import('@revbrain/database/client'); await _dbMod.initDB(); const db = _dbMod.db;
    const { organizations } = await import('@revbrain/database');
    const { eq } = await import('drizzle-orm');
    const result = await db.query.organizations.findFirst({
      where: eq(organizations.id, user.organizationId),
    });
    return { ...user, organizationName: result?.name ?? undefined };
  }
}

/** Clear the user cache (useful for testing) */
export function clearUserCache(): void {
  userCache.clear();
}

// ============================================================================
// INTERNAL — PostgREST lookup (Edge)
// ============================================================================

async function postgrestLookup(column: string, value: string): Promise<UserEntity | null> {
  const { getSupabaseAdmin } = await import('./supabase.ts');
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq(column, value)
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;
  return toCamelCase<UserEntity>(data);
}

// ============================================================================
// INTERNAL — Drizzle lookup (Node.js)
// ============================================================================

async function drizzleLookup(field: string, value: string): Promise<UserEntity | null> {
  // Dynamic import — only loads postgres.js when actually needed on Node.js
  const _dbMod = await import('@revbrain/database/client'); await _dbMod.initDB(); const db = _dbMod.db;
  const { users } = await import('@revbrain/database');
  const { eq } = await import('drizzle-orm');

  const column = field === 'supabaseUserId' ? users.supabaseUserId : users.email;

  const result = await db.query.users.findFirst({
    where: eq(column, value),
  });

  if (!result) return null;

  return {
    id: result.id,
    supabaseUserId: result.supabaseUserId,
    organizationId: result.organizationId,
    email: result.email,
    fullName: result.fullName,
    role: result.role,
    isOrgAdmin: result.isOrgAdmin,
    isActive: result.isActive,
    invitedBy: result.invitedBy,
    phoneNumber: result.phoneNumber,
    jobTitle: result.jobTitle,
    address: result.address,
    age: result.age,
    bio: result.bio,
    avatarUrl: result.avatarUrl,
    mobileNumber: result.mobileNumber,
    preferences: result.preferences as Record<string, unknown> | null,
    metadata: result.metadata as Record<string, unknown> | null,
    createdAt: result.createdAt,
    activatedAt: result.activatedAt,
    lastLoginAt: result.lastLoginAt,
  };
}
