/**
 * Application Configuration & Environment Validation
 *
 * Validates required environment variables at startup and provides
 * type-safe access to configuration values.
 */

import { getEnv } from './env.ts';

/**
 * Check if running in production environment
 *
 * Priority:
 * 1. APP_ENV=production (explicit, recommended for Edge Functions)
 * 2. NODE_ENV=production (Node.js standard)
 * 3. Falls back to false (assume development)
 *
 * Note: We no longer use DENO_DEPLOYMENT_ID because it's set for ALL
 * deployed Edge Functions (dev and prod), making it unsuitable for
 * distinguishing environments.
 */
export function isProduction(): boolean {
  // Check explicit APP_ENV first (works in both Deno and Node)
  const appEnv = getEnv('APP_ENV');
  if (appEnv) {
    return appEnv === 'production';
  }

  // Node.js environment check
  if (typeof process !== 'undefined' && process.env?.NODE_ENV === 'production') {
    return true;
  }

  // Default to development
  return false;
}

/**
 * Environment configuration schema
 */
interface EnvConfig {
  nodeEnv: string;
  databaseUrl?: string;
  supabaseUrl?: string;
  supabaseAnonKey?: string;
  supabaseServiceKey?: string;
}

/**
 * Load and validate environment configuration
 * Throws if required variables are missing in production
 */
export function loadConfig(): EnvConfig {
  const config: EnvConfig = {
    nodeEnv: getEnv('NODE_ENV') || 'development',
    databaseUrl: getEnv('DATABASE_URL'),
    supabaseUrl: getEnv('SUPABASE_URL'),
    supabaseAnonKey: getEnv('SUPABASE_ANON_KEY'),
    supabaseServiceKey: getEnv('SUPABASE_SERVICE_ROLE_KEY'),
  };

  // In production, validate required variables
  if (isProduction()) {
    const required: (keyof EnvConfig)[] = ['supabaseUrl', 'supabaseAnonKey'];
    const missing = required.filter((key) => !config[key]);

    if (missing.length > 0) {
      throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
    }
  }

  return config;
}

/**
 * Get application version from package.json or environment
 */
export function getVersion(): string {
  return getEnv('APP_VERSION') || getEnv('npm_package_version') || '1.0.0';
}

/**
 * Get deployment region
 */
export function getRegion(): string {
  return getEnv('DENO_REGION') || getEnv('AWS_REGION') || 'local';
}
