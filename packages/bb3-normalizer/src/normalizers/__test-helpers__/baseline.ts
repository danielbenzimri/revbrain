/**
 * Baseline normalizer test harness.
 *
 * Every Wave 1 normalizer task (PH4.1–PH4.17) inherits the same
 * six baseline tests from the `Default test coverage for EVERY
 * normalizer task` section of TASKS.md:
 *
 *   1. happy path — one valid finding → one node with expected
 *      id, contentHash, and key fields
 *   2. dormant — usageLevel: 'dormant' is carried forward
 *   3. missing optional — finding without artifactId / countValue
 *      still normalizes
 *   4. malformed — finding with a broken field → quarantined
 *   5. rename stability — two findings differing only in
 *      artifactName → same id, same contentHash
 *   6. content-hash change — two findings differing in a semantic
 *      field → same id, different contentHash
 *
 * This harness runs all six from one call so the per-normalizer
 * test files only need to supply the fixtures.
 */

import { describe, expect, it } from 'vitest';
import type { AssessmentFindingInput } from '@revbrain/contract';
import type { NormalizerContext, NormalizerFn } from '../registry.ts';
import { prepareCatalog } from '../../stages/s2-5-schema-catalog.ts';

export interface BaselineSuiteFixtures {
  /** The normalizer under test. */
  fn: NormalizerFn;
  /** Task ID for the describe block (e.g. 'PH4.1'). */
  taskId: string;
  /** Node type name for the describe block. */
  nodeType: string;
  /** A valid finding that produces exactly one node. */
  validFinding: () => AssessmentFindingInput;
  /**
   * A finding that should be quarantined. If the normalizer handles
   * everything gracefully, supply `null` and the malformed test
   * will be skipped.
   */
  malformedFinding: (() => AssessmentFindingInput) | null;
  /**
   * Mutation producing a rename — should NOT change id or contentHash.
   * The default just bumps `artifactName`.
   */
  renameMutation?: (finding: AssessmentFindingInput) => AssessmentFindingInput;
  /**
   * Mutation producing a semantic edit — should PRESERVE id but
   * CHANGE contentHash. The default sets `detected: !detected`.
   * Pass `null` to skip the content-change test for node types
   * whose semantic payload equals the stable identity (e.g.
   * `UnknownArtifactIR`, `CyclicDependencyIR` — id and contentHash
   * are identical by construction).
   */
  contentChangeMutation?: ((finding: AssessmentFindingInput) => AssessmentFindingInput) | null;
  /**
   * PH9 §8.3 — opt out of the distinctness invariant test for
   * normalizers that intentionally collapse multiple findings into
   * a single node (singletons like `OrgFingerprintIR`, aggregators
   * like `CPQSettingsBundleIR` whose recipe is `{ bundle: 'singleton' }`,
   * fallbacks like `UnknownArtifactIR` whose findingKey-based
   * identity already discriminates).
   */
  intentionallyCollapses?: boolean;
}

function defaultContext(): NormalizerContext {
  return { catalog: prepareCatalog(), diagnostics: [] };
}

function defaultRename(f: AssessmentFindingInput): AssessmentFindingInput {
  return { ...f, artifactName: f.artifactName + ' (renamed)' };
}

function defaultContentChange(f: AssessmentFindingInput): AssessmentFindingInput {
  // `notes` is not part of the identity recipe in any normalizer, so
  // fall back to `textValue` which some recipes may include. If that
  // isn't part of identity either, the normalizer should supply a
  // custom mutation.
  return { ...f, textValue: (f.textValue ?? '') + ' edited' };
}

/**
 * Run the six baseline tests for a normalizer. Per-normalizer test
 * files call this once with their fixtures, then add their own
 * extra cases in sibling describe blocks.
 */
