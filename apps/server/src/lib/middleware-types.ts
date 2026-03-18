// eslint-disable-next-line @typescript-eslint/no-explicit-any
type RouteMiddleware = any;

/**
 * Type-safe wrapper for Hono OpenAPI route middleware arrays.
 * Hono's createRoute() middleware type is restrictive and doesn't
 * accept composed middleware (auth + rbac + rate limit). This helper
 * provides a single place for the type assertion.
 */
export function routeMiddleware(...handlers: unknown[]): RouteMiddleware[] {
  return handlers as RouteMiddleware[];
}
