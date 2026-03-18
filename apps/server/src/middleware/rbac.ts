import { createMiddleware } from 'hono/factory';
import type { UserRole } from '@revbrain/contract';
import { AppError, ErrorCodes } from '@revbrain/contract';

/**
 * Role-Based Access Control Middleware
 *
 * Usage:
 *   app.post('/admin/onboard', authMiddleware, requireRole('system_admin'), handler)
 *   app.post('/org/invite', authMiddleware, requireRole('org_owner', 'admin'), handler)
 */
export function requireRole(...allowedRoles: UserRole[]) {
  return createMiddleware(async (c, next) => {
    const user = c.get('user');

    if (!user) {
      throw new AppError(ErrorCodes.UNAUTHORIZED, 'Authentication required', 401);
    }

    if (!allowedRoles.includes(user.role as UserRole)) {
      throw new AppError(
        ErrorCodes.FORBIDDEN,
        `This action requires one of these roles: ${allowedRoles.join(', ')}`,
        403
      );
    }

    await next();
  });
}

/**
 * Check if an actor can invite a user with a target role
 *
 * Rules:
 * - system_admin can invite anyone
 * - org_owner can invite admin, operator, reviewer
 * - admin can invite operator, reviewer
 * - operator/reviewer cannot invite
 */
export function canInviteRole(actorRole: UserRole, targetRole: UserRole): boolean {
  if (actorRole === 'system_admin') return true;

  if (actorRole === 'org_owner') {
    return ['admin', 'operator', 'reviewer'].includes(targetRole);
  }

  if (actorRole === 'admin') {
    return ['operator', 'reviewer'].includes(targetRole);
  }

  return false;
}
