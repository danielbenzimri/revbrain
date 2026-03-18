import { db as defaultDb, workLogs, eq, desc, asc, and, sql, gte, lte } from '@revbrain/database';
import type {
  WorkLogRepository,
  WorkLogEntity,
  CreateWorkLogInput,
  UpdateWorkLogInput,
  FindManyOptions,
  PaginatedResult,
  WeatherType,
  WorkLogStatus,
  ResourceEntry,
  EquipmentEntry,
  WorkLogResourceEntry,
  WorkLogAttachment,
  WorkLogAuditEntry,
} from '@revbrain/contract';
import type { DrizzleDB } from './index.ts';

/**
 * Drizzle implementation of WorkLogRepository
 * Supports both legacy single-resource format and enhanced dual-resource format
 */
export class DrizzleWorkLogRepository implements WorkLogRepository {
  constructor(private db: DrizzleDB = defaultDb) {}

  // ==========================================================================
  // BASE CRUD
  // ==========================================================================

  async findById(id: string): Promise<WorkLogEntity | null> {
    const result = await this.db.query.workLogs.findFirst({
      where: eq(workLogs.id, id),
    });
    return result ? this.toEntity(result) : null;
  }

  async findMany(options?: FindManyOptions): Promise<WorkLogEntity[]> {
    const results = await this.db.query.workLogs.findMany({
      limit: options?.limit ?? 100,
      offset: options?.offset ?? 0,
      orderBy: this.buildOrderBy(options?.orderBy),
    });
    return results.map((r) => this.toEntity(r));
  }

  async create(data: CreateWorkLogInput): Promise<WorkLogEntity> {
    const [workLog] = await this.db
      .insert(workLogs)
      .values({
        organizationId: data.organizationId,
        projectId: data.projectId,
        logDate: data.logDate,
        weatherType: data.weatherType ?? null,
        weatherTempCelsius: data.weatherTempCelsius ?? null,
        // Enhanced resources
        contractorResources: data.contractorResources ?? [],
        externalResources: data.externalResources ?? [],
        // Legacy resources (for backwards compatibility)
        resources: data.resources ?? [],
        equipment: data.equipment ?? [],
        // Dual descriptions
        contractorWorkDescription: data.contractorWorkDescription ?? null,
        supervisorWorkDescription: data.supervisorWorkDescription ?? null,
        // Dual notes
        contractorNotes: data.contractorNotes ?? null,
        supervisorNotes: data.supervisorNotes ?? null,
        // Legacy fields
        activities: data.activities ?? null,
        issues: data.issues ?? null,
        safetyNotes: data.safetyNotes ?? null,
        // Additional fields
        trafficControllersInfo: data.trafficControllersInfo ?? null,
        exactAddress: data.exactAddress ?? null,
        createdBy: data.createdBy,
      })
      .returning();
    return this.toEntity(workLog);
  }

