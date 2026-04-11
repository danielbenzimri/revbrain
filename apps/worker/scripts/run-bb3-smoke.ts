/**
 * PH8.4 — CLI smoke test.
 *
 * Spec: docs/MIGRATION-PLANNER-BB3-DESIGN.md §3.3.
 *
 * Usage:
 *
 *   pnpm --filter @revbrain/worker smoke:bb3                       → uses the built-in minimal fixture
 *   pnpm --filter @revbrain/worker smoke:bb3 path/to/findings.json → reads findings from a JSON file
 *
 * Writes the resulting `IRGraph` (via canonicalJson) to
 * `apps/worker/output/bb3-smoke.json` and prints a 5-line summary
 * to stdout. Exits non-zero on unexpected errors — NOT on
 * validator warnings or per-finding quarantine, which are expected
 * and reported as part of the summary.
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalJson } from '@revbrain/migration-ir-contract';
import type { AssessmentFindingInput } from '@revbrain/contract';
import { runBB3 } from '../src/pipeline/run-bb3.ts';
import { summarizeNormalizeResult } from '../src/pipeline/bb3-metrics.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/** Built-in minimal-org fixture — kept here so the smoke test is self-contained. */
function minimalFixture(): AssessmentFindingInput[] {
  const base = (over: Partial<AssessmentFindingInput>): AssessmentFindingInput => ({
    domain: 'catalog',
    collectorName: 'catalog',
    artifactType: 'Product2',
    artifactName: 'Prod',
    findingKey: 'k',
    sourceType: 'object',
    detected: true,
    evidenceRefs: [],
    schemaVersion: '1.0',
    ...over,
  });
  return [
    base({
      artifactType: 'ObjectConfiguration',
      artifactName: 'SBQQ__Quote__c',
      findingKey: 'oc-1',
      sourceType: 'metadata',
      textValue: 'Id, Name, SBQQ__NetAmount__c',
    }),
    base({
      artifactName: 'Premium Sub',
      findingKey: 'p-1',
      evidenceRefs: [{ type: 'field-ref', value: 'PROD-1' }],
    }),
    base({
      domain: 'pricing',
      collectorName: 'pricing',
      artifactType: 'SBQQ__PriceRule__c',
      artifactName: 'Distributor Discount',
      findingKey: 'rule-1',
      evidenceRefs: [{ type: 'field-ref', value: 'On Calculate' }],
    }),
    base({
      domain: 'dependency',
      collectorName: 'dependency',
      artifactType: 'ApexClass',
      artifactName: 'MyPricingHandler',
      findingKey: 'apex-1',
      sourceType: 'metadata',
      textValue: 'public class MyPricingHandler { public Decimal compute() { return 1; } }',
    }),
  ];
}

async function loadFindings(argv: string[]): Promise<AssessmentFindingInput[]> {
  if (argv.length === 0) return minimalFixture();
  const path = resolve(process.cwd(), argv[0]!);
  const raw = await readFile(path, 'utf8');
  return JSON.parse(raw) as AssessmentFindingInput[];
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const findings = await loadFindings(argv);

  const start = Date.now();
  const result = await runBB3(findings, {
    extractedAt: new Date().toISOString(),
  });
  const elapsed = Date.now() - start;

  const summary = summarizeNormalizeResult(result);

  // Write the canonical-JSON serialized graph to the output dir.
  const outDir = resolve(__dirname, '..', 'output');
  await mkdir(outDir, { recursive: true });
  const outPath = resolve(outDir, 'bb3-smoke.json');
  await writeFile(outPath, canonicalJson(result.graph) + '\n', 'utf8');

  // Pretty-print a 5-line summary to stdout.

  console.log(
    [
      `bb3 smoke: ${summary.totalFindingsIn} findings → ${summary.totalNodesOut} nodes in ${elapsed} ms`,
      `  bb3Version:  ${summary.bb3Version}`,
      `  diagnostics: err=${summary.diagnosticCounts.error} warn=${summary.diagnosticCounts.warning} info=${summary.diagnosticCounts.info}`,
      `  quarantine:  ${summary.quarantineCount} (${Object.entries(summary.quarantineByReason)
        .map(([r, n]) => `${r}=${n}`)
        .join(', ')})`,
      `  output:      ${outPath}`,
    ].join('\n')
  );
}

main().catch((err) => {
  console.error('bb3 smoke: FAILED with unexpected error:');

  console.error(err);
  process.exit(1);
});
