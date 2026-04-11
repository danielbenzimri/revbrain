---
name: bb3-doctor
description: Fast sanity check for BB-3 invariants — scans for RCA concept leakage, wall-clock in hash paths, JSON.stringify in determinism paths, native deps in the contract package, and other BB-3-specific smells. Runs in seconds. Invoked automatically by ship-it when BB-3 files are touched.
---

# bb3-doctor — Fast BB-3 invariant check

A handful of targeted greps and file checks that catch the BB-3 invariants that are hard to notice in a diff review. Cheap — must complete in under 5 seconds. Invoked on every `/ship-it` that touches BB-3 code.

## Checks

Run in parallel via the `Grep` tool. Report violations with `file:line`.

### C1 — No RCA concept names in BB-3 sources

- **Pattern:** `(PricingProcedure|DecisionTable|ContextDefinition|ConstraintModelLanguage|\bCML\b)`
- **Path:** `packages/bb3-normalizer/src`
- **Exclude:** `**/__tests__/**` (tests may reference these in comments for documentation)
- **Expected:** zero matches
- **Spec:** §2.4, acceptance test A14

### C2 — No wall-clock in hash / determinism paths

- **Pattern:** `(Date\.now|performance\.now|Math\.random|crypto\.randomUUID|new\s+Date\s*\()`
- **Paths:**
  - `packages/migration-ir-contract/src` (should be zero matches, period)
  - `packages/bb3-normalizer/src` — exclude:
    - `stages/s9-assemble.ts` and any `runtime-stats.ts` file (legitimately write to `NormalizeResult.runtimeStats`)
    - `pipeline.ts` line containing `extractedAt` (THE single sanctioned wall-clock entry point per spec §6.2; documented at `pipeline.ts:67-72`)
  - `apps/worker/src/pipeline` (the BB-3 worker entry; same wall-clock prohibition applies, since anything it puts on the catalog/graph poisons `IRGraph` identity). Exclude `**/*.test.ts`.
- **Expected:** zero matches outside the documented exclusions
- **Spec:** §6.2
- **Why `new Date(`:** functionally equivalent to `Date.now()` when fed into `.toISOString()` or any subsequent stringification. Caught a real regression in `apps/worker/src/pipeline/run-bb3.ts:136` where `capturedAt: new Date().toISOString()` leaked into `SchemaCatalog` → `schemaCatalogHash` → `IRGraph.metadata`. The pre-2026-04 pattern list missed this because it only matched the static `Date.now` form.

### C3 — No JSON.stringify in identity / hash paths

- **Pattern:** `JSON\.stringify`
- **Path:** `packages/migration-ir-contract/src/identity`
- **Expected:** zero matches (must use `canonicalJson`)
- **Spec:** §8.1

### C4 — No heavy or native deps in the contract package

- **Check:** `packages/migration-ir-contract/package.json`
- **Forbidden `dependencies`:** `tree-sitter`, `tree-sitter-apex`, `pg`, `postgres`, `@revbrain/database`, `@revbrain/tpr`
- **Allowed:** `zod` (and nothing else) in runtime dependencies
- **Spec:** §6.3

### C5 — No string[] where NodeRef[] is the contract

- **Pattern:** `(conditions|actions|dependencies|options|features|constraints|summaryVariablesConsumed|relatedRules|usedBy): string\[\]`
- **Path:** `packages/migration-ir-contract/src/types`
- **Expected:** zero matches (all of these must be `NodeRef[]`)
- **Exception:** `CyclicDependencyIR.memberNodeIds: string[]` is explicitly allowed per spec §5.3 — skip it.
- **Spec:** §5.1a

### C6 — No wall-clock timeouts on parsers

- **Pattern:** `(setTimeout|clearTimeout|timeoutMs|parseTimeout)`
- **Path:** `packages/bb3-normalizer/src/parsers`
- **Expected:** zero matches (use byte/AST/depth budgets instead)
- **Spec:** §8.4

### C7 — IRGraph envelope has no timing fields

- **Read:** `packages/migration-ir-contract/src/types/graph.ts`
- **Forbidden fields on `IRGraph` or `GraphMetadataIR`:** `durationMs`, `bb3DurationMs`, `stageDurations`, `apexParseStats`, `generatedAt`, `buildTimestamp`
- **Rationale:** all timing lives in `NormalizeResult.runtimeStats`, NOT on the graph.
- **Spec:** §5.1, §5.6

### C8 — Graph-structure invariants file exists and is load-bearing

- **Required file:** `packages/bb3-normalizer/__tests__/invariants/graph-structure.test.ts`
- **Must contain:**
  - A reference to `PARENT_WIRING_RULES` (the parent-lookup table) so the test stays tied to the wiring contract
  - A reference to `DEFAULT_NODE_REF_DESCRIPTORS` (the edge descriptor table) so the test stays tied to the projector contract
  - An assertion of the form `edges.length).toBeGreaterThan` (I4 — edges must emerge on non-trivial input)
- **Rationale:** on 2026-04-11 a real staging run produced 3102 nodes and ZERO edges. The §8.3 class of bug (validator passes on structurally-broken data) fires because none of the V1–V8 validator rules look at `edges.length`. Phase 4.1 / decision 4 made the I4/I5/I6 invariants executable in this file. This check is the "don't delete or weaken" guard — the real runtime enforcement happens when `pnpm test` runs the file as part of `/ship-it`.
- **Expected:** file exists and all three strings are present
- **Spec:** `docs/PDF-AND-GRAPH-DECISIONS.md` decision 4

## Report format

```
## bb3-doctor report

C1 (RCA leakage):             [OK] clean | [FAIL] <file:line>
C2 (wall-clock in hash):      [OK] clean | [FAIL] <file:line>
C3 (JSON.stringify in hash):  [OK] clean | [FAIL] <file:line>
C4 (contract deps):           [OK] clean | [FAIL] <package>
C5 (string[] vs NodeRef[]):   [OK] clean | [FAIL] <file:line>
C6 (wall-clock timeouts):     [OK] clean | [FAIL] <file:line>
C7 (graph timing fields):     [OK] clean | [FAIL] <field>
C8 (graph-structure invariants file): [OK] present | [FAIL] <missing content>

Verdict: CLEAN | DIRTY
```

## Behavior

- If **CLEAN**: return to caller (usually `/ship-it`). Exit quietly.
- If **DIRTY**: STOP. Report all violations. Do NOT proceed to commit. The caller (ship-it) must not continue.

## Notes

- This skill is designed to be called before BB-3 packages exist. If `packages/migration-ir-contract` or `packages/bb3-normalizer` don't exist yet, every check returns `[OK] clean` (no files to scan, no violations possible).
- If a check starts taking >1 second, narrow its path scope before adding logic.
- New invariants get added here before they get added to `/wave-review` — this is the fast lane.
