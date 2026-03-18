import { db as defaultDb, boqItems, eq, desc, asc, sql, and, isNull } from '@geometrix/database';
import type {
  BOQRepository,
  BOQItemEntity,
  CreateBOQItemInput,
  UpdateBOQItemInput,
  FindManyOptions,
} from '@geometrix/contract';
import type { DrizzleDB } from './index.ts';

/**
 * Drizzle implementation of BOQRepository
 */
export class DrizzleBOQRepository implements BOQRepository {
  constructor(private db: DrizzleDB = defaultDb) {}

  // ==========================================================================
  // BASE CRUD
  // ==========================================================================

  async findById(id: string): Promise<BOQItemEntity | null> {
    const result = await this.db.query.boqItems.findFirst({
      where: eq(boqItems.id, id),
    });
    return result ? this.toEntity(result) : null;
  }

  async findMany(options?: FindManyOptions): Promise<BOQItemEntity[]> {
    const results = await this.db.query.boqItems.findMany({
      limit: options?.limit ?? 100,
      offset: options?.offset ?? 0,
      orderBy: this.buildOrderBy(options?.orderBy),
    });
    return results.map((r) => this.toEntity(r));
  }

  async create(data: CreateBOQItemInput): Promise<BOQItemEntity> {
    const [item] = await this.db
      .insert(boqItems)
      .values({
        organizationId: data.organizationId,
        projectId: data.projectId,
        parentId: data.parentId ?? null,
        code: data.code,
        description: data.description,
        unit: data.unit ?? null,
        contractQuantity: data.contractQuantity?.toString() ?? null,
        unitPriceCents: data.unitPriceCents ?? null,
        level: data.level ?? 0,
        sortOrder: data.sortOrder ?? 0,
        isActive: data.isActive ?? true,
      })
      .returning();
    return this.toEntity(item);
  }

  async createMany(data: CreateBOQItemInput[]): Promise<BOQItemEntity[]> {
    if (data.length === 0) return [];

    const items = await this.db
      .insert(boqItems)
      .values(
        data.map((d) => ({
          organizationId: d.organizationId,
          projectId: d.projectId,
          parentId: d.parentId ?? null,
          code: d.code,
          description: d.description,
          unit: d.unit ?? null,
          contractQuantity: d.contractQuantity?.toString() ?? null,
          unitPriceCents: d.unitPriceCents ?? null,
          level: d.level ?? 0,
          sortOrder: d.sortOrder ?? 0,
          isActive: d.isActive ?? true,
        }))
      )
      .returning();
    return items.map((item) => this.toEntity(item));
  }

  async update(id: string, data: UpdateBOQItemInput): Promise<BOQItemEntity | null> {
    const updateData: Record<string, unknown> = {
      updatedAt: new Date(),
    };

    if (data.code !== undefined) updateData.code = data.code;
    if (data.description !== undefined) updateData.description = data.description;
    if (data.unit !== undefined) updateData.unit = data.unit;
    if (data.contractQuantity !== undefined) {
      updateData.contractQuantity = data.contractQuantity?.toString() ?? null;
    }
    if (data.unitPriceCents !== undefined) updateData.unitPriceCents = data.unitPriceCents;
    if (data.level !== undefined) updateData.level = data.level;
    if (data.sortOrder !== undefined) updateData.sortOrder = data.sortOrder;
    if (data.isActive !== undefined) updateData.isActive = data.isActive;
    if (data.parentId !== undefined) updateData.parentId = data.parentId;

    const [item] = await this.db
      .update(boqItems)
      .set(updateData)
      .where(eq(boqItems.id, id))
      .returning();

    return item ? this.toEntity(item) : null;
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.db
      .delete(boqItems)
      .where(eq(boqItems.id, id))
      .returning({ id: boqItems.id });
    return result.length > 0;
  }

  async count(_filter?: Record<string, unknown>): Promise<number> {
    const result = await this.db.select({ count: sql<number>`count(*)::int` }).from(boqItems);
    return result[0]?.count ?? 0;
  }

  // ==========================================================================
  // BOQ-SPECIFIC QUERIES
  // ==========================================================================

  async findByProject(projectId: string, options?: FindManyOptions): Promise<BOQItemEntity[]> {
    const results = await this.db.query.boqItems.findMany({
      where: eq(boqItems.projectId, projectId),
      limit: options?.limit ?? 1000,
      offset: options?.offset ?? 0,
      orderBy: [asc(boqItems.level), asc(boqItems.sortOrder), asc(boqItems.code)],
    });
    return results.map((r) => this.toEntity(r));
  }

