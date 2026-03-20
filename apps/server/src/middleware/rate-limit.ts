import { rateLimiter } from 'hono-rate-limiter';
import type { Context } from 'hono';
import type { AppEnv } from '../types/index.ts';
import { getAlertingService } from '../alerting/index.ts';

/**
 * Rate Limiting Configuration
 *
 * Strategies:
 * 1. IP-based: For unauthenticated endpoints (auth, public APIs)
 * 2. User-based: For authenticated endpoints (uses user.id)
 * 3. Tenant-based: For organization-level limits (uses user.organizationId)
 *
 * Response Headers (IETF draft-6):
 * - RateLimit-Limit: Maximum requests allowed in window
 * - RateLimit-Remaining: Requests remaining in current window
 * - RateLimit-Reset: Seconds until the window resets
 * - RateLimit-Policy: Policy string (e.g., "10;w=60")
 *
 * For MVP: Uses MemoryStore (sufficient for brute-force prevention)
 * For Scale: Switch to RedisStore (Upstash) later without changing API code
 *
 * Note: In-memory rate limiting resets when Edge Function sleeps,
 * but provides adequate protection for simple attacks.
 */

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Get client IP from request headers (Cloudflare, proxy, or direct)
 */
function getClientIpFromHeaders(c: Context): string {
  return (
    c.req.header('CF-Connecting-IP') ||
    c.req.header('X-Forwarded-For')?.split(',')[0].trim() ||
    c.req.header('X-Real-IP') ||
    'unknown'
  );
}

/**
 * Get user ID from context (requires auth middleware)
 */
function getUserId(c: Context<AppEnv>): string | undefined {
  return c.get('user')?.id;
}

/**
 * Get organization/tenant ID from context (requires auth middleware)
 */
function getTenantId(c: Context<AppEnv>): string | undefined {
  return c.get('user')?.organizationId;
}

// =============================================================================
// KEY GENERATORS
// =============================================================================

/**
 * IP-based key generator (for unauthenticated endpoints)
 */
const ipKeyGenerator = (c: Context): string => {
  return `ip:${getClientIpFromHeaders(c)}`;
};

/**
 * User-based key generator (for authenticated endpoints)
 * Falls back to IP if user is not authenticated
 */
const userKeyGenerator = (c: Context<AppEnv>): string => {
  const userId = getUserId(c);
  if (userId) return `user:${userId}`;
  return `ip:${getClientIpFromHeaders(c)}`;
};

/**
 * Tenant-based key generator (for organization-level rate limiting)
 * Falls back to user, then IP if organization is not available
 */
const tenantKeyGenerator = (c: Context<AppEnv>): string => {
  const tenantId = getTenantId(c);
  if (tenantId) return `tenant:${tenantId}`;

  const userId = getUserId(c);
  if (userId) return `user:${userId}`;

  return `ip:${getClientIpFromHeaders(c)}`;
};

// =============================================================================
// RATE LIMITERS
// =============================================================================

/**
 * Strict rate limiter for authentication endpoints
 * 10 requests per minute per IP to prevent brute-force attacks
 *
 * Key: IP address (unauthenticated)
 */
export const authLimiter = rateLimiter({
  windowMs: 60 * 1000, // 1 minute
  limit: 10,
  standardHeaders: 'draft-6',
  keyGenerator: ipKeyGenerator,
  handler: (c) => {
    const ip = getClientIpFromHeaders(c);

    // Alert on potential brute-force attack (non-blocking)
    getAlertingService()
      .warning('Auth Rate Limit Exceeded', `Possible brute-force attack from IP: ${ip}`, {
        metadata: {
          ip,
          path: c.req.path,
          userAgent: c.req.header('User-Agent'),
        },
      })
      .catch(() => {}); // Fire and forget

    return c.json(
      {
        success: false,
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: 'Too many login attempts. Please try again later.',
        },
      },
      429
    );
  },
});

/**
 * Lenient rate limiter for general API endpoints
 * 1000 requests per minute per user (or IP if not authenticated)
 *
 * Key: User ID or IP address
 */
