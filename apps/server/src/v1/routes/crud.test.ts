import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { plansRouter } from './plans';
import { adminRouter } from './admin';
import { orgRouter } from './org';
import { AppError } from '@revbrain/contract';

// --- Mocks ---

vi.mock('../../middleware/auth', () => ({
  authMiddleware: vi.fn(async (c: any, next: any) => {
    await next();
  }),
  authMiddlewareAllowInactive: vi.fn(async (c: any, next: any) => {
    await next();
  }),
}));

vi.mock('../../middleware/rate-limit', () => ({
  adminLimiter: vi.fn(async (c: any, next: any) => {
    await next();
  }),
  orgLimiter: vi.fn(async (c: any, next: any) => {
    await next();
  }),
  inviteLimiter: vi.fn(async (c: any, next: any) => {
    await next();
  }),
  listLimiter: vi.fn(async (c: any, next: any) => {
    await next();
  }),
}));

vi.mock('../../middleware/rbac', () => ({
  requireRole: vi.fn((...allowedRoles: string[]) => async (c: any, next: any) => {
    const user = c.get('user');
    if (!user) throw new AppError('UNAUTHORIZED', 'Auth required', 401);
    if (!allowedRoles.includes(user.role)) {
      throw new AppError('FORBIDDEN', 'Access denied', 403);
    }
    await next();
  }),
  canInviteRole: vi.fn(() => true),
}));

// Track whether limits should fail for specific tests
let limitsCheckShouldFail = false;
let limitsErrorCode = 'USER_LIMIT_EXCEEDED';
let limitsErrorMessage = 'User limit reached';

vi.mock('../../middleware/limits', () => ({
  requireUserCapacity: vi.fn(() => async (c: any, next: any) => {
    if (limitsCheckShouldFail) {
      throw new AppError(limitsErrorCode, limitsErrorMessage, 403);
    }
    await next();
  }),
  requireProjectCapacity: vi.fn(() => async (c: any, next: any) => {
    if (limitsCheckShouldFail) {
      throw new AppError(limitsErrorCode, limitsErrorMessage, 403);
    }
    await next();
  }),
  requireActiveSubscription: vi.fn(() => async (c: any, next: any) => {
    await next();
  }),
  requireFeature: vi.fn(() => async (c: any, next: any) => {
    await next();
  }),
  requireStorageCapacity: vi.fn(() => async (c: any, next: any) => {
    await next();
  }),
}));

// Export helpers to control limits behavior in tests
export function setLimitsCheckFail(
  fail: boolean,
  code = 'USER_LIMIT_EXCEEDED',
  message = 'User limit reached'
) {
  limitsCheckShouldFail = fail;
  limitsErrorCode = code;
  limitsErrorMessage = message;
}

// --- Mock Factories ---

