/**
 * PostgREST Repository Engine
 *
 * Provides repository implementations using Supabase JS client (PostgREST HTTP API).
 * Optimized for: Supabase Edge Functions where postgres.js has 3-5s cold start.
 *
 * All repositories implement the same interfaces as Drizzle repos.
 * Routes don't change — they call c.var.repos.users.findById() regardless
 * of which engine is active.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Repositories } from '@revbrain/contract';
import { PostgRESTUserRepository } from './user.repository.ts';
import { PostgRESTOrganizationRepository } from './organization.repository.ts';
import { PostgRESTPlanRepository } from './plan.repository.ts';
import { PostgRESTAuditLogRepository } from './audit-log.repository.ts';
import { PostgRESTProjectRepository } from './project.repository.ts';

// Re-export individual repositories
export { PostgRESTUserRepository } from './user.repository.ts';
export { PostgRESTOrganizationRepository } from './organization.repository.ts';
export { PostgRESTPlanRepository } from './plan.repository.ts';
export { PostgRESTAuditLogRepository } from './audit-log.repository.ts';
export { PostgRESTProjectRepository } from './project.repository.ts';

/**
 * Create all PostgREST repositories.
 *
 * @param supabase - Supabase admin client (service_role key)
 */
export function createPostgRESTRepositories(supabase: SupabaseClient): Repositories {
  return {
    users: new PostgRESTUserRepository(supabase),
    organizations: new PostgRESTOrganizationRepository(supabase),
    plans: new PostgRESTPlanRepository(supabase),
    auditLogs: new PostgRESTAuditLogRepository(supabase),
    projects: new PostgRESTProjectRepository(supabase),
  };
}
