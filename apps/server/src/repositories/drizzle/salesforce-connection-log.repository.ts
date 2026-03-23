import { db as defaultDb } from '@revbrain/database/client';
import { salesforceConnectionLogs } from '@revbrain/database';
import { eq, desc } from 'drizzle-orm';
import type {
  SalesforceConnectionLogRepository,
  SalesforceConnectionLogEntity,
  CreateSalesforceConnectionLogInput,
  FindManyOptions,
} from '@revbrain/contract';
import type { DrizzleDB } from './index.ts';

/**
 * Drizzle implementation of SalesforceConnectionLogRepository.
 *
 * Append-only audit trail for Salesforce connection lifecycle events
 * (connected, refreshed, refresh_failed, disconnected, etc.).
 */
export class DrizzleSalesforceConnectionLogRepository implements SalesforceConnectionLogRepository {
  constructor(private db: DrizzleDB = defaultDb) {}

  // ==========================================================================
  // MUTATIONS
  // ==========================================================================

  async create(data: CreateSalesforceConnectionLogInput): Promise<SalesforceConnectionLogEntity> {
    const [log] = await this.db
      .insert(salesforceConnectionLogs)
      .values({
        connectionId: data.connectionId,
        event: data.event,
        details: data.details ?? null,
        performedBy: data.performedBy ?? null,
      })
      .returning();
    return this.toEntity(log);
  }

  // ==========================================================================
  // QUERIES
  // ==========================================================================

  async findByConnection(
    connectionId: string,
    options?: FindManyOptions
  ): Promise<SalesforceConnectionLogEntity[]> {
    const results = await this.db.query.salesforceConnectionLogs.findMany({
      where: eq(salesforceConnectionLogs.connectionId, connectionId),
      limit: options?.limit ?? 100,
      offset: options?.offset ?? 0,
      orderBy: desc(salesforceConnectionLogs.createdAt),
    });
    return results.map((r) => this.toEntity(r));
  }

  // ==========================================================================
  // HELPERS
  // ==========================================================================

  private toEntity(
    row: typeof salesforceConnectionLogs.$inferSelect
  ): SalesforceConnectionLogEntity {
    return {
      id: row.id,
      connectionId: row.connectionId,
      event: row.event,
      details: (row.details as Record<string, unknown>) ?? null,
      performedBy: row.performedBy,
      createdAt: row.createdAt,
    };
  }
}
