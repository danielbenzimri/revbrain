/**
 * Edge classification — triple categorization of IREdgeType.
 *
 * Spec: docs/MIGRATION-SEGMENTER-DESIGN.md §4.
 * Task: SEG-1.1.
 *
 * Every IREdgeType is classified into exactly one of three sets:
 *   - STRONG: forces co-location (same segment)
 *   - ORDERING: forces migration order (prerequisite → dependent)
 *   - HAZARD: operational coupling (no ordering, no co-location)
 *
 * Unknown edge types → hard error (IV4).
 */

import type { IREdgeType } from '@revbrain/migration-ir-contract';

/** Edge types that force both endpoints into the same segment. §4.1. */
export const STRONG_EDGE_TYPES: ReadonlySet<IREdgeType> = new Set<IREdgeType>([
  'parent-of',
  'cycle-contains',
]);

/** Edge types that create ordering but not co-location. §4.2. */
export const ORDERING_EDGE_TYPES: ReadonlySet<IREdgeType> = new Set<IREdgeType>([
  'depends-on',
  'references',
  'calls',
  'uses-formula',
  'uses-discount-schedule',
  'consumes-variable',
]);

/** Edge types that are operational hazards (no ordering, no co-location). §4.3. */
export const HAZARD_EDGE_TYPES: ReadonlySet<IREdgeType> = new Set<IREdgeType>(['triggers']);

/** All classified edge types (union of the three sets). */
export const ALL_CLASSIFIED_EDGE_TYPES: ReadonlySet<IREdgeType> = new Set<IREdgeType>([
  ...STRONG_EDGE_TYPES,
  ...ORDERING_EDGE_TYPES,
  ...HAZARD_EDGE_TYPES,
]);

/**
 * Edge types allowed to point to nodes outside the graph scope.
 * These produce virtual segments (§6.7) rather than hard errors.
 * Structural edges to missing nodes are always hard errors.
 */
export const EXTERNAL_ALLOWED_EDGE_TYPES: ReadonlySet<IREdgeType> = new Set<IREdgeType>([
  'references',
  'uses-formula',
  'uses-discount-schedule',
  'calls',
]);

/**
 * Direction table for ordering edges: maps each ordering edge type
 * to which endpoint (source or target) is the prerequisite vs
 * dependent segment. §4.2.
 *
 * The key insight: for most ordering edges, the TARGET is the
 * prerequisite ("B must exist before A references B"), so the
 * target's segment must migrate first.
 */
export type EndpointRole = 'source' | 'target';

export interface OrderingDirection {
  /** Which endpoint's segment is the prerequisite (must migrate first). */
  prerequisite: EndpointRole;
  /** Which endpoint's segment is the dependent (migrates after). */
  dependent: EndpointRole;
}

const ORDERING_DIRECTIONS: ReadonlyMap<IREdgeType, OrderingDirection> = new Map<
  IREdgeType,
  OrderingDirection
>([
  // A depends-on B → B before A
  ['depends-on', { prerequisite: 'target', dependent: 'source' }],
  // A references B → B before A
  ['references', { prerequisite: 'target', dependent: 'source' }],
  // A calls B → B before A
  ['calls', { prerequisite: 'target', dependent: 'source' }],
  // A uses-formula B → B before A
  ['uses-formula', { prerequisite: 'target', dependent: 'source' }],
  // ContractedPrice uses DiscountSchedule → schedule before price
  ['uses-discount-schedule', { prerequisite: 'target', dependent: 'source' }],
  // PricingRule consumes SummaryVariable → variable before rule
  ['consumes-variable', { prerequisite: 'target', dependent: 'source' }],
]);

/**
 * Get the ordering direction for an ordering edge type.
 * Returns the prerequisite/dependent endpoint roles.
 *
 * @throws if edgeType is not in ORDERING_EDGE_TYPES.
 */
export function getOrderingDirection(edgeType: IREdgeType): OrderingDirection {
  const dir = ORDERING_DIRECTIONS.get(edgeType);
  if (!dir) {
    throw new Error(
      `getOrderingDirection: '${edgeType}' is not an ordering edge type. ` +
        `Only ordering types have directions: ${[...ORDERING_EDGE_TYPES].join(', ')}`
    );
  }
  return dir;
}

/**
 * Classify an edge type into its category.
 * Returns 'strong', 'ordering', or 'hazard'.
 * Throws for unknown types.
 */
export function classifyEdgeType(edgeType: IREdgeType): 'strong' | 'ordering' | 'hazard' {
  if (STRONG_EDGE_TYPES.has(edgeType)) return 'strong';
  if (ORDERING_EDGE_TYPES.has(edgeType)) return 'ordering';
  if (HAZARD_EDGE_TYPES.has(edgeType)) return 'hazard';
  throw new Error(`classifyEdgeType: unknown edge type '${edgeType}'`);
}
