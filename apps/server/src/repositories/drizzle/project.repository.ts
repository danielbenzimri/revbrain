import { db as defaultDb } from '@revbrain/database/client';
import { projects } from '@revbrain/database';
import { eq, desc, asc, sql } from 'drizzle-orm';
import type {
  ProjectRepository,
  ProjectEntity,
  CreateProjectInput,
  UpdateProjectInput,
  FindManyOptions,
  ProjectStatus,
} from '@revbrain/contract';
import type { DrizzleDB } from './index.ts';

/**
 * Drizzle implementation of ProjectRepository
 */
export class DrizzleProjectRepository implements ProjectRepository {
  constructor(private db: DrizzleDB = defaultDb) {}

  // ==========================================================================
  // BASE CRUD
  // ==========================================================================

  async findById(id: string): Promise<ProjectEntity | null> {
    const result = await this.db.query.projects.findFirst({
      where: eq(projects.id, id),
    });
    return result ? this.toEntity(result) : null;
  }

  async findMany(options?: FindManyOptions): Promise<ProjectEntity[]> {
    const results = await this.db.query.projects.findMany({
      limit: options?.limit ?? 100,
      offset: options?.offset ?? 0,
      orderBy: this.buildOrderBy(options?.orderBy),
    });
    return results.map((r) => this.toEntity(r));
  }

  async create(data: CreateProjectInput): Promise<ProjectEntity> {
    const [project] = await this.db
      .insert(projects)
      .values({
        name: data.name,
        organizationId: data.organizationId,
        ownerId: data.ownerId,
        description: data.description ?? null,
        startDate: data.startDate ?? null,
        endDate: data.endDate ?? null,
        notes: data.notes ?? null,
        metadata: data.metadata ?? {},
      })
      .returning();
    return this.toEntity(project);
  }

  async update(id: string, data: UpdateProjectInput): Promise<ProjectEntity | null> {
    const updateData: Record<string, unknown> = {
      updatedAt: new Date(),
    };

    // Basic fields
    if (data.name !== undefined) updateData.name = data.name;
    if (data.description !== undefined) updateData.description = data.description;
    if (data.startDate !== undefined) updateData.startDate = data.startDate;
    if (data.endDate !== undefined) updateData.endDate = data.endDate;

    // Status workflow
    if (data.status !== undefined) {
      updateData.status = data.status;
      // Set timestamp based on status change
      if (data.status === 'completed') {
        updateData.completedAt = new Date();
      } else if (data.status === 'cancelled') {
        updateData.cancelledAt = new Date();
      }
    }

    // Other
    if (data.notes !== undefined) updateData.notes = data.notes;
    if (data.metadata !== undefined) updateData.metadata = data.metadata;

    const [project] = await this.db
      .update(projects)
      .set(updateData)
      .where(eq(projects.id, id))
      .returning();

    return project ? this.toEntity(project) : null;
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.db
      .delete(projects)
      .where(eq(projects.id, id))
      .returning({ id: projects.id });
    return result.length > 0;
  }

  async count(_filter?: Record<string, unknown>): Promise<number> {
    const result = await this.db.select({ count: sql<number>`count(*)::int` }).from(projects);
    return result[0]?.count ?? 0;
  }

  // ==========================================================================
  // PROJECT-SPECIFIC QUERIES
  // ==========================================================================

  async findByOwner(ownerId: string, options?: FindManyOptions): Promise<ProjectEntity[]> {
    const results = await this.db.query.projects.findMany({
      where: eq(projects.ownerId, ownerId),
      limit: options?.limit ?? 100,
      offset: options?.offset ?? 0,
      orderBy: this.buildOrderBy(options?.orderBy),
    });
    return results.map((r) => this.toEntity(r));
  }

  async findByOrganization(
    organizationId: string,
    options?: FindManyOptions
  ): Promise<ProjectEntity[]> {
    const results = await this.db.query.projects.findMany({
      where: eq(projects.organizationId, organizationId),
      limit: options?.limit ?? 100,
      offset: options?.offset ?? 0,
      orderBy: this.buildOrderBy(options?.orderBy),
    });
    return results.map((r) => this.toEntity(r));
  }

  async countByOrganization(organizationId: string): Promise<number> {
    const result = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(projects)
      .where(eq(projects.organizationId, organizationId));
    return result[0]?.count ?? 0;
  }

  // ==========================================================================
  // HELPERS
  // ==========================================================================

  private buildOrderBy(orderBy?: { field: string; direction: 'asc' | 'desc' }) {
    if (!orderBy) return desc(projects.updatedAt);

    switch (orderBy.field) {
      case 'name':
        return orderBy.direction === 'asc' ? asc(projects.name) : desc(projects.name);
      case 'createdAt':
        return orderBy.direction === 'asc' ? asc(projects.createdAt) : desc(projects.createdAt);
      case 'startDate':
        return orderBy.direction === 'asc' ? asc(projects.startDate) : desc(projects.startDate);
      case 'endDate':
        return orderBy.direction === 'asc' ? asc(projects.endDate) : desc(projects.endDate);
      case 'status':
        return orderBy.direction === 'asc' ? asc(projects.status) : desc(projects.status);
      case 'updatedAt':
      default:
        return orderBy.direction === 'asc' ? asc(projects.updatedAt) : desc(projects.updatedAt);
    }
  }

  private toEntity(row: typeof projects.$inferSelect): ProjectEntity {
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      ownerId: row.ownerId,
      organizationId: row.organizationId,
      startDate: row.startDate,
      endDate: row.endDate,
      // Status workflow
      status: (row.status as ProjectStatus) ?? 'active',
      notes: row.notes,
      metadata: (row.metadata as Record<string, unknown>) ?? {},
      // Timestamps
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      completedAt: row.completedAt,
      cancelledAt: row.cancelledAt,
    };
  }
}
