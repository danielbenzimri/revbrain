/**
 * PostgREST Salesforce Connection Log Repository
 *
 * Uses Supabase JS client (HTTP/PostgREST) instead of Drizzle (TCP/postgres.js).
 * Append-only audit trail for Salesforce connection lifecycle events
 * (connected, refreshed, refresh_failed, disconnected, etc.).
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  SalesforceConnectionLogRepository,
  SalesforceConnectionLogEntity,
  CreateSalesforceConnectionLogInput,
  FindManyOptions,
} from '@revbrain/contract';
import { insertOne } from './base.ts';
import { toCamelCase } from './case-map.ts';
import { applyFindManyOptions } from './base.ts';

export class PostgRESTSalesforceConnectionLogRepository
  implements SalesforceConnectionLogRepository
{
  constructor(private supabase: SupabaseClient) {}

  // ==========================================================================
  // MUTATIONS
  // ==========================================================================

  async create(
    data: CreateSalesforceConnectionLogInput
  ): Promise<SalesforceConnectionLogEntity> {
    return insertOne<SalesforceConnectionLogEntity>(
      this.supabase,
      'salesforce_connection_logs',
      {
        connectionId: data.connectionId,
        event: data.event,
        details: data.details ?? null,
        performedBy: data.performedBy ?? null,
      }
    );
  }

  // ==========================================================================
  // QUERIES
  // ==========================================================================

  async findByConnection(
    connectionId: string,
    options?: FindManyOptions
  ): Promise<SalesforceConnectionLogEntity[]> {
    let query = this.supabase
      .from('salesforce_connection_logs')
      .select('*')
      .eq('connection_id', connectionId);

    // Apply ordering and pagination (defaults to created_at desc)
    query = applyFindManyOptions(query, options);

    const { data, error } = await query;

    if (error || !data) return [];
    return data.map((row: Record<string, unknown>) =>
      toCamelCase<SalesforceConnectionLogEntity>(row)
    );
  }
}
