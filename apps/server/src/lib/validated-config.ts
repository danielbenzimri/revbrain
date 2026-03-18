/**
 * Validated Configuration Module
 *
 * Uses Zod to validate environment variables at startup time.
 * Provides type-safe access to configuration values with proper error messages.
 *
 * Usage:
 *   import { config, validateConfig } from './lib/validated-config.ts';
 *
 *   // At startup (e.g., in index.ts):
 *   validateConfig();
 *
 *   // Throughout the app:
 *   const url = config.supabase.url;
 */
import { z } from 'zod';
import { getEnv } from './env.ts';

// =============================================================================
// SCHEMA DEFINITIONS
// =============================================================================

/**
 * Core environment schema - validated at startup
 */
const envSchema = z.object({
  // Environment mode
  nodeEnv: z
    .enum(['development', 'production', 'test'])
    .default('development')
    .describe('Runtime environment'),
  appEnv: z
    .enum(['development', 'staging', 'production'])
    .optional()
    .describe('Explicit app environment (overrides NODE_ENV for Edge)'),

  // Database
  databaseUrl: z.string().url().optional().describe('PostgreSQL connection string'),

  // Supabase
  supabaseUrl: z.string().url().optional().describe('Supabase project URL'),
  supabaseAnonKey: z.string().min(1).optional().describe('Supabase anonymous key'),
  supabaseServiceKey: z.string().min(1).optional().describe('Supabase service role key'),

  // Stripe
  stripeSecretKey: z.string().min(1).optional().describe('Stripe secret key'),
  stripeWebhookSecret: z.string().min(1).optional().describe('Stripe webhook signing secret'),

  // Email
  emailAdapter: z.enum(['console', 'resend']).default('console').describe('Email service adapter'),
  resendApiKey: z.string().min(1).optional().describe('Resend API key for email sending'),
  emailFrom: z
    .string()
    .email()
    .default('noreply@geometrixlabs.com')
    .describe('Default sender email address'),

  // URLs
  appUrl: z.string().url().default('http://localhost:5173').describe('Frontend application URL'),
  frontendUrl: z
    .string()
    .url()
    .default('http://localhost:5173')
    .describe('Frontend URL (alias for appUrl)'),

  // Secrets
  webhookRetrySecret: z
    .string()
    .min(16)
    .optional()
    .describe('Secret for authenticating webhook retry requests'),
  testCleanupKey: z.string().min(8).optional().describe('Secret for dev/test cleanup endpoints'),

  // Feature flags
  sentryDsn: z.string().url().optional().describe('Sentry DSN for error tracking'),

  // Application info
  appVersion: z.string().default('1.0.0').describe('Application version'),
});

/**
 * Production-specific required fields
 */
const productionRequiredFields = [
  'supabaseUrl',
  'supabaseAnonKey',
  'supabaseServiceKey',
  'stripeSecretKey',
] as const;

// =============================================================================
// TYPES
// =============================================================================

export type EnvConfig = z.infer<typeof envSchema>;

export interface ValidatedConfig {
  env: 'development' | 'production' | 'test';
  isProduction: boolean;
  isDevelopment: boolean;
  isTest: boolean;

  supabase: {
    url: string | undefined;
    anonKey: string | undefined;
    serviceKey: string | undefined;
    isConfigured: boolean;
  };

  stripe: {
    secretKey: string | undefined;
    webhookSecret: string | undefined;
    isConfigured: boolean;
  };

  email: {
    adapter: 'console' | 'resend';
    resendApiKey: string | undefined;
    from: string;
    isConfigured: boolean;
  };

  urls: {
    app: string;
    frontend: string;
  };

  secrets: {
    webhookRetry: string | undefined;
    testCleanup: string | undefined;
  };

  monitoring: {
    sentryDsn: string | undefined;
    isSentryConfigured: boolean;
  };

  version: string;
}

// =============================================================================
// VALIDATION
// =============================================================================

/** Cached validated config */
let cachedConfig: ValidatedConfig | null = null;

/**
 * Load environment variables into raw object
 */
