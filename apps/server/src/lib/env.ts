/**
 * Safe environment variable access for Deno and Node.js environments.
 * PRIORITIZES Deno.env to avoid triggering Node.js polyfills in Edge Runtime.
 *
 * Demo mode: Supabase Edge Runtime blocks Deno.env.set() and process.env
 * assignment. Secrets are project-wide (shared across all functions).
 * Edge functions that need to override secrets (e.g., demo-api forcing mock
 * mode) set `globalThis.__envOverrides` before importing the server.
 */
export function getEnv(key: string): string | undefined {
  // Check overrides first — set by edge functions before server import
  const overrides = (globalThis as Record<string, unknown>).__envOverrides as
    | Record<string, string>
    | undefined;
  if (overrides && key in overrides) return overrides[key];

  // @ts-expect-error - Check for Deno explicitly first (Deno global may not exist)
  if (typeof Deno !== 'undefined' && Deno.env) {
    // @ts-expect-error - Deno.env.get exists in Deno runtime
    return Deno.env.get(key);
  }

  // Check for Node.js process without triggering polyfill if possible
  // Using string access prevents bundlers from auto-injecting 'node:process'
  try {
    const global = globalThis as Record<string, unknown>;
    const proc = global['process'] as Record<string, unknown> | undefined;
    const env = proc?.['env'] as Record<string, string> | undefined;
    return env?.[key];
  } catch {
    return undefined;
  }
}
