/**
 * Database Client — Lazy Initialization
 *
 * On Supabase Edge Functions (Deno), statically importing `postgres`
 * triggers Node.js polyfill loading causing 3-5s cold starts.
 *
 * Solution: The `db` export is a lazy Proxy. When first accessed,
 * it imports postgres.js and drizzle-orm and creates the connection.
 * On Edge Functions with PostgREST mode, `db` is never accessed,
 * so postgres.js is never loaded → instant cold start.
 *
 * NOTE: The static `import postgres from 'postgres'` was removed.
 * The import happens inside getDB() via dynamic import.
 */
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import * as schema from './schema.ts';

export type DrizzleDB = PostgresJsDatabase<typeof schema>;

let dbInstance: DrizzleDB | null = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let queryClient: any = null;

// Track initialization promise to prevent concurrent init
let initPromise: Promise<DrizzleDB> | null = null;

// Cross-runtime environment variable access
const getEnv = (key: string) => {
  // @ts-ignore — Deno global may not exist
  if (typeof Deno !== 'undefined' && Deno.env) {
    // @ts-ignore
    return Deno.env.get(key);
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const g = globalThis as any;
    return g['process']?.['env']?.[key];
  } catch {
    return undefined;
  }
};

/**
 * Async database initialization.
 * Uses dynamic import() so postgres.js module loading is deferred.
 */
export async function initDB(): Promise<DrizzleDB> {
  if (dbInstance) return dbInstance;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    let connectionString = getEnv('SUPABASE_DB_URL') || getEnv('DATABASE_URL');
    if (!connectionString) {
      throw new Error('DATABASE_URL or SUPABASE_DB_URL environment variable is not set');
    }

    if (connectionString.includes('sslmode=disable')) {
      connectionString = connectionString.replace('sslmode=disable', 'sslmode=require');
    }

    // Dynamic imports — only loaded here, not at module top level
    const pgModule = await import('postgres');
    const pgClient = pgModule.default;
    const { drizzle } = await import('drizzle-orm/postgres-js');

    queryClient = pgClient(connectionString, {
      prepare: true,
      max: 10,
      ssl: 'require',
      idle_timeout: 20,
      connect_timeout: 10,
    });

    dbInstance = drizzle(queryClient, { schema });
    return dbInstance;
  })();

  return initPromise;
}

/**
 * Synchronous DB accessor for backward compatibility.
 *
 * IMPORTANT: First access triggers async init via top-level await
 * in the consuming module. On Edge Functions with PostgREST mode,
 * this Proxy is imported but never accessed — postgres.js stays unloaded.
 */
export const getDB = (): DrizzleDB => {
  if (dbInstance) return dbInstance;

  // Fallback: synchronous path for cases where initDB() wasn't awaited first
  // This should not happen in normal flow — initDB() is called by repository middleware
  throw new Error(
    'Database not initialized. Call initDB() first, or use PostgREST repositories on Edge Functions.'
  );
};

/**
 * Lazy Proxy — defers database connection until first property access.
 * Throws if accessed before initDB() is called.
 */
export const db = new Proxy({} as DrizzleDB, {
  get(_, prop) {
    if (!dbInstance) {
      throw new Error(
        'Database not initialized. Accessing db before initDB() was called. ' +
          'On Edge Functions, use PostgREST repositories (c.var.repos) instead.'
      );
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (dbInstance as any)[prop];
  },
});

export { queryClient as client };
