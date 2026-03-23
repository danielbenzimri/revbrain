/**
 * OAuth Pending Flow Cleanup Job
 *
 * Runs hourly to delete expired oauth_pending_flows rows.
 * Catches abandoned OAuth flows where the user never completed
 * the Salesforce authorization (closed the popup, navigated away, etc.).
 *
 * The 10-minute TTL is set during flow creation. This job is the
 * safety net that prevents expired rows from accumulating.
 */

import { logger } from '../lib/logger.ts';
import type { Repositories } from '@revbrain/contract';

const CLEANUP_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

let cleanupTimer: ReturnType<typeof setInterval> | null = null;

/**
 * Run a single cleanup pass.
 * Deletes all pending flows where expiresAt < now().
 * Returns the number of deleted rows.
 */
export async function cleanupExpiredFlows(repos: Repositories): Promise<number> {
  try {
    const deleted = await repos.oauthPendingFlows.cleanupExpired();

    if (deleted > 0) {
      logger.info(`OAuth flow cleanup: deleted ${deleted} expired pending flow(s)`);
    }

    return deleted;
  } catch (error) {
    logger.error('OAuth flow cleanup failed', { error });
    return 0;
  }
}

/**
 * Start the periodic cleanup job.
 * Call once during server startup.
 */
export function startOauthFlowCleanupJob(repos: Repositories): void {
  if (cleanupTimer) {
    return; // Already running
  }

  // Run immediately on startup (catch any from previous crash)
  cleanupExpiredFlows(repos).catch(() => {});

  cleanupTimer = setInterval(() => {
    cleanupExpiredFlows(repos).catch(() => {});
  }, CLEANUP_INTERVAL_MS);

  logger.info('OAuth flow cleanup job started (runs every hour)');
}

/**
 * Stop the periodic cleanup job.
 * Call during graceful shutdown.
 */
export function stopOauthFlowCleanupJob(): void {
  if (cleanupTimer) {
    clearInterval(cleanupTimer);
    cleanupTimer = null;
    logger.info('OAuth flow cleanup job stopped');
  }
}
