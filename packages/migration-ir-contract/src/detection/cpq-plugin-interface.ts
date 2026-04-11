/**
 * Shared CPQ plugin-interface detection utilities (EXT-1.1).
 *
 * The worker's `apex-classify.ts` and the BB-3 normalizer's
 * `apex-class.ts` both need to detect `implements SBQQ.* / sbaa.*`
 * patterns in Apex source. They MUST agree byte-for-byte or the
 * PH9 §8.3 distinctness invariant + PDF↔IRGraph parity test will
 * silently diverge across re-runs (each layer would resolve a
 * different `implementedInterfaces` array for the same source).
 *
 * Pre-2026-04-11 the regex lived in two places. The wave-1
 * self-review caught the duplication and moved it here so both
 * consumers import from the same source. Per BB-3 §6.3 the contract
 * package stays thin (zod only) — this file has zero runtime deps,
 * just exported constants and a pure helper.
 *
 * **Why this lives in `migration-ir-contract` and not in
 * `@revbrain/contract`:** the worker contract is the
 * extraction-side data shape (findings + relationships). The
 * BB-3 contract is the IR shape that downstream BBs consume.
 * Plugin-interface detection feeds the IR (via
 * `ApexClassAutomationIR.implementedInterfaces`), so it belongs
 * with the IR contract.
 */

/**
 * Regex that finds `implements <iface>[, <iface2>, ...]` clauses in
 * an Apex class declaration. The capture group is the comma-
 * separated interface list; the lookahead bounds the match against
 * the class body opening, an `extends` clause, a sharing modifier,
 * or a statement terminator.
 *
 * Greedy/lazy choice: `*?` (lazy) — we want the SHORTEST list
 * before any of the lookahead terminators, not the longest, so
 * that a class with multiple `implements` clauses across nested
 * inner classes is parsed cleanly.
 *
 * Case sensitivity: insensitive — Apex itself is case-insensitive.
 * Globally executable: yes — `g` flag for `matchAll`.
 */
export const IMPLEMENTS_PATTERN =
  /\bimplements\s+([\w.,\s]*?)(?=\{|\bextends\b|\bwith\s+sharing\b|\bwithout\s+sharing\b|\binherited\s+sharing\b|;)/gi;

/**
 * Regex matching a fully-qualified CPQ plugin interface name
 * (e.g. `SBQQ.QuoteCalculatorPluginInterface`,
 * `sbaa.IApprovalCondition`). Used to filter the captured
 * interface list to ONLY the namespaced extension points we care
 * about; ordinary local interfaces like `Comparable` are rejected.
 */
export const CPQ_PLUGIN_INTERFACE_NAME_PATTERN = /^(SBQQ|sbaa)\.[A-Za-z_][A-Za-z0-9_]*$/;

/**
 * Detect every CPQ plugin interface a given Apex source body
 * implements. Pure regex — no parser, no I/O. Returns a sorted,
 * deduplicated list of fully-qualified interface names. Empty
 * array if none.
 *
 * The two consumers MUST call this function (not their own
 * regex) so the worker's emitted finding and the BB-3
 * normalizer's IR node always agree.
 */
export function detectCpqPluginInterfaces(body: string): string[] {
  const matches = new Set<string>();
  for (const m of body.matchAll(IMPLEMENTS_PATTERN)) {
    const ifaceList = m[1] ?? '';
    for (const rawIface of ifaceList.split(',')) {
      const iface = rawIface.trim();
      if (CPQ_PLUGIN_INTERFACE_NAME_PATTERN.test(iface)) {
        matches.add(iface);
      }
    }
  }
  return [...matches].sort();
}
