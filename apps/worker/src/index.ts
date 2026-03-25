/**
 * CPQ Extraction Worker — Entry Point
 *
 * Runs as a Cloud Run Job container. Extracts CPQ configuration + usage data
 * from a customer's Salesforce org and produces structured assessment findings.
 *
 * Lifecycle: config → DB → lease → SIGTERM → heartbeat → pipeline → status → exit
 *
 * See: docs/CPQ-EXTRACTION-IMPLEMENTATION-PLAN.md
 */

const WORKER_VERSION = process.env.WORKER_VERSION ?? 'dev';

async function main(): Promise<void> {
  const jobId = process.env.JOB_ID;
  const runId = process.env.RUN_ID;

  if (!jobId || !runId) {
    console.error(
      JSON.stringify({
        level: 'error',
        msg: 'JOB_ID and RUN_ID environment variables required',
        workerVersion: WORKER_VERSION,
      })
    );
    process.exit(1);
  }

  // TODO: Phase 1+ will wire config → DB → lease → pipeline → exit
  console.log(
    JSON.stringify({
      level: 'info',
      msg: 'worker_starting',
      jobId,
      runId,
      workerVersion: WORKER_VERSION,
    })
  );

  console.log(
    JSON.stringify({
      level: 'info',
      msg: 'worker_exiting',
      jobId,
      runId,
      exitCode: 0,
    })
  );
}

main().catch((err) => {
  console.error(
    JSON.stringify({
      level: 'error',
      msg: 'worker_fatal',
      error: err instanceof Error ? err.message : String(err),
    })
  );
  process.exit(1);
});
