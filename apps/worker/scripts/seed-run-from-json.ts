#!/usr/bin/env npx tsx
/**
 * Insert a completed assessment_runs row + all findings from the
 * apps/worker/output/assessment-results.json dump into the staging DB,
 * so the UI's /assessment/status + /assessment/findings endpoints have
 * data to serve. This sidesteps the need for the backend worker pipeline.
 *
 * Usage:
 *   npx tsx apps/worker/scripts/seed-run-from-json.ts
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

const SUPABASE_URL = 'https://qutuivleheybnkbhpdbn.supabase.co';
const SRK =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF1dHVpdmxlaGV5Ym5rYmhwZGJuIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDA5NDEzOCwiZXhwIjoyMDg5NjcwMTM4fQ.rkAxpHrCIY2112oHB26bEvGXjxsrmofa8lAQhnXkeNU';

const PROJECT_ID = '54787f11-1974-4bd4-8d3b-ba26ed5b3ceb'; // All Cloud Test 2
const CONNECTION_ID = '1a2bab20-a442-4a68-973f-cf2b18b56b38'; // fresh SF connection we just created

const __dirname = dirname(fileURLToPath(import.meta.url));

const headers = {
  apikey: SRK,
  Authorization: `Bearer ${SRK}`,
  'Content-Type': 'application/json',
  Prefer: 'return=representation',
};

async function main() {
  console.log('=== Seed Assessment Run From JSON ===\n');

  // 1. Look up project to get organization_id
  console.log('Fetching project details...');
  const projResp = await fetch(
    `${SUPABASE_URL}/rest/v1/projects?id=eq.${PROJECT_ID}&select=id,organization_id,name,created_by`,
    { headers }
  );
  const [project] = await projResp.json();
  if (!project) throw new Error(`Project ${PROJECT_ID} not found`);
  console.log(`  Project: ${project.name} (org: ${project.organization_id})`);

  // 2. Load findings JSON
  const inputPath = resolve(__dirname, '../output/assessment-results.json');
  console.log(`\nLoading findings from ${inputPath}...`);
  const { findings } = JSON.parse(readFileSync(inputPath, 'utf-8'));
  console.log(`  Loaded ${findings.length} findings`);

  // 3. Create an assessment_runs row
  const runId = randomUUID();
  const now = new Date().toISOString();
  const startedAt = new Date(Date.now() - 60_000).toISOString();

  console.log(`\nCreating assessment_runs row (${runId})...`);
  const runBody = {
    id: runId,
    project_id: PROJECT_ID,
    organization_id: project.organization_id,
    connection_id: CONNECTION_ID,
    status: 'completed',
    mode: 'full',
    disabled_collectors: [],
    raw_snapshot_mode: 'errors_only',
    progress: JSON.stringify({
      phase: 'completed',
      collectors: {
        discovery: { status: 'success', records: 19, duration_ms: 15900 },
        catalog: { status: 'success', records: 254, duration_ms: 12000 },
        pricing: { status: 'success', records: 55, duration_ms: 4000 },
        usage: { status: 'success', records: 22, duration_ms: 2500 },
        dependencies: { status: 'success', records: 186, duration_ms: 7500 },
        customizations: { status: 'success', records: 74, duration_ms: 2000 },
        settings: { status: 'success', records: 81, duration_ms: 3000 },
        'order-lifecycle': { status: 'success', records: 1, duration_ms: 500 },
        templates: { status: 'success', records: 24, duration_ms: 1500 },
        approvals: { status: 'success', records: 80, duration_ms: 3500 },
        integrations: { status: 'success', records: 101, duration_ms: 2500 },
        localization: { status: 'success', records: 2, duration_ms: 800 },
      },
      api_calls_used: 150,
      started_at: startedAt,
    }),
    org_fingerprint: JSON.stringify({
      orgId: '00D3x000001AjYCEA0',
      name: 'Salesforce Demo',
      edition: 'Enterprise Edition',
      instance: 'NA248',
      isSandbox: false,
      language: 'en_US',
      locale: 'en_US',
      timezone: 'America/Los_Angeles',
      country: 'US',
    }),
    normalization_status: 'completed',
    retry_count: 0,
    max_retries: 2,
    started_at: startedAt,
    completed_at: now,
    duration_ms: 55_900,
    api_calls_used: 150,
    records_extracted: findings.length,
    completeness_pct: 100,
    created_by: project.created_by,
    created_at: startedAt,
  };

  const runResp = await fetch(`${SUPABASE_URL}/rest/v1/assessment_runs`, {
    method: 'POST',
    headers,
    body: JSON.stringify(runBody),
  });
  if (!runResp.ok) {
    console.error(`  ERROR: ${runResp.status}`);
    console.error(await runResp.text());
    process.exit(1);
  }
  console.log(`  ✓ Run created: ${runId}`);

  // 4. Insert all findings in batches
  console.log(`\nInserting ${findings.length} findings...`);
  const BATCH_SIZE = 200;
  let inserted = 0;

  for (let i = 0; i < findings.length; i += BATCH_SIZE) {
    const batch = findings.slice(i, i + BATCH_SIZE).map((f: Record<string, unknown>) => ({
      id: randomUUID(),
      run_id: runId,
      domain: f.domain,
      collector_name: f.collectorName,
      artifact_type: f.artifactType,
      artifact_name: f.artifactName,
      artifact_id: f.artifactId ?? null,
      finding_key: f.findingKey ?? `${f.domain}:${f.artifactType}:${f.artifactName}`,
      source_type: f.sourceType ?? 'object',
      source_ref: f.sourceRef ?? null,
      detected: f.detected !== false,
      count_value: f.countValue ?? null,
      text_value: f.textValue ?? null,
      usage_level: f.usageLevel ?? null,
      risk_level: f.riskLevel ?? 'info',
      complexity_level: f.complexityLevel ?? null,
      migration_relevance: f.migrationRelevance ?? null,
      rca_target_concept: f.rcaTargetConcept ?? null,
      rca_mapping_complexity: f.rcaMappingComplexity ?? null,
      evidence_refs: JSON.stringify(f.evidenceRefs ?? []),
      notes: f.notes ?? null,
      organization_id: project.organization_id,
      schema_version: f.schemaVersion ?? '1.0',
    }));

    const batchResp = await fetch(`${SUPABASE_URL}/rest/v1/assessment_findings`, {
      method: 'POST',
      headers: { ...headers, Prefer: 'return=minimal' },
      body: JSON.stringify(batch),
    });
    if (!batchResp.ok) {
      console.error(`  Batch ${i}-${i + BATCH_SIZE} FAILED: ${batchResp.status}`);
      console.error((await batchResp.text()).slice(0, 500));
      process.exit(1);
    }
    inserted += batch.length;
    process.stdout.write(`\r  Inserted ${inserted} / ${findings.length}`);
  }
  console.log(`\n  ✓ All ${inserted} findings inserted`);

  console.log('\n=== Done ===');
  console.log(`Run ID: ${runId}`);
  console.log(`Project: ${PROJECT_ID}`);
  console.log(`\nReload the Assessment page in the UI — it should now show the data.`);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
