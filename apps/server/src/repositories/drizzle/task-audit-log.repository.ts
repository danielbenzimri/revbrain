import { db as defaultDb, taskAuditLog, eq, desc, sql } from '@geometrix/database';
import type {
  TaskAuditLogRepository,
  TaskAuditLogEntity,
  CreateTaskAuditLogInput,
  FindManyOptions,
  TaskAuditAction,
  TaskStatus,
} from '@geometrix/contract';
import type { DrizzleDB } from './index.ts';

/**
 * Drizzle implementation of TaskAuditLogRepository
 * Append-only audit log for task changes
 */
export class DrizzleTaskAuditLogRepository implements TaskAuditLogRepository {
  constructor(private db: DrizzleDB = defaultDb) {}

  // ==========================================================================
  // BASE OPERATIONS (Append-only)
  // ==========================================================================

  async create(data: CreateTaskAuditLogInput): Promise<TaskAuditLogEntity> {
    const [log] = await this.db
      .insert(taskAuditLog)
      .values({
        organizationId: data.organizationId,
        projectId: data.projectId,
        taskId: data.taskId ?? null,
        taskTitle: data.taskTitle,
        action: data.action,
        userId: data.userId,
        userName: data.userName,
        details: data.details ?? null,
        reason: data.reason ?? null,
        signatureUrl: data.signatureUrl ?? null,
        previousStatus: data.previousStatus ?? null,
        newStatus: data.newStatus ?? null,
      })
      .returning();
    return this.toEntity(log);
  }

  async findMany(options?: FindManyOptions): Promise<TaskAuditLogEntity[]> {
    const results = await this.db.query.taskAuditLog.findMany({
      limit: options?.limit ?? 100,
      offset: options?.offset ?? 0,
      orderBy: [desc(taskAuditLog.createdAt)],
    });
    return results.map((r) => this.toEntity(r));
  }

  async count(_filter?: Record<string, unknown>): Promise<number> {
    const result = await this.db.select({ count: sql<number>`count(*)::int` }).from(taskAuditLog);
    return result[0]?.count ?? 0;
  }

  // ==========================================================================
  // QUERY METHODS
  // ==========================================================================

  async findByProject(projectId: string, options?: FindManyOptions): Promise<TaskAuditLogEntity[]> {
    const results = await this.db.query.taskAuditLog.findMany({
      where: eq(taskAuditLog.projectId, projectId),
      limit: options?.limit ?? 100,
      offset: options?.offset ?? 0,
      orderBy: [desc(taskAuditLog.createdAt)],
    });
    return results.map((r) => this.toEntity(r));
  }

  async findByTask(taskId: string, options?: FindManyOptions): Promise<TaskAuditLogEntity[]> {
    const results = await this.db.query.taskAuditLog.findMany({
      where: eq(taskAuditLog.taskId, taskId),
      limit: options?.limit ?? 100,
      offset: options?.offset ?? 0,
      orderBy: [desc(taskAuditLog.createdAt)],
    });
    return results.map((r) => this.toEntity(r));
  }

  // ==========================================================================
  // HELPERS
  // ==========================================================================

  private toEntity(row: typeof taskAuditLog.$inferSelect): TaskAuditLogEntity {
    return {
      id: row.id,
      organizationId: row.organizationId,
      projectId: row.projectId,
      taskId: row.taskId,
      taskTitle: row.taskTitle,
      action: row.action as TaskAuditAction,
      userId: row.userId,
      userName: row.userName,
      details: row.details,
      reason: row.reason,
      signatureUrl: row.signatureUrl,
      previousStatus: row.previousStatus as TaskStatus | null,
      newStatus: row.newStatus as TaskStatus | null,
      createdAt: row.createdAt,
    };
  }
}