function createMockRepos() {
  return {
    plans: {
      findMany: vi.fn(() => Promise.resolve([{ id: '1', name: 'P1' }])),
      findPublic: vi.fn(() => Promise.resolve([{ id: '1', name: 'P1', isPublic: true }])),
      findByCode: vi.fn(() => Promise.resolve(null)),
      findByName: vi.fn(() => Promise.resolve(null)),
      findById: vi.fn(() => Promise.resolve({ id: '1', name: 'P1' })),
      create: vi.fn((data: any) =>
        Promise.resolve({ id: 'new-id', ...data, createdAt: new Date(), updatedAt: new Date() })
      ),
      update: vi.fn((id: string, data: any) =>
        Promise.resolve({ id, ...data, updatedAt: new Date() })
      ),
      delete: vi.fn(() => Promise.resolve(true)),
      count: vi.fn(() => Promise.resolve(0)),
      findActive: vi.fn(() => Promise.resolve([])),
    },
    organizations: {
      findById: vi.fn(() =>
        Promise.resolve({
          id: 'o1',
          name: 'Test Org',
          type: 'business',
          seatLimit: 10,
          seatUsed: 1,
        })
      ),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    users: {
      findById: vi.fn(),
      findByEmail: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    auditLogs: {
      create: vi.fn(),
    },
    projects: {},
  };
}

function createMockServices() {
  return {
    auth: {
      inviteUser: vi.fn(() => Promise.resolve({ userId: 'sb-id', email: 'test@example.com' })),
      deleteUser: vi.fn(() => Promise.resolve()),
      updatePassword: vi.fn(() => Promise.resolve()),
      emailExists: vi.fn(() => Promise.resolve(false)),
    },
    users: {
      inviteUser: vi.fn(() =>
        Promise.resolve({
          user: { id: 'new-user', email: 'u@te.com', fullName: 'User', role: 'admin' },
          seatsRemaining: 5,
        })
      ),
      deleteUser: vi.fn(() => Promise.resolve()),
      updateProfile: vi.fn(),
      adminUpdateUser: vi.fn(),
      changePassword: vi.fn(),
      activateUser: vi.fn(),
      recordLogin: vi.fn(),
      listUsers: vi.fn(() => Promise.resolve([])),
      listOrgUsers: vi.fn(() => Promise.resolve({ users: [], hasMore: false })),
      resendInvite: vi.fn(),
    },
    organizations: {
      listTenants: vi.fn(() => Promise.resolve([])),
      updateTenant: vi.fn(),
      deactivateTenant: vi.fn(),
      generateUniqueSlug: vi.fn(() => Promise.resolve('test-slug')),
      getOrCreatePlatformOrg: vi.fn(),
    },
    onboarding: {
      onboardOrganization: vi.fn(() =>
        Promise.resolve({
          organization: { id: 'org-1', name: 'New Corp', slug: 'new-corp' },
          admin: { id: 'user-1', email: 'a@te.com', fullName: 'Admin' },
          invitationSent: true,
        })
      ),
    },
  };
}

// --- Test Setup ---

let mockRepos: ReturnType<typeof createMockRepos>;
let mockServices: ReturnType<typeof createMockServices>;

function createTestApp() {
  const app = new Hono<any>();

  // Error Handler
  app.onError((err, c) => {
    if (err instanceof AppError) {
      return c.json(
        { success: false, error: { code: err.code, message: err.message } },
        err.statusCode as any
      );
    }
    console.error('Test App Error:', err);
    const status = (err as any).status || (err as any).statusCode || 500;
    return c.json({ success: false, error: { message: err.message } }, status);
  });

  // Context Injector — simulates auth + repo/service middleware
  app.use('*', async (c, next) => {
    const userJson = c.req.header('x-test-user');
    if (userJson) {
      c.set('user', JSON.parse(userJson));
    }
    c.set('repos', mockRepos as any);
    c.set('services', mockServices as any);
    await next();
  });

  app.route('/plans', plansRouter);
  app.route('/admin', adminRouter);
  app.route('/org', orgRouter);

  return app;
}

describe('CRUD API Unit Tests', () => {
  let app: Hono<any>;

  beforeEach(() => {
    mockRepos = createMockRepos();
    mockServices = createMockServices();
    app = createTestApp();
    vi.clearAllMocks();
  });

  describe('Plans', () => {
    it('GET /plans - system_admin should see all plans with pagination', async () => {
      const res = await app.request('/plans', {
        headers: { 'x-test-user': JSON.stringify({ role: 'system_admin' }) },
      });
      expect(res.status).toBe(200);
      expect(mockRepos.plans.findMany).toHaveBeenCalledWith({
        orderBy: { field: 'price', direction: 'desc' },
        limit: 51, // Default limit + 1 for hasMore check
        offset: 0,
      });
    });

    it('GET /plans - non-admin should see only public plans with pagination', async () => {
      const res = await app.request('/plans', {
        headers: { 'x-test-user': JSON.stringify({ role: 'admin' }) },
      });
      expect(res.status).toBe(200);
      expect(mockRepos.plans.findPublic).toHaveBeenCalledWith({
        limit: 51, // Default limit + 1 for hasMore check
        offset: 0,
      });
    });

    it('POST /plans - should allow system_admin to create plan with full schema', async () => {
      const planData = {
        name: 'Pro Plan',
        code: 'pro-test',
        price: 9900,
        limits: { maxUsers: 10, maxProjects: 5, storageGB: 50 },
        features: {
          aiLevel: 'basic',
          modules: ['cpq_migration'],
          customBranding: true,
          sso: false,
        },
      };

      const res = await app.request('/plans', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-test-user': JSON.stringify({ role: 'system_admin' }),
        },
        body: JSON.stringify(planData),
      });
      expect(res.status).toBe(201);
      expect(mockRepos.plans.findByCode).toHaveBeenCalledWith('pro-test');
      expect(mockRepos.plans.create).toHaveBeenCalled();
    });

    it('POST /plans - should block invalid schema (missing features)', async () => {
      const res = await app.request('/plans', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-test-user': JSON.stringify({ role: 'system_admin' }),
        },
        body: JSON.stringify({ name: 'Invalid' }),
      });
      expect(res.status).toBe(400);
    });

    it('POST /plans - should block non-admin', async () => {
      const res = await app.request('/plans', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-test-user': JSON.stringify({ role: 'admin' }),
        },
        body: JSON.stringify({ name: 'Plan' }),
      });
      expect(res.status).toBe(403);
    });
  });

  describe('Admin Onboarding', () => {
    it('POST /admin/onboard - system_admin creates organization', async () => {
      const res = await app.request('/admin/onboard', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-test-user': JSON.stringify({
            id: 'actor-1',
            email: 'admin@test.com',
            role: 'system_admin',
          }),
        },
        body: JSON.stringify({
          organization: { name: 'New Corp', seatLimit: 10 },
          admin: { email: 'a@te.com', fullName: 'Admin', role: 'org_owner' },
        }),
      });
      expect(res.status).toBe(201);
      expect(mockServices.onboarding.onboardOrganization).toHaveBeenCalled();
    });
  });

  describe('Organization User Management', () => {
    it('POST /org/invite - org admin invites user', async () => {
      const res = await app.request('/org/invite', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-test-user': JSON.stringify({
            id: 'actor-1',
            email: 'ceo@test.com',
            role: 'org_owner',
            organizationId: 'o1',
          }),
        },
        body: JSON.stringify({
          email: 'u@te.com',
          fullName: 'User',
          role: 'admin',
        }),
      });
      expect(res.status).toBe(201);
      expect(mockServices.users.inviteUser).toHaveBeenCalled();
    });

    it('POST /org/invite - fails if seat limit reached', async () => {
      // Enable limits check failure via middleware mock
      setLimitsCheckFail(true, 'USER_LIMIT_EXCEEDED', 'User limit reached');

      const res = await app.request('/org/invite', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-test-user': JSON.stringify({
            id: 'actor-1',
            email: 'ceo@test.com',
            role: 'org_owner',
            organizationId: 'o1',
          }),
        },
        body: JSON.stringify({
          email: 'u@te.com',
          fullName: 'User',
          role: 'admin',
        }),
      });

      // Reset limits check for other tests
      setLimitsCheckFail(false);

      expect(res.status).toBe(403);
      const body = (await res.json()) as any;
      expect(body.error.code).toBe('USER_LIMIT_EXCEEDED');
    });
  });
});
