/**
 * PostgREST Base Repository Utilities
 *
 * Shared helpers for all PostgREST repository implementations.
 * Uses the Supabase JS client which talks to PostgREST (HTTP API)
 * instead of postgres.js (TCP connection).
 *
 * Performance: PostgREST initializes instantly on Edge Functions,
 * while postgres.js takes 3-5s due to Node.js polyfill overhead.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { FindManyOptions } from '@revbrain/contract';
import { toCamelCase, toSnakeCase } from './case-map.ts';

/**
 * Build a query with standard pagination, ordering, and filtering.
 * Returns the Supabase query builder for further customization.
 */
export function applyFindManyOptions(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  query: any,
  options?: FindManyOptions
) {
  const limit = options?.limit ?? 100;
  const offset = options?.offset ?? 0;

  // Ordering
  if (options?.orderBy) {
    const snakeField = options.orderBy.field.replace(
      /[A-Z]/g,
      (c: string) => `_${c.toLowerCase()}`
    );
    query = query.order(snakeField, { ascending: options.orderBy.direction === 'asc' });
  } else {
    query = query.order('created_at', { ascending: false });
  }

  // Pagination
  query = query.range(offset, offset + limit - 1);

  return query;
}

/**
 * Apply a filter map to a Supabase query.
 * Converts camelCase keys to snake_case and applies .eq() for each.
 */
export function applyFilters(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  query: any,
  filter?: Record<string, unknown>
) {
  if (!filter) return query;

  for (const [key, value] of Object.entries(filter)) {
    if (value === undefined || value === null) continue;
    const snakeKey = key.replace(/[A-Z]/g, (c: string) => `_${c.toLowerCase()}`);
    query = query.eq(snakeKey, value);
  }
  return query;
}

/**
 * Execute a single-row query and return the entity or null.
 */
export async function fetchOne<T>(
  supabase: SupabaseClient,
  table: string,
  column: string,
  value: string
): Promise<T | null> {
  const { data, error } = await supabase
    .from(table)
    .select('*')
    .eq(column, value)
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;
  return toCamelCase<T>(data);
}

/**
 * Execute a paginated list query.
 */
export async function fetchMany<T>(
  supabase: SupabaseClient,
  table: string,
  options?: FindManyOptions
): Promise<T[]> {
  let query = supabase.from(table).select('*');

  // Apply filters
  if (options?.filter) {
    query = applyFilters(query, options.filter);
  }

  // Apply pagination and ordering
  query = applyFindManyOptions(query, options);

  const { data, error } = await query;

  if (error || !data) return [];
  return data.map((row: Record<string, unknown>) => toCamelCase<T>(row));
}

/**
 * Insert a row and return the created entity.
 */
export async function insertOne<T>(
  supabase: SupabaseClient,
  table: string,
  data: Record<string, unknown>
): Promise<T> {
  const snakeData = toSnakeCase(data);
  const { data: result, error } = await supabase.from(table).insert(snakeData).select().single();

  if (error) throw new Error(`PostgREST insert into ${table} failed: ${error.message}`);
  return toCamelCase<T>(result);
}

/**
 * Update a row by ID and return the updated entity.
 */
export async function updateOne<T>(
  supabase: SupabaseClient,
  table: string,
  id: string,
  data: Record<string, unknown>
): Promise<T | null> {
  const snakeData = toSnakeCase(data);
  const { data: result, error } = await supabase
    .from(table)
    .update(snakeData)
    .eq('id', id)
    .select()
    .maybeSingle();

  if (error) throw new Error(`PostgREST update ${table}/${id} failed: ${error.message}`);
  return result ? toCamelCase<T>(result) : null;
}

/**
 * Soft-delete a row (set is_active = false) or hard-delete.
 */
export async function deleteOne(
  supabase: SupabaseClient,
  table: string,
  id: string,
  soft = true
): Promise<boolean> {
  if (soft) {
    const { error } = await supabase.from(table).update({ is_active: false }).eq('id', id);
    return !error;
  }
  const { error } = await supabase.from(table).delete().eq('id', id);
  return !error;
}

/**
 * Count rows with optional filter.
 */
export async function countRows(
  supabase: SupabaseClient,
  table: string,
  filter?: Record<string, unknown>
): Promise<number> {
  let query = supabase.from(table).select('*', { count: 'exact', head: true });
  if (filter) {
    query = applyFilters(query, filter);
  }
  const { count, error } = await query;
  if (error) return 0;
  return count ?? 0;
}
