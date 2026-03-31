/**
 * PostgREST Salesforce Connection Repository
 *
 * Uses Supabase JS client (HTTP/PostgREST) instead of Drizzle (TCP/postgres.js).
 * Manages Salesforce connection metadata (identity, status, audit fields).
 * Does NOT handle encrypted tokens — those live in SalesforceConnectionSecretsRepository.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  SalesforceConnectionRepository,
  SalesforceConnectionEntity,
  CreateSalesforceConnectionInput,
} from '@revbrain/contract';
import { fetchOne, fetchMany, insertOne } from './base.ts';
import { toCamelCase, toSnakeCase } from './case-map.ts';

export class PostgRESTSalesforceConnectionRepository implements SalesforceConnectionRepository {
  constructor(private supabase: SupabaseClient) {}

  // ==========================================================================
  // QUERIES
  // ==========================================================================

  async findById(id: string): Promise<SalesforceConnectionEntity | null> {
    return fetchOne<SalesforceConnectionEntity>(this.supabase, 'salesforce_connections', 'id', id);
  }

  async findByProjectAndRole(
    projectId: string,
    role: 'source' | 'target'
  ): Promise<SalesforceConnectionEntity | null> {
    const { data, error } = await this.supabase
      .from('salesforce_connections')
      .select('*')
      .eq('project_id', projectId)
      .eq('connection_role', role)
      .maybeSingle();

    if (error || !data) return null;
    return toCamelCase<SalesforceConnectionEntity>(data);
  }

  async findByProject(projectId: string): Promise<SalesforceConnectionEntity[]> {
    return fetchMany<SalesforceConnectionEntity>(this.supabase, 'salesforce_connections', {
      filter: { projectId },
    });
  }

  async findByOrganization(organizationId: string): Promise<SalesforceConnectionEntity[]> {
    return fetchMany<SalesforceConnectionEntity>(this.supabase, 'salesforce_connections', {
      filter: { organizationId },
    });
  }

  async findAllActive(): Promise<SalesforceConnectionEntity[]> {
    return fetchMany<SalesforceConnectionEntity>(this.supabase, 'salesforce_connections', {
      filter: { status: 'active' },
    });
  }

  // ==========================================================================
  // MUTATIONS
  // ==========================================================================

  async create(data: CreateSalesforceConnectionInput): Promise<SalesforceConnectionEntity> {
    return insertOne<SalesforceConnectionEntity>(this.supabase, 'salesforce_connections', {
      projectId: data.projectId,
      organizationId: data.organizationId,
      connectionRole: data.connectionRole,
      salesforceOrgId: data.salesforceOrgId,
      salesforceInstanceUrl: data.salesforceInstanceUrl,
      customLoginUrl: data.customLoginUrl ?? null,
      oauthBaseUrl: data.oauthBaseUrl,
      salesforceUserId: data.salesforceUserId ?? null,
      salesforceUsername: data.salesforceUsername ?? null,
      instanceType: data.instanceType,
      apiVersion: data.apiVersion ?? null,
      connectedBy: data.connectedBy,
      status: 'active',
    });
  }

  async updateStatus(
    id: string,
    status: string,
    error?: string | null
  ): Promise<SalesforceConnectionEntity | null> {
    const updateData: Record<string, unknown> = {
      status,
      updatedAt: new Date().toISOString(),
    };

    if (error !== undefined) {
      updateData.lastError = error;
      updateData.lastErrorAt = error ? new Date().toISOString() : null;
    }

    const snakeData = toSnakeCase(updateData);
    const { data, error: dbError } = await this.supabase
      .from('salesforce_connections')
      .update(snakeData)
      .eq('id', id)
      .select()
      .maybeSingle();

    if (dbError || !data) return null;
    return toCamelCase<SalesforceConnectionEntity>(data);
  }

  async updateMetadata(
    id: string,
    metadata: Record<string, unknown>
  ): Promise<SalesforceConnectionEntity | null> {
    const snakeData = toSnakeCase({
      connectionMetadata: metadata,
      updatedAt: new Date().toISOString(),
    });

    const { data, error } = await this.supabase
      .from('salesforce_connections')
      .update(snakeData)
      .eq('id', id)
      .select()
      .maybeSingle();

    if (error || !data) return null;
    return toCamelCase<SalesforceConnectionEntity>(data);
  }

  async disconnect(id: string, disconnectedBy: string): Promise<boolean> {
    const now = new Date().toISOString();
    const snakeData = toSnakeCase({
      status: 'disconnected',
      disconnectedBy,
      disconnectedAt: now,
      updatedAt: now,
    });

    const { data, error } = await this.supabase
      .from('salesforce_connections')
      .update(snakeData)
      .eq('id', id)
      .select()
      .maybeSingle();

    return !error && !!data;
  }

  async delete(id: string): Promise<boolean> {
    const { error } = await this.supabase.from('salesforce_connections').delete().eq('id', id);
    return !error;
  }
}
