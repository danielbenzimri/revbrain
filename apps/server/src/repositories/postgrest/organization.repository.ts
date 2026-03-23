/**
 * PostgREST Organization Repository
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  OrganizationRepository,
  OrganizationEntity,
  OrganizationWithPlan,
  CreateOrganizationInput,
  UpdateOrganizationInput,
  FindManyOptions,
} from '@revbrain/contract';
import { fetchOne, fetchMany, insertOne, updateOne, countRows } from './base.ts';
import { toCamelCase, toSnakeCase } from './case-map.ts';

export class PostgRESTOrganizationRepository implements OrganizationRepository {
  constructor(private supabase: SupabaseClient) {}

  async findById(id: string): Promise<OrganizationEntity | null> {
    return fetchOne<OrganizationEntity>(this.supabase, 'organizations', 'id', id);
  }

  async findMany(options?: FindManyOptions): Promise<OrganizationEntity[]> {
    return fetchMany<OrganizationEntity>(this.supabase, 'organizations', options);
  }

  async create(data: CreateOrganizationInput): Promise<OrganizationEntity> {
    return insertOne<OrganizationEntity>(this.supabase, 'organizations', {
      name: data.name,
      slug: data.slug,
      seatLimit: data.seatLimit ?? 5,
      planId: data.planId ?? null,
      createdBy: data.createdBy ?? null,
    });
  }

  async update(id: string, data: UpdateOrganizationInput): Promise<OrganizationEntity | null> {
    return updateOne<OrganizationEntity>(
      this.supabase,
      'organizations',
      id,
      data as Record<string, unknown>
    );
  }

  async delete(id: string): Promise<boolean> {
    const snakeData = toSnakeCase({ isActive: false });
    const { error } = await this.supabase.from('organizations').update(snakeData).eq('id', id);
    return !error;
  }

  async count(filter?: Record<string, unknown>): Promise<number> {
    return countRows(this.supabase, 'organizations', filter);
  }

  async findBySlug(slug: string): Promise<OrganizationEntity | null> {
    return fetchOne<OrganizationEntity>(this.supabase, 'organizations', 'slug', slug);
  }

  async findWithPlan(id: string): Promise<OrganizationWithPlan | null> {
    const { data, error } = await this.supabase
      .from('organizations')
      .select('*, plans(*)')
      .eq('id', id)
      .maybeSingle();

    if (error || !data) return null;

    const org = toCamelCase<OrganizationEntity>(data);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const planData = (data as any).plans;
    return {
      ...org,
      plan: planData ? toCamelCase(planData) : null,
    } as OrganizationWithPlan;
  }

  async incrementSeatUsed(id: string): Promise<OrganizationEntity | null> {
    // Use RPC or raw update to atomically increment
    const { data, error } = await this.supabase.rpc('increment_seat_used', { org_id: id });
    if (error) {
      // Fallback: read-then-write (less safe but works without RPC)
      const org = await this.findById(id);
      if (!org) return null;
      return updateOne<OrganizationEntity>(this.supabase, 'organizations', id, {
        seatUsed: org.seatUsed + 1,
      });
    }
    return data ? toCamelCase<OrganizationEntity>(data) : await this.findById(id);
  }

  async decrementSeatUsed(id: string): Promise<OrganizationEntity | null> {
    const org = await this.findById(id);
    if (!org) return null;
    return updateOne<OrganizationEntity>(this.supabase, 'organizations', id, {
      seatUsed: Math.max(0, org.seatUsed - 1),
    });
  }

  async tryIncrementSeatUsed(
    id: string,
    gracePercentage = 0.1
  ): Promise<OrganizationEntity | null> {
    const org = await this.findById(id);
    if (!org) return null;

    const effectiveLimit = Math.ceil(org.seatLimit * (1 + gracePercentage));
    if (org.seatUsed >= effectiveLimit) return null;

    return updateOne<OrganizationEntity>(this.supabase, 'organizations', id, {
      seatUsed: org.seatUsed + 1,
    });
  }

  async updateStorageUsed(id: string, byteDelta: number): Promise<number> {
    const org = await this.findById(id);
    if (!org) return 0;

    const newBytes = Math.max(0, org.storageUsedBytes + byteDelta);
    await updateOne(this.supabase, 'organizations', id, {
      storageUsedBytes: newBytes,
    });
    return newBytes;
  }
}
