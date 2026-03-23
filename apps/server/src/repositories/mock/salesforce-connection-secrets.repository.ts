import type {
  SalesforceConnectionSecretsRepository,
  SalesforceConnectionSecretsEntity,
} from '@revbrain/contract';
import { mockSalesforceConnectionSecrets } from '../../mocks/index.ts';
import { generateId } from './helpers.ts';

export class MockSalesforceConnectionSecretsRepository implements SalesforceConnectionSecretsRepository {
  async findByConnectionId(
    connectionId: string
  ): Promise<SalesforceConnectionSecretsEntity | null> {
    return mockSalesforceConnectionSecrets.find((s) => s.connectionId === connectionId) ?? null;
  }

  async create(
    connectionId: string,
    accessToken: string,
    refreshToken: string,
    scopes?: string
  ): Promise<SalesforceConnectionSecretsEntity> {
    const now = new Date();
    const entity: SalesforceConnectionSecretsEntity = {
      id: generateId(),
      connectionId,
      accessToken,
      refreshToken,
      encryptionKeyVersion: 1,
      tokenVersion: 1,
      tokenIssuedAt: now,
      tokenScopes: scopes ?? null,
      lastRefreshAt: now,
      createdAt: now,
      updatedAt: now,
    };
    mockSalesforceConnectionSecrets.push(entity);
    return entity;
  }

  async updateTokens(
    connectionId: string,
    accessToken: string,
    expectedTokenVersion: number
  ): Promise<SalesforceConnectionSecretsEntity | null> {
    const idx = mockSalesforceConnectionSecrets.findIndex((s) => s.connectionId === connectionId);
    if (idx === -1) return null;

    const existing = mockSalesforceConnectionSecrets[idx];
    // Optimistic lock: reject if another process already refreshed
    if (existing.tokenVersion !== expectedTokenVersion) return null;

    const now = new Date();
    const updated: SalesforceConnectionSecretsEntity = {
      ...existing,
      accessToken,
      tokenVersion: existing.tokenVersion + 1,
      tokenIssuedAt: now,
      lastRefreshAt: now,
      updatedAt: now,
    };
    mockSalesforceConnectionSecrets[idx] = updated;
    return updated;
  }

  async deleteByConnectionId(connectionId: string): Promise<boolean> {
    const idx = mockSalesforceConnectionSecrets.findIndex((s) => s.connectionId === connectionId);
    if (idx === -1) return false;
    mockSalesforceConnectionSecrets.splice(idx, 1);
    return true;
  }
}
