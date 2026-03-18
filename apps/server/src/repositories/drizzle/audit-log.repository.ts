import { db as defaultDb, auditLogs, eq, desc, sql } from '@revbrain/database';
import type {
  AuditLogRepository,
  AuditLogEntity,
  CreateAuditLogInput,
  FindManyOptions,
} from '@revbrain/contract';
import type { DrizzleDB } from './index.ts';

/**
 * Drizzle implementation of AuditLogRepository
 *
 * Audit logs are append-only - no update or delete operations.
 */
export class DrizzleAuditLogRepository implements AuditLogRepository {
  constructor(private db: DrizzleDB = defaultDb) {}

  // ==========================================================================
  // CREATE (Append-only)
  // ==========================================================================

  async create(data: CreateAuditLogInput): Promise<AuditLogEntity> {
    const [log] = await this.db
      .insert(auditLogs)
      .values({
        userId: data.userId ?? null,
        organizationId: data.organizationId ?? null,
        action: data.action,
        targetUserId: data.targetUserId ?? null,
        metadata: data.metadata ?? null,
        ipAddress: data.ipAddress ?? null,
        userAgent: data.userAgent ?? null,
      })
      .returning();
    return this.toEntity(log);
  }

  // ==========================================================================
  // READ OPERATIONS
  // ==========================================================================

  async findMany(options?: FindManyOptions): Promise<AuditLogEntity[]> {
    const results = await this.db.query.auditLogs.findMany({
      limit: options?.limit ?? 100,
      offset: options?.offset ?? 0,
      orderBy: desc(auditLogs.createdAt),
    });
    return results.map((r) => this.toEntity(r));
  }

  async count(_filter?: Record<string, unknown>): Promise<number> {
    const result = await this.db.select({ count: sql<number>`count(*)::int` }).from(auditLogs);
    return result[0]?.count ?? 0;
  }

  async findByOrganization(
    organizationId: string,
    options?: FindManyOptions
  ): Promise<AuditLogEntity[]> {
    const results = await this.db.query.auditLogs.findMany({
      where: eq(auditLogs.organizationId, organizationId),
      limit: options?.limit ?? 100,
      offset: options?.offset ?? 0,
      orderBy: desc(auditLogs.createdAt),
    });
    return results.map((r) => this.toEntity(r));
  }

  async findByUser(userId: string, options?: FindManyOptions): Promise<AuditLogEntity[]> {
    const results = await this.db.query.auditLogs.findMany({
      where: eq(auditLogs.userId, userId),
      limit: options?.limit ?? 100,
      offset: options?.offset ?? 0,
      orderBy: desc(auditLogs.createdAt),
    });
    return results.map((r) => this.toEntity(r));
  }

  async findByAction(action: string, options?: FindManyOptions): Promise<AuditLogEntity[]> {
    const results = await this.db.query.auditLogs.findMany({
      where: eq(auditLogs.action, action),
      limit: options?.limit ?? 100,
      offset: options?.offset ?? 0,
      orderBy: desc(auditLogs.createdAt),
    });
    return results.map((r) => this.toEntity(r));
  }

  async findByTargetUser(
    targetUserId: string,
    options?: FindManyOptions
  ): Promise<AuditLogEntity[]> {
    const results = await this.db.query.auditLogs.findMany({
      where: eq(auditLogs.targetUserId, targetUserId),
      limit: options?.limit ?? 100,
      offset: options?.offset ?? 0,
      orderBy: desc(auditLogs.createdAt),
    });
    return results.map((r) => this.toEntity(r));
  }

  // ==========================================================================
  // HELPERS
  // ==========================================================================

  private toEntity(row: typeof auditLogs.$inferSelect): AuditLogEntity {
    return {
      id: row.id,
      userId: row.userId,
      organizationId: row.organizationId,
      action: row.action,
      targetUserId: row.targetUserId,
      metadata: row.metadata as Record<string, unknown> | null,
      ipAddress: row.ipAddress,
      userAgent: row.userAgent,
      createdAt: row.createdAt,
    };
  }
}
