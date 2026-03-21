/**
 * CLI Entry Point — Database Seeder
 *
 * Usage:
 *   pnpm --filter @revbrain/database seed
 *   pnpm --filter @revbrain/database seed --cleanup
 *   pnpm --filter @revbrain/database seed --dry-run
 *   pnpm --filter @revbrain/database seed --yes
 *
 * Or from root:
 *   pnpm db:seed
 *   pnpm db:seed -- --cleanup
 */
import 'dotenv/config';
import { getDB } from './client';
import { seedDatabase, cleanupSeedData } from './seeders/index';
import { getLastRun } from './seeders/seed-log';
import { runPreflight, displayPreflight } from './seeders/preflight';

// ---------------------------------------------------------------------------
// Parse CLI args
// ---------------------------------------------------------------------------
const args = process.argv.slice(2);
const flags = {
  cleanup: args.includes('--cleanup'),
  dryRun: args.includes('--dry-run'),
  yes: args.includes('--yes') || args.includes('-y'),
  nonInteractive: args.includes('--non-interactive'),
  showCredentials: args.includes('--show-credentials'),
  skipAuth: args.includes('--skip-auth'),
};

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  console.log('\n=== RevBrain Database Seeder ===\n');

  // Resolve DATABASE_URL
  const databaseUrl = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('ERROR: DATABASE_URL or SUPABASE_DB_URL environment variable is not set.');
    console.error('Set it in your .env file or pass it inline:');
    console.error('  DATABASE_URL=postgresql://... pnpm db:seed\n');
    process.exit(1);
  }

  // Preflight check
  const preflight = runPreflight(databaseUrl);
  displayPreflight(preflight);

  if (!preflight.isSafe) {
    console.error('BLOCKED: This database appears to be a production target.');
    console.error('Seeding production databases is not allowed.');
    process.exit(1);
  }

  // Confirmation for non-local or unknown hosts
  if (!flags.yes && !flags.nonInteractive && !preflight.reason.includes('Local development')) {
    console.log('This does not appear to be a local database.');
    console.log('Pass --yes to confirm you want to proceed.\n');
    process.exit(1);
  }

  // Connect
  const db = getDB();

  if (flags.cleanup) {
    // --- Cleanup mode ---
    console.log('Mode: CLEANUP (deleting seed data)\n');

    const result = await cleanupSeedData(db, {
      dryRun: flags.dryRun,
    });

    if (result.success) {
      console.log('\nCleanup completed successfully.');
    } else {
      console.error('\nCleanup failed:');
      result.errors.forEach((e) => console.error(`  - ${e}`));
      process.exit(1);
    }
  } else {
    // --- Seed mode ---
    console.log(`Mode: SEED${flags.dryRun ? ' (dry run)' : ''}\n`);

    const result = await seedDatabase(db, {
      dryRun: flags.dryRun,
      environment: process.env.NODE_ENV || 'development',
    });

    // Display results
    console.log('\n--- Seed Results ---');
    console.log(`  Status:   ${result.success ? 'SUCCESS' : 'FAILED'}`);
    console.log(`  Run ID:   ${result.runId}`);
    console.log(`  Duration: ${result.durationMs}ms`);
    console.log('  Entity counts:');
    for (const [entity, count] of Object.entries(result.entityCounts)) {
      console.log(`    ${entity}: ${count}`);
    }
    if (result.errors.length > 0) {
      console.log('  Errors:');
      result.errors.forEach((e) => console.log(`    - ${e}`));
    }
    console.log('--------------------\n');

    // Show last run info
    try {
      const lastRun = await getLastRun(db);
      if (lastRun) {
        console.log('Last seed run:');
        console.log(`  Dataset:  ${lastRun.datasetName}`);
        console.log(`  Status:   ${lastRun.status}`);
        console.log(`  Started:  ${lastRun.startedAt.toISOString()}`);
        if (lastRun.completedAt) {
          console.log(`  Finished: ${lastRun.completedAt.toISOString()}`);
        }
        console.log('');
      }
    } catch {
      // Ignore — seed table may not exist yet in dry-run edge cases
    }

    if (!result.success) {
      process.exit(1);
    }
  }

  // Graceful shutdown — give postgres.js time to close
  process.exit(0);
}

main().catch((err) => {
  console.error('Unhandled error:', err);
  process.exit(1);
});
