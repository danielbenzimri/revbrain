#!/usr/bin/env npx tsx
/**
 * Run extraction directly against staging Salesforce connection.
 * Decrypts tokens from staging Supabase, refreshes if needed, runs all collectors.
 *
 * Usage: SALESFORCE_TOKEN_ENCRYPTION_KEY=... npx tsx apps/worker/scripts/run-extraction-staging.ts
 */

import { writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decrypt, ENCRYPTION_CONTEXTS } from '@revbrain/contract';
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

const __dirname = dirname(fileURLToPath(import.meta.url));

const SUPABASE_URL = 'https://qutuivleheybnkbhpdbn.supabase.co';
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF1dHVpdmxlaGV5Ym5rYmhwZGJuIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDA5NDEzOCwiZXhwIjoyMDg5NjcwMTM4fQ.rkAxpHrCIY2112oHB26bEvGXjxsrmofa8lAQhnXkeNU';
const CONNECTION_ID = '2de76415-e986-4dea-b330-fdff063f65f3';
const INSTANCE_URL = 'https://rdolce-23march23-385-demo.my.salesforce.com';

function printResult(name: string, result: CollectorResult) {
  const icon = result.status === 'success' ? '✅' : result.status === 'partial' ? '⚠️' : '❌';
  console.log(`${icon} ${name}: ${result.status} | ${result.findings.length} findings`);
  if (result.error) console.log(`  Error: ${result.error}`);
}

