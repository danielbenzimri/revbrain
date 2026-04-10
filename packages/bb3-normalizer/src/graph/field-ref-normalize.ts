/**
 * Field-reference normalizer.
 *
 * Spec: §5.3 (FieldRefIR), §8.6.
 *
 * Takes a raw field reference string (e.g. from a PriceCondition's
 * `Filter__c`, an Apex field access, or a formula identifier) and
 * produces a canonical `FieldRefIR`. Handles:
 *
 * - Namespace case-folding (`sbqq__foo__c` → `SBQQ__Foo__c` when
 *   resolved against the catalog, or preserved raw casing when no
 *   catalog is available).
 * - Path refs (`Account__r.Owner.Profile.Name`).
 * - Bare field names without object context.
 * - Catalog-based `isResolved` gating.
 */

import type {
  DirectFieldRef,
  FieldRefIR,
  FieldRefUnresolvedReason,
  PathFieldRef,
  SchemaCatalog,
} from '@revbrain/migration-ir-contract';

/** Context passed to the normalizer — all fields optional. */
export interface NormalizeFieldRefContext {
  /** Object the reference is rooted at (e.g. the parent sObject of the containing rule). */
  contextObject?: string;
  /** Optional schema catalog for resolution; without it, `isResolved: false`. */
  catalog?: SchemaCatalog;
  /** Optional source location for traceability. */
  sourceLocation?: string;
}

/** Known CPQ namespaces — used for isCpqManaged detection and casing. */
const NAMESPACE_PREFIXES = ['SBQQ__', 'sbaa__', 'blng__'] as const;

/** Canonical namespace form used when we emit via `isCpqManaged`. */
const NAMESPACE_CANONICAL: Record<string, string> = {
  sbqq__: 'SBQQ__',
  sbaa__: 'sbaa__',
  blng__: 'blng__',
};

/**
 * Normalize a namespace prefix on a field or object name so that
 * `sbqq__foo__c`, `Sbqq__Foo__c`, and `SBQQ__Foo__c` all collapse
 * to the canonical form.
 */
function canonicalizeNamespace(name: string): string {
  const lower = name.toLowerCase();
  for (const prefix of Object.keys(NAMESPACE_CANONICAL)) {
    if (lower.startsWith(prefix)) {
      const canonical = NAMESPACE_CANONICAL[prefix]!;
      return canonical + name.slice(prefix.length);
    }
  }
  return name;
}

/**
 * Detect whether a name is in a known CPQ namespace (case-insensitive).
 */
function isCpqManagedName(name: string): boolean {
  const lower = name.toLowerCase();
  return NAMESPACE_PREFIXES.some((p) => lower.startsWith(p.toLowerCase()));
}

/** Detect whether a field name ends in `__c` (custom field). */
function isCustomFieldName(name: string): boolean {
  return name.toLowerCase().endsWith('__c');
}

/**
 * Split a raw reference into segments while treating dots as the
 * only separator. Does NOT attempt to split on relationship-name
 * semantics — that's the job of `detectPath` below.
 */
