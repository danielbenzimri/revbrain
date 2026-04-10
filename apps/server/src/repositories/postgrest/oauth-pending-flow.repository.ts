/**
 * PostgREST OAuth Pending Flow Repository
 *
 * Uses Supabase JS client (HTTP/PostgREST) instead of Drizzle (TCP/postgres.js).
 * Manages short-lived PKCE state for OAuth authorization flows.
 * Rows are created when a user initiates "Connect Salesforce" and deleted
 * after successful token exchange or when they expire (10-minute TTL).
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  OauthPendingFlowRepository,
  OauthPendingFlowEntity,
  CreateOauthPendingFlowInput,
} from '@revbrain/contract';
import { fetchOne, insertOne } from './base.ts';
import { toCamelCase } from './case-map.ts';

export class PostgRESTOauthPendingFlowRepository implements OauthPendingFlowRepository {
  constructor(private supabase: SupabaseClient) {}

  // ==========================================================================
  // QUERIES
  // ==========================================================================

  async findByNonce(nonce: string): Promise<OauthPendingFlowEntity | null> {
    return fetchOne<OauthPendingFlowEntity>(this.supabase, 'oauth_pending_flows', 'nonce', nonce);
  }

  /**
   * Find a non-expired flow for a project+role combination.
   * Used to derive "connecting" status on the client.
   */
  async findLiveByProjectAndRole(
    projectId: string,
    role: string
  ): Promise<OauthPendingFlowEntity | null> {
    const { data, error } = await this.supabase
      .from('oauth_pending_flows')
      .select('*')
      .eq('project_id', projectId)
      .eq('connection_role', role)
      .maybeSingle();

    if (error || !data) return null;

    const entity = toCamelCase<OauthPendingFlowEntity>(data);

    // Check expiry in application code to avoid DB-specific date comparison syntax
    if (entity.expiresAt <= new Date()) return null;

    return entity;
  }

  // ==========================================================================
  // MUTATIONS
  // ==========================================================================

  async create(data: CreateOauthPendingFlowInput): Promise<OauthPendingFlowEntity> {
    return insertOne<OauthPendingFlowEntity>(this.supabase, 'oauth_pending_flows', {
      nonce: data.nonce,
      projectId: data.projectId,
      organizationId: data.organizationId,
      userId: data.userId,
      connectionRole: data.connectionRole,
      codeVerifier: data.codeVerifier,
      oauthBaseUrl: data.oauthBaseUrl,
      expiresAt: data.expiresAt.toISOString(),
    });
  }

  async deleteByNonce(nonce: string): Promise<boolean> {
    const { error } = await this.supabase.from('oauth_pending_flows').delete().eq('nonce', nonce);
    return !error;
  }

  /**
   * Insert a new pending flow for a project+role.
   *
   * If a flow already exists for the same project+role:
   * - If still live (not expired): throws to prevent duplicate flows
   * - If expired: deletes the stale row and inserts the new one
   */
  async upsertForProject(data: CreateOauthPendingFlowInput): Promise<OauthPendingFlowEntity> {
    const { data: existing, error: findError } = await this.supabase
      .from('oauth_pending_flows')
      .select('*')
      .eq('project_id', data.projectId)
      .eq('connection_role', data.connectionRole)
      .maybeSingle();

    if (!findError && existing) {
      const entity = toCamelCase<OauthPendingFlowEntity>(existing);

      if (entity.expiresAt > new Date()) {
        throw new Error('Connection flow already in progress');
      }

      // Expired flow — clean it up before inserting new one
      await this.supabase.from('oauth_pending_flows').delete().eq('nonce', existing.nonce);
    }

    return insertOne<OauthPendingFlowEntity>(this.supabase, 'oauth_pending_flows', {
      nonce: data.nonce,
      projectId: data.projectId,
      organizationId: data.organizationId,
      userId: data.userId,
      connectionRole: data.connectionRole,
      codeVerifier: data.codeVerifier,
      oauthBaseUrl: data.oauthBaseUrl,
      expiresAt: data.expiresAt.toISOString(),
    });
  }

  /**
   * Delete all expired pending flows.
   * Called by a scheduled cleanup job to prevent table bloat.
   *
   * @returns Number of deleted rows
   */
  async cleanupExpired(): Promise<number> {
    const { data, error } = await this.supabase
      .from('oauth_pending_flows')
      .delete()
      .lt('expires_at', new Date().toISOString())
      .select('nonce');

    if (error || !data) return 0;
    return data.length;
  }
}
