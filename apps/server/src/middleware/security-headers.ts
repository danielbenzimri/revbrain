import { createMiddleware } from 'hono/factory';
import { isProduction } from '../lib/config.ts';

/**
 * Security Headers Middleware
 *
 * Adds standard security headers to all responses.
 * These headers protect against common web vulnerabilities.
 *
 * Headers included:
 * - X-Content-Type-Options: Prevents MIME type sniffing
 * - X-Frame-Options: Prevents clickjacking attacks
 * - X-XSS-Protection: Legacy XSS filter (for older browsers)
 * - Referrer-Policy: Controls referrer information
 * - Permissions-Policy: Restricts browser features
 * - Strict-Transport-Security: Enforces HTTPS (in production)
 *
 * Note: Content-Security-Policy is not included as this is an API,
 * not a web application serving HTML.
 */
export const securityHeadersMiddleware = createMiddleware(async (c, next) => {
  await next();

  // Prevent MIME type sniffing
  // Stops browsers from interpreting files as different MIME types
  c.header('X-Content-Type-Options', 'nosniff');

  // Prevent clickjacking
  // API responses should never be embedded in frames
  c.header('X-Frame-Options', 'DENY');

  // Legacy XSS protection for older browsers
  // Modern browsers use CSP instead, but this helps legacy clients
  c.header('X-XSS-Protection', '1; mode=block');

  // Control referrer information sent with requests
  // strict-origin-when-cross-origin: Only send origin on cross-origin requests
  c.header('Referrer-Policy', 'strict-origin-when-cross-origin');

  // Disable unnecessary browser features for API responses
  // Since this is an API, we disable all features that could be exploited
  c.header(
    'Permissions-Policy',
    'accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()'
  );

  // HTTP Strict Transport Security
  // Only set in production (based on NODE_ENV/APP_ENV, not client headers)
  // max-age=31536000 = 1 year, includeSubDomains for full coverage
  // SECURITY: Never use client-controlled headers (Host) for security decisions
  if (isProduction()) {
    c.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }

  // Cache control for API responses
  // Prevent caching of authenticated responses
  // Individual routes can override this if needed
  c.header('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  c.header('Pragma', 'no-cache');
});
