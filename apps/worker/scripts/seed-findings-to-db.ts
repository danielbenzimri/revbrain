#!/usr/bin/env tsx
/**
 * Seed Assessment Findings to Database
 *
 * Reads assessment-results.json (from a previous extraction run) and inserts
 * the findings into the staging database. Creates an assessment_runs row first,
 * then bulk-inserts all findings.
 *
 * Usage:
 *   DATABASE_URL=... tsx scripts/seed-findings-to-db.ts [--project-id UUID] [--input path/to/results.json]
 *
 * Defaults:
 *   --project-id  00000000-0000-4000-a000-000000000401 (first seeded project)
 *   --input       output/assessment-results.json
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { config } from 'dotenv';

const __dirname = dirname(fileURLToPath(import.meta.url));
const monorepoRoot = resolve(__dirname, '../../..');

// Load env from .env.local-db (or .env.stg) for DATABASE_URL
if (!process.env.DATABASE_URL) {
  config({ path: resolve(monorepoRoot, '.env.local-db') });
}
if (!process.env.DATABASE_URL) {
  config({ path: resolve(monorepoRoot, '.env.stg') });
}

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('ERROR: DATABASE_URL not set. Provide it via env or .env.local-db / .env.stg');
  process.exit(1);
}

// Parse args
const args = process.argv.slice(2);
function getArg(name: string, fallback: string): string {
  const idx = args.indexOf(name);
  return idx >= 0 && args[idx + 1] ? args[idx + 1] : fallback;
}

const PROJECT_ID = getArg('--project-id', '00000000-0000-4000-a000-000000000401');
const ORG_ID = '00000000-0000-4000-a000-000000000201'; // Acme org
const INPUT_PATH = getArg('--input', resolve(__dirname, '../output/assessment-results.json'));
const USER_ID = '00000000-0000-4000-a000-000000000302'; // David Levy (mock owner)

async function main() {
  const postgres = (await import('postgres')).default;
  const sql = postgres(DATABASE_URL!, { ssl: 'require' });

  try {
    // 1. Read assessment results
    console.log(`Reading findings from: ${INPUT_PATH}`);
    const raw = JSON.parse(readFileSync(INPUT_PATH, 'utf-8'));
    const findings: any[] = raw.findings;
    console.log(`Found ${findings.length} findings`);

    // 2. Create assessment run
    const runId = randomUUID();
    const now = new Date().toISOString();

    // Ensure an SF connection exists for this project (required FK)
    const connections = await sql`
      SELECT id FROM salesforce_connections
      WHERE project_id = ${PROJECT_ID}
      LIMIT 1
    `;
    let connectionId = connections[0]?.id;

    if (!connectionId) {
      connectionId = randomUUID();
      console.log(`Creating placeholder SF connection: ${connectionId}`);
      await sql`
        INSERT INTO salesforce_connections (
          id, project_id, organization_id, connection_role,
          salesforce_org_id, salesforce_instance_url, oauth_base_url,
          instance_type, status, created_at, updated_at
        ) VALUES (
          ${connectionId}, ${PROJECT_ID}, ${ORG_ID}, 'source',
          'seed-org-id', 'https://seed.salesforce.com', 'https://login.salesforce.com',
          'production', 'active', ${now}, ${now}
        )
      `;
      console.log('✓ Placeholder SF connection created');
    }

    console.log(`Creating assessment run: ${runId}`);
    await sql`
      INSERT INTO assessment_runs (
        id, project_id, organization_id, connection_id,
        status, mode, spec_version, worker_version,
        completeness_pct, records_extracted, api_calls_used,
        created_by, created_at, started_at, completed_at, duration_ms
      ) VALUES (
        ${runId}, ${PROJECT_ID}, ${ORG_ID}, ${connectionId},
        'completed', 'full', '1.0', 'seed-script',
        ${100}, ${findings.length}, ${0},
        ${USER_ID}, ${now}, ${now}, ${now}, ${0}
      )
    `;
    console.log('✓ Assessment run created');

    // 3. Deduplicate finding_keys (the dedup index is on run_id + finding_key WHERE detected=true)
    const keyCount = new Map<string, number>();
    for (const f of findings) {
      const key = f.findingKey;
      const count = keyCount.get(key) || 0;
      if (count > 0) {
        f.findingKey = `${key}:${count}`;
      }
      keyCount.set(key, count + 1);
    }

    // 4. Bulk insert findings (in batches of 100)
    const BATCH_SIZE = 100;
    let inserted = 0;

    for (let i = 0; i < findings.length; i += BATCH_SIZE) {
      const batch = findings.slice(i, i + BATCH_SIZE);
      const rows = batch.map((f: any) => ({
        id: randomUUID(),
        run_id: runId,
        domain: f.domain,
        collector_name: f.collectorName,
        artifact_type: f.artifactType,
        artifact_name: f.artifactName,
        artifact_id: f.artifactId || null,
        finding_key: f.findingKey,
        source_type: f.sourceType,
        source_ref: f.sourceRef || null,
        detected: f.detected ?? null,
        count_value: f.countValue ?? null,
        text_value: f.textValue || null,
        usage_level: f.usageLevel || null,
        risk_level: f.riskLevel || null,
        complexity_level: f.complexityLevel || null,
        migration_relevance: f.migrationRelevance || null,
        rca_target_concept: f.rcaTargetConcept || null,
        rca_mapping_complexity: f.rcaMappingComplexity || null,
        evidence_refs: f.evidenceRefs ? JSON.stringify(f.evidenceRefs) : null,
        notes: f.notes || null,
        organization_id: ORG_ID,
        schema_version: f.schemaVersion || '1.0',
        created_at: now,
      }));

      await sql`INSERT INTO assessment_findings ${sql(rows)}`;
      inserted += batch.length;
      process.stdout.write(`\r  Inserted ${inserted}/${findings.length} findings`);
    }
    console.log('\n✓ All findings inserted');

    // 5. Verify
    const [count] = await sql`
      SELECT COUNT(*) as cnt FROM assessment_findings WHERE run_id = ${runId}
    `;
    console.log(`\n✅ Done! Run ID: ${runId}`);
    console.log(`   Findings in DB: ${count.cnt}`);
    console.log(`   Project: ${PROJECT_ID}`);
    console.log(`\nTo view in UI: open http://localhost:5173 → project → Assessment tab`);

    await sql.end();
  } catch (error: any) {
    console.error('\n❌ Error:', error.message);
    await sql.end();
    process.exit(1);
  }
}

main();
