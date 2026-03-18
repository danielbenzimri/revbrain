/**
 * Limits Service
 *
 * Enforces plan limits for organizations:
 * - User limits (seat management)
 * - Project limits
 * - Storage limits
 * - Feature access (AI, branding, SSO, modules)
 *
 * Includes caching for performance and grace periods for better UX.
 */
import type {
  Repositories,
  OrganizationWithPlan,
  PlanLimits,
  PlanFeatures,
} from '@geometrix/contract';
import { AppError, ErrorCodes } from '@geometrix/contract';
import { db, subscriptions, eq } from '@geometrix/database';
import { logger } from '../lib/logger.ts';

// ============================================================================
// TYPES
// ============================================================================

export interface LimitCheckResult {
  allowed: boolean;
  currentUsage: number;
  limit: number;
  remaining: number;
  warning?: string;
  graceActive?: boolean;
}

export interface FeatureCheckResult {
  allowed: boolean;
  feature: string;
  currentLevel?: string;
  requiredLevel?: string;
}

export interface UsageStats {
  users: { used: number; limit: number; percentage: number };
  projects: { used: number; limit: number; percentage: number };
  storage: { usedGB: number; limitGB: number; percentage: number };
  features: PlanFeatures | null;
  subscription: {
    status: string;
    planName: string;
    planCode: string;
  } | null;
}

// Subscription status from database
interface SubscriptionInfo {
  status: string;
  cancelAtPeriodEnd: boolean | null;
  currentPeriodEnd: Date | null;
  trialEnd: Date | null;
}

// Cache entry structure
interface CacheEntry {
  data: OrganizationWithPlan;
  projectCount: number;
  storageUsedGB: number;
  subscription: SubscriptionInfo | null;
  expiresAt: number;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const CACHE_TTL_MS = 60_000; // 1 minute
const GRACE_PERIOD_PERCENTAGE = 0.1; // 10% overage allowed
const WARNING_THRESHOLD = 0.8; // Warn at 80% usage

// ============================================================================
// SERVICE
// ============================================================================

export class LimitsService {
  private cache = new Map<string, CacheEntry>();

  constructor(
    private repos: Repositories,
    private cacheTTL: number = CACHE_TTL_MS
  ) {}

  // ==========================================================================
  // PUBLIC API - LIMIT CHECKS
  // ==========================================================================

  /**
   * Check if organization can add another user.
   * Used by: user invitation, user activation
   */
  async checkUserLimit(organizationId: string): Promise<LimitCheckResult> {
    const { org, limits } = await this.getOrgWithLimits(organizationId);

    // No limits or unlimited (0 = unlimited)
    if (!limits || limits.maxUsers === 0) {
      return {
        allowed: true,
        currentUsage: org.seatUsed,
        limit: 0,
        remaining: Infinity,
      };
    }

    const current = org.seatUsed;
    const limit = limits.maxUsers;
    const remaining = Math.max(0, limit - current);
    const graceLimit = Math.ceil(limit * (1 + GRACE_PERIOD_PERCENTAGE));

    // Hard limit exceeded (beyond grace period)
    if (current >= graceLimit) {
      return {
        allowed: false,
        currentUsage: current,
        limit,
        remaining: 0,
        warning: `User limit exceeded. Maximum ${limit} users allowed on your plan.`,
      };
    }

    // In grace period (over limit but within buffer)
    if (current >= limit) {
      return {
        allowed: true,
        currentUsage: current,
        limit,
        remaining: 0,
        graceActive: true,
        warning: `You have exceeded your user limit (${current}/${limit}). Please upgrade within 7 days.`,
      };
    }

    // Warning threshold (approaching limit)
    if (current >= limit * WARNING_THRESHOLD) {
      return {
        allowed: true,
        currentUsage: current,
        limit,
        remaining,
        warning: `You're approaching your user limit (${current}/${limit}).`,
      };
    }

    return { allowed: true, currentUsage: current, limit, remaining };
  }

