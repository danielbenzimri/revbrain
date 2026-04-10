/**
 * PostgREST Salesforce Connection Secrets Repository
 *
 * Handles encrypted OAuth tokens stored as bytea columns.
 * PostgREST returns bytea as hex strings (`\x0a1b2c...`), so we convert
 * between hex strings and Buffers for encrypt/decrypt operations.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  SalesforceConnectionSecretsRepository,
  SalesforceConnectionSecretsEntity,
} from '@revbrain/contract';
import { encrypt, decrypt, ENCRYPTION_CONTEXTS, parseEncryptionKey } from '../../lib/encryption.ts';
import { getEnv } from '../../lib/env.ts';
import { toCamelCase } from './case-map.ts';

const TABLE = 'salesforce_connection_secrets';

/** Raw row shape from PostgREST (snake_case, bytea as hex strings). */
interface RawRow {
  id: string;
  connection_id: string;
  encrypted_access_token: string; // hex string from bytea
  encrypted_refresh_token: string; // hex string from bytea
  encryption_key_version: number;
  token_version: number;
  token_issued_at: string | null;
  token_scopes: string | null;
  last_refresh_at: string | null;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// bytea handling helpers
// ---------------------------------------------------------------------------

/** Convert Buffer to hex string for PostgREST bytea insert. */
function bufferToHex(buf: Buffer): string {
  return '\\x' + buf.toString('hex');
}

/** Convert PostgREST hex string back to Buffer for decryption. */
function hexToBuffer(hex: string): Buffer {
  // PostgREST returns `\x` prefix
  const clean = hex.startsWith('\\x') ? hex.slice(2) : hex;
  return Buffer.from(clean, 'hex');
}

// ---------------------------------------------------------------------------
// Repository
// ---------------------------------------------------------------------------

export class PostgRESTSalesforceConnectionSecretsRepository implements SalesforceConnectionSecretsRepository {
  private _masterKey: Buffer | null = null;

  constructor(private supabase: SupabaseClient) {}

  /** Lazy-load encryption key — only required when secrets methods are actually called. */
  private getMasterKey(): Buffer {
    if (!this._masterKey) {
      const keyBase64 = getEnv('SALESFORCE_TOKEN_ENCRYPTION_KEY');
      if (!keyBase64) {
        throw new Error(
          'SALESFORCE_TOKEN_ENCRYPTION_KEY environment variable is required for secrets operations'
        );
      }
      this._masterKey = parseEncryptionKey(keyBase64);
    }
    return this._masterKey;
  }

  // -----------------------------------------------------------------------
  // Public methods
  // -----------------------------------------------------------------------

  async findByConnectionId(
    connectionId: string
  ): Promise<SalesforceConnectionSecretsEntity | null> {
    const { data, error } = await this.supabase
      .from(TABLE)
      .select('*')
      .eq('connection_id', connectionId)
      .maybeSingle();

    if (error) throw new Error(`findByConnectionId failed: ${error.message}`);
    if (!data) return null;

    return this.toEntity(data as RawRow);
  }

  async create(
    connectionId: string,
    accessToken: string,
    refreshToken: string,
    scopes?: string
  ): Promise<SalesforceConnectionSecretsEntity> {
    const encryptedAccess = encrypt(
      accessToken,
      this.getMasterKey(),
      ENCRYPTION_CONTEXTS.OAUTH_TOKEN
    );
    const encryptedRefresh = encrypt(
      refreshToken,
      this.getMasterKey(),
      ENCRYPTION_CONTEXTS.OAUTH_TOKEN
    );

    const { data, error } = await this.supabase
      .from(TABLE)
      .insert({
        connection_id: connectionId,
        encrypted_access_token: bufferToHex(encryptedAccess),
        encrypted_refresh_token: bufferToHex(encryptedRefresh),
        encryption_key_version: 1,
        token_version: 1,
        token_issued_at: new Date().toISOString(),
        token_scopes: scopes ?? null,
      })
      .select('*')
      .single();

    if (error) throw new Error(`create failed: ${error.message}`);

    return this.toEntity(data as RawRow);
  }

  async updateTokens(
    connectionId: string,
    accessToken: string,
    expectedTokenVersion: number
  ): Promise<SalesforceConnectionSecretsEntity | null> {
    const encryptedAccess = encrypt(
      accessToken,
      this.getMasterKey(),
      ENCRYPTION_CONTEXTS.OAUTH_TOKEN
    );

    const now = new Date().toISOString();

    const { data, error } = await this.supabase
      .from(TABLE)
      .update({
        encrypted_access_token: bufferToHex(encryptedAccess),
        token_issued_at: now,
        last_refresh_at: now,
        token_version: expectedTokenVersion + 1,
        updated_at: now,
      })
      .eq('connection_id', connectionId)
      .eq('token_version', expectedTokenVersion)
      .select('*')
      .maybeSingle();

    if (error) throw new Error(`updateTokens failed: ${error.message}`);

    // null means optimistic lock failed — another process refreshed first
    if (!data) return null;

    return this.toEntity(data as RawRow);
  }

  async deleteByConnectionId(connectionId: string): Promise<boolean> {
    const { error } = await this.supabase.from(TABLE).delete().eq('connection_id', connectionId);

    return !error;
  }

  // -----------------------------------------------------------------------
  // Private helpers
  // -----------------------------------------------------------------------

  /**
   * Convert a raw PostgREST row (snake_case, hex-encoded bytea) into a
   * fully decrypted SalesforceConnectionSecretsEntity.
   */
  private toEntity(row: RawRow): SalesforceConnectionSecretsEntity {
    const accessTokenBuf = hexToBuffer(row.encrypted_access_token);
    const refreshTokenBuf = hexToBuffer(row.encrypted_refresh_token);

    const accessToken = decrypt(
      accessTokenBuf,
      this.getMasterKey(),
      ENCRYPTION_CONTEXTS.OAUTH_TOKEN
    );
    const refreshToken = decrypt(
      refreshTokenBuf,
      this.getMasterKey(),
      ENCRYPTION_CONTEXTS.OAUTH_TOKEN
    );

    // Use toCamelCase for the non-encrypted fields, then override tokens
    const base = toCamelCase<Record<string, unknown>>(row as unknown as Record<string, unknown>);

    return {
      ...base,
      accessToken,
      refreshToken,
    } as unknown as SalesforceConnectionSecretsEntity;
  }
}
