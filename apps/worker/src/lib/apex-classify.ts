/**
 * Apex source-classification helpers (EXT-CC2, EXT-1.1, EXT-CC3).
 *
 * Pure functions over Apex source bodies. No I/O, no SF API access.
 * The dependencies collector calls these once per fetched class /
 * trigger to derive flags that drive both the per-finding shape AND
 * the metrics rollup. Pure helpers let us unit-test the
 * classification logic without spinning up an SF mock.
 *
 * **Why a separate module:** the dependencies collector is large
 * (300+ lines) and would balloon further if we inlined tests for
 * every grep-style detector. Splitting these out keeps both files
 * comprehensible AND lets the future EXT-1.1 + EXT-CC3 cards
 * extend this module instead of touching the collector.
 */

/**
 * EXT-CC2 — Detect a class-level `@isTest` annotation.
 *
 * Salesforce is permissive about case (`@IsTest`, `@isTest`, `@ISTEST`
 * are all valid) and allows `@IsTest(seeAllData=true)` style
 * arguments. We use a case-insensitive word-boundary regex; this
 * matches `@isTest` at the start of a class but also matches a
 * trailing `@isTest` annotation on a method, which is fine because
 * a class containing any test method should also be excluded from
 * production migration metrics — its only purpose is testing.
 *
 * False-positive risk: a string literal containing `@isTest` would
 * match. We accept this — collisions in production code are vanishingly
 * rare and the cost of a false positive (one test-classified
 * production class) is much lower than the cost of an inflated
 * cpqRelatedApexClasses count.
 */
export function isApexTestClass(body: string): boolean {
  return /@isTest\b/i.test(body);
}

/**
 * EXT-1.1 — Static map of CPQ Apex plugin interfaces to their
 * downstream RCA mapping characteristics. Used by
 * `detectCpqPluginInterfaces` to enrich findings with the
 * appropriate `rcaTargetConcept` and `rcaMappingComplexity`.
 *
 * Lives in worker code (NOT in `@revbrain/contract`) because it
 * contains an opinion about the RCA target — the contract package
 * stays RCA-neutral per BB-3 spec §2.4. The BB-3 normalizer
 * receives these as opaque strings on the finding's evidenceRefs;
 * RCA mapping complexity is consumed by the report layer + BB-5.
 *
 * Add new interfaces here as Salesforce ships them — the regex in
 * `detectCpqPluginInterfaces` (re-exported from
 * `@revbrain/migration-ir-contract`) accepts any matching shape,
 * but only interfaces present in this map get classified with a
 * target.
 *
 * The detection regex itself was moved to
 * `@revbrain/migration-ir-contract/detection/cpq-plugin-interface.ts`
 * during the wave-1 self-review (CTO directive 2026-04-11) so the
 * worker and the BB-3 normalizer share a single source of truth.
 */
type RcaMappingComplexity = 'direct' | 'transform' | 'redesign' | 'no-equivalent';
export const CPQ_PLUGIN_INTERFACE_MAP: Readonly<
  Record<string, { rcaTargetConcept: string; rcaMappingComplexity: RcaMappingComplexity }>
> = Object.freeze({
  // SBQQ (CPQ core)
  'SBQQ.QuoteCalculatorPluginInterface': {
    rcaTargetConcept: 'PricingProcedure',
    rcaMappingComplexity: 'redesign',
  },
  'SBQQ.QuoteCalculatorPluginInterface2': {
    rcaTargetConcept: 'PricingProcedure',
    rcaMappingComplexity: 'redesign',
  },
  'SBQQ.QuoteCalculatorPluginInterface3': {
    rcaTargetConcept: 'PricingProcedure',
    rcaMappingComplexity: 'redesign',
  },
  'SBQQ.ConfiguratorPluginInterface': {
    rcaTargetConcept: 'Product configuration extension',
    rcaMappingComplexity: 'redesign',
  },
  'SBQQ.ProductSearchPluginInterface': {
    rcaTargetConcept: 'Product search extension',
    rcaMappingComplexity: 'transform',
  },
  'SBQQ.QuoteLineGroupSplitterPluginInterface': {
    rcaTargetConcept: 'Quote line grouping logic',
    rcaMappingComplexity: 'transform',
  },
  // sbaa (Advanced Approvals)
  'sbaa.ApprovalChainCustomCondition': {
    rcaTargetConcept: 'Approval rule custom condition',
    rcaMappingComplexity: 'transform',
  },
  'sbaa.IApprovalCondition': {
    rcaTargetConcept: 'Approval rule custom condition',
    rcaMappingComplexity: 'transform',
  },
});

/**
 * EXT-1.1 — Re-export of the shared detector that lives in
 * `@revbrain/migration-ir-contract`. The worker and the BB-3
 * normalizer both call THIS function so the worker's emitted
 * `cpq_apex_plugin` finding and the BB-3-derived
 * `implementedInterfaces` field always agree byte-for-byte.
 *
 * Pre-fix the regex was duplicated between this module and
 * `packages/bb3-normalizer/src/normalizers/automation/apex-class.ts`.
 * The wave-1 self-review caught the drift risk and consolidated
 * to a single source. See spec §6.3 (contract package thinness):
 * the regex has zero runtime deps so it's allowed in the
 * migration-ir-contract package.
 */
export { detectCpqPluginInterfaces } from '@revbrain/migration-ir-contract';

/**
 * EXT-CC3 — Dynamic-dispatch / runtime-resolved-types detection.
 * The v1.1 fix added the QCP-specific `conn.query()` pattern,
 * which is the most dangerous hidden-dispatch vector in QCP
 * source: a JSForce connection method that runs arbitrary SOQL
 * the static analyzer cannot see.
 *
 * Returns the list of pattern names that matched, sorted and
 * deduped. Empty if none. Used by both Apex and QCP-JS
 * classification paths so the downstream BBs see one consistent
 * flag.
 */
const APEX_DYNAMIC_PATTERNS: ReadonlyArray<{ name: string; re: RegExp }> = [
  { name: 'Type.forName', re: /\bType\.forName\b/ },
  { name: 'Type.newInstance', re: /\bType\.newInstance\b/ },
  { name: 'Database.query', re: /\bDatabase\.query\(/ },
  { name: 'Database.queryLocator', re: /\bDatabase\.queryLocator\(/ },
];

const QCP_JS_DYNAMIC_PATTERNS: ReadonlyArray<{ name: string; re: RegExp }> = [
  { name: 'eval', re: /\beval\s*\(/ },
  { name: 'new Function', re: /\bnew\s+Function\s*\(/ },
  { name: 'dynamic import', re: /\bimport\s*\(/ },
  // The v1.1 audit's critical addition — JSForce conn.query() is
  // the QCP equivalent of `Database.query()` and was the original
  // gaps-doc miss.
  { name: 'conn.query', re: /\bconn\.query\s*\(/ },
];

/**
 * Scan an Apex source body for dynamic-dispatch patterns.
 * Returns the matched pattern names (deduplicated, sorted).
 */
export function detectApexDynamicDispatch(body: string): string[] {
  const matches = new Set<string>();
  for (const p of APEX_DYNAMIC_PATTERNS) {
    if (p.re.test(body)) matches.add(p.name);
  }
  return [...matches].sort();
}

/**
 * Scan a QCP JavaScript body for dynamic-dispatch patterns,
 * including the critical `conn.query()` JSForce vector.
 */
export function detectQcpDynamicDispatch(body: string): string[] {
  const matches = new Set<string>();
  for (const p of QCP_JS_DYNAMIC_PATTERNS) {
    if (p.re.test(body)) matches.add(p.name);
  }
  return [...matches].sort();
}
