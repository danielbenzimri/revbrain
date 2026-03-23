import { db as defaultDb } from '@revbrain/database/client';
import { plans } from '@revbrain/database';
import { eq, desc, asc, sql, and } from 'drizzle-orm';
import type {
  PlanRepository,
  PlanEntity,
  CreatePlanInput,
  UpdatePlanInput,
  FindManyOptions,
} from '@revbrain/contract';
import type { DrizzleDB } from './index.ts';

/**
 * Generate a URL-friendly code from a plan name
 */
function generateCodeFromName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '') // Remove special chars
    .replace(/\s+/g, '-') // Replace spaces with hyphens
    .replace(/-+/g, '-') // Replace multiple hyphens with single
    .replace(/^-|-$/g, ''); // Remove leading/trailing hyphens
}

/**
 * Drizzle implementation of PlanRepository
 */
export class DrizzlePlanRepository implements PlanRepository {
  constructor(private db: DrizzleDB = defaultDb) {}

  // ==========================================================================
  // BASE CRUD
  // ==========================================================================

  async findById(id: string): Promise<PlanEntity | null> {
    const result = await this.db.query.plans.findFirst({
      where: eq(plans.id, id),
    });
    return result ? this.toEntity(result) : null;
  }

  async findMany(options?: FindManyOptions): Promise<PlanEntity[]> {
    const results = await this.db.query.plans.findMany({
      limit: options?.limit ?? 100,
      offset: options?.offset ?? 0,
      orderBy: this.buildOrderBy(options?.orderBy),
    });
    return results.map((r) => this.toEntity(r));
  }

  async create(data: CreatePlanInput): Promise<PlanEntity> {
    // Auto-generate code from name if not provided
    const code = data.code || generateCodeFromName(data.name);

    const [plan] = await this.db
      .insert(plans)
      .values({
        name: data.name,
        code,
        description: data.description ?? null,
        price: data.price ?? 0,
        currency: data.currency ?? 'USD',
        interval: data.interval ?? 'month',
        yearlyDiscountPercent: data.yearlyDiscountPercent ?? 0,
        limits: data.limits ?? null,
        features: data.features ?? null,
        isActive: data.isActive ?? true,
        isPublic: data.isPublic ?? false,
      })
      .returning();
    return this.toEntity(plan);
  }

  async update(id: string, data: UpdatePlanInput): Promise<PlanEntity | null> {
    const updateData: Record<string, unknown> = {
      updatedAt: new Date(),
    };

    if (data.name !== undefined) updateData.name = data.name;
    if (data.code !== undefined) updateData.code = data.code;
    if (data.description !== undefined) updateData.description = data.description;
    if (data.price !== undefined) updateData.price = data.price;
    if (data.currency !== undefined) updateData.currency = data.currency;
    if (data.interval !== undefined) updateData.interval = data.interval;
    if (data.yearlyDiscountPercent !== undefined)
      updateData.yearlyDiscountPercent = data.yearlyDiscountPercent;
    if (data.limits !== undefined) updateData.limits = data.limits;
    if (data.features !== undefined) updateData.features = data.features;
    if (data.isActive !== undefined) updateData.isActive = data.isActive;
    if (data.isPublic !== undefined) updateData.isPublic = data.isPublic;

    const [plan] = await this.db.update(plans).set(updateData).where(eq(plans.id, id)).returning();

    return plan ? this.toEntity(plan) : null;
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.db.delete(plans).where(eq(plans.id, id)).returning({ id: plans.id });
    return result.length > 0;
  }

  async count(_filter?: Record<string, unknown>): Promise<number> {
    const result = await this.db.select({ count: sql<number>`count(*)::int` }).from(plans);
    return result[0]?.count ?? 0;
  }

  // ==========================================================================
  // PLAN-SPECIFIC QUERIES
  // ==========================================================================

  async findByCode(code: string): Promise<PlanEntity | null> {
    const result = await this.db.query.plans.findFirst({
      where: eq(plans.code, code),
    });
    return result ? this.toEntity(result) : null;
  }

  async findByName(name: string): Promise<PlanEntity | null> {
    const result = await this.db.query.plans.findFirst({
      where: eq(plans.name, name),
    });
    return result ? this.toEntity(result) : null;
  }

  async findActive(): Promise<PlanEntity[]> {
    const results = await this.db.query.plans.findMany({
      where: eq(plans.isActive, true),
      orderBy: asc(plans.price),
    });
    return results.map((r) => this.toEntity(r));
  }

  async findPublic(options?: { limit?: number; offset?: number }): Promise<PlanEntity[]> {
    const results = await this.db.query.plans.findMany({
      where: and(eq(plans.isActive, true), eq(plans.isPublic, true)),
      orderBy: asc(plans.price),
      limit: options?.limit ?? 100,
      offset: options?.offset ?? 0,
    });
    return results.map((r) => this.toEntity(r));
  }

  // ==========================================================================
  // HELPERS
  // ==========================================================================

  private buildOrderBy(orderBy?: { field: string; direction: 'asc' | 'desc' }) {
    if (!orderBy) return desc(plans.createdAt);

    switch (orderBy.field) {
      case 'name':
        return orderBy.direction === 'asc' ? asc(plans.name) : desc(plans.name);
      case 'code':
        return orderBy.direction === 'asc' ? asc(plans.code) : desc(plans.code);
      case 'price':
        return orderBy.direction === 'asc' ? asc(plans.price) : desc(plans.price);
      case 'isActive':
        return orderBy.direction === 'asc' ? asc(plans.isActive) : desc(plans.isActive);
      case 'createdAt':
      default:
        return orderBy.direction === 'asc' ? asc(plans.createdAt) : desc(plans.createdAt);
    }
  }

  private toEntity(row: typeof plans.$inferSelect): PlanEntity {
    return {
      id: row.id,
      name: row.name,
      code: row.code,
      description: row.description,
      price: row.price,
      currency: row.currency,
      interval: row.interval,
      yearlyDiscountPercent: row.yearlyDiscountPercent,
      limits: row.limits,
      features: row.features,
      isActive: row.isActive,
      isPublic: row.isPublic,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
