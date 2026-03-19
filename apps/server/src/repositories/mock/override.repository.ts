/**
 * Mock Override Repository
 *
 * In-memory CRUD for tenant overrides.
 */
import { mockTenantOverrides, type SeedTenantOverride } from '../../mocks/index.ts';
import { generateId } from './helpers.ts';

export class MockOverrideRepository {
  /**
   * Returns active (non-revoked, non-expired) overrides for an organization.
   */
  async findByOrganization(orgId: string): Promise<SeedTenantOverride[]> {
    const now = new Date();
    return mockTenantOverrides.filter(
      (o) =>
        o.organizationId === orgId &&
        o.revokedAt === null &&
        (o.expiresAt === null || o.expiresAt > now)
    );
  }

  /**
   * Returns all overrides, optionally including inactive (revoked/expired).
   */
  async findAll(options?: { includeInactive?: boolean }): Promise<SeedTenantOverride[]> {
    if (options?.includeInactive) {
      return [...mockTenantOverrides];
    }
    const now = new Date();
    return mockTenantOverrides.filter(
      (o) => o.revokedAt === null && (o.expiresAt === null || o.expiresAt > now)
    );
  }

  /**
   * Create a new tenant override.
   */
  async create(data: {
    organizationId: string;
    feature: string;
    value: unknown;
    expiresAt?: Date | null;
    grantedBy: string;
    reason: string;
  }): Promise<SeedTenantOverride> {
    const now = new Date();
    const entity: SeedTenantOverride = {
      id: generateId(),
      organizationId: data.organizationId,
      feature: data.feature,
      value: data.value,
      expiresAt: data.expiresAt ?? null,
      grantedBy: data.grantedBy,
      reason: data.reason,
      revokedAt: null,
      createdAt: now,
    };
    mockTenantOverrides.push(entity);
    return entity;
  }

  /**
   * Revoke an override by setting revokedAt = now.
   */
  async revoke(id: string): Promise<SeedTenantOverride | null> {
    const idx = mockTenantOverrides.findIndex((o) => o.id === id);
    if (idx === -1) return null;
    const updated = { ...mockTenantOverrides[idx], revokedAt: new Date() };
    mockTenantOverrides[idx] = updated;
    return updated;
  }

  /**
   * Find a single override by ID.
   */
  async findById(id: string): Promise<SeedTenantOverride | null> {
    return mockTenantOverrides.find((o) => o.id === id) ?? null;
  }
}
