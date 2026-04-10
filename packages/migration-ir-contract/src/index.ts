/**
 * @revbrain/migration-ir-contract
 *
 * Pure-type contract package for the BB-3 Migration IR Normalizer.
 * Zero native deps — safe to import from Deno edge functions.
 *
 * Type definitions land in PH0.3 – PH0.10. Identity helpers land in PH1.
 */

// Phase 0 — node / edge / envelope types
export * from './types/nodes.ts';
export * from './types/automation.ts';
export * from './types/node-ref.ts';
export * from './types/edge.ts';
export * from './types/field-ref.ts';
export * from './types/evidence.ts';
export * from './types/schema-catalog.ts';
export * from './types/diagnostic.ts';
export * from './types/errors.ts';
export * from './types/quarantine.ts';
export * from './types/graph.ts';
export * from './types/schema-version.ts';
