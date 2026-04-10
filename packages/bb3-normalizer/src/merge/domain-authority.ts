/**
 * Cross-collector domain authority table.
 *
 * Spec: §8.2.2.
 *
 * When two collectors observe the same artifact and their scalar
 * fields disagree (e.g. `pricing.calculatorEvents` says `['on-calc']`
 * but `dependencies.calculatorEvents` says `['before-calc']`),
 * Stage 4 needs to pick a winner. The authority table is the
 * source of truth: for each IR node field, the collector with the
 * highest authority wins.
 *
 * Not every field needs an entry — only scalars where cross-collector
 * disagreement is possible. Array fields are usually unioned rather
 * than fought over.
 */

/**
 * Authority for a specific field on a specific node type.
 * Higher numbers win. Absent entries default to authority 0.
 */
export type AuthorityTable = Record<string, Record<string, Record<string, number>>>;

/**
 * Default authority matrix. Keyed as
 * `[nodeType][fieldName][collectorName] → authority`. Collectors
 * not listed default to 0.
 *
 * Rationale:
 *   - `pricing` owns PricingRule fields because its schema is tailored.
 *   - `dependency` owns Automation fields because it is the sole
 *     collector that parses Apex source.
 *   - `catalog` owns Product / Bundle structural fields.
 */
export const DEFAULT_AUTHORITY: AuthorityTable = {
  PricingRule: {
    calculatorEvents: { pricing: 10, dependency: 5 },
    configuratorEvents: { pricing: 10, dependency: 5 },
    evaluationScope: { pricing: 10, dependency: 5 },
    evaluationOrder: { pricing: 10, dependency: 5 },
    conditionLogic: { pricing: 10, dependency: 5 },
  },
  Automation: {
    parseStatus: { dependency: 10, pricing: 5 },
    lineCount: { dependency: 10, pricing: 5 },
    hasTriggerControl: { dependency: 10, pricing: 5 },
  },
  Product: {
    isActive: { catalog: 10, pricing: 5 },
    pricingMethod: { catalog: 10, pricing: 5 },
  },
};

/**
 * Look up the authority of a specific `(nodeType, field, collector)`
 * triple. Returns 0 when no entry exists — the caller's tie-breaker
 * (usually lexicographic collector name) decides ties.
 */
export function getAuthority(
  nodeType: string,
  field: string,
  collector: string,
  table: AuthorityTable = DEFAULT_AUTHORITY
): number {
  return table[nodeType]?.[field]?.[collector] ?? 0;
}
