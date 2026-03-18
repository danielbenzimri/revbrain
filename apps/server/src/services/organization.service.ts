import type {
  Repositories,
  OrganizationEntity,
  OrganizationWithPlan,
  UpdateOrganizationInput,
} from '@revbrain/contract';
import type { RequestContext } from './types.ts';

const PLATFORM_ORG_SLUG = 'platform';

export class OrganizationService {
  constructor(private repos: Repositories) {}

  /**
   * Generate a URL-safe slug from an org name with collision detection.
   */
  async generateUniqueSlug(name: string): Promise<string> {
    const baseSlug = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .substring(0, 50);

    const existing = await this.repos.organizations.findBySlug(baseSlug);
    if (!existing) return baseSlug;

    const suffix = crypto.randomUUID().substring(0, 6);
    return `${baseSlug}-${suffix}`;
  }

  /**
   * List tenants with plan details and pagination.
   */
  async listTenants(options: { limit: number; offset: number }): Promise<{
    tenants: OrganizationWithPlan[];
    hasMore: boolean;
  }> {
    const allTenants = await this.repos.organizations.findMany({
      limit: options.limit + 1,
      offset: options.offset,
      orderBy: { field: 'name', direction: 'asc' },
    });

    const hasMore = allTenants.length > options.limit;
    const page = hasMore ? allTenants.slice(0, options.limit) : allTenants;

    // Load plan details for each tenant
    const tenantsWithPlans: OrganizationWithPlan[] = await Promise.all(
      page.map(async (org) => {
        if (org.planId) {
          const withPlan = await this.repos.organizations.findWithPlan(org.id);
          if (withPlan) return withPlan;
        }
        return { ...org, plan: null };
      })
    );

    return { tenants: tenantsWithPlans, hasMore };
  }

  /**
   * Update tenant details.
   */
  async updateTenant(
    id: string,
    updates: UpdateOrganizationInput,
    ctx: RequestContext
  ): Promise<OrganizationEntity> {
    const existing = await this.repos.organizations.findById(id);
    if (!existing) {
      throw new Error('Tenant not found');
    }

    const updated = await this.repos.organizations.update(id, updates);
    if (!updated) {
      throw new Error('Failed to update tenant');
    }

    // Audit log the update
    await this.repos.auditLogs.create({
      userId: ctx.actorId,
      organizationId: id,
      action: 'tenant.updated',
      metadata: {
        tenantId: id,
        tenantName: existing.name,
        changes: updates,
        previousValues: {
          name: existing.name,
          type: existing.type,
          seatLimit: existing.seatLimit,
          isActive: existing.isActive,
          planId: existing.planId,
        },
      },
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    });

    return updated;
  }

  /**
   * Soft-deactivate a tenant.
   */
  async deactivateTenant(id: string, ctx: RequestContext): Promise<void> {
    // Fetch tenant details before deactivation for audit log
    const existing = await this.repos.organizations.findById(id);

    await this.repos.organizations.delete(id);

    // Audit log the deactivation
    await this.repos.auditLogs.create({
      userId: ctx.actorId,
      organizationId: id,
      action: 'tenant.deactivated',
      metadata: {
        tenantId: id,
        tenantName: existing?.name || 'Unknown',
        tenantType: existing?.type || 'Unknown',
        seatCount: existing?.seatUsed || 0,
      },
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    });
  }

  /**
   * Find or create the platform organization for system admin users.
   */
  async getOrCreatePlatformOrg(createdBy: string): Promise<OrganizationEntity> {
    const existing = await this.repos.organizations.findBySlug(PLATFORM_ORG_SLUG);
    if (existing) return existing;

    return this.repos.organizations.create({
      name: 'RevBrain Platform',
      slug: PLATFORM_ORG_SLUG,
      seatLimit: 999,
      createdBy,
    });
  }
}
