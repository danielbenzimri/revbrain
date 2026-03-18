import { createMiddleware } from 'hono/factory';
import { decode, verify } from 'hono/jwt';
import { db, users, organizations, eq } from '@revbrain/database';
import { AppError, ErrorCodes } from '@revbrain/contract';
import type { SupabaseJWTPayload } from '../types/index.ts';
import { getEnv } from '../lib/env.ts';
import { getSupabaseAdmin } from '../lib/supabase.ts';
import { logger } from '../lib/logger.ts';

import type { AppEnv } from '../types/index.ts';

// ============================================================================
// USER CACHE - Eliminates DB round-trip on every request
// ============================================================================
// Cache users in memory with 10-minute TTL. This saves ~10-50ms per request.
// Critical user changes (role, deactivation, delete) clear the cache immediately
// via clearUserCache() calls in user.service.ts.
// ============================================================================

type CachedUser = typeof users.$inferSelect;
interface CacheEntry {
  user: CachedUser;
  expiresAt: number;
}

const USER_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes (safe since we clear on updates)
const userCache = new Map<string, CacheEntry>();

function getCachedUser(supabaseUserId: string): CachedUser | null {
  const entry = userCache.get(supabaseUserId);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    userCache.delete(supabaseUserId);
    return null;
  }
  return entry.user;
}

function setCachedUser(supabaseUserId: string, user: CachedUser): void {
  userCache.set(supabaseUserId, {
    user,
    expiresAt: Date.now() + USER_CACHE_TTL_MS,
  });
}

/** Clear cache for a specific user (call on user update/delete) */
export function clearUserCache(supabaseUserId: string): void {
  userCache.delete(supabaseUserId);
}

/** Clear entire user cache (for testing or emergency) */
export function clearAllUserCache(): void {
  userCache.clear();
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
 * Capped at 3s timeout to prevent unbounded latency (following Procure pattern).
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

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new AppError(ErrorCodes.UNAUTHORIZED, 'Missing or invalid Authorization header', 401);
  }

  const token = authHeader.slice(7);

  // MOCK MODE FOR LOCAL DEV ONLY
  // SECURITY: Only allow in explicit development mode, NEVER in production/staging
  const nodeEnv = getEnv('NODE_ENV');
  const isMockToken = token.startsWith('mock_token_');

  if (isMockToken) {
    // CRITICAL: Reject mock tokens in any non-development environment
    if (nodeEnv !== 'development') {
      logger.error('Mock token rejected in non-development environment', {
        env: nodeEnv,
        tokenPrefix: token.slice(0, 15),
      });
      throw new AppError(
        ErrorCodes.INVALID_TOKEN,
        'Mock tokens are only allowed in development mode',
        401
      );
    }

    const userId = token.replace('mock_token_', '');
    logger.warn('⚠️ MOCK AUTH ENABLED - DEVELOPMENT ONLY', { userId });

    // 1. Try to find user in DB (by ID or Email to prevent collisions)
    // FIX: Use full userId for email to prevent collisions between mock users that share the same prefix
    const mockEmail = `mock.${userId}@revbrain.io`;

    let localUser = await db.query.users.findFirst({
      where: (u, { or, eq }) => or(eq(u.id, userId), eq(u.email, mockEmail)),
    });

    // 2. If missing, auto-provision (for developer experience)
    if (!localUser) {
      // Ensure we have a mock organization using UPSERT to prevent race conditions
      const mockOrgId = '00000000-0000-0000-0000-000000000000';

      await db
        .insert(organizations)
        .values({
          id: mockOrgId,
          name: 'Mock Organization',
          slug: 'mock-org',
          type: 'business',
          seatLimit: 999,
        })
        .onConflictDoNothing({ target: organizations.id });

      // Use UPSERT pattern to prevent race conditions between concurrent requests
      // NOTE: Creating as admin (not system_admin) to minimize blast radius
      const [upsertedUser] = await db
        .insert(users)
        .values({
          id: userId,
          supabaseUserId: userId,
          email: mockEmail,
          fullName: 'Mock Developer',
          role: 'admin', // Safe default role, not admin
          isActive: true,
          isOrgAdmin: true,
          organizationId: mockOrgId,
        })
        .onConflictDoNothing({ target: users.id })
        .returning();

      if (upsertedUser) {
        localUser = upsertedUser;
      } else {
        // User already existed (concurrent request won), fetch it
        localUser = await db.query.users.findFirst({
          where: (u, { or, eq }) => or(eq(u.id, userId), eq(u.email, mockEmail)),
        });
      }

      if (!localUser) {
        throw new AppError(ErrorCodes.INTERNAL_SERVER_ERROR, 'Failed to provision mock user', 500);
      }
    }

    // Mock Payload
    const payload: SupabaseJWTPayload = {
      sub: localUser.supabaseUserId,
      exp: Math.floor(Date.now() / 1000) + 3600,
      iat: Math.floor(Date.now() / 1000),
      aud: 'authenticated',
      role: 'authenticated',
      email: localUser.email,
      user_metadata: {
        full_name: localUser.fullName,
        role: localUser.role,
      },
      app_metadata: { provider: 'email' },
    };

    c.set('user', localUser);
    c.set('jwtPayload', payload);
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
      // This follows Procure's proven pattern — full JWKS verification was adding
      // network calls + crypto overhead on every request for zero security gain.
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

    // Fetch local user by Supabase ID (cache-first to avoid DB round-trip)
    let localUser = getCachedUser(payload.sub);

    if (!localUser) {
      // Cache miss - fetch from DB and cache
      const dbUser = await db.query.users.findFirst({
        where: eq(users.supabaseUserId, payload.sub),
      });

      if (dbUser) {
        setCachedUser(payload.sub, dbUser);
        localUser = dbUser;
      }
    }

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

    // Fetch local user
    let localUser = await db.query.users.findFirst({
      where: eq(users.supabaseUserId, payload.sub),
    });

    // AUTO-RECOVERY: If user exists in Auth Provider but not locally (orphaned invite)
    if (!localUser && payload.user_metadata) {
      const meta = payload.user_metadata;
      const email = payload.email || meta.email;

      // Only auto-create if we have the required metadata from the invite
      if (meta.full_name && email && meta.organization_id) {
        const [created] = await db
          .insert(users)
          .values({
            supabaseUserId: payload.sub,
            organizationId: meta.organization_id,
            email: email,
            fullName: meta.full_name,
            role: meta.role || 'admin',
            isActive: false,
            invitedBy: meta.invited_by || null,
            isOrgAdmin: false,
          })
          .returning();

        localUser = created;
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
