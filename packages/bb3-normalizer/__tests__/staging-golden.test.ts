/**
 * PH7.12 — Staging golden regression test (A12).
 *
 * Loads a frozen snapshot of staging `assessment_findings` from
 * `fixtures/staging-findings.json` and runs it through BB-3
 * `normalize()`, then asserts that the canonicalJson of the
 * resulting graph is byte-identical to `fixtures/staging-golden.json`.
 *
 * Why a checked-in fixture instead of a live staging probe:
 *
 * 1. **CI must be reproducible.** Reaching into staging on every
 *    push would be flaky (network, schema drift, deletions) and
 *    would silently change the "expected" output as staging data
 *    evolved.
 * 2. **The fixture is content-addressable to the BB-3 code.** Any
 *    intentional change to BB-3 (a new normalizer, a fixed bug, a
 *    schema-catalog tweak) requires explicitly regenerating the
 *    golden via `apps/worker/scripts/capture-bb3-staging-golden.ts`,
 *    which is the human review gate.
 * 3. **Diffs are small.** The fixture is capped to 250 unique
 *    findings (~200 KB), so PR diffs on the golden remain
 *    reviewable when they happen.
 *
 * What this test catches:
 *
 * - Any change to canonicalJson serialization (key order, number
 *   formatting, etc.).
 * - Any change to identityHash or contentHash recipes.
 * - Any change to the descriptor table (PH9.1).
 * - Any change to Stage 4 parent wiring (PH9.3).
 * - Any change to Stage 5 Apex enrichment output (PH9.5).
 * - Any change to schemaCatalogHash (PH9.6).
 * - Any change to default-descriptor projection.
 *
 * What this test does NOT catch:
 *
 * - Semantic correctness of the BB-3 output. That's the job of
 *   the per-stage unit tests + the PH9.8 integration harness.
 *   The golden test only catches DRIFT — "did the output change?"
 *
 * Regenerating after an intentional change:
 *
 *   pnpm --filter @revbrain/worker tsx \
 *     scripts/capture-bb3-staging-golden.ts
 *
 *   git add packages/bb3-normalizer/__tests__/fixtures/staging-*.json
 *   git commit -m "test(bb3): refresh staging golden after <reason>"
 */

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { AssessmentFindingInput } from '@revbrain/contract';
import { canonicalJson } from '@revbrain/migration-ir-contract';
import { normalize } from '../src/pipeline.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const FINDINGS_PATH = resolve(__dirname, 'fixtures', 'staging-findings.json');
const GOLDEN_PATH = resolve(__dirname, 'fixtures', 'staging-golden.json');

describe('PH7.12 — staging golden file (A12)', () => {
  it('canonicalJson(normalize(staging fixture)) is byte-identical to the golden', async () => {
    const findingsRaw = readFileSync(FINDINGS_PATH, 'utf8');
    const goldenRaw = readFileSync(GOLDEN_PATH, 'utf8');

    const findings = JSON.parse(findingsRaw) as AssessmentFindingInput[];
    expect(Array.isArray(findings)).toBe(true);
    expect(findings.length).toBeGreaterThan(0);

    const result = await normalize(findings, {
      // Same frozen extractedAt as the capture script. The IRGraph
      // contract carves out exactly one wall-clock field; pinning
      // it here is what makes the comparison meaningful.
      extractedAt: '2026-04-11T00:00:00Z',
      // Real staging data may have findings that fail the per-finding
      // Zod safe-parse — they get quarantined per spec §10.1. Allow
      // up to 100% so the harness measures BB-3 behavior, not
      // upstream extractor data hygiene.
      maxInvalidRate: 1,
    });

    const actual = canonicalJson(result.graph);

    // Compare against the trailing-newline-stripped golden so the
    // capture script's `+ '\n'` convention doesn't break the diff.
    const expectedGolden = goldenRaw.replace(/\n$/, '');
    expect(actual).toBe(expectedGolden);
  });

  it('staging fixture exercises a meaningful set of node types (sanity)', async () => {
    const findingsRaw = readFileSync(FINDINGS_PATH, 'utf8');
    const findings = JSON.parse(findingsRaw) as AssessmentFindingInput[];
    const result = await normalize(findings, {
      extractedAt: '2026-04-11T00:00:00Z',
      maxInvalidRate: 1,
    });
    // The fixture should produce at least some IR nodes — if it
    // ever drops to zero, the regenerator captured a degenerate run.
    expect(result.graph.nodes.length).toBeGreaterThan(0);
    // And the schemaCatalogHash slot should be either a real hash
    // or null (PH9.6) — never undefined.
    expect(
      result.graph.metadata.schemaCatalogHash === null ||
        typeof result.graph.metadata.schemaCatalogHash === 'string'
    ).toBe(true);
  });
});
