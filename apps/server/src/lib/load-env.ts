/**
 * Environment loader for LOCAL server development
 *
 * Loads environment variables from the monorepo root:
 * - APP_MODE=mock    → loads /.env + /.env.mock    (full mock mode)
 * - APP_MODE=staging → loads /.env + /.env.staging (local server against staging Supabase)
 *
 * Commands:
 * - pnpm dev     → APP_MODE=mock    (full mock mode)
 * - pnpm dev:stg → APP_MODE=staging (local server, staging DB + auth)
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
  const appMode = process.env.APP_MODE || 'mock';

  // Load base .env first (shared defaults)
  const basePath = resolve(monorepoRoot, '.env');
  if (existsSync(basePath)) {
    config({ path: basePath });
  }

  // Load mode-specific .env.{mode} (overrides base)
  const modePath = resolve(monorepoRoot, `.env.${appMode}`);
  if (existsSync(modePath)) {
    const result = config({ path: modePath, override: true });
    if (result.error) {
      console.error(`Failed to load .env.${appMode}:`, result.error.message);
    } else {
      console.log(`✓ Loaded environment: .env.${appMode} (from monorepo root)`);
    }
  } else {
    console.warn(`⚠ No env file found: .env.${appMode} at ${modePath}`);
  }
}

// Auto-load when imported
loadEnv();
