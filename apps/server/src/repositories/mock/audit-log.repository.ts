import type {
  AuditLogRepository,
  AuditLogEntity,
  CreateAuditLogInput,
  FindManyOptions,
} from '@revbrain/contract';
import { mockAuditLogs } from '../../mocks/index.ts';
import {
  generateId,
  applyPagination,
  applySorting,
  applyFilters,
  validateFilters,
} from './helpers.ts';

const ALLOWED_FILTERS = ['organizationId', 'userId', 'action', 'targetUserId'] as const;

export class MockAuditLogRepository implements AuditLogRepository {
  async create(data: CreateAuditLogInput): Promise<AuditLogEntity> {
    const entity: AuditLogEntity = {
      id: generateId(),
      userId: data.userId ?? null,
      organizationId: data.organizationId ?? null,
      action: data.action,
      targetUserId: data.targetUserId ?? null,
      metadata: data.metadata ?? null,
      ipAddress: data.ipAddress ?? null,
      userAgent: data.userAgent ?? null,
      createdAt: new Date(),
    };
    mockAuditLogs.push(entity);
    return entity;
  }

  async findMany(options?: FindManyOptions): Promise<AuditLogEntity[]> {
    if (options?.filter) validateFilters(options.filter, ALLOWED_FILTERS, 'AuditLogs');
    let items = applyFilters(mockAuditLogs, options?.filter);
    const field = (options?.orderBy?.field as keyof AuditLogEntity) || 'createdAt';
    items = applySorting(items, field, options?.orderBy?.direction || 'desc');
    return applyPagination(items, options);
  }

  async count(filter?: Record<string, unknown>): Promise<number> {
    if (filter) validateFilters(filter, ALLOWED_FILTERS, 'AuditLogs');
    return applyFilters(mockAuditLogs, filter).length;
  }

  async findByOrganization(
    organizationId: string,
    options?: FindManyOptions
  ): Promise<AuditLogEntity[]> {
    let items = mockAuditLogs.filter((a) => a.organizationId === organizationId);
    const field = (options?.orderBy?.field as keyof AuditLogEntity) || 'createdAt';
    items = applySorting(items, field, options?.orderBy?.direction || 'desc');
    return applyPagination(items, options);
  }

  async findByUser(userId: string, options?: FindManyOptions): Promise<AuditLogEntity[]> {
    let items = mockAuditLogs.filter((a) => a.userId === userId);
    const field = (options?.orderBy?.field as keyof AuditLogEntity) || 'createdAt';
    items = applySorting(items, field, options?.orderBy?.direction || 'desc');
    return applyPagination(items, options);
  }

  async findByAction(action: string, options?: FindManyOptions): Promise<AuditLogEntity[]> {
    let items = mockAuditLogs.filter((a) => a.action === action);
    const field = (options?.orderBy?.field as keyof AuditLogEntity) || 'createdAt';
    items = applySorting(items, field, options?.orderBy?.direction || 'desc');
    return applyPagination(items, options);
  }

  async findByTargetUser(
    targetUserId: string,
    options?: FindManyOptions
  ): Promise<AuditLogEntity[]> {
    let items = mockAuditLogs.filter((a) => a.targetUserId === targetUserId);
    const field = (options?.orderBy?.field as keyof AuditLogEntity) || 'createdAt';
    items = applySorting(items, field, options?.orderBy?.direction || 'desc');
    return applyPagination(items, options);
  }
}
