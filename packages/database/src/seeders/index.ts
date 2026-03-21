/**
 * Database Seeder — Orchestrator
 *
 * Phased execution that inserts seed data in FK order using upserts.
 * Uses an advisory lock to prevent concurrent seed runs.
 */
import { sql, eq } from 'drizzle-orm';
import type { DrizzleDB } from '../client';
import {
  plans,
  organizations,
  users,
  projects,
  auditLogs,
  supportTickets,
  ticketMessages,
  coupons,
} from '../schema';
import {
  getPlanInserts,
  getOrgInserts,
  getUserInsertsWithoutInvitedBy,
  getUserInvitedByUpdates,
  getProjectInserts,
  getAuditLogInserts,
  getSupportTicketInserts,
  getTicketMessageInserts,
  getCouponInserts,
} from './transforms';
import { ensureSeedTables, recordSeedRun, updateSeedRun } from './seed-log';
import { MOCK_IDS } from '@revbrain/seed-data';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export interface SeedOptions {
  /** Skip the advisory lock (useful in tests) */
  skipLock?: boolean;
  /** Dry-run mode — log what would happen without writing */
  dryRun?: boolean;
  /** Environment label for the seed run record */
  environment?: string;
}

export interface SeedResult {
  success: boolean;
  runId: string | null;
  entityCounts: Record<string, number>;
  errors: string[];
  durationMs: number;
}

// ---------------------------------------------------------------------------
// Advisory Lock helpers
// ---------------------------------------------------------------------------
const LOCK_KEY = "hashtext('revbrain:seed')";

async function acquireLock(db: DrizzleDB): Promise<void> {
  await db.execute(sql.raw(`SELECT pg_advisory_lock(${LOCK_KEY})`));
}

async function releaseLock(db: DrizzleDB): Promise<void> {
  await db.execute(sql.raw(`SELECT pg_advisory_unlock(${LOCK_KEY})`));
}