async function main() {
  console.log('=== Staging Extraction — All Collectors ===\n');
  const startTime = Date.now();

  // Get encryption key
  const encKeyBase64 = process.env.SALESFORCE_TOKEN_ENCRYPTION_KEY;
  if (!encKeyBase64) {
    console.error('Set SALESFORCE_TOKEN_ENCRYPTION_KEY env var');
    process.exit(1);
  }
  const masterKey = Buffer.from(encKeyBase64, 'base64');

  // Fetch encrypted secrets from staging DB
  console.log('Fetching connection secrets...');
  const resp = await fetch(
    `${SUPABASE_URL}/rest/v1/salesforce_connection_secrets?connection_id=eq.${CONNECTION_ID}`,
    {
      headers: {
        apikey: SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      },
    }
  );
  const secrets = await resp.json();
  if (!secrets || secrets.length === 0) {
    console.error('No secrets found for connection');
    process.exit(1);
  }

  const secret = secrets[0];

  // Decrypt tokens
  console.log('Decrypting tokens...');
  const encAccessToken = Buffer.from(secret.encrypted_access_token.replace('\\x', ''), 'hex');
  const encRefreshToken = Buffer.from(secret.encrypted_refresh_token.replace('\\x', ''), 'hex');

  let accessToken: string;
  let refreshToken: string;
  try {
    accessToken = decrypt(encAccessToken, masterKey, ENCRYPTION_CONTEXTS.OAUTH_TOKEN);
    refreshToken = decrypt(encRefreshToken, masterKey, ENCRYPTION_CONTEXTS.OAUTH_TOKEN);
    console.log(`Access token: ${accessToken.substring(0, 20)}...`);
    console.log(`Refresh token: ${refreshToken.substring(0, 20)}...`);
  } catch (err) {
    console.error('Decryption failed — wrong encryption key for staging?');
    console.error((err as Error).message);

    // Try refreshing via Salesforce directly using the connected app
    console.log('\nTrying to get token via Salesforce OAuth refresh...');
    // Fall back: use the existing April 1 data
    console.error('\nCannot decrypt staging tokens. The staging encryption key differs from local.');
    console.error('Falling back to existing extraction data from April 1.');
    process.exit(1);
  }

  // Test the access token
  console.log('\nTesting Salesforce connection...');
  const testResp = await fetch(`${INSTANCE_URL}/services/data/v62.0/limits`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!testResp.ok) {
    console.log(`Token expired (${testResp.status}). Refreshing via Salesforce OAuth...`);

    // Get connected app credentials
    const connResp = await fetch(
      `${SUPABASE_URL}/rest/v1/salesforce_connections?select=*&id=eq.${CONNECTION_ID}`,
      {
        headers: {
          apikey: SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
        },
      }
    );
    const [conn] = await connResp.json();
    const clientId = conn?.connected_app_client_id || '3MVG9QN_oTOaL3XR90KRg_g20VVVE_86ppgUDiUEhbSwnSt8LRAQJKa8jl89TfquVqGS0eurIxH4UnaGC_xIn';
    const clientSecret = conn?.connected_app_client_secret;

    if (!clientId) {
      console.error('No connected app credentials found. Cannot refresh token.');
      process.exit(1);
    }

    // Use login.salesforce.com (original OAuth endpoint, not instance URL)
    const refreshResp = await fetch('https://login.salesforce.com/services/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: clientId,
        ...(clientSecret ? { client_secret: clientSecret } : {}),
      }),
    });

    if (!refreshResp.ok) {
      const body = await refreshResp.text();
      console.error(`Refresh failed: ${refreshResp.status} ${body}`);
      process.exit(1);
    }

    const refreshData = await refreshResp.json();
    accessToken = refreshData.access_token;
    console.log(`New access token: ${accessToken.substring(0, 20)}...`);
  } else {
    console.log('Token is valid!');
  }

  console.log(`Instance: ${INSTANCE_URL}\n`);

  // Build SF client stack
  const auth = {
    getAccessToken: async () => ({ accessToken, instanceUrl: INSTANCE_URL }),
    forceRefresh: async () => ({ accessToken, instanceUrl: INSTANCE_URL }),
  } as unknown as SalesforceAuth;

  const sfClient = new SalesforceClient(auth, 1000);
  const restApi = new SalesforceRestApi(sfClient, 'v62.0');
  const bulkApi = new SalesforceBulkApi(sfClient, 'v62.0');
  const metadataApi = new SalesforceMetadataApi(auth, '62.0');

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
    checkpoint: new CheckpointManager(mockSql, 'stg-run'),
    progress: new ProgressReporter('extraction'),
    snapshots: new SnapshotUploader({
      storageUrl: `${SUPABASE_URL}/storage/v1`,
      serviceRoleKey: SERVICE_ROLE_KEY,
      runId: 'stg-run',
      mode: 'none',
      workerVersion: 'local',
    }),
    runId: 'stg-run',
    organizationId: 'stg-org',
    connectionId: CONNECTION_ID,
    describeCache: new Map(),
    config: { codeExtractionEnabled: true, rawSnapshotMode: 'none' },
  };

  // Run all collectors
  const collectors = [
    ['Discovery', new DiscoveryCollector(ctx)],
    ['Catalog', new CatalogCollector(ctx)],
    ['Pricing', new PricingCollector(ctx)],
    ['Usage', new UsageCollector(ctx)],
    ['Dependencies', new DependenciesCollector(ctx)],
    ['Customizations', new CustomizationsCollector(ctx)],
    ['Settings', new SettingsCollector(ctx)],
    ['Order Lifecycle', new OrderLifecycleCollector(ctx)],
    ['Templates', new TemplatesCollector(ctx)],
    ['Approvals', new ApprovalsCollector(ctx)],
    ['Integrations', new IntegrationsCollector(ctx)],
    ['Localization', new LocalizationCollector(ctx)],
  ] as const;

  const allResults: CollectorResult[] = [];

  for (const [name, collector] of collectors) {
    console.log(`▶ ${name}...`);
    const result = await (collector as any).run();
    printResult(name, result);
    allResults.push(result);

    if (name === 'Discovery' && result.status === 'failed') {
      console.error('\n❌ Discovery failed — cannot proceed.');
      process.exit(1);
    }
  }

  // Save findings
  const allFindings = allResults.flatMap((r) => r.findings);
  const outputPath = resolve(__dirname, '../output/assessment-results.json');
  writeFileSync(outputPath, JSON.stringify({ findings: allFindings }, null, 2));

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`Extraction complete in ${elapsed}s`);
  console.log(`Total findings: ${allFindings.length}`);
  console.log(`Saved to: ${outputPath}`);
  console.log('\nNext: npx tsx apps/worker/scripts/generate-report.ts');
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
