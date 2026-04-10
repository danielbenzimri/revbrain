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

// Re-export the whole contract surface for convenience.
export * from '@revbrain/migration-ir-contract';

// Phase 2 — shared algorithms
export * from './graph/tarjan-scc.ts';
export * from './graph/field-ref-normalize.ts';
export * from './graph/edge-projection.ts';
export * from './parsers/formula.ts';
export * from './parsers/soql.ts';
export * from './parsers/apex.ts';

/**
 * BB-3 package version marker. Downstream telemetry stamps this on
 * `GraphMetadataIR.generatedBy` once the envelope is wired.
 */
export const BB3_VERSION = '0.0.0-ph2';