// ---------------------------------------------------------------------------
// Main Seed Function
// ---------------------------------------------------------------------------
export async function seedDatabase(db: DrizzleDB, options: SeedOptions = {}): Promise<SeedResult> {
  const start = Date.now();
  const entityCounts: Record<string, number> = {};
  const errors: string[] = [];
  let runId: string | null = null;

  // Phase 0: Preflight
  if (!options.skipLock) {
    console.log('[seed] Acquiring advisory lock...');
    await acquireLock(db);
  }

  try {
    // Ensure seed tracking table exists
    await ensureSeedTables(db);

    // Record seed run start
    runId = await recordSeedRun(db, {
      datasetName: 'revbrain-curated',
      status: 'running',
      environment: options.environment,
    });
    console.log(`[seed] Run ID: ${runId}`);

    if (options.dryRun) {
      console.log('[seed] DRY RUN — no data will be written');
      // Still compute counts for display
      entityCounts.plans = getPlanInserts().length;
      entityCounts.organizations = getOrgInserts().length;
      entityCounts.users = getUserInsertsWithoutInvitedBy().length;
      entityCounts.projects = getProjectInserts().length;
      entityCounts.auditLogs = getAuditLogInserts().length;
      entityCounts.supportTickets = getSupportTicketInserts().length;
      entityCounts.ticketMessages = getTicketMessageInserts().length;
      entityCounts.coupons = getCouponInserts().length;

      await updateSeedRun(db, runId, {
        status: 'completed',
        completedAt: new Date(),
        entityCounts,
      });

      return { success: true, runId, entityCounts, errors, durationMs: Date.now() - start };
    }

    // Phase 1: Transactional upserts in FK order
    await db.transaction(async (tx) => {
      // 1. Plans
      console.log('[seed] 1/9  Plans...');
      const planRows = getPlanInserts();
      for (const row of planRows) {
        await tx
          .insert(plans)
          .values(row)
          .onConflictDoUpdate({
            target: plans.id,
            set: { ...row, id: undefined } as any,
          });
      }
      entityCounts.plans = planRows.length;

      // 2. Organizations
      console.log('[seed] 2/9  Organizations...');
      const orgRows = getOrgInserts();
      for (const row of orgRows) {
        await tx
          .insert(organizations)
          .values(row)
          .onConflictDoUpdate({
            target: organizations.id,
            set: { ...row, id: undefined } as any,
          });
      }
      entityCounts.organizations = orgRows.length;

      // 3. Users (invitedBy = null)
      console.log('[seed] 3/9  Users (initial)...');
      const userRows = getUserInsertsWithoutInvitedBy();
      for (const row of userRows) {
        await tx
          .insert(users)
          .values(row)
          .onConflictDoUpdate({
            target: users.id,
            set: { ...row, id: undefined } as any,
          });
      }
      entityCounts.users = userRows.length;

      // 4. Users UPDATE (set invitedBy)
      console.log('[seed] 4/9  Users (invitedBy)...');
      const invitedByUpdates = getUserInvitedByUpdates();
      for (const update of invitedByUpdates) {
        await tx.update(users).set({ invitedBy: update.invitedBy }).where(eq(users.id, update.id));
      }

      // 5. Projects
      console.log('[seed] 5/9  Projects...');
      const projectRows = getProjectInserts();
      for (const row of projectRows) {
        await tx
          .insert(projects)
          .values(row)
          .onConflictDoUpdate({
            target: projects.id,
            set: { ...row, id: undefined } as any,
          });
      }
      entityCounts.projects = projectRows.length;

      // 6. Audit Logs
      console.log('[seed] 6/9  Audit Logs...');
      const auditRows = getAuditLogInserts();
      for (const row of auditRows) {
        await tx
          .insert(auditLogs)
          .values(row)
          .onConflictDoUpdate({
            target: auditLogs.id,
            set: { ...row, id: undefined } as any,
          });
      }
      entityCounts.auditLogs = auditRows.length;

      // 7. Support Tickets
      console.log('[seed] 7/9  Support Tickets...');
      const ticketRows = getSupportTicketInserts();
      for (const row of ticketRows) {
        await tx
          .insert(supportTickets)
          .values(row)
          .onConflictDoUpdate({
            target: supportTickets.id,
            set: { ...row, id: undefined } as any,
          });
      }
      entityCounts.supportTickets = ticketRows.length;

      // 8. Ticket Messages
      console.log('[seed] 8/9  Ticket Messages...');
      const messageRows = getTicketMessageInserts();
      for (const row of messageRows) {
        await tx
          .insert(ticketMessages)
          .values(row)
          .onConflictDoUpdate({
            target: ticketMessages.id,
            set: { ...row, id: undefined } as any,
          });
      }
      entityCounts.ticketMessages = messageRows.length;

      // 9. Coupons
      console.log('[seed] 9/9  Coupons...');
      const couponRows = getCouponInserts();
      for (const row of couponRows) {
        await tx
          .insert(coupons)
          .values(row)
          .onConflictDoUpdate({
            target: coupons.id,
            set: { ...row, id: undefined } as any,
          });
      }
      entityCounts.coupons = couponRows.length;

      // tenant_overrides: skip — no table in schema yet
      console.log('[seed] SKIP  tenant_overrides (no table in schema yet)');
    });

    // Record success
    await updateSeedRun(db, runId, {
      status: 'completed',
      completedAt: new Date(),
      entityCounts,
    });

    return { success: true, runId, entityCounts, errors, durationMs: Date.now() - start };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    errors.push(message);

    if (runId) {
      await updateSeedRun(db, runId, {
        status: 'failed',
        completedAt: new Date(),
        errorSummary: message,
      }).catch(() => {
        /* best effort */
      });
    }

    return { success: false, runId, entityCounts, errors, durationMs: Date.now() - start };
  } finally {
    if (!options.skipLock) {
      console.log('[seed] Releasing advisory lock...');
      await releaseLock(db).catch(() => {
        /* best effort */
      });
    }
  }
}

// ---------------------------------------------------------------------------
// Cleanup — delete seed data by deterministic MOCK_IDS in reverse FK order
// ---------------------------------------------------------------------------
export interface CleanupOptions {
  skipLock?: boolean;
  dryRun?: boolean;
}

