/**
 * PostgREST Plan Repository
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  PlanRepository,
  PlanEntity,
  CreatePlanInput,
  UpdatePlanInput,
  FindManyOptions,
} from '@revbrain/contract';
import {
  fetchOne,
  fetchMany,
  insertOne,
  updateOne,
  countRows,
  applyFindManyOptions,
} from './base.ts';
import { toCamelCase } from './case-map.ts';

export class PostgRESTPlanRepository implements PlanRepository {
  constructor(private supabase: SupabaseClient) {}

  async findById(id: string): Promise<PlanEntity | null> {
    return fetchOne<PlanEntity>(this.supabase, 'plans', 'id', id);
  }

  async findMany(options?: FindManyOptions): Promise<PlanEntity[]> {
    return fetchMany<PlanEntity>(this.supabase, 'plans', options);
  }

  async create(data: CreatePlanInput): Promise<PlanEntity> {
    return insertOne<PlanEntity>(this.supabase, 'plans', {
      name: data.name,
      code: data.code ?? data.name.toLowerCase().replace(/\s+/g, '_'),
      description: data.description ?? null,
      price: data.price ?? 0,
      currency: data.currency ?? 'USD',
      interval: data.interval ?? 'month',
      yearlyDiscountPercent: data.yearlyDiscountPercent ?? 0,
      limits: data.limits ?? { maxUsers: 5, maxProjects: 3, storageGB: 1 },
      features: data.features ?? {
        aiLevel: 'none',
        modules: [],
        customBranding: false,
        sso: false,
      },
      isActive: data.isActive ?? true,
      isPublic: data.isPublic ?? false,
    });
  }

  async update(id: string, data: UpdatePlanInput): Promise<PlanEntity | null> {
    return updateOne<PlanEntity>(this.supabase, 'plans', id, data as Record<string, unknown>);
  }

  async delete(id: string): Promise<boolean> {
    const { error } = await this.supabase.from('plans').update({ is_active: false }).eq('id', id);
    return !error;
  }

  async count(filter?: Record<string, unknown>): Promise<number> {
    return countRows(this.supabase, 'plans', filter);
  }

  async findByCode(code: string): Promise<PlanEntity | null> {
    return fetchOne<PlanEntity>(this.supabase, 'plans', 'code', code);
  }

  async findByName(name: string): Promise<PlanEntity | null> {
    return fetchOne<PlanEntity>(this.supabase, 'plans', 'name', name);
  }

  async findActive(): Promise<PlanEntity[]> {
    let query = this.supabase.from('plans').select('*').eq('is_active', true);
    query = applyFindManyOptions(query);
    const { data, error } = await query;
    if (error || !data) return [];
    return data.map((row: Record<string, unknown>) => toCamelCase<PlanEntity>(row));
  }

  async findPublic(options?: { limit?: number; offset?: number }): Promise<PlanEntity[]> {
    const limit = options?.limit ?? 100;
    const offset = options?.offset ?? 0;

    const { data, error } = await this.supabase
      .from('plans')
      .select('*')
      .eq('is_active', true)
      .eq('is_public', true)
      .order('price', { ascending: true })
      .range(offset, offset + limit - 1);

    if (error || !data) return [];
    return data.map((row: Record<string, unknown>) => toCamelCase<PlanEntity>(row));
  }
}
