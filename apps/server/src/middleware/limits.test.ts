import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { AppError } from '@revbrain/contract';
import {
  requireUserCapacity,
  requireProjectCapacity,
  requireFeature,
  requireActiveSubscription,
  requireStorageCapacity,
} from './limits.ts';

// Mock logger
vi.mock('../lib/logger.ts', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
  },
}));

describe('Limits Middleware', () => {
  let app: Hono<any>;

  let mockLimitsService: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockLimitsService = {
      checkUserLimit: vi.fn(),
      checkProjectLimit: vi.fn(),
      checkStorageLimit: vi.fn(),
      checkFeatureAccess: vi.fn(),
      getUsageStats: vi.fn(),
    };

    app = new Hono();

    // Mock context setup - cast to any to avoid strict type checking in tests

    app.use('*', async (c: any, next) => {
      c.set('user', {
        id: 'user-123',
        email: 'test@example.com',
        role: 'org_owner',
        organizationId: 'org-123',
      });
      c.set('services', { limits: mockLimitsService });
      await next();
    });

    // Error handler
    app.onError((err, c) => {
      if (err instanceof AppError) {
        return c.json(
          { success: false, error: { code: err.code, message: err.message } },
          err.statusCode as any
        );
      }
      return c.json({ success: false, error: { message: err.message } }, 500);
    });
  });

  describe('requireUserCapacity', () => {
    it('should pass when user capacity is available', async () => {
      mockLimitsService.checkUserLimit.mockResolvedValue({
        allowed: true,
        currentUsage: 5,
        limit: 10,
        remaining: 5,
      });

      app.post('/test', requireUserCapacity(), (c) => c.json({ success: true }));

      const res = await app.request('/test', { method: 'POST' });
      expect(res.status).toBe(200);
    });

    it('should block when user limit exceeded', async () => {
      mockLimitsService.checkUserLimit.mockResolvedValue({
        allowed: false,
        currentUsage: 11,
        limit: 10,
        remaining: 0,
        warning: 'User limit exceeded',
      });

      app.post('/test', requireUserCapacity(), (c) => c.json({ success: true }));

      const res = await app.request('/test', { method: 'POST' });
      expect(res.status).toBe(403);
      const body = (await res.json()) as { error?: { code: string } };
      expect(body.error?.code).toBe('USER_LIMIT_EXCEEDED');
    });

    it('should add warning header when approaching limit', async () => {
      mockLimitsService.checkUserLimit.mockResolvedValue({
        allowed: true,
        currentUsage: 8,
        limit: 10,
        remaining: 2,
        warning: 'Approaching user limit',
        graceActive: false,
      });

      app.post('/test', requireUserCapacity(), (c) => c.json({ success: true }));

      const res = await app.request('/test', { method: 'POST' });
      expect(res.status).toBe(200);
      expect(res.headers.get('X-Limits-Warning')).toBe('Approaching user limit');
    });

    it('should require authentication', async () => {
      app = new Hono();

      app.use('*', async (c: any, next) => {
        // No user set - testing auth requirement
        c.set('services', { limits: mockLimitsService } as any);
        await next();
      });
      app.onError((err, c) => {
        if (err instanceof AppError) {
          return c.json(
            { success: false, error: { code: err.code, message: err.message } },
            err.statusCode as any
          );
        }
        return c.json({ success: false, error: { message: err.message } }, 500);
      });

      app.post('/test', requireUserCapacity(), (c) => c.json({ success: true }));

      const res = await app.request('/test', { method: 'POST' });
      expect(res.status).toBe(401);
    });
  });

  describe('requireProjectCapacity', () => {
    it('should pass when project capacity is available', async () => {
      mockLimitsService.checkProjectLimit.mockResolvedValue({
        allowed: true,
        currentUsage: 5,
        limit: 20,
        remaining: 15,
      });

      app.post('/test', requireProjectCapacity(), (c) => c.json({ success: true }));

      const res = await app.request('/test', { method: 'POST' });
      expect(res.status).toBe(200);
    });

    it('should block when project limit exceeded', async () => {
      mockLimitsService.checkProjectLimit.mockResolvedValue({
        allowed: false,
        currentUsage: 22,
        limit: 20,
        remaining: 0,
        warning: 'Project limit exceeded',
      });

      app.post('/test', requireProjectCapacity(), (c) => c.json({ success: true }));

      const res = await app.request('/test', { method: 'POST' });
      expect(res.status).toBe(403);
      const body = (await res.json()) as { error?: { code: string } };
      expect(body.error?.code).toBe('PROJECT_LIMIT_EXCEEDED');
    });
  });

  describe('requireFeature', () => {
    it('should pass when feature is allowed', async () => {
      mockLimitsService.checkFeatureAccess.mockResolvedValue({
        allowed: true,
        feature: 'aiLevel',
        currentLevel: 'advanced',
        requiredLevel: 'basic',
      });

      app.post('/test', requireFeature('aiLevel', 'basic'), (c) => c.json({ success: true }));

      const res = await app.request('/test', { method: 'POST' });
      expect(res.status).toBe(200);
    });

    it('should block when feature not available', async () => {
      mockLimitsService.checkFeatureAccess.mockResolvedValue({
        allowed: false,
        feature: 'aiLevel',
        currentLevel: 'none',
        requiredLevel: 'basic',
      });

      app.post('/test', requireFeature('aiLevel', 'basic'), (c) => c.json({ success: true }));

      const res = await app.request('/test', { method: 'POST' });
      expect(res.status).toBe(403);
      const body = (await res.json()) as { error?: { code: string } };
      expect(body.error?.code).toBe('FEATURE_NOT_AVAILABLE');
    });
  });

  describe('requireActiveSubscription', () => {
    it('should pass for active subscription', async () => {
      mockLimitsService.getUsageStats.mockResolvedValue({
        subscription: { status: 'active', planName: 'Pro' },
      });

      app.post('/test', requireActiveSubscription(), (c) => c.json({ success: true }));

      const res = await app.request('/test', { method: 'POST' });
      expect(res.status).toBe(200);
    });

    it('should pass for trialing subscription', async () => {
      mockLimitsService.getUsageStats.mockResolvedValue({
        subscription: { status: 'trialing', planName: 'Pro' },
      });

      app.post('/test', requireActiveSubscription(), (c) => c.json({ success: true }));

      const res = await app.request('/test', { method: 'POST' });
      expect(res.status).toBe(200);
    });

    it('should pass for free tier (no subscription)', async () => {
      mockLimitsService.getUsageStats.mockResolvedValue({
        subscription: null,
      });

      app.post('/test', requireActiveSubscription(), (c) => c.json({ success: true }));

      const res = await app.request('/test', { method: 'POST' });
      expect(res.status).toBe(200);
    });

    it('should block for past_due subscription', async () => {
      mockLimitsService.getUsageStats.mockResolvedValue({
        subscription: { status: 'past_due', planName: 'Pro' },
      });

      app.post('/test', requireActiveSubscription(), (c) => c.json({ success: true }));

      const res = await app.request('/test', { method: 'POST' });
      expect(res.status).toBe(402);
      const body = (await res.json()) as { error?: { code: string } };
      expect(body.error?.code).toBe('SUBSCRIPTION_PAST_DUE');
    });

    it('should block for canceled subscription', async () => {
      mockLimitsService.getUsageStats.mockResolvedValue({
        subscription: { status: 'canceled', planName: 'Pro' },
      });

      app.post('/test', requireActiveSubscription(), (c) => c.json({ success: true }));

      const res = await app.request('/test', { method: 'POST' });
      expect(res.status).toBe(402);
      const body = (await res.json()) as { error?: { code: string } };
      expect(body.error?.code).toBe('SUBSCRIPTION_REQUIRED');
    });

    it('should skip check for system_admin', async () => {
      app = new Hono();

      app.use('*', async (c: any, next) => {
        c.set('user', {
          id: 'admin-123',
          email: 'admin@example.com',
          role: 'system_admin',
          organizationId: 'platform',
        });
        c.set('services', { limits: mockLimitsService });
        await next();
      });

      app.post('/test', requireActiveSubscription(), (c) => c.json({ success: true }));

      const res = await app.request('/test', { method: 'POST' });
      expect(res.status).toBe(200);
      // Should not call getUsageStats for admin
      expect(mockLimitsService.getUsageStats).not.toHaveBeenCalled();
    });
  });

  describe('requireStorageCapacity', () => {
    it('should pass when storage capacity is available', async () => {
      mockLimitsService.checkStorageLimit.mockResolvedValue({
        allowed: true,
        currentUsage: 10,
        limit: 50,
        remaining: 40,
      });

      app.post('/test', requireStorageCapacity(), (c) => c.json({ success: true }));

      const res = await app.request('/test', {
        method: 'POST',
        headers: { 'Content-Length': '1048576' }, // 1 MB
      });
      expect(res.status).toBe(200);
    });

    it('should block when storage limit exceeded', async () => {
      mockLimitsService.checkStorageLimit.mockResolvedValue({
        allowed: false,
        currentUsage: 49,
        limit: 50,
        remaining: 1,
        warning: 'Storage limit exceeded',
      });

      app.post('/test', requireStorageCapacity(), (c) => c.json({ success: true }));

      const res = await app.request('/test', {
        method: 'POST',
        headers: { 'Content-Length': '5368709120' }, // 5 GB
      });
      expect(res.status).toBe(403);
      const body = (await res.json()) as { error?: { code: string } };
      expect(body.error?.code).toBe('STORAGE_LIMIT_EXCEEDED');
    });

    it('should pass when no Content-Length header', async () => {
      // If no content length, we can't check storage - let it through
      app.post('/test', requireStorageCapacity(), (c) => c.json({ success: true }));

      const res = await app.request('/test', { method: 'POST' });
      expect(res.status).toBe(200);
      expect(mockLimitsService.checkStorageLimit).not.toHaveBeenCalled();
    });
  });
});