export async function cleanupSeedData(
  db: DrizzleDB,
  options: CleanupOptions = {}
): Promise<{ success: boolean; errors: string[] }> {
  const errors: string[] = [];

  if (!options.skipLock) {
    console.log('[cleanup] Acquiring advisory lock...');
    await acquireLock(db);
  }

  try {
    if (options.dryRun) {
      console.log('[cleanup] DRY RUN — no data will be deleted');
      return { success: true, errors };
    }

    await db.transaction(async (tx) => {
      // Collect all known IDs
      const allTicketIds = [
        MOCK_IDS.TICKET_1,
        MOCK_IDS.TICKET_2,
        MOCK_IDS.TICKET_3,
        MOCK_IDS.TICKET_4,
        MOCK_IDS.TICKET_5,
        MOCK_IDS.TICKET_6,
      ];

      const allCouponIds = [
        MOCK_IDS.COUPON_ACTIVE_PERCENT,
        MOCK_IDS.COUPON_EXPIRED_FIXED,
        MOCK_IDS.COUPON_SCHEDULED,
        MOCK_IDS.COUPON_MAXED_OUT,
      ];

      const allProjectIds = [
        MOCK_IDS.PROJECT_Q1_MIGRATION,
        MOCK_IDS.PROJECT_LEGACY_CLEANUP,
        MOCK_IDS.PROJECT_RCA_PILOT,
        MOCK_IDS.PROJECT_PHASE2,
      ];

      const allUserIds = [
        MOCK_IDS.USER_SYSTEM_ADMIN,
        MOCK_IDS.USER_ACME_OWNER,
        MOCK_IDS.USER_ACME_ADMIN,
        MOCK_IDS.USER_ACME_OPERATOR,
        MOCK_IDS.USER_ACME_REVIEWER,
        MOCK_IDS.USER_BETA_OWNER,
        MOCK_IDS.USER_BETA_OPERATOR,
        MOCK_IDS.USER_ACME_PENDING,
      ];

      const allOrgIds = [MOCK_IDS.ORG_ACME, MOCK_IDS.ORG_BETA];

      const allPlanIds = [MOCK_IDS.PLAN_STARTER, MOCK_IDS.PLAN_PRO, MOCK_IDS.PLAN_ENTERPRISE];

      // Delete in reverse FK order

      // 1. Ticket messages (FK -> support_tickets)
      console.log('[cleanup] Deleting ticket messages...');
      for (const ticketId of allTicketIds) {
        await tx.delete(ticketMessages).where(eq(ticketMessages.ticketId, ticketId));
      }

      // 2. Support tickets (FK -> users, organizations)
      console.log('[cleanup] Deleting support tickets...');
      for (const id of allTicketIds) {
        await tx.delete(supportTickets).where(eq(supportTickets.id, id));
      }

      // 3. Coupons (FK -> users via createdBy)
      console.log('[cleanup] Deleting coupons...');
      for (const id of allCouponIds) {
        await tx.delete(coupons).where(eq(coupons.id, id));
      }

      // 4. Audit logs (FK -> users, organizations)
      console.log('[cleanup] Deleting audit logs...');
      // Delete audit logs that reference our known users/orgs
      for (const userId of allUserIds) {
        await tx.delete(auditLogs).where(eq(auditLogs.userId, userId));
      }

      // 5. Projects (FK -> users, organizations)
      console.log('[cleanup] Deleting projects...');
      for (const id of allProjectIds) {
        await tx.delete(projects).where(eq(projects.id, id));
      }

      // 6. Users — clear invitedBy first to avoid self-referential FK issues
      console.log('[cleanup] Clearing user invitedBy references...');
      for (const id of allUserIds) {
        await tx.update(users).set({ invitedBy: null }).where(eq(users.id, id));
      }

      // 7. Users
      console.log('[cleanup] Deleting users...');
      for (const id of allUserIds) {
        await tx.delete(users).where(eq(users.id, id));
      }

      // 8. Organizations (FK -> plans)
      console.log('[cleanup] Deleting organizations...');
      for (const id of allOrgIds) {
        await tx.delete(organizations).where(eq(organizations.id, id));
      }

      // 9. Plans
      console.log('[cleanup] Deleting plans...');
      for (const id of allPlanIds) {
        await tx.delete(plans).where(eq(plans.id, id));
      }
    });

    console.log('[cleanup] Done.');
    return { success: true, errors };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    errors.push(message);
    console.error('[cleanup] Error:', message);
    return { success: false, errors };
  } finally {
    if (!options.skipLock) {
      console.log('[cleanup] Releasing advisory lock...');
      await releaseLock(db).catch(() => {
        /* best effort */
      });
    }
  }
}