function loadEnvVars(): Record<string, string | undefined> {
  return {
    nodeEnv: getEnv('NODE_ENV'),
    appEnv: getEnv('APP_ENV'),
    databaseUrl: getEnv('DATABASE_URL'),
    supabaseUrl: getEnv('SUPABASE_URL'),
    supabaseAnonKey: getEnv('SUPABASE_ANON_KEY'),
    supabaseServiceKey: getEnv('SUPABASE_SERVICE_ROLE_KEY'),
    stripeSecretKey: getEnv('STRIPE_SECRET_KEY'),
    stripeWebhookSecret: getEnv('STRIPE_WEBHOOK_SECRET'),
    emailAdapter: getEnv('EMAIL_ADAPTER'),
    resendApiKey: getEnv('RESEND_API_KEY'),
    emailFrom: getEnv('EMAIL_FROM'),
    appUrl: getEnv('APP_URL'),
    frontendUrl: getEnv('FRONTEND_URL'),
    webhookRetrySecret: getEnv('WEBHOOK_RETRY_SECRET'),
    testCleanupKey: getEnv('TEST_CLEANUP_KEY'),
    sentryDsn: getEnv('SENTRY_DSN'),
    appVersion: getEnv('APP_VERSION') || getEnv('npm_package_version'),
  };
}

/**
 * Validate environment variables and return typed config.
 * Call this at application startup.
 *
 * @throws Error if validation fails in production
 */
export function validateConfig(): ValidatedConfig {
  const rawEnv = loadEnvVars();

  // Parse with Zod
  const parseResult = envSchema.safeParse(rawEnv);

  if (!parseResult.success) {
    const errors = parseResult.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');

    const errorMessage = `Environment validation failed:\n${errors}`;

    // In production, always throw
    const isProduction = rawEnv.appEnv === 'production' || rawEnv.nodeEnv === 'production';
    if (isProduction) {
      throw new Error(errorMessage);
    }

    // In development, log warning but continue
    console.warn(`[Config Warning] ${errorMessage}`);
  }

  const env = parseResult.success ? parseResult.data : (rawEnv as unknown as EnvConfig);

  // Production-specific validation
  const effectiveEnv = env.appEnv || env.nodeEnv;
  const isProduction = effectiveEnv === 'production';

  if (isProduction) {
    const missingRequired: string[] = [];

    for (const field of productionRequiredFields) {
      if (!env[field]) {
        missingRequired.push(field);
      }
    }

    if (missingRequired.length > 0) {
      throw new Error(
        `Missing required environment variables in production:\n` +
          missingRequired.map((f) => `  - ${f}`).join('\n')
      );
    }
  }

  // Build validated config object
  const config: ValidatedConfig = {
    env: effectiveEnv as 'development' | 'production' | 'test',
    isProduction,
    isDevelopment: effectiveEnv === 'development',
    isTest: effectiveEnv === 'test' || env.nodeEnv === 'test',

    supabase: {
      url: env.supabaseUrl,
      anonKey: env.supabaseAnonKey,
      serviceKey: env.supabaseServiceKey,
      isConfigured: !!(env.supabaseUrl && env.supabaseAnonKey),
    },

    stripe: {
      secretKey: env.stripeSecretKey,
      webhookSecret: env.stripeWebhookSecret,
      isConfigured: !!env.stripeSecretKey,
    },

    email: {
      adapter: env.emailAdapter || 'console',
      resendApiKey: env.resendApiKey,
      from: env.emailFrom || 'noreply@geometrixlabs.com',
      isConfigured: env.emailAdapter === 'resend' && !!env.resendApiKey,
    },

    urls: {
      app: env.appUrl || 'http://localhost:5173',
      frontend: env.frontendUrl || env.appUrl || 'http://localhost:5173',
    },

    secrets: {
      webhookRetry: env.webhookRetrySecret,
      testCleanup: env.testCleanupKey,
    },

    monitoring: {
      sentryDsn: env.sentryDsn,
      isSentryConfigured: !!env.sentryDsn,
    },

    version: env.appVersion || '1.0.0',
  };

  // Cache the config
  cachedConfig = config;

  return config;
}

/**
 * Get the validated config. Throws if validateConfig() hasn't been called.
 */
export function getConfig(): ValidatedConfig {
  if (!cachedConfig) {
    // Auto-validate on first access
    return validateConfig();
  }
  return cachedConfig;
}

/**
 * Type-safe config access (lazy initialization)
 *
 * Usage:
 *   import { config } from './lib/validated-config.ts';
 *   const url = config.supabase.url;
 */
export const config = new Proxy({} as ValidatedConfig, {
  get(_, prop: keyof ValidatedConfig) {
    return getConfig()[prop];
  },
});

/**
 * Reset cached config (useful for testing)
 */
export function resetConfig(): void {
  cachedConfig = null;
}
