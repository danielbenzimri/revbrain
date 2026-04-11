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
export * from './graph/reference-index.ts';
export * from './parsers/formula.ts';
export * from './parsers/soql.ts';
export * from './parsers/apex.ts';

// Phase 3 — pipeline stages
export * from './stages/s1-input-gate.ts';
export * from './stages/s2-group-index.ts';
export * from './stages/s2-5-schema-catalog.ts';
export * from './normalizers/registry.ts';
export * from './stages/s4-resolve-refs.ts';
export * from './stages/s5-parse-code.ts';
export * from './stages/s6-detect-cycles.ts';
export * from './stages/s7-build-index.ts';
export * from './stages/s8-validate.ts';
export * from './stages/diagnostic-codes.ts';
export * from './stages/s9-assemble.ts';
export * from './merge/cross-collector.ts';
export * from './merge/domain-authority.ts';
export { normalize } from './pipeline.ts';
export type { NormalizeOptions, NormalizeResult, RuntimeStats, StageDuration } from './pipeline.ts';
export { BB3_VERSION } from './version.ts';

// PH9 §8.2 — content-addressable blob extraction for large source bodies
export * from './blobs/blob-store.ts';
export * from './blobs/blob-split.ts';
