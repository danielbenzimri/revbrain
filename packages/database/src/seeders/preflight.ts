/**
 * Preflight Checks
 *
 * Parses DATABASE_URL, checks against known safe targets,
 * and blocks production databases from being seeded.
 */

// ---------------------------------------------------------------------------
// Known production hostnames / patterns to block
// ---------------------------------------------------------------------------
const PRODUCTION_PATTERNS = [
  /\.supabase\.co$/, // Supabase cloud (production)
  /prod/i, // Any hostname containing "prod"
  /\.rds\.amazonaws\.com$/, // AWS RDS
  /\.cloudsql\./, // GCP Cloud SQL
];

const SAFE_HOSTS = new Set([
  'localhost',
  '127.0.0.1',
  '0.0.0.0',
  '::1',
  'db.localhost',
  'host.docker.internal',
]);

// Supabase local dev default port
const SAFE_PORTS = new Set(['54322', '5432']);

export interface PreflightResult {
  hostname: string;
  port: string;
  database: string;
  isSafe: boolean;
  reason: string;
}

// ---------------------------------------------------------------------------
// Parse DATABASE_URL and evaluate safety
// ---------------------------------------------------------------------------
export function runPreflight(databaseUrl: string): PreflightResult {
  let parsed: URL;
  try {
    // postgres:// URLs can be parsed as standard URLs
    parsed = new URL(databaseUrl);
  } catch {
    return {
      hostname: 'unknown',
      port: 'unknown',
      database: 'unknown',
      isSafe: false,
      reason: 'Could not parse DATABASE_URL',
    };
  }

  const hostname = parsed.hostname;
  const port = parsed.port || '5432';
  const database = parsed.pathname.replace(/^\//, '') || 'postgres';

  // Check if the host is a known safe local target
  if (SAFE_HOSTS.has(hostname)) {
    return {
      hostname,
      port,
      database,
      isSafe: true,
      reason: `Local development database (${hostname}:${port})`,
    };
  }

  // Block known production patterns
  for (const pattern of PRODUCTION_PATTERNS) {
    if (pattern.test(hostname)) {
      return {
        hostname,
        port,
        database,
        isSafe: false,
        reason: `Hostname "${hostname}" matches production pattern: ${pattern}`,
      };
    }
  }

  // Unknown host — allow but warn
  return {
    hostname,
    port,
    database,
    isSafe: true,
    reason: `Unknown host "${hostname}" — proceeding (use --yes to skip confirmation)`,
  };
}

// ---------------------------------------------------------------------------
// Display preflight info
// ---------------------------------------------------------------------------
export function displayPreflight(result: PreflightResult): void {
  console.log('\n--- Preflight Check ---');
  console.log(`  Host:     ${result.hostname}:${result.port}`);
  console.log(`  Database: ${result.database}`);
  console.log(`  Safe:     ${result.isSafe ? 'YES' : 'NO'}`);
  console.log(`  Reason:   ${result.reason}`);
  console.log('------------------------\n');
}
