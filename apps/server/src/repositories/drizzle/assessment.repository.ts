import { db as defaultDb } from '@revbrain/database/client';
import { assessmentRuns, assessmentFindings } from '@revbrain/database';
import { eq, desc, and, sql, inArray } from 'drizzle-orm';
import type {
  AssessmentRepository,
  AssessmentRunEntity,
  AssessmentFindingEntity,
  CreateAssessmentRunInput,
  AssessmentRunStatus,
  FindManyOptions,
} from '@revbrain/contract';
import type { DrizzleDB } from './index.ts';

/** Active run statuses (not terminal) */
const ACTIVE_STATUSES: AssessmentRunStatus[] = [
  'queued',
  'dispatched',
  'running',
  'cancel_requested',
];

/**
 * Drizzle implementation of AssessmentRepository
 */
export class DrizzleAssessmentRepository implements AssessmentRepository {
  constructor(private db: DrizzleDB = defaultDb) {}

  // ==========================================================================
  // RUNS
  // ==========================================================================

  async createRun(data: CreateAssessmentRunInput): Promise<AssessmentRunEntity> {
    const [run] = await this.db
      .insert(assessmentRuns)
      .values({
        projectId: data.projectId,
        organizationId: data.organizationId,
        connectionId: data.connectionId,
        mode: data.mode ?? 'full',
        rawSnapshotMode: data.rawSnapshotMode ?? 'errors_only',
        idempotencyKey: data.idempotencyKey ?? null,
        createdBy: data.createdBy ?? null,
        status: 'queued',
      })
      .returning();
    return this.toRunEntity(run);
  }

  async findRunById(id: string): Promise<AssessmentRunEntity | null> {
    const result = await this.db.query.assessmentRuns.findFirst({
      where: eq(assessmentRuns.id, id),
    });
    return result ? this.toRunEntity(result) : null;
  }

  async findRunsByProject(
    projectId: string,
    options?: FindManyOptions
  ): Promise<AssessmentRunEntity[]> {
    const results = await this.db.query.assessmentRuns.findMany({
      where: eq(assessmentRuns.projectId, projectId),
      limit: options?.limit ?? 20,
      offset: options?.offset ?? 0,
      orderBy: desc(assessmentRuns.createdAt),
    });
    return results.map((r) => this.toRunEntity(r));
  }

  async findActiveRunByOrg(organizationId: string): Promise<AssessmentRunEntity | null> {
    const result = await this.db.query.assessmentRuns.findFirst({
      where: and(
        eq(assessmentRuns.organizationId, organizationId),
        inArray(assessmentRuns.status, ACTIVE_STATUSES)
      ),
      orderBy: desc(assessmentRuns.createdAt),
    });
    return result ? this.toRunEntity(result) : null;
  }

  async findLatestRunByProject(projectId: string): Promise<AssessmentRunEntity | null> {
    const result = await this.db.query.assessmentRuns.findFirst({
      where: eq(assessmentRuns.projectId, projectId),
      orderBy: desc(assessmentRuns.createdAt),
    });
    return result ? this.toRunEntity(result) : null;
  }

  /**
   * Update run status with optional extra fields.
   * Validates org-scoping implicitly (caller should verify).
   */
  async updateRunStatus(
    id: string,
    status: AssessmentRunStatus,
    extra?: Partial<
      Pick<
        AssessmentRunEntity,
        'statusReason' | 'cancelRequestedAt' | 'completedAt' | 'failedAt' | 'error'
      >
    >
  ): Promise<AssessmentRunEntity | null> {
    const updateData: Record<string, unknown> = { status };
    if (extra?.statusReason !== undefined) updateData.statusReason = extra.statusReason;
    if (extra?.cancelRequestedAt !== undefined)
      updateData.cancelRequestedAt = extra.cancelRequestedAt;
    if (extra?.completedAt !== undefined) updateData.completedAt = extra.completedAt;
    if (extra?.failedAt !== undefined) updateData.failedAt = extra.failedAt;
    if (extra?.error !== undefined) updateData.error = extra.error;

    const [updated] = await this.db
      .update(assessmentRuns)
      .set(updateData)
      .where(eq(assessmentRuns.id, id))
      .returning();
    return updated ? this.toRunEntity(updated) : null;
  }

