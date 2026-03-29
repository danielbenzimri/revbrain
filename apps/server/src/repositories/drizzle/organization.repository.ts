import { db as defaultDb } from '@revbrain/database/client';
import { organizations } from '@revbrain/database';
import { eq, desc, asc, sql } from 'drizzle-orm';
import type {
  OrganizationRepository,
  OrganizationEntity,
  OrganizationWithPlan,
  CreateOrganizationInput,
  UpdateOrganizationInput,
  FindManyOptions,
} from '@revbrain/contract';
import type { DrizzleDB } from './index.ts';

/**
 * Drizzle implementation of OrganizationRepository
 *
 * Uses direct TCP connection to PostgreSQL via Drizzle ORM.
 * Best for: Complex queries, transactions, local development.
 */
export class DrizzleOrganizationRepository implements OrganizationRepository {
  constructor(private db: DrizzleDB = defaultDb) {}

  // ==========================================================================
  // BASE CRUD
  // ==========================================================================

  async findById(id: string): Promise<OrganizationEntity | null> {
    const result = await this.db.query.organizations.findFirst({
      where: eq(organizations.id, id),
    });
    return result ? this.toEntity(result) : null;
  }

  async findMany(options?: FindManyOptions): Promise<OrganizationEntity[]> {
    const results = await this.db.query.organizations.findMany({
      limit: options?.limit ?? 100,
      offset: options?.offset ?? 0,
      orderBy: this.buildOrderBy(options?.orderBy),
    });
    return results.map((r) => this.toEntity(r));
  }

  async create(data: CreateOrganizationInput): Promise<OrganizationEntity> {
    const [org] = await this.db
      .insert(organizations)
      .values({
        name: data.name,
        slug: data.slug,
        type: 'organization', // Legacy column — org type distinction removed
        seatLimit: data.seatLimit ?? 5,
        seatUsed: 0,
        planId: data.planId ?? null,
        isActive: true,
        createdBy: data.createdBy ?? null,
      })
      .returning();
    return this.toEntity(org);
  }

  async update(id: string, data: UpdateOrganizationInput): Promise<OrganizationEntity | null> {
    const updateData: Record<string, unknown> = {};

    if (data.name !== undefined) updateData.name = data.name;
    if (data.slug !== undefined) updateData.slug = data.slug;
    if (data.type !== undefined) updateData.type = data.type;
    if (data.seatLimit !== undefined) updateData.seatLimit = data.seatLimit;
    if (data.planId !== undefined) updateData.planId = data.planId;
    if (data.isActive !== undefined) updateData.isActive = data.isActive;

    const [org] = await this.db
      .update(organizations)
      .set(updateData)
      .where(eq(organizations.id, id))
      .returning();

    return org ? this.toEntity(org) : null;
  }

  async delete(id: string): Promise<boolean> {
    // Soft delete - set isActive to false instead of removing the row
    // This preserves audit trails and prevents referential integrity issues
    const result = await this.db
      .update(organizations)
      .set({ isActive: false })
      .where(eq(organizations.id, id))
      .returning({ id: organizations.id });
    return result.length > 0;
  }

  async count(_filter?: Record<string, unknown>): Promise<number> {
    const result = await this.db.select({ count: sql<number>`count(*)::int` }).from(organizations);
    return result[0]?.count ?? 0;
  }

  // ==========================================================================
  // ORGANIZATION-SPECIFIC QUERIES
  // ==========================================================================

  async findBySlug(slug: string): Promise<OrganizationEntity | null> {
    const result = await this.db.query.organizations.findFirst({
      where: eq(organizations.slug, slug),
    });
    return result ? this.toEntity(result) : null;
  }

  async findWithPlan(id: string): Promise<OrganizationWithPlan | null> {
    const result = await this.db.query.organizations.findFirst({
      where: eq(organizations.id, id),
      with: {
        plan: true,
      },
    });

    if (!result) return null;

    return {
      ...this.toEntity(result),
      plan: result.plan
        ? {
            id: result.plan.id,
            name: result.plan.name,
            code: result.plan.code,
            description: result.plan.description,
            price: result.plan.price,
            currency: result.plan.currency,
            interval: result.plan.interval,
            yearlyDiscountPercent: result.plan.yearlyDiscountPercent,
            limits: result.plan.limits,
            features: result.plan.features,
            isActive: result.plan.isActive,
            isPublic: result.plan.isPublic,
            stripeProductId: result.plan.stripeProductId ?? null,
            stripePriceId: result.plan.stripePriceId ?? null,
            createdAt: result.plan.createdAt,
            updatedAt: result.plan.updatedAt,
          }
        : null,
    };
  }