  async update(id: string, data: UpdateWorkLogInput): Promise<WorkLogEntity | null> {
    const updateData: Record<string, unknown> = {
      updatedAt: new Date(),
    };

    // Basic fields
    if (data.logDate !== undefined) updateData.logDate = data.logDate;
    if (data.status !== undefined) updateData.status = data.status;
    if (data.weatherType !== undefined) updateData.weatherType = data.weatherType;
    if (data.weatherTempCelsius !== undefined)
      updateData.weatherTempCelsius = data.weatherTempCelsius;

    // Enhanced resources
    if (data.contractorResources !== undefined)
      updateData.contractorResources = data.contractorResources;
    if (data.externalResources !== undefined) updateData.externalResources = data.externalResources;

    // Legacy resources
    if (data.resources !== undefined) updateData.resources = data.resources;
    if (data.equipment !== undefined) updateData.equipment = data.equipment;

    // Dual descriptions
    if (data.contractorWorkDescription !== undefined)
      updateData.contractorWorkDescription = data.contractorWorkDescription;
    if (data.supervisorWorkDescription !== undefined)
      updateData.supervisorWorkDescription = data.supervisorWorkDescription;

    // Dual notes
    if (data.contractorNotes !== undefined) updateData.contractorNotes = data.contractorNotes;
    if (data.supervisorNotes !== undefined) updateData.supervisorNotes = data.supervisorNotes;

    // Legacy fields
    if (data.activities !== undefined) updateData.activities = data.activities;
    if (data.issues !== undefined) updateData.issues = data.issues;
    if (data.safetyNotes !== undefined) updateData.safetyNotes = data.safetyNotes;

    // Additional fields
    if (data.trafficControllersInfo !== undefined)
      updateData.trafficControllersInfo = data.trafficControllersInfo;
    if (data.exactAddress !== undefined) updateData.exactAddress = data.exactAddress;
    if (data.attachments !== undefined) updateData.attachments = data.attachments;
    if (data.auditLog !== undefined) updateData.auditLog = data.auditLog;

    // Contractor signature
    if (data.contractorSignatureUrl !== undefined)
      updateData.contractorSignatureUrl = data.contractorSignatureUrl;
    if (data.contractorSignedBy !== undefined)
      updateData.contractorSignedBy = data.contractorSignedBy;
    if (data.contractorSignedAt !== undefined)
      updateData.contractorSignedAt = data.contractorSignedAt;

    // Inspector signature
    if (data.inspectorSignatureUrl !== undefined)
      updateData.inspectorSignatureUrl = data.inspectorSignatureUrl;
    if (data.inspectorSignedBy !== undefined) updateData.inspectorSignedBy = data.inspectorSignedBy;
    if (data.inspectorSignedAt !== undefined) updateData.inspectorSignedAt = data.inspectorSignedAt;

    const [workLog] = await this.db
      .update(workLogs)
      .set(updateData)
      .where(eq(workLogs.id, id))
      .returning();

    return workLog ? this.toEntity(workLog) : null;
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.db
      .delete(workLogs)
      .where(eq(workLogs.id, id))
      .returning({ id: workLogs.id });
    return result.length > 0;
  }

  async count(_filter?: Record<string, unknown>): Promise<number> {
    const result = await this.db.select({ count: sql<number>`count(*)::int` }).from(workLogs);
    return result[0]?.count ?? 0;
  }

  // ==========================================================================
  // WORK LOG-SPECIFIC QUERIES
  // ==========================================================================

  async findByProject(projectId: string, options?: FindManyOptions): Promise<WorkLogEntity[]> {
    const results = await this.db.query.workLogs.findMany({
      where: eq(workLogs.projectId, projectId),
      limit: options?.limit ?? 100,
      offset: options?.offset ?? 0,
      orderBy: [desc(workLogs.logDate)],
    });
    return results.map((r) => this.toEntity(r));
  }

