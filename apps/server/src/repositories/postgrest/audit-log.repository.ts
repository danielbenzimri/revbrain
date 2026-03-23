/**
 * PostgREST Audit Log Repository
 *
 * Audit logs are append-only (INSERT + SELECT only).
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  AuditLogRepository,
  AuditLogEntity,
  CreateAuditLogInput,
  FindManyOptions,
} from '@revbrain/contract';
import { fetchMany, insertOne, countRows, applyFindManyOptions, applyFilters } from './base.ts';
import { toCamelCase } from './case-map.ts';

export class PostgRESTAuditLogRepository implements AuditLogRepository {
  constructor(private supabase: SupabaseClient) {}

  async create(data: CreateAuditLogInput): Promise<AuditLogEntity> {
    return insertOne<AuditLogEntity>(this.supabase, 'audit_logs', {
      userId: data.userId ?? null,
      organizationId: data.organizationId ?? null,
      action: data.action,
      targetUserId: data.targetUserId ?? null,
      metadata: data.metadata ?? null,
      ipAddress: data.ipAddress ?? null,
      userAgent: data.userAgent ?? null,
    });
  }

  async findMany(options?: FindManyOptions): Promise<AuditLogEntity[]> {
    return fetchMany<AuditLogEntity>(this.supabase, 'audit_logs', options);
  }

  async count(filter?: Record<string, unknown>): Promise<number> {
    return countRows(this.supabase, 'audit_logs', filter);
  }

  async findByOrganization(
    organizationId: string,
    options?: FindManyOptions
  ): Promise<AuditLogEntity[]> {
    return this.queryWithFilter('organization_id', organizationId, options);
  }

  async findByUser(userId: string, options?: FindManyOptions): Promise<AuditLogEntity[]> {
    return this.queryWithFilter('user_id', userId, options);
  }

  async findByAction(action: string, options?: FindManyOptions): Promise<AuditLogEntity[]> {
    return this.queryWithFilter('action', action, options);
  }

  async findByTargetUser(
    targetUserId: string,
    options?: FindManyOptions
  ): Promise<AuditLogEntity[]> {
    return this.queryWithFilter('target_user_id', targetUserId, options);
  }

  // Helper: query with a single column filter + standard pagination
  private async queryWithFilter(
    column: string,
    value: string,
    options?: FindManyOptions
  ): Promise<AuditLogEntity[]> {
    let query = this.supabase.from('audit_logs').select('*').eq(column, value);

    if (options?.filter) {
      query = applyFilters(query, options.filter);
    }

    query = applyFindManyOptions(query, options);
    const { data, error } = await query;
    if (error || !data) return [];
    return data.map((row: Record<string, unknown>) => toCamelCase<AuditLogEntity>(row));
  }
}
