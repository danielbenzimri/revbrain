#!/usr/bin/env npx tsx
/**
 * PH7.12 — Capture a BB-3 staging golden snapshot.
 *
 * One-off script. Run manually when you want to refresh the
 * checked-in staging golden after BB-3 changes that intentionally
 * shift the canonical output. The result lands in:
 *
 *   packages/bb3-normalizer/__tests__/fixtures/staging-findings.json
 *   packages/bb3-normalizer/__tests__/fixtures/staging-golden.json
 *
 * The first file is the captured input (a snapshot of staging
 * assessment_findings), the second is the expected canonicalJson
 * output of `normalize()` over those findings. The committed
 * `__tests__/staging-golden.test.ts` runs the same pipeline on
 * every CI push and asserts byte-equality with the golden.
 *
 * Why a snapshot, not a live probe: CI must be reproducible.
 * Reaching into staging on every push would be flaky and would
 * ALSO drift silently as staging data changed. The snapshot
 * locks the input + expected output together — re-running this
 * script is the explicit "regenerate golden" gesture.
 *
 * Usage:
 *   pnpm --filter @revbrain/worker tsx scripts/capture-bb3-staging-golden.ts [run_id]
 *
 * If run_id is omitted, picks the most recent assessment_runs row
 * with status='completed' from the staging DB.
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';
import type { AssessmentDomain, EvidenceRef } from '@revbrain/contract';
import type { AssessmentFindingInput } from '@revbrain/contract';
import { canonicalJson } from '@revbrain/migration-ir-contract';
import { normalize } from '@revbrain/bb3-normalizer';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const STAGING_DATABASE_URL =
  process.env.DATABASE_URL ??
  'postgresql://postgres.qutuivleheybnkbhpdbn:wkiN3jgh%21982@aws-1-us-west-1.pooler.supabase.com:6543/postgres';

const FIXTURES_DIR = resolve(
  __dirname,
  '..',
  '..',
  '..',
  'packages',
  'bb3-normalizer',
  '__tests__',
  'fixtures'
);

const FINDINGS_OUT = resolve(FIXTURES_DIR, 'staging-findings.json');
const GOLDEN_OUT = resolve(FIXTURES_DIR, 'staging-golden.json');

interface FindingRow {
  domain: string;
  collector_name: string;
  artifact_type: string;
  artifact_name: string;
  artifact_id: string | null;
  finding_key: string;
  source_type: string;
  source_ref: string | null;
  detected: boolean;
  count_value: number | null;
  text_value: string | null;
  usage_level: string | null;
  risk_level: string | null;
  complexity_level: string | null;
  migration_relevance: string | null;
  rca_target_concept: string | null;
  rca_mapping_complexity: string | null;
  evidence_refs: EvidenceRef[] | null;
  notes: string | null;
  schema_version: string | null;
}

function rowToFinding(row: FindingRow): AssessmentFindingInput {
  // postgres.js sometimes returns JSONB as a parsed object and
  // sometimes as a stringified one depending on column type and
  // driver mode. Normalize both shapes here.
  let evidenceRefs: EvidenceRef[];
  if (Array.isArray(row.evidence_refs)) {
    evidenceRefs = row.evidence_refs;
  } else if (typeof row.evidence_refs === 'string') {
    try {
      evidenceRefs = JSON.parse(row.evidence_refs) as EvidenceRef[];
    } catch {
      evidenceRefs = [];
    }
  } else {
    evidenceRefs = [];
  }

  const f: AssessmentFindingInput = {
    domain: row.domain as AssessmentDomain,
    collectorName: row.collector_name,
    artifactType: row.artifact_type,
    artifactName: row.artifact_name,
    findingKey: row.finding_key,
    sourceType: row.source_type as AssessmentFindingInput['sourceType'],
    detected: row.detected,
    evidenceRefs,
    schemaVersion: row.schema_version ?? '1.0',
  };
  if (row.artifact_id !== null) f.artifactId = row.artifact_id;
  if (row.source_ref !== null) f.sourceRef = row.source_ref;
  if (row.count_value !== null) f.countValue = row.count_value;
  if (row.text_value !== null) f.textValue = row.text_value;
  if (row.usage_level !== null)
    f.usageLevel = row.usage_level as AssessmentFindingInput['usageLevel'];
  if (row.risk_level !== null) f.riskLevel = row.risk_level as AssessmentFindingInput['riskLevel'];
  if (row.complexity_level !== null)
    f.complexityLevel = row.complexity_level as AssessmentFindingInput['complexityLevel'];
  if (row.migration_relevance !== null)
    f.migrationRelevance = row.migration_relevance as AssessmentFindingInput['migrationRelevance'];
  if (row.rca_target_concept !== null) f.rcaTargetConcept = row.rca_target_concept;
  if (row.rca_mapping_complexity !== null)
    f.rcaMappingComplexity =
      row.rca_mapping_complexity as AssessmentFindingInput['rcaMappingComplexity'];
  if (row.notes !== null) f.notes = row.notes;
  return f;
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const explicitRunId = argv[0];

  console.log('=== PH7.12 — Capture BB-3 staging golden ===\n');

  const sql = postgres(STAGING_DATABASE_URL, {
    ssl: 'require',
    max: 2,
    connect_timeout: 30,
  });

  try {
    let runId = explicitRunId;
    if (!runId) {
      // Pick the most recent completed run that ACTUALLY has findings.
      // Many completed runs in staging are zero-finding sandbox refreshes
      // — those won't exercise the BB-3 pipeline at all.
      const recent = await sql<{ id: string; created_at: Date; finding_count: number }[]>`
        SELECT
          r.id,
          r.created_at,
          COUNT(f.id)::int AS finding_count
        FROM assessment_runs r
        JOIN assessment_findings f ON f.run_id = r.id
        WHERE r.status IN ('completed', 'completed_warnings')
        GROUP BY r.id, r.created_at
        HAVING COUNT(f.id) > 0
        ORDER BY r.created_at DESC
        LIMIT 1
      `;
      if (recent.length === 0) {
        console.error('No assessment_runs with findings found in staging.');
        process.exit(1);
      }
      runId = recent[0]!.id;
      console.log(
        `Using most recent run with findings: ${runId} (${recent[0]!.created_at}, ${recent[0]!.finding_count} findings)`
      );
    } else {
      console.log(`Using explicit run id: ${runId}`);
    }

    console.log('\nFetching findings from staging...');
    const rows = await sql<FindingRow[]>`
      SELECT
        domain, collector_name, artifact_type, artifact_name, artifact_id,
        finding_key, source_type, source_ref, detected, count_value,
        text_value, usage_level, risk_level, complexity_level,
        migration_relevance, rca_target_concept, rca_mapping_complexity,
        evidence_refs, notes, schema_version
      FROM assessment_findings
      WHERE run_id = ${runId}
      ORDER BY finding_key, created_at
    `;
    console.log(`  → ${rows.length} raw findings`);

    if (rows.length === 0) {
      console.error('Run has zero findings. Aborting.');
      process.exit(1);
    }

    // Dedupe by finding_key (first-seen wins). Real staging
    // extractions occasionally violate the BB-3 §4.5 I2 invariant
    // (unique findingKey across the run); the golden snapshot
    // assumes a clean input so the regression test exercises BB-3,
    // not the upstream extractor's data hygiene.
    const seenKeys = new Set<string>();
    const dedupedRows: FindingRow[] = [];
    let droppedDupes = 0;
    for (const r of rows) {
      if (seenKeys.has(r.finding_key)) {
        droppedDupes++;
        continue;
      }
      seenKeys.add(r.finding_key);
      dedupedRows.push(r);
    }
    if (droppedDupes > 0) {
      console.log(`  → ${droppedDupes} duplicate findingKey rows dropped (upstream I2 hygiene)`);
    }

    // Cap the golden to a manageable size so PR diffs are reviewable
    // when BB-3 intentionally drifts. 250 unique findings is enough
    // to exercise multiple node types + the wired parent-child rules
    // without producing a 1 MB JSON blob. Sampling is deterministic
    // (the SQL ORDER BY findingKey + first-N take is reproducible).
    const GOLDEN_CAP = 250;
    const sampledRows = dedupedRows.slice(0, GOLDEN_CAP);
    if (sampledRows.length < dedupedRows.length) {
      console.log(`  → capped to first ${sampledRows.length} (deterministic by findingKey order)`);
    }
    const findings = sampledRows.map(rowToFinding);
    console.log(`  → ${findings.length} unique findings used for golden`);

    console.log('\nRunning BB-3 normalize() over the snapshot...');
    // Call normalize() directly (not the runBB3 worker wrapper) so
    // the resulting golden is reproducible from any package that
    // imports @revbrain/bb3-normalizer — the staging-golden test
    // lives in bb3-normalizer, not the worker, and can't depend
    // on the runBB3 catalog-build helper.
    const result = await normalize(findings, {
      // Frozen extractedAt so the golden is reproducible.
      extractedAt: '2026-04-11T00:00:00Z',
      // Real staging data may include findings that don't conform
      // to the BB-3 input schema (the input gate quarantines them).
      // Allow up to 100% so the capture script never hard-fails on
      // input validation — quarantined findings are part of the
      // golden snapshot.
      maxInvalidRate: 1,
    });

    console.log(`  → ${result.runtimeStats.totalNodesOut} nodes`);
    console.log(`  → ${result.graph.edges.length} edges`);
    console.log(`  → ${result.diagnostics.length} diagnostics`);
    console.log(`  → ${result.runtimeStats.quarantineCount} quarantine entries`);

    mkdirSync(FIXTURES_DIR, { recursive: true });

    // Write the input findings as a frozen fixture.
    writeFileSync(FINDINGS_OUT, canonicalJson(findings) + '\n', 'utf8');
    console.log(`\nWrote findings fixture: ${FINDINGS_OUT}`);

    // Write the canonicalJson of the resulting graph as the golden.
    writeFileSync(GOLDEN_OUT, canonicalJson(result.graph) + '\n', 'utf8');
    console.log(`Wrote golden snapshot:   ${GOLDEN_OUT}`);

    console.log('\nDone. Review the diff vs the previous golden, then commit both files.');
  } finally {
    await sql.end();
  }
}

main().catch((err) => {
  console.error('Capture failed:', err);
  process.exit(1);
});
