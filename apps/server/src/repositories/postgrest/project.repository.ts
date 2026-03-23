/**
 * PostgREST Project Repository
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  ProjectRepository,
  ProjectEntity,
  CreateProjectInput,
  UpdateProjectInput,
  FindManyOptions,
} from '@revbrain/contract';
import { fetchOne, fetchMany, insertOne, updateOne, countRows } from './base.ts';

export class PostgRESTProjectRepository implements ProjectRepository {
  constructor(private supabase: SupabaseClient) {}

  async findById(id: string): Promise<ProjectEntity | null> {
    return fetchOne<ProjectEntity>(this.supabase, 'projects', 'id', id);
  }

  async findMany(options?: FindManyOptions): Promise<ProjectEntity[]> {
    return fetchMany<ProjectEntity>(this.supabase, 'projects', options);
  }

  async create(data: CreateProjectInput): Promise<ProjectEntity> {
    return insertOne<ProjectEntity>(this.supabase, 'projects', {
      name: data.name,
      organizationId: data.organizationId,
      ownerId: data.ownerId,
      description: data.description ?? null,
      startDate: data.startDate?.toISOString() ?? null,
      endDate: data.endDate?.toISOString() ?? null,
      notes: data.notes ?? null,
      metadata: data.metadata ?? {},
    });
  }

  async update(id: string, data: UpdateProjectInput): Promise<ProjectEntity | null> {
    const updateData: Record<string, unknown> = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.description !== undefined) updateData.description = data.description;
    if (data.startDate !== undefined) updateData.startDate = data.startDate?.toISOString() ?? null;
    if (data.endDate !== undefined) updateData.endDate = data.endDate?.toISOString() ?? null;
    if (data.status !== undefined) updateData.status = data.status;
    if (data.notes !== undefined) updateData.notes = data.notes;
    if (data.metadata !== undefined) updateData.metadata = data.metadata;

    return updateOne<ProjectEntity>(this.supabase, 'projects', id, updateData);
  }

  async delete(id: string): Promise<boolean> {
    const { error } = await this.supabase.from('projects').delete().eq('id', id);
    return !error;
  }

  async count(filter?: Record<string, unknown>): Promise<number> {
    return countRows(this.supabase, 'projects', filter);
  }

  async findByOwner(ownerId: string, options?: FindManyOptions): Promise<ProjectEntity[]> {
    return fetchMany<ProjectEntity>(this.supabase, 'projects', {
      ...options,
      filter: { ...options?.filter, ownerId },
    });
  }

  async findByOrganization(
    organizationId: string,
    options?: FindManyOptions
  ): Promise<ProjectEntity[]> {
    return fetchMany<ProjectEntity>(this.supabase, 'projects', {
      ...options,
      filter: { ...options?.filter, organizationId },
    });
  }

  async countByOrganization(organizationId: string): Promise<number> {
    return countRows(this.supabase, 'projects', { organizationId });
  }
}
