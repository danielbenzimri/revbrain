import { describe, it, expect } from 'vitest';
import { validateMockModeConfig, isMockMode } from './mock-mode-guard.ts';

describe('validateMockModeConfig', () => {
  it('allows mock mode with APP_MODE=mock', () => {
    expect(() =>
      validateMockModeConfig({
        USE_MOCK_DATA: 'true',
        AUTH_MODE: 'mock',
        APP_MODE: 'mock',
      })
    ).not.toThrow();
  });

  it('allows real mode with APP_MODE=mock (local but jwt)', () => {
    expect(() =>
      validateMockModeConfig({
        USE_MOCK_DATA: 'false',
        AUTH_MODE: 'jwt',
        APP_MODE: 'mock',
      })
    ).not.toThrow();
  });

  it('allows unset env vars (defaults to real mode)', () => {
    expect(() => validateMockModeConfig({})).not.toThrow();
  });

  it('rejects staging + mock data (APP_MODE)', () => {
    expect(() =>
      validateMockModeConfig({
        USE_MOCK_DATA: 'true',
        AUTH_MODE: 'mock',
        APP_MODE: 'staging',
      })
    ).toThrow(/Mock mode cannot be enabled/);
  });

  it('rejects production + mock data (APP_MODE)', () => {
    expect(() =>
      validateMockModeConfig({
        USE_MOCK_DATA: 'true',
        AUTH_MODE: 'mock',
        APP_MODE: 'production',
      })
    ).toThrow(/Mock mode cannot be enabled/);
  });

  it('backwards compat: rejects APP_ENV=staging', () => {
    expect(() =>
      validateMockModeConfig({
        USE_MOCK_DATA: 'true',
        AUTH_MODE: 'mock',
        APP_ENV: 'staging',
      })
    ).toThrow(/Mock mode cannot be enabled/);
  });

  it('backwards compat: rejects APP_ENV=stg', () => {
    expect(() =>
      validateMockModeConfig({
        USE_MOCK_DATA: 'true',
        AUTH_MODE: 'mock',
        APP_ENV: 'stg',
      })
    ).toThrow(/Mock mode cannot be enabled/);
  });

  it('rejects contradictory USE_MOCK_DATA=true + AUTH_MODE=jwt', () => {
    expect(() =>
      validateMockModeConfig({
        USE_MOCK_DATA: 'true',
        AUTH_MODE: 'jwt',
        APP_MODE: 'mock',
      })
    ).toThrow(/USE_MOCK_DATA and AUTH_MODE must be consistent/);
  });

  it('rejects contradictory USE_MOCK_DATA=false + AUTH_MODE=mock', () => {
    expect(() =>
      validateMockModeConfig({
        USE_MOCK_DATA: 'false',
        AUTH_MODE: 'mock',
        APP_MODE: 'mock',
      })
    ).toThrow(/USE_MOCK_DATA and AUTH_MODE must be consistent/);
  });

  it('rejects USE_MOCK_DATA=true with no AUTH_MODE set', () => {
    expect(() =>
      validateMockModeConfig({
        USE_MOCK_DATA: 'true',
        APP_MODE: 'mock',
      })
    ).toThrow(/USE_MOCK_DATA and AUTH_MODE must be consistent/);
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
