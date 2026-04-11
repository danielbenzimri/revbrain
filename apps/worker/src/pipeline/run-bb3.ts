/**
 * PH8.1 — Run BB-3 normalize() inside the extraction worker.
 *
 * Spec: docs/MIGRATION-PLANNER-BB3-DESIGN.md §6.4 public API.
 *
 * Consumes the extraction worker's `AssessmentFindingInput[]`, builds
 * a `SchemaCatalog` from any `ObjectConfiguration` findings the
 * metadata collector produced, and calls `normalize()`. The result
 * is returned as-is — the caller decides whether to persist the
 * IRGraph (PH8.2), log the runtimeStats (PH8.3), or surface the
 * diagnostics.
 *
 * This module is intentionally a pure function: the real `index.ts`
 * wire-up is a separate human-reviewed change because it affects
 * the live staging worker's runtime behavior.
 */

import type { AssessmentFindingInput } from '@revbrain/contract';
import {
  normalize,
  splitLargeBlobs,
  type BlobStore,
  type NormalizeOptions,
  type NormalizeResult,
} from '@revbrain/bb3-normalizer';
import type { SchemaCatalog } from '@revbrain/migration-ir-contract';

export interface RunBB3Options {
  /**
   * Pass-through to `normalize()`. The caller controls strict mode,
   * maxInvalidRate, unresolvedRatioThreshold, etc.
   */
  normalizeOptions?: Omit<NormalizeOptions, 'catalog' | 'extractedAt'>;
  /**
   * Explicit catalog override. When omitted, `runBB3` builds one
   * from `ObjectConfiguration` findings.
   */
  catalog?: SchemaCatalog;
  /**
   * Override the `extractedAt` stamp — the one nondeterministic
   * field allowed on the graph. Defaults to now.
   */
  extractedAt?: string;
  /**
   * PH9 §8.2 — Optional blob store for content-addressable
   * externalization of large `CustomComputationIR.rawSource`
   * payloads. When provided, `runBB3` runs `splitLargeBlobs`
   * after `normalize()` so the persisted graph carries external
   * references for any blob exceeding the threshold. When
   * omitted (the default for tests + the in-process smoke
   * script), the graph carries inline blobs unchanged.
   */
  blobStore?: BlobStore;
  /**
   * PH9 §8.2 — Override the split threshold in bytes. Defaults
   * to {@link DEFAULT_BLOB_SPLIT_THRESHOLD_BYTES} (100 KiB).
   * Only meaningful when `blobStore` is set.
   */
  blobSplitThresholdBytes?: number;
}

/**
 * PH9 §8.2 — Counters surfaced when blob splitting actually ran.
 * Returned alongside the NormalizeResult so the caller can log
 * the externalization activity. Zero / null when no blob store
 * was provided.
 */
export interface BlobSplitInfo {
  splitCount: number;
  bytesExternalized: number;
}

/**
 * Build a `SchemaCatalog` from every `ObjectConfiguration` finding
 * the metadata collector produced.
 *
 * This is intentionally lenient: missing fields produce empty
 * objects, not errors. The downstream `prepareCatalog` call
 * degrades gracefully when the catalog is small or incomplete.
 */
export function buildSchemaCatalogFromFindings(
  findings: readonly AssessmentFindingInput[]
): SchemaCatalog {
  const objectFindings = findings.filter((f) => f.artifactType === 'ObjectConfiguration');

  const objects: SchemaCatalog['objects'] = {};
  let fieldCount = 0;
  let cpqManagedObjectCount = 0;

  for (const finding of objectFindings) {
    const apiName = finding.artifactName;
    const namespace: 'SBQQ' | 'sbaa' | 'blng' | null = apiName.toLowerCase().startsWith('sbqq__')
      ? 'SBQQ'
      : apiName.toLowerCase().startsWith('sbaa__')
        ? 'sbaa'
        : apiName.toLowerCase().startsWith('blng__')
          ? 'blng'
          : null;
    if (namespace !== null) cpqManagedObjectCount++;

    // Fields list comes from the finding's textValue (comma-separated).
    const fieldNames = (finding.textValue ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    const fields: SchemaCatalog['objects'][string]['fields'] = {};
    for (const fieldName of fieldNames) {
      fields[fieldName] = {
        apiName: fieldName,
        // We don't have type info from ObjectConfiguration alone;
        // the catalog degrades to 'unknown'. A later task can
        // enrich this from FieldCompleteness findings.
        dataType: 'unknown',
        isCustom: fieldName.endsWith('__c'),
        isCalculated: false,
        referenceTo: null,
        picklistValues: null,
        isExternalId: false,
      };
      fieldCount++;
    }

    objects[apiName] = {
      apiName,
      namespace,
      isCustom: apiName.endsWith('__c'),
      label: apiName,
      fields,
      recordTypes: [],
      relationshipNames: [],
    };
  }

  return {
    capturedAt: new Date().toISOString(),
    objects,
    summary: {
      objectCount: Object.keys(objects).length,
      fieldCount,
      cpqManagedObjectCount,
      hasMultiCurrency: false,
    },
  };
}

/**
 * Invoke BB-3 on a flat list of findings. Builds the catalog
 * internally unless the caller supplies one. Never throws on
 * normal input — errors surface as diagnostics per the §10.1
 * hard-fail policy.
 *
 * When `options.blobStore` is provided, runs the PH9 §8.2 blob
 * split post-transform: any inline `CustomComputationIR.rawSource`
 * exceeding the threshold is externalized to the store and
 * replaced with a content-addressed reference in the graph.
 * The split is deterministic and idempotent — the same input
 * always lands on the same content hash.
 */
export async function runBB3(
  findings: readonly AssessmentFindingInput[],
  options: RunBB3Options = {}
): Promise<NormalizeResult> {
  const catalog = options.catalog ?? buildSchemaCatalogFromFindings(findings);

  const normalizeOpts: NormalizeOptions = {
    ...options.normalizeOptions,
    catalog,
  };
  if (options.extractedAt !== undefined) {
    normalizeOpts.extractedAt = options.extractedAt;
  }

  const result = await normalize(findings as AssessmentFindingInput[], normalizeOpts);

  // PH9 §8.2 — content-addressable blob externalization. Only runs
  // when the caller supplied a BlobStore; otherwise the graph
  // carries inline blobs unchanged. The split is a pure post-
  // transform on the graph object; it does not change runtimeStats.
  if (options.blobStore) {
    const split = await splitLargeBlobs(result.graph, options.blobStore, {
      ...(options.blobSplitThresholdBytes !== undefined && {
        thresholdBytes: options.blobSplitThresholdBytes,
      }),
    });
    return { ...result, graph: split.graph };
  }

  return result;
}
