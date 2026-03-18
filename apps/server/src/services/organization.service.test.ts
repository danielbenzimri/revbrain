/**
 * Unit tests for OrganizationService
 *
 * Tests slug generation, tenant CRUD, audit logging, and platform org creation.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Create mock repository functions via vi.hoisted
const {
  mockOrgsFindBySlug,
  mockOrgsFindMany,
  mockOrgsFindById,
  mockOrgsFindWithPlan,
  mockOrgsCreate,
  mockOrgsUpdate,
  mockOrgsDelete,
  mockAuditLogsCreate,
} = vi.hoisted(() => ({
  mockOrgsFindBySlug: vi.fn(),
  mockOrgsFindMany: vi.fn(),
  mockOrgsFindById: vi.fn(),
  mockOrgsFindWithPlan: vi.fn(),
  mockOrgsCreate: vi.fn(),
  mockOrgsUpdate: vi.fn(),
  mockOrgsDelete: vi.fn(),
  mockAuditLogsCreate: vi.fn(),
}));

// Mock crypto.randomUUID for deterministic slug suffixes
vi.stubGlobal('crypto', {
  randomUUID: vi.fn(() => 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'),
});

// Build mock repositories
function createMockRepos() {
  return {
    organizations: {
      findBySlug: mockOrgsFindBySlug,
      findMany: mockOrgsFindMany,
      findById: mockOrgsFindById,
      findWithPlan: mockOrgsFindWithPlan,
      create: mockOrgsCreate,
      update: mockOrgsUpdate,
      delete: mockOrgsDelete,
    },
    auditLogs: {
      create: mockAuditLogsCreate,
    },
  } as any;
}

import { OrganizationService } from './organization.service.ts';

describe('OrganizationService', () => {
  let orgService: OrganizationService;

  beforeEach(() => {
    vi.clearAllMocks();
    orgService = new OrganizationService(createMockRepos());
  });

  // =========================================================================
  // generateUniqueSlug
  // =========================================================================
  describe('generateUniqueSlug', () => {
    it('should generate a clean slug from org name', async () => {
      mockOrgsFindBySlug.mockResolvedValue(null); // No collision

      const slug = await orgService.generateUniqueSlug('My Test Org');
      expect(slug).toBe('my-test-org');
    });

    it('should remove special characters', async () => {
      mockOrgsFindBySlug.mockResolvedValue(null);

      const slug = await orgService.generateUniqueSlug('Org (Test) #1!');
      expect(slug).toBe('org-test-1');
    });

    it('should trim leading and trailing hyphens', async () => {
      mockOrgsFindBySlug.mockResolvedValue(null);

      const slug = await orgService.generateUniqueSlug('---my org---');
      expect(slug).toBe('my-org');
    });

    it('should truncate long names to 50 chars', async () => {
      mockOrgsFindBySlug.mockResolvedValue(null);

      const longName = 'A'.repeat(100);
      const slug = await orgService.generateUniqueSlug(longName);
      expect(slug.length).toBeLessThanOrEqual(50);
    });

    it('should append suffix when slug already exists', async () => {
      mockOrgsFindBySlug.mockResolvedValue({ id: 'existing-org' }); // Collision

      const slug = await orgService.generateUniqueSlug('My Org');
      expect(slug).toBe('my-org-a1b2c3');
      expect(mockOrgsFindBySlug).toHaveBeenCalledWith('my-org');
    });
  });

  // =========================================================================
  // listTenants
  // =========================================================================
  describe('listTenants', () => {
    it('should return tenants with pagination', async () => {
      const mockTenants = [
        { id: 'org-1', name: 'Org A', planId: null },
        { id: 'org-2', name: 'Org B', planId: null },
      ];
      mockOrgsFindMany.mockResolvedValue(mockTenants);

      const result = await orgService.listTenants({ limit: 10, offset: 0 });

      expect(result.tenants).toHaveLength(2);
      expect(result.hasMore).toBe(false);
      expect(mockOrgsFindMany).toHaveBeenCalledWith({
        limit: 11, // limit + 1 for hasMore
        offset: 0,
        orderBy: { field: 'name', direction: 'asc' },
      });
    });

    it('should set hasMore=true when more results exist', async () => {
      // Return 3 items when limit is 2 (3 > limit means hasMore)
      const mockTenants = [
        { id: 'org-1', name: 'A', planId: null },
        { id: 'org-2', name: 'B', planId: null },
        { id: 'org-3', name: 'C', planId: null },
      ];
      mockOrgsFindMany.mockResolvedValue(mockTenants);

      const result = await orgService.listTenants({ limit: 2, offset: 0 });

      expect(result.tenants).toHaveLength(2);
      expect(result.hasMore).toBe(true);
    });

    it('should load plan details for tenants with planId', async () => {
      const tenantWithPlan = { id: 'org-1', name: 'Pro Org', planId: 'plan-1' };
      const tenantWithPlanData = {
        ...tenantWithPlan,
        plan: { id: 'plan-1', name: 'Pro' },
      };

      mockOrgsFindMany.mockResolvedValue([tenantWithPlan]);
      mockOrgsFindWithPlan.mockResolvedValue(tenantWithPlanData);

      const result = await orgService.listTenants({ limit: 10, offset: 0 });

      expect(result.tenants[0].plan).toEqual({ id: 'plan-1', name: 'Pro' });
      expect(mockOrgsFindWithPlan).toHaveBeenCalledWith('org-1');
    });

    it('should set plan=null when planId is missing', async () => {
      mockOrgsFindMany.mockResolvedValue([{ id: 'org-1', name: 'Free Org', planId: null }]);

      const result = await orgService.listTenants({ limit: 10, offset: 0 });

      expect(result.tenants[0].plan).toBeNull();
    });
  });

  // =========================================================================
  // updateTenant
  // =========================================================================
  describe('updateTenant', () => {
    const ctx = {
      actorId: 'user-1',
      ipAddress: '127.0.0.1',
      userAgent: 'test-agent',
    };

    it('should update tenant and create audit log', async () => {
      const existing = {
        id: 'org-1',
        name: 'Old Name',
        type: 'contractor',
        seatLimit: 10,
        isActive: true,
        planId: 'plan-1',
      };
      const updated = { ...existing, name: 'New Name' };

      mockOrgsFindById.mockResolvedValue(existing);
      mockOrgsUpdate.mockResolvedValue(updated);
      mockAuditLogsCreate.mockResolvedValue({});

      const result = await orgService.updateTenant('org-1', { name: 'New Name' } as any, ctx);

      expect(result.name).toBe('New Name');
      expect(mockAuditLogsCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'tenant.updated',
          userId: 'user-1',
          organizationId: 'org-1',
        })
      );
    });

    it('should throw if tenant not found', async () => {
      mockOrgsFindById.mockResolvedValue(null);

      await expect(
        orgService.updateTenant('fake-id', { name: 'test' } as any, ctx)
      ).rejects.toThrow('Tenant not found');
    });

    it('should throw if update fails', async () => {
      mockOrgsFindById.mockResolvedValue({
        id: 'org-1',
        name: 'Old',
      });
      mockOrgsUpdate.mockResolvedValue(null);

      await expect(orgService.updateTenant('org-1', { name: 'New' } as any, ctx)).rejects.toThrow(
        'Failed to update tenant'
      );
    });
  });

  // =========================================================================
  // deactivateTenant
  // =========================================================================
  describe('deactivateTenant', () => {
    const ctx = {
      actorId: 'admin-1',
      ipAddress: '10.0.0.1',
      userAgent: 'admin-console',
    };

    it('should soft-delete and audit log', async () => {
      mockOrgsFindById.mockResolvedValue({
        id: 'org-1',
        name: 'Deactivate Me',
        type: 'contractor',
        seatUsed: 3,
      });
      mockOrgsDelete.mockResolvedValue(undefined);
      mockAuditLogsCreate.mockResolvedValue({});

      await orgService.deactivateTenant('org-1', ctx);

      expect(mockOrgsDelete).toHaveBeenCalledWith('org-1');
      expect(mockAuditLogsCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'tenant.deactivated',
          metadata: expect.objectContaining({
            tenantName: 'Deactivate Me',
            tenantType: 'contractor',
          }),
        })
      );
    });

    it('should handle missing tenant gracefully in audit', async () => {
      mockOrgsFindById.mockResolvedValue(null);
      mockOrgsDelete.mockResolvedValue(undefined);
      mockAuditLogsCreate.mockResolvedValue({});

      await orgService.deactivateTenant('nonexistent', ctx);

      expect(mockAuditLogsCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({
            tenantName: 'Unknown',
          }),
        })
      );
    });
  });

  // =========================================================================
  // getOrCreatePlatformOrg
  // =========================================================================
  describe('getOrCreatePlatformOrg', () => {
    it('should return existing platform org', async () => {
      const platformOrg = {
        id: 'platform-org-id',
        name: 'Geometrix Platform',
        slug: 'platform',
      };
      mockOrgsFindBySlug.mockResolvedValue(platformOrg);

      const result = await orgService.getOrCreatePlatformOrg('admin-user');

      expect(result).toEqual(platformOrg);
      expect(mockOrgsCreate).not.toHaveBeenCalled();
    });

    it('should create platform org if none exists', async () => {
      mockOrgsFindBySlug.mockResolvedValue(null);
      const newPlatformOrg = {
        id: 'new-platform-id',
        name: 'Geometrix Platform',
        slug: 'platform',
      };
      mockOrgsCreate.mockResolvedValue(newPlatformOrg);

      const result = await orgService.getOrCreatePlatformOrg('first-admin');

      expect(result).toEqual(newPlatformOrg);
      expect(mockOrgsCreate).toHaveBeenCalledWith({
        name: 'Geometrix Platform',
        slug: 'platform',
        type: 'contractor',
        seatLimit: 999,
        createdBy: 'first-admin',
      });
    });
  });
});
