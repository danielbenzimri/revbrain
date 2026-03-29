/**
 * Mode-aware Transaction Helper
 *
 * Routes transaction calls to mock, PostgREST, or Drizzle based on environment.
 *
 * - Mock mode: executes callback directly with no isolation.
 * - Edge (Deno): uses PostgREST repos (no real transaction — Supabase HTTP
 *   doesn't support multi-statement transactions, but operations still work).
 * - Node.js: wraps callback in a PostgreSQL transaction via Drizzle.
 */
import type { Repositories } from '@revbrain/contract';
import { isMockMode } from '../lib/mock-mode-guard.ts';
import { getEnv } from '../lib/env.ts';

function isEdgeRuntime(): boolean {
  // @ts-expect-error — Deno global may not exist in Node.js
  return typeof Deno !== 'undefined';
}

export async function withTransaction<T>(
  callback: (repos: Repositories) => Promise<T>
): Promise<T> {
  if (isMockMode(process.env)) {
    const { mockWithTransaction } = await import('./mock/index.ts');
    return mockWithTransaction(callback);
  }

  // On Edge (Deno), Drizzle/postgres.js TCP isn't available — use PostgREST repos.
  // No real transaction isolation, but operations execute correctly via HTTP.
  if (isEdgeRuntime()) {
    const supabaseUrl = getEnv('SUPABASE_URL');
    const serviceKey = getEnv('SUPABASE_SERVICE_ROLE_KEY');
    if (supabaseUrl && serviceKey && serviceKey !== 'your-service-role-key-here') {
      const { createPostgRESTRepositories } = await import('./postgrest/index.ts');
      const { getSupabaseAdmin } = await import('../lib/supabase.ts');
      const repos = createPostgRESTRepositories(getSupabaseAdmin());
      return callback(repos);
    }
  }

  const { drizzleWithTransaction } = await import('./drizzle/index.ts');
  return drizzleWithTransaction(callback);
}
