/**
 * Limits Middleware
 *
 * Reusable middleware for enforcing plan limits on routes.
 * Uses LimitsService from context.
 */
import { createMiddleware } from 'hono/factory';
import type { AppEnv } from '../types/index.ts';
import { AppError, ErrorCodes } from '@revbrain/contract';

// ============================================================================
// USER CAPACITY
// ============================================================================

/**
 * Middleware to check user limit before allowing user creation/invitation.
 *
 * Usage:
 *   router.post('/invite', authMiddleware, requireUserCapacity(), handler)
 */
export const requireUserCapacity = () => {
  return createMiddleware<AppEnv>(async (c, next) => {
    const user = c.get('user');
    if (!user) {
      throw new AppError(ErrorCodes.UNAUTHORIZED, 'Authentication required', 401);
    }

    const limitsService = c.var.services.limits;
    const result = await limitsService.checkUserLimit(user.organizationId);

    if (!result.allowed) {
      throw new AppError(
        ErrorCodes.USER_LIMIT_EXCEEDED,
        result.warning ||
          `User limit reached (${result.limit} max). Upgrade your plan to add more users.`,
        403
      );
    }

    // Attach warning to response headers if approaching limit
    if (result.warning) {
      c.header('X-Limits-Warning', result.warning);
      c.header('X-Limits-Grace', result.graceActive ? 'true' : 'false');
    }

    await next();
  });
};

// ============================================================================
// PROJECT CAPACITY
// ============================================================================

/**
 * Middleware to check project limit before allowing project creation.
 *
 * Usage:
 *   router.post('/projects', authMiddleware, requireProjectCapacity(), handler)
 */
export const requireProjectCapacity = () => {
  return createMiddleware<AppEnv>(async (c, next) => {
    const user = c.get('user');
    if (!user) {
      throw new AppError(ErrorCodes.UNAUTHORIZED, 'Authentication required', 401);
    }

    const limitsService = c.var.services.limits;
    const result = await limitsService.checkProjectLimit(user.organizationId);

    if (!result.allowed) {
      throw new AppError(
        ErrorCodes.PROJECT_LIMIT_EXCEEDED,
        result.warning ||
          `Project limit reached (${result.limit} max). Upgrade your plan to create more projects.`,
        403
      );
    }

    if (result.warning) {
      c.header('X-Limits-Warning', result.warning);
      c.header('X-Limits-Grace', result.graceActive ? 'true' : 'false');
    }

    await next();
  });
};

// ============================================================================
// FEATURE ACCESS
// ============================================================================

/**
 * Middleware factory to check feature access.
 *
 * Usage:
 *   router.post('/ai/generate', authMiddleware, requireFeature('aiLevel', 'basic'), handler)
 *   router.get('/settings/branding', authMiddleware, requireFeature('customBranding'), handler)
 *   router.post('/sso/configure', authMiddleware, requireFeature('sso'), handler)
 *   router.get('/workspace', authMiddleware, requireFeature('module', 'workspace'), handler)
 */
export function requireFeature(
  feature: 'aiLevel' | 'customBranding' | 'sso' | 'module',
  requiredValue?: string
) {
  return createMiddleware<AppEnv>(async (c, next) => {
    const user = c.get('user');
    if (!user) {
      throw new AppError(ErrorCodes.UNAUTHORIZED, 'Authentication required', 401);
    }

    const limitsService = c.var.services.limits;
    const result = await limitsService.checkFeatureAccess(
      user.organizationId,
      feature,
      requiredValue
    );

    if (!result.allowed) {
      const featureNames: Record<string, string> = {
        aiLevel: `AI features (${requiredValue || 'basic'} level)`,
        customBranding: 'Custom branding',
        sso: 'Single Sign-On (SSO)',
        module: requiredValue || 'This module',
      };

      throw new AppError(
        ErrorCodes.FEATURE_NOT_AVAILABLE,
        `${featureNames[feature]} requires a higher plan. Please upgrade to access this feature.`,
        403
      );
    }

    await next();
  });
}

// ============================================================================
// SUBSCRIPTION STATUS
// ============================================================================

/**
 * Middleware to check subscription status.
 * Blocks access if subscription is past_due or canceled.
 * Allows free tier users (no subscription) to pass.
 *
 * Usage:
 *   router.use('/api/*', requireActiveSubscription())
 */
export const requireActiveSubscription = () => {
  return createMiddleware<AppEnv>(async (c, next) => {
    const user = c.get('user');
    if (!user) {
      throw new AppError(ErrorCodes.UNAUTHORIZED, 'Authentication required', 401);
    }

    // Skip for system admins
    if (user.role === 'system_admin') {
      await next();
      return;
    }

    // Skip for SI partners — they use agreement-based billing, not subscriptions
    const org = await c.var.repos.organizations.findById(user.organizationId);
    if (org?.type === 'si_partner') {
      await next();
      return;
    }

    // Get subscription status from usage stats
    const limitsService = c.var.services.limits;
    const stats = await limitsService.getUsageStats(user.organizationId);

    // Allow if no subscription (free tier) or active/trialing
    if (!stats.subscription || ['active', 'trialing'].includes(stats.subscription.status)) {
      await next();
      return;
    }

    if (stats.subscription.status === 'past_due') {
      throw new AppError(
        ErrorCodes.SUBSCRIPTION_PAST_DUE,
        'Your subscription payment is past due. Please update your payment method.',
        402
      );
    }

    if (stats.subscription.status === 'canceled') {
      throw new AppError(
        ErrorCodes.SUBSCRIPTION_REQUIRED,
        'Your subscription has been canceled. Please resubscribe to continue.',
        402
      );
    }

    await next();
  });
};

// ============================================================================
// STORAGE CHECK (for file uploads)
// ============================================================================

/**
 * Middleware factory to check storage limit before file upload.
 * Extracts file size from Content-Length header.
 *
 * Usage:
 *   router.post('/files/upload', authMiddleware, requireStorageCapacity(), handler)
 */
export const requireStorageCapacity = () => {
  return createMiddleware<AppEnv>(async (c, next) => {
    const user = c.get('user');
    if (!user) {
      throw new AppError(ErrorCodes.UNAUTHORIZED, 'Authentication required', 401);
    }

    // Get file size from Content-Length header
    const contentLength = c.req.header('Content-Length');
    const fileSizeBytes = contentLength ? parseInt(contentLength, 10) : 0;

    if (fileSizeBytes > 0) {
      const limitsService = c.var.services.limits;
      const result = await limitsService.checkStorageLimit(user.organizationId, fileSizeBytes);

      if (!result.allowed) {
        throw new AppError(
          ErrorCodes.STORAGE_LIMIT_EXCEEDED,
          result.warning ||
            `Storage limit reached (${result.limit} GB max). Upgrade your plan for more storage.`,
          403
        );
      }

      if (result.warning) {
        c.header('X-Limits-Warning', result.warning);
        c.header('X-Limits-Grace', result.graceActive ? 'true' : 'false');
      }
    }

    await next();
  });
};
