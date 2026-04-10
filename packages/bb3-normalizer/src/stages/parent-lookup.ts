/**
 * PH9.3 — Parent-child wiring helper for Stage 4.
 *
 * Spec: §6.1 Stage 4, §8.2.1–§8.2.3, PH3.5 acceptance.
 *
 * Walks draft IR nodes, resolves back-pointer `NodeRef` fields on
 * children (e.g. `PriceCondition.ownerRule`) against the normalized
 * parent nodes, rewrites the child's back-pointer to use the
 * parent's identity-hash id, and appends a resolved ref for the
 * child into the parent's matching children array (e.g. appending
 * to `PricingRule.conditions: NodeRef[]`).
 *
 * Children whose parent cannot be resolved are returned as
 * `orphaned` with enough context to generate a `QuarantineEntry`.
 *
 * Design notes:
 *
 * - **Secondary indices are built from the draft nodes**, not the
 *   finding index. This is deliberate: Stage 4 runs AFTER identity
 *   merging, so two findings that produced the same node are
 *   already unified. The secondary indices map
 *   `salesforceRecordId → nodeId`, `artifactName → nodeId`, etc.
 *
 * - **First-seen wins** on duplicate keys. Two drafts with the same
 *   `sourceSalesforceRecordIds[0]` are rare (Stage 4's merge should
 *   have unified them) but possible across node types. The index
 *   is filtered per wiring rule by `parentNodeType` so this is not
 *   a correctness hazard.
 *
 * - **Deterministic output.** Children are appended to parent
 *   arrays sorted by child.id.
 */

import type { IRNodeBase, NodeRef, ResolvedNodeRef } from '@revbrain/migration-ir-contract';
import { unresolvedRef } from '@revbrain/migration-ir-contract';

/**
 * A wiring rule describes one child→parent relationship: how to
 * extract the parent key from the child's back-pointer, what node
 * type the parent is, which field on the parent to append to, and
 * how to turn the draft nodes into the lookup index.
 */
export interface ParentWiringRule {
  childNodeType: string;
  /** Field on the child holding the back-pointer `NodeRef`. */
  childBackPointerField: string;
  /** Node type of the parent. */
  parentNodeType: string;
  /** Array field on the parent where resolved children are appended. */
  parentChildrenField: string;
  /**
   * How to derive a lookup key from the child's back-pointer
   * `NodeRef.id`. The returned string is matched against an index
   * built from parent drafts using `parentKeyExtractor`.
   */
  childKeyExtractor: (backPointerId: string) => string | null;
  /**
   * How to derive candidate lookup keys from a parent draft node.
   * The returned list may contain multiple entries (e.g. both the
   * Salesforce record-id AND the extraction-layer findingKey) so a
   * child can resolve via whichever value the extractor emitted.
   * Empty list means "this parent cannot be indexed for this rule".
   */
  parentKeyExtractor: (parent: IRNodeBase) => readonly string[];
}

/**
 * Strip a known prefix (e.g. `bundle:`) from a synthetic id and
 * return the bare code. Returns `null` if the prefix doesn't match.
 */
function stripPrefix(id: string, prefix: string): string | null {
  return id.startsWith(prefix) ? id.slice(prefix.length) : null;
}

/**
 * Read a string field from a draft node. Returns `null` if missing
 * or not a string.
 */
function readStringField(node: IRNodeBase, field: string): string | null {
  const v = (node as unknown as Record<string, unknown>)[field];
  return typeof v === 'string' ? v : null;
}

/**
 * Wiring rules for every known child→parent relationship in the v1.2
 * IR catalog. Keep these sorted by `(childNodeType, childBackPointerField)`
 * for auditability. New normalizers add new entries here.
 */
/**
 * Default key extractor for parents whose children carry a raw
 * Salesforce record-id OR extraction-layer findingKey in the
 * back-pointer. Returns both, so a fixture using `findingKey` as
 * the cross-reference resolves the same way as a production
 * extraction that populates `artifactId`.
 */
function sfRecordOrFindingKey(parent: IRNodeBase): readonly string[] {
  const keys: string[] = [];
  if (parent.evidence.sourceSalesforceRecordIds.length > 0) {
    keys.push(parent.evidence.sourceSalesforceRecordIds[0]!);
  }
  if (parent.evidence.sourceFindingKeys.length > 0) {
    keys.push(parent.evidence.sourceFindingKeys[0]!);
  }
  return keys;
}

