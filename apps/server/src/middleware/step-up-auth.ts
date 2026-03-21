/**
 * Step-Up Authentication Middleware
 *
 * Requires recent authentication for sensitive admin actions.
 * Uses JWT `iat` (issued at) claim as proxy for last auth time.
 *
 * When step-up is triggered:
 * 1. Server returns 403 with code 'STEP_UP_REQUIRED'
 * 2. Client calls supabase.auth.refreshSession() → new JWT with fresh iat
 * 3. Client retries the original request
 *
 * Note: Must work against both staging and production.
 */
import type { MiddlewareHandler } from 'hono';

/**
 * Middleware factory: requires the JWT to have been issued within
 * maxAgeMinutes of the current time.
 *
 * @param maxAgeMinutes Maximum age of the JWT in minutes (default: 5)
 */
export function requireRecentAuth(maxAgeMinutes = 5): MiddlewareHandler {
  return async (c, next) => {
    // Skip in mock auth mode
    const authMode = process.env.AUTH_MODE || 'jwt';
    if (authMode === 'mock') {
      return next();
    }

    // Get JWT iat from context (set by auth middleware)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const jwtPayload = c.get('jwtPayload') as any;
    const iat = jwtPayload?.iat;

    if (!iat) {
      // No iat claim — can't determine auth age, allow access
      // (this handles mock tokens and edge cases)
      return next();
    }

    const ageSeconds = Math.floor(Date.now() / 1000) - iat;
    const ageMinutes = ageSeconds / 60;

    if (ageMinutes > maxAgeMinutes) {
      return c.json(
        {
          success: false,
          error: {
            code: 'STEP_UP_REQUIRED',
            message: `Recent authentication required. Your session is ${Math.floor(ageMinutes)} minutes old. Please re-authenticate.`,
            maxAgeMinutes,
          },
        },
        403
      );
    }

    return next();
  };
}
