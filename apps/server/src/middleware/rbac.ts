import { createMiddleware } from 'hono/factory';
import type { UserRole } from '@revbrain/contract';
import { AppError, ErrorCodes, getOrgTypeForRole } from '@revbrain/contract';

/**
 * Role-Based Access Control Middleware
 *
 * Usage:
 *   app.post('/admin/onboard', authMiddleware, requireRole('system_admin'), handler)
 *   app.post('/org/invite', authMiddleware, requireRole('contractor_ceo', 'client_owner'), handler)
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
 * - system_admin can only invite org admins (contractor_ceo, client_owner)
 * - org admins can invite within their org type, but not other org admins
 */
export function canInviteRole(actorRole: UserRole, targetRole: UserRole): boolean {
  // system_admin can invite anyone (God Mode)
  if (actorRole === 'system_admin') {
    return true;
  }

  // Org admins can invite within their org type
  if (actorRole === 'contractor_ceo' || actorRole === 'client_owner') {
    const actorOrgType = getOrgTypeForRole(actorRole);
    const targetOrgType = getOrgTypeForRole(targetRole);

    // Must be same org type
    if (actorOrgType !== targetOrgType) {
      return false;
    }

    // Cannot invite other org admins
    if (targetRole === 'contractor_ceo' || targetRole === 'client_owner') {
      return false;
    }

    return true;
  }

  // No one else can invite
  return false;
}
