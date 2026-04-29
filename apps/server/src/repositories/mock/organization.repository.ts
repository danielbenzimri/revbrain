import type {
  OrganizationRepository,
  OrganizationEntity,
  OrganizationWithPlan,
  CreateOrganizationInput,
  UpdateOrganizationInput,
  FindManyOptions,
} from '@revbrain/contract';
import { mockOrganizations, mockPlans } from '../../mocks/index.ts';
import {
  generateId,
  applyPagination,
  applySorting,
  applyFilters,
  validateFilters,
} from './helpers.ts';

const ALLOWED_FILTERS = ['isActive'] as const;

export class MockOrganizationRepository implements OrganizationRepository {
  async findById(id: string): Promise<OrganizationEntity | null> {
    return mockOrganizations.find((o) => o.id === id) ?? null;
  }

  async findMany(options?: FindManyOptions): Promise<OrganizationEntity[]> {
    if (options?.filter) validateFilters(options.filter, ALLOWED_FILTERS, 'Organizations');
    let items = applyFilters(mockOrganizations, options?.filter);
    const field = (options?.orderBy?.field as keyof OrganizationEntity) || 'createdAt';
    items = applySorting(items, field, options?.orderBy?.direction || 'desc');
    return applyPagination(items, options);
  }

  async create(data: CreateOrganizationInput): Promise<OrganizationEntity> {
    const entity: OrganizationEntity = {
      id: generateId(),
      name: data.name,
      slug: data.slug,
      type: 'business',
      orgType: data.orgType ?? 'si_partner',
      seatLimit: data.seatLimit ?? 5,
      seatUsed: 0,
      storageUsedBytes: 0,
      planId: data.planId ?? null,
      billingContactEmail: data.billingContactEmail ?? null,
      isActive: true,
      createdAt: new Date(),
      createdBy: data.createdBy ?? null,
    };
    mockOrganizations.push(entity);
    return entity;
  }

  async update(id: string, data: UpdateOrganizationInput): Promise<OrganizationEntity | null> {
    const idx = mockOrganizations.findIndex((o) => o.id === id);
    if (idx === -1) return null;
    const updated = { ...mockOrganizations[idx], ...data };
    mockOrganizations[idx] = updated;
    return updated;
  }

  async delete(id: string): Promise<boolean> {
    const idx = mockOrganizations.findIndex((o) => o.id === id);
    if (idx === -1) return false;
    mockOrganizations.splice(idx, 1);
    return true;
  }

  async count(filter?: Record<string, unknown>): Promise<number> {
    if (filter) validateFilters(filter, ALLOWED_FILTERS, 'Organizations');
    return applyFilters(mockOrganizations, filter).length;
  }

  async findBySlug(slug: string): Promise<OrganizationEntity | null> {
    return mockOrganizations.find((o) => o.slug === slug) ?? null;
  }

  async findWithPlan(id: string): Promise<OrganizationWithPlan | null> {
    const org = mockOrganizations.find((o) => o.id === id);
    if (!org) return null;
    const plan = org.planId ? (mockPlans.find((p) => p.id === org.planId) ?? null) : null;
    return { ...org, plan };
  }

  async incrementSeatUsed(id: string): Promise<OrganizationEntity | null> {
    const idx = mockOrganizations.findIndex((o) => o.id === id);
    if (idx === -1) return null;
    mockOrganizations[idx] = {
      ...mockOrganizations[idx],
      seatUsed: mockOrganizations[idx].seatUsed + 1,
    };
    return mockOrganizations[idx];
  }

  async decrementSeatUsed(id: string): Promise<OrganizationEntity | null> {
    const idx = mockOrganizations.findIndex((o) => o.id === id);
    if (idx === -1) return null;
    mockOrganizations[idx] = {
      ...mockOrganizations[idx],
      seatUsed: Math.max(0, mockOrganizations[idx].seatUsed - 1),
    };
    return mockOrganizations[idx];
  }

  async tryIncrementSeatUsed(id: string, gracePercentage = 0): Promise<OrganizationEntity | null> {
    const org = mockOrganizations.find((o) => o.id === id);
    if (!org) return null;
    const effectiveLimit = org.seatLimit * (1 + gracePercentage);
    if (org.seatUsed >= effectiveLimit) return null;
    return this.incrementSeatUsed(id);
  }

  async updateStorageUsed(id: string, byteDelta: number): Promise<number> {
    const idx = mockOrganizations.findIndex((o) => o.id === id);
    if (idx === -1) return 0;
    const newTotal = Math.max(0, mockOrganizations[idx].storageUsedBytes + byteDelta);
    mockOrganizations[idx] = { ...mockOrganizations[idx], storageUsedBytes: newTotal };
    return newTotal;
  }
}
