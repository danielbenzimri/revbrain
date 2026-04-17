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
 */

/**
 * Validates that mock mode configuration is consistent and safe.
 * Throws if:
 * - Mock mode is enabled in staging or production
 * - USE_MOCK_DATA and AUTH_MODE are contradictory
 */
export function validateMockModeConfig(env: Record<string, string | undefined>): void {
  const useMock = env.USE_MOCK_DATA === 'true';
  const mockAuth = env.AUTH_MODE === 'mock';
  // APP_MODE replaces APP_ENV. Fall back for backwards compat.
  const appMode = env.APP_MODE || env.APP_ENV || '';

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
  return env.USE_MOCK_DATA === 'true';
}
