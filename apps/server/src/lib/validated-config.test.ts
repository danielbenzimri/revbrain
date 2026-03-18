import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { validateConfig, getConfig, resetConfig } from './validated-config.ts';

// Mock getEnv to control environment variables in tests
const mockEnvVars: Record<string, string | undefined> = {};

vi.mock('./env.ts', () => ({
  getEnv: vi.fn((key: string) => mockEnvVars[key]),
}));

function setEnv(vars: Record<string, string | undefined>) {
  Object.keys(mockEnvVars).forEach((key) => delete mockEnvVars[key]);
  Object.assign(mockEnvVars, vars);
}

describe('validated-config', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetConfig();
    setEnv({});
  });

  afterEach(() => {
    resetConfig();
  });

  describe('validateConfig', () => {
    it('should return valid config in development mode', () => {
      setEnv({
        NODE_ENV: 'development',
      });

      const config = validateConfig();

      expect(config.env).toBe('development');
      expect(config.isDevelopment).toBe(true);
      expect(config.isProduction).toBe(false);
    });

    it('should use APP_ENV over NODE_ENV', () => {
      setEnv({
        NODE_ENV: 'development',
        APP_ENV: 'production',
        SUPABASE_URL: 'https://example.supabase.co',
        SUPABASE_ANON_KEY: 'anon-key',
        SUPABASE_SERVICE_ROLE_KEY: 'service-key',
        STRIPE_SECRET_KEY: 'sk_test_xxx',
      });

      const config = validateConfig();

      expect(config.env).toBe('production');
      expect(config.isProduction).toBe(true);
    });

    it('should validate Supabase configuration', () => {
      setEnv({
        NODE_ENV: 'development',
        SUPABASE_URL: 'https://example.supabase.co',
        SUPABASE_ANON_KEY: 'test-anon-key',
        SUPABASE_SERVICE_ROLE_KEY: 'test-service-key',
      });

      const config = validateConfig();

      expect(config.supabase.isConfigured).toBe(true);
      expect(config.supabase.url).toBe('https://example.supabase.co');
      expect(config.supabase.anonKey).toBe('test-anon-key');
    });

    it('should validate Stripe configuration', () => {
      setEnv({
        NODE_ENV: 'development',
        STRIPE_SECRET_KEY: 'sk_test_123',
        STRIPE_WEBHOOK_SECRET: 'whsec_123',
      });

      const config = validateConfig();

      expect(config.stripe.isConfigured).toBe(true);
      expect(config.stripe.secretKey).toBe('sk_test_123');
      expect(config.stripe.webhookSecret).toBe('whsec_123');
    });

    it('should validate email configuration', () => {
      setEnv({
        NODE_ENV: 'development',
        EMAIL_ADAPTER: 'resend',
        RESEND_API_KEY: 're_123',
        EMAIL_FROM: 'test@example.com',
      });

      const config = validateConfig();

      expect(config.email.adapter).toBe('resend');
      expect(config.email.isConfigured).toBe(true);
      expect(config.email.from).toBe('test@example.com');
    });

    it('should default email adapter to console', () => {
      setEnv({
        NODE_ENV: 'development',
      });

      const config = validateConfig();

      expect(config.email.adapter).toBe('console');
      expect(config.email.isConfigured).toBe(false);
    });

    it('should validate URLs with defaults', () => {
      setEnv({
        NODE_ENV: 'development',
      });

      const config = validateConfig();

      expect(config.urls.app).toBe('http://localhost:5173');
      expect(config.urls.frontend).toBe('http://localhost:5173');
    });

    it('should use custom URLs when provided', () => {
      setEnv({
        NODE_ENV: 'development',
        APP_URL: 'https://app.example.com',
        FRONTEND_URL: 'https://www.example.com',
      });

      const config = validateConfig();

      expect(config.urls.app).toBe('https://app.example.com');
      expect(config.urls.frontend).toBe('https://www.example.com');
    });

    it('should throw in production when required vars are missing', () => {
      setEnv({
        APP_ENV: 'production',
      });

      expect(() => validateConfig()).toThrow('Missing required environment variables');
    });

    it('should not throw in production when all required vars are present', () => {
      setEnv({
        APP_ENV: 'production',
        SUPABASE_URL: 'https://example.supabase.co',
        SUPABASE_ANON_KEY: 'anon-key',
        SUPABASE_SERVICE_ROLE_KEY: 'service-key',
        STRIPE_SECRET_KEY: 'sk_live_xxx',
      });

      expect(() => validateConfig()).not.toThrow();
    });

    it('should detect test environment', () => {
      setEnv({
        NODE_ENV: 'test',
      });

      const config = validateConfig();

      expect(config.isTest).toBe(true);
      expect(config.isProduction).toBe(false);
    });

    it('should validate Sentry DSN format', () => {
      setEnv({
        NODE_ENV: 'development',
        SENTRY_DSN: 'https://abc123@sentry.io/12345',
      });

      const config = validateConfig();

      expect(config.monitoring.isSentryConfigured).toBe(true);
      expect(config.monitoring.sentryDsn).toBe('https://abc123@sentry.io/12345');
    });

    it('should handle app version from npm_package_version', () => {
      setEnv({
        NODE_ENV: 'development',
        npm_package_version: '2.0.0',
      });

      const config = validateConfig();

      expect(config.version).toBe('2.0.0');
    });
  });

  describe('getConfig', () => {
    it('should return cached config after validation', () => {
      setEnv({
        NODE_ENV: 'development',
      });

      const config1 = validateConfig();
      const config2 = getConfig();

      expect(config1).toBe(config2);
    });

    it('should auto-validate on first access', () => {
      setEnv({
        NODE_ENV: 'development',
      });

      const config = getConfig();

      expect(config.env).toBe('development');
    });
  });

  describe('resetConfig', () => {
    it('should clear cached config', () => {
      setEnv({
        NODE_ENV: 'development',
        APP_URL: 'https://first.example.com',
      });

      const config1 = validateConfig();
      expect(config1.urls.app).toBe('https://first.example.com');

      setEnv({
        NODE_ENV: 'development',
        APP_URL: 'https://second.example.com',
      });

      resetConfig();
      const config2 = validateConfig();

      expect(config2.urls.app).toBe('https://second.example.com');
    });
  });
});