  /**
   * CAS dispatch: atomically transition queued → dispatched.
   * Returns null if the run is not in 'queued' status (already dispatched or cancelled).
   */
  async casDispatch(id: string): Promise<AssessmentRunEntity | null> {
    const [updated] = await this.db
      .update(assessmentRuns)
      .set({
        status: 'dispatched',
        dispatchedAt: new Date(),
      })
      .where(and(eq(assessmentRuns.id, id), eq(assessmentRuns.status, 'queued')))
      .returning();
    return updated ? this.toRunEntity(updated) : null;
  }

  // ==========================================================================
  // FINDINGS
  // ==========================================================================

  async findFindingsByRun(
    runId: string,
    options?: FindManyOptions & { domain?: string }
  ): Promise<AssessmentFindingEntity[]> {
    const conditions = [eq(assessmentFindings.runId, runId)];
    if (options?.domain) {
      conditions.push(eq(assessmentFindings.domain, options.domain));
    }

    const results = await this.db.query.assessmentFindings.findMany({
      where: and(...conditions),
      limit: options?.limit ?? 500,
      offset: options?.offset ?? 0,
      orderBy: desc(assessmentFindings.createdAt),
    });
    return results.map((r) => this.toFindingEntity(r));
  }

  async countFindingsByRun(runId: string, domain?: string): Promise<number> {
    const conditions = [eq(assessmentFindings.runId, runId)];
    if (domain) conditions.push(eq(assessmentFindings.domain, domain));

    const [result] = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(assessmentFindings)
      .where(and(...conditions));
    return Number(result?.count ?? 0);
  }

  // ==========================================================================
  // CONCURRENCY GUARDS
  // ==========================================================================

  async countActiveRuns(): Promise<number> {
    const [result] = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(assessmentRuns)
      .where(inArray(assessmentRuns.status, ACTIVE_STATUSES));
    return Number(result?.count ?? 0);
  }

  async countActiveRunsByOrg(organizationId: string): Promise<number> {
    const [result] = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(assessmentRuns)
      .where(
        and(
          eq(assessmentRuns.organizationId, organizationId),
          inArray(assessmentRuns.status, ACTIVE_STATUSES)
        )
      );
    return Number(result?.count ?? 0);
  }

  // ==========================================================================
  // ENTITY MAPPING
  // ==========================================================================

  private toRunEntity(row: typeof assessmentRuns.$inferSelect): AssessmentRunEntity {
    return {
      id: row.id,
      projectId: row.projectId,
      organizationId: row.organizationId,
      connectionId: row.connectionId,
      status: row.status as AssessmentRunStatus,
      statusReason: row.statusReason,
      mode: row.mode,
      rawSnapshotMode: row.rawSnapshotMode,
      progress: (row.progress as Record<string, unknown>) ?? {},
      orgFingerprint: (row.orgFingerprint as Record<string, unknown>) ?? null,
      workerId: row.workerId,
      leaseExpiresAt: row.leaseExpiresAt,
      lastHeartbeatAt: row.lastHeartbeatAt,
      retryCount: row.retryCount,
      maxRetries: row.maxRetries,
      idempotencyKey: row.idempotencyKey,
      dispatchedAt: row.dispatchedAt,
      startedAt: row.startedAt,
      completedAt: row.completedAt,
      failedAt: row.failedAt,
      cancelRequestedAt: row.cancelRequestedAt,
      durationMs: row.durationMs,
      apiCallsUsed: row.apiCallsUsed,
      recordsExtracted: row.recordsExtracted,
      completenessPct: row.completenessPct,
      error: row.error,
      createdBy: row.createdBy,
      createdAt: row.createdAt,
    };
  }

  private toFindingEntity(row: typeof assessmentFindings.$inferSelect): AssessmentFindingEntity {
    return {
      id: row.id,
      runId: row.runId,
      domain: row.domain,
      collectorName: row.collectorName,
      artifactType: row.artifactType,
      artifactName: row.artifactName,
      artifactId: row.artifactId,
      findingKey: row.findingKey,
      sourceType: row.sourceType,
      riskLevel: row.riskLevel,
      complexityLevel: row.complexityLevel,
      migrationRelevance: row.migrationRelevance,
      rcaTargetConcept: row.rcaTargetConcept,
      rcaMappingComplexity: row.rcaMappingComplexity,
      evidenceRefs: (row.evidenceRefs as unknown[]) ?? [],
      notes: row.notes,
      countValue: row.countValue,
      textValue: row.textValue,
      createdAt: row.createdAt,
    };
  }
}
