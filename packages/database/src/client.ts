import { drizzle } from 'drizzle-orm/postgres-js';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema.ts';

/**
 * CRITICAL: Database Connection Configuration
 */

// Export the typed database type for consumers to use
export type DrizzleDB = PostgresJsDatabase<typeof schema>;

let dbInstance: DrizzleDB | null = null;
let queryClient: postgres.Sql | null = null;

// Cross-runtime environment variable access
const getEnv = (key: string) => {
  // @ts-ignore
  if (typeof Deno !== 'undefined' && Deno.env) {
    // @ts-ignore
    return Deno.env.get(key);
  }
  // Fallback for local Node.js tooling (e.g. migrations)
  // but protected to avoid auto-polyfilling in edge runtime
  try {
    const global = globalThis as any;
    return global['process']?.['env']?.[key];
  } catch {
    return undefined;
  }
};

/**
 * Lazy-initializes the database connection.
 * This prevents crashes during boot if variables are missing.
 */
export const getDB = () => {
  if (dbInstance) return dbInstance;

  // Prioritize SUPABASE_DB_URL which is auto-injected by Supabase Edge Functions
  // and correctly configured for the internal network.
  let connectionString = getEnv('SUPABASE_DB_URL') || getEnv('DATABASE_URL');
  if (!connectionString) {
    // Fallback or error if neither is set
    throw new Error('DATABASE_URL or SUPABASE_DB_URL environment variable is not set');
  }

  // Fix for Supabase Edge Runtime: Force SSL and avoid conflicts with sslmode=disable
  // The native Deno driver handles DNS correctly, so we don't need manual host patching.
  if (connectionString.includes('sslmode=disable')) {
    connectionString = connectionString.replace('sslmode=disable', 'sslmode=require');
  }

  queryClient = postgres(connectionString, {
    prepare: true, // Enable prepared statements for faster query execution
    max: 10, // Allow up to 10 concurrent connections (was 1 - major bottleneck)
    ssl: 'require',
    idle_timeout: 20,
    connect_timeout: 10,
  });

  dbInstance = drizzle(queryClient, { schema });
  return dbInstance;
};

// Maintain compatibility with existing code while transitioning to lazy load
export const db = new Proxy({} as DrizzleDB, {
  get(_, prop) {
    const instance = getDB();
    return (instance as any)[prop];
  },
});

export { queryClient as client };
