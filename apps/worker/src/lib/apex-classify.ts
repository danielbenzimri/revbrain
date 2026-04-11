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
 * `detectCpqPluginInterfaces` accepts any matching shape, but only
 * interfaces present in this map get classified with a target.
 */
export const CPQ_PLUGIN_INTERFACE_MAP: Readonly<
  Record<string, { rcaTargetConcept: string; rcaMappingComplexity: string }>
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
 * EXT-1.1 — Detect CPQ plugin interfaces implemented by an Apex
 * class. Returns the list of fully-qualified interface names
 * found in the body via `implements ... PluginInterface | Condition`.
 *
 * The pre-fix collector classified Apex classes by substring
 * matching on field names (e.g. "mentions SBQQ__Quote__c" →
 * "pricing"). That heuristic could not distinguish a utility class
 * that happens to read SBQQ fields from THE class registered as
 * the active Quote Calculator Plugin. After this fix, plugin
 * implementations get a separate finding (in addition to the
 * existing apex_cpq_related finding) so the report and BB-3 can
 * answer "which Apex class IS the active QCP?"
 *
 * Detection is regex-based, intentionally — Apex tree-sitter is
 * reserved for the BB-3b QCP AST work per spec §14.4. The regex
 * accepts:
 *   class Foo implements SBQQ.QuoteCalculatorPluginInterface { ... }
 *   class Foo implements sbaa.ApprovalChainCustomCondition, Other { ... }
 * but NOT comments or strings (basic word-boundary discipline).
 *
 * Returns an empty array if no plugin interface is implemented.
 */
export function detectCpqPluginInterfaces(body: string): string[] {
  const matches = new Set<string>();
  // implements <Iface> [, <Iface2>] ... { — capture the interface
  // list, then split on commas to handle multi-interface classes.
  const implementsPattern =
    /\bimplements\s+([\w.,\s]*?)(?=\{|\bextends\b|\bwith\s+sharing\b|\bwithout\s+sharing\b|\binherited\s+sharing\b|;)/gi;
  for (const m of body.matchAll(implementsPattern)) {
    const ifaceList = m[1]!;
    for (const rawIface of ifaceList.split(',')) {
      const iface = rawIface.trim();
      // Only flag the SBQQ.* / sbaa.* namespaced interfaces.
      if (/^(SBQQ|sbaa)\.[A-Za-z_][A-Za-z0-9_]*$/.test(iface)) {
        matches.add(iface);
      }
    }
  }
  return [...matches].sort();
}
