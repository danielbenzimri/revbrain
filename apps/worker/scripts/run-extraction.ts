#!/usr/bin/env npx tsx
/**
 * Run Discovery + Catalog collectors against live Salesforce.
 *
 * Requires pnpm local:real running (for token access via dev endpoint).
 *
 * Usage:
 *   npx tsx apps/worker/scripts/run-extraction.ts
 */

import { DiscoveryCollector } from '../src/collectors/discovery.ts';
import { CatalogCollector } from '../src/collectors/catalog.ts';
import { SalesforceRestApi } from '../src/salesforce/rest.ts';
import { SalesforceBulkApi } from '../src/salesforce/bulk.ts';
import { SalesforceMetadataApi } from '../src/salesforce/soap.ts';
import { SalesforceClient } from '../src/salesforce/client.ts';
import { type SalesforceAuth } from '../src/salesforce/auth.ts';
import { ProgressReporter } from '../src/progress.ts';
import { CheckpointManager } from '../src/checkpoint.ts';
import { SnapshotUploader } from '../src/storage/snapshots.ts';
import { type CollectorContext } from '../src/collectors/base.ts';
import { type CollectorResult } from '../src/collectors/base.ts';

const SERVER_URL = 'http://localhost:3000/api/v1';
const PROJECT_ID = '00000000-0000-4000-a000-000000000404';
const MOCK_TOKEN = 'mock_token_00000000-0000-4000-a000-000000000302';

async function getConnection() {
  const resp = await fetch(`${SERVER_URL}/projects/${PROJECT_ID}/salesforce/connections`, {
    headers: { Authorization: `Bearer ${MOCK_TOKEN}` },
  });
  const data = (await resp.json()) as any;
  const conn = data.data?.source;
  if (!conn) throw new Error('No source connection. Run pnpm local:real and connect SF first.');

  const tokenResp = await fetch(`${SERVER_URL}/dev/sf-token/${conn.id}`, {
    headers: { Authorization: `Bearer ${MOCK_TOKEN}` },
  });
  const tokenData = (await tokenResp.json()) as any;
  if (!tokenData.accessToken) throw new Error('Could not get token from dev endpoint.');

  return { conn, accessToken: tokenData.accessToken };
}

function printResult(name: string, result: CollectorResult) {
  console.log(`\n${'─'.repeat(60)}`);
  console.log(
    `${name}: ${result.status} | ${result.findings.length} findings | ${result.metrics.coverage}% coverage`
  );
  if (result.error) console.log(`  Error: ${result.error}`);

  console.log('  Metrics:');
  for (const [k, v] of Object.entries(result.metrics.metrics)) {
    console.log(`    ${k}: ${v}`);
  }
  if ((result.metrics.warnings?.length ?? 0) > 0) {
    console.log('  Warnings:');
    for (const w of result.metrics.warnings ?? []) {
      console.log(`    ⚠ ${w}`);
    }
  }
}

async function main() {
  console.log('=== CPQ Extraction — Discovery + Catalog ===\n');
  const startTime = Date.now();

  const { conn, accessToken } = await getConnection();
  console.log(`Instance: ${conn.salesforceInstanceUrl}`);
  console.log(`Org: ${conn.salesforceOrgId}\n`);

  // Build SF client stack
  const auth = {
    getAccessToken: async () => ({ accessToken, instanceUrl: conn.salesforceInstanceUrl }),
    forceRefresh: async () => ({ accessToken, instanceUrl: conn.salesforceInstanceUrl }),
  } as unknown as SalesforceAuth;

  const sfClient = new SalesforceClient(auth, 1000);
  const apiVersion = conn.connectionMetadata?.apiVersion || 'v66.0';
  const restApi = new SalesforceRestApi(sfClient, apiVersion);
  const bulkApi = new SalesforceBulkApi(sfClient, apiVersion);
  const metadataApi = new SalesforceMetadataApi(auth, apiVersion.replace('v', ''));

  const mockSql = ((strings: TemplateStringsArray) => {
    const q = strings.join('');
    if (q.includes('SELECT status')) return Promise.resolve([{ status: 'running' }]);
    return Promise.resolve([]);
  }) as any;

  const ctx: CollectorContext = {
    sql: mockSql,
    restApi,
    bulkApi,
    metadataApi,
    checkpoint: new CheckpointManager(mockSql, 'test-run'),
    progress: new ProgressReporter('extraction'),
    snapshots: new SnapshotUploader({
      storageUrl: 'http://localhost:54321/storage/v1',
      serviceRoleKey: 'test',
      runId: 'test-run',
      mode: 'none',
      workerVersion: 'test',
    }),
    runId: 'test-run',
    organizationId: 'test-org',
    connectionId: conn.id,
    describeCache: new Map(),
    config: { codeExtractionEnabled: true, rawSnapshotMode: 'none' },
  };

  // Run Discovery
  console.log('▶ Running Discovery...');
  const discovery = new DiscoveryCollector(ctx);
  const discResult = await discovery.run();
  printResult('Discovery', discResult);

  if (discResult.status === 'failed') {
    console.error('\n❌ Discovery failed — cannot proceed.');
    process.exit(1);
  }

  console.log(`\n  Describe cache: ${ctx.describeCache.size} objects`);

  // Run Catalog
  console.log('\n▶ Running Catalog...');
  const catalog = new CatalogCollector(ctx);
  const catResult = await catalog.run();
  printResult('Catalog', catResult);

  // Summary
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  const totalFindings = discResult.findings.length + catResult.findings.length;
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`Extraction complete in ${elapsed}s`);
  console.log(`Total findings: ${totalFindings}`);
  console.log(`API calls: ${sfClient.getApiCallCount()}`);
  console.log(`Describe cache: ${ctx.describeCache.size} objects`);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
