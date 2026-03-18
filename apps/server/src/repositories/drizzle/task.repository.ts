import { db as defaultDb, tasks, eq, desc, asc, and, sql } from '@revbrain/database';
import type {
  TaskRepository,
  TaskEntity,
  CreateTaskInput,
  UpdateTaskInput,
  FindManyOptions,
  PaginatedResult,
  TaskStatus,
  TaskPriority,
} from '@revbrain/contract';
import type { DrizzleDB } from './index.ts';

/**
 * Drizzle implementation of TaskRepository
 * Supports Kanban board operations and task management
 */
export class DrizzleTaskRepository implements TaskRepository {
  constructor(private db: DrizzleDB = defaultDb) {}

  // ==========================================================================
  // BASE CRUD
  // ==========================================================================

  async findById(id: string): Promise<TaskEntity | null> {
    const result = await this.db.query.tasks.findFirst({
      where: eq(tasks.id, id),
    });
    return result ? this.toEntity(result) : null;
  }

  async findMany(options?: FindManyOptions): Promise<TaskEntity[]> {
    const results = await this.db.query.tasks.findMany({
      limit: options?.limit ?? 100,
      offset: options?.offset ?? 0,
      orderBy: this.buildOrderBy(options?.orderBy),
    });
    return results.map((r) => this.toEntity(r));
  }

  async create(data: CreateTaskInput): Promise<TaskEntity> {
    const [task] = await this.db
      .insert(tasks)
      .values({
        organizationId: data.organizationId,
        projectId: data.projectId,
        title: data.title,
        description: data.description ?? null,
        status: data.status ?? 'todo',
        priority: data.priority ?? 'medium',
        assigneeId: data.assigneeId ?? null,
        dueDate: data.dueDate ?? null,
        tags: data.tags ?? [],
        createdBy: data.createdBy,
      })
      .returning();
    return this.toEntity(task);
  }

  async update(id: string, data: UpdateTaskInput): Promise<TaskEntity | null> {
    const updateData: Record<string, unknown> = {
      updatedAt: new Date(),
    };

    if (data.title !== undefined) updateData.title = data.title;
    if (data.description !== undefined) updateData.description = data.description;
    if (data.status !== undefined) updateData.status = data.status;
    if (data.priority !== undefined) updateData.priority = data.priority;
    if (data.assigneeId !== undefined) updateData.assigneeId = data.assigneeId;
    if (data.dueDate !== undefined) updateData.dueDate = data.dueDate;
    if (data.tags !== undefined) updateData.tags = data.tags;
    if (data.sortOrder !== undefined) updateData.sortOrder = data.sortOrder;
    if (data.completedAt !== undefined) updateData.completedAt = data.completedAt;

    // Auto-set completedAt when status changes to 'done'
    if (data.status === 'done' && data.completedAt === undefined) {
      updateData.completedAt = new Date();
    }
    // Clear completedAt when status changes from 'done'
    if (data.status !== undefined && data.status !== 'done') {
      updateData.completedAt = null;
    }

    const [task] = await this.db.update(tasks).set(updateData).where(eq(tasks.id, id)).returning();

    return task ? this.toEntity(task) : null;
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.db.delete(tasks).where(eq(tasks.id, id)).returning({ id: tasks.id });
    return result.length > 0;
  }

  async count(_filter?: Record<string, unknown>): Promise<number> {
    const result = await this.db.select({ count: sql<number>`count(*)::int` }).from(tasks);
    return result[0]?.count ?? 0;
  }

  // ==========================================================================
  // TASK-SPECIFIC QUERIES
  // ==========================================================================

  async findByProject(projectId: string, options?: FindManyOptions): Promise<TaskEntity[]> {
    const results = await this.db.query.tasks.findMany({
      where: eq(tasks.projectId, projectId),
      limit: options?.limit ?? 100,
      offset: options?.offset ?? 0,
      orderBy: [asc(tasks.sortOrder), desc(tasks.createdAt)],
    });
    return results.map((r) => this.toEntity(r));
  }

  async findByProjectWithPagination(
    projectId: string,
    options?: FindManyOptions
  ): Promise<PaginatedResult<TaskEntity>> {
    const limit = options?.limit ?? 20;
    const offset = options?.offset ?? 0;

    const [totalResult, items] = await Promise.all([
      this.db
        .select({ count: sql<number>`count(*)::int` })
        .from(tasks)
        .where(eq(tasks.projectId, projectId)),
      this.db.query.tasks.findMany({
        where: eq(tasks.projectId, projectId),
        limit,
        offset,
        orderBy: [asc(tasks.sortOrder), desc(tasks.createdAt)],
      }),
    ]);

    const total = totalResult[0]?.count ?? 0;

    return {
      data: items.map((r) => this.toEntity(r)),
      pagination: {
        total,
        limit,
        offset,
        hasMore: offset + items.length < total,
      },
    };
  }

