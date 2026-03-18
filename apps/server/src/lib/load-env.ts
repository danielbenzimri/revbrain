/**
 * Environment loader for LOCAL server development
 *
 * Loads environment variables from the monorepo root:
 * - APP_ENV=local → loads /.env.local (default)
 * - APP_ENV=dev   → loads /.env.dev
 * - APP_ENV=prod  → loads /.env.prod
 *
 * Note: DEV and PROD environments run on Supabase Edge Functions,
 * which inject environment variables automatically. This loader is
 * only used when running the local Hono server for testing.
 *
 * Usage: Import this at the top of dev.ts (local server entry point)
 */
import { config } from 'dotenv';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const monorepoRoot = resolve(__dirname, '../../../..'); // apps/server/src/lib → root

export function loadEnv(): void {
  // Determine which env file to load (default to 'local' for local development)
  const appEnv = process.env.APP_ENV || 'local';
  const envFile = `.env.${appEnv}`;
  const envPath = resolve(monorepoRoot, envFile);

  if (existsSync(envPath)) {
    const result = config({ path: envPath });
    if (result.error) {
      console.error(`Failed to load ${envFile}:`, result.error.message);
    } else {
      console.log(`✓ Loaded environment: ${envFile} (from monorepo root)`);
    }
  } else {
    console.warn(`⚠ No env file found: ${envFile} at ${envPath}`);
  }
}

// Auto-load when imported
loadEnv();
