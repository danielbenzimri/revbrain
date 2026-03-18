/**
 * Request IP Extraction Utility
 *
 * Provides consistent, secure IP address extraction from HTTP requests.
 *
 * SECURITY CONSIDERATIONS:
 * - X-Forwarded-For can be spoofed by clients if there's no trusted proxy
 * - CF-Connecting-IP is set by Cloudflare and cannot be spoofed (trusted)
 * - X-Real-IP is set by nginx and is trusted if nginx is your edge proxy
 *
 * Priority order:
 * 1. CF-Connecting-IP (Cloudflare - most trusted)
 * 2. X-Real-IP (nginx/load balancer)
 * 3. X-Forwarded-For (first IP in chain - can be spoofed)
 * 4. Request IP (direct connection)
 *
 * NOTE: If you're behind Cloudflare, CF-Connecting-IP is the only reliable option.
 * X-Forwarded-For should only be trusted if you validate the request came through
 * a trusted proxy IP range.
 */
import type { Context } from 'hono';

/**
 * Extract client IP address from request headers.
 *
 * @param c - Hono context
 * @returns Client IP address or 'unknown' if not determinable
 *
 * @example
 * ```ts
 * const ip = getClientIp(c);
 * await auditLogs.create({ ipAddress: ip });
 * ```
 */
export function getClientIp(c: Context): string {
  // 1. Cloudflare's header - most trusted, cannot be spoofed
  const cfIp = c.req.header('CF-Connecting-IP');
  if (cfIp) {
    return cfIp.trim();
  }

  // 2. X-Real-IP - set by nginx/load balancers
  const realIp = c.req.header('X-Real-IP');
  if (realIp) {
    return realIp.trim();
  }

  // 3. X-Forwarded-For - take first IP (leftmost = original client)
  // WARNING: This can be spoofed if request doesn't come through trusted proxy
  const forwardedFor = c.req.header('X-Forwarded-For');
  if (forwardedFor) {
    const firstIp = forwardedFor.split(',')[0]?.trim();
    if (firstIp) {
      return firstIp;
    }
  }

  // 4. Fallback to unknown (no reliable IP source)
  return 'unknown';
}

/**
 * Extract client IP address, returning null instead of 'unknown'.
 * Use this when you need to distinguish between "no IP" and "unknown IP".
 *
 * @param c - Hono context
 * @returns Client IP address or null
 */
export function getClientIpOrNull(c: Context): string | null {
  const ip = getClientIp(c);
  return ip === 'unknown' ? null : ip;
}
