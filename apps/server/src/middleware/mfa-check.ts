/**
 * MFA Enforcement Middleware
 *
 * Requires system_admin users to have MFA (TOTP) enrolled.
 * Supports staged rollout via MFA_ENFORCEMENT env var:
 *   - 'log'     — log warning but allow access (default)
 *   - 'enforce' — block access without MFA (returns 403)
 *
 * Skipped entirely in mock auth mode (AUTH_MODE=mock).
 * Grace period: users created within 24h can access without MFA.
 *
 * Note: Must work against both staging and production Supabase projects.
 */
import type { MiddlewareHandler } from 'hono';
import { createClient } from '@supabase/supabase-js';

const MFA_CACHE = new Map<string, { enrolled: boolean; checkedAt: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const GRACE_PERIOD_MS = 24 * 60 * 60 * 1000; // 24 hours

export const requireMFA: MiddlewareHandler = async (c, next) => {
  // Skip in mock auth mode
  const authMode = process.env.AUTH_MODE || 'jwt';
  if (authMode === 'mock') {
    return next();
  }

  // Only check system_admin users
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const user = c.get('user') as any;
  if (!user || user.role !== 'system_admin') {
    return next();
  }

  const enforcement = process.env.MFA_ENFORCEMENT || 'log';

  // Grace period: skip for recently created users
  if (user.createdAt) {
    const createdAt = new Date(user.createdAt).getTime();
    if (Date.now() - createdAt < GRACE_PERIOD_MS) {
      return next();
    }
  }

  // Check MFA enrollment (cached)
  const enrolled = await checkMFAEnrolled(user.id);

  if (!enrolled) {
    if (enforcement === 'enforce') {
      return c.json(
        {
          success: false,
          error: {
            code: 'mfa_required',
            message:
              'MFA enrollment is required for admin access. Please enable TOTP in your account settings.',
          },
        },
        403
      );
    } else {
      // Log-only mode — warn but allow
      console.warn(`[MFA] Admin user ${user.id} does not have MFA enrolled`);
    }
  }

  return next();
};

async function checkMFAEnrolled(userId: string): Promise<boolean> {
  // Check cache first
  const cached = MFA_CACHE.get(userId);
  if (cached && Date.now() - cached.checkedAt < CACHE_TTL_MS) {
    return cached.enrolled;
  }

  try {
    const supabaseUrl = process.env.SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
      // Can't check MFA without Supabase credentials — allow access
      return true;
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data } = await supabase.auth.admin.getUserById(userId);
    if (!data.user) {
      MFA_CACHE.set(userId, { enrolled: false, checkedAt: Date.now() });
      return false;
    }

    // Check if user has any verified TOTP factors
    const factors = data.user.factors || [];
    const hasVerifiedTOTP = factors.some(
      (f: { factor_type: string; status: string }) =>
        f.factor_type === 'totp' && f.status === 'verified'
    );

    MFA_CACHE.set(userId, { enrolled: hasVerifiedTOTP, checkedAt: Date.now() });
    return hasVerifiedTOTP;
  } catch (err) {
    console.error('[MFA] Error checking MFA status:', err instanceof Error ? err.message : err);
    // On error, allow access (don't lock admins out due to API issues)
    return true;
  }
}

/**
 * Clear MFA cache (e.g., after user enrolls MFA)
 */
export function clearMFACache(userId?: string): void {
  if (userId) {
    MFA_CACHE.delete(userId);
  } else {
    MFA_CACHE.clear();
  }
}