export const apiLimiter = rateLimiter({
  windowMs: 60 * 1000, // 1 minute
  limit: 1000,
  standardHeaders: 'draft-6',
  keyGenerator: userKeyGenerator,
  handler: (c) => {
    return c.json(
      {
        success: false,
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: 'Too many requests. Please slow down.',
        },
      },
      429
    );
  },
});

/**
 * Rate limiter for invite endpoints
 * 30 invites per 15 minutes per user
 *
 * Key: User ID (authenticated required)
 */
export const inviteLimiter = rateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 30,
  standardHeaders: 'draft-6',
  keyGenerator: userKeyGenerator,
  handler: (c) => {
    return c.json(
      {
        success: false,
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: 'Too many invites. Please try again later.',
        },
      },
      429
    );
  },
});

/**
 * Rate limiter for list/GET endpoints to prevent data enumeration
 * 100 requests per minute per user
 *
 * Key: User ID (authenticated required)
 */
export const listLimiter = rateLimiter({
  windowMs: 60 * 1000, // 1 minute
  limit: 100,
  standardHeaders: 'draft-6',
  keyGenerator: userKeyGenerator,
  handler: (c) => {
    return c.json(
      {
        success: false,
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: 'Too many list requests. Please slow down.',
        },
      },
      429
    );
  },
});

/**
 * Strict rate limiter for admin operations
 * Production: 10 operations per hour per user
 * Local/dev: 10,000 per hour (effectively unlimited for testing)
 *
 * Key: User ID (admin authenticated required)
 */
const isLocalEnv = process.env.APP_ENV === 'local' || process.env.NODE_ENV === 'development';
export const adminLimiter = rateLimiter({
  windowMs: 60 * 60 * 1000, // 1 hour
  limit: isLocalEnv ? 10_000 : 10,
  standardHeaders: 'draft-6',
  keyGenerator: userKeyGenerator,
  handler: (c: Context<AppEnv>) => {
    const userId = getUserId(c);

    // Alert on admin rate limit (unusual activity)
    getAlertingService()
      .warning('Admin Rate Limit Exceeded', `Admin user exceeded operation limit`, {
        userId,
        metadata: {
          path: c.req.path,
        },
      })
      .catch(() => {}); // Fire and forget

    return c.json(
      {
        success: false,
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: 'Too many admin operations. Please try again later.',
        },
      },
      429
    );
  },
});

// =============================================================================
// TENANT-BASED RATE LIMITERS
// =============================================================================

/**
 * Organization-level API rate limiter
 * 5000 requests per minute per organization
 * Shared across all users in the same organization
 *
 * Key: Organization/Tenant ID
 */
export const tenantApiLimiter = rateLimiter({
  windowMs: 60 * 1000, // 1 minute
  limit: 5000,
  standardHeaders: 'draft-6',
  keyGenerator: tenantKeyGenerator,
  handler: (c) => {
    return c.json(
      {
        success: false,
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: 'Organization API rate limit exceeded. Please try again later.',
        },
      },
      429
    );
  },
});

/**
 * Organization-level billing rate limiter
 * 20 billing operations per hour per organization
 *
 * Key: Organization/Tenant ID
 */
export const tenantBillingLimiter = rateLimiter({
  windowMs: 60 * 60 * 1000, // 1 hour
  limit: 20,
  standardHeaders: 'draft-6',
  keyGenerator: tenantKeyGenerator,
  handler: (c) => {
    return c.json(
      {
        success: false,
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: 'Too many billing operations. Please try again later.',
        },
      },
      429
    );
  },
});

/**
 * Organization-level export rate limiter
 * 10 exports per hour per organization
 *
 * Key: Organization/Tenant ID
 */
export const tenantExportLimiter = rateLimiter({
  windowMs: 60 * 60 * 1000, // 1 hour
  limit: 10,
  standardHeaders: 'draft-6',
  keyGenerator: tenantKeyGenerator,
  handler: (c) => {
    return c.json(
      {
        success: false,
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: 'Too many export requests. Please try again later.',
        },
      },
      429
    );
  },
});
