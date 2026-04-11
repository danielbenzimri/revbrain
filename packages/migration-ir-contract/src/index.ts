/**
 * @revbrain/migration-ir-contract
 *
 * Pure-type contract package for the BB-3 Migration IR Normalizer.
 * Zero native deps — safe to import from Deno edge functions.
 *
 * Type definitions land in PH0.3 – PH0.10. Identity helpers land in PH1.
 */

// Phase 1 — identity (canonicalJson, identityHash, structuralSignature)
export * from './identity/canonical-json.ts';
export * from './identity/identity-hash.ts';
export * from './identity/structural-signature.ts';

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
export * from './types/blob-ref.ts';

// EXT-1.1 — shared CPQ plugin-interface detection (zero deps)
export * from './detection/cpq-plugin-interface.ts';
