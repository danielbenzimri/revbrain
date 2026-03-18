/**
 * Repository Layer
 *
 * This module provides the Data Access Layer with switchable engines.
 * Currently supports: Drizzle (TCP)
 * Future: Supabase (HTTP) for Edge Functions
 */

export * from './drizzle/index.ts';
export { repositoryMiddleware, type RepositoryMiddlewareOptions } from './middleware.ts';
