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
