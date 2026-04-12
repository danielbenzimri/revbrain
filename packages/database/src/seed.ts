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
import { config } from 'dotenv';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// Load env from monorepo root: .env.stg by default (seeder needs real DB)
const __dirname = dirname(fileURLToPath(import.meta.url));
const monorepoRoot = resolve(__dirname, '../../..'); // packages/database/src → root
const envFile = process.env.APP_MODE === 'production' ? '.env.production' : '.env.staging';
config({ path: resolve(monorepoRoot, envFile) });
// Also load base .env as fallback
config({ path: resolve(monorepoRoot, '.env') });
import { getDB } from './client';
import { seedDatabase, cleanupSeedData } from './seeders/index';
import { getLastRun } from './seeders/seed-log';
import { reconcileAuthUsers, cleanupAuthUsers } from './seeders/auth-users';
import { verifyRLS } from './seeders/rls-verify';
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
  verifyOnly: args.includes('--verify-only'),
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

  // --- Verify-only mode ---
  if (flags.verifyOnly) {
    console.log('Mode: VERIFY ONLY (RLS checks)\n');
    try {
      const { results, passed, failed } = await verifyRLS();
      console.log('\n--- RLS Verification Results ---');
      results.forEach((r) => {
        const icon = r.passed ? '✓' : '✗';
        console.log(`  ${icon} ${r.check}: expected ${r.expected}, got ${r.actual}`);
      });
      console.log(`\n  ${passed} passed, ${failed} failed`);
      console.log('--------------------------------\n');
      process.exit(failed > 0 ? 1 : 0);
    } catch (err) {
      console.error('RLS verification failed:', err instanceof Error ? err.message : err);
      process.exit(1);
    }
  }

  // Connect
  const db = getDB();

  if (flags.cleanup) {
    // --- Cleanup mode ---
    console.log('Mode: CLEANUP (deleting seed data)\n');

    // Clean up auth users BEFORE DB deletion (need supabaseUserId from DB)
    if (!flags.skipAuth) {
      console.log('[cleanup] Removing auth users...');
      try {
        await cleanupAuthUsers(db);
      } catch (err) {
        console.warn('[cleanup] Auth cleanup warning:', err instanceof Error ? err.message : err);
        console.warn('[cleanup] Continuing with DB cleanup...');
      }
    }

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

    // Phase 2: Auth reconciliation
    if (!flags.skipAuth && !flags.dryRun) {
      console.log('\nPhase 2: Auth Reconciliation');
      try {
        const authResults = await reconcileAuthUsers(db);
        const created = authResults.filter((r) => r.status === 'created').length;
        const mapped = authResults.filter((r) => r.status === 'mapped_existing').length;
        const reconciled = authResults.filter((r) => r.status === 'already_reconciled').length;
        const skipped = authResults.filter((r) => r.status === 'skipped').length;
        const failed = authResults.filter((r) => r.status === 'auth_failed').length;
        console.log(
          `\n  Summary: ${created} created, ${mapped} mapped, ${reconciled} existing, ${skipped} skipped, ${failed} failed`
        );

        if (flags.showCredentials) {
          const password = process.env.SEED_PASSWORD || 'RevBrain-Dev-2026!';
          console.log('\n  Login Credentials:');
          authResults
            .filter((r) => r.status !== 'skipped' && r.status !== 'auth_failed')
            .forEach((r) => {
              console.log(`    ${r.email} | ${r.role} | ${password}`);
            });
        } else {
          console.log('  Use --show-credentials to display login info.');
        }
      } catch (err) {
        console.error('\n  Auth reconciliation failed:', err instanceof Error ? err.message : err);
        console.error('  DB seed is complete. Re-run to retry auth.');
      }
    } else if (flags.skipAuth) {
      console.log('\nPhase 2: Auth Reconciliation — SKIPPED (--skip-auth)');
    }
  }

  // Graceful shutdown
  process.exit(0);
}

main().catch((err) => {
  console.error('Unhandled error:', err);
  process.exit(1);
});
