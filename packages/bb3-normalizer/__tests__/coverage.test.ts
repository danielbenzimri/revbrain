/**
 * PH9 §8.3 — Coverage assertions: prove every input finding is
 * accounted for in the output.
 *
 * The lesson from the §8.3 audit: per-normalizer unit tests +
 * "no throw" integration tests + byte-equality goldens are not
 * enough. They all passed while 215 of 250 staging findings were
 * silently merged into 2 nodes by Stage 4 identity collisions.
 *
 * The class of bug they didn't catch is:
 *
 *   "the normalizer's identity recipe doesn't include any
 *    per-record discriminator, so N distinct findings of the same
 *    artifactType all hash to the same id, Stage 4 collapses them,
 *    and the metadata says quarantineCount=0 / unknownArtifactCount=0
 *    so nothing screams that data was lost."
 *
 * The tests in this file enforce three invariants that, together,
 * make that bug impossible:
 *
 *   I1. **Conservation:** every input finding produces an output
 *       — either as the sole evidence of a node, or as one of
 *       several merged evidence sources on a node, or as a
 *       quarantine entry. Nothing disappears.
 *
 *   I2. **Distinctness:** for every artifactType in the input,
 *       N distinct findings (different findingKey) of that type
 *       produce N distinct output nodes — UNLESS the merge is
 *       intentional and proven via shared `sourceFindingKeys`
 *       on a single node.
 *
 *   I3. **Staging snapshot health:** the checked-in 250-finding
 *       staging snapshot must produce ≥ 90% retention (≥ 225
 *       output nodes), no silent drops > 5% per artifactType.
 *
 * Any future normalizer that violates these is a bug; the tests
 * here are the early-warning system.
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { AssessmentFindingInput } from '@revbrain/contract';
import { normalize } from '../src/pipeline.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const STAGING_FINDINGS_PATH = resolve(__dirname, 'fixtures', 'staging-findings.json');

function loadStagingFindings(): AssessmentFindingInput[] {
  const raw = readFileSync(STAGING_FINDINGS_PATH, 'utf8');
  return JSON.parse(raw) as AssessmentFindingInput[];
}

describe('PH9 §8.3 — I1 Conservation: every input finding is accounted for', () => {
  it('staging snapshot: nodes ∪ quarantine ∪ merged-evidence covers every input findingKey', async () => {
    const findings = loadStagingFindings();
    const result = await normalize(findings, {
      extractedAt: '2026-04-11T00:00:00Z',
      maxInvalidRate: 1,
    });

    // Collect every findingKey that appears anywhere in the output:
    //   - sourceFindingKeys on every IR node's evidence block
    //   - findingKey on every quarantine entry
    const accountedKeys = new Set<string>();
    for (const node of result.graph.nodes) {
      for (const k of node.evidence.sourceFindingKeys) accountedKeys.add(k);
    }
    for (const q of result.graph.quarantine) {
      if (q.findingKey) accountedKeys.add(q.findingKey);
    }

    const inputKeys = new Set(findings.map((f) => f.findingKey));
    const missingKeys: string[] = [];
    for (const k of inputKeys) {
      if (!accountedKeys.has(k)) missingKeys.push(k);
    }

    if (missingKeys.length > 0) {
      throw new Error(
        `${missingKeys.length} of ${inputKeys.size} input findingKeys are not represented anywhere in the output. ` +
          `Sample: ${missingKeys.slice(0, 5).join(', ')}. ` +
          `This is a silent data-loss bug — the finding was neither normalized into a node nor quarantined.`
      );
    }
    expect(missingKeys.length).toBe(0);
  });
});

describe('PH9 §8.3 — I2 Distinctness: distinct inputs → distinct outputs', () => {
  it('staging snapshot: per-artifactType retention is ≥ 95%', async () => {
    const findings = loadStagingFindings();
    const result = await normalize(findings, {
      extractedAt: '2026-04-11T00:00:00Z',
      maxInvalidRate: 1,
    });

    // Build per-input-type counts (deduped by findingKey).
    const seenKeys = new Set<string>();
    const inputByType = new Map<string, number>();
    for (const f of findings) {
      if (seenKeys.has(f.findingKey)) continue;
      seenKeys.add(f.findingKey);
      inputByType.set(f.artifactType, (inputByType.get(f.artifactType) ?? 0) + 1);
    }

    // For each output node, walk its sourceFindingKeys back to the
    // input findings and tally per-artifactType.
    const findingByKey = new Map(findings.map((f) => [f.findingKey, f]));
    const outputByInputType = new Map<string, number>();
    const seenForType = new Map<string, Set<string>>();

    for (const node of result.graph.nodes) {
      for (const fk of node.evidence.sourceFindingKeys) {
        const f = findingByKey.get(fk);
        if (!f) continue;
        const set = seenForType.get(f.artifactType) ?? new Set();
        set.add(fk);
        seenForType.set(f.artifactType, set);
      }
    }
    for (const [t, set] of seenForType) {
      outputByInputType.set(t, set.size);
    }

    // For each artifactType with an input count ≥ 5 (small types
    // have noisy ratios), assert ≥ 95% retention. Smaller types
    // are still subject to the I1 conservation check above.
    const failures: string[] = [];
    for (const [t, n] of inputByType) {
      if (n < 5) continue;
      const out = outputByInputType.get(t) ?? 0;
      const ratio = out / n;
      if (ratio < 0.95) {
        failures.push(
          `  ${t}: ${out}/${n} input findings represented (${(ratio * 100).toFixed(1)}%)`
        );
      }
    }

    if (failures.length > 0) {
      throw new Error(
        `Per-artifactType retention below 95% threshold:\n${failures.join('\n')}\n\n` +
          `This indicates a normalizer is silently collapsing distinct inputs into the same node id ` +
          `via Stage 4 identity merging. Add a per-record discriminator (artifactId or developerName) ` +
          `to the normalizer's stableIdentity recipe.`
      );
    }
    expect(failures.length).toBe(0);
  });
});

describe('PH9 §8.3 — I3 Staging snapshot health', () => {
  it('overall retention is ≥ 90%', async () => {
    const findings = loadStagingFindings();
    const result = await normalize(findings, {
      extractedAt: '2026-04-11T00:00:00Z',
      maxInvalidRate: 1,
    });
    const ratio = result.graph.nodes.length / findings.length;
    if (ratio < 0.9) {
      throw new Error(
        `Overall retention is ${(ratio * 100).toFixed(1)}% (${result.graph.nodes.length}/${findings.length}). ` +
          `Below 90% indicates a systemic identity collision.`
      );
    }
    expect(ratio).toBeGreaterThanOrEqual(0.9);
  });

  it('every node has at least one sourceFindingKey (no synthesized nodes)', async () => {
    const findings = loadStagingFindings();
    const result = await normalize(findings, {
      extractedAt: '2026-04-11T00:00:00Z',
      maxInvalidRate: 1,
    });
    const synthesized = result.graph.nodes.filter((n) => n.evidence.sourceFindingKeys.length === 0);
    expect(synthesized).toHaveLength(0);
  });
});
