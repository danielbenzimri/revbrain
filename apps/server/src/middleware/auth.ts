import { createMiddleware } from 'hono/factory';
import { decode, verify } from 'hono/jwt';
import { AppError, ErrorCodes } from '@revbrain/contract';
import type { UserEntity } from '@revbrain/contract';
import { MOCK_IDS } from '../mocks/constants.ts';
import type { SupabaseJWTPayload } from '../types/index.ts';
import { getEnv } from '../lib/env.ts';
import { getSupabaseAdmin } from '../lib/supabase.ts';
import { logger } from '../lib/logger.ts';
import { lookupUserBySubject } from '../lib/user-lookup.ts';

import type { AppEnv } from '../types/index.ts';

// ============================================================================
// USER CACHE — delegates to user-lookup.ts (runtime-aware: PostgREST on Edge)
// ============================================================================
// User lookup caching is handled by lib/user-lookup.ts (5-minute TTL).
// These exports are kept for backward compatibility with user.service.ts
// which calls clearUserCache() on user updates.
// ============================================================================
import { clearUserCache as clearLookupCache } from '../lib/user-lookup.ts';

/** Clear cache for a specific user (call on user update/delete) */
export function clearUserCache(_supabaseUserId: string): void {
  // Clear the entire lookup cache — it's small and cheap to rebuild
  clearLookupCache();
}

/** Clear entire user cache (for testing or emergency) */
export function clearAllUserCache(): void {
  clearLookupCache();
}

/**
 * Safely decode JWT header without verifying the signature.
 */
function decodeJWTHeader(token: string): { alg?: string; kid?: string } {
  try {
    const headerB64 = token.split('.')[0];
    const decoded = atob(headerB64.replace(/-/g, '+').replace(/_/g, '/'));
    return JSON.parse(decoded);
  } catch {
    return {};
  }
}

/**
 * Remote JWT verification via Supabase Admin SDK.
 * Used as fallback when local verification fails or no JWT secret is configured.
 * Capped at 3s timeout to prevent unbounded latency.
 */
