/**
 * @revbrain/bb3-normalizer
 *
 * BB-3 Migration Planner IR Normalizer. Consumes extraction findings
 * produced by BB-2 and returns a deterministic `IRGraph`.
 *
 * This file currently re-exports the full contract surface from
 * `@revbrain/migration-ir-contract` so downstream consumers can import
 * everything from one place. The `normalize()` entry point and the
 * pipeline stages land in PH3.11.
 */

// Re-export the whole contract surface for convenience. When PH0.3–PH0.10
// populate it with real types, those will flow through this barrel.
export * from '@revbrain/migration-ir-contract';

/**
 * BB-3 package version marker. Used by the PH0.2 smoke test and by
 * downstream telemetry to stamp `GraphMetadataIR.generatedBy` in later
 * tasks. Must be a non-empty string.
 */
export const BB3_VERSION = '0.0.0-ph0.2';
