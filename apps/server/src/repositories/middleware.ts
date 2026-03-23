import { createMiddleware } from 'hono/factory';
import type { Repositories, RepositoryEngine } from '@revbrain/contract';
import { createDrizzleRepositories } from './drizzle/index.ts';
import { createMockRepositories } from './mock/index.ts';
import { isMockMode } from '../lib/mock-mode-guard.ts';

/**
 * Extend Hono context types to include repositories
 */
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

// Singleton: created once at startup, shared across all requests
const useMock = isMockMode(process.env);
const mockRepos = useMock ? createMockRepositories() : null;

/**
 * Select the appropriate repository engine based on environment
 */
function selectEngine(options: RepositoryMiddlewareOptions): RepositoryEngine {
  if (options.forceEngine) return options.forceEngine;

  // @ts-expect-error - Deno global may not exist
  const isSupabaseEdge = typeof Deno !== 'undefined' && !!Deno.env?.get('SUPABASE_URL');

  if (isSupabaseEdge && options.preferAccelerated !== false) {
    return 'drizzle';
  }

  return 'drizzle';
}

/**
 * Repository Middleware
 *
 * Injects repositories into the Hono context.
 * In mock mode: uses in-memory singleton repos (no DB).
 * In real mode: creates Drizzle repos per request.
 */
export const repositoryMiddleware = (options: RepositoryMiddlewareOptions = {}) => {
  return createMiddleware(async (c, next) => {
    if (mockRepos) {
      c.set('repos', mockRepos);
      c.set('engine', 'mock' as RepositoryEngine);
    } else {
      const engine = selectEngine(options);
      const repos = createDrizzleRepositories();
      c.set('repos', repos);
      c.set('engine', engine);
    }

    await next();
  });
};

/**
 * Middleware that forces Drizzle engine
 */
export const drizzleOnly = () => repositoryMiddleware({ forceEngine: 'drizzle' });
