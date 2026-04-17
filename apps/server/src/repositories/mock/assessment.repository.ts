import type {
  AssessmentRepository,
  AssessmentRunEntity,
  AssessmentFindingEntity,
  CreateAssessmentRunInput,
  AssessmentRunStatus,
  FindManyOptions,
} from '@revbrain/contract';
import { SEED_ASSESSMENT_RUNS, SEED_ASSESSMENT_FINDINGS } from '@revbrain/seed-data';
import crypto from 'node:crypto';

const ACTIVE_STATUSES: AssessmentRunStatus[] = [
  'queued',
  'dispatched',
  'running',
  'cancel_requested',
];

/**
 * In-memory mock implementation of AssessmentRepository.
 * Used when USE_MOCK_DATA=true.
 * Pre-populated with seed data so mock mode returns realistic runs.
 */
export class MockAssessmentRepository implements AssessmentRepository {
  private runs: AssessmentRunEntity[] = [...SEED_ASSESSMENT_RUNS.map((r) => ({ ...r }))];
  private findings: AssessmentFindingEntity[] = [
    ...SEED_ASSESSMENT_FINDINGS.map((f) => ({ ...f })),
  ];

  async createRun(data: CreateAssessmentRunInput): Promise<AssessmentRunEntity> {
    const run: AssessmentRunEntity = {
      id: crypto.randomUUID(),
      projectId: data.projectId,
      organizationId: data.organizationId,
      connectionId: data.connectionId,
      status: 'queued',
      statusReason: null,
      mode: data.mode ?? 'full',
      rawSnapshotMode: data.rawSnapshotMode ?? 'errors_only',
      progress: {},
      orgFingerprint: null,
      workerId: null,
      leaseExpiresAt: null,
      lastHeartbeatAt: null,
      retryCount: 0,
      maxRetries: 2,
      idempotencyKey: data.idempotencyKey ?? null,
      dispatchedAt: null,
      startedAt: null,
      completedAt: null,
      failedAt: null,
      cancelRequestedAt: null,
      durationMs: null,
      apiCallsUsed: null,
      recordsExtracted: null,
      completenessPct: null,
      error: null,
      createdBy: data.createdBy ?? null,
      createdAt: new Date(),
    };
    this.runs.push(run);
    return run;
  }

  async findRunById(id: string): Promise<AssessmentRunEntity | null> {
    return this.runs.find((r) => r.id === id) ?? null;
  }

  async findRunsByProject(
    projectId: string,
    options?: FindManyOptions
  ): Promise<AssessmentRunEntity[]> {
    const filtered = this.runs
      .filter((r) => r.projectId === projectId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    const offset = options?.offset ?? 0;
    const limit = options?.limit ?? 20;
    return filtered.slice(offset, offset + limit);
  }

  async findActiveRunByOrg(organizationId: string): Promise<AssessmentRunEntity | null> {
    return (
      this.runs.find(
        (r) => r.organizationId === organizationId && ACTIVE_STATUSES.includes(r.status)
      ) ?? null
    );
  }

  async findLatestRunByProject(projectId: string): Promise<AssessmentRunEntity | null> {
    const sorted = this.runs
      .filter((r) => r.projectId === projectId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    return sorted[0] ?? null;
  }

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
    const run = this.runs.find((r) => r.id === id);
    if (!run) return null;
    run.status = status;
    if (extra?.statusReason !== undefined) run.statusReason = extra.statusReason;
    if (extra?.cancelRequestedAt !== undefined) run.cancelRequestedAt = extra.cancelRequestedAt;
    if (extra?.completedAt !== undefined) run.completedAt = extra.completedAt;
    if (extra?.failedAt !== undefined) run.failedAt = extra.failedAt;
    if (extra?.error !== undefined) run.error = extra.error;
    return run;
  }

  async casDispatch(id: string): Promise<AssessmentRunEntity | null> {
    const run = this.runs.find((r) => r.id === id && r.status === 'queued');
    if (!run) return null;
    run.status = 'dispatched';
    run.dispatchedAt = new Date();
    return run;
  }

  async findFindingsByRun(
    runId: string,
    options?: FindManyOptions & { domain?: string }
  ): Promise<AssessmentFindingEntity[]> {
    let filtered = this.findings.filter((f) => f.runId === runId);
    if (options?.domain) filtered = filtered.filter((f) => f.domain === options.domain);
    const offset = options?.offset ?? 0;
    const limit = options?.limit ?? 500;
    return filtered.slice(offset, offset + limit);
  }

  async countFindingsByRun(runId: string, domain?: string): Promise<number> {
    let filtered = this.findings.filter((f) => f.runId === runId);
    if (domain) filtered = filtered.filter((f) => f.domain === domain);
    return filtered.length;
  }

  async countActiveRuns(): Promise<number> {
    return this.runs.filter((r) => ACTIVE_STATUSES.includes(r.status)).length;
  }

  async countActiveRunsByOrg(organizationId: string): Promise<number> {
    return this.runs.filter(
      (r) => r.organizationId === organizationId && ACTIVE_STATUSES.includes(r.status)
    ).length;
  }
}
