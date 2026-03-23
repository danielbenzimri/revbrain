import { db as defaultDb } from '@revbrain/database/client';
import { salesforceConnections } from '@revbrain/database';
import { eq, and } from 'drizzle-orm';
import type {
  SalesforceConnectionRepository,
  SalesforceConnectionEntity,
  CreateSalesforceConnectionInput,
} from '@revbrain/contract';
import type { DrizzleDB } from './index.ts';

/**
 * Drizzle implementation of SalesforceConnectionRepository.
 *
 * Manages Salesforce connection metadata (identity, status, audit fields).
 * Does NOT handle encrypted tokens — those live in SalesforceConnectionSecretsRepository.
 */
export class DrizzleSalesforceConnectionRepository implements SalesforceConnectionRepository {
  constructor(private db: DrizzleDB = defaultDb) {}

  // ==========================================================================
  // QUERIES
  // ==========================================================================

  async findById(id: string): Promise<SalesforceConnectionEntity | null> {
    const result = await this.db.query.salesforceConnections.findFirst({
      where: eq(salesforceConnections.id, id),
    });
    return result ? this.toEntity(result) : null;
  }

  async findByProjectAndRole(
    projectId: string,
    role: 'source' | 'target'
  ): Promise<SalesforceConnectionEntity | null> {
    const result = await this.db.query.salesforceConnections.findFirst({
      where: and(
        eq(salesforceConnections.projectId, projectId),
        eq(salesforceConnections.connectionRole, role)
      ),
    });
    return result ? this.toEntity(result) : null;
  }

  async findByProject(projectId: string): Promise<SalesforceConnectionEntity[]> {
    const results = await this.db.query.salesforceConnections.findMany({
      where: eq(salesforceConnections.projectId, projectId),
    });
    return results.map((r) => this.toEntity(r));
  }

  async findByOrganization(organizationId: string): Promise<SalesforceConnectionEntity[]> {
    const results = await this.db.query.salesforceConnections.findMany({
      where: eq(salesforceConnections.organizationId, organizationId),
    });
    return results.map((r) => this.toEntity(r));
  }

  async findAllActive(): Promise<SalesforceConnectionEntity[]> {
    const results = await this.db.query.salesforceConnections.findMany({
      where: eq(salesforceConnections.status, 'active'),
    });
    return results.map((r) => this.toEntity(r));
  }

  // ==========================================================================
  // MUTATIONS
  // ==========================================================================

  async create(data: CreateSalesforceConnectionInput): Promise<SalesforceConnectionEntity> {
    const [connection] = await this.db
      .insert(salesforceConnections)
      .values({
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
      })
      .returning();
    return this.toEntity(connection);
  }

  async updateStatus(
    id: string,
    status: string,
    error?: string | null
  ): Promise<SalesforceConnectionEntity | null> {
    const updateData: Record<string, unknown> = {
      status,
      updatedAt: new Date(),
    };

    if (error !== undefined) {
      updateData.lastError = error;
      updateData.lastErrorAt = error ? new Date() : null;
    }

    const [connection] = await this.db
      .update(salesforceConnections)
      .set(updateData)
      .where(eq(salesforceConnections.id, id))
      .returning();

    return connection ? this.toEntity(connection) : null;
  }

  async updateMetadata(
    id: string,
    metadata: Record<string, unknown>
  ): Promise<SalesforceConnectionEntity | null> {
    const [connection] = await this.db
      .update(salesforceConnections)
      .set({
        connectionMetadata: metadata,
        updatedAt: new Date(),
      })
      .where(eq(salesforceConnections.id, id))
      .returning();

    return connection ? this.toEntity(connection) : null;
  }

  async disconnect(id: string, disconnectedBy: string): Promise<boolean> {
    const result = await this.db
      .update(salesforceConnections)
      .set({
        status: 'disconnected',
        disconnectedBy,
        disconnectedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(salesforceConnections.id, id))
      .returning({ id: salesforceConnections.id });

    return result.length > 0;
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.db
      .delete(salesforceConnections)
      .where(eq(salesforceConnections.id, id))
      .returning({ id: salesforceConnections.id });
    return result.length > 0;
  }

  // ==========================================================================
  // HELPERS
  // ==========================================================================

  private toEntity(row: typeof salesforceConnections.$inferSelect): SalesforceConnectionEntity {
    return {
      id: row.id,
      projectId: row.projectId,
      organizationId: row.organizationId,
      connectionRole: row.connectionRole as 'source' | 'target',
      salesforceOrgId: row.salesforceOrgId,
      salesforceInstanceUrl: row.salesforceInstanceUrl,
      customLoginUrl: row.customLoginUrl,
      oauthBaseUrl: row.oauthBaseUrl,
      salesforceUserId: row.salesforceUserId,
      salesforceUsername: row.salesforceUsername,
      instanceType: row.instanceType as 'production' | 'sandbox',
      apiVersion: row.apiVersion,
      connectionMetadata: (row.connectionMetadata as Record<string, unknown>) ?? null,
      status: row.status,
      lastUsedAt: row.lastUsedAt,
      lastSuccessfulApiCallAt: row.lastSuccessfulApiCallAt,
      lastError: row.lastError,
      lastErrorAt: row.lastErrorAt,
      connectedBy: row.connectedBy,
      disconnectedBy: row.disconnectedBy,
      disconnectedAt: row.disconnectedAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
