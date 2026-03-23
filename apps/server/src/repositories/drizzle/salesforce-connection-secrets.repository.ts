import { db as defaultDb } from '@revbrain/database/client';
import { salesforceConnectionSecrets } from '@revbrain/database';
import { eq, and, sql } from 'drizzle-orm';
import type {
  SalesforceConnectionSecretsRepository,
  SalesforceConnectionSecretsEntity,
} from '@revbrain/contract';
import type { DrizzleDB } from './index.ts';
import { encrypt, decrypt, ENCRYPTION_CONTEXTS, parseEncryptionKey } from '../../lib/encryption.ts';
import { getEnv } from '../../lib/env.ts';

/**
 * Drizzle implementation of SalesforceConnectionSecretsRepository.
 *
 * Handles encrypted OAuth token storage with AES-256-GCM encryption.
 * Tokens are encrypted at rest and decrypted only when returned to the caller.
 * Uses optimistic locking (tokenVersion) for safe concurrent token refresh.
 */
export class DrizzleSalesforceConnectionSecretsRepository implements SalesforceConnectionSecretsRepository {
  private masterKey: Buffer;

  constructor(private db: DrizzleDB = defaultDb) {
    const keyBase64 = getEnv('SALESFORCE_TOKEN_ENCRYPTION_KEY');
    if (!keyBase64) {
      throw new Error(
        'SALESFORCE_TOKEN_ENCRYPTION_KEY environment variable is required for secrets repository'
      );
    }
    this.masterKey = parseEncryptionKey(keyBase64);
  }

  // ==========================================================================
  // QUERIES
  // ==========================================================================

  async findByConnectionId(
    connectionId: string
  ): Promise<SalesforceConnectionSecretsEntity | null> {
    const result = await this.db.query.salesforceConnectionSecrets.findFirst({
      where: eq(salesforceConnectionSecrets.connectionId, connectionId),
    });
    return result ? this.toEntity(result) : null;
  }

  // ==========================================================================
  // MUTATIONS
  // ==========================================================================

  async create(
    connectionId: string,
    accessToken: string,
    refreshToken: string,
    scopes?: string
  ): Promise<SalesforceConnectionSecretsEntity> {
    const encryptedAccessToken = encrypt(
      accessToken,
      this.masterKey,
      ENCRYPTION_CONTEXTS.OAUTH_TOKEN
    );
    const encryptedRefreshToken = encrypt(
      refreshToken,
      this.masterKey,
      ENCRYPTION_CONTEXTS.OAUTH_TOKEN
    );

    const [secret] = await this.db
      .insert(salesforceConnectionSecrets)
      .values({
        connectionId,
        encryptedAccessToken,
        encryptedRefreshToken,
        encryptionKeyVersion: 1,
        tokenVersion: 1,
        tokenIssuedAt: new Date(),
        tokenScopes: scopes ?? null,
      })
      .returning();

    return this.toEntity(secret);
  }

  /**
   * Atomically update the access token using optimistic locking.
   *
   * The WHERE clause includes tokenVersion so that if another process has
   * already refreshed the token (incrementing the version), this update
   * becomes a no-op and returns null instead of overwriting the newer token.
   */
  async updateTokens(
    connectionId: string,
    accessToken: string,
    expectedTokenVersion: number
  ): Promise<SalesforceConnectionSecretsEntity | null> {
    const encryptedAccessToken = encrypt(
      accessToken,
      this.masterKey,
      ENCRYPTION_CONTEXTS.OAUTH_TOKEN
    );

    const result = await this.db
      .update(salesforceConnectionSecrets)
      .set({
        encryptedAccessToken,
        tokenIssuedAt: new Date(),
        lastRefreshAt: new Date(),
        tokenVersion: sql`${salesforceConnectionSecrets.tokenVersion} + 1`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(salesforceConnectionSecrets.connectionId, connectionId),
          eq(salesforceConnectionSecrets.tokenVersion, expectedTokenVersion)
        )
      )
      .returning();

    if (result.length === 0) {
      return null;
    }

    return this.toEntity(result[0]);
  }

  async deleteByConnectionId(connectionId: string): Promise<boolean> {
    const result = await this.db
      .delete(salesforceConnectionSecrets)
      .where(eq(salesforceConnectionSecrets.connectionId, connectionId))
      .returning({ id: salesforceConnectionSecrets.id });
    return result.length > 0;
  }

  // ==========================================================================
  // HELPERS
  // ==========================================================================

  private toEntity(
    row: typeof salesforceConnectionSecrets.$inferSelect
  ): SalesforceConnectionSecretsEntity {
    return {
      id: row.id,
      connectionId: row.connectionId,
      accessToken: decrypt(
        row.encryptedAccessToken,
        this.masterKey,
        ENCRYPTION_CONTEXTS.OAUTH_TOKEN
      ),
      refreshToken: decrypt(
        row.encryptedRefreshToken,
        this.masterKey,
        ENCRYPTION_CONTEXTS.OAUTH_TOKEN
      ),
      encryptionKeyVersion: row.encryptionKeyVersion,
      tokenVersion: row.tokenVersion,
      tokenIssuedAt: row.tokenIssuedAt,
      tokenScopes: row.tokenScopes,
      lastRefreshAt: row.lastRefreshAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