  /**
   * Check if organization can create another project.
   * Used by: project creation
   */
  async checkProjectLimit(organizationId: string): Promise<LimitCheckResult> {
    const { limits, projectCount } = await this.getOrgWithLimits(organizationId);

    // No limits or unlimited
    if (!limits || limits.maxProjects === 0) {
      return {
        allowed: true,
        currentUsage: projectCount,
        limit: 0,
        remaining: Infinity,
      };
    }

    const current = projectCount;
    const limit = limits.maxProjects;
    const remaining = Math.max(0, limit - current);
    const graceLimit = Math.ceil(limit * (1 + GRACE_PERIOD_PERCENTAGE));

    // Hard limit exceeded
    if (current >= graceLimit) {
      return {
        allowed: false,
        currentUsage: current,
        limit,
        remaining: 0,
        warning: `Project limit exceeded. Maximum ${limit} projects allowed on your plan.`,
      };
    }

    // In grace period
    if (current >= limit) {
      return {
        allowed: true,
        currentUsage: current,
        limit,
        remaining: 0,
        graceActive: true,
        warning: `You have exceeded your project limit (${current}/${limit}). Please upgrade within 7 days.`,
      };
    }

    // Warning threshold
    if (current >= limit * WARNING_THRESHOLD) {
      return {
        allowed: true,
        currentUsage: current,
        limit,
        remaining,
        warning: `You're approaching your project limit (${current}/${limit}).`,
      };
    }

    return { allowed: true, currentUsage: current, limit, remaining };
  }

  /**
   * Check if organization can upload file of given size.
   * Used by: file upload endpoints
   */
  async checkStorageLimit(
    organizationId: string,
    fileSizeBytes: number
  ): Promise<LimitCheckResult> {
    const { limits, storageUsedGB } = await this.getOrgWithLimits(organizationId);

    // No limits or unlimited
    if (!limits || limits.storageGB === 0) {
      return {
        allowed: true,
        currentUsage: storageUsedGB,
        limit: 0,
        remaining: Infinity,
      };
    }

    const fileSizeGB = fileSizeBytes / (1024 * 1024 * 1024);
    const projectedUsage = storageUsedGB + fileSizeGB;
    const limit = limits.storageGB;
    const graceLimit = limit * (1 + GRACE_PERIOD_PERCENTAGE);

    // Hard limit exceeded
    if (projectedUsage > graceLimit) {
      return {
        allowed: false,
        currentUsage: storageUsedGB,
        limit,
        remaining: Math.max(0, limit - storageUsedGB),
        warning: `Storage limit exceeded. Maximum ${limit} GB allowed on your plan.`,
      };
    }

    // In grace period
    if (projectedUsage > limit) {
      return {
        allowed: true,
        currentUsage: storageUsedGB,
        limit,
        remaining: Math.max(0, limit - storageUsedGB),
        graceActive: true,
        warning: `You are approaching your storage limit (${storageUsedGB.toFixed(1)}/${limit} GB). Please upgrade soon.`,
      };
    }

    return {
      allowed: true,
      currentUsage: storageUsedGB,
      limit,
      remaining: limit - storageUsedGB,
    };
  }

  // ==========================================================================
  // PUBLIC API - FEATURE CHECKS
  // ==========================================================================

  /**
   * Check if organization has access to a specific feature.
   * Used by: feature gates (AI, SSO, branding, modules)
   */
  async checkFeatureAccess(
    organizationId: string,
    feature: 'aiLevel' | 'customBranding' | 'sso' | 'module',
    requiredValue?: string
  ): Promise<FeatureCheckResult> {
    const { features } = await this.getOrgWithLimits(organizationId);

    // No plan = no premium features
    if (!features) {
      return { allowed: false, feature };
    }

    switch (feature) {
      case 'aiLevel': {
        const levels = ['none', 'basic', 'advanced', 'full'];
        const currentIndex = levels.indexOf(features.aiLevel);
        const requiredIndex = levels.indexOf(requiredValue || 'basic');
        return {
          allowed: currentIndex >= requiredIndex,
          feature,
          currentLevel: features.aiLevel,
          requiredLevel: requiredValue,
        };
      }

      case 'customBranding':
        return { allowed: features.customBranding, feature };

      case 'sso':
        return { allowed: features.sso, feature };

      case 'module':
        return {
          allowed: features.modules.includes(requiredValue || ''),
          feature: requiredValue || 'unknown',
        };

      default:
        return { allowed: false, feature };
    }
  }

