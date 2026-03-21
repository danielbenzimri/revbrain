/**
 * Admin Permission Middleware
 *
 * Granular permission-based access control for admin routes.
 * Replaces coarse requireRole('system_admin') with specific permissions.
 *
 * Permission model:
 * - Permissions stored in admin_role_definitions table (JSONB array)
 * - Users assigned roles via admin_role_assignments junction table
 * - '*' wildcard grants all permissions (super_admin)
 * - Backward compatible: system_admin without assignment treated as super_admin
 *
 * Note: Must work against both staging and production.
 */
import type { MiddlewareHandler } from 'hono';
import { AppError, ErrorCodes } from '@revbrain/contract';

// Cache resolved permissions per user (5-minute TTL)
const PERMISSION_CACHE = new Map<string, { permissions: string[]; cachedAt: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000;

/**
 * Middleware factory: requires the user to have ALL specified permissions.
 */
export function requireAdminPermission(...requiredPermissions: string[]): MiddlewareHandler {
  return async (c, next) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const user = c.get('user') as any;
    if (!user) {
      throw new AppError(ErrorCodes.UNAUTHORIZED, 'Authentication required', 401);
    }

    const userPermissions = await resolveAdminPermissions(user.id, user.role, c);

    // Wildcard grants everything
    if (userPermissions.includes('*')) {
      return next();
    }

    // Check all required permissions
    for (const perm of requiredPermissions) {
      if (!userPermissions.includes(perm)) {
        throw new AppError(ErrorCodes.FORBIDDEN, `Missing admin permission: ${perm}`, 403);
      }
    }

    return next();
  };
}

/**
 * Resolve a user's admin permissions from the database.
 * Checks cache first (5-minute TTL).
 * Falls back to backward-compatible system_admin check.
 */
async function resolveAdminPermissions(
  userId: string,
  userRole: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  c: any
): Promise<string[]> {
  // Check cache
  const cached = PERMISSION_CACHE.get(userId);
  if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) {
    return cached.permissions;
  }

  try {
    // Query admin role assignments + definitions
    const repos = c.var?.repos;
    if (!repos) {
      // No repos available (shouldn't happen in normal flow)
      // Fall back to role-based check
      return userRole === 'system_admin' ? ['*'] : [];
    }

    // Use raw SQL to query the junction tables
    // (these tables are not in the standard Repositories interface yet)
    const db = repos._db || repos.users?._db;
    if (!db) {
      return userRole === 'system_admin' ? ['*'] : [];
    }

    // Try to query admin permissions
    try {
      const result = await db`
        SELECT d.permissions
        FROM admin_role_assignments a
        JOIN admin_role_definitions d ON d.role_name = a.role_name
        WHERE a.user_id = ${userId}
      `;

      if (result.length > 0) {
        // Merge all permissions from all assigned roles
        const allPerms = new Set<string>();
        for (const row of result) {
          const perms = Array.isArray(row.permissions)
            ? row.permissions
            : JSON.parse(row.permissions);
          for (const p of perms) allPerms.add(p);
        }
        const permissions = [...allPerms];
        PERMISSION_CACHE.set(userId, { permissions, cachedAt: Date.now() });
        return permissions;
      }
    } catch {
      // Tables may not exist yet — fall through to backward compat
    }

    // Backward compatibility: system_admin without role assignment = super_admin
    if (userRole === 'system_admin') {
      const permissions = ['*'];
      PERMISSION_CACHE.set(userId, { permissions, cachedAt: Date.now() });
      return permissions;
    }

    // Non-admin user with no assignments
    const permissions: string[] = [];
    PERMISSION_CACHE.set(userId, { permissions, cachedAt: Date.now() });
    return permissions;
  } catch {
    // On error, fall back to role check (don't lock admins out)
    return userRole === 'system_admin' ? ['*'] : [];
  }
}

/**
 * Clear permission cache for a user (e.g., after role change).
 */
export function clearPermissionCache(userId?: string): void {
  if (userId) {
    PERMISSION_CACHE.delete(userId);
  } else {
    PERMISSION_CACHE.clear();
  }
}
