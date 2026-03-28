#!/usr/bin/env npx tsx
/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Discovery dry-run: calls the actual Salesforce APIs that the Discovery
 * collector will use, printing everything it finds.
 *
 * This script acts as a proxy through the RevBrain server's dev endpoint
 * to get the decrypted access token, then makes direct Salesforce API calls.
 *
 * Usage (while pnpm local:real is running):
 *   npx tsx apps/worker/scripts/test-sf-discovery.ts
 */

const SERVER_URL = 'http://localhost:3000/api/v1';
const PROJECT_ID = '00000000-0000-4000-a000-000000000404';
const MOCK_TOKEN = 'mock_token_00000000-0000-4000-a000-000000000302';

interface SfConnection {
  instanceUrl: string;
  accessToken: string;
  apiVersion: string;
}

async function getConnectionAndToken(): Promise<SfConnection> {
  // Get the connection info
  const connResp = await fetch(`${SERVER_URL}/projects/${PROJECT_ID}/salesforce/connections`, {
    headers: { Authorization: `Bearer ${MOCK_TOKEN}` },
  });
  const connData = (await connResp.json()) as any;
  const conn = connData.data?.source;
  if (!conn) throw new Error('No source connection found');

  // In mock mode, we can get the token via the dev/debug endpoint
  // For now, we'll use the internal endpoint approach
  // Let's add a quick proxy: call the test endpoint but intercept the token
  // Actually, the simplest: read from the mock store via a new dev endpoint

  // ALTERNATIVE: call Salesforce versions endpoint through our server
  // and extract the instance URL + use the token from the mock store
  const instanceUrl = conn.salesforceInstanceUrl;
  const apiVersion = conn.connectionMetadata?.apiVersion || 'v66.0';

  // Get the raw access token from mock storage
  // We'll call a temporary debug endpoint
  const debugResp = await fetch(`${SERVER_URL}/dev/sf-token/${conn.id}`, {
    headers: { Authorization: `Bearer ${MOCK_TOKEN}` },
  });

  if (!debugResp.ok) {
    // Fallback: the dev endpoint doesn't exist yet, let's create it
    throw new Error(
      'Need dev endpoint for token access. Add GET /dev/sf-token/:connectionId to dev routes.'
    );
  }

  const debugData = (await debugResp.json()) as any;
  return {
    instanceUrl,
    accessToken: debugData.accessToken,
    apiVersion,
  };
}

async function sfQuery(conn: SfConnection, path: string): Promise<any> {
  const url = `${conn.instanceUrl}${path}`;
  const resp = await fetch(url, {
    headers: {
      Authorization: `Bearer ${conn.accessToken}`,
      Accept: 'application/json',
    },
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`SF API ${resp.status}: ${text.slice(0, 300)}`);
  }
  return resp.json();
}

