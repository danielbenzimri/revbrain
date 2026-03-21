/**
 * Impersonation Middleware
 *
 * Runs AFTER auth middleware. Detects impersonation tokens
 * (iss === 'revbrain-impersonation') and applies read-only restrictions.
 *
 * When an admin impersonates a user, the auth middleware resolves the
 * target user (via `sub` claim). This middleware then:
 * 1. Looks up the real admin user via `realSubject` claim
 * 2. Sets `realUser` on context for audit trail
 * 3. Enforces read-only mode by blocking non-allowlisted requests
 *
 * Admin routes (/admin/*) remain fully accessible during impersonation
 * so the admin can end the session or perform admin actions.
 */
import type { MiddlewareHandler } from 'hono';
import { db, users, eq } from '@revbrain/database';
import { logger } from '../lib/logger.ts';

/**
 * Allowlist of routes permitted during read-only impersonation.
 * Format: [method, pathPrefix]
 * All admin routes are implicitly allowed (checked separately).
 */
const IMPERSONATION_ALLOWLIST: Array<[string, string]> = [
  ['GET', '/v1/projects/'],
  ['GET', '/api/v1/projects/'],
  ['GET', '/v1/users/'],
  ['GET', '/api/v1/users/'],
  ['GET', '/v1/billing/usage'],
  ['GET', '/api/v1/billing/usage'],
  ['GET', '/v1/billing/subscription'],
  ['GET', '/api/v1/billing/subscription'],
  ['GET', '/v1/org/users'],
  ['GET', '/api/v1/org/users'],
  ['POST', '/v1/billing/portal'],
  ['POST', '/api/v1/billing/portal'],
];

/**
 * Check if a request is allowed during read-only impersonation.
 */
function isAllowedDuringImpersonation(method: string, path: string): boolean {
  return IMPERSONATION_ALLOWLIST.some(
    ([allowedMethod, allowedPath]) => method === allowedMethod && path.startsWith(allowedPath)
  );
}

/**
 * Look up a user by their Supabase user ID (the `sub` / `realSubject` claim).
 */
async function lookupUserBySubject(supabaseUserId: string) {
  return db.query.users.findFirst({
    where: eq(users.supabaseUserId, supabaseUserId),
  });
}

export const impersonationMiddleware: MiddlewareHandler = async (c, next) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const jwtPayload = c.get('jwtPayload') as any;

  if (!jwtPayload || jwtPayload.iss !== 'revbrain-impersonation') {
    return next(); // Not an impersonation session
  }

  // Set dual identity — look up the real admin user
  try {
    const realUser = await lookupUserBySubject(jwtPayload.realSubject);
    if (realUser) {
      c.set('realUser', realUser);
    } else {
      logger.warn('Impersonation: real user not found', {
        realSubject: jwtPayload.realSubject,
      });
    }
  } catch (err) {
    logger.error('Impersonation: failed to look up real user', {}, err as Error);
  }

  c.set('impersonationMode', jwtPayload.impersonationMode || 'read_only');
  c.set('impersonationReason', jwtPayload.reason);

  // Read-only enforcement: admin routes are always accessible
  const isAdminRoute = c.req.path.includes('/admin/');
  if (!isAdminRoute) {
    const method = c.req.method;
    const path = c.req.path;

    if (!isAllowedDuringImpersonation(method, path)) {
      return c.json(
        {
          success: false,
          error: {
            code: 'impersonation_read_only',
            message: 'This action is not allowed during read-only impersonation',
          },
        },
        403
      );
    }
  }

  return next();
};