  async findByProjectAndStatus(
    projectId: string,
    status: TaskStatus,
    options?: FindManyOptions
  ): Promise<TaskEntity[]> {
    const results = await this.db.query.tasks.findMany({
      where: and(eq(tasks.projectId, projectId), eq(tasks.status, status)),
      limit: options?.limit ?? 100,
      offset: options?.offset ?? 0,
      orderBy: [asc(tasks.sortOrder), desc(tasks.createdAt)],
    });
    return results.map((r) => this.toEntity(r));
  }

  async findByAssignee(assigneeId: string, options?: FindManyOptions): Promise<TaskEntity[]> {
    const results = await this.db.query.tasks.findMany({
      where: eq(tasks.assigneeId, assigneeId),
      limit: options?.limit ?? 100,
      offset: options?.offset ?? 0,
      orderBy: [desc(tasks.dueDate), desc(tasks.createdAt)],
    });
    return results.map((r) => this.toEntity(r));
  }

  async countByProject(projectId: string): Promise<number> {
    const result = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(tasks)
      .where(eq(tasks.projectId, projectId));
    return result[0]?.count ?? 0;
  }

  async countByProjectAndStatus(projectId: string, status: TaskStatus): Promise<number> {
    const result = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(tasks)
      .where(and(eq(tasks.projectId, projectId), eq(tasks.status, status)));
    return result[0]?.count ?? 0;
  }

  async getNextTaskNumber(projectId: string): Promise<number> {
    const result = await this.db
      .select({ maxNumber: sql<number>`COALESCE(MAX(task_number), 0)::int` })
      .from(tasks)
      .where(eq(tasks.projectId, projectId));
    return (result[0]?.maxNumber ?? 0) + 1;
  }

  // ==========================================================================
  // KANBAN OPERATIONS
  // ==========================================================================

  async findGroupedByStatus(projectId: string): Promise<Record<TaskStatus, TaskEntity[]>> {
    const results = await this.db.query.tasks.findMany({
      where: eq(tasks.projectId, projectId),
      orderBy: [asc(tasks.sortOrder), desc(tasks.createdAt)],
    });

    const grouped: Record<TaskStatus, TaskEntity[]> = {
      todo: [],
      in_progress: [],
      review: [],
      done: [],
    };

    for (const task of results) {
      const entity = this.toEntity(task);
      grouped[entity.status].push(entity);
    }

    return grouped;
  }

  // ==========================================================================
  // HELPERS
  // ==========================================================================

  private buildOrderBy(orderBy?: { field: string; direction: 'asc' | 'desc' }) {
    if (!orderBy) return [asc(tasks.sortOrder), desc(tasks.createdAt)];

    switch (orderBy.field) {
      case 'title':
        return orderBy.direction === 'asc' ? asc(tasks.title) : desc(tasks.title);
      case 'status':
        return orderBy.direction === 'asc' ? asc(tasks.status) : desc(tasks.status);
      case 'priority':
        return orderBy.direction === 'asc' ? asc(tasks.priority) : desc(tasks.priority);
      case 'dueDate':
        return orderBy.direction === 'asc' ? asc(tasks.dueDate) : desc(tasks.dueDate);
      case 'createdAt':
        return orderBy.direction === 'asc' ? asc(tasks.createdAt) : desc(tasks.createdAt);
      case 'updatedAt':
        return orderBy.direction === 'asc' ? asc(tasks.updatedAt) : desc(tasks.updatedAt);
      default:
        return [asc(tasks.sortOrder), desc(tasks.createdAt)];
    }
  }

  private toEntity(row: typeof tasks.$inferSelect): TaskEntity {
    return {
      id: row.id,
      organizationId: row.organizationId,
      projectId: row.projectId,
      title: row.title,
      description: row.description,
      status: row.status as TaskStatus,
      priority: row.priority as TaskPriority,
      assigneeId: row.assigneeId,
      dueDate: row.dueDate,
      tags: (row.tags ?? []) as string[],
      sortOrder: row.sortOrder,
      taskNumber: row.taskNumber,
      createdBy: row.createdBy,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      completedAt: row.completedAt,
    };
  }
}