async function main() {
  console.log('=== Salesforce Discovery Dry Run ===\n');

  let conn: SfConnection;
  try {
    conn = await getConnectionAndToken();
  } catch (err: any) {
    console.error(`❌ ${err.message}`);
    console.log('\nCreating dev endpoint for token access...');
    console.log('Please add this endpoint to apps/server/src/v1/routes/dev.ts');
    process.exit(1);
  }

  console.log(`Instance: ${conn.instanceUrl}`);
  console.log(`API Version: ${conn.apiVersion}\n`);

  // Step 1: Organization query (Spec §4.0)
  console.log('--- Step 1: Org Fingerprint ---');
  try {
    const orgResult = await sfQuery(
      conn,
      `/services/data/${conn.apiVersion}/query?q=${encodeURIComponent(
        'SELECT Id, Name, OrganizationType, InstanceName, IsSandbox, LanguageLocaleKey, DefaultLocaleSidKey, TimeZoneSidKey, TrialExpirationDate, Country FROM Organization'
      )}`
    );
    const org = orgResult.records?.[0];
    if (org) {
      console.log(`  Name: ${org.Name}`);
      console.log(`  Type: ${org.OrganizationType}`);
      console.log(`  Instance: ${org.InstanceName}`);
      console.log(`  Sandbox: ${org.IsSandbox}`);
      console.log(`  Locale: ${org.DefaultLocaleSidKey}`);
      console.log(`  Timezone: ${org.TimeZoneSidKey}`);
      console.log(`  Country: ${org.Country}`);
    }
  } catch (err: any) {
    console.error(`  ❌ ${err.message}`);
  }

  // Step 2: Describe Global (Spec §4.1)
  console.log('\n--- Step 2: Describe Global ---');
  try {
    const descGlobal = await sfQuery(conn, `/services/data/${conn.apiVersion}/sobjects/`);
    const allObjects = descGlobal.sobjects as any[];
    const sbqqObjects = allObjects.filter((o: any) => o.name.startsWith('SBQQ__'));
    const sbaaObjects = allObjects.filter((o: any) => o.name.startsWith('sbaa__'));
    const customObjects = allObjects.filter(
      (o: any) => o.custom && !o.name.startsWith('SBQQ__') && !o.name.startsWith('sbaa__')
    );

    console.log(`  Total objects: ${allObjects.length}`);
    console.log(`  SBQQ__ (CPQ) objects: ${sbqqObjects.length}`);
    console.log(`  sbaa__ (Advanced Approvals) objects: ${sbaaObjects.length}`);
    console.log(`  Custom objects: ${customObjects.length}`);
    console.log(`\n  CPQ Objects found:`);
    for (const obj of sbqqObjects.slice(0, 20)) {
      console.log(`    ${obj.queryable ? '✅' : '❌'} ${obj.name} (${obj.label})`);
    }
    if (sbqqObjects.length > 20) {
      console.log(`    ... and ${sbqqObjects.length - 20} more`);
    }
  } catch (err: any) {
    console.error(`  ❌ ${err.message}`);
  }

  // Step 3: Limits (Spec §4.4)
  console.log('\n--- Step 3: API Limits ---');
  try {
    const limits = await sfQuery(conn, `/services/data/${conn.apiVersion}/limits/`);
    console.log(
      `  Daily API Requests: ${limits.DailyApiRequests?.Remaining?.toLocaleString()} / ${limits.DailyApiRequests?.Max?.toLocaleString()}`
    );
    console.log(
      `  Bulk API 2.0 Jobs: ${limits.DailyBulkV2QueryJobs?.Remaining} / ${limits.DailyBulkV2QueryJobs?.Max}`
    );
  } catch (err: any) {
    console.error(`  ❌ ${err.message}`);
  }

  // Step 4: Quick data counts (Spec §4.6)
  console.log('\n--- Step 4: Data Size Estimation ---');
  const countQueries = [
    { name: 'Products', soql: 'SELECT COUNT() FROM Product2' },
    {
      name: 'Quotes (90d)',
      soql: 'SELECT COUNT() FROM SBQQ__Quote__c WHERE CreatedDate >= LAST_N_DAYS:90',
    },
    {
      name: 'Quote Lines (90d)',
      soql: 'SELECT COUNT() FROM SBQQ__QuoteLine__c WHERE CreatedDate >= LAST_N_DAYS:90',
    },
    { name: 'Price Rules', soql: 'SELECT COUNT() FROM SBQQ__PriceRule__c' },
    { name: 'Product Rules', soql: 'SELECT COUNT() FROM SBQQ__ProductRule__c' },
    { name: 'Custom Scripts (QCP)', soql: 'SELECT COUNT() FROM SBQQ__CustomScript__c' },
    { name: 'Discount Schedules', soql: 'SELECT COUNT() FROM SBQQ__DiscountSchedule__c' },
    { name: 'Product Options', soql: 'SELECT COUNT() FROM SBQQ__ProductOption__c' },
  ];

  for (const { name, soql } of countQueries) {
    try {
      const result = await sfQuery(
        conn,
        `/services/data/${conn.apiVersion}/query?q=${encodeURIComponent(soql)}`
      );
      console.log(`  ${name}: ${result.totalSize?.toLocaleString()}`);
    } catch (err: any) {
      console.log(`  ${name}: ❌ ${err.message.slice(0, 80)}`);
    }
  }

  console.log('\n=== Discovery Dry Run Complete ===');
}

main().catch((err) => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
