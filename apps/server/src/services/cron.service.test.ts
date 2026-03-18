/**
 * Unit tests for CronService
 *
 * Tests the scheduled job functionality for trial notifications.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Use vi.hoisted() to create mock functions that are available when vi.mock runs.
 */
const { mockSubscriptionsFindMany, mockOrganizationsFindFirst, mockUsersFindFirst, mockUpdate } =
  vi.hoisted(() => ({
    mockSubscriptionsFindMany: vi.fn(),
    mockOrganizationsFindFirst: vi.fn(),
    mockUsersFindFirst: vi.fn(),
    mockUpdate: vi.fn(),
  }));

const mockEmailService = vi.hoisted(() => ({
  send: vi.fn().mockResolvedValue({ success: true }),
}));

// Mock dependencies - all from @revbrain/database (including drizzle utilities)
vi.mock('@revbrain/database', () => ({
  db: {
    query: {
      subscriptions: {
        findMany: mockSubscriptionsFindMany,
      },
      organizations: {
        findFirst: mockOrganizationsFindFirst,
      },
      users: {
        findFirst: mockUsersFindFirst,
      },
    },
    update: mockUpdate,
  },
  // Schema tables
  subscriptions: {
    id: 'id',
    status: 'status',
    trialEndingNotifiedAt: 'trial_ending_notified_at',
    trialEndedNotifiedAt: 'trial_ended_notified_at',
  },
  users: { organizationId: 'organization_id', role: 'role' },
  organizations: { id: 'id' },
  // Drizzle-orm utilities
  eq: vi.fn((...args) => ({ type: 'eq', args })),
  and: vi.fn((...args) => ({ type: 'and', args })),
  lte: vi.fn((...args) => ({ type: 'lte', args })),
  gte: vi.fn((...args) => ({ type: 'gte', args })),
  isNull: vi.fn((...args) => ({ type: 'isNull', args })),
  inArray: vi.fn((...args) => ({ type: 'inArray', args })),
  sql: vi.fn((strings, ...values) => ({ type: 'sql', strings, values })),
}));

vi.mock('../emails/index.ts', () => ({
  getEmailService: vi.fn(() => mockEmailService),
}));

vi.mock('../emails/templates/index.ts', () => ({
  renderTrialEndingEmail: vi.fn(() => '<html>Trial ending</html>'),
  renderTrialEndedEmail: vi.fn(() => '<html>Trial ended</html>'),
}));

vi.mock('../lib/env.ts', () => ({
  getEnv: vi.fn(() => 'http://localhost:5173'),
}));

vi.mock('../lib/logger.ts', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
}));

// Import after mocks
import { CronService } from './cron.service.ts';