function splitSegments(raw: string): string[] {
  return raw
    .split('.')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/**
 * A segment is a "relationship" if it ends with `__r` (custom
 * relationship) or if it's a non-custom name that isn't the final
 * segment of the reference. This is a heuristic — the catalog is
 * the ground truth when available.
 */
function isRelationshipSegment(segment: string): boolean {
  return segment.toLowerCase().endsWith('__r');
}

/**
 * Try to resolve a direct (object, field) pair against the catalog.
 * Returns the unresolved reason if resolution fails, `null` on success.
 */
function resolveDirect(
  object: string,
  field: string,
  catalog: SchemaCatalog | undefined
): FieldRefUnresolvedReason | null {
  if (!catalog) return 'no-catalog';

  // Catalog keys are canonicalized — try both raw and canonicalized lookups.
  const objKey =
    catalog.objects[object] !== undefined
      ? object
      : Object.keys(catalog.objects).find((k) => k.toLowerCase() === object.toLowerCase());
  if (!objKey) return 'object-not-in-catalog';

  const objSchema = catalog.objects[objKey]!;
  const fieldKey =
    objSchema.fields[field] !== undefined
      ? field
      : Object.keys(objSchema.fields).find((k) => k.toLowerCase() === field.toLowerCase());
  if (!fieldKey) return 'field-not-in-catalog';

  return null;
}

/**
 * Normalize a raw field reference string.
 *
 * Rules:
 *
 * 1. If the input contains at least one dot AND (the last segment
 *    is a custom/regular field OR there's at least one `__r`
 *    segment), it's a path ref.
 * 2. If the input contains exactly one dot, it's a direct ref with
 *    the first segment as the object and the second as the field.
 * 3. If the input contains no dots, it's a direct ref with
 *    `object: contextObject ?? '<unknown>'` and the input as the field.
 *
 * Namespaces on both object and field are canonicalized
 * case-insensitively. The `isResolved` flag and any
 * `unresolvedReason` are set based on catalog lookup.
 */
export function normalizeFieldRef(raw: string, context: NormalizeFieldRefContext = {}): FieldRefIR {
  const trimmed = raw.trim();

  // Dynamic refs — caller-marked sentinels. We still emit a
  // FieldRefIR but with isResolved: false + reason 'dynamic'.
  if (trimmed === '' || trimmed.includes('<dynamic>')) {
    const fieldName = trimmed === '' ? '<empty>' : '<dynamic>';
    return buildDirect({
      object: context.contextObject ?? '<unknown>',
      field: fieldName,
      context,
      forcedUnresolvedReason: 'dynamic',
    });
  }

  const segments = splitSegments(trimmed);

  // --- No segments at all (shouldn't happen after trim, but be safe) ---
  if (segments.length === 0) {
    return buildDirect({
      object: context.contextObject ?? '<unknown>',
      field: '<empty>',
      context,
      forcedUnresolvedReason: 'parse-failure',
    });
  }

  // --- Bare field name: no dots ---
  if (segments.length === 1) {
    const field = canonicalizeNamespace(segments[0]!);
    return buildDirect({
      object: context.contextObject ?? '<unknown>',
      field,
      context,
    });
  }

  // --- Exactly two segments and no relationship traversal ---
  // e.g. `SBQQ__Quote__c.SBQQ__NetAmount__c`
  if (segments.length === 2 && !isRelationshipSegment(segments[0]!)) {
    const object = canonicalizeNamespace(segments[0]!);
    const field = canonicalizeNamespace(segments[1]!);
    return buildDirect({ object, field, context });
  }

  // --- Path ref ---
  // Everything except the last segment is the relationship path; the
  // last segment is the terminal field. `rootObject` comes from the
  // context when the first segment is a relationship (e.g.
  // `Account__r.Owner.Name`), or is the first segment when it's an
  // explicit object.
  const lastIdx = segments.length - 1;
  const terminalField = canonicalizeNamespace(segments[lastIdx]!);

  let rootObject: string;
  let pathStart: number;
  if (isRelationshipSegment(segments[0]!)) {
    rootObject = context.contextObject ?? '<unknown>';
    pathStart = 0;
  } else {
    rootObject = canonicalizeNamespace(segments[0]!);
    pathStart = 1;
  }
  const path = segments.slice(pathStart, lastIdx).map((s) => canonicalizeNamespace(s));

  return buildPath({
    rootObject,
    path,
    terminalField,
    context,
  });
}

function buildDirect(args: {
  object: string;
  field: string;
  context: NormalizeFieldRefContext;
  forcedUnresolvedReason?: FieldRefUnresolvedReason;
}): DirectFieldRef {
  const { object, field, context, forcedUnresolvedReason } = args;

  const isCustom = isCustomFieldName(field);
  const isCpqManaged = isCpqManagedName(object) || isCpqManagedName(field);

  const base: DirectFieldRef = {
    kind: 'field',
    object,
    field,
    isCustom,
    isCpqManaged,
    isResolved: false,
  };
  if (context.sourceLocation !== undefined) {
    base.sourceLocation = context.sourceLocation;
  }

  if (forcedUnresolvedReason) {
    base.unresolvedReason = forcedUnresolvedReason;
    return base;
  }

  if (object === '<unknown>' || object === '<dynamic>' || field === '<dynamic>') {
    base.unresolvedReason =
      object === '<dynamic>' || field === '<dynamic>' ? 'dynamic' : 'no-catalog';
    return base;
  }

  const reason = resolveDirect(object, field, context.catalog);
  if (reason === null) {
    base.isResolved = true;
  } else {
    base.unresolvedReason = reason;
  }
  return base;
}

function buildPath(args: {
  rootObject: string;
  path: string[];
  terminalField: string;
  context: NormalizeFieldRefContext;
}): PathFieldRef {
  const { rootObject, path, terminalField, context } = args;

  const isCustom = isCustomFieldName(terminalField);
  const isCpqManaged =
    isCpqManagedName(rootObject) || path.some(isCpqManagedName) || isCpqManagedName(terminalField);

  const ref: PathFieldRef = {
    kind: 'path',
    rootObject,
    path,
    terminalField,
    isCustom,
    isCpqManaged,
    isResolved: false,
  };
  if (context.sourceLocation !== undefined) {
    ref.sourceLocation = context.sourceLocation;
  }

  // Path resolution requires walking the catalog's relationshipNames;
  // full resolution lands with Stage 5/7 work. For now, if we have no
  // catalog or rootObject is unknown, report the specific reason.
  if (rootObject === '<unknown>') {
    ref.unresolvedReason = 'object-not-in-catalog';
    return ref;
  }
  if (!context.catalog) {
    ref.unresolvedReason = 'no-catalog';
    return ref;
  }

  // Check the root object exists in the catalog. Terminal resolution
  // is a path-walk problem and belongs in PH3.3 / PH3.8; for PH2.2
  // we only assert that the root object is known.
  const objKey =
    context.catalog.objects[rootObject] !== undefined
      ? rootObject
      : Object.keys(context.catalog.objects).find(
          (k) => k.toLowerCase() === rootObject.toLowerCase()
        );
  if (!objKey) {
    ref.unresolvedReason = 'object-not-in-catalog';
    return ref;
  }

  // Root object found — mark resolved; terminal lookup deferred.
  ref.isResolved = true;
  return ref;
}
