import { createMiddleware } from 'hono/factory';

/**
 * Tiered Cache-Control Presets
 *
 * Each preset matches data volatility to cache duration:
 * - short:   fast-changing data (tasks, work logs)
 * - default: moderate data (project lists, BOQ, bills)
 * - long:    slow-changing data (org settings, user profiles)
 * - static:  rarely changing (plans, enums, health)
 * - noCache: sensitive endpoints (auth)
 *
 * All user-specific presets include Vary: Authorization to prevent
 * shared caches (CDN, proxy) from serving User A's data to User B.
 */

interface CachePreset {
  maxAge: number;
  staleWhileRevalidate: number;
  vary?: string;
}

const PRESETS: Record<string, CachePreset> = {
  short: { maxAge: 15, staleWhileRevalidate: 30, vary: 'Authorization' },
  default: { maxAge: 60, staleWhileRevalidate: 300, vary: 'Authorization' },
  long: { maxAge: 3600, staleWhileRevalidate: 14400, vary: 'Authorization' },
  static: { maxAge: 86400, staleWhileRevalidate: 604800 },
};

function createCachePresetMiddleware(presetName: keyof typeof PRESETS) {
  const preset = PRESETS[presetName];
  return createMiddleware(async (c, next) => {
    await next();

    if (c.req.method !== 'GET') return;
    if (c.res.headers.get('Cache-Control')) return;

    c.header(
      'Cache-Control',
      `private, max-age=${preset.maxAge}, stale-while-revalidate=${preset.staleWhileRevalidate}`
    );
    if (preset.vary) {
      c.header('Vary', preset.vary);
    }
  });
}

/** Tasks, work logs — fast-changing data (15s cache) */
export const cacheShort = createCachePresetMiddleware('short');

/** Project lists, BOQ, bills — moderate data (60s cache, backward-compatible default) */
export const cacheMiddleware = createCachePresetMiddleware('default');

/** Org settings, user profiles — slow-changing data (1h cache) */
export const cacheLong = createCachePresetMiddleware('long');

/** Plans, enums, health — rarely changing (24h cache) */
export const cacheStatic = createCachePresetMiddleware('static');

/**
 * No-cache middleware for sensitive endpoints
 * Use this for auth, user profile mutations, etc.
 */
export const noCacheMiddleware = createMiddleware(async (c, next) => {
  await next();
  c.header('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  c.header('Pragma', 'no-cache');
});