describe('CronService', () => {
  let cronService: CronService;

  beforeEach(() => {
    vi.clearAllMocks();
    cronService = new CronService();
    mockEmailService.send.mockResolvedValue({ success: true });

    // Setup default update mock chain
    mockUpdate.mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      }),
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('runAllJobs', () => {
    it('should run all jobs and return aggregated results', async () => {
      // Mock no subscriptions to process
      mockSubscriptionsFindMany.mockResolvedValue([]);

      const result = await cronService.runAllJobs();

      expect(result).toHaveProperty('timestamp');
      expect(result.jobs).toHaveLength(2);
      expect(result.jobs[0].job).toBe('trial-ending-warnings');
      expect(result.jobs[1].job).toBe('trial-ended-notifications');
      expect(result.totalProcessed).toBe(0);
      expect(result.totalErrors).toBe(0);
    });

    it('should aggregate processed counts from all jobs', async () => {
      const now = new Date();
      const twoDaysFromNow = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000);

      // Mock trial ending subscriptions
      mockSubscriptionsFindMany
        .mockResolvedValueOnce([
          {
            id: 'sub-1',
            organizationId: 'org-1',
            status: 'trialing',
            trialEnd: twoDaysFromNow,
            trialEndingNotifiedAt: null,
            plan: { name: 'Pro', price: 49, interval: 'month' },
            organization: { id: 'org-1', name: 'Test Org' },
          },
        ])
        .mockResolvedValueOnce([]); // No expired trials

      // Mock org and user lookup
      mockOrganizationsFindFirst.mockResolvedValue({
        id: 'org-1',
        name: 'Test Org',
      });

      mockUsersFindFirst.mockResolvedValue({
        id: 'user-1',
        email: 'test@example.com',
        fullName: 'Test User',
        organizationId: 'org-1',
        role: 'contractor_ceo',
      });

      const result = await cronService.runAllJobs();

      expect(result.totalProcessed).toBe(1);
      expect(result.totalErrors).toBe(0);
    });
  });

  describe('processTrialEndingWarnings', () => {
    it('should process subscriptions ending in 1-3 days', async () => {
      const now = new Date();
      const twoDaysFromNow = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000);

      mockSubscriptionsFindMany.mockResolvedValue([
        {
          id: 'sub-1',
          organizationId: 'org-1',
          status: 'trialing',
          trialEnd: twoDaysFromNow,
          trialEndingNotifiedAt: null,
          plan: { name: 'Pro', price: 49, interval: 'month' },
          organization: { id: 'org-1', name: 'Test Org' },
        },
      ]);

      mockOrganizationsFindFirst.mockResolvedValue({
        id: 'org-1',
        name: 'Test Org',
      });

      mockUsersFindFirst.mockResolvedValue({
        id: 'user-1',
        email: 'test@example.com',
        fullName: 'Test User',
        organizationId: 'org-1',
        role: 'contractor_ceo',
      });

      const result = await cronService.processTrialEndingWarnings();

      expect(result.job).toBe('trial-ending-warnings');
      expect(result.processed).toBe(1);
      expect(result.errors).toBe(0);
      expect(mockEmailService.send).toHaveBeenCalledTimes(1);
      expect(mockEmailService.send).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'test@example.com',
          subject: expect.stringContaining('trial ends in'),
        })
      );
    });

    it('should skip subscriptions already notified', async () => {
      // Empty result because findMany filters out already notified
      mockSubscriptionsFindMany.mockResolvedValue([]);

      const result = await cronService.processTrialEndingWarnings();

      expect(result.processed).toBe(0);
      expect(mockEmailService.send).not.toHaveBeenCalled();
    });

    it('should skip subscriptions without a billing contact', async () => {
      const now = new Date();
      const twoDaysFromNow = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000);

      mockSubscriptionsFindMany.mockResolvedValue([
        {
          id: 'sub-1',
          organizationId: 'org-1',
          status: 'trialing',
          trialEnd: twoDaysFromNow,
          trialEndingNotifiedAt: null,
          plan: { name: 'Pro', price: 49, interval: 'month' },
          organization: { id: 'org-1', name: 'Test Org' },
        },
      ]);

      // No org found
      mockOrganizationsFindFirst.mockResolvedValue(null);

      const result = await cronService.processTrialEndingWarnings();

      expect(result.processed).toBe(0);
      expect(result.details).toContain('No contact for org org-1');
      expect(mockEmailService.send).not.toHaveBeenCalled();
    });

    it('should handle email sending errors gracefully', async () => {
      const now = new Date();
      const twoDaysFromNow = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000);

      mockSubscriptionsFindMany.mockResolvedValue([
        {
          id: 'sub-1',
          organizationId: 'org-1',
          status: 'trialing',
          trialEnd: twoDaysFromNow,
          trialEndingNotifiedAt: null,
          plan: { name: 'Pro', price: 49, interval: 'month' },
          organization: { id: 'org-1', name: 'Test Org' },
        },
      ]);

      mockOrganizationsFindFirst.mockResolvedValue({
        id: 'org-1',
        name: 'Test Org',
      });

      mockUsersFindFirst.mockResolvedValue({
        id: 'user-1',
        email: 'test@example.com',
        fullName: 'Test User',
        organizationId: 'org-1',
        role: 'contractor_ceo',
      });

      // Make email fail
      mockEmailService.send.mockRejectedValue(new Error('SMTP connection failed'));

      const result = await cronService.processTrialEndingWarnings();

      expect(result.processed).toBe(0);
      expect(result.errors).toBe(1);
      expect(result.details).toContainEqual(expect.stringContaining('Error for org org-1'));
    });

    it('should calculate days remaining correctly', async () => {
      const now = new Date();
      const threeDaysFromNow = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);

      mockSubscriptionsFindMany.mockResolvedValue([
        {
          id: 'sub-1',
          organizationId: 'org-1',
          status: 'trialing',
          trialEnd: threeDaysFromNow,
          trialEndingNotifiedAt: null,
          plan: { name: 'Business', price: 149, interval: 'month' },
          organization: { id: 'org-1', name: 'Test Org' },
        },
      ]);

      mockOrganizationsFindFirst.mockResolvedValue({
        id: 'org-1',
        name: 'Test Org',
      });

      mockUsersFindFirst.mockResolvedValue({
        id: 'user-1',
        email: 'test@example.com',
        fullName: 'Test User',
        organizationId: 'org-1',
        role: 'contractor_ceo',
      });

      await cronService.processTrialEndingWarnings();

      expect(mockEmailService.send).toHaveBeenCalledWith(
        expect.objectContaining({
          subject: expect.stringMatching(/trial ends in [34] days?/),
        })
      );
    });
  });

  describe('processTrialEndedNotifications', () => {
    it('should process expired trials from last 24 hours', async () => {
      const now = new Date();
      const yesterday = new Date(now.getTime() - 12 * 60 * 60 * 1000); // 12 hours ago

      mockSubscriptionsFindMany.mockResolvedValue([
        {
          id: 'sub-1',
          organizationId: 'org-1',
          status: 'trialing',
          trialEnd: yesterday,
          trialEndedNotifiedAt: null,
          plan: { name: 'Pro', price: 49, interval: 'month' },
          organization: { id: 'org-1', name: 'Test Org' },
        },
      ]);

      mockOrganizationsFindFirst.mockResolvedValue({
        id: 'org-1',
        name: 'Test Org',
      });

      mockUsersFindFirst.mockResolvedValue({
        id: 'user-1',
        email: 'test@example.com',
        fullName: 'Test User',
        organizationId: 'org-1',
        role: 'contractor_ceo',
      });

      const result = await cronService.processTrialEndedNotifications();

      expect(result.job).toBe('trial-ended-notifications');
      expect(result.processed).toBe(1);
      expect(result.errors).toBe(0);
      expect(mockEmailService.send).toHaveBeenCalledTimes(1);
      expect(mockEmailService.send).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'test@example.com',
          subject: 'Your trial has ended - subscribe to continue',
        })
      );
    });

    it('should skip already notified expired trials', async () => {
      mockSubscriptionsFindMany.mockResolvedValue([]);

      const result = await cronService.processTrialEndedNotifications();

      expect(result.processed).toBe(0);
      expect(mockEmailService.send).not.toHaveBeenCalled();
    });

    it('should handle database errors gracefully', async () => {
      mockSubscriptionsFindMany.mockRejectedValue(new Error('Database connection lost'));

      const result = await cronService.processTrialEndedNotifications();

      expect(result.processed).toBe(0);
      expect(result.errors).toBe(1);
      expect(result.details).toContainEqual(expect.stringContaining('Job failed'));
    });

    it('should process subscriptions with past_due status', async () => {
      const now = new Date();
      const yesterday = new Date(now.getTime() - 6 * 60 * 60 * 1000); // 6 hours ago

      mockSubscriptionsFindMany.mockResolvedValue([
        {
          id: 'sub-1',
          organizationId: 'org-1',
          status: 'past_due', // Trial ended, payment failed
          trialEnd: yesterday,
          trialEndedNotifiedAt: null,
          plan: { name: 'Pro', price: 49, interval: 'month' },
          organization: { id: 'org-1', name: 'Test Org' },
        },
      ]);

      mockOrganizationsFindFirst.mockResolvedValue({
        id: 'org-1',
        name: 'Test Org',
      });

      mockUsersFindFirst.mockResolvedValue({
        id: 'user-1',
        email: 'test@example.com',
        fullName: 'Test User',
        organizationId: 'org-1',
        role: 'client_owner',
      });

      const result = await cronService.processTrialEndedNotifications();

      expect(result.processed).toBe(1);
      expect(mockEmailService.send).toHaveBeenCalledTimes(1);
    });
  });

  describe('getBillingContact (via integration)', () => {
    it('should prefer admin users over regular users', async () => {
      const now = new Date();
      const twoDaysFromNow = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000);

      mockSubscriptionsFindMany.mockResolvedValue([
        {
          id: 'sub-1',
          organizationId: 'org-1',
          status: 'trialing',
          trialEnd: twoDaysFromNow,
          trialEndingNotifiedAt: null,
          plan: { name: 'Pro', price: 49, interval: 'month' },
          organization: { id: 'org-1', name: 'Test Org' },
        },
      ]);

      mockOrganizationsFindFirst.mockResolvedValue({
        id: 'org-1',
        name: 'Test Org',
      });

      // First call returns admin user
      mockUsersFindFirst.mockResolvedValue({
        id: 'admin-1',
        email: 'admin@example.com',
        fullName: 'Admin User',
        organizationId: 'org-1',
        role: 'contractor_ceo',
      });

      await cronService.processTrialEndingWarnings();

      expect(mockEmailService.send).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'admin@example.com',
        })
      );
    });

    it('should fallback to any user if no admin found', async () => {
      const now = new Date();
      const twoDaysFromNow = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000);

      mockSubscriptionsFindMany.mockResolvedValue([
        {
          id: 'sub-1',
          organizationId: 'org-1',
          status: 'trialing',
          trialEnd: twoDaysFromNow,
          trialEndingNotifiedAt: null,
          plan: { name: 'Pro', price: 49, interval: 'month' },
          organization: { id: 'org-1', name: 'Test Org' },
        },
      ]);

      mockOrganizationsFindFirst.mockResolvedValue({
        id: 'org-1',
        name: 'Test Org',
      });

      // First call (admin roles) returns null, second returns regular user
      mockUsersFindFirst
        .mockResolvedValueOnce(null) // No admin
        .mockResolvedValueOnce({
          id: 'user-1',
          email: 'regular@example.com',
          fullName: 'Regular User',
          organizationId: 'org-1',
          role: 'contractor_member',
        });

      await cronService.processTrialEndingWarnings();

      expect(mockEmailService.send).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'regular@example.com',
        })
      );
    });
  });
});
