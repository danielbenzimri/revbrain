/**
 * Standardized Audit Context Builder
 *
 * Extracts actor identity, IP address, and request metadata from the Hono
 * context. Used by all admin route handlers for consistent audit logging.
 *
 * Metadata contract:
 * - Never include raw secrets, passwords, or full credit card numbers
 * - Include requestId for traceability
 * - Include before/after values for change events (caller's responsibility)
 */
import type { Context } from 'hono';

export interface AuditContext {
  actorId: string | null;
  actorEmail: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  requestId: string;
}

export function buildAuditContext(c: Context): AuditContext {
  const user = c.get('user') as
    | { id: string; email: string; [key: string]: unknown }
    | undefined
    | null;

  return {
    actorId: user?.id ?? null,
    actorEmail: user?.email ?? null,
    ipAddress:
      c.req.header('CF-Connecting-IP') ||
      c.req.header('X-Forwarded-For')?.split(',')[0].trim() ||
      c.req.header('X-Real-IP') ||
      null,
    userAgent: c.req.header('User-Agent') || null,
    requestId: c.req.header('X-Request-Id') || crypto.randomUUID(),
  };
}
