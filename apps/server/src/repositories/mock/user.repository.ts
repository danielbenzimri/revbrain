import type {
  UserRepository,
  UserEntity,
  CreateUserInput,
  UpdateUserInput,
  FindManyOptions,
} from '@revbrain/contract';
import { mockUsers } from '../../mocks/index.ts';
import {
  generateId,
  applyPagination,
  applySorting,
  applyFilters,
  validateFilters,
} from './helpers.ts';

const ALLOWED_FILTERS = ['organizationId', 'role', 'isActive', 'email'] as const;

export class MockUserRepository implements UserRepository {
  async findById(id: string): Promise<UserEntity | null> {
    return mockUsers.find((u) => u.id === id) ?? null;
  }

  async findMany(options?: FindManyOptions): Promise<UserEntity[]> {
    if (options?.filter) validateFilters(options.filter, ALLOWED_FILTERS, 'Users');
    let items = applyFilters(mockUsers, options?.filter);
    const field = (options?.orderBy?.field as keyof UserEntity) || 'createdAt';
    items = applySorting(items, field, options?.orderBy?.direction || 'desc');
    return applyPagination(items, options);
  }

  async create(data: CreateUserInput): Promise<UserEntity> {
    const now = new Date();
    const entity: UserEntity = {
      id: generateId(),
      supabaseUserId: data.supabaseUserId || generateId(),
      organizationId: data.organizationId,
      email: data.email,
      fullName: data.fullName,
      role: data.role,
      isOrgAdmin: data.isOrgAdmin ?? false,
      isActive: data.isActive ?? false,
      invitedBy: data.invitedBy ?? null,
      phoneNumber: data.phoneNumber ?? null,
      jobTitle: data.jobTitle ?? null,
      address: data.address ?? null,
      age: null,
      bio: null,
      avatarUrl: null,
      mobileNumber: null,
      preferences: null,
      metadata: null,
      createdAt: now,
      activatedAt: null,
      lastLoginAt: null,
    };
    mockUsers.push(entity);
    return entity;
  }

  async update(id: string, data: UpdateUserInput): Promise<UserEntity | null> {
    const idx = mockUsers.findIndex((u) => u.id === id);
    if (idx === -1) return null;
    const updated = { ...mockUsers[idx], ...data };
    mockUsers[idx] = updated;
    return updated;
  }

  async delete(id: string): Promise<boolean> {
    const idx = mockUsers.findIndex((u) => u.id === id);
    if (idx === -1) return false;
    mockUsers.splice(idx, 1);
    return true;
  }

  async count(filter?: Record<string, unknown>): Promise<number> {
    if (filter) validateFilters(filter, ALLOWED_FILTERS, 'Users');
    return applyFilters(mockUsers, filter).length;
  }

  async findByEmail(email: string): Promise<UserEntity | null> {
    return mockUsers.find((u) => u.email === email) ?? null;
  }

  async findBySupabaseId(supabaseUserId: string): Promise<UserEntity | null> {
    return mockUsers.find((u) => u.supabaseUserId === supabaseUserId) ?? null;
  }

  async findByOrganization(
    organizationId: string,
    options?: FindManyOptions
  ): Promise<UserEntity[]> {
    let items = mockUsers.filter((u) => u.organizationId === organizationId);
    const field = (options?.orderBy?.field as keyof UserEntity) || 'createdAt';
    items = applySorting(items, field, options?.orderBy?.direction || 'desc');
    return applyPagination(items, options);
  }

  async activate(id: string): Promise<UserEntity | null> {
    const idx = mockUsers.findIndex((u) => u.id === id);
    if (idx === -1) return null;
    mockUsers[idx] = {
      ...mockUsers[idx],
      isActive: true,
      activatedAt: new Date(),
    };
    return mockUsers[idx];
  }

  async deactivate(id: string): Promise<UserEntity | null> {
    const idx = mockUsers.findIndex((u) => u.id === id);
    if (idx === -1) return null;
    mockUsers[idx] = { ...mockUsers[idx], isActive: false };
    return mockUsers[idx];
  }

  async updateLastLogin(id: string): Promise<void> {
    const idx = mockUsers.findIndex((u) => u.id === id);
    if (idx !== -1) {
      mockUsers[idx] = { ...mockUsers[idx], lastLoginAt: new Date() };
    }
  }
}
