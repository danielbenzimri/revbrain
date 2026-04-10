# @revbrain/migration-ir-contract

Pure-type contract package for the BB-3 Migration Planner IR Normalizer. It
defines the `IRGraph` envelope, node and edge discriminated unions, evidence
blocks, schema-catalog types, diagnostics, and the quarantine-reason enum —
everything that downstream consumers (the normalizer itself, persistence, the
assessment UI, any future AI building block) need in order to agree on the
shape of the intermediate representation produced from raw CPQ extraction
findings.

This package has exactly one runtime dependency: `zod`. It does **not** depend
on `tree-sitter`, `tree-sitter-apex`, `@revbrain/database`, `@supabase/*`, or
any Salesforce client. The no-native-deps rule is enforced by
`scripts/check-no-native-deps.mjs` and exists so the contract can be imported
from a Deno edge function (pure ES modules, no `node-gyp` compilation) without
pulling any of the normalizer's parsing machinery onto the cold path. BB-3's
heavier implementation — Apex parsing, graph construction, cycle detection —
lives in the sibling `@revbrain/bb3-normalizer` package instead.
