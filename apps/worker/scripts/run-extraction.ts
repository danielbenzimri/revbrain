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
import { PricingCollector } from '../src/collectors/pricing.ts';
import { UsageCollector } from '../src/collectors/usage.ts';
import { DependenciesCollector } from '../src/collectors/dependencies.ts';
import { CustomizationsCollector } from '../src/collectors/customizations.ts';
import { SettingsCollector } from '../src/collectors/settings.ts';
import { OrderLifecycleCollector } from '../src/collectors/order-lifecycle.ts';
import { TemplatesCollector } from '../src/collectors/templates.ts';
import { ApprovalsCollector } from '../src/collectors/approvals.ts';
import { IntegrationsCollector } from '../src/collectors/integrations.ts';
import { LocalizationCollector } from '../src/collectors/localization.ts';
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

  // Run Pricing
  console.log('\n▶ Running Pricing...');
  const pricing = new PricingCollector(ctx);
  const priResult = await pricing.run();
  printResult('Pricing', priResult);

  // Run Usage
  console.log('\n▶ Running Usage...');
  const usage = new UsageCollector(ctx);
  const usaResult = await usage.run();
  printResult('Usage', usaResult);

  // Tier 1 collectors
  console.log('\n▶ Running Dependencies...');
  const deps = new DependenciesCollector(ctx);
  const depsResult = await deps.run();
  printResult('Dependencies', depsResult);

  console.log('\n▶ Running Customizations...');
  const cust = new CustomizationsCollector(ctx);
  const custResult = await cust.run();
  printResult('Customizations', custResult);

  console.log('\n▶ Running Settings...');
  const settings = new SettingsCollector(ctx);
  const setResult = await settings.run();
  printResult('Settings', setResult);

  console.log('\n▶ Running Order Lifecycle...');
  const orders = new OrderLifecycleCollector(ctx);
  const ordResult = await orders.run();
  printResult('Order Lifecycle', ordResult);

  // Tier 2 collectors
  console.log('\n▶ Running Templates...');
  const templates = new TemplatesCollector(ctx);
  const tplResult = await templates.run();
  printResult('Templates', tplResult);

  console.log('\n▶ Running Approvals...');
  const approvals = new ApprovalsCollector(ctx);
  const appResult = await approvals.run();
  printResult('Approvals', appResult);

  console.log('\n▶ Running Integrations...');
  const integrations = new IntegrationsCollector(ctx);
  const intResult = await integrations.run();
  printResult('Integrations', intResult);

  console.log('\n▶ Running Localization...');
  const localization = new LocalizationCollector(ctx);
  const locResult = await localization.run();
  printResult('Localization', locResult);

  // Summary
  const allResults = [
    discResult,
    catResult,
    priResult,
    usaResult,
    depsResult,
    custResult,
    setResult,
    ordResult,
    tplResult,
    appResult,
    intResult,
    locResult,
  ];
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  const totalFindings = allResults.reduce((sum, r) => sum + r.findings.length, 0);
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