  async findByProjectWithTree(projectId: string): Promise<BOQItemEntity[]> {
    // Get all items for project, ordered for tree building
    const results = await this.db.query.boqItems.findMany({
      where: eq(boqItems.projectId, projectId),
      orderBy: [asc(boqItems.level), asc(boqItems.sortOrder), asc(boqItems.code)],
    });

    const items = results.map((r) => this.toEntity(r));
    return this.buildTree(items);
  }

  async findByCode(projectId: string, code: string): Promise<BOQItemEntity | null> {
    const result = await this.db.query.boqItems.findFirst({
      where: and(eq(boqItems.projectId, projectId), eq(boqItems.code, code)),
    });
    return result ? this.toEntity(result) : null;
  }

  async findChildren(parentId: string): Promise<BOQItemEntity[]> {
    const results = await this.db.query.boqItems.findMany({
      where: eq(boqItems.parentId, parentId),
      orderBy: [asc(boqItems.sortOrder), asc(boqItems.code)],
    });
    return results.map((r) => this.toEntity(r));
  }

  async findRootItems(projectId: string): Promise<BOQItemEntity[]> {
    const results = await this.db.query.boqItems.findMany({
      where: and(eq(boqItems.projectId, projectId), isNull(boqItems.parentId)),
      orderBy: [asc(boqItems.sortOrder), asc(boqItems.code)],
    });
    return results.map((r) => this.toEntity(r));
  }

  async countByProject(projectId: string): Promise<number> {
    const result = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(boqItems)
      .where(eq(boqItems.projectId, projectId));
    return result[0]?.count ?? 0;
  }

  // ==========================================================================
  // BULK OPERATIONS
  // ==========================================================================

  async deleteByProject(projectId: string): Promise<number> {
    const result = await this.db
      .delete(boqItems)
      .where(eq(boqItems.projectId, projectId))
      .returning({ id: boqItems.id });
    return result.length;
  }

  async deactivateByProject(projectId: string): Promise<number> {
    const result = await this.db
      .update(boqItems)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(boqItems.projectId, projectId))
      .returning({ id: boqItems.id });
    return result.length;
  }

  // ==========================================================================
  // HELPERS
  // ==========================================================================

  private buildOrderBy(orderBy?: { field: string; direction: 'asc' | 'desc' }) {
    if (!orderBy) return [asc(boqItems.level), asc(boqItems.sortOrder), asc(boqItems.code)];

    switch (orderBy.field) {
      case 'code':
        return orderBy.direction === 'asc' ? asc(boqItems.code) : desc(boqItems.code);
      case 'description':
        return orderBy.direction === 'asc' ? asc(boqItems.description) : desc(boqItems.description);
      case 'createdAt':
        return orderBy.direction === 'asc' ? asc(boqItems.createdAt) : desc(boqItems.createdAt);
      case 'updatedAt':
        return orderBy.direction === 'asc' ? asc(boqItems.updatedAt) : desc(boqItems.updatedAt);
      default:
        return [asc(boqItems.level), asc(boqItems.sortOrder), asc(boqItems.code)];
    }
  }

  private toEntity(row: typeof boqItems.$inferSelect): BOQItemEntity {
    return {
      id: row.id,
      organizationId: row.organizationId,
      projectId: row.projectId,
      parentId: row.parentId,
      code: row.code,
      description: row.description,
      unit: row.unit,
      contractQuantity: row.contractQuantity ? parseFloat(row.contractQuantity) : null,
      unitPriceCents: row.unitPriceCents,
      level: row.level,
      sortOrder: row.sortOrder,
      isActive: row.isActive,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  private buildTree(items: BOQItemEntity[]): BOQItemEntity[] {
    const itemMap = new Map<string, BOQItemEntity>();
    const roots: BOQItemEntity[] = [];

    // First pass: create map and add children arrays
    for (const item of items) {
      itemMap.set(item.id, { ...item, children: [] });
    }

    // Second pass: build tree structure
    for (const item of items) {
      const node = itemMap.get(item.id)!;
      if (item.parentId && itemMap.has(item.parentId)) {
        const parent = itemMap.get(item.parentId)!;
        parent.children = parent.children || [];
        parent.children.push(node);
      } else {
        roots.push(node);
      }
    }

    return roots;
  }
}