  // ==========================================================================
  // SEAT MANAGEMENT
  // ==========================================================================

  async incrementSeatUsed(id: string): Promise<OrganizationEntity | null> {
    const [org] = await this.db
      .update(organizations)
      .set({
        seatUsed: sql`${organizations.seatUsed} + 1`,
      })
      .where(eq(organizations.id, id))
      .returning();

    return org ? this.toEntity(org) : null;
  }

  /**
   * Atomically increment seat count only if within limit (with grace period).
   *
   * Uses a single UPDATE with WHERE clause to prevent TOCTOU race condition.
   * If seatUsed + 1 would exceed the limit (with grace), the update is not applied.
   *
   * @param id - Organization ID
   * @param gracePercentage - Grace period as decimal (default 0.1 = 10%)
   * @returns Updated organization if increment succeeded, null if limit exceeded
   */
  async tryIncrementSeatUsed(
    id: string,
    gracePercentage: number = 0.1
  ): Promise<OrganizationEntity | null> {
    // Atomic check-and-increment: only increment if within grace limit
    // SQL: UPDATE ... SET seat_used = seat_used + 1
    //      WHERE id = ? AND seat_used + 1 <= CEIL(seat_limit * (1 + grace))
    const [org] = await this.db
      .update(organizations)
      .set({
        seatUsed: sql`${organizations.seatUsed} + 1`,
      })
      .where(
        sql`${organizations.id} = ${id} AND (
          ${organizations.seatLimit} = 0 OR
          ${organizations.seatUsed} + 1 <= CEIL(${organizations.seatLimit} * ${1 + gracePercentage})
        )`
      )
      .returning();

    // If no rows affected, the limit was exceeded
    return org ? this.toEntity(org) : null;
  }

  async decrementSeatUsed(id: string): Promise<OrganizationEntity | null> {
    const [org] = await this.db
      .update(organizations)
      .set({
        seatUsed: sql`GREATEST(${organizations.seatUsed} - 1, 0)`,
      })
      .where(eq(organizations.id, id))
      .returning();

    return org ? this.toEntity(org) : null;
  }

  // ==========================================================================
  // STORAGE MANAGEMENT
  // ==========================================================================

  /**
   * Atomically update storage usage by delta (positive or negative).
   * Uses GREATEST(0, ...) to prevent negative storage values.
   *
   * @param id - Organization ID
   * @param byteDelta - Bytes to add (positive) or remove (negative)
   * @returns New total storage in bytes
   */
  async updateStorageUsed(id: string, byteDelta: number): Promise<number> {
    const [result] = await this.db
      .update(organizations)
      .set({
        storageUsedBytes: sql`GREATEST(${organizations.storageUsedBytes} + ${byteDelta}, 0)`,
      })
      .where(eq(organizations.id, id))
      .returning({ storageUsedBytes: organizations.storageUsedBytes });

    return result?.storageUsedBytes ?? 0;
  }

  // ==========================================================================
  // HELPERS
  // ==========================================================================

  private buildOrderBy(orderBy?: { field: string; direction: 'asc' | 'desc' }) {
    if (!orderBy) return desc(organizations.createdAt);

    // Column mapping for orderBy support
    switch (orderBy.field) {
      case 'name':
        return orderBy.direction === 'asc' ? asc(organizations.name) : desc(organizations.name);
      case 'slug':
        return orderBy.direction === 'asc' ? asc(organizations.slug) : desc(organizations.slug);
      case 'type':
        return orderBy.direction === 'asc' ? asc(organizations.type) : desc(organizations.type);
      case 'isActive':
        return orderBy.direction === 'asc'
          ? asc(organizations.isActive)
          : desc(organizations.isActive);
      case 'createdAt':
      default:
        return orderBy.direction === 'asc'
          ? asc(organizations.createdAt)
          : desc(organizations.createdAt);
    }
  }

  private toEntity(row: typeof organizations.$inferSelect): OrganizationEntity {
    return {
      id: row.id,
      name: row.name,
      slug: row.slug,
      type: row.type,
      seatLimit: row.seatLimit,
      seatUsed: row.seatUsed,
      storageUsedBytes: row.storageUsedBytes,
      planId: row.planId,
      isActive: row.isActive,
      createdAt: row.createdAt,
      createdBy: row.createdBy,
    };
  }
}
