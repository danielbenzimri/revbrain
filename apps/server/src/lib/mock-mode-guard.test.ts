import { describe, it, expect } from 'vitest';
import { validateMockModeConfig, isMockMode } from './mock-mode-guard.ts';

describe('validateMockModeConfig', () => {
  it('allows local + mock mode', () => {
    expect(() =>
      validateMockModeConfig({
        USE_MOCK_DATA: 'true',
        AUTH_MODE: 'mock',
        APP_ENV: 'local',
      })
    ).not.toThrow();
  });

  it('allows local + real mode', () => {
    expect(() =>
      validateMockModeConfig({
        USE_MOCK_DATA: 'false',
        AUTH_MODE: 'jwt',
        APP_ENV: 'local',
      })
    ).not.toThrow();
  });

  it('allows unset env vars (defaults to real mode)', () => {
    expect(() => validateMockModeConfig({})).not.toThrow();
  });

  it('rejects production + mock data', () => {
    expect(() =>
      validateMockModeConfig({
        USE_MOCK_DATA: 'true',
        AUTH_MODE: 'mock',
        APP_ENV: 'production',
      })
    ).toThrow('FATAL: Mock mode cannot be enabled in production or staging.');
  });

  it('rejects staging + mock auth', () => {
    expect(() =>
      validateMockModeConfig({
        USE_MOCK_DATA: 'true',
        AUTH_MODE: 'mock',
        APP_ENV: 'staging',
      })
    ).toThrow('FATAL: Mock mode cannot be enabled in production or staging.');
  });

  it('rejects production + mock auth only', () => {
    expect(() =>
      validateMockModeConfig({
        AUTH_MODE: 'mock',
        APP_ENV: 'production',
      })
    ).toThrow('FATAL: Mock mode cannot be enabled in production or staging.');
  });

  it('rejects USE_MOCK_DATA=true + AUTH_MODE=jwt (contradictory)', () => {
    expect(() =>
      validateMockModeConfig({
        USE_MOCK_DATA: 'true',
        AUTH_MODE: 'jwt',
        APP_ENV: 'local',
      })
    ).toThrow('FATAL: USE_MOCK_DATA=true requires AUTH_MODE=mock');
  });

  it('rejects USE_MOCK_DATA=false + AUTH_MODE=mock (contradictory)', () => {
    expect(() =>
      validateMockModeConfig({
        USE_MOCK_DATA: 'false',
        AUTH_MODE: 'mock',
        APP_ENV: 'local',
      })
    ).toThrow('FATAL: USE_MOCK_DATA=true requires AUTH_MODE=mock');
  });

  it('rejects USE_MOCK_DATA=true with no AUTH_MODE set', () => {
    expect(() =>
      validateMockModeConfig({
        USE_MOCK_DATA: 'true',
        APP_ENV: 'local',
      })
    ).toThrow('FATAL: USE_MOCK_DATA=true requires AUTH_MODE=mock');
  });
});

describe('isMockMode', () => {
  it('returns true when USE_MOCK_DATA=true', () => {
    expect(isMockMode({ USE_MOCK_DATA: 'true' })).toBe(true);
  });

  it('returns false when USE_MOCK_DATA=false', () => {
    expect(isMockMode({ USE_MOCK_DATA: 'false' })).toBe(false);
  });

  it('returns false when USE_MOCK_DATA is not set', () => {
    expect(isMockMode({})).toBe(false);
  });

  it('returns false for any other value', () => {
    expect(isMockMode({ USE_MOCK_DATA: 'yes' })).toBe(false);
    expect(isMockMode({ USE_MOCK_DATA: '1' })).toBe(false);
  });
});