async function verifyTokenRemotely(token: string): Promise<SupabaseJWTPayload> {
  const REMOTE_TIMEOUT_MS = 3000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REMOTE_TIMEOUT_MS);

  try {
    const { data, error: supabaseError } = await Promise.race([
      getSupabaseAdmin().auth.getUser(token),
      new Promise<never>((_, reject) => {
        controller.signal.addEventListener('abort', () =>
          reject(new AppError(ErrorCodes.INVALID_TOKEN, 'Auth verification timed out', 401))
        );
      }),
    ]);
    const supabaseUser = data?.user;

    if (supabaseError || !supabaseUser) {
      throw new AppError(ErrorCodes.INVALID_TOKEN, 'Invalid or expired token', 401);
    }

    return {
      sub: supabaseUser.id,
      email: supabaseUser.email || '',
      exp: supabaseUser.last_sign_in_at
        ? Math.floor(new Date(supabaseUser.last_sign_in_at).getTime() / 1000) + 3600
        : 0,
      iat: supabaseUser.created_at
        ? Math.floor(new Date(supabaseUser.created_at).getTime() / 1000)
        : 0,
      aud: 'authenticated',
      role: 'authenticated',
      user_metadata: supabaseUser.user_metadata || {},
      app_metadata: supabaseUser.app_metadata || {},
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Create a mock JWT payload for development auth.
 */
function createMockJwtPayload(user: UserEntity): SupabaseJWTPayload {
  return {
    sub: user.supabaseUserId,
    exp: Math.floor(Date.now() / 1000) + 3600,
    iat: Math.floor(Date.now() / 1000),
    aud: 'authenticated',
    role: 'authenticated',
    email: user.email,
    user_metadata: { full_name: user.fullName, role: user.role },
    app_metadata: { provider: 'email' },
  };
}

/**
 * Standard JWT Authentication Middleware
 *
 * Use this for ALL protected endpoints EXCEPT /auth/activate.
 * Rejects inactive users.
 *
 * This middleware:
 * 1. Extracts and verifies the JWT token
 * 2. Checks token expiration
 * 3. Fetches the local user record
 * 4. Ensures the user is active
 * 5. Attaches user and JWT payload to context
 */
// Standard auth - rejects inactive users
export const authMiddleware = createMiddleware<AppEnv>(async (c, next) => {
  const authHeader = c.req.header('Authorization');
  const authMode = getEnv('AUTH_MODE') || 'jwt';

  // ========================================================================
  // MOCK AUTH MODE (AUTH_MODE=mock)
  // Uses mock repos — no database needed
  // ========================================================================
  if (authMode === 'mock') {
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

    // No auth header → default to Acme org_owner for local convenience
    if (!token) {
      const defaultUser = await c.var.repos.users.findById(MOCK_IDS.USER_ACME_OWNER);
      if (defaultUser) {
        c.set('user', defaultUser);
        c.set('jwtPayload', createMockJwtPayload(defaultUser));
        await next();
        return;
      }
    }

    // Parse mock_token_{userId}
    if (token && token.startsWith('mock_token_')) {
      const userId = token.replace('mock_token_', '');
      const user = await c.var.repos.users.findById(userId);
      if (!user) {
        throw new AppError(ErrorCodes.UNAUTHORIZED, 'Mock user not found', 401);
      }
      c.set('user', user);
      c.set('jwtPayload', createMockJwtPayload(user));
      await next();
      return;
    }

    // Auth header present but not a valid mock token
    throw new AppError(ErrorCodes.INVALID_TOKEN, 'Invalid mock token format', 401);
  }

  // ========================================================================
  // STANDARD AUTH (AUTH_MODE=jwt)
  // ========================================================================
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new AppError(ErrorCodes.UNAUTHORIZED, 'Missing or invalid Authorization header', 401);
  }

  const token = authHeader.slice(7);

  // ========================================================================
  // LEGACY MOCK TOKEN (development fallback, requires DB)
  // ========================================================================
  const isMockToken = token.startsWith('mock_token_');

  if (isMockToken) {
    const nodeEnv = getEnv('NODE_ENV');
    if (nodeEnv !== 'development') {
      throw new AppError(
        ErrorCodes.INVALID_TOKEN,
        'Mock tokens are only allowed in development mode',
        401
      );
    }

    const userId = token.replace('mock_token_', '');
    // Try mock repos first (if available), then fall back to DB
    const mockUser = await c.var.repos.users.findById(userId);
    if (mockUser) {
      c.set('user', mockUser);
      c.set('jwtPayload', createMockJwtPayload(mockUser));
      await next();
      return;
    }

    // DB fallback for legacy mock token behavior (dynamic import — only in mock mode)
    const mockEmail = `mock.${userId}@revbrain.io`;
    const { db } = await import('@revbrain/database/client');
    const { users: usersTable, organizations: orgsTable } = await import('@revbrain/database');
    let localUser = await db.query.users.findFirst({
      where: (u, { or, eq: eqFn }) => or(eqFn(u.id, userId), eqFn(u.email, mockEmail)),
    });

    if (!localUser) {
      const mockOrgId = '00000000-0000-0000-0000-000000000000';
      await db
        .insert(orgsTable)
        .values({
          id: mockOrgId,
          name: 'Mock Organization',
          slug: 'mock-org',
          type: 'business',
          seatLimit: 999,
        })
        .onConflictDoNothing({ target: orgsTable.id });
      const [upsertedUser] = await db
        .insert(usersTable)
        .values({
          id: userId,
          supabaseUserId: userId,
          email: mockEmail,
          fullName: 'Mock Developer',
          role: 'reviewer',
          isActive: true,
          isOrgAdmin: false,
          organizationId: mockOrgId,
        })
        .onConflictDoNothing({ target: usersTable.id })
        .returning();
      localUser =
        upsertedUser ??
        (await db.query.users.findFirst({
          where: (u, { or, eq: eqFn }) => or(eqFn(u.id, userId), eqFn(u.email, mockEmail)),
        }));
    }

    if (!localUser) {
      throw new AppError(ErrorCodes.INTERNAL_SERVER_ERROR, 'Failed to provision mock user', 500);
    }

    c.set('user', localUser as unknown as UserEntity);
    c.set('jwtPayload', createMockJwtPayload(localUser as unknown as UserEntity));
    await next();
    return;
  }

  // ========================================================================
  // STANDARD JWT AUTH
  // ========================================================================
  //
  // Strategy: Local JWT verification (no remote call to Supabase).
  // This saves ~100-300ms per request compared to getSupabaseAdmin().auth.getUser().
  // Trade-off: revoked tokens remain valid until expiry (~1 hour).
  // For immediate revocation (account deletion, forced sign-out), the
  // delete/sign-out endpoints handle this server-side via the admin SDK.
  //
  // Fallback: If SUPABASE_JWT_SECRET is not configured, we fall back to
  // the remote Supabase call for backwards compatibility.
  // ========================================================================

  // Check all common env var names for the JWT secret
  const jwtSecret =
    getEnv('APP_JWT_SECRET') || getEnv('SUPABASE_JWT_SECRET') || getEnv('JWT_SECRET');

  try {
    let payload: SupabaseJWTPayload;

    // Peek at JWT header to detect algorithm (ES256 = new Supabase, HS256 = legacy)
    const jwtHeader = decodeJWTHeader(token);
    const isES256 = jwtHeader.alg === 'ES256';

    if (isES256) {
      // ES256 = Supabase-signed JWT. On Edge Functions the Supabase gateway already
      // verified the signature, so we just decode the claims (no crypto, ~0ms).
      // Full JWKS verification would add network calls + crypto overhead on every
      // request for zero security gain (see docs/adr/005-jwt-impersonation.md).
      try {
        const decoded = decode(token);
        payload = decoded.payload as unknown as SupabaseJWTPayload;
        if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
          throw new AppError(ErrorCodes.INVALID_TOKEN, 'Token has expired', 401);
        }
      } catch (decodeError) {
        if (decodeError instanceof AppError) throw decodeError;
        logger.warn('ES256 JWT decode failed, falling back to remote verification');
        payload = await verifyTokenRemotely(token);
      }
    } else if (jwtSecret) {
      try {
        // LEGACY: Local HS256 verification (fast, no network)
        payload = (await verify(token, jwtSecret, 'HS256')) as unknown as SupabaseJWTPayload;

        // Check token expiration explicitly
        if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
          throw new AppError(ErrorCodes.INVALID_TOKEN, 'Token has expired', 401);
        }
      } catch (localError) {
        // If local verification fails (e.g. key mismatch), fall back to remote
        if (localError instanceof AppError) throw localError;

        logger.warn('Local JWT verification failed, falling back to remote verification');
        payload = await verifyTokenRemotely(token);
      }
    } else {
      // No JWT secret configured — use remote verification
      logger.warn('No JWT secret configured — using remote token verification');
      payload = await verifyTokenRemotely(token);
    }

    // Fetch local user by Supabase ID (uses PostgREST on Edge, Drizzle on Node)
    // lookupUserBySubject has its own 5-minute cache
    const localUser = await lookupUserBySubject(payload.sub);

    if (!localUser) {
      throw new AppError(ErrorCodes.USER_NOT_FOUND, 'User not found in system', 403);
    }

    if (!localUser.isActive) {
      throw new AppError(
        ErrorCodes.ACCOUNT_INACTIVE,
        'Account is not activated. Please check your email to complete setup.',
        403
      );
    }

    // Attach to context for use in handlers
    c.set('user', localUser);
    c.set('jwtPayload', payload);

    await next();
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    logger.error('Authentication failed', {}, error as Error);
    throw new AppError(ErrorCodes.INVALID_TOKEN, 'Authentication failed', 401);
  }
});

