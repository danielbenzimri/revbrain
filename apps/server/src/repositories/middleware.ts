/**
 * Repository Middleware
 *
 * Runtime-aware adapter selection:
 *
 *   Mock Mode (pnpm local)     → In-memory mock repositories (instant)
 *   Edge Runtime (Deno)        → PostgREST via Supabase JS (instant, no cold start)
 *   Node.js (pnpm dev)         → Drizzle ORM via postgres.js (type-safe, transactions)
 *
 * Why PostgREST on Edge:
 *   postgres.js initialization in Deno triggers Node.js polyfill loading
 *   (Deno.core.runMicrotasks) causing 3-5+ second cold starts.
 *   PostgREST (Supabase's HTTP API) initializes instantly.
 *
 * Routes don't change — they always call c.var.repos.users.findById().
 * The middleware transparently selects the fastest available engine.
 */
import { createMiddleware } from 'hono/factory';
import type { Repositories, RepositoryEngine } from '@revbrain/contract';
import { createMockRepositories } from './mock/index.ts';
import { isMockMode } from '../lib/mock-mode-guard.ts';
import { getEnv } from '../lib/env.ts';
import { logger } from '../lib/logger.ts';

declare module 'hono' {
  interface ContextVariableMap {
    repos: Repositories;
    engine: RepositoryEngine;
  }
}

export interface RepositoryMiddlewareOptions {
  forceEngine?: RepositoryEngine;
  preferAccelerated?: boolean;
}

// ============================================================================
// RUNTIME DETECTION
// ============================================================================

/** Check if running in Deno (Supabase Edge Functions) */
function isEdgeRuntime(): boolean {
  // @ts-expect-error — Deno global may not exist in Node.js
  return typeof Deno !== 'undefined';
}

/** Check if PostgREST mode should be used (Edge + Supabase credentials) */
function shouldUsePostgREST(): boolean {
  if (!isEdgeRuntime()) return false;

  const supabaseUrl = getEnv('SUPABASE_URL');
  const serviceKey = getEnv('SUPABASE_SERVICE_ROLE_KEY');

  return !!(supabaseUrl && serviceKey && serviceKey !== 'your-service-role-key-here');
}

// ============================================================================
// SINGLETON STATE
// ============================================================================

const useMock = isMockMode(process.env);
const mockRepos = useMock ? createMockRepositories() : null;

// Cached PostgREST repos (created once on first request, reused after)
let postgrestRepos: Repositories | null = null;

// Cached Drizzle repos (created once, reused)
let drizzleRepos: Repositories | null = null;

// Track which engine was selected (for logging)
let resolvedEngine: RepositoryEngine | null = null;

// ============================================================================
// ENGINE SELECTION
// ============================================================================

function selectEngine(options: RepositoryMiddlewareOptions): RepositoryEngine {
  if (options.forceEngine) return options.forceEngine;
  if (useMock) return 'mock';
  if (shouldUsePostgREST() && options.preferAccelerated !== false) return 'supabase';
  return 'drizzle';
}

/**
 * Get or create PostgREST repositories (lazy singleton).
 * Dynamic import avoids loading @supabase/supabase-js in Node.js
 * when it's not needed (Drizzle mode).
 */
async function getPostgRESTRepos(): Promise<Repositories> {
  if (postgrestRepos) return postgrestRepos;

  // Dynamic imports: only loaded on Edge, never in Node.js mock/drizzle mode
  const { createPostgRESTRepositories } = await import('./postgrest/index.ts');
  const { getSupabaseAdmin } = await import('../lib/supabase.ts');

  const supabase = getSupabaseAdmin();
  postgrestRepos = createPostgRESTRepositories(supabase);

  logger.info('PostgREST repositories initialized (Edge-optimized, no postgres.js)');
  return postgrestRepos;
}

/**
 * Get or create Drizzle repositories (lazy singleton).
 * Dynamic import avoids loading postgres.js on Edge.
 * Calls initDB() to ensure the database connection is established.
 */
async function getDrizzleRepos(): Promise<Repositories> {
  if (drizzleRepos) return drizzleRepos;

  // Initialize database connection (dynamic import of postgres.js)
  const { initDB } = await import('@revbrain/database/client');
  const dbInstance = await initDB();

  const { createDrizzleRepositories } = await import('./drizzle/index.ts');
  drizzleRepos = createDrizzleRepositories(dbInstance);

  logger.info('Drizzle repositories initialized (TCP/postgres.js)');
  return drizzleRepos;
}

// ============================================================================
// MIDDLEWARE
// ============================================================================

export const repositoryMiddleware = (options: RepositoryMiddlewareOptions = {}) => {
  return createMiddleware(async (c, next) => {
    const engine = selectEngine(options);

    // Log engine selection once
    if (resolvedEngine !== engine) {
      resolvedEngine = engine;
      logger.info(`Repository engine: ${engine}`, {
        isEdge: isEdgeRuntime(),
        isMock: useMock,
      });
    }

    switch (engine) {
      case 'mock': {
        c.set('repos', mockRepos!);
        c.set('engine', 'mock');
        break;
      }
      case 'supabase': {
        const repos = await getPostgRESTRepos();
        c.set('repos', repos);
        c.set('engine', 'supabase');
        // Also initialize Drizzle so services that bypass repos (getDb() pattern) work.
        // Without this, the db proxy throws "not initialized" on Edge Functions.
        // TODO: Refactor services to use repos instead of direct DB access (see TECH-DEBT.md).
        try {
          const { initDB } = await import('@revbrain/database/client');
          await initDB();
        } catch {
          // No DATABASE_URL — services using getDb() will fail individually
        }
        break;
      }
      case 'drizzle':
      default: {
        const repos = await getDrizzleRepos();
        c.set('repos', repos);
        c.set('engine', 'drizzle');
        break;
      }
    }

    await next();
  });
};

/**
 * Force Drizzle engine (for operations requiring transactions).
 */
export const drizzleOnly = () => repositoryMiddleware({ forceEngine: 'drizzle' });

/**
 * Check which engine is currently active.
 * Useful for routes that need engine-specific behavior.
 */
export function getResolvedEngine(): RepositoryEngine | null {
  return resolvedEngine;
}

/**
 * Check if currently running in PostgREST mode.
 * Routes can use this to adjust behavior (e.g., skip Drizzle-specific features).
 */
export function isPostgRESTMode(): boolean {
  return resolvedEngine === 'supabase';
}
