import { db as defaultDb, users, eq, desc, asc, sql } from '@revbrain/database';
import type {
  UserRepository,
  UserEntity,
  CreateUserInput,
  UpdateUserInput,
  FindManyOptions,
} from '@revbrain/contract';
import type { DrizzleDB } from './index.ts';

/**
 * Drizzle implementation of UserRepository
 *
 * Uses direct TCP connection to PostgreSQL via Drizzle ORM.
 * Best for: Complex queries, transactions, local development.
 */
export class DrizzleUserRepository implements UserRepository {
  constructor(private db: DrizzleDB = defaultDb) {}
  // ==========================================================================
  // BASE CRUD
  // ==========================================================================

  async findById(id: string): Promise<UserEntity | null> {
    const result = await this.db.query.users.findFirst({
      where: eq(users.id, id),
    });
    return result ? this.toEntity(result) : null;
  }

  async findMany(options?: FindManyOptions): Promise<UserEntity[]> {
    const results = await this.db.query.users.findMany({
      limit: options?.limit ?? 100,
      offset: options?.offset ?? 0,
      orderBy: this.buildOrderBy(options?.orderBy),
    });
    return results.map((r) => this.toEntity(r));
  }

  async create(data: CreateUserInput): Promise<UserEntity> {
    const [user] = await this.db
      .insert(users)
      .values({
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
      })
      .returning();
    return this.toEntity(user);
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

    const [user] = await this.db.update(users).set(updateData).where(eq(users.id, id)).returning();

    return user ? this.toEntity(user) : null;
  }

  async delete(id: string): Promise<boolean> {
    // Soft delete - set isActive to false instead of removing the row
    // This preserves audit trails and prevents referential integrity issues
    const result = await this.db
      .update(users)
      .set({ isActive: false })
      .where(eq(users.id, id))
      .returning({ id: users.id });
    return result.length > 0;
  }

  async count(_filter?: Record<string, unknown>): Promise<number> {
    const result = await this.db.select({ count: sql<number>`count(*)::int` }).from(users);
    return result[0]?.count ?? 0;
  }

  // ==========================================================================
  // USER-SPECIFIC QUERIES
  // ==========================================================================

  async findByEmail(email: string): Promise<UserEntity | null> {
    const result = await this.db.query.users.findFirst({
      where: eq(users.email, email.toLowerCase()),
    });
    return result ? this.toEntity(result) : null;
  }

  async findBySupabaseId(supabaseUserId: string): Promise<UserEntity | null> {
    const result = await this.db.query.users.findFirst({
      where: eq(users.supabaseUserId, supabaseUserId),
    });
    return result ? this.toEntity(result) : null;
  }

  async findByOrganization(
    organizationId: string,
    options?: FindManyOptions
  ): Promise<UserEntity[]> {
    const results = await this.db.query.users.findMany({
      where: eq(users.organizationId, organizationId),
      limit: options?.limit ?? 100,
      offset: options?.offset ?? 0,
      orderBy: this.buildOrderBy(options?.orderBy),
    });
    return results.map((r) => this.toEntity(r));
  }

  // ==========================================================================
  // USER ACTIONS
  // ==========================================================================

  async activate(id: string): Promise<UserEntity | null> {
    const [user] = await this.db
      .update(users)
      .set({
        isActive: true,
        activatedAt: new Date(),
      })
      .where(eq(users.id, id))
      .returning();

    return user ? this.toEntity(user) : null;
  }

  async deactivate(id: string): Promise<UserEntity | null> {
    const [user] = await this.db
      .update(users)
      .set({ isActive: false })
      .where(eq(users.id, id))
      .returning();

    return user ? this.toEntity(user) : null;
  }

  async updateLastLogin(id: string): Promise<void> {
    await this.db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, id));
  }

  // ==========================================================================
  // HELPERS
  // ==========================================================================

  private buildOrderBy(orderBy?: { field: string; direction: 'asc' | 'desc' }) {
    if (!orderBy) return desc(users.createdAt);

    // Column mapping for orderBy support
    switch (orderBy.field) {
      case 'email':
        return orderBy.direction === 'asc' ? asc(users.email) : desc(users.email);
      case 'fullName':
        return orderBy.direction === 'asc' ? asc(users.fullName) : desc(users.fullName);
      case 'role':
        return orderBy.direction === 'asc' ? asc(users.role) : desc(users.role);
      case 'isActive':
        return orderBy.direction === 'asc' ? asc(users.isActive) : desc(users.isActive);
      case 'createdAt':
      default:
        return orderBy.direction === 'asc' ? asc(users.createdAt) : desc(users.createdAt);
    }
  }

  private toEntity(row: typeof users.$inferSelect): UserEntity {
    return {
      id: row.id,
      supabaseUserId: row.supabaseUserId,
      organizationId: row.organizationId,
      email: row.email,
      fullName: row.fullName,
      role: row.role,
      isOrgAdmin: row.isOrgAdmin,
      isActive: row.isActive,
      invitedBy: row.invitedBy,
      phoneNumber: row.phoneNumber,
      jobTitle: row.jobTitle,
      address: row.address,
      age: row.age,
      bio: row.bio,
      avatarUrl: row.avatarUrl,
      mobileNumber: row.mobileNumber,
      preferences: row.preferences as Record<string, unknown> | null,
      metadata: row.metadata as Record<string, unknown> | null,
      createdAt: row.createdAt,
      activatedAt: row.activatedAt,
      lastLoginAt: row.lastLoginAt,
    };
  }
}
