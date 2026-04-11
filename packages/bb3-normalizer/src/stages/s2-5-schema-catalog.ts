/**
 * Stage 2.5 — Schema catalog resolution.
 *
 * Spec: §4.4a, §6.1 Stage 2.5.
 *
 * Prepares the `SchemaCatalog` for downstream stages. When no
 * catalog is provided, runs in degraded mode — every lookup returns
 * `null`, V4 downgrades, and a warning is recorded. Missing catalog
 * is NEVER a hard failure.
 *
 * Lookups are case-insensitive: `sbqq__quote__c` finds the entry
 * canonically cased as `SBQQ__Quote__c`.
 */

import { createHash } from 'node:crypto';
import {
  canonicalJson,
  type FieldSchema,
  type ObjectSchema,
  type SchemaCatalog,
} from '@revbrain/migration-ir-contract';

export interface CatalogContext {
  /** The catalog itself, or `null` if none was provided. */
  catalog: SchemaCatalog | null;
  /**
   * Case-insensitive lookup. Returns the `FieldSchema` for the
   * requested `(object, field)` pair, or `null` if not found OR if
   * no catalog was provided.
   */
  lookup: (object: string, field: string) => FieldSchema | null;
  /**
   * Case-insensitive object lookup. Useful for path resolution.
   */
  lookupObject: (object: string) => ObjectSchema | null;
  /** Degraded-mode warnings. Recorded on `GraphMetadataIR.degradedInputs`. */
  warnings: string[];
  /**
   * PH9.6 — Canonical-JSON SHA-256 of the input catalog (first 128
   * bits, URL-safe base64), or `null` when no catalog was provided.
   * Stored on `GraphMetadataIR.schemaCatalogHash` at assembly time
   * so BB-17 re-assessment can detect catalog drift between runs.
   */
  hash: string | null;
}

/**
 * Compute a deterministic fingerprint of the catalog suitable for
 * BB-17 drift detection. Uses canonicalJson to guarantee key order
 * independence. Returns `null` for a null input so the assembly
 * step can emit `schemaCatalogHash: null` unchanged in degraded mode.
 *
 * `capturedAt` is intentionally excluded from the hash: it is wall-
 * clock telemetry of *when* the catalog snapshot was taken, not part
 * of the schema's identity. Including it would make the hash drift
 * between runs over the same source bytes, defeating its purpose
 * (drift detection) and violating the BB-3 §6.2/§6.4 determinism
 * non-negotiable on `IRGraph.metadata.schemaCatalogHash`.
 */
function hashCatalog(catalog: SchemaCatalog | null): string | null {
  if (catalog === null) return null;
  const { capturedAt: _capturedAt, ...identityFields } = catalog;
  void _capturedAt;
  const canonical = canonicalJson(identityFields);
  const digest = createHash('sha256').update(canonical, 'utf8').digest();
  const b64 = digest.subarray(0, 16).toString('base64');
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Build a `CatalogContext` from an optional `SchemaCatalog`.
 */
export function prepareCatalog(catalog?: SchemaCatalog): CatalogContext {
  if (!catalog) {
    return {
      catalog: null,
      lookup: () => null,
      lookupObject: () => null,
      warnings: [
        'No SchemaCatalog provided — V4 field-ref validation will run in degraded (syntactic-only) mode',
      ],
      hash: null,
    };
  }

  // Build case-folded indexes once for O(1) lookups.
  const objectsLowerIndex = new Map<string, string>();
  const fieldsLowerIndex = new Map<string, Map<string, string>>();

  for (const [objKey, objSchema] of Object.entries(catalog.objects)) {
    objectsLowerIndex.set(objKey.toLowerCase(), objKey);
    const fieldIdx = new Map<string, string>();
    for (const fieldKey of Object.keys(objSchema.fields)) {
      fieldIdx.set(fieldKey.toLowerCase(), fieldKey);
    }
    fieldsLowerIndex.set(objKey, fieldIdx);
  }

  const lookupObject = (object: string): ObjectSchema | null => {
    const canonicalObj = objectsLowerIndex.get(object.toLowerCase());
    if (!canonicalObj) return null;
    return catalog.objects[canonicalObj] ?? null;
  };

  const lookup = (object: string, field: string): FieldSchema | null => {
    const canonicalObj = objectsLowerIndex.get(object.toLowerCase());
    if (!canonicalObj) return null;
    const fieldIdx = fieldsLowerIndex.get(canonicalObj);
    if (!fieldIdx) return null;
    const canonicalField = fieldIdx.get(field.toLowerCase());
    if (!canonicalField) return null;
    return catalog.objects[canonicalObj]?.fields[canonicalField] ?? null;
  };

  return { catalog, lookup, lookupObject, warnings: [], hash: hashCatalog(catalog) };
}
