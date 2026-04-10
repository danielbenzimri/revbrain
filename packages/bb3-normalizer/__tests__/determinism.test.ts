/**
 * PH7.13 — Determinism test harness.
 *
 * Spec: §3.3 A4, §12.4.
 *
 * Uses `canonicalJson` (PH1.1) — NEVER `JSON.stringify` — to assert
 * byte-identity across two `normalize()` runs on identical input,
 * modulo the single allowed `extractedAt` field.
 */

import { describe, expect, it } from 'vitest';
import { canonicalJson, type IRGraph } from '@revbrain/migration-ir-contract';
import { normalize } from '../src/pipeline.ts';
import { minimalOrgFixture, largeSynthetic1kFixture, tinyCatalog } from './fixtures/builders.ts';

/** Strip the nondeterministic `extractedAt` before canonicalizing. */
function frozenExtractedAt(graph: IRGraph): IRGraph {
  return { ...graph, extractedAt: 'FIXED' };
}

describe('PH7.13 — determinism test harness (A4)', () => {
  it('minimal-org: two runs produce byte-identical canonicalJson output', async () => {
    const fixture = minimalOrgFixture();
    const a = await normalize(fixture.findings, {
      catalog: tinyCatalog(),
      extractedAt: '2026-04-10T00:00:00Z',
    });
    const b = await normalize(fixture.findings, {
      catalog: tinyCatalog(),
      extractedAt: '2026-04-10T00:00:00Z',
    });
    expect(canonicalJson(frozenExtractedAt(a.graph))).toBe(
      canonicalJson(frozenExtractedAt(b.graph))
    );
  });

  it('minimal-org: two runs with different extractedAt are still byte-identical after freeze', async () => {
    const fixture = minimalOrgFixture();
    const a = await normalize(fixture.findings, {
      catalog: tinyCatalog(),
      extractedAt: '2025-01-01T00:00:00Z',
    });
    const b = await normalize(fixture.findings, {
      catalog: tinyCatalog(),
      extractedAt: '2030-12-31T23:59:59Z',
    });
    expect(canonicalJson(frozenExtractedAt(a.graph))).toBe(
      canonicalJson(frozenExtractedAt(b.graph))
    );
  });

  it('large-synthetic-1k: deterministic across 3 consecutive runs', async () => {
    const fixture = largeSynthetic1kFixture();
    const runs = await Promise.all([
      normalize(fixture.findings, { extractedAt: '2026-04-10T00:00:00Z' }),
      normalize(fixture.findings, { extractedAt: '2026-04-10T00:00:00Z' }),
      normalize(fixture.findings, { extractedAt: '2026-04-10T00:00:00Z' }),
    ]);
    const serialized = runs.map((r) => canonicalJson(frozenExtractedAt(r.graph)));
    expect(serialized[0]).toBe(serialized[1]);
    expect(serialized[1]).toBe(serialized[2]);
  });

  it('empty input produces a deterministic envelope', async () => {
    const a = await normalize([], { extractedAt: '2026-04-10T00:00:00Z' });
    const b = await normalize([], { extractedAt: '2026-04-10T00:00:00Z' });
    expect(canonicalJson(frozenExtractedAt(a.graph))).toBe(
      canonicalJson(frozenExtractedAt(b.graph))
    );
  });

  it('canonicalJson — not JSON.stringify — is used for the determinism assertion', () => {
    // Sanity check: canonicalJson is imported from the contract
    // package, and the serialized output for an object with shuffled
    // keys is byte-identical. This prevents the test from silently
    // falling back to JSON.stringify if the import resolution changes.
    const a = canonicalJson({ b: 2, a: 1 });
    const b = canonicalJson({ a: 1, b: 2 });
    expect(a).toBe(b);
    expect(a).toBe('{"a":1,"b":2}');
  });
});
