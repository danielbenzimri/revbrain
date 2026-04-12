/**
 * Mock Mode Guard
 *
 * Pure functions for validating mock mode configuration.
 * Called at server startup before any middleware is registered.
 */

/**
 * Validates that mock mode configuration is consistent and safe.
 * Throws if:
 * - Mock mode is enabled in production or staging
 * - USE_MOCK_DATA and AUTH_MODE are contradictory
 */
export function validateMockModeConfig(env: Record<string, string | undefined>): void {
  const useMock = env.USE_MOCK_DATA === 'true';
  const mockAuth = env.AUTH_MODE === 'mock';
  const appMode = env.APP_MODE || '';

  if ((useMock || mockAuth) && ['production', 'staging'].includes(appMode)) {
    throw new Error('FATAL: Mock mode cannot be enabled in staging or production.');
  }

  if (useMock !== mockAuth) {
    throw new Error(
      'FATAL: USE_MOCK_DATA=true requires AUTH_MODE=mock, and USE_MOCK_DATA=false requires AUTH_MODE=jwt.'
    );
  }
}

/**
 * Returns true if the server is running in mock mode.
 */
export function isMockMode(env: Record<string, string | undefined>): boolean {
  return env.USE_MOCK_DATA === 'true';
}
