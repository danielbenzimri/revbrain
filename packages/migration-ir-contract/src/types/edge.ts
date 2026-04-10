/**
 * IREdge — the edge-list projection over `IRGraph.nodes`.
 *
 * Spec: §5.1a (v1.2 projected/synthetic split, closes Auditor 3 P0 #1).
 *
 * Inline `NodeRef[]` fields on nodes are the source of truth for
 * relationships; `IRGraph.edges[]` is a derived projection built in
 * Stage 7 (§8.8) for consumers that want an edge-list view (e.g.
 * topological sort, cycle detection). If the two disagree, the
 * inline refs win — and the validator (§10.4) flags the drift.
 *
 * Edges are partitioned into two classes with different validation rules:
 *
 * - **Projected edges** — derived from inline `NodeRef[]` fields. MUST
 *   round-trip: every inline resolved NodeRef has a matching edge, and
 *   every projected edge has a matching inline NodeRef.
 *
 * - **Synthetic edges** — emitted by specific stages with stage-specific
 *   rules. Currently only `'cycle-contains'` (Stage 6 / §8.3) falls in
 *   this class.
 *
 * Edge types REMOVED in v1.2: `'reads-field'` and `'writes-field'`
 * (field access is a `ReferenceIndex` concern, §5.5 — not a node→node
 * edge; `FieldRefIR` is not an IR node), and `'cycle-member-of'`
 * (wrong direction; v1.2 replaces it with `'cycle-contains'` so the
 * edge source matches the node carrying the inline `NodeRef`).
 */

/**
 * Union of all edge types emitted in `IRGraph.edges`.
 *
 * Projected edge types (8) — MUST round-trip to an inline NodeRef field:
 *
 * - `'depends-on'`               — node A reads a field node B writes
 * - `'parent-of'`                — rule → condition/action; bundle → option; schedule → tier
 * - `'triggers'`                 — trigger → target object automation
 * - `'consumes-variable'`        — rule → SummaryVariableIR
 * - `'uses-formula'`             — validation rule / custom action → FormulaFieldIR
 * - `'uses-discount-schedule'`   — v1.2 addition (Auditor 3 P1 #4)
 * - `'calls'`                    — automation → automation (Apex class hierarchy)
 * - `'references'`               — generic fallback for RelationshipGraph edges
 *
 * Synthetic edge types (1) — emitted by specific stages, exempt from
 * the projected round-trip rule:
 *
 * - `'cycle-contains'`           — CyclicDependencyIR group → member (§8.3)
 */
export type IREdgeType =
  // --- Projected (8) ---
  | 'depends-on'
  | 'parent-of'
  | 'triggers'
  | 'consumes-variable'
  | 'uses-formula'
  | 'uses-discount-schedule'
  | 'calls'
  | 'references'
  // --- Synthetic (1) ---
  | 'cycle-contains';

/**
 * The set of projected edge types. Frozen so downstream consumers can
 * safely cache membership tests. Used by the validator (§10.4) to decide
 * which round-trip rule applies.
 */
export const PROJECTED_EDGE_TYPES: ReadonlySet<IREdgeType> = new Set<IREdgeType>([
  'depends-on',
  'parent-of',
  'triggers',
  'consumes-variable',
  'uses-formula',
  'uses-discount-schedule',
  'calls',
  'references',
]);

/**
 * The set of synthetic edge types. Currently only `'cycle-contains'`.
 */
export const SYNTHETIC_EDGE_TYPES: ReadonlySet<IREdgeType> = new Set<IREdgeType>([
  'cycle-contains',
]);

/**
 * A typed edge between two IR nodes.
 *
 * Derived from the inline `NodeRef` arrays on nodes during Stage 7
 * (projected types) or emitted by specific stages (synthetic types).
 */
export interface IREdge {
  /** Node `id` — always resolved (unresolved refs don't become edges). */
  sourceId: string;
  /** Target node `id`. */
  targetId: string;
  edgeType: IREdgeType;
  /**
   * Which inline field on the source node this edge came from.
   * Used by the validator (§10.4) to detect inline-vs-edge drift.
   * e.g. `'conditions'`, `'dependencies'`, `'members'`.
   */
  sourceField: string;
  /** Optional edge-level metadata. */
  metadata?: {
    /** For dependency edges: which field transmitted the dependency. */
    viaField?: string;
    /** For triggers: which DML event. */
    dmlEvent?: 'insert' | 'update' | 'delete' | 'undelete';
  };
}
