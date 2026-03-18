/**
 * Route Helpers
 *
 * Shared utilities for route handlers including typed context access
 * and service factory patterns to reduce boilerplate and improve type safety.
 */
import type { Context } from 'hono';
import type { AppEnv } from '../types/index.ts';

/**
 * Typed context for authenticated route handlers.
 * Use this instead of `c: any` to get proper type checking.
 */
export type RouteContext = Context<AppEnv>;

/**
 * Get typed repositories from context.
 * Provides type-safe access to the repos object.
 */
export function getRepos(c: RouteContext) {
  return c.var.repos;
}

/**
 * Get authenticated user from context.
 * Returns the user object with all profile fields.
 */
export function getUser(c: RouteContext) {
  return c.var.user;
}

/**
 * Get services from context (if using service pattern).
 * Some routes inject services via middleware.
 */
export function getServices(c: RouteContext) {
  return c.var.services;
}

/**
 * Create a context object for audit logging.
 * Standardizes the audit context creation across routes.
 */
export function createAuditContext(c: RouteContext) {
  const user = getUser(c);
  return {
    userId: user.id,
    userName: user.fullName || user.email || 'Unknown',
    organizationId: user.organizationId,
  };
}

/**
 * Helper to extract pagination params from query string.
 * Returns validated limit and offset with defaults.
 */
export function getPaginationParams(
  c: RouteContext,
  defaults?: { limit?: number; offset?: number }
) {
  const limitStr = c.req.query('limit');
  const offsetStr = c.req.query('offset');

  const limit = limitStr ? parseInt(limitStr, 10) : (defaults?.limit ?? 50);
  const offset = offsetStr ? parseInt(offsetStr, 10) : (defaults?.offset ?? 0);

  // Clamp values to reasonable ranges
  return {
    limit: Math.min(Math.max(1, limit), 100),
    offset: Math.max(0, offset),
  };
}
