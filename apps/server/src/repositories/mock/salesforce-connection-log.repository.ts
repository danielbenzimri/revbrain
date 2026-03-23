import type {
  SalesforceConnectionLogRepository,
  SalesforceConnectionLogEntity,
  CreateSalesforceConnectionLogInput,
  FindManyOptions,
} from '@revbrain/contract';
import { generateId, applyPagination, applySorting } from './helpers.ts';

/** In-memory store for connection logs (append-only, not seeded) */
const mockConnectionLogs: SalesforceConnectionLogEntity[] = [];

export class MockSalesforceConnectionLogRepository implements SalesforceConnectionLogRepository {
  async create(data: CreateSalesforceConnectionLogInput): Promise<SalesforceConnectionLogEntity> {
    const entity: SalesforceConnectionLogEntity = {
      id: generateId(),
      connectionId: data.connectionId,
      event: data.event,
      details: data.details ?? null,
      performedBy: data.performedBy ?? null,
      createdAt: new Date(),
    };
    mockConnectionLogs.push(entity);
    return entity;
  }

  async findByConnection(
    connectionId: string,
    options?: FindManyOptions
  ): Promise<SalesforceConnectionLogEntity[]> {
    let items = mockConnectionLogs.filter((l) => l.connectionId === connectionId);
    const field = (options?.orderBy?.field as keyof SalesforceConnectionLogEntity) || 'createdAt';
    items = applySorting(items, field, options?.orderBy?.direction || 'desc');
    return applyPagination(items, options);
  }
}