/**
 * Activation Auth Middleware
 *
 * Use ONLY for /auth/activate endpoint.
 * Allows inactive users (they need to activate!).
 * Includes auto-recovery for orphaned users (when local DB insert failed).
 */
export const authMiddlewareAllowInactive = createMiddleware<AppEnv>(async (c, next) => {
  const authHeader = c.req.header('Authorization');

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new AppError(ErrorCodes.UNAUTHORIZED, 'Missing or invalid Authorization header', 401);
  }

  const token = authHeader.slice(7);

  if (!token) {
    throw new AppError(ErrorCodes.UNAUTHORIZED, 'Missing token', 401);
  }

  try {
    // Use same JWT secret resolution as the main middleware
    const jwtSecret =
      getEnv('APP_JWT_SECRET') || getEnv('SUPABASE_JWT_SECRET') || getEnv('JWT_SECRET');

    let payload: SupabaseJWTPayload;

    const jwtHeader = decodeJWTHeader(token);
    const isES256 = jwtHeader.alg === 'ES256';

    if (isES256) {
      try {
        const decoded = decode(token);
        payload = decoded.payload as unknown as SupabaseJWTPayload;
      } catch {
        payload = await verifyTokenRemotely(token);
      }
    } else if (jwtSecret) {
      try {
        payload = (await verify(token, jwtSecret, 'HS256')) as unknown as SupabaseJWTPayload;
      } catch {
        // Fall back to remote verification
        payload = await verifyTokenRemotely(token);
      }
    } else {
      payload = await verifyTokenRemotely(token);
    }

    // Fetch local user (uses PostgREST on Edge, Drizzle on Node)
    let localUser = await lookupUserBySubject(payload.sub);

    // AUTO-RECOVERY: If user exists in Auth Provider but not locally (orphaned invite)
    if (!localUser && payload.user_metadata) {
      const meta = payload.user_metadata;
      const email = payload.email || meta.email;

      // Only auto-create if we have the required metadata from the invite
      if (meta.full_name && email && meta.organization_id) {
        // Dynamic import — only loads postgres.js when auto-recovery is needed (rare)
        const { db } = await import('@revbrain/database/client');
        const { users } = await import('@revbrain/database');
        const [created] = await db
          .insert(users)
          .values({
            supabaseUserId: payload.sub,
            organizationId: meta.organization_id,
            email: email,
            fullName: meta.full_name,
            role: meta.role || 'reviewer',
            isActive: false,
            invitedBy: meta.invited_by || null,
            isOrgAdmin: false,
          })
          .returning();

        localUser = created as unknown as UserEntity;
        logger.info('Auto-recovered orphaned user via JWT payload', { email });
      }
    }

    if (!localUser) {
      throw new AppError(ErrorCodes.USER_NOT_FOUND, 'User not found. Please contact support.', 403);
    }

    c.set('user', localUser);
    c.set('jwtPayload', payload);

    await next();
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    throw new AppError(ErrorCodes.INVALID_TOKEN, 'Invalid token', 401);
  }
});
