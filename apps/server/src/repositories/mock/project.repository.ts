import type {
  ProjectRepository,
  ProjectEntity,
  CreateProjectInput,
  UpdateProjectInput,
  FindManyOptions,
} from '@revbrain/contract';
import { mockProjects } from '../../mocks/index.ts';
import {
  generateId,
  applyPagination,
  applySorting,
  applyFilters,
  validateFilters,
} from './helpers.ts';

const ALLOWED_FILTERS = ['organizationId', 'status', 'ownerId'] as const;

export class MockProjectRepository implements ProjectRepository {
  async findById(id: string): Promise<ProjectEntity | null> {
    return mockProjects.find((p) => p.id === id) ?? null;
  }

  async findMany(options?: FindManyOptions): Promise<ProjectEntity[]> {
    if (options?.filter) validateFilters(options.filter, ALLOWED_FILTERS, 'Projects');
    let items = applyFilters(mockProjects, options?.filter);
    const field = (options?.orderBy?.field as keyof ProjectEntity) || 'createdAt';
    items = applySorting(items, field, options?.orderBy?.direction || 'desc');
    return applyPagination(items, options);
  }

  async create(data: CreateProjectInput): Promise<ProjectEntity> {
    const now = new Date();
    const entity: ProjectEntity = {
      id: generateId(),
      name: data.name,
      description: data.description ?? null,
      ownerId: data.ownerId,
      organizationId: data.organizationId,
      startDate: data.startDate ?? null,
      endDate: data.endDate ?? null,
      status: 'active',
      notes: data.notes ?? null,
      metadata: data.metadata ?? {},
      createdAt: now,
      updatedAt: now,
      completedAt: null,
      cancelledAt: null,
    };
    mockProjects.push(entity);
    return entity;
  }

  async update(id: string, data: UpdateProjectInput): Promise<ProjectEntity | null> {
    const idx = mockProjects.findIndex((p) => p.id === id);
    if (idx === -1) return null;
    const updated: ProjectEntity = {
      ...mockProjects[idx],
      ...data,
      updatedAt: new Date(),
    };
    if (data.status === 'completed' && !mockProjects[idx].completedAt) {
      updated.completedAt = new Date();
    }
    if (data.status === 'cancelled' && !mockProjects[idx].cancelledAt) {
      updated.cancelledAt = new Date();
    }
    mockProjects[idx] = updated;
    return updated;
  }

  async delete(id: string): Promise<boolean> {
    const idx = mockProjects.findIndex((p) => p.id === id);
    if (idx === -1) return false;
    mockProjects.splice(idx, 1);
    return true;
  }

  async count(filter?: Record<string, unknown>): Promise<number> {
    if (filter) validateFilters(filter, ALLOWED_FILTERS, 'Projects');
    return applyFilters(mockProjects, filter).length;
  }

  async findByOwner(ownerId: string, options?: FindManyOptions): Promise<ProjectEntity[]> {
    let items = mockProjects.filter((p) => p.ownerId === ownerId);
    const field = (options?.orderBy?.field as keyof ProjectEntity) || 'createdAt';
    items = applySorting(items, field, options?.orderBy?.direction || 'desc');
    return applyPagination(items, options);
  }

  async findByOrganization(
    organizationId: string,
    options?: FindManyOptions
  ): Promise<ProjectEntity[]> {
    let items = mockProjects.filter((p) => p.organizationId === organizationId);
    const field = (options?.orderBy?.field as keyof ProjectEntity) || 'createdAt';
    items = applySorting(items, field, options?.orderBy?.direction || 'desc');
    return applyPagination(items, options);
  }

  async countByOrganization(organizationId: string): Promise<number> {
    return mockProjects.filter((p) => p.organizationId === organizationId).length;
  }
}