  async findByProjectWithPagination(
    projectId: string,
    options?: FindManyOptions
  ): Promise<PaginatedResult<WorkLogEntity>> {
    const limit = options?.limit ?? 20;
    const offset = options?.offset ?? 0;

    const [totalResult, items] = await Promise.all([
      this.db
        .select({ count: sql<number>`count(*)::int` })
        .from(workLogs)
        .where(eq(workLogs.projectId, projectId)),
      this.db.query.workLogs.findMany({
        where: eq(workLogs.projectId, projectId),
        limit,
        offset,
        orderBy: [desc(workLogs.logDate)],
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
    status: WorkLogStatus,
    options?: FindManyOptions
  ): Promise<PaginatedResult<WorkLogEntity>> {
    const limit = options?.limit ?? 20;
    const offset = options?.offset ?? 0;

    const [totalResult, items] = await Promise.all([
      this.db
        .select({ count: sql<number>`count(*)::int` })
        .from(workLogs)
        .where(and(eq(workLogs.projectId, projectId), eq(workLogs.status, status))),
      this.db.query.workLogs.findMany({
        where: and(eq(workLogs.projectId, projectId), eq(workLogs.status, status)),
        limit,
        offset,
        orderBy: [desc(workLogs.logDate)],
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

  async findByDate(projectId: string, date: Date): Promise<WorkLogEntity | null> {
    // Normalize to date-only comparison
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    const result = await this.db.query.workLogs.findFirst({
      where: and(
        eq(workLogs.projectId, projectId),
        gte(workLogs.logDate, startOfDay),
        lte(workLogs.logDate, endOfDay)
      ),
    });

    return result ? this.toEntity(result) : null;
  }

  async findByDateRange(
    projectId: string,
    startDate: Date,
    endDate: Date
  ): Promise<WorkLogEntity[]> {
    const results = await this.db.query.workLogs.findMany({
      where: and(
        eq(workLogs.projectId, projectId),
        gte(workLogs.logDate, startDate),
        lte(workLogs.logDate, endDate)
      ),
      orderBy: [desc(workLogs.logDate)],
    });
    return results.map((r) => this.toEntity(r));
  }

  async countByProject(projectId: string): Promise<number> {
    const result = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(workLogs)
      .where(eq(workLogs.projectId, projectId));
    return result[0]?.count ?? 0;
  }

  async countByProjectAndStatus(projectId: string, status: WorkLogStatus): Promise<number> {
    const result = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(workLogs)
      .where(and(eq(workLogs.projectId, projectId), eq(workLogs.status, status)));
    return result[0]?.count ?? 0;
  }

  async getNextLogNumber(projectId: string): Promise<number> {
    const result = await this.db
      .select({ maxNumber: sql<number>`COALESCE(MAX(log_number), 0)::int` })
      .from(workLogs)
      .where(eq(workLogs.projectId, projectId));
    return (result[0]?.maxNumber ?? 0) + 1;
  }

  // ==========================================================================
  // HELPERS
  // ==========================================================================

  private buildOrderBy(orderBy?: { field: string; direction: 'asc' | 'desc' }) {
    if (!orderBy) return [desc(workLogs.logDate)];

    switch (orderBy.field) {
      case 'logDate':
        return orderBy.direction === 'asc' ? asc(workLogs.logDate) : desc(workLogs.logDate);
      case 'logNumber':
        return orderBy.direction === 'asc' ? asc(workLogs.logNumber) : desc(workLogs.logNumber);
      case 'status':
        return orderBy.direction === 'asc' ? asc(workLogs.status) : desc(workLogs.status);
      case 'createdAt':
        return orderBy.direction === 'asc' ? asc(workLogs.createdAt) : desc(workLogs.createdAt);
      case 'updatedAt':
        return orderBy.direction === 'asc' ? asc(workLogs.updatedAt) : desc(workLogs.updatedAt);
      default:
        return [desc(workLogs.logDate)];
    }
  }

  private toEntity(row: typeof workLogs.$inferSelect): WorkLogEntity {
    return {
      id: row.id,
      organizationId: row.organizationId,
      projectId: row.projectId,
      logDate: row.logDate,
      logNumber: (row as Record<string, unknown>).logNumber as number | null,
      status: ((row as Record<string, unknown>).status as WorkLogStatus) ?? 'draft',
      weatherType: row.weatherType as WeatherType | null,
      weatherTempCelsius: row.weatherTempCelsius,
      // Enhanced resources
      contractorResources: ((row as Record<string, unknown>).contractorResources ??
        []) as WorkLogResourceEntry[],
      externalResources: ((row as Record<string, unknown>).externalResources ??
        []) as WorkLogResourceEntry[],
      // Legacy resources
      resources: (row.resources ?? []) as ResourceEntry[],
      equipment: (row.equipment ?? []) as EquipmentEntry[],
      // Dual descriptions
      contractorWorkDescription:
        ((row as Record<string, unknown>).contractorWorkDescription as string) ?? null,
      supervisorWorkDescription:
        ((row as Record<string, unknown>).supervisorWorkDescription as string) ?? null,
      // Dual notes
      contractorNotes: ((row as Record<string, unknown>).contractorNotes as string) ?? null,
      supervisorNotes: ((row as Record<string, unknown>).supervisorNotes as string) ?? null,
      // Legacy fields
      activities: row.activities,
      issues: row.issues,
      safetyNotes: row.safetyNotes,
      // Additional fields
      trafficControllersInfo:
        ((row as Record<string, unknown>).trafficControllersInfo as string) ?? null,
      exactAddress: ((row as Record<string, unknown>).exactAddress as string) ?? null,
      attachments: ((row as Record<string, unknown>).attachments ?? []) as WorkLogAttachment[],
      auditLog: ((row as Record<string, unknown>).auditLog ?? []) as WorkLogAuditEntry[],
      // Signatures
      contractorSignatureUrl: row.contractorSignatureUrl,
      contractorSignedBy: row.contractorSignedBy,
      contractorSignedAt: row.contractorSignedAt ?? null,
      inspectorSignatureUrl: row.inspectorSignatureUrl,
      inspectorSignedBy: row.inspectorSignedBy,
      inspectorSignedAt: row.inspectorSignedAt ?? null,
      // Metadata
      createdBy: row.createdBy,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
