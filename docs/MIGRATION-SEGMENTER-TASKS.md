# Migration Segmenter — Implementation Tasks

> **Companion to:** [MIGRATION-SEGMENTER-DESIGN.md](MIGRATION-SEGMENTER-DESIGN.md) (V3.1 Final)
>
> **Purpose:** Task cards for implementing the Segmenter. Each card is a self-contained unit of work with exact file paths, acceptance criteria, and test requirements. Cards are ordered by dependency — execute top-to-bottom within each phase.
>
> **Last updated:** 2026-04-12
>
> **Status:** Ready for implementation

---

## Phase rollup

| Phase                               | Cards        | Effort        | Goal                                                                 |
| ----------------------------------- | ------------ | ------------- | -------------------------------------------------------------------- |
| **PHS0 — Contract types**           | 2            | ~0.5 day      | Type definitions in `migration-ir-contract` + new package scaffold   |
| **PHS1 — Core algorithm**           | 4            | ~2 days       | Union-find, edge classification, segment DAG + SCC, topological sort |
| **PHS2 — Metadata + identity**      | 4            | ~2 days       | Dual-key IDs, root selection, complexity, wave weighting, hazards    |
| **PHS3 — External + articulation**  | 2            | ~1 day        | Virtual segments, articulation-point analysis                        |
| **PHS4 — Invariants + integration** | 3            | ~1.5 days     | S0–S15 enforcement, worker pipeline wiring, real-staging validation  |
| **PHS5 — Doctor + CI guards**       | 1            | ~0.5 day      | `seg-doctor` checks, lint guards                                     |
| **Total**                           | **16 cards** | **~7.5 days** |                                                                      |

---

## Non-negotiables (apply to every card)

1. **Determinism:** same input graph + same options → byte-identical `assignment` + `manifest`. `runtimeStats` excluded. All sorting uses strict `<`/`>` comparison — never `localeCompare`. Tested by T9 + shuffled-input determinism test.
2. **No silent fall-through:** unknown edge types throw (IV4). Missing structural-edge targets throw (IV2). No implicit edges inferred.
3. **Thin dependencies:** `@revbrain/migration-segmenter` depends on `@revbrain/migration-ir-contract` + `zod`. Nothing else. No cross-package imports from `bb3-normalizer` — all algorithms (SCC, union-find, articulation) are local implementations.
4. **All thresholds injectable:** via `SegmenterOptions`, validated by a Zod schema at entry. Invalid config → throw before any processing.
5. **Content-addressable IDs:** segment `id` uses a length-prefixed streaming hash of sorted member IDs (no collision-by-concatenation). Format: `seg:<base64url(sha256)>` (Node built-in, no external base32 dependency). `persistentId` is root-anchored with the FULL root node ID (never truncated).

---

## Card anatomy

```
### SEG-X.Y — Title
Goal:        One sentence.
Phase:       PHS0–PHS5
Depends on:  [card IDs]
Spec ref:    §X.Y in MIGRATION-SEGMENTER-DESIGN.md
Effort:      S (≤2h) | M (2–6h) | L (6–12h)
Files:       Paths to create / modify
Implementation: Bulleted steps
Acceptance:  Checklist
Test coverage: unit | integration | property | invariant
Out of scope: What NOT to do
```

---

## PHS0 — Contract types

### SEG-0.1 — Segment type definitions in migration-ir-contract

Goal: Define all shared types (`Segment`, `SegmentManifest`, `SegmentResult`, `SegmentAssignment`, `ValidationConstraint`, `ArticulationHint`, `CoordinationHazard`, `WavePlanHint`, `SegmentDiagnostic`, `SegmenterOptions`) in the contract package so both the segmenter and worker can import them.
Phase: PHS0
Depends on: none
Spec ref: §6.1–§6.7, §3.2
Effort: M (~3h)

Files:

- Create `packages/migration-ir-contract/src/types/segment.ts` — all type definitions from §6.
- Modify `packages/migration-ir-contract/src/index.ts` — re-export the new types.

Implementation:

- Transcribe every `interface` from §6.1–§6.7 into TypeScript with JSDoc comments referencing the spec section.
- `Segment.id` is `string`, `persistentId` is `string`, `label` is `string`. No runtime validation here — that's the segmenter's job.
- `SegmenterOptions` goes here (not in the segmenter package) because the worker needs to construct it.
- Export `DEFAULT_COMPLEXITY_WEIGHTS` and `DEFAULT_AUTHORITY_SCORES` as frozen objects so both segmenter and tests reference the same defaults.
- Add `SegmentDiagnosticCode` string literal union: `'SEG_I001' | 'SEG_I002' | ... | 'SEG_E003'`.

