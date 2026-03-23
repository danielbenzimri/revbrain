/**
 * PostgREST User Repository
 *
 * Uses Supabase JS client (HTTP/PostgREST) instead of Drizzle (TCP/postgres.js).
 * Instant initialization on Edge Functions — no 3-5s cold start.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  UserRepository,
  UserEntity,
  CreateUserInput,
  UpdateUserInput,
  FindManyOptions,
} from '@revbrain/contract';
import { fetchOne, fetchMany, insertOne, updateOne, deleteOne, countRows } from './base.ts';
import { toSnakeCase } from './case-map.ts';

export class PostgRESTUserRepository implements UserRepository {
  constructor(private supabase: SupabaseClient) {}

  async findById(id: string): Promise<UserEntity | null> {
    return fetchOne<UserEntity>(this.supabase, 'users', 'id', id);
  }

  async findMany(options?: FindManyOptions): Promise<UserEntity[]> {
    return fetchMany<UserEntity>(this.supabase, 'users', options);
  }

  async create(data: CreateUserInput): Promise<UserEntity> {
    return insertOne<UserEntity>(this.supabase, 'users', {
      supabaseUserId: data.supabaseUserId,
      organizationId: data.organizationId,
      email: data.email.toLowerCase(),
      fullName: data.fullName,
      role: data.role,
      isOrgAdmin: data.isOrgAdmin ?? false,
      isActive: data.isActive ?? false,
      invitedBy: data.invitedBy ?? null,
      phoneNumber: data.phoneNumber ?? null,
      jobTitle: data.jobTitle ?? null,
      address: data.address ?? null,
    });
  }

  async update(id: string, data: UpdateUserInput): Promise<UserEntity | null> {
    const updateData: Record<string, unknown> = {};
    if (data.email !== undefined) updateData.email = data.email.toLowerCase();
    if (data.fullName !== undefined) updateData.fullName = data.fullName;
    if (data.role !== undefined) updateData.role = data.role;
    if (data.isOrgAdmin !== undefined) updateData.isOrgAdmin = data.isOrgAdmin;
    if (data.isActive !== undefined) updateData.isActive = data.isActive;
    if (data.phoneNumber !== undefined) updateData.phoneNumber = data.phoneNumber;
    if (data.jobTitle !== undefined) updateData.jobTitle = data.jobTitle;
    if (data.address !== undefined) updateData.address = data.address;
    if (data.bio !== undefined) updateData.bio = data.bio;
    if (data.avatarUrl !== undefined) updateData.avatarUrl = data.avatarUrl;
    if (data.mobileNumber !== undefined) updateData.mobileNumber = data.mobileNumber;
    if (data.preferences !== undefined) updateData.preferences = data.preferences;
    if (data.metadata !== undefined) updateData.metadata = data.metadata;

    return updateOne<UserEntity>(this.supabase, 'users', id, updateData);
  }

  async delete(id: string): Promise<boolean> {
    return deleteOne(this.supabase, 'users', id, true); // soft delete
  }

  async count(filter?: Record<string, unknown>): Promise<number> {
    return countRows(this.supabase, 'users', filter);
  }

  async findByEmail(email: string): Promise<UserEntity | null> {
    return fetchOne<UserEntity>(this.supabase, 'users', 'email', email.toLowerCase());
  }

  async findBySupabaseId(supabaseUserId: string): Promise<UserEntity | null> {
    return fetchOne<UserEntity>(this.supabase, 'users', 'supabase_user_id', supabaseUserId);
  }

  async findByOrganization(
    organizationId: string,
    options?: FindManyOptions
  ): Promise<UserEntity[]> {
    return fetchMany<UserEntity>(this.supabase, 'users', {
      ...options,
      filter: { ...options?.filter, organizationId },
    });
  }

  async activate(id: string): Promise<UserEntity | null> {
    return updateOne<UserEntity>(this.supabase, 'users', id, {
      isActive: true,
      activatedAt: new Date().toISOString(),
    });
  }

  async deactivate(id: string): Promise<UserEntity | null> {
    return updateOne<UserEntity>(this.supabase, 'users', id, { isActive: false });
  }

  async updateLastLogin(id: string): Promise<void> {
    const snakeData = toSnakeCase({ lastLoginAt: new Date().toISOString() });
    await this.supabase.from('users').update(snakeData).eq('id', id);
  }
}
