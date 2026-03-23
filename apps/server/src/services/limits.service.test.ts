/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LimitsService } from './limits.service.ts';
import type {
  Repositories,
  OrganizationWithPlan,
  PlanLimits,
  PlanFeatures,
} from '@revbrain/contract';

// Mock the subscription query
const mockSubscriptionsFindFirst = vi.hoisted(() => vi.fn());

vi.mock('@revbrain/database/client', () => ({
  db: {
    query: {
      subscriptions: {
        findFirst: mockSubscriptionsFindFirst,
      },
    },
  },
}));

vi.mock('@revbrain/database', () => ({
  subscriptions: {
    organizationId: 'organization_id',
  },
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((...args) => ({ type: 'eq', args })),
}));

// Mock logger
vi.mock('../lib/logger.ts', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
  },
}));

describe('LimitsService', () => {
  let service: LimitsService;
  let mockRepos: Partial<Repositories>;

  // Default test data
  const defaultLimits: PlanLimits = {
    maxUsers: 10,
    maxProjects: 20,
    storageGB: 50,
  };

  const defaultFeatures: PlanFeatures = {
    modules: ['dashboard', 'projects', 'billing'],
    aiLevel: 'basic',
    customBranding: false,
    sso: false,
  };

  const createMockOrg = (
    overrides: Partial<{
      seatUsed: number;
      seatLimit: number;
      storageUsedBytes: number;
      limits: PlanLimits | null;
      features: PlanFeatures | null;
    }> = {}
  ): OrganizationWithPlan =>
    // Cast through unknown to satisfy TypeScript in tests
    ({
      id: 'org-123',
      name: 'Test Org',
      type: 'business',
      slug: 'test-org',
      seatUsed: overrides.seatUsed ?? 5,
      seatLimit: overrides.seatLimit ?? 10,
      storageUsedBytes: overrides.storageUsedBytes ?? 0,
      planId: 'plan-123',
      isActive: true,
      createdBy: 'user-123',
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
      stripeCustomerId: null,
      plan:
        overrides.limits === null
          ? null
          : {
              id: 'plan-123',
              name: 'Professional',
              code: 'pro-monthly',
              limits: overrides.limits ?? defaultLimits,
              features: overrides.features ?? defaultFeatures,
            },
    }) as unknown as OrganizationWithPlan;

  beforeEach(() => {
    vi.clearAllMocks();

    mockRepos = {
      organizations: {
        findWithPlan: vi.fn(),
      } as any,
      projects: {
        countByOrganization: vi.fn().mockResolvedValue(10),
      } as any,
    };

    // Default mock: organization has an active subscription
    mockSubscriptionsFindFirst.mockResolvedValue({
      status: 'active',
      cancelAtPeriodEnd: false,
      currentPeriodEnd: new Date('2025-12-31'),
      trialEnd: null,
    });

    // Short TTL for testing cache behavior
    service = new LimitsService(mockRepos as Repositories, 100);
  });

  // ==========================================================================
  // checkUserLimit
  // ==========================================================================

  describe('checkUserLimit', () => {
    it('should allow when well under limit', async () => {
      const mockOrg = createMockOrg({ seatUsed: 3 }); // 3/10
      (mockRepos.organizations!.findWithPlan as any).mockResolvedValue(mockOrg);

      const result = await service.checkUserLimit('org-123');

      expect(result.allowed).toBe(true);
      expect(result.currentUsage).toBe(3);
      expect(result.limit).toBe(10);
      expect(result.remaining).toBe(7);
      expect(result.warning).toBeUndefined();
    });

    it('should allow with warning at 80% threshold', async () => {
      const mockOrg = createMockOrg({ seatUsed: 8 }); // 8/10 = 80%
      (mockRepos.organizations!.findWithPlan as any).mockResolvedValue(mockOrg);

      const result = await service.checkUserLimit('org-123');

      expect(result.allowed).toBe(true);
      expect(result.warning).toContain('approaching');
      expect(result.remaining).toBe(2);
    });

    it('should allow with grace period when at limit', async () => {
      const mockOrg = createMockOrg({ seatUsed: 10 }); // 10/10 = 100%
      (mockRepos.organizations!.findWithPlan as any).mockResolvedValue(mockOrg);

      const result = await service.checkUserLimit('org-123');

      expect(result.allowed).toBe(true);
      expect(result.graceActive).toBe(true);
      expect(result.warning).toContain('exceeded');
      expect(result.remaining).toBe(0);
    });

    it('should block when beyond grace period (>110%)', async () => {
      const mockOrg = createMockOrg({ seatUsed: 12 }); // 12/10 = 120%
      (mockRepos.organizations!.findWithPlan as any).mockResolvedValue(mockOrg);

      const result = await service.checkUserLimit('org-123');

      expect(result.allowed).toBe(false);
      expect(result.warning).toContain('exceeded');
    });

    it('should allow unlimited when limit is 0', async () => {
      const mockOrg = createMockOrg({
        seatUsed: 100,
        limits: { ...defaultLimits, maxUsers: 0 },
      });
      (mockRepos.organizations!.findWithPlan as any).mockResolvedValue(mockOrg);

      const result = await service.checkUserLimit('org-123');

      expect(result.allowed).toBe(true);
      expect(result.limit).toBe(0);
      expect(result.remaining).toBe(Infinity);
    });

    it('should allow when no plan (free tier)', async () => {
      const mockOrg = createMockOrg({ limits: null });
      mockOrg.plan = null;
      (mockRepos.organizations!.findWithPlan as any).mockResolvedValue(mockOrg);

      const result = await service.checkUserLimit('org-123');

      expect(result.allowed).toBe(true);
    });

    it('should not warn at 79% (below threshold)', async () => {
      // 7/10 = 70%, 8/10 = 80%
      const mockOrg = createMockOrg({ seatUsed: 7 }); // 70%
      (mockRepos.organizations!.findWithPlan as any).mockResolvedValue(mockOrg);

      const result = await service.checkUserLimit('org-123');

      expect(result.allowed).toBe(true);
      expect(result.warning).toBeUndefined();
    });

    it('should allow at exactly grace limit boundary', async () => {
      // 10% grace on 10 users = 11 max
      const mockOrg = createMockOrg({ seatUsed: 11 }); // 110% - exactly at grace
      (mockRepos.organizations!.findWithPlan as any).mockResolvedValue(mockOrg);

      const result = await service.checkUserLimit('org-123');

      // ceil(10 * 1.1) = 11, so at exactly 11 we should be blocked (>= graceLimit)
      expect(result.allowed).toBe(false);
    });
  });

  // ==========================================================================
  // checkProjectLimit
  // ==========================================================================

  describe('checkProjectLimit', () => {
    it('should allow when under project limit', async () => {
      const mockOrg = createMockOrg();
      (mockRepos.organizations!.findWithPlan as any).mockResolvedValue(mockOrg);
      (mockRepos.projects!.countByOrganization as any).mockResolvedValue(5);

      const result = await service.checkProjectLimit('org-123');

      expect(result.allowed).toBe(true);
      expect(result.currentUsage).toBe(5);
      expect(result.limit).toBe(20);
      expect(result.remaining).toBe(15);
    });

    it('should warn at 80% project usage', async () => {
      const mockOrg = createMockOrg();
      (mockRepos.organizations!.findWithPlan as any).mockResolvedValue(mockOrg);
      (mockRepos.projects!.countByOrganization as any).mockResolvedValue(16); // 16/20 = 80%

      const result = await service.checkProjectLimit('org-123');

      expect(result.allowed).toBe(true);
      expect(result.warning).toContain('approaching');
    });

    it('should allow with grace at limit', async () => {
      const mockOrg = createMockOrg();
      (mockRepos.organizations!.findWithPlan as any).mockResolvedValue(mockOrg);
      (mockRepos.projects!.countByOrganization as any).mockResolvedValue(20); // 20/20 = 100%

      const result = await service.checkProjectLimit('org-123');

      expect(result.allowed).toBe(true);
      expect(result.graceActive).toBe(true);
    });

    it('should block beyond grace period', async () => {
      const mockOrg = createMockOrg();
      (mockRepos.organizations!.findWithPlan as any).mockResolvedValue(mockOrg);
      (mockRepos.projects!.countByOrganization as any).mockResolvedValue(23); // 23/20 > 110%

      const result = await service.checkProjectLimit('org-123');

      expect(result.allowed).toBe(false);
    });

    it('should allow unlimited projects when limit is 0', async () => {
      const mockOrg = createMockOrg({
        limits: { ...defaultLimits, maxProjects: 0 },
      });
      (mockRepos.organizations!.findWithPlan as any).mockResolvedValue(mockOrg);
      (mockRepos.projects!.countByOrganization as any).mockResolvedValue(1000);

      const result = await service.checkProjectLimit('org-123');

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(Infinity);
    });

    it('should not warn below 80% threshold', async () => {
      const mockOrg = createMockOrg();
      (mockRepos.organizations!.findWithPlan as any).mockResolvedValue(mockOrg);
      (mockRepos.projects!.countByOrganization as any).mockResolvedValue(15); // 15/20 = 75%

      const result = await service.checkProjectLimit('org-123');

      expect(result.allowed).toBe(true);
      expect(result.warning).toBeUndefined();
    });
  });

  // ==========================================================================
  // checkStorageLimit
  // ==========================================================================

  describe('checkStorageLimit', () => {
    it('should allow upload when under limit', async () => {
      const mockOrg = createMockOrg();
      (mockRepos.organizations!.findWithPlan as any).mockResolvedValue(mockOrg);

      // Upload 1 GB
      const fileSizeBytes = 1 * 1024 * 1024 * 1024;
      const result = await service.checkStorageLimit('org-123', fileSizeBytes);

      expect(result.allowed).toBe(true);
      expect(result.limit).toBe(50);
    });

    it('should block when upload exceeds limit', async () => {
      const mockOrg = createMockOrg({
        limits: { ...defaultLimits, storageGB: 1 },
      });
      (mockRepos.organizations!.findWithPlan as any).mockResolvedValue(mockOrg);

      // Upload 2 GB (exceeds 1 GB limit + grace)
      const fileSizeBytes = 2 * 1024 * 1024 * 1024;
      const result = await service.checkStorageLimit('org-123', fileSizeBytes);

      expect(result.allowed).toBe(false);
    });

    it('should allow when storage is unlimited', async () => {
      const mockOrg = createMockOrg({
        limits: { ...defaultLimits, storageGB: 0 },
      });
      (mockRepos.organizations!.findWithPlan as any).mockResolvedValue(mockOrg);

      const fileSizeBytes = 100 * 1024 * 1024 * 1024; // 100 GB
      const result = await service.checkStorageLimit('org-123', fileSizeBytes);

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(Infinity);
    });

    it('should account for existing storage usage', async () => {
      // 40 GB already used, 50 GB limit
      const existingBytes = 40 * 1024 * 1024 * 1024;
      const mockOrg = createMockOrg({
        storageUsedBytes: existingBytes,
      });
      (mockRepos.organizations!.findWithPlan as any).mockResolvedValue(mockOrg);

      // Upload 8 GB -> 48 GB total (under 50 GB limit)
      const fileSizeBytes = 8 * 1024 * 1024 * 1024;
      const result = await service.checkStorageLimit('org-123', fileSizeBytes);

      expect(result.allowed).toBe(true);
      expect(result.currentUsage).toBeCloseTo(40, 0);
    });

    it('should allow with grace when exceeding limit', async () => {
      // 48 GB already used, 50 GB limit
      const existingBytes = 48 * 1024 * 1024 * 1024;
      const mockOrg = createMockOrg({
        storageUsedBytes: existingBytes,
      });
      (mockRepos.organizations!.findWithPlan as any).mockResolvedValue(mockOrg);

      // Upload 4 GB -> 52 GB total (exceeds 50 but within 10% grace = 55 GB)
      const fileSizeBytes = 4 * 1024 * 1024 * 1024;
      const result = await service.checkStorageLimit('org-123', fileSizeBytes);

      expect(result.allowed).toBe(true);
      expect(result.graceActive).toBe(true);
    });

    it('should block when exceeding grace period', async () => {
      // 50 GB already used, 50 GB limit
      const existingBytes = 50 * 1024 * 1024 * 1024;
      const mockOrg = createMockOrg({
        storageUsedBytes: existingBytes,
      });
      (mockRepos.organizations!.findWithPlan as any).mockResolvedValue(mockOrg);

      // Upload 10 GB -> 60 GB total (exceeds 55 GB grace limit)
      const fileSizeBytes = 10 * 1024 * 1024 * 1024;
      const result = await service.checkStorageLimit('org-123', fileSizeBytes);

      expect(result.allowed).toBe(false);
      expect(result.warning).toContain('exceeded');
    });

    it('should calculate remaining storage correctly', async () => {
      // 30 GB used, 50 GB limit
      const existingBytes = 30 * 1024 * 1024 * 1024;
      const mockOrg = createMockOrg({
        storageUsedBytes: existingBytes,
      });
      (mockRepos.organizations!.findWithPlan as any).mockResolvedValue(mockOrg);

      const fileSizeBytes = 1 * 1024 * 1024 * 1024;
      const result = await service.checkStorageLimit('org-123', fileSizeBytes);

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBeCloseTo(20, 0); // 50 - 30 = 20 GB
    });
  });

  // ==========================================================================
  // checkFeatureAccess
  // ==========================================================================

  describe('checkFeatureAccess', () => {
    describe('aiLevel', () => {
      it('should allow when AI level meets requirement', async () => {
        const mockOrg = createMockOrg({
          features: { ...defaultFeatures, aiLevel: 'advanced' },
        });
        (mockRepos.organizations!.findWithPlan as any).mockResolvedValue(mockOrg);

        const result = await service.checkFeatureAccess('org-123', 'aiLevel', 'basic');

        expect(result.allowed).toBe(true);
        expect(result.currentLevel).toBe('advanced');
        expect(result.requiredLevel).toBe('basic');
      });

      it('should deny when AI level is insufficient', async () => {
        const mockOrg = createMockOrg({
          features: { ...defaultFeatures, aiLevel: 'none' },
        });
        (mockRepos.organizations!.findWithPlan as any).mockResolvedValue(mockOrg);

        const result = await service.checkFeatureAccess('org-123', 'aiLevel', 'basic');

        expect(result.allowed).toBe(false);
      });

      it('should allow full level to access advanced features', async () => {
        const mockOrg = createMockOrg({
          features: { ...defaultFeatures, aiLevel: 'full' },
        });
        (mockRepos.organizations!.findWithPlan as any).mockResolvedValue(mockOrg);

        const result = await service.checkFeatureAccess('org-123', 'aiLevel', 'advanced');

        expect(result.allowed).toBe(true);
        expect(result.currentLevel).toBe('full');
      });

      it('should allow exact match of AI level', async () => {
        const mockOrg = createMockOrg({
          features: { ...defaultFeatures, aiLevel: 'basic' },
        });
        (mockRepos.organizations!.findWithPlan as any).mockResolvedValue(mockOrg);

        const result = await service.checkFeatureAccess('org-123', 'aiLevel', 'basic');

        expect(result.allowed).toBe(true);
      });

      it('should deny basic level for advanced requirement', async () => {
        const mockOrg = createMockOrg({
          features: { ...defaultFeatures, aiLevel: 'basic' },
        });
        (mockRepos.organizations!.findWithPlan as any).mockResolvedValue(mockOrg);

        const result = await service.checkFeatureAccess('org-123', 'aiLevel', 'advanced');

        expect(result.allowed).toBe(false);
        expect(result.currentLevel).toBe('basic');
        expect(result.requiredLevel).toBe('advanced');
      });

      it('should deny none level for any AI feature', async () => {
        const mockOrg = createMockOrg({
          features: { ...defaultFeatures, aiLevel: 'none' },
        });
        (mockRepos.organizations!.findWithPlan as any).mockResolvedValue(mockOrg);

        const result = await service.checkFeatureAccess('org-123', 'aiLevel', 'full');

        expect(result.allowed).toBe(false);
      });

      it('should default to basic requirement when not specified', async () => {
        const mockOrg = createMockOrg({
          features: { ...defaultFeatures, aiLevel: 'basic' },
        });
        (mockRepos.organizations!.findWithPlan as any).mockResolvedValue(mockOrg);

        const result = await service.checkFeatureAccess('org-123', 'aiLevel');

        expect(result.allowed).toBe(true);
      });
    });

    describe('customBranding', () => {
      it('should allow when custom branding is enabled', async () => {
        const mockOrg = createMockOrg({
          features: { ...defaultFeatures, customBranding: true },
        });
        (mockRepos.organizations!.findWithPlan as any).mockResolvedValue(mockOrg);

        const result = await service.checkFeatureAccess('org-123', 'customBranding');

        expect(result.allowed).toBe(true);
      });

      it('should deny when custom branding is disabled', async () => {
        const mockOrg = createMockOrg({
          features: { ...defaultFeatures, customBranding: false },
        });
        (mockRepos.organizations!.findWithPlan as any).mockResolvedValue(mockOrg);

        const result = await service.checkFeatureAccess('org-123', 'customBranding');

        expect(result.allowed).toBe(false);
      });
    });

    describe('module', () => {
      it('should allow when module is included', async () => {
        const mockOrg = createMockOrg({
          features: { ...defaultFeatures, modules: ['workspace', 'billing'] },
        });
        (mockRepos.organizations!.findWithPlan as any).mockResolvedValue(mockOrg);

        const result = await service.checkFeatureAccess('org-123', 'module', 'workspace');

        expect(result.allowed).toBe(true);
      });

      it('should deny when module is not included', async () => {
        const mockOrg = createMockOrg({
          features: { ...defaultFeatures, modules: ['dashboard'] },
        });
        (mockRepos.organizations!.findWithPlan as any).mockResolvedValue(mockOrg);

        const result = await service.checkFeatureAccess('org-123', 'module', 'workspace');

        expect(result.allowed).toBe(false);
      });

      it('should deny when no module specified', async () => {
        const mockOrg = createMockOrg({
          features: { ...defaultFeatures, modules: ['dashboard'] },
        });
        (mockRepos.organizations!.findWithPlan as any).mockResolvedValue(mockOrg);

        const result = await service.checkFeatureAccess('org-123', 'module');

        expect(result.allowed).toBe(false);
        expect(result.feature).toBe('unknown');
      });
    });

    describe('sso', () => {
      it('should allow when SSO is enabled', async () => {
        const mockOrg = createMockOrg({
          features: { ...defaultFeatures, sso: true },
        });
        (mockRepos.organizations!.findWithPlan as any).mockResolvedValue(mockOrg);

        const result = await service.checkFeatureAccess('org-123', 'sso');

        expect(result.allowed).toBe(true);
        expect(result.feature).toBe('sso');
      });

      it('should deny when SSO is disabled', async () => {
        const mockOrg = createMockOrg({
          features: { ...defaultFeatures, sso: false },
        });
        (mockRepos.organizations!.findWithPlan as any).mockResolvedValue(mockOrg);

        const result = await service.checkFeatureAccess('org-123', 'sso');

        expect(result.allowed).toBe(false);
      });
    });

    it('should deny all features when no plan', async () => {
      const mockOrg = createMockOrg({ limits: null });
      mockOrg.plan = null;
      (mockRepos.organizations!.findWithPlan as any).mockResolvedValue(mockOrg);

      const result = await service.checkFeatureAccess('org-123', 'customBranding');

      expect(result.allowed).toBe(false);
    });
  });

  // ==========================================================================
  // getUsageStats
  // ==========================================================================

  describe('getUsageStats', () => {
    it('should return complete usage statistics', async () => {
      const mockOrg = createMockOrg({ seatUsed: 5 });
      (mockRepos.organizations!.findWithPlan as any).mockResolvedValue(mockOrg);
      (mockRepos.projects!.countByOrganization as any).mockResolvedValue(10);

      const stats = await service.getUsageStats('org-123');

      expect(stats.users.used).toBe(5);
      expect(stats.users.limit).toBe(10);
      expect(stats.users.percentage).toBe(50);
      expect(stats.projects.used).toBe(10);
      expect(stats.projects.limit).toBe(20);
      expect(stats.projects.percentage).toBe(50);
      expect(stats.features).toEqual(defaultFeatures);
      expect(stats.subscription?.planName).toBe('Professional');
    });

    it('should cap percentage at 100', async () => {
      const mockOrg = createMockOrg({ seatUsed: 15 }); // 15/10 = 150%
      (mockRepos.organizations!.findWithPlan as any).mockResolvedValue(mockOrg);

      const stats = await service.getUsageStats('org-123');

      expect(stats.users.percentage).toBe(100);
    });

    it('should return 0% for unlimited limits', async () => {
      const mockOrg = createMockOrg({
        seatUsed: 100,
        limits: { maxUsers: 0, maxProjects: 0, storageGB: 0 },
      });
      (mockRepos.organizations!.findWithPlan as any).mockResolvedValue(mockOrg);

      const stats = await service.getUsageStats('org-123');

      expect(stats.users.percentage).toBe(0);
      expect(stats.projects.percentage).toBe(0);
      expect(stats.storage.percentage).toBe(0);
    });

    it('should return accurate storage usage from bytes', async () => {
      // 25.5 GB used = 25.5 * 1024^3 bytes
      const storageBytes = 25.5 * 1024 * 1024 * 1024;
      const mockOrg = createMockOrg({
        storageUsedBytes: storageBytes,
      });
      (mockRepos.organizations!.findWithPlan as any).mockResolvedValue(mockOrg);

      const stats = await service.getUsageStats('org-123');

      expect(stats.storage.usedGB).toBeCloseTo(25.5, 1);
      expect(stats.storage.limitGB).toBe(50);
      expect(stats.storage.percentage).toBe(51); // 25.5/50 = 51%
    });

    it('should return null subscription for free tier', async () => {
      const mockOrg = createMockOrg({ limits: null });
      mockOrg.plan = null;
      (mockRepos.organizations!.findWithPlan as any).mockResolvedValue(mockOrg);

      const stats = await service.getUsageStats('org-123');

      expect(stats.subscription).toBeNull();
      expect(stats.features).toBeNull();
    });

    it('should return real subscription status from database', async () => {
      const mockOrg = createMockOrg({ seatUsed: 5 });
      (mockRepos.organizations!.findWithPlan as any).mockResolvedValue(mockOrg);
      mockSubscriptionsFindFirst.mockResolvedValue({
        status: 'trialing',
        cancelAtPeriodEnd: false,
        currentPeriodEnd: new Date('2025-12-31'),
        trialEnd: new Date('2025-01-15'),
      });

      const stats = await service.getUsageStats('org-123');

      expect(stats.subscription?.status).toBe('trialing');
      expect(stats.subscription?.planName).toBe('Professional');
    });

    it('should return past_due status for failed payment', async () => {
      const mockOrg = createMockOrg({ seatUsed: 5 });
      (mockRepos.organizations!.findWithPlan as any).mockResolvedValue(mockOrg);
      mockSubscriptionsFindFirst.mockResolvedValue({
        status: 'past_due',
        cancelAtPeriodEnd: false,
        currentPeriodEnd: new Date('2025-12-31'),
        trialEnd: null,
      });

      const stats = await service.getUsageStats('org-123');

      expect(stats.subscription?.status).toBe('past_due');
    });

    it('should return canceled status for canceled subscription', async () => {
      const mockOrg = createMockOrg({ seatUsed: 5 });
      (mockRepos.organizations!.findWithPlan as any).mockResolvedValue(mockOrg);
      mockSubscriptionsFindFirst.mockResolvedValue({
        status: 'canceled',
        cancelAtPeriodEnd: true,
        currentPeriodEnd: new Date('2025-12-31'),
        trialEnd: null,
      });

      const stats = await service.getUsageStats('org-123');

      expect(stats.subscription?.status).toBe('canceled');
    });

    it('should return none status when no subscription exists', async () => {
      const mockOrg = createMockOrg({ seatUsed: 5 });
      (mockRepos.organizations!.findWithPlan as any).mockResolvedValue(mockOrg);
      mockSubscriptionsFindFirst.mockResolvedValue(null); // No subscription record

      const stats = await service.getUsageStats('org-123');

      expect(stats.subscription?.status).toBe('none');
    });
  });

  // ==========================================================================
  // Cache behavior
  // ==========================================================================

  describe('caching', () => {
    it('should cache organization data', async () => {
      const mockOrg = createMockOrg();
      (mockRepos.organizations!.findWithPlan as any).mockResolvedValue(mockOrg);

      // First call - fetches from DB
      await service.checkUserLimit('org-123');
      expect(mockRepos.organizations!.findWithPlan).toHaveBeenCalledTimes(1);

      // Second call - uses cache
      await service.checkUserLimit('org-123');
      expect(mockRepos.organizations!.findWithPlan).toHaveBeenCalledTimes(1);
    });

    it('should invalidate cache when requested', async () => {
      const mockOrg = createMockOrg();
      (mockRepos.organizations!.findWithPlan as any).mockResolvedValue(mockOrg);

      await service.checkUserLimit('org-123');
      expect(mockRepos.organizations!.findWithPlan).toHaveBeenCalledTimes(1);

      service.invalidateCache('org-123');

      await service.checkUserLimit('org-123');
      expect(mockRepos.organizations!.findWithPlan).toHaveBeenCalledTimes(2);
    });

    it('should expire cache after TTL', async () => {
      const mockOrg = createMockOrg();
      (mockRepos.organizations!.findWithPlan as any).mockResolvedValue(mockOrg);

      await service.checkUserLimit('org-123');
      expect(mockRepos.organizations!.findWithPlan).toHaveBeenCalledTimes(1);

      // Wait for cache to expire (TTL is 100ms in tests)
      await new Promise((r) => setTimeout(r, 150));

      await service.checkUserLimit('org-123');
      expect(mockRepos.organizations!.findWithPlan).toHaveBeenCalledTimes(2);
    });

    it('should clear all cache entries', async () => {
      const mockOrg = createMockOrg();
      (mockRepos.organizations!.findWithPlan as any).mockResolvedValue(mockOrg);

      await service.checkUserLimit('org-123');
      await service.checkUserLimit('org-456');

      service.clearCache();

      await service.checkUserLimit('org-123');
      await service.checkUserLimit('org-456');

      // Should have fetched 4 times total
      expect(mockRepos.organizations!.findWithPlan).toHaveBeenCalledTimes(4);
    });
  });

  // ==========================================================================
  // Error handling
  // ==========================================================================

  describe('error handling', () => {
    it('should throw when organization not found', async () => {
      (mockRepos.organizations!.findWithPlan as any).mockResolvedValue(null);

      await expect(service.checkUserLimit('non-existent')).rejects.toThrow(
        'Organization not found'
      );
    });
  });
});
