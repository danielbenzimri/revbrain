/**
 * Environment loader for LOCAL server development
 *
 * Loads environment variables from the monorepo root:
 * - APP_ENV=local → loads /.env.local (mock mode, no external services)
 * - APP_ENV=stg   → loads /.env.stg   (local server against staging Supabase)
 * - APP_ENV=prod  → loads /.env.prod   (production — edge functions only)
 *
 * Commands:
 * - pnpm local → APP_ENV=local (mock mode)
 * - pnpm dev   → APP_ENV=stg   (local frontend+server, staging DB)
 *
 * Note: STG and PROD edge functions inject env vars automatically.
 * This loader is only used when running the local Hono dev server.
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
