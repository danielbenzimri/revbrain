/**
 * Environment loader for LOCAL server development.
 *
 * Loads environment variables from the monorepo root:
 *   - APP_MODE=mock      → loads .env + .env.mock    (offline, no external services)
 *   - APP_MODE=staging   → loads .env + .env.staging  (local server, staging Supabase)
 *
 * Commands:
 *   - pnpm dev      → APP_MODE=mock    (full offline mode, works after clone)
 *   - pnpm dev:stg  → APP_MODE=staging (local server + staging DB/auth)
 *
 * The .env base file is always loaded first (shared defaults).
 * Mode-specific file overrides anything in .env.
 *
 * STG and PROD edge functions inject env vars via the platform.
 * This loader is only used when running the local Hono dev server.
 *
 * Usage: Import this at the top of dev.ts (local server entry point).
 */
import { config } from 'dotenv';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const monorepoRoot = resolve(__dirname, '../../../..'); // apps/server/src/lib → root

export function loadEnv(): void {
  // APP_MODE replaces APP_ENV (env consolidation 2026-04-17).
  // Fall back to APP_ENV for backwards compat during transition,
  // then to 'mock' as the default.
  const appMode = process.env.APP_MODE || process.env.APP_ENV || 'mock';

  // Backwards-compat mapping for old APP_ENV values
  const modeMap: Record<string, string> = {
    local: 'mock',
    stg: 'staging',
    real: 'mock', // local:real is removed — fall back to mock
    'local-db': 'mock', // local:db is removed — fall back to mock
    prod: 'staging', // prod env is platform-injected, not loaded locally
  };
  const resolvedMode = modeMap[appMode] ?? appMode;

  // Always load the shared base .env first
  const basePath = resolve(monorepoRoot, '.env');
  if (existsSync(basePath)) {
    config({ path: basePath });
  }

  // Then load the mode-specific file (overrides .env)
  const modeFile = `.env.${resolvedMode}`;
  const modePath = resolve(monorepoRoot, modeFile);

  if (existsSync(modePath)) {
    config({ path: modePath, override: true });
    console.log(`✓ Loaded environment: .env + ${modeFile} (APP_MODE=${resolvedMode})`);
  } else {
    console.warn(`⚠ No env file found: ${modeFile} at ${modePath} (APP_MODE=${resolvedMode})`);
  }
}

// Auto-load when imported
loadEnv();
