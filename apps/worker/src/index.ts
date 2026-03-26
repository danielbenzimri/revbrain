/**
 * CPQ Extraction Worker — Entry Point
 *
 * Runs as a Cloud Run Job container. Extracts CPQ configuration + usage data
 * from a customer's Salesforce org and produces structured assessment findings.
 *
 * Lifecycle: config → DB → health check → lease → SIGTERM → heartbeat → pipeline → status → exit
 *
 * See: docs/CPQ-EXTRACTION-IMPLEMENTATION-PLAN.md
 */

import { loadConfig } from './config.ts';
import { logger, runWithContext, type WorkerContext } from './lib/logger.ts';
import { createPools, closePools } from './db/pool.ts';
import { LeaseManager } from './lease.ts';
import { ProgressReporter } from './progress.ts';
import { CheckpointManager } from './checkpoint.ts';
import { SnapshotUploader, type RawSnapshotMode } from './storage/snapshots.ts';
import { SalesforceAuth } from './salesforce/auth.ts';
import { SalesforceClient } from './salesforce/client.ts';
import { SalesforceRestApi } from './salesforce/rest.ts';
import { SalesforceBulkApi } from './salesforce/bulk.ts';
import { SalesforceMetadataApi } from './salesforce/soap.ts';
import {
  registerSigtermHandler,
  createRunAttempt,
  updateRunAttempt,
  runHealthCheck,
} from './lifecycle.ts';
import { runPipeline } from './pipeline.ts';
import type { CollectorContext } from './collectors/base.ts';

async function main(): Promise<void> {
  // 1. Load config
  const config = loadConfig();

  // 2. Set up logging context
  const workerContext: WorkerContext = {
    traceId: config.traceId,
    runId: config.runId,
    jobId: config.jobId,
    workerId: '', // Set after lease claim
  };

  await runWithContext(workerContext, async () => {
    logger.info({ workerVersion: config.workerVersion }, 'worker_starting');

    // 3. Create DB pools
    const pools = createPools(config.databaseUrl);
    const startTime = Date.now();

    try {
      // 4. Health check (before claiming lease)
      await runHealthCheck(pools.main, config.runId);

      // 5. Read run config from DB
      const runRows = await pools.main`
        SELECT project_id, organization_id, connection_id, raw_snapshot_mode
        FROM assessment_runs WHERE id = ${config.runId}
      `;
      if (runRows.length === 0) {
        throw new Error(`Run ${config.runId} not found in database`);
      }
      const run = runRows[0];

      // 6. Claim lease
      const lease = new LeaseManager(pools.heartbeat, config.runId);
      workerContext.workerId = lease.getWorkerId();

      const claimed = await lease.claim();
      if (!claimed) {
        logger.error('lease_claim_failed — another worker holds the lease');
        process.exit(1);
      }

      // 7. Register SIGTERM handler
      registerSigtermHandler(async () => {
        logger.info('sigterm_shutdown_initiated');
        await lease.release('failed', {
          error: 'Container terminated by infrastructure (SIGTERM)',
          durationMs: Date.now() - startTime,
        });
        process.exit(1);
      });

      // 8. Create run attempt
      const attemptNo = await createRunAttempt(pools.main, config.runId, lease.getWorkerId());

      // 9. Start heartbeat
      const progress = new ProgressReporter('extraction');
      const stopHeartbeat = lease.startHeartbeat(async () => {
        return progress.toJSON();
      });

      // 10. Build Salesforce client stack
      const auth = new SalesforceAuth(
        pools.main,
        run.connection_id as string,
        config.runId,
        config.salesforceTokenEncryptionKey,
        config.internalApiUrl,
        config.internalApiSecret
      );

      const sfClient = new SalesforceClient(auth);
      const apiVersion = 'v66.0'; // Validated during Discovery

      const restApi = new SalesforceRestApi(sfClient, apiVersion);
      const bulkApi = new SalesforceBulkApi(sfClient, apiVersion);
      const metadataApi = new SalesforceMetadataApi(auth, apiVersion.replace('v', ''));

      // 11. Build collector context
      const ctx: CollectorContext = {
        sql: pools.main,
        restApi,
        bulkApi,
        metadataApi,
        checkpoint: new CheckpointManager(pools.main, config.runId),
        progress,
        snapshots: new SnapshotUploader({
          storageUrl: config.supabaseStorageUrl,
          serviceRoleKey: config.supabaseServiceRoleKey,
          runId: config.runId,
          mode: (run.raw_snapshot_mode as RawSnapshotMode) || 'errors_only',
          workerVersion: config.workerVersion,
        }),
        runId: config.runId,
        organizationId: run.organization_id as string,
        connectionId: run.connection_id as string,
        describeCache: new Map(),
        config: {
          codeExtractionEnabled: true,
          rawSnapshotMode: (run.raw_snapshot_mode as string) || 'errors_only',
        },
      };

      // 12. Run the pipeline!
      logger.info('pipeline_starting');
      const pipelineResult = await runPipeline(ctx);

      // 13. Determine final status
      const durationMs = Date.now() - startTime;
      const finalStatus = pipelineResult.status;

      logger.info(
        {
          finalStatus,
          durationMs,
          apiCalls: sfClient.getApiCallCount(),
          errors: pipelineResult.errors,
        },
        'pipeline_complete'
      );

      // 14. Release lease + set terminal status
      stopHeartbeat();
      await lease.release(finalStatus, {
        durationMs,
        apiCallsUsed: sfClient.getApiCallCount(),
        error: pipelineResult.errors.length > 0 ? pipelineResult.errors.join('; ') : undefined,
      });

      // 15. Update run attempt
      await updateRunAttempt(pools.main, config.runId, attemptNo, 0, 'success');

      logger.info({ durationMs, exitCode: 0 }, 'worker_exiting');
      await closePools(pools);
      process.exit(0);
    } catch (err) {
      const durationMs = Date.now() - startTime;
      const errorMsg = err instanceof Error ? err.message : String(err);
      logger.error({ error: errorMsg, durationMs }, 'worker_fatal');
      await closePools(pools);
      process.exit(1);
    }
  });
}

main().catch((err) => {
  console.error(
    JSON.stringify({
      level: 'error',
      msg: 'worker_fatal_unhandled',
      error: err instanceof Error ? err.message : String(err),
    })
  );
  process.exit(1);
});
