import type {
  PlanRepository,
  PlanEntity,
  CreatePlanInput,
  UpdatePlanInput,
  FindManyOptions,
} from '@revbrain/contract';
import { mockPlans } from '../../mocks/index.ts';
import {
  generateId,
  applyPagination,
  applySorting,
  applyFilters,
  validateFilters,
} from './helpers.ts';

const ALLOWED_FILTERS = ['isActive', 'isPublic'] as const;

export class MockPlanRepository implements PlanRepository {
  async findById(id: string): Promise<PlanEntity | null> {
    return mockPlans.find((p) => p.id === id) ?? null;
  }

  async findMany(options?: FindManyOptions): Promise<PlanEntity[]> {
    if (options?.filter) validateFilters(options.filter, ALLOWED_FILTERS, 'Plans');
    let items = applyFilters(mockPlans, options?.filter);
    const field = (options?.orderBy?.field as keyof PlanEntity) || 'createdAt';
    items = applySorting(items, field, options?.orderBy?.direction || 'desc');
    return applyPagination(items, options);
  }

  async create(data: CreatePlanInput): Promise<PlanEntity> {
    const now = new Date();
    const entity: PlanEntity = {
      id: generateId(),
      name: data.name,
      code: data.code || data.name.toLowerCase().replace(/\s+/g, '-'),
      description: data.description ?? null,
      price: data.price ?? 0,
      currency: data.currency ?? 'USD',
      interval: data.interval ?? 'month',
      yearlyDiscountPercent: data.yearlyDiscountPercent ?? 0,
      limits: data.limits ?? null,
      features: data.features ?? null,
      isActive: data.isActive ?? true,
      isPublic: data.isPublic ?? false,
      stripeProductId: null,
      stripePriceId: null,
      createdAt: now,
      updatedAt: now,
    };
    mockPlans.push(entity);
    return entity;
  }

  async update(id: string, data: UpdatePlanInput): Promise<PlanEntity | null> {
    const idx = mockPlans.findIndex((p) => p.id === id);
    if (idx === -1) return null;
    const updated = { ...mockPlans[idx], ...data, updatedAt: new Date() };
    mockPlans[idx] = updated;
    return updated;
  }

  async delete(id: string): Promise<boolean> {
    const idx = mockPlans.findIndex((p) => p.id === id);
    if (idx === -1) return false;
    mockPlans.splice(idx, 1);
    return true;
  }

  async count(filter?: Record<string, unknown>): Promise<number> {
    if (filter) validateFilters(filter, ALLOWED_FILTERS, 'Plans');
    return applyFilters(mockPlans, filter).length;
  }

  async findByCode(code: string): Promise<PlanEntity | null> {
    return mockPlans.find((p) => p.code === code) ?? null;
  }

  async findByName(name: string): Promise<PlanEntity | null> {
    return mockPlans.find((p) => p.name === name) ?? null;
  }

  async findActive(): Promise<PlanEntity[]> {
    return mockPlans.filter((p) => p.isActive);
  }

  async findPublic(options?: { limit?: number; offset?: number }): Promise<PlanEntity[]> {
    const publicPlans = mockPlans.filter((p) => p.isActive && p.isPublic);
    return applyPagination(publicPlans, options);
  }
}
