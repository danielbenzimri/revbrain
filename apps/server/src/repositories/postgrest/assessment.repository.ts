/**
 * PostgREST Assessment Repository
 *
 * Manages assessment runs and findings across two tables:
 * `assessment_runs` and `assessment_findings`.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  AssessmentRepository,
  AssessmentRunEntity,
  AssessmentFindingEntity,
  CreateAssessmentRunInput,
  AssessmentRunStatus,
  FindManyOptions,
} from '@revbrain/contract';
import { fetchOne, insertOne } from './base.ts';
import { toCamelCase, toSnakeCase } from './case-map.ts';

const ACTIVE_STATUSES: AssessmentRunStatus[] = ['queued', 'dispatched', 'running', 'cancel_requested'];

export class PostgRESTAssessmentRepository implements AssessmentRepository {
  constructor(private supabase: SupabaseClient) {}

  // ============================================================
  // Runs
  // ============================================================

  /** Create a new assessment run with sensible defaults. */
  async createRun(data: CreateAssessmentRunInput): Promise<AssessmentRunEntity> {
    return insertOne<AssessmentRunEntity>(this.supabase, 'assessment_runs', {
      projectId: data.projectId,
      organizationId: data.organizationId,
      connectionId: data.connectionId,
      createdBy: data.createdBy ?? null,
      mode: data.mode ?? 'full',
      rawSnapshotMode: data.rawSnapshotMode ?? 'errors_only',
      status: 'queued',
    });
  }

  /** Find a single run by ID. */
  async findRunById(id: string): Promise<AssessmentRunEntity | null> {
    return fetchOne<AssessmentRunEntity>(this.supabase, 'assessment_runs', 'id', id);
  }

  /** List runs for a project, newest first. */
  async findRunsByProject(
    projectId: string,
    options?: FindManyOptions
  ): Promise<AssessmentRunEntity[]> {
    const limit = options?.limit ?? 20;
    const offset = options?.offset ?? 0;

    const { data, error } = await this.supabase
      .from('assessment_runs')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error || !data) return [];
    return data.map((row: Record<string, unknown>) => toCamelCase<AssessmentRunEntity>(row));
  }

  /** Find the most recent active run for an organization (concurrency guard). */
  async findActiveRunByOrg(organizationId: string): Promise<AssessmentRunEntity | null> {
    const { data, error } = await this.supabase
      .from('assessment_runs')
      .select('*')
      .eq('organization_id', organizationId)
      .in('status', ACTIVE_STATUSES)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error || !data) return null;
    return toCamelCase<AssessmentRunEntity>(data);
  }

  /** Find the latest run for a project regardless of status. */
  async findLatestRunByProject(projectId: string): Promise<AssessmentRunEntity | null> {
    const { data, error } = await this.supabase
      .from('assessment_runs')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error || !data) return null;
    return toCamelCase<AssessmentRunEntity>(data);
  }

  /** Update run status with optional extra fields (reason, timestamps, error). */
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
    if (extra?.cancelRequestedAt !== undefined) updateData.cancelRequestedAt = extra.cancelRequestedAt;
    if (extra?.completedAt !== undefined) updateData.completedAt = extra.completedAt;
    if (extra?.failedAt !== undefined) updateData.failedAt = extra.failedAt;
    if (extra?.error !== undefined) updateData.error = extra.error;

    const snakeData = toSnakeCase(updateData);
    const { data, error } = await this.supabase
      .from('assessment_runs')
      .update(snakeData)
      .eq('id', id)
      .select()
      .maybeSingle();

    if (error) throw new Error(`PostgREST update assessment_runs/${id} failed: ${error.message}`);
    return data ? toCamelCase<AssessmentRunEntity>(data) : null;
  }

  /** Compare-and-swap dispatch: atomically move queued -> dispatched. */
  async casDispatch(id: string): Promise<AssessmentRunEntity | null> {
    const { data, error } = await this.supabase
      .from('assessment_runs')
      .update({ status: 'dispatched', dispatched_at: new Date().toISOString() })
      .eq('id', id)
      .eq('status', 'queued')
      .select()
      .maybeSingle();

    if (error) throw new Error(`PostgREST casDispatch assessment_runs/${id} failed: ${error.message}`);
    return data ? toCamelCase<AssessmentRunEntity>(data) : null;
  }

  // ============================================================
  // Findings
  // ============================================================

  /** List findings for a run with optional domain filter and pagination. */
  async findFindingsByRun(
    runId: string,
    options?: FindManyOptions & { domain?: string }
  ): Promise<AssessmentFindingEntity[]> {
    const limit = options?.limit ?? 500;
    const offset = options?.offset ?? 0;

    let query = this.supabase
      .from('assessment_findings')
      .select('*')
      .eq('run_id', runId);

    if (options?.domain) {
      query = query.eq('domain', options.domain);
    }

    query = query
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    const { data, error } = await query;
    if (error || !data) return [];
    return data.map((row: Record<string, unknown>) => toCamelCase<AssessmentFindingEntity>(row));
  }

  /** Count findings for a run with optional domain filter. */
  async countFindingsByRun(runId: string, domain?: string): Promise<number> {
    let query = this.supabase
      .from('assessment_findings')
      .select('*', { count: 'exact', head: true })
      .eq('run_id', runId);

    if (domain) {
      query = query.eq('domain', domain);
    }

    const { count, error } = await query;
    if (error) return 0;
    return count ?? 0;
  }

  // ============================================================
  // Concurrency guards
  // ============================================================

  /** Count all active runs across all organizations. */
  async countActiveRuns(): Promise<number> {
    const { count, error } = await this.supabase
      .from('assessment_runs')
      .select('*', { count: 'exact', head: true })
      .in('status', ACTIVE_STATUSES);

    if (error) return 0;
    return count ?? 0;
  }

  /** Count active runs for a specific organization. */
  async countActiveRunsByOrg(organizationId: string): Promise<number> {
    const { count, error } = await this.supabase
      .from('assessment_runs')
      .select('*', { count: 'exact', head: true })
      .in('status', ACTIVE_STATUSES)
      .eq('organization_id', organizationId);

    if (error) return 0;
    return count ?? 0;
  }
}
