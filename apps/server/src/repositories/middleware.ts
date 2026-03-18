import { createMiddleware } from 'hono/factory';
import type { Repositories, RepositoryEngine } from '@revbrain/contract';
import { createDrizzleRepositories } from './drizzle/index.ts';

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
  /**
   * Force a specific engine (for testing or overrides)
   * If not specified, auto-selects based on environment
   */
  forceEngine?: RepositoryEngine;

  /**
   * Prefer accelerated Supabase HTTP engine when available
   * Only applies when running on Supabase Edge Functions
   * Default: true
   */
  preferAccelerated?: boolean;
}

/**
 * Select the appropriate repository engine based on environment
 */
function selectEngine(options: RepositoryMiddlewareOptions): RepositoryEngine {
  // 1. Explicit override takes precedence
  if (options.forceEngine) {
    return options.forceEngine;
  }

  // 2. Check if running in Supabase Edge environment
  // @ts-expect-error - Deno global may not exist
  const isSupabaseEdge = typeof Deno !== 'undefined' && !!Deno.env?.get('SUPABASE_URL');

  // 3. Use Supabase engine on Edge if preferred (future implementation)
  if (isSupabaseEdge && options.preferAccelerated !== false) {
    // TODO: Return 'supabase' when Supabase engine is implemented
    // For now, always use Drizzle
    return 'drizzle';
  }

  // 4. Default to Drizzle
  return 'drizzle';
}

/**
 * Repository Middleware
 *
 * Injects repositories into the Hono context based on the selected engine.
 * Routes can access repositories via c.var.repos
 *
 * @example
 * ```typescript
 * app.use('*', repositoryMiddleware());
 *
 * app.get('/users/:id', async (c) => {
 *   const user = await c.var.repos.users.findById(c.req.param('id'));
 *   return c.json(user);
 * });
 * ```
 */
export const repositoryMiddleware = (options: RepositoryMiddlewareOptions = {}) => {
  return createMiddleware(async (c, next) => {
    const engine = selectEngine(options);

    let repos: Repositories;

    switch (engine) {
      case 'supabase':
        // TODO: Implement Supabase engine when needed for Edge Functions
        // For now, fall through to Drizzle
        repos = createDrizzleRepositories();
        break;

      case 'drizzle':
      default:
        repos = createDrizzleRepositories();
        break;
    }

    c.set('repos', repos);
    c.set('engine', engine);

    await next();
  });
};

/**
 * Middleware that forces Drizzle engine
 * Use for complex queries that need full SQL power
 */
export const drizzleOnly = () => repositoryMiddleware({ forceEngine: 'drizzle' });
