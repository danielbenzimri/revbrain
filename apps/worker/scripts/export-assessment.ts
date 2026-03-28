#!/usr/bin/env npx tsx
/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Run full extraction against live Salesforce and export results as JSON.
 *
 * Produces a file that can be used to:
 * 1. Seed the assessment UI with real data
 * 2. Test the data transformation layer
 * 3. Demo the assessment to stakeholders
 *
 * Usage (while pnpm local:real is running):
 *   npx tsx apps/worker/scripts/export-assessment.ts
 *
 * Output: apps/worker/output/assessment-results.json
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
import { type CollectorContext, type CollectorResult } from '../src/collectors/base.ts';
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const SERVER_URL = 'http://localhost:3000/api/v1';
const PROJECT_ID = '00000000-0000-4000-a000-000000000404';
const MOCK_TOKEN = 'mock_token_00000000-0000-4000-a000-000000000302';

async function getConnection() {
  const resp = await fetch(`${SERVER_URL}/projects/${PROJECT_ID}/salesforce/connections`, {
    headers: { Authorization: `Bearer ${MOCK_TOKEN}` },
  });
  const data = (await resp.json()) as any;
  const conn = data.data?.source;
  if (!conn) throw new Error('No source connection.');

  const tokenResp = await fetch(`${SERVER_URL}/dev/sf-token/${conn.id}`, {
    headers: { Authorization: `Bearer ${MOCK_TOKEN}` },
  });
  const tokenData = (await tokenResp.json()) as any;
  if (!tokenData.accessToken) throw new Error('Could not get token.');

  return { conn, accessToken: tokenData.accessToken };
}

async function main() {
  console.log('=== Full CPQ Extraction → JSON Export ===\n');
  const startTime = Date.now();

  const { conn, accessToken } = await getConnection();
  console.log(`Instance: ${conn.salesforceInstanceUrl}`);

  // Build SF client
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
    checkpoint: new CheckpointManager(mockSql, 'export-run'),
    progress: new ProgressReporter('extraction'),
    snapshots: new SnapshotUploader({
      storageUrl: 'http://localhost/storage',
      serviceRoleKey: 'test',
      runId: 'export-run',
      mode: 'none',
      workerVersion: 'export',
    }),
    runId: 'export-run',
    organizationId: 'export-org',
    connectionId: conn.id,
    describeCache: new Map(),
    config: { codeExtractionEnabled: true, rawSnapshotMode: 'none' },
  };

  // Run all collectors
  const collectors = [
    { name: 'discovery', Cls: DiscoveryCollector },
    { name: 'catalog', Cls: CatalogCollector },
    { name: 'pricing', Cls: PricingCollector },
    { name: 'usage', Cls: UsageCollector },
    { name: 'dependencies', Cls: DependenciesCollector },
    { name: 'customizations', Cls: CustomizationsCollector },
    { name: 'settings', Cls: SettingsCollector },
    { name: 'order-lifecycle', Cls: OrderLifecycleCollector },
    { name: 'templates', Cls: TemplatesCollector },
    { name: 'approvals', Cls: ApprovalsCollector },
    { name: 'integrations', Cls: IntegrationsCollector },
    { name: 'localization', Cls: LocalizationCollector },
  ];

  const results: Record<string, CollectorResult> = {};
  let totalFindings = 0;

  for (const { name, Cls } of collectors) {
    process.stdout.write(`  ${name}...`);
    const collector = new Cls(ctx);
    const result = await collector.run();
    results[name] = result;
    totalFindings += result.findings.length;
    console.log(` ${result.status} (${result.findings.length} findings)`);
  }

  // Build export
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  const exportData = {
    metadata: {
      exportedAt: new Date().toISOString(),
      instanceUrl: conn.salesforceInstanceUrl,
      orgId: conn.salesforceOrgId,
      cpqVersion: (results.discovery?.metrics?.metrics as any)?.cpqVersion,
      totalFindings,
      totalApiCalls: sfClient.getApiCallCount(),
      durationSeconds: parseFloat(elapsed),
    },
    collectors: Object.fromEntries(
      Object.entries(results).map(([name, result]) => [
        name,
        {
          status: result.status,
          findingsCount: result.findings.length,
          metrics: result.metrics.metrics,
          warnings: result.metrics.warnings,
          coverage: result.metrics.coverage,
        },
      ])
    ),
    findings: Object.entries(results).flatMap(([, result]) => result.findings),
  };

  // Write to file
  const outputDir = resolve(__dirname, '../output');
  mkdirSync(outputDir, { recursive: true });
  const outputPath = resolve(outputDir, 'assessment-results.json');
  writeFileSync(outputPath, JSON.stringify(exportData, null, 2));

  console.log(`\n${'═'.repeat(60)}`);
  console.log(`Extraction complete: ${totalFindings} findings in ${elapsed}s`);
  console.log(`API calls: ${sfClient.getApiCallCount()}`);
  console.log(`\nExported to: ${outputPath}`);
  console.log(`File size: ${(JSON.stringify(exportData).length / 1024).toFixed(0)} KB`);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
