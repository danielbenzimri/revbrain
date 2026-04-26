/**
 * Mock Mode Guard
 *
 * Pure functions for validating mock mode configuration.
 * Called at server startup before any middleware is registered.
 *
 * Env consolidation (2026-04-17): uses APP_MODE instead of APP_ENV.
 * Two valid states only:
 *   - { USE_MOCK_DATA=true,  AUTH_MODE=mock } → mock mode
 *   - { USE_MOCK_DATA=false, AUTH_MODE=jwt }  → real mode
 *
 * Edge function overrides: Supabase secrets are project-wide, so edge
 * functions like demo-api set globalThis.__envOverrides to force mock
 * mode without modifying Deno.env or process.env.
 */

/** Read an env var, respecting globalThis.__envOverrides */
function readEnv(env: Record<string, string | undefined>, key: string): string | undefined {
  const overrides = (globalThis as Record<string, unknown>).__envOverrides as
    | Record<string, string>
    | undefined;
  if (overrides && key in overrides) return overrides[key];
  return env[key];
}

/**
 * Validates that mock mode configuration is consistent and safe.
 * Throws if:
 * - Mock mode is enabled in staging or production
 * - USE_MOCK_DATA and AUTH_MODE are contradictory
 */
export function validateMockModeConfig(env: Record<string, string | undefined>): void {
  const useMock = readEnv(env, 'USE_MOCK_DATA') === 'true';
  const mockAuth = readEnv(env, 'AUTH_MODE') === 'mock';
  const appMode = readEnv(env, 'APP_MODE') || readEnv(env, 'APP_ENV') || '';

  if ((useMock || mockAuth) && ['staging', 'production', 'prod', 'stg'].includes(appMode)) {
    throw new Error(
      `FATAL: Mock mode cannot be enabled when APP_MODE=${appMode}. ` +
        'Set USE_MOCK_DATA=false and AUTH_MODE=jwt for non-mock environments.'
    );
  }

  // Only two valid configurations — no hybrid modes
  if (useMock !== mockAuth) {
    throw new Error(
      'FATAL: USE_MOCK_DATA and AUTH_MODE must be consistent. ' +
        'Either both mock (USE_MOCK_DATA=true + AUTH_MODE=mock) or both real (USE_MOCK_DATA=false + AUTH_MODE=jwt).'
    );
  }
}

/**
 * Returns true if the server is running in mock mode.
 */
export function isMockMode(env: Record<string, string | undefined>): boolean {
  return readEnv(env, 'USE_MOCK_DATA') === 'true';
}
