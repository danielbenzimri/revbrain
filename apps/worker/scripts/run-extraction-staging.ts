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
// EXT-1.7 + EXT-2.x — new collectors added by feat/extraction-coverage
import { ComponentsCollector } from '../src/collectors/components.ts';
import { Tier2InventoriesCollector } from '../src/collectors/tier2-inventories.ts';
import { TransactionalObjectsCollector } from '../src/collectors/transactional-objects.ts';
// EXT-1.2 + EXT-CC1 — post-processing helpers
import { joinPluginActivation } from '../src/normalize/plugin-activation.ts';
import { introspectFls, type FieldPermissionsRow } from '../src/salesforce/fls-introspect.ts';
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
const SERVICE_ROLE_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF1dHVpdmxlaGV5Ym5rYmhwZGJuIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDA5NDEzOCwiZXhwIjoyMDg5NjcwMTM4fQ.rkAxpHrCIY2112oHB26bEvGXjxsrmofa8lAQhnXkeNU';
const CONNECTION_ID = '1a2bab20-a442-4a68-973f-cf2b18b56b38';
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
    console.error(
      '\nCannot decrypt staging tokens. The staging encryption key differs from local.'
    );
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
    // Prefer env vars (SALESFORCE_CONSUMER_KEY/SECRET from
    // .env.stg) so local runs don't depend on secrets stored in
    // the staging DB being current.
    const clientId =
      process.env.SALESFORCE_CONSUMER_KEY ||
      conn?.connected_app_client_id ||
      '3MVG9QN_oTOaL3XR90KRg_g20VVVE_86ppgUDiUEhbSwnSt8LRAQJKa8jl89TfquVqGS0eurIxH4UnaGC_xIn';
    const clientSecret =
      process.env.SALESFORCE_CONSUMER_SECRET || conn?.connected_app_client_secret;

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

  // EXT-CC1 — FLS pre-flight. Runs BEFORE the collectors so a
  // gap is surfaced up-front. Failures log + continue (same
  // behavior as the real pipeline.ts in Phase 0).
  console.log('▶ FLS Pre-flight (EXT-CC1)...');
  try {
    const fls = await introspectFls(async (objects) => {
      const objectList = objects.map((o) => `'${o}'`).join(',');
      const soql = `SELECT Field, PermissionsRead FROM FieldPermissions WHERE SObjectType IN (${objectList})`;
      const res = await restApi.query<FieldPermissionsRow>(soql);
      return res.records;
    });
    console.log(
      `  → ${fls.requiredCount} fields required, ${fls.gaps.length} gaps${fls.hasHardFailures ? ' (HARD FAIL!)' : ''}`
    );
    if (fls.gaps.length > 0) {
      console.log(
        `  → sample gaps: ${fls.gaps
          .slice(0, 5)
          .map((g) => `${g.object}.${g.field}`)
          .join(', ')}`
      );
    }
  } catch (err) {
    console.log(`  ⚠️  FLS pre-flight failed (non-fatal): ${(err as Error).message}`);
  }
  console.log();

  // Run all collectors (now includes EXT-1.7 components +
  // EXT-2.x tier2-inventories)
  const collectors = [
    ['Discovery', new DiscoveryCollector(ctx)],
    ['Catalog', new CatalogCollector(ctx)],
    ['Pricing', new PricingCollector(ctx)],
    ['Usage', new UsageCollector(ctx)],
    ['Dependencies', new DependenciesCollector(ctx)],
    ['Customizations', new CustomizationsCollector(ctx)],
    ['Settings', new SettingsCollector(ctx)],
    ['Order Lifecycle', new OrderLifecycleCollector(ctx)],
    ['Transactional Objects (V11)', new TransactionalObjectsCollector(ctx)],
    ['Templates', new TemplatesCollector(ctx)],
    ['Approvals', new ApprovalsCollector(ctx)],
    ['Integrations', new IntegrationsCollector(ctx)],
    ['Localization', new LocalizationCollector(ctx)],
    ['Components (EXT-1.7)', new ComponentsCollector(ctx)],
    ['Tier2 Inventories (EXT-2.x)', new Tier2InventoriesCollector(ctx)],
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

  // EXT-1.2 — plugin activation join. Same post-processing pass
  // as pipeline.ts does in Phase 4: walk the plugin registration
  // settings and cross-link active Apex classes.
  console.log('\n▶ Plugin Activation Join (EXT-1.2)...');
  const allFindingsPreJoin = allResults.flatMap((r) => r.findings);
  const activation = joinPluginActivation(allFindingsPreJoin);
  console.log(
    `  → ${activation.stats.activePluginCount} active, ${activation.stats.unsetPluginCount} unset, ${activation.stats.orphanedRegistrationCount} orphaned`
  );
  if (activation.warnings.length > 0) {
    console.log(`  ⚠️  ${activation.warnings.length} warning(s):`);
    for (const w of activation.warnings.slice(0, 3)) console.log(`     - ${w}`);
  }

  // Merge activation output into findings: updatedFindings
  // replace the originals (by findingKey), newFindings appended.
  const updatedByKey = new Map(activation.updatedFindings.map((f) => [f.findingKey, f]));
  const mergedFindings = allFindingsPreJoin.map((f) => updatedByKey.get(f.findingKey) ?? f);
  mergedFindings.push(...activation.newFindings);

  // Save findings
  const outputPath = resolve(__dirname, '../output/assessment-results.json');
  writeFileSync(outputPath, JSON.stringify({ findings: mergedFindings }, null, 2));

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`Extraction complete in ${elapsed}s`);
  console.log(`Total findings: ${mergedFindings.length}`);
  console.log(`Saved to: ${outputPath}`);

  // Breakdown by artifactType so we can see the new EXT cards
  // are actually producing findings.
  const byType = new Map<string, number>();
  for (const f of mergedFindings) {
    byType.set(f.artifactType, (byType.get(f.artifactType) ?? 0) + 1);
  }
  console.log('\n── findings by artifactType ──');
  const sorted = [...byType.entries()].sort((a, b) => b[1] - a[1]);
  for (const [t, c] of sorted) console.log(`  ${t.padEnd(40)} ${c}`);

  // EXT-specific evidence presence checks
  console.log('\n── EXT card evidence checks ──');
  const pluginFindings = mergedFindings.filter(
    (f) =>
      f.artifactType === 'ApexClass' &&
      f.evidenceRefs.some((r) => r.label === 'interfaceName' && /^(SBQQ|sbaa)\./.test(r.value))
  );
  console.log(`  EXT-1.1 cpq_apex_plugin findings:       ${pluginFindings.length}`);
  const activePluginFindings = mergedFindings.filter((f) =>
    f.evidenceRefs.some((r) => r.label === 'isActivePlugin')
  );
  console.log(`  EXT-1.2 active plugin markers:          ${activePluginFindings.length}`);
  const testClassFindings = mergedFindings.filter(
    (f) => f.artifactType === 'ApexClass' && f.migrationRelevance === 'optional'
  );
  console.log(`  EXT-CC2 test class findings:            ${testClassFindings.length}`);
  const vrWithBody = mergedFindings.filter(
    (f) =>
      f.artifactType === 'ValidationRule' &&
      f.evidenceRefs.some((r) => r.value === 'bodyFetchStatus' && r.label === 'ok')
  );
  console.log(`  EXT-1.4 VRs with formula body:          ${vrWithBody.length}`);
  const cmtRecords = mergedFindings.filter((f) => f.artifactType === 'CustomMetadataRecord');
  console.log(`  EXT-1.3 CMT record findings:            ${cmtRecords.length}`);
  const flowsWithBody = mergedFindings.filter(
    (f) =>
      f.artifactType === 'Flow' &&
      f.evidenceRefs.some((r) => r.value === 'bodyFetchStatus' && r.label === 'ok')
  );
  console.log(`  EXT-1.6 flows with XML body:            ${flowsWithBody.length}`);
  const lwcBundles = mergedFindings.filter((f) => f.artifactType === 'LightningComponentBundle');
  const auraBundles = mergedFindings.filter((f) => f.artifactType === 'AuraDefinitionBundle');
  const vfPages = mergedFindings.filter((f) => f.artifactType === 'ApexPage');
  const staticResources = mergedFindings.filter((f) => f.artifactType === 'StaticResource');
  console.log(`  EXT-1.7 LWC bundles:                    ${lwcBundles.length}`);
  console.log(`  EXT-1.7 Aura bundles:                   ${auraBundles.length}`);
  console.log(`  EXT-1.7 VF pages:                       ${vfPages.length}`);
  console.log(`  EXT-1.7 Static resources:               ${staticResources.length}`);
  const dynamicDispatch = mergedFindings.filter((f) =>
    f.evidenceRefs.some((r) => r.value === 'dynamicDispatchPattern')
  );
  console.log(`  EXT-CC3 dynamic dispatch findings:      ${dynamicDispatch.length}`);
  const thirdParty = mergedFindings.filter(
    (f) =>
      f.artifactType === 'ApexClass' &&
      f.evidenceRefs.some((r) => r.label === 'managedPackageNamespace')
  );
  console.log(`  EXT-CC4 third-party Apex findings:      ${thirdParty.length}`);
  const runtimeStability = mergedFindings.filter((f) => f.stability === 'runtime');
  console.log(`  EXT-CC5 stability='runtime' findings:   ${runtimeStability.length}`);
  const emailTemplates = mergedFindings.filter((f) => f.artifactType === 'EmailTemplate');
  const customPerms = mergedFindings.filter((f) => f.artifactType === 'CustomPermission');
  const scheduledApex = mergedFindings.filter((f) => f.artifactType === 'ScheduledApex');
  const remoteSites = mergedFindings.filter((f) => f.artifactType === 'RemoteSiteSetting');
  const customLabels = mergedFindings.filter((f) => f.artifactType === 'CustomLabel');
  console.log(`  EXT-2.1 Email templates:                ${emailTemplates.length}`);
  console.log(`  EXT-2.2 Custom permissions:             ${customPerms.length}`);
  console.log(`  EXT-2.3 Scheduled Apex:                 ${scheduledApex.length}`);
  console.log(`  EXT-2.5 Remote site settings:           ${remoteSites.length}`);
  console.log(`  EXT-2.7 Custom labels:                  ${customLabels.length}`);

  console.log('\nNext: npx tsx apps/worker/scripts/generate-report.ts');
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