  // ==========================================================================
  // PUBLIC API - USAGE STATS
  // ==========================================================================

  /**
   * Get complete usage statistics for an organization.
   * Used by: dashboard, billing page
   */
  async getUsageStats(organizationId: string): Promise<UsageStats> {
    const { org, limits, features, projectCount, storageUsedGB, subscription } =
      await this.getOrgWithLimits(organizationId);

    const usersLimit = limits?.maxUsers || 0;
    const projectsLimit = limits?.maxProjects || 0;
    const storageLimit = limits?.storageGB || 0;

    // Calculate percentages (0% if unlimited)
    const usersPercentage = usersLimit === 0 ? 0 : Math.min(100, (org.seatUsed / usersLimit) * 100);
    const projectsPercentage =
      projectsLimit === 0 ? 0 : Math.min(100, (projectCount / projectsLimit) * 100);
    const storagePercentage =
      storageLimit === 0 ? 0 : Math.min(100, (storageUsedGB / storageLimit) * 100);

    return {
      users: {
        used: org.seatUsed,
        limit: usersLimit,
        percentage: Math.round(usersPercentage),
      },
      projects: {
        used: projectCount,
        limit: projectsLimit,
        percentage: Math.round(projectsPercentage),
      },
      storage: {
        usedGB: Math.round(storageUsedGB * 100) / 100,
        limitGB: storageLimit,
        percentage: Math.round(storagePercentage),
      },
      features,
      subscription: org.plan
        ? {
            status: subscription?.status || 'none',
            planName: org.plan.name,
            planCode: org.plan.code,
          }
        : null,
    };
  }

  // ==========================================================================
  // CACHE MANAGEMENT
  // ==========================================================================

  /**
   * Invalidate cache for an organization.
   * Call after: user creation, project creation, file upload, plan change
   */
  invalidateCache(organizationId: string): void {
    this.cache.delete(organizationId);
    logger.debug('Limits cache invalidated', { organizationId });
  }

  /**
   * Clear the entire cache (useful for testing or admin operations)
   */
  clearCache(): void {
    this.cache.clear();
    logger.debug('Limits cache cleared');
  }

  // ==========================================================================
  // PRIVATE HELPERS
  // ==========================================================================

  private async getOrgWithLimits(organizationId: string): Promise<{
    org: OrganizationWithPlan;
    limits: PlanLimits | null;
    features: PlanFeatures | null;
    projectCount: number;
    storageUsedGB: number;
    subscription: SubscriptionInfo | null;
  }> {
    // Check cache first
    const cached = this.cache.get(organizationId);
    if (cached && cached.expiresAt > Date.now()) {
      return {
        org: cached.data,
        limits: cached.data.plan?.limits || null,
        features: cached.data.plan?.features || null,
        projectCount: cached.projectCount,
        storageUsedGB: cached.storageUsedGB,
        subscription: cached.subscription,
      };
    }

    // Fetch fresh data
    const org = await this.repos.organizations.findWithPlan(organizationId);
    if (!org) {
      throw new AppError(ErrorCodes.NOT_FOUND, 'Organization not found', 404);
    }

    // Count projects for this org
    const projectCount = await this.repos.projects.countByOrganization(organizationId);

    // Convert storage from bytes to GB (1 GB = 1024^3 bytes)
    const BYTES_PER_GB = 1024 * 1024 * 1024;
    const storageUsedGB = org.storageUsedBytes / BYTES_PER_GB;

    // Fetch subscription status from database
    const sub = await db.query.subscriptions.findFirst({
      where: eq(subscriptions.organizationId, organizationId),
    });

    const subscription: SubscriptionInfo | null = sub
      ? {
          status: sub.status,
          cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
          currentPeriodEnd: sub.currentPeriodEnd,
          trialEnd: sub.trialEnd,
        }
      : null;

    // Cache the result
    this.cache.set(organizationId, {
      data: org,
      projectCount,
      storageUsedGB,
      subscription,
      expiresAt: Date.now() + this.cacheTTL,
    });

    return {
      org,
      limits: org.plan?.limits || null,
      features: org.plan?.features || null,
      projectCount,
      storageUsedGB,
      subscription,
    };
  }
}
