/**
 * ETag Middleware
 *
 * Generates weak ETags using FNV-1a hash for GET responses and returns
 * 304 Not Modified when the client's If-None-Match header matches.
 *
 * Must be placed AFTER compression middleware — ETag is computed on the
 * final response body that the client receives.
 */
import { createMiddleware } from 'hono/factory';

/**
 * FNV-1a 32-bit hash — fast, non-cryptographic, good distribution.
 */
function fnv1a(data: string): string {
  let hash = 0x811c9dc5; // FNV offset basis
  for (let i = 0; i < data.length; i++) {
    hash ^= data.charCodeAt(i);
    hash = (hash * 0x01000193) >>> 0; // FNV prime, force unsigned 32-bit
  }
  return hash.toString(36);
}

export const etagMiddleware = createMiddleware(async (c, next) => {
  await next();

  // Only apply to GET requests with 200 OK responses
  if (c.req.method !== 'GET' || c.res.status !== 200) {
    return;
  }

  // Skip if no body
  const body = await c.res.text();
  if (!body) return;

  const etag = `W/"${fnv1a(body)}"`;
  const ifNoneMatch = c.req.header('If-None-Match');

  if (ifNoneMatch === etag) {
    // Client has current version — return 304 with no body
    // Preserve CORS and cache headers so the browser doesn't reject the response
    const notModifiedHeaders = new Headers();
    for (const [key, value] of c.res.headers.entries()) {
      // Copy all headers except content-related ones (no body in 304)
      const lk = key.toLowerCase();
      if (lk === 'content-type' || lk === 'content-length' || lk === 'content-encoding') continue;
      notModifiedHeaders.set(key, value);
    }
    notModifiedHeaders.set('ETag', etag);
    c.res = new Response(null, { status: 304, headers: notModifiedHeaders });
    return;
  }

  // Rebuild response with ETag header and original body
  const headers = new Headers(c.res.headers);
  headers.set('ETag', etag);
  c.res = new Response(body, {
    status: c.res.status,
    headers,
  });
});
