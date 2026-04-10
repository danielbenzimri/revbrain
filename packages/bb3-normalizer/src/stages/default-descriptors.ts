/**
 * PH9.1 — Default `NodeRefFieldDescriptor` table for Stage 7.
 *
 * Spec: §5.1a, §5.3 IR schemas, §6.1 Stage 7.
 *
 * Enumerates every inline `NodeRef[]` / `NodeRef | null` field across
 * all IR types in §5.3 so `projectEdges()` can build the graph's
 * `edges[]` array without the caller supplying a descriptor list.
 *
 * Design notes:
 *
 * - **Parent-side only.** When a parent has a `NodeRef[]` array of
 *   children AND each child has a back-pointer `NodeRef` to its
 *   parent, we only project from the parent's array. Projecting from
 *   both sides would double-count every edge. Stage 4 (PH9.3) pushes
 *   resolved children into their parent's array so the parent side is
 *   the authoritative source.
 *
 * - **Singleton `NodeRef | null` fields are included** when they
 *   represent a FORWARD (owner → owned) relationship, not a back-
 *   pointer. Example: `Product.bundleStructure: NodeRef | null` is
 *   forward (the product owns its bundle structure), so we project.
 *   `BundleOption.parentBundle: NodeRef` is a back-pointer to the
 *   parent that already has the option in its `options[]` array, so
 *   we DO NOT project it — it would duplicate the parent-of edge.
 *
 * - **`edgeType` matches §5.1a `PROJECTED_EDGE_TYPES`.** No synthetic
 *   types here — synthetic `cycle-contains` edges come from Stage 6.
 *
 * - **Stable, sorted.** Entries are sorted `(fieldName, edgeType)` so
 *   the table itself is deterministic. The downstream
 *   `projectEdges()` already sorts by `(sourceId, targetId, edgeType)`
 *   so the final edge list is byte-identical regardless of descriptor
 *   order, but a sorted table is easier to audit.
 */

import type { NodeRefFieldDescriptor } from '../graph/edge-projection.ts';

/**
 * Descriptor entries for every projected `NodeRef` / `NodeRef[]` field
 * in the v1.2 IR catalog. Sorted by `(fieldName, edgeType)`.
 */
export const DEFAULT_NODE_REF_DESCRIPTORS: readonly NodeRefFieldDescriptor[] = Object.freeze([
  // PricingRule.actions, ConfigConstraint.actions — parent owns its action children
  { fieldName: 'actions', edgeType: 'parent-of' },

  // Product.bundleStructure (singleton) — product owns its bundle-structure node
  { fieldName: 'bundleStructure', edgeType: 'parent-of' },

  // PricingRule.conditions, ConfigConstraint.conditions — parent owns its condition children
  { fieldName: 'conditions', edgeType: 'parent-of' },

  // BundleStructure.configurationAttributes — structure owns its attribute children
  { fieldName: 'configurationAttributes', edgeType: 'parent-of' },

  // BundleStructure.constraints — structure owns its constraint children
  { fieldName: 'constraints', edgeType: 'parent-of' },

  // SummaryVariable.consumers — forward: the variable declares which rules read it
  { fieldName: 'consumers', edgeType: 'references' },

  // PricingRule.dependencies — explicit dependency edges declared on the rule
  { fieldName: 'dependencies', edgeType: 'depends-on' },

  // ContractedPrice.discountSchedule (singleton) — contracted price uses a schedule
  { fieldName: 'discountSchedule', edgeType: 'uses-discount-schedule' },

  // BundleStructure.features — structure owns its feature children
  { fieldName: 'features', edgeType: 'parent-of' },

  // BundleStructure.options — structure owns its option children
  { fieldName: 'options', edgeType: 'parent-of' },

  // ApexClass/ApexTrigger/Flow/WorkflowRule/OutboundMessage.relatedRules
  // — automation declares which pricing rules reference it. Semantically
  //   "references" (not "calls", which is Apex→Apex).
  { fieldName: 'relatedRules', edgeType: 'references' },

  // PricingRule.summaryVariablesConsumed — explicit variable consumption
  { fieldName: 'summaryVariablesConsumed', edgeType: 'consumes-variable' },

  // DiscountSchedule.tiers — schedule owns its tier children
  { fieldName: 'tiers', edgeType: 'parent-of' },

  // FormulaField.usedBy — formula declares which nodes reference it (reverse view)
  { fieldName: 'usedBy', edgeType: 'references' },
] satisfies readonly NodeRefFieldDescriptor[]);

/**
 * Sanity check: every entry's `edgeType` is a projected type, never
 * synthetic. Asserted at module load so a typo surfaces at boot, not
 * at run time.
 */
function assertAllProjected(): void {
  const synthetic = new Set(['cycle-contains']);
  for (const d of DEFAULT_NODE_REF_DESCRIPTORS) {
    if (synthetic.has(d.edgeType)) {
      throw new Error(
        `default-descriptors: ${d.fieldName} uses synthetic edgeType "${d.edgeType}" — projected types only`
      );
    }
  }
}
assertAllProjected();