export function runBaselineSuite(fixtures: BaselineSuiteFixtures): void {
  const rename = fixtures.renameMutation ?? defaultRename;
  const contentChange =
    fixtures.contentChangeMutation === undefined
      ? defaultContentChange
      : fixtures.contentChangeMutation;

  describe(`${fixtures.taskId} — ${fixtures.nodeType} baseline`, () => {
    it('happy path: valid finding produces exactly one node', () => {
      const result = fixtures.fn(fixtures.validFinding(), defaultContext());
      expect(result.nodes.length).toBe(1);
      expect(result.quarantine).toBeUndefined();
      expect(result.nodes[0]!.id).toBeTruthy();
      expect(result.nodes[0]!.contentHash).toBeTruthy();
    });

    it('dormant usageLevel carries through to usageSignal', () => {
      const finding: AssessmentFindingInput = { ...fixtures.validFinding(), usageLevel: 'dormant' };
      const result = fixtures.fn(finding, defaultContext());
      expect(result.nodes[0]!.usageSignal).toBe('dormant');
    });

    it('missing artifactId / countValue still normalizes', () => {
      const finding = fixtures.validFinding();
      delete finding.artifactId;
      delete (finding as Partial<AssessmentFindingInput>).countValue;
      const result = fixtures.fn(finding, defaultContext());
      expect(result.nodes.length).toBe(1);
    });

    if (fixtures.malformedFinding) {
      const mf = fixtures.malformedFinding;
      it('malformed finding → quarantined, not thrown', () => {
        const result = fixtures.fn(mf(), defaultContext());
        expect(result.nodes.length).toBe(0);
        expect(result.quarantine).toBeDefined();
      });
    }

    it('rename: same id and same contentHash', () => {
      const a = fixtures.validFinding();
      const b = rename(a);
      const ra = fixtures.fn(a, defaultContext());
      const rb = fixtures.fn(b, defaultContext());
      expect(ra.nodes[0]!.id).toBe(rb.nodes[0]!.id);
      expect(ra.nodes[0]!.contentHash).toBe(rb.nodes[0]!.contentHash);
    });

    if (contentChange !== null) {
      const cc = contentChange;
      it('semantic edit: same id, different contentHash', () => {
        const a = fixtures.validFinding();
        const b = cc(a);
        const ra = fixtures.fn(a, defaultContext());
        const rb = fixtures.fn(b, defaultContext());
        expect(ra.nodes[0]!.id).toBe(rb.nodes[0]!.id);
        expect(ra.nodes[0]!.contentHash).not.toBe(rb.nodes[0]!.contentHash);
      });
    }

    // PH9 §8.3 — distinctness invariant. The bug we shipped to
    // production: 178 of 179 staging Product2 records collapsed
    // to one ProductIR node because the identity recipe didn't
    // include any per-record discriminator. This test catches
    // that class of bug at the per-normalizer level: two findings
    // that differ in EVERY identity-relevant field MUST produce
    // different node ids.
    //
    // The mutation rotates artifactName too because many normalizers
    // derive their developerName / displayName from it, and
    // buildBaseNode prefers developerName as the discriminator.
    //
    // Singleton/aggregator normalizers can opt out via
    // `intentionallyCollapses: true` on the fixture (e.g.
    // OrgFingerprint, CPQSettingsBundle).
    if (fixtures.intentionallyCollapses === true) return;
    it('PH9 §8.3 distinctness: distinct findingKey + artifactId + artifactName → distinct ids', () => {
      const a = fixtures.validFinding();
      const b: AssessmentFindingInput = {
        ...a,
        findingKey: a.findingKey + '-distinct',
        artifactId: (a.artifactId ?? 'a000000000000001') + 'B',
        artifactName: a.artifactName + '_distinct',
      };
      const ra = fixtures.fn(a, defaultContext());
      const rb = fixtures.fn(b, defaultContext());
      // Singleton normalizers (e.g. OrgFingerprint) and fallback
      // normalizers (UnknownArtifact) intentionally collapse to one
      // node — they can opt out by returning zero nodes for the
      // distinct case. The default expectation is "distinct in,
      // distinct out".
      if (ra.nodes.length === 0 || rb.nodes.length === 0) return;
      if (ra.nodes[0]!.id === rb.nodes[0]!.id) {
        throw new Error(
          `${fixtures.taskId} (${fixtures.nodeType}) — distinctness violation: ` +
            `two findings with different findingKey + artifactId + artifactName produced the SAME ` +
            `node id '${ra.nodes[0]!.id}'. The normalizer's stableIdentity recipe is missing a ` +
            `per-record discriminator and N distinct findings will silently collapse into 1 node ` +
            `via Stage 4 identity merging.`
        );
      }
      expect(ra.nodes[0]!.id).not.toBe(rb.nodes[0]!.id);
    });
  });
}