Acceptance:

- [ ] All 10+ interfaces compile with no `any`.
- [ ] `pnpm --filter @revbrain/migration-ir-contract lint` green.
- [ ] `pnpm --filter @revbrain/migration-ir-contract build` green.
- [ ] Types are importable from `@revbrain/migration-ir-contract`.

Test coverage: **lint** (type-only, no runtime tests needed).

Out of scope: runtime validation (that's SEG-1.1). Zod schemas (deferred — types first).

---

### SEG-0.2 — New package scaffold: migration-segmenter

Goal: Create the `packages/migration-segmenter/` package with the standard monorepo boilerplate so subsequent cards have a home.
Phase: PHS0
Depends on: SEG-0.1
Spec ref: §10
Effort: S (~1h)

Files:

- Create `packages/migration-segmenter/package.json` — name `@revbrain/migration-segmenter`, deps on `@revbrain/migration-ir-contract` + `zod`.
- Create `packages/migration-segmenter/tsconfig.json` + `tsconfig.build.json`.
- Create `packages/migration-segmenter/src/index.ts` — barrel export (empty initially).
- Create `packages/migration-segmenter/__tests__/` directory.
- Modify `pnpm-workspace.yaml` if not auto-discovered.
- Modify root `turbo.json` — add `@revbrain/migration-segmenter` to build/lint/test pipelines.

Implementation:

- Copy structure from `packages/bb3-normalizer/` as template.
- `vitest` for tests (same as bb3-normalizer).
- Ensure `pnpm install` resolves the workspace link.
- Add to `.github/workflows/ci.yml` if needed (turbo should pick it up automatically).

Acceptance:

- [ ] `pnpm --filter @revbrain/migration-segmenter build` succeeds (empty build).
- [ ] `pnpm --filter @revbrain/migration-segmenter lint` succeeds.
- [ ] `pnpm --filter @revbrain/migration-segmenter test` succeeds (zero tests, no error).
- [ ] Package is importable from `apps/worker/`.

Test coverage: **smoke** (build + lint).

Out of scope: any algorithm code. Just the scaffold.

---

## PHS1 — Core algorithm

### SEG-1.1 — Edge classification table + input validation

Goal: Implement the three-way edge classification (strong / ordering / hazard) and the IV1–IV5 input validation with typed errors.
Phase: PHS1
Depends on: SEG-0.1, SEG-0.2
Spec ref: §4.1–§4.5, §3.3
Effort: M (~3h)

Files:

- Create `packages/migration-segmenter/src/edge-classification.ts` — `STRONG_EDGE_TYPES`, `ORDERING_EDGE_TYPES`, `HAZARD_EDGE_TYPES`, `EXTERNAL_ALLOWED_EDGE_TYPES` as frozen Sets. Direction table: `getOrderingDirection(edgeType, sourceSegRep, targetSegRep) → { prerequisite, dependent }`.
- Create `packages/migration-segmenter/src/validate-input.ts` — IV1–IV5 checks. Returns `{ resolvedEdges, externalEdges, nodeIndex }`.
- Create `packages/migration-segmenter/src/validate-options.ts` — Zod schema for `SegmenterOptions`. Validates thresholds are positive integers, weights are positive numbers, authority scores are non-negative. Invalid config → throw `InvalidOptionsError` before any graph processing.
- Create `packages/migration-segmenter/src/errors.ts` — `DanglingEdgeError`, `DuplicateNodeIdError`, `UnclassifiedEdgeTypeError`, `IncompatibleSchemaError`, `InvalidOptionsError`.
- Create `packages/migration-segmenter/__tests__/edge-classification.test.ts`.
- Create `packages/migration-segmenter/__tests__/validate-input.test.ts`.

Implementation:

- The direction table is a `Map<IREdgeType, { prerequisite: 'source' | 'target'; dependent: 'source' | 'target' }>`. Readable, testable, one row per ordering edge type.
- `validateInput()` builds a `Set<string>` of node IDs for O(1) lookup. Walks edges once: classifies, validates endpoints, separates resolved vs external.
- External edges: target missing + edgeType in `EXTERNAL_ALLOWED` → collected for virtual segment creation (PHS3). Target missing + edgeType NOT allowed → `DanglingEdgeError`.
- IV5 checks `graph.irSchemaVersion` against a `SUPPORTED_SCHEMA_VERSIONS` range.

Acceptance:

- [ ] `STRONG_EDGE_TYPES` has exactly 2 entries (`parent-of`, `cycle-contains`).
- [ ] `ORDERING_EDGE_TYPES` has exactly 6 entries.
- [ ] `HAZARD_EDGE_TYPES` has exactly 1 entry (`triggers`).
- [ ] Unknown edge type → `UnclassifiedEdgeTypeError` (T11).
- [ ] Dangling structural edge → `DanglingEdgeError` (T14).
- [ ] Direction table covers every ordering edge type with correct prerequisite/dependent.
- [ ] `pnpm --filter @revbrain/migration-segmenter test` green.

Test coverage: **unit** (classification) + **unit** (validation errors).

Out of scope: virtual segment creation (PHS3). This card just triages edges.

---

### SEG-1.2 — Union-find data structure

Goal: Implement a deterministic union-find (disjoint-set) with path compression and union-by-rank.
Phase: PHS1
Depends on: SEG-0.2
Spec ref: §5.1
Effort: S (~2h)

Files:

- Create `packages/migration-segmenter/src/union-find.ts`.
- Create `packages/migration-segmenter/__tests__/union-find.test.ts`.

Implementation:

- Standard union-find with `find(x)` (path compression) and `union(x, y)` (union-by-rank).
- `components(): Map<string, string[]>` — enumerate all components. Each component is sorted by member ID for determinism.
- The representative of a component is an implementation detail — NOT exposed as the segment ID. Final IDs are computed in PHS2.

Acceptance:

- [ ] `union(a, b)` + `find(a) === find(b)`.
- [ ] `components()` returns sorted member lists.
- [ ] Works for 10,000 elements without stack overflow (path compression prevents deep recursion).
- [ ] Deterministic: same operations in same order → same components output.

Test coverage: **unit**.

Out of scope: streaming hash (that's SEG-2.1).

---

### SEG-1.3 — Phase 1 + Phase 2: strong-edge grouping + ordering SCC merge

Goal: Implement the core segmentation: Phase 1 (union-find on strong edges) + Phase 2 (ordering DAG + one-pass Tarjan SCC merge).
Phase: PHS1
Depends on: SEG-1.1, SEG-1.2
Spec ref: §5.1, §5.2
Effort: L (~6h)

Files:

- Create `packages/migration-segmenter/src/segment-core.ts` — `buildInitialSegments(nodes, resolvedEdges, classification)` and `mergeOrderingCycles(segments, resolvedEdges, classification)`.
- Create `packages/migration-segmenter/src/scc.ts` — **local** Tarjan SCC implementation. Do NOT import from `bb3-normalizer` (thin-dependency rule). The algorithm is ~60 LOC and stable; copying it avoids a cross-package coupling.
- Create `packages/migration-segmenter/__tests__/scc.test.ts` — unit tests for the local SCC.
- Create `packages/migration-segmenter/__tests__/segment-core.test.ts`.

Implementation:

- Phase 1: walk strong edges, union source + target. Result: initial segments as union-find components.
- Phase 2: walk ordering edges between different-segment nodes. Build segment dependency graph (using union-find reps as node IDs). Run Tarjan SCC once. For every SCC with size > 1: union all reps → merge segments. Rebuild dependency graph after merge (intra-segment edges become self-loops, dropped). Result: acyclic segment DAG.
- **One-pass sufficiency:** Tarjan finds maximal SCCs. Contracting them produces a DAG in one step. No iterative loop needed.
- **Circuit breaker:** even though one pass is sufficient, add a `MAX_SCC_MERGE_PASSES = 100` guard. If the loop somehow doesn't converge (implementation bug), throw `SegmenterInvariantError` instead of hanging the worker.
- Track `crossSegmentCycleMergeCount`.
- The function returns: `{ nodeToRep: Map<string, string>, segDepGraph: DirectedGraph, mergeCount: number }`.

Acceptance:

- [ ] PricingRule + 2 conditions + 1 action → 1 segment (T3).
- [ ] 2 independent rules → 2 segments (T4).
- [ ] Mutual depends-on → SCC merge → 1 segment (T8).
- [ ] CyclicDependency group + members → 1 segment (T6).
- [ ] BundleStructure + options + features → 1 segment (T7).
- [ ] Cross-segment dependency graph is acyclic after merge (S4).
- [ ] `pnpm --filter @revbrain/migration-segmenter test` green.

Test coverage: **unit** (synthetic fixtures) + **integration** (real staging graph via T10 in PHS4).

Out of scope: final segment IDs, metadata, waves (those are PHS2).

---

### SEG-1.4 — Phase 3: topological sort + wave assignment

Goal: Topological sort of the segment DAG to assign migration waves.
Phase: PHS1
Depends on: SEG-1.3
Spec ref: §5.3
Effort: M (~2h)

Files:

- Create `packages/migration-segmenter/src/topo-sort.ts` — `assignWaves(segDepGraph) → Map<string, number>`. Kahn's algorithm.
- Create `packages/migration-segmenter/__tests__/topo-sort.test.ts`.

Implementation:

- Kahn's algorithm: BFS from zero-indegree nodes. Each BFS layer = one wave.
- Islands (zero in + zero out) are wave 0.
- Virtual segments (PHS3) excluded — they always get wave -1 later.
- Deterministic tiebreaker: within a wave, process nodes in sorted order (by rep ID, replaced with final segment ID in PHS2).

Acceptance:

- [ ] Linear chain A→B→C → waves 0, 1, 2 (T5 variant).
- [ ] Diamond A→B, A→C, B→D, C→D → A=0, B=C=1, D=2.
- [ ] Islands = wave 0.
- [ ] Throws on cyclic input (should never happen after SCC merge, but defensive).
- [ ] Empty graph → zero waves.

Test coverage: **unit**.

Out of scope: wave weighting (that's SEG-2.3).

---

## PHS2 — Metadata + identity

### SEG-2.1 — Segment materialization: dual-key IDs + streaming hash

Goal: After all merges are complete, enumerate segments and compute final `id` (content-addressable) and `persistentId` (root-anchored).
Phase: PHS2
Depends on: SEG-1.3
Spec ref: §5.4 (id/persistentId), §5.6 (root selection)
Effort: M (~4h)

Files:

- Create `packages/migration-segmenter/src/materialize.ts` — `materializeSegments(nodeToRep, nodes, waveAssignment, options) → Segment[]`.
- Create `packages/migration-segmenter/src/authority-scores.ts` — default authority score table + root selection logic.
- Create `packages/migration-segmenter/__tests__/materialize.test.ts`.
- Create `packages/migration-segmenter/__tests__/authority-scores.test.ts`.

Implementation:

- Enumerate union-find components → for each component, collect members sorted by ID.
- `id`: streaming length-prefixed hash. For each sorted member ID: `hash.update(uint32BE(byteLength)); hash.update(utf8Bytes(id))`. This prevents collision-by-concatenation (`["ab","c"]` vs `["a","bc"]`). Format: `seg:<base64url(sha256)>` — Node's built-in `crypto.createHash('sha256').digest('base64url')`, no external base32 dependency.
- `persistentId`: after root selection, `pseg:<rootNodeId>` using the **full** node ID (never truncated — Salesforce IDs are 15/18 chars for a reason).
- Root selection: score each member by authority table → tiebreak by outgoing `parent-of` count → zero incoming `parent-of` → lexicographic ID. Configurable via `options.authorityScores`.
- `label`: `<rootNodeType>: <rootDisplayName>`.
- `complexityEstimate`: composite formula from spec.
- `weight`: sum of `COMPLEXITY_WEIGHTS[member.complexitySignal]`.
- `nodeTypes`: sorted unique.
- Build `nodeToSegment: Record<string, string>` from the final segment IDs.

Acceptance:

- [ ] Same members → same `id` (determinism, T9).
- [ ] Different members → different `id` (collision-free, T21).
- [ ] Length-prefix prevents ambiguity: `["ab","c"]` and `["a","bc"]` produce different hashes (dedicated test).
- [ ] Format is `seg:<base64url>` — no `+`, `/`, or `=` padding characters.
- [ ] Root of PricingRule+conditions segment = PricingRule (authority 80 > PriceCondition 10).
- [ ] `persistentId` stable when leaf added (T24): add a PriceCondition → `persistentId` unchanged, `id` changes.
- [ ] Streaming hash: no intermediate string > 1KB for a 1000-node segment.
- [ ] `pnpm --filter @revbrain/migration-segmenter test` green.

Test coverage: **unit** (hashing, root selection, complexity) + **property** (determinism).

Out of scope: wave weighting (SEG-2.3), validation constraints (SEG-2.2).

---

### SEG-2.2 — Validation constraints + dependency provenance

Goal: Generate `ValidationConstraint` entries from cross-segment ordering edges and `SegmentDependency` provenance records.
Phase: PHS2
Depends on: SEG-2.1
Spec ref: §6.2 (constraints), §6.3 (dependencies)
Effort: M (~3h)

Files:

- Add to `packages/migration-segmenter/src/materialize.ts` or create `packages/migration-segmenter/src/dependencies.ts`.
- Create `packages/migration-segmenter/__tests__/dependencies.test.ts`.

Implementation:

- Walk ordering edges that cross segment boundaries. For each: create `SegmentDependency` entry with `byEdgeType` count + up to 5 sample edges.
- For `consumes-variable` edges specifically: also add a `ValidationConstraint { type: 'prereq-exists', nodeId: variableNodeId, ... }` to the dependent segment.
- Populate `dependsOn` and `dependedOnBy` on each segment from the dependency list.
- `isIsland = dependsOn.length === 0 && dependedOnBy.length === 0`.
- Dedup constraints by `(nodeId, edgeType)`. Sort: `(nodeType, displayName, nodeId, edgeType)`.

Acceptance:

- [ ] `consumes-variable` across segments → ValidationConstraint on dependent (T15).
- [ ] `depends-on` A→B → dependency with `byEdgeType: { 'depends-on': 1 }` + sample edge (T5).
- [ ] Multiple edges same type between same segments → `byEdgeType` count > 1, samples capped at 5.
- [ ] All `dependsOn`/`dependedOnBy` entries exist in manifest (S12, T22).
- [ ] Constraints deduped + sorted (T23).

Test coverage: **unit**.

Out of scope: hazards (SEG-2.4), virtual segments (PHS3).

---

### SEG-2.3 — Wave weighting + sub-wave hints + histogram

Goal: Compute wave weights, emit sub-wave hints for heavy waves, build size histogram.
Phase: PHS2
Depends on: SEG-2.1, SEG-1.4
Spec ref: §5.4 (wave weighting), §6.4 (manifest fields)
Effort: M (~2h)

Files:

- Add to `packages/migration-segmenter/src/materialize.ts` or create `packages/migration-segmenter/src/wave-analysis.ts`.
- Create `packages/migration-segmenter/__tests__/wave-analysis.test.ts`.

Implementation:

- `waveWeights[wave] = sum(segment.weight for segments in wave)`. Array length = `waveCount`.
- If any wave weight > `options.thresholds.heavyWave` (default 500): emit `SEG_W003` diagnostic + `WavePlanHint { wave, orderedSegmentIds: sorted by weight desc, totalWeight }`.
- `sizeHistogram`: count segments by `nodeCount` into buckets. Constants: `SINGLETON=1, SMALL=[2,5], MEDIUM=[6,20], LARGE=[21,200], XLARGE=[201,∞)`.
- `islandCount`: count segments with `isIsland === true`.

Acceptance:

- [ ] Heavy wave → `SEG_W003` + `subWaveHints` populated (T16).
- [ ] Histogram sums to `realSegmentCount` (S7, T18).
- [ ] Boundary values tested: segments with exactly 1, 2, 5, 6, 20, 21, 200, 201 nodes (T18).
- [ ] `waveWeights.length === waveCount` (S8).

Test coverage: **unit** (boundary values).

Out of scope: articulation (PHS3).

---

### SEG-2.4 — Coordination hazards + Product↔BundleStructure diagnostic

Goal: Process hazard edges (`triggers`) into `CoordinationHazard` entries. Detect Product↔BundleStructure orphans.
Phase: PHS2
Depends on: SEG-2.1
Spec ref: §4.3, §6.6, §8.6
Effort: M (~2h)

Files:

- Add to `packages/migration-segmenter/src/materialize.ts` or create `packages/migration-segmenter/src/hazards.ts`.
- Create `packages/migration-segmenter/__tests__/hazards.test.ts`.

Implementation:

- Walk hazard edges. For each `triggers` edge where source and target are in different segments: create `CoordinationHazard` with `fingerprint = hash(segmentId + relatedSegmentId + edgeType)`, description, sample edges.
- Product↔BundleStructure check: **gated behind `options.enableHeuristics` (default false)**. When enabled: for every `Product` node, check if any `BundleStructure` node has a `parentProductCode` matching the product's code. If they're in different segments and no edge connects them: emit `SEG_W004`. This is a **non-contractual heuristic** — it reads domain-specific fields via duck-typing and correlates by naming convention, which violates the "explicit edges only" principle. It exists as an opt-in diagnostic aid, not as a core contract.
- Access `parentProductCode` from the `BundleStructure` node via duck-typing (it's a string field on the concrete IR type).

Acceptance:

- [ ] `triggers` edge → `CoordinationHazard`, NO ordering dependency (T19).
- [ ] Hazard fingerprint is deterministic (T26).
- [ ] Product + matching BundleStructure in separate segments → `SEG_W004` (T25).
- [ ] No `SEG_W004` when they're in the same segment.

Test coverage: **unit**.

Out of scope: automated BundleStructure→Product edge inference (that's a Normalize backlog item).

---

## PHS3 — External + articulation

### SEG-3.1 — Virtual external segments

Goal: Create virtual placeholder segments for external edge targets (nodes outside the graph).
Phase: PHS3
Depends on: SEG-1.1 (edge triage), SEG-2.1 (materialization)
Spec ref: §6.7, §3.3 IV2
Effort: M (~3h)

Files:

- Create `packages/migration-segmenter/src/virtual-segments.ts`.
- Create `packages/migration-segmenter/__tests__/virtual-segments.test.ts`.

Implementation:

- Input: external edges from `validateInput()` (SEG-1.1).
- Group by missing target ID. For each unique target: create `VirtualSegment` with `id: seg:ext:<hash>`, `persistentId: pseg:ext:<targetId>`, `migrationOrder: -1`, `isVirtual: true`, `memberNodeIds: []`, `dependsOn: []`.
- Compute `dependedOnBy` from the real segments that have ordering edges to this virtual.
- Also create `ValidationConstraint` on each dependent real segment: `{ type: 'prereq-exists', nodeId: targetId, ... }`.
- Emit `SEG_I003` per virtual segment.
- If zero external edges: zero virtual segments (dormant feature).

Acceptance:

- [ ] External `references` edge → virtual segment with correct fields (T20).
- [ ] Virtual `id` has `seg:ext:` prefix — no collision with real `seg:` IDs (T28).
- [ ] Virtual segment NOT in `nodeToSegment` (S2v).
- [ ] Virtual has `migrationOrder: -1`, empty `dependsOn` (S11).
- [ ] Real segment gets a `ValidationConstraint` for the external node.
- [ ] Zero external edges → zero virtual segments.

Test coverage: **unit** + **invariant** (S11, S2v, S14).

Out of scope: inferring what the external node IS (that's Disposition's job).

---

### SEG-3.2 — Articulation-point analysis for large segments

Goal: Compute ranked articulation hints for segments exceeding the size threshold.
Phase: PHS3
Depends on: SEG-2.1
Spec ref: §5.5
Effort: L (~5h)

Files:

- Create `packages/migration-segmenter/src/articulation.ts` — Hopcroft-Tarjan DFS algorithm for biconnected components / articulation points.
- Create `packages/migration-segmenter/__tests__/articulation.test.ts`.

Implementation:

- Input: a segment's members + the strong edges between them (from the full edge list, filtered to intra-segment + strong).
- Build undirected adjacency list. For extreme segments (>5000 nodes): use compact typed-array representation (CSR format).
- **Iterative** Hopcroft-Tarjan DFS using a manual stack array (NOT recursive). Standard recursive DFS hits Node's ~10K call-stack limit on deep graphs. The iterative version is identical in logic but uses an explicit `stack: Array<{node, parent, childIndex, disc, low}>` to avoid `RangeError: Maximum call stack size exceeded`.
- Ranking: for each articulation point, compute the size of the largest component that results from its removal. Sort descending.
- Cap at `options.thresholds.maxArticulationHints` (default 20).
- Return `ArticulationHint[]`.

Acceptance:

- [ ] Star graph (one hub, N leaves): hub is the only articulation point, `largestComponentSize = 1` (each leaf is its own component).
- [ ] Path graph (A–B–C–D): B and C are articulation points.
- [ ] Complete graph: zero articulation points.
- [ ] Capped at 20 even if more exist.
- [ ] Ranked by `largestComponentSize DESC, nodeId ASC`.
- [ ] Segment ≤ threshold → empty array.
- [ ] T17: >200-node segment → hints populated.

Test coverage: **unit** (graph theory fixtures) + **property** (removing a reported point does split the graph).

Out of scope: splitting the segment. Hints only.

---

## PHS4 — Invariants + integration

### SEG-4.1 — Invariant enforcement (S0–S15)

Goal: Wire all 15+ invariants as executable assertions that run at the end of `segment()` before returning the result.
Phase: PHS4
Depends on: all PHS1–PHS3 cards
Spec ref: §7
Effort: M (~3h)

Files:

- Create `packages/migration-segmenter/src/invariants.ts` — `assertInvariants(graph, assignment, manifest)`. Throws `SegmenterInvariantError` on violation.
- Create `packages/migration-segmenter/__tests__/invariants.test.ts`.

Implementation:

- One function per invariant (S0a, S0b, S1, S2, S2v, S2b, S3, S4, S5, S6, S7, S8, S9, S10, S11, S12, S13, S14, S15).
- Each returns `{ ok: boolean; message?: string }`.
- `assertInvariants()` runs all, collects failures, throws with a combined message if any fail.
- S6 (determinism) is tested externally (T9), not inside the assertion function.

Acceptance:

- [ ] Each invariant has a dedicated unit test with a passing AND failing case.
- [ ] Tampering with the output (e.g. removing a node from `nodeToSegment`) triggers the correct invariant.
- [ ] S3 failure: manually move a strong-edge endpoint to a different segment → throws.
- [ ] S12 failure: add a dangling `dependsOn` reference → throws.

Test coverage: **unit** (per-invariant pass/fail) + **invariant** (the assertions themselves).

Out of scope: performance optimization of invariant checks (they're O(N+E), which is fine).

---

### SEG-4.2 — Top-level `segment()` function + barrel export

Goal: Wire all phases into the public `segment(graph, options?)` entry point and export from the package.
Phase: PHS4
Depends on: SEG-4.1 (and transitively all algorithm cards)
Spec ref: §5 (algorithm), §6.5 (SegmentResult)
Effort: M (~3h)

Files:

- Create `packages/migration-segmenter/src/segment.ts` — `export async function segment(graph: IRGraph, options?: SegmenterOptions): Promise<SegmentResult>`.
- Modify `packages/migration-segmenter/src/index.ts` — re-export `segment`, types, constants.
- Create `packages/migration-segmenter/__tests__/segment.test.ts` — integration tests.

Implementation:

- Wire phases in order: validate → Phase 1 (union-find) → Phase 2 (SCC merge) → Phase 3 (topo sort) → Phase 4 (materialize + metadata) → Phase 5 (articulation) → invariants → return.
- Wrap in `runtimeStats` timing (same pattern as BB-3 `normalize()`).
- Collect diagnostics from all phases into a single sorted array.
- The function is async to future-proof for potential streaming hash or large-graph async operations, but current implementation is synchronous.

Acceptance:

- [ ] T1–T9 pass (core algorithm tests via the public API).
- [ ] T10: real staging graph (1863 nodes, 681 edges) → all invariants hold, no throws.
- [ ] Determinism (T9): two runs → byte-identical `JSON.stringify(assignment)` + `JSON.stringify(manifest)`.
- [ ] Shuffled-input determinism: same graph content with randomized `nodes[]` and `edges[]` array orders → identical output. Tests 3 shuffles. This catches sorting bugs that T9 (identical input) cannot.
- [ ] Unknown edge type → throws before any processing (T11).
- [ ] `pnpm --filter @revbrain/migration-segmenter test` all green.
- [ ] `pnpm --filter @revbrain/migration-segmenter build` green.

Test coverage: **integration** (real staging graph) + **unit** (synthetic fixtures).

Out of scope: worker pipeline wiring (SEG-4.3).

---

### SEG-4.3 — Worker pipeline integration + real-staging smoke test

Goal: Wire `segment()` into the extraction worker pipeline and run it end-to-end on real staging data.
Phase: PHS4
Depends on: SEG-4.2
Spec ref: §10 (worker integration)
Effort: M (~3h)

Files:

- Create `apps/worker/src/pipeline/run-segment.ts` — `runSegment(graph: IRGraph, options?: SegmenterOptions): Promise<SegmentResult>`. Thin wrapper that calls `segment()` and logs summary.
- Modify `apps/worker/scripts/run-bb3-smoke.ts` (or create new) — add a post-BB3 segmentation step that runs on the cached assessment-results.json → BB3 → segment → print summary.
- Add `@revbrain/migration-segmenter` to `apps/worker/package.json` dependencies.

Implementation:

- `runSegment()` calls `segment()`, logs: segment count, wave count, island count, largest segment size, cycle merge count, virtual count.
- Smoke script: load cached findings → `runBB3()` → `segment(graph)` → print manifest summary + first 10 segments with labels.
- The smoke script validates: no throws, >0 segments, S0–S15 hold on real data.
- Persist output to `apps/worker/output/segment-manifest.json` for manual inspection.

Acceptance:

- [ ] `npx tsx apps/worker/scripts/run-segment-smoke.ts` completes without error on the 4301-finding staging cache.
- [ ] Manifest has >0 real segments.
- [ ] Segment count + island count + wave count printed to stdout.
- [ ] `pnpm --filter @revbrain/worker test` green (no regression).
- [ ] `pnpm --filter @revbrain/worker lint` green.

Test coverage: **smoke** (real staging) + **unit** (worker wrapper).

Out of scope: persisting to database (that's a later Disposition concern). PDF integration (not yet).

---

## PHS5 — Doctor + CI guards

### SEG-5.1 — Segmenter doctor checks + skill update

Goal: Add segmenter-specific invariant checks to the CI/doctor workflow, analogous to bb3-doctor.
Phase: PHS5
Depends on: SEG-4.2
Spec ref: Design spec §4.4 (versioning), §7 (invariants)
Effort: M (~2h)

Files:

- Modify `.claude/skills/bb3-doctor/SKILL.md` — add C9 check: "segmenter edge classification covers all IREdgeType values" (grep `STRONG_EDGE_TYPES` + `ORDERING_EDGE_TYPES` + `HAZARD_EDGE_TYPES` and assert union covers the full `IREdgeType` set from `edge.ts`).
- Create `packages/migration-segmenter/__tests__/classification-coverage.test.ts` — property test: every value of `IREdgeType` is in exactly one of the three sets.

Implementation:

- The classification coverage test imports `IREdgeType` values from the contract and asserts `STRONG ∪ ORDERING ∪ HAZARD` covers all of them with no overlap.
- If a new `IREdgeType` is added to the contract without updating the segmenter, this test fails.
- C9 in bb3-doctor: grep `packages/migration-segmenter/src/edge-classification.ts` for the three set definitions and verify they reference the same count as `IREdgeType` union members.

Acceptance:

- [ ] Adding a new `IREdgeType` to the contract without updating segmenter classification → test fails.
- [ ] Current state: all 9 edge types classified, test passes.
- [ ] bb3-doctor C9 check reports clean.

Test coverage: **property** (classification completeness) + **lint** (doctor check).

Out of scope: full segmenter re-run in doctor (too slow). Static checks only.

---

## Dependency graph (visual summary)

```
SEG-0.1 (types)
  └─ SEG-0.2 (scaffold)
       ├─ SEG-1.1 (classification + validation)
       │    └─ SEG-1.3 (core: union-find + SCC)
       │         ├─ SEG-1.4 (topo sort)
       │         │    └─ SEG-2.3 (wave weighting)
       │         ├─ SEG-2.1 (materialize + IDs)
       │         │    ├─ SEG-2.2 (constraints + deps)
       │         │    ├─ SEG-2.4 (hazards + diagnostics)
       │         │    ├─ SEG-3.1 (virtual segments)
       │         │    └─ SEG-3.2 (articulation)
       │         └─ SEG-4.1 (invariants)
       │              └─ SEG-4.2 (top-level segment())
       │                   ├─ SEG-4.3 (worker integration)
       │                   └─ SEG-5.1 (doctor checks)
       └─ SEG-1.2 (union-find DS)
            └─ SEG-1.3
```

---

## How to execute

Follow the same workflow as BB-3:

1. Pick the next unblocked card from this file.
2. Implement it on `feat/segmenter` branch.
3. Run `pnpm lint && pnpm test && pnpm build` after each card.
4. Commit with `feat(segmenter): SEG-X.Y — <title>` format.
5. Every 5 commits: sync to staging → main via `/sync-branches`.
6. After PHS4 (SEG-4.3): run the real-staging smoke test and verify the manifest against the known graph stats (1863 nodes, 681 edges → expected ~1000+ segments, ~100 non-singleton, 3+ waves).
