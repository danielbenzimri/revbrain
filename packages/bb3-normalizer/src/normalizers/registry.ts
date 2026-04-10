/**
 * Stage 3 — Normalizer dispatcher registry.
 *
 * Spec: §6.1 Stage 3, §7 mapping table.
 *
 * Routes findings to the correct per-artifact-type normalizer by
 * `artifactType`. Individual normalizers are registered at package
 * init (by the PH4/PH5/PH6 tasks); this module owns the registry
 * and the fallback routing.
 *
 * Unknown artifact types route to the fallback normalizer (PH6.16),
 * which emits an `UnknownArtifactIR` placeholder and keeps the
 * pipeline running (G9 — partial compilation).
 *
 * Registering two normalizers for the same `artifactType` throws
 * at registration time — that's a programmer bug.
 */

import type { AssessmentFindingInput } from '@revbrain/contract';
import type { Diagnostic, IRNodeBase, QuarantineEntry } from '@revbrain/migration-ir-contract';
import { BB3InternalError } from '@revbrain/migration-ir-contract';
import type { CatalogContext } from '../stages/s2-5-schema-catalog.ts';
import type { FindingIndex } from '../stages/s2-group-index.ts';

/**
 * Context passed to every normalizer. Stage 3 composes this from
 * the Stage 2.5 catalog and any shared bookkeeping.
 */
export interface NormalizerContext {
  catalog: CatalogContext;
  /** Diagnostics sink — normalizers may append informational entries. */
  diagnostics: Diagnostic[];
  /**
   * PH9.2 — Read-only access to the Stage 2 finding index.
   * Optional so per-normalizer tests that construct a minimal
   * context don't have to fake the whole index. Stage 4 (PH9.3)
   * uses it for parent resolution; most normalizers won't need it.
   */
  findingIndex?: FindingIndex;
}

/**
 * Normalizer output. Zero nodes plus a quarantine entry means the
 * finding could not be normalized but the pipeline continues.
 */
export interface NormalizerResult {
  nodes: IRNodeBase[];
  quarantine?: QuarantineEntry;
  warnings?: string[];
}

/** Pure-function signature every normalizer implements. */
export type NormalizerFn = (
  finding: AssessmentFindingInput,
  context: NormalizerContext
) => NormalizerResult;

/**
 * Module-level registry. Populated by `registerNormalizer` calls
 * made at import time by the normalizer packages.
 */
const registry = new Map<string, NormalizerFn>();

/**
 * Fallback normalizer invoked for any `artifactType` that has no
 * registered normalizer. PH6.16 ships the real implementation; the
 * default here is a safe placeholder that routes the finding to
 * quarantine with reason `'unknown-artifact'`.
 */
let fallbackNormalizer: NormalizerFn = (finding) => ({
  nodes: [],
  quarantine: {
    findingKey: finding.findingKey,
    artifactType: finding.artifactType,
    reason: 'unknown-artifact',
    detail: `no normalizer registered for artifactType '${finding.artifactType}'`,
    raw: finding,
  },
});

/**
 * Register a normalizer for an `artifactType`. Throws if the same
 * type is registered twice.
 */
export function registerNormalizer(artifactType: string, fn: NormalizerFn): void {
  if (registry.has(artifactType)) {
    throw new BB3InternalError(`normalizer already registered for artifactType '${artifactType}'`, {
      code: 'BB3_R001',
      artifactType,
    });
  }
  registry.set(artifactType, fn);
}

/** Replace the fallback normalizer. PH6.16 calls this. */
export function setFallbackNormalizer(fn: NormalizerFn): void {
  fallbackNormalizer = fn;
}

/** Clear the registry. Used by tests to isolate registrations. */
export function resetRegistry(): void {
  registry.clear();
}

/**
 * Look up the normalizer for a given `artifactType`. Returns the
 * fallback if none is registered.
 */
export function lookupNormalizer(artifactType: string): NormalizerFn {
  return registry.get(artifactType) ?? fallbackNormalizer;
}

/**
 * Run every finding through its registered (or fallback) normalizer
 * and return the flattened results in input order.
 */
export function normalizeAll(
  findings: AssessmentFindingInput[],
  context: NormalizerContext
): NormalizerResult[] {
  const out: NormalizerResult[] = [];
  for (const finding of findings) {
    const fn = lookupNormalizer(finding.artifactType);
    out.push(fn(finding, context));
  }
  return out;
}
