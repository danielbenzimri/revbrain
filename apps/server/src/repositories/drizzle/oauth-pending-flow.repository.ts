import { db as defaultDb } from '@revbrain/database/client';
import { oauthPendingFlows } from '@revbrain/database';
import { eq, and, sql } from 'drizzle-orm';
import type {
  OauthPendingFlowRepository,
  OauthPendingFlowEntity,
  CreateOauthPendingFlowInput,
} from '@revbrain/contract';
import type { DrizzleDB } from './index.ts';

/**
 * Drizzle implementation of OauthPendingFlowRepository.
 *
 * Manages short-lived PKCE state for OAuth authorization flows.
 * Rows are created when a user initiates "Connect Salesforce" and deleted
 * after successful token exchange or when they expire (10-minute TTL).
 */
export class DrizzleOauthPendingFlowRepository implements OauthPendingFlowRepository {
  constructor(private db: DrizzleDB = defaultDb) {}

  // ==========================================================================
  // QUERIES
  // ==========================================================================

  async findByNonce(nonce: string): Promise<OauthPendingFlowEntity | null> {
    const result = await this.db.query.oauthPendingFlows.findFirst({
      where: eq(oauthPendingFlows.nonce, nonce),
    });
    return result ? this.toEntity(result) : null;
  }

  /**
   * Find a non-expired flow for a project+role combination.
   * Used to derive "connecting" status on the client.
   */
  async findLiveByProjectAndRole(
    projectId: string,
    role: string
  ): Promise<OauthPendingFlowEntity | null> {
    const result = await this.db.query.oauthPendingFlows.findFirst({
      where: and(
        eq(oauthPendingFlows.projectId, projectId),
        eq(oauthPendingFlows.connectionRole, role)
      ),
    });

    if (!result) return null;

    // Check expiry in application code to avoid DB-specific date comparison syntax
    if (result.expiresAt <= new Date()) return null;

    return this.toEntity(result);
  }

  // ==========================================================================
  // MUTATIONS
  // ==========================================================================

  async create(data: CreateOauthPendingFlowInput): Promise<OauthPendingFlowEntity> {
    const [flow] = await this.db
      .insert(oauthPendingFlows)
      .values({
        nonce: data.nonce,
        projectId: data.projectId,
        organizationId: data.organizationId,
        userId: data.userId,
        connectionRole: data.connectionRole,
        codeVerifier: data.codeVerifier,
        oauthBaseUrl: data.oauthBaseUrl,
        expiresAt: data.expiresAt,
      })
      .returning();
    return this.toEntity(flow);
  }

  async deleteByNonce(nonce: string): Promise<boolean> {
    const result = await this.db
      .delete(oauthPendingFlows)
      .where(eq(oauthPendingFlows.nonce, nonce))
      .returning({ nonce: oauthPendingFlows.nonce });
    return result.length > 0;
  }

  /**
   * Insert a new pending flow for a project+role.
   *
   * If a flow already exists for the same project+role:
   * - If still live (not expired): throws to prevent duplicate flows
   * - If expired: deletes the stale row and inserts the new one
   */
  async upsertForProject(data: CreateOauthPendingFlowInput): Promise<OauthPendingFlowEntity> {
    const existing = await this.db.query.oauthPendingFlows.findFirst({
      where: and(
        eq(oauthPendingFlows.projectId, data.projectId),
        eq(oauthPendingFlows.connectionRole, data.connectionRole)
      ),
    });

    if (existing) {
      if (existing.expiresAt > new Date()) {
        throw new Error('Connection flow already in progress');
      }

      // Expired flow — clean it up before inserting new one
      await this.db.delete(oauthPendingFlows).where(eq(oauthPendingFlows.nonce, existing.nonce));
    }

    const [flow] = await this.db
      .insert(oauthPendingFlows)
      .values({
        nonce: data.nonce,
        projectId: data.projectId,
        organizationId: data.organizationId,
        userId: data.userId,
        connectionRole: data.connectionRole,
        codeVerifier: data.codeVerifier,
        oauthBaseUrl: data.oauthBaseUrl,
        expiresAt: data.expiresAt,
      })
      .returning();

    return this.toEntity(flow);
  }

  /**
   * Delete all expired pending flows.
   * Called by a scheduled cleanup job to prevent table bloat.
   *
   * @returns Number of deleted rows
   */
  async cleanupExpired(): Promise<number> {
    const result = await this.db
      .delete(oauthPendingFlows)
      .where(sql`${oauthPendingFlows.expiresAt} < now()`)
      .returning({ nonce: oauthPendingFlows.nonce });
    return result.length;
  }

  // ==========================================================================
  // HELPERS
  // ==========================================================================

  private toEntity(row: typeof oauthPendingFlows.$inferSelect): OauthPendingFlowEntity {
    return {
      nonce: row.nonce,
      projectId: row.projectId,
      organizationId: row.organizationId,
      userId: row.userId,
      connectionRole: row.connectionRole,
      codeVerifier: row.codeVerifier,
      oauthBaseUrl: row.oauthBaseUrl,
      expiresAt: row.expiresAt,
      createdAt: row.createdAt,
    };
  }
}