export const PARENT_WIRING_RULES: readonly ParentWiringRule[] = Object.freeze([
  // PriceCondition.ownerRule → PricingRule.conditions
  {
    childNodeType: 'PriceCondition',
    childBackPointerField: 'ownerRule',
    parentNodeType: 'PricingRule',
    parentChildrenField: 'conditions',
    childKeyExtractor: (id) => id,
    parentKeyExtractor: sfRecordOrFindingKey,
  },
  // PriceAction.ownerRule → PricingRule.actions
  {
    childNodeType: 'PriceAction',
    childBackPointerField: 'ownerRule',
    parentNodeType: 'PricingRule',
    parentChildrenField: 'actions',
    childKeyExtractor: (id) => id,
    parentKeyExtractor: sfRecordOrFindingKey,
  },
  // BundleOption.parentBundle → BundleStructure.options
  // Child synthetic id is `bundle:${productCode}`.
  {
    childNodeType: 'BundleOption',
    childBackPointerField: 'parentBundle',
    parentNodeType: 'BundleStructure',
    parentChildrenField: 'options',
    childKeyExtractor: (id) => stripPrefix(id, 'bundle:'),
    parentKeyExtractor: (parent) => {
      const code = readStringField(parent, 'parentProductCode');
      return code !== null ? [code] : [];
    },
  },
  // BundleFeature.parentBundle → BundleStructure.features
  {
    childNodeType: 'BundleFeature',
    childBackPointerField: 'parentBundle',
    parentNodeType: 'BundleStructure',
    parentChildrenField: 'features',
    childKeyExtractor: (id) => stripPrefix(id, 'bundle:'),
    parentKeyExtractor: (parent) => {
      const code = readStringField(parent, 'parentProductCode');
      return code !== null ? [code] : [];
    },
  },
  // DiscountTier.parentSchedule → DiscountSchedule.tiers
  {
    childNodeType: 'DiscountTier',
    childBackPointerField: 'parentSchedule',
    parentNodeType: 'DiscountSchedule',
    parentChildrenField: 'tiers',
    childKeyExtractor: (id) => id,
    parentKeyExtractor: sfRecordOrFindingKey,
  },
] satisfies readonly ParentWiringRule[]);

export interface OrphanedChild {
  childId: string;
  childNodeType: string;
  childFindingKey: string;
  backPointerField: string;
  lookupKey: string;
  reason: string;
}

export interface WireResult {
  /** Drafts with back-pointer ids rewritten and parent arrays populated. */
  nodes: IRNodeBase[];
  /** Children whose parent could not be resolved. */
  orphans: OrphanedChild[];
}

/**
 * Apply all parent-wiring rules to a list of drafts. Returns the
 * mutated list (new array, same references where unchanged) plus
 * any orphaned children that could not be resolved.
 */
export function wireParentChildRefs(drafts: readonly IRNodeBase[]): WireResult {
  const orphans: OrphanedChild[] = [];

  // Work on a shallow-cloned list so we can mutate individual nodes
  // without affecting the caller's input. Node objects themselves
  // are treated as mutable within this function — Stage 4 already
  // owns its draft set and there is no downstream aliasing yet.
  const workingNodes: IRNodeBase[] = drafts.map((n) => ({ ...n }));

  for (const rule of PARENT_WIRING_RULES) {
    // Build parent lookup index for this rule (parentNodeType-scoped).
    // Each parent may publish multiple keys (e.g. recordId + findingKey);
    // first-seen wins per key.
    const parentIndex = new Map<string, IRNodeBase>();
    for (const node of workingNodes) {
      if (node.nodeType !== rule.parentNodeType) continue;
      for (const key of rule.parentKeyExtractor(node)) {
        if (!parentIndex.has(key)) parentIndex.set(key, node);
      }
    }

    // Collect matching children then process in id order so the
    // order of appends into parent arrays is deterministic.
    const matchingChildren = workingNodes
      .filter((n) => n.nodeType === rule.childNodeType)
      .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

    for (const child of matchingChildren) {
      const rawRef = (child as unknown as Record<string, unknown>)[rule.childBackPointerField];
      if (!isResolvedNodeRef(rawRef)) continue;
      const originalId = rawRef.id;
      const lookupKey = rule.childKeyExtractor(originalId);
      if (lookupKey === null) continue;

      const parent = parentIndex.get(lookupKey);
      if (!parent) {
        // Preserve the draft per spec: keep the child node in the
        // graph, flip its back-pointer to unresolved so downstream
        // stages know the link is broken, and add a quarantine entry
        // for traceability.
        (child as unknown as Record<string, unknown>)[rule.childBackPointerField] = unresolvedRef(
          'orphaned',
          `original id ${originalId} did not resolve to a ${rule.parentNodeType}`,
          rule.childBackPointerField
        );

        orphans.push({
          childId: child.id,
          childNodeType: child.nodeType,
          childFindingKey: child.evidence.sourceFindingKeys[0] ?? child.id,
          backPointerField: rule.childBackPointerField,
          lookupKey,
          reason: `no ${rule.parentNodeType} found for ${rule.childBackPointerField}=${lookupKey}`,
        });
        continue;
      }

      // Rewrite the child's back-pointer id to the parent's real id.
      const resolvedBackRef: ResolvedNodeRef = { id: parent.id, resolved: true };
      (child as unknown as Record<string, unknown>)[rule.childBackPointerField] = resolvedBackRef;

      // Append the child into the parent's children array, creating
      // the array if missing. Parent arrays carry only resolved refs.
      const parentRec = parent as unknown as Record<string, unknown>;
      const existing = parentRec[rule.parentChildrenField];
      const arr: ResolvedNodeRef[] = Array.isArray(existing)
        ? (existing as unknown[]).filter(isResolvedNodeRef)
        : [];
      // Deduplicate: a child should only appear once per parent array.
      if (!arr.some((r) => r.id === child.id)) {
        arr.push({ id: child.id, resolved: true });
      }
      // Sort by id for determinism.
      arr.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
      parentRec[rule.parentChildrenField] = arr;
    }
  }

  return { nodes: workingNodes, orphans };
}

/** Duck-typed resolved NodeRef check. */
function isResolvedNodeRef(v: unknown): v is ResolvedNodeRef {
  return (
    typeof v === 'object' &&
    v !== null &&
    (v as NodeRef).resolved === true &&
    typeof (v as ResolvedNodeRef).id === 'string'
  );
}
