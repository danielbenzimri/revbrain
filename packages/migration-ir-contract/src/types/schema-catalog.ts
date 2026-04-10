/**
 * SchemaCatalog — first-class input for field-reference resolution.
 *
 * Spec: §4.4a (new in v1.1).
 *
 * Auditor 1 (P0.4) and Auditor 2 (S4) both flagged that the v1.0
 * validator V4 ("unknown field references") was unimplementable
 * because BB-3 had no schema information about the org. v1.1 promotes
 * schema data to a first-class input, sourced from the existing
 * `metadata.ts` collector's `ObjectConfiguration` findings.
 *
 * **Availability contract:** `SchemaCatalog` is OPTIONAL on the BB-3
 * public API. When omitted, BB-3 runs in "degraded" mode — every
 * `FieldRefIR.isResolved` is `false`, V4 downgrades to a syntactic
 * check, and a `GraphMetadataIR.degradedInputs` entry is recorded.
 * Missing catalog is NEVER a hard failure.
 */

/**
 * Closed enum of Salesforce field data types, plus `'unknown'` as the
 * fallback for anything the collector couldn't classify.
 */
export type FieldDataType =
  | 'string'
  | 'textarea'
  | 'picklist'
  | 'multipicklist'
  | 'int'
  | 'double'
  | 'currency'
  | 'percent'
  | 'boolean'
  | 'date'
  | 'datetime'
  | 'reference'
  | 'id'
  | 'email'
  | 'phone'
  | 'url'
  | 'formula'
  | 'rollup'
  | 'unknown';

/** Describe-like entry for one field on one object. */
export interface FieldSchema {
  apiName: string;
  dataType: FieldDataType;
  isCustom: boolean;
  /** True for formula fields and rollup summary fields. */
  isCalculated: boolean;
  /**
   * Target object API names when this is a reference field. Null for
   * non-reference fields. An empty array means the ref target is
   * unknown (degraded).
   */
  referenceTo: string[] | null;
  /** Allowed picklist values. Null for non-picklist. */
  picklistValues: string[] | null;
  isExternalId: boolean;
}

/** Describe-like entry for one object. */
export interface ObjectSchema {
  apiName: string;
  namespace: 'SBQQ' | 'sbaa' | 'blng' | null;
  isCustom: boolean;
  label: string;
  /** Keyed by field API name. */
  fields: Record<string, FieldSchema>;
  recordTypes: string[];
  /**
   * Relationship names used when traversing from this object,
   * e.g. `['Account__r', 'Owner']`. Used by the path resolver.
   */
  relationshipNames: string[];
}

/**
 * Aggregate summary of the catalog, useful for quick sanity checks
 * and feature gating.
 */
export interface SchemaCatalogSummary {
  objectCount: number;
  fieldCount: number;
  /** Objects whose namespace is SBQQ / sbaa / blng. */
  cpqManagedObjectCount: number;
  hasMultiCurrency: boolean;
}

/**
 * A minimal describe-like catalog covering every CPQ-relevant object
 * and field. Built once by the caller and passed to `normalize()`.
 */
export interface SchemaCatalog {
  /** ISO-8601 timestamp when the catalog was captured. */
  capturedAt: string;
  /** Describe-per-object. Keys are fully qualified object API names. */
  objects: Record<string, ObjectSchema>;
  summary: SchemaCatalogSummary;
}
