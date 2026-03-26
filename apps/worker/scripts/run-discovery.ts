#!/usr/bin/env npx tsx
/**
 * Run the real Discovery collector against a live Salesforce org.
 *
 * Requires pnpm local:real to be running (for token access via dev endpoint).
 *
 * Usage:
 *   npx tsx apps/worker/scripts/run-discovery.ts
 */

import { DiscoveryCollector } from '../src/collectors/discovery.ts';
import { SalesforceRestApi } from '../src/salesforce/rest.ts';
import { SalesforceBulkApi } from '../src/salesforce/bulk.ts';
import { SalesforceMetadataApi } from '../src/salesforce/soap.ts';
import { SalesforceClient } from '../src/salesforce/client.ts';
import { type SalesforceAuth } from '../src/salesforce/auth.ts';
import { ProgressReporter } from '../src/progress.ts';
import { CheckpointManager } from '../src/checkpoint.ts';
import { SnapshotUploader } from '../src/storage/snapshots.ts';
import { type CollectorContext } from '../src/collectors/base.ts';

const SERVER_URL = 'http://localhost:3000/api/v1';
const PROJECT_ID = '00000000-0000-4000-a000-000000000404';
const MOCK_TOKEN = 'mock_token_00000000-0000-4000-a000-000000000302';

/**
 * Creates a lightweight SalesforceClient that uses a pre-fetched token.
 * Bypasses the full auth flow for testing.
 */
function createDirectAuth(accessToken: string, instanceUrl: string) {
  return {
    getAccessToken: async () => ({ accessToken, instanceUrl }),
    forceRefresh: async () => ({ accessToken, instanceUrl }),
  } as unknown as SalesforceAuth;
}

/**
 * Mock SQL that just logs queries (no real DB for this test)
 */
function createMockSql() {
  return ((strings: TemplateStringsArray, ...values: unknown[]) => {
    // For the org_fingerprint UPDATE, just log it
    const query = strings.join('?');
    if (query.includes('UPDATE assessment_runs')) {
      console.log('  [DB] Would update assessment_runs.org_fingerprint');
    }
    if (query.includes('SELECT status FROM assessment_runs')) {
      return Promise.resolve([{ status: 'running' }]);
    }
    return Promise.resolve([]);
  }) as any;
}

async function main() {
  console.log('=== Running Discovery Collector Against Live Salesforce ===\n');

  // 1. Get connection info + token from dev server
  const connResp = await fetch(`${SERVER_URL}/projects/${PROJECT_ID}/salesforce/connections`, {
    headers: { Authorization: `Bearer ${MOCK_TOKEN}` },
  });
  const connData = (await connResp.json()) as any;
  const conn = connData.data?.source;
  if (!conn) {
    console.error('❌ No source connection. Run pnpm local:real and connect Salesforce first.');
    process.exit(1);
  }

  const tokenResp = await fetch(`${SERVER_URL}/dev/sf-token/${conn.id}`, {
    headers: { Authorization: `Bearer ${MOCK_TOKEN}` },
  });
  const tokenData = (await tokenResp.json()) as any;
  if (!tokenData.accessToken) {
    console.error('❌ Could not get access token from dev endpoint.');
    process.exit(1);
  }

  console.log(`Instance: ${conn.salesforceInstanceUrl}`);
  console.log(`Org: ${conn.salesforceOrgId}`);
  console.log(`API Version: ${conn.connectionMetadata?.apiVersion || 'v66.0'}\n`);

  // 2. Build the Salesforce client stack
  const auth = createDirectAuth(tokenData.accessToken, conn.salesforceInstanceUrl);
  const sfClient = new SalesforceClient(auth, 500); // Max 500 API calls for safety
  const apiVersion = conn.connectionMetadata?.apiVersion || 'v66.0';
  const restApi = new SalesforceRestApi(sfClient, apiVersion);
  const bulkApi = new SalesforceBulkApi(sfClient, apiVersion);
  const metadataApi = new SalesforceMetadataApi(auth, apiVersion.replace('v', ''));

  // 3. Build the collector context
  const progress = new ProgressReporter('discovery');
  const mockSql = createMockSql();

  const ctx: CollectorContext = {
    sql: mockSql,
    restApi,
    bulkApi,
    metadataApi,
    checkpoint: new CheckpointManager(mockSql, 'test-run'),
    progress,
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
    config: {
      codeExtractionEnabled: true,
      rawSnapshotMode: 'none',
    },
  };

  // 4. Run Discovery!
  console.log('Running Discovery collector...\n');
  const startTime = Date.now();

  const collector = new DiscoveryCollector(ctx);
  const result = await collector.run();

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  // 5. Print results
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Discovery completed in ${elapsed}s`);
  console.log(`Status: ${result.status}`);
  console.log(`Findings: ${result.findings.length}`);
  console.log(`Warnings: ${result.metrics.warnings?.length ?? 0}`);
  console.log(`Coverage: ${result.metrics.coverage}%`);
  console.log(`API calls used: ${sfClient.getApiCallCount()}`);

  console.log(`\n--- Metrics ---`);
  for (const [key, value] of Object.entries(result.metrics.metrics)) {
    console.log(`  ${key}: ${value}`);
  }

  if ((result.metrics.warnings?.length ?? 0) > 0) {
    console.log(`\n--- Warnings ---`);
    for (const w of result.metrics.warnings ?? []) {
      console.log(`  ⚠ ${w}`);
    }
  }

  console.log(`\n--- Describe Cache ---`);
  console.log(`  Objects cached: ${ctx.describeCache.size}`);
  for (const [name] of ctx.describeCache) {
    const desc = ctx.describeCache.get(name) as any;
    const fieldCount = desc?.fields?.length ?? 0;
    console.log(`    ${name}: ${fieldCount} fields`);
  }

  if (result.error) {
    console.log(`\n❌ Error: ${result.error}`);
  } else {
    console.log(`\n✅ Discovery complete. Describe cache has ${ctx.describeCache.size} objects.`);
    console.log('   Next: implement Catalog collector to use this cache.');
  }
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
