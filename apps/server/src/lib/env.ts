/**
 * Safe environment variable access for Deno and Node.js environments.
 * PRIORITIZES Deno.env to avoid triggering Node.js polyfills in Edge Runtime.
 */
export function getEnv(key: string): string | undefined {
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
