# Migration Segmenter — Design Specification (V3.1 Final)

> **Stage 4 of the migration planner pipeline:** Connect → Extract → Normalize → **Segment** → Disposition → Emit
>
> **Status:** Final — approved for implementation. CTO review rounds 1–6.
>
> **Author:** Engineering · **Date:** 2026-04-12 · **Rev:** 3.1
>
> **Depends on:** Normalize output (`IRGraph` from `@revbrain/migration-ir-contract`)
>
> **Consumed by:** Disposition (next stage), customer-facing Migration Plan document

---

## 1. Purpose

The Normalize stage produces a flat graph (1863 nodes, 681 edges on staging). The Segmenter partitions it into **segments**: groups of semantically coupled nodes that must be **planned as one unit**.

**"Planned as one unit" ≠ "deployed in one API call."** A segment may need multi-step deployment. The Segmenter identifies WHAT travels together; Disposition decides HOW.

---

## 2. Definitions

| Term                | Meaning                                                                                        |
| ------------------- | ---------------------------------------------------------------------------------------------- |
| **Segment**         | Semantically coupled nodes planned as one migration unit.                                      |
| **Strong edge**     | Forces co-location (same segment).                                                             |
| **Ordering edge**   | Forces migration order (prerequisite → dependent) but NOT co-location.                         |
| **Hazard edge**     | Operational coupling — no ordering, no co-location. Produces a `CoordinationHazard`.           |
| **Virtual segment** | Placeholder for a node outside extraction scope. `migrationOrder: -1`. Verified, not deployed. |
| **Migration wave**  | Set of segments at the same topological depth. Can migrate concurrently.                       |

---

## 3. Input contract

Input: `IRGraph`. Reads: `nodes`, `edges`, `metadata.cycleCount`, `irSchemaVersion`. Does NOT read: `referenceIndex`, `orgFingerprint`, `extractedAt`, `quarantine`.

### 3.1 Input validation (zero-trust)

| Check                                                        | Action                                                                                   |
| ------------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| **IV1:** `edge.sourceId` not in nodes                        | Hard error: `DanglingEdgeError`                                                          |
| **IV2:** `edge.targetId` not in nodes                        | If edgeType in `EXTERNAL_ALLOWED`: create virtual segment (§6.7). Otherwise: hard error. |
| **IV3:** Duplicate node IDs                                  | Hard error                                                                               |
| **IV4:** `edge.edgeType` not in `STRONG ∪ ORDERING ∪ HAZARD` | Hard error: `UnclassifiedEdgeTypeError`                                                  |
| **IV5:** `irSchemaVersion` incompatible                      | Hard error                                                                               |

### 3.2 Configuration injection

```typescript
interface SegmenterOptions {
  thresholds?: { largeSegment?: number; heavyWave?: number; maxArticulationHints?: number };
  weights?: Partial<Record<string, number>>;
  authorityScores?: Partial<Record<string, number>>;
}
```

All optional with documented defaults. No magic numbers.

---

## 4. Edge classification (three categories)

### 4.1 Strong edges (same segment)

| Edge type        | Why strong                                            |
| ---------------- | ----------------------------------------------------- |
| `parent-of`      | Parent without children = structurally broken object. |
| `cycle-contains` | Cycle members are inseparable by definition.          |

### 4.2 Ordering edges (prerequisite → dependent direction)

| Edge type                | Graph `src → tgt` | Prerequisite | Dependent  | Rationale                                                                                  |
| ------------------------ | ----------------- | ------------ | ---------- | ------------------------------------------------------------------------------------------ |
| `depends-on`             | A depends-on B    | target seg   | source seg | B must exist before A references it.                                                       |
| `references`             | A references B    | target seg   | source seg | Referenced should exist first.                                                             |
| `calls`                  | A calls B         | target seg   | source seg | Callee compiles before caller.                                                             |
| `uses-formula`           | A uses B          | target seg   | source seg | Formula exists before consumer.                                                            |
| `uses-discount-schedule` | CP uses DS        | target seg   | source seg | Schedule exists before contracted price.                                                   |
| `consumes-variable`      | Rule consumes Var | target seg   | source seg | Variable exists before rule evaluates. Weak (not strong) to avoid gravity well — see §8.7. |

### 4.3 Hazard edges (no ordering, no co-location)

| Edge type  | Why hazard                                                                                      |
| ---------- | ----------------------------------------------------------------------------------------------- |
| `triggers` | Automation disabled during migration. Not a prerequisite. Produces `CoordinationHazard` (§6.6). |

**External-allowed edge types** (may point to nodes outside graph → virtual segments):
`references`, `uses-formula`, `uses-discount-schedule`, `calls`. Structural edges (`parent-of`, `cycle-contains`, `depends-on`) to missing nodes are hard errors — means extraction is incomplete.

### 4.4 Versioning

Classification table versioned with `irSchemaVersion`. New `IREdgeType` requires classification update in the same PR. IV5 ensures fail-fast on mismatches.

---

## 5. Algorithm

### 5.1 Phase 1 — Strong-edge union-find

Union-find over all node IDs. For every strong edge, union source and target. Each component = one initial segment. O(N + E·α(N)).

**Internal representatives:** during Phases 1–2, segments use union-find reps (arbitrary node IDs). Final content-addressable IDs computed in Phase 4 AFTER all merges — avoids hashing membership that's still mutating.

### 5.2 Phase 2 — Segment dependency graph + one-pass SCC

Walk every **ordering edge** (skip hazard edges). For different-segment endpoints: record `prerequisiteRep → dependentRep` with edge-type provenance.

**Run Tarjan SCC exactly once.** For every SCC with size > 1 (ordering cycle between segments): merge all segments in the SCC via union-find. One pass is sufficient — Tarjan finds maximal SCCs, contraction produces a DAG.

```
segDepGraph = directed graph of segment reps
for each ordering edge (src, tgt, edgeType):
  srcRep, tgtRep = find(src), find(tgt)
  if srcRep == tgtRep: skip
  prereq, dep = direction_table(edgeType, srcRep, tgtRep)
  segDepGraph.addEdge(prereq → dep)
sccs = tarjan_scc(segDepGraph)
for each scc where scc.size > 1:
  union(all reps in scc)
  crossSegmentCycleMergeCount++
// Result is a DAG — guaranteed by Tarjan maximality.
```

**Two SCC scopes, no contradiction:** Normalize SCC = structural edges at node level. Segmenter SCC = ordering edges at segment level. Different graphs, different problems.

### 5.3 Phase 3 — Topological sort (waves)

Kahn's algorithm on the (now acyclic) segment DAG. Virtual segments excluded (always wave -1). Deterministic tiebreaker within a wave: `id ASC` (S9).

### 5.4 Phase 4 — Materialize segments + metadata

After all merges: enumerate union-find components, compute final fields.

**Dual-key identity:**

- `id`: content-addressable `seg:<base64url(sha256(stream(sortedMemberIds)))>`. Streaming hash, O(N) memory.
- `persistentId`: root-anchored `pseg:<rootNodeId>`. Stable when leaves change. Disposition keys human decisions here. Drift = same `persistentId`, different `id` → "segment changed, review."

**Wave weighting:** `waveWeights[wave] = sum(segment.weight)`. Heavy wave → `SEG_W003` + `WavePlanHint` (segments sorted by weight desc).

**Product↔BundleStructure diagnostic:** if Product and BundleStructure with matching ProductCode are in separate segments → `SEG_W004`.

**Hazard processing:** walk `triggers` edges → `CoordinationHazard` entries with `fingerprint` for acknowledgment tracking.

**Complexity:** `COMPLEXITY_WEIGHTS = { simple: 1, moderate: 3, complex: 9, unknown: 1 }`. Composite: `base = max(member weights), bump = floor(log2(nodeCount)), score = base + bump`. Bucket: 1–3 simple, 4–6 moderate, 7+ complex.

### 5.5 Phase 5 — Large-segment articulation

For segments > `largeSegment` threshold (default 200): undirected graph of strong edges → Hopcroft–Tarjan articulation points → ranked by largest resulting component size → capped at `maxArticulationHints` (default 20). Stored as `ArticulationHint[]`. Does NOT split.

For extreme segments (>5000 nodes): implementation SHOULD use compact adjacency (CSR/typed arrays) to manage GC pressure.

### 5.6 Root selection (data-driven authority)

Default scores: `CyclicDependency=100, BundleStructure=90, PricingRule=80, DiscountSchedule=70, Product=60, Automation=55, ConfigConstraint=50, others=10`. Overridable via options.

Tiebreakers: most outgoing `parent-of` → zero incoming `parent-of` → lexicographic `id`. Selected AFTER all merges (S15).

---

## 6. Output contract

### 6.1 `SegmentAssignment`

```typescript
interface SegmentAssignment {
  /** node ID → segment ID. Every real node has one entry. Virtual segments have NONE. */
  nodeToSegment: Record<string, string>;
}
```

### 6.2 `Segment`

```typescript
interface Segment {
  id: string; // Content-addressable: seg:<hash>
  persistentId: string; // Root-anchored: pseg:<rootNodeId>
  label: string; // Display: "<rootNodeType>: <rootDisplayName>"
  rootNodeId: string;
  nodeCount: number;
  nodeTypes: string[]; // Sorted unique
  memberNodeIds: string[]; // Sorted
  complexityEstimate: 'simple' | 'moderate' | 'complex';
  weight: number;
  migrationOrder: number; // Wave (0+) or -1 (virtual)
  dependsOn: string[]; // Prerequisite segment IDs
  dependedOnBy: string[]; // Dependent segment IDs
  isIsland: boolean;
  isVirtual: boolean;
  validationConstraints: ValidationConstraint[];
  internalOrderingHints: ArticulationHint[];
}

interface ValidationConstraint {
  type: 'prereq-exists';
  nodeId: string;
  nodeType: string;
  displayName: string;
  edgeType: IREdgeType;
}
// Dedup: (nodeId, edgeType). Sort: (nodeType, displayName, nodeId, edgeType).

interface ArticulationHint {
  nodeId: string;
  nodeType: string;
  largestComponentSize: number;
}
// Sort: (largestComponentSize DESC, nodeId ASC). Cap: maxArticulationHints.
```

### 6.3 `SegmentDependency`

```typescript
interface SegmentDependency {
  prerequisiteSegmentId: string;
  dependentSegmentId: string;
  byEdgeType: Partial<Record<IREdgeType, number>>;
  sampleEdges: Array<{ edgeType: IREdgeType; sourceNodeId: string; targetNodeId: string }>;
  // sampleEdges capped at 5.
}
```

### 6.4 `SegmentManifest`

```typescript
interface SegmentManifest {
  segments: Segment[]; // Sorted: (migrationOrder ASC, id ASC)
  dependencies: SegmentDependency[];
  coordinationHazards: CoordinationHazard[];
  segmentCount: number; // Real + virtual
  realSegmentCount: number;
  virtualSegmentCount: number;
  waveCount: number; // Real segments only (excludes wave -1)
  islandCount: number;
  crossSegmentCycleMergeCount: number;
  crossSegmentDependencyCount: number;
  waveWeights: number[]; // Index = wave, real only
  subWaveHints: WavePlanHint[]; // Only for heavy waves
  sizeHistogram: {
    singleton: number;
    small: number;
    medium: number;
    large: number;
    xlarge: number;
  };
  // Buckets: 1 | 2–5 | 6–20 | 21–200 | 201+. Tests at boundaries.
}
```

### 6.5 `SegmentResult`

```typescript
interface SegmentResult {
  assignment: SegmentAssignment;
  manifest: SegmentManifest;
  runtimeStats: {
    durationMs: number;
    phaseDurations: Array<{ phase: string; durationMs: number }>;
  };
  // runtimeStats EXCLUDED from determinism guarantees.
  diagnostics: SegmentDiagnostic[];
}

interface SegmentDiagnostic {
  code: string;
  severity: 'info' | 'warn' | 'error';
  message: string;
  context?: { segmentIds?: string[]; nodeIds?: string[]; edgeTypes?: string[] };
}
// Sorted: (severity DESC, code ASC, message ASC).
```

**Codes:** `SEG_I001` (>50 nodes), `SEG_I002` (articulation ran), `SEG_I003` (virtual created), `SEG_W001` (zero edges), `SEG_W002` (cycle merged), `SEG_W003` (heavy wave), `SEG_W004` (Product↔BundleStructure orphan), `SEG_E001` (dangling edge), `SEG_E002` (unknown edge type), `SEG_E003` (schema mismatch).

### 6.6 Supporting types

```typescript
interface WavePlanHint {
  wave: number;
  orderedSegmentIds: string[];
  totalWeight: number;
}
interface CoordinationHazard {
  fingerprint: string; // hash(segmentId, relatedSegmentId, edgeType) — for acknowledgment tracking
  segmentId: string;
  relatedSegmentId: string;
  edgeType: IREdgeType;
  description: string;
  sampleEdges: Array<{ sourceNodeId: string; targetNodeId: string }>;
}
```

### 6.7 Virtual external segments

External edges (target not in graph, edge type in `EXTERNAL_ALLOWED`):

1. Create one `VirtualSegment` per unique missing target ID.
2. `id: seg:ext:<base64url(sha256("external:"+targetId))>` (no collision with `seg:` prefix of real segments).
3. `persistentId: pseg:ext:<targetId>`, `migrationOrder: -1`, `isVirtual: true`, `memberNodeIds: []`, `dependsOn: []`.
4. Appears in manifest but NOT in `nodeToSegment`.
5. Also generates `ValidationConstraint` on the dependent real segment.
6. Emit `SEG_I003` per virtual segment.

---

## 7. Invariants (throw on violation)

| ID      | Invariant                                                                                |
| ------- | ---------------------------------------------------------------------------------------- |
| **S0a** | Every `edge.sourceId` resolves to a graph node.                                          |
| **S0b** | Every `edge.targetId` resolves to a graph node OR is external (virtual segment created). |
| **S1**  | Every node has exactly one `nodeToSegment` entry. Count matches `graph.nodes.length`.    |
| **S2**  | Every non-virtual segment ID appears in `nodeToSegment`.                                 |
| **S2v** | Every virtual segment has `memberNodeIds.length === 0` and zero `nodeToSegment` entries. |
| **S2b** | Each real segment's `memberNodeIds` equals the nodes mapped to its ID.                   |
| **S3**  | Every strong edge's endpoints are in the same segment.                                   |
| **S4**  | Cross-segment dependency graph is acyclic after SCC merge.                               |
| **S5**  | `migrationOrder` is valid topological order among real segments.                         |
| **S6**  | Deterministic: same graph + options → same assignment + manifest (excl. runtimeStats).   |
| **S7**  | `sizeHistogram` sums to `realSegmentCount`.                                              |
| **S8**  | `waveWeights.length === waveCount`.                                                      |
| **S9**  | Stable parallel ordering: segments at same depth sorted by `id`.                         |
| **S10** | Every real segment has exactly one `rootNodeId` that is a member.                        |
| **S11** | Virtual segments: `migrationOrder: -1`, empty `dependsOn`, `isVirtual: true`.            |
| **S12** | All `dependsOn`/`dependedOnBy` entries exist in manifest.                                |
| **S13** | All segment `id` values unique.                                                          |
| **S14** | No virtual segment ID in any real segment's `memberNodeIds`.                             |
| **S15** | `label` and `rootNodeId` computed after all merges.                                      |

---

## 8. Edge cases

| Case                            | Behavior                                                                                    |
| ------------------------------- | ------------------------------------------------------------------------------------------- |
| Empty graph                     | Empty manifest, zero segments.                                                              |
| Zero edges                      | All singletons, wave 0. `SEG_W001`.                                                         |
| CyclicDependency nodes          | `cycle-contains` = strong → merged in Phase 1. Segmenter trusts Normalize's structural SCC. |
| Singletons (CMR, PlatformEvent) | ~1000+ singletons. Disposition handles in bulk.                                             |
| Large segments (>200)           | Not split. Articulation hints computed. `SEG_I001` + `SEG_I002`.                            |
| Product↔BundleStructure         | Separate segments (no edge). `SEG_W004` if matching ProductCode. Normalize backlog.         |
| `consumes-variable`             | Ordering (weak) + ValidationConstraint. Avoids gravity well. §8.7.                          |
| Dangling structural edge        | Hard error (extraction incomplete).                                                         |
| Dangling external edge          | Virtual segment (§6.7).                                                                     |

### 8.7 `consumes-variable` rationale

Strong classification → gravity well (50+ rules sharing a SummaryVariable = one mega-segment). The actual safety requirement ("variable must exist before evaluation") is a deploy-time check. Solution: ordering edge + `ValidationConstraint { type: 'prereq-exists' }`. Disposition generates a pre-deploy verification step.

---

## 9. Non-goals

Does not: decide HOW to migrate, generate RCA artifacts, read from Salesforce, mutate IRGraph, infer implicit edges, estimate effort/duration, handle partial graphs.

---

## 10. Package placement

| What                | Where                                                     |
| ------------------- | --------------------------------------------------------- |
| Types               | `packages/migration-ir-contract/src/types/segment.ts`     |
| Algorithm           | `packages/migration-segmenter/src/segment.ts`             |
| Edge classification | `packages/migration-segmenter/src/edge-classification.ts` |
| Authority scores    | `packages/migration-segmenter/src/authority-scores.ts`    |
| Union-find          | `packages/migration-segmenter/src/union-find.ts`          |
| Articulation        | `packages/migration-segmenter/src/articulation.ts`        |
| Tests               | `packages/migration-segmenter/__tests__/`                 |
| Worker integration  | `apps/worker/src/pipeline/run-segment.ts`                 |

Depends on: `@revbrain/migration-ir-contract` + `zod`. Nothing else.

---

## 11. Acceptance tests

| ID  | Test                                                                  | Key invariants |
| --- | --------------------------------------------------------------------- | -------------- |
| T1  | Empty graph → empty manifest                                          | S1, S7         |
| T2  | Single node → 1 singleton, wave 0, island                             | S1, S2, S6     |
| T3  | PricingRule + 2 conds + 1 action → 1 segment, 4 nodes                 | S1, S3         |
| T4  | 2 independent rules → 2 segments, both wave 0                         | S1, S3, S9     |
| T5  | depends-on → 2 segments, wave ordering correct, dependency provenance | S4, S5         |
| T6  | CyclicDependency + 3 members → 1 segment                              | S1, S3         |
| T7  | BundleStructure + 10 opts + 3 feats → 1 segment, 14 nodes             | S1, S3         |
| T8  | Mutual depends-on → SCC merge → 1 segment, `SEG_W002`                 | S4             |
| T9  | Determinism: identical results on same input                          | S6             |
| T10 | Real staging graph → all invariants hold                              | S0–S15         |
| T11 | Unknown edge type → `SEG_E002`                                        | IV4            |
| T12 | Zero edges → all singletons + `SEG_W001`                              | §8             |
| T13 | >50-node segment → `SEG_I001`                                         | §8             |
| T14 | Structural edge to missing node → `SEG_E001`                          | IV2            |
| T15 | `consumes-variable` → ordering + ValidationConstraint                 | §8.7           |
| T16 | Heavy wave → `SEG_W003` + subWaveHints                                | §5.4           |
| T17 | >200-node segment → ArticulationHint[], ranked, capped                | §5.5           |
| T18 | Histogram boundaries: 1, 2, 5, 6, 20, 21, 200, 201                    | S7             |
| T19 | `triggers` → CoordinationHazard, NO ordering                          | §4.3           |
| T20 | External `references` edge → virtual segment                          | §6.7, S11      |
| T21 | Segment IDs unique                                                    | S13            |
| T22 | All dependsOn/dependedOnBy exist in manifest                          | S12            |
| T23 | ValidationConstraints deduped + sorted                                | §6.2           |
| T24 | persistentId stable when leaf added, id changes                       | §5.4           |
| T25 | Product↔BundleStructure orphan → `SEG_W004`                           | §8             |
| T26 | CoordinationHazard fingerprint deterministic                          | §6.6           |
| T27 | Custom options override behavior                                      | §3.2           |
| T28 | Virtual segment ID no collision with real IDs                         | S13, S14       |

---

## 12. Estimated effort: **7.5 days**

| Phase                                                           | Estimate |
| --------------------------------------------------------------- | -------- |
| Contract types                                                  | 0.5 day  |
| Core algorithm (union-find + triple-class + SCC + topo + waves) | 2 days   |
| Metadata (dual IDs, root, complexity, diagnostics, hazards)     | 1.5 days |
| Virtual segments                                                | 0.5 day  |
| Articulation analysis                                           | 0.5 day  |
| Invariants + input validation                                   | 0.5 day  |
| Tests (T1–T28)                                                  | 1.5 days |
| Worker integration                                              | 0.5 day  |

---

## 13. Decisions (all final)

| #   | Decision                                                            | Justification                                                                                   |
| --- | ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| 1   | `consumes-variable` = ordering + ValidationConstraint               | Avoids gravity well.                                                                            |
| 2   | No implicit edge inference                                          | Single source of truth = `graph.edges`.                                                         |
| 3   | Dual-key IDs (content + persistent)                                 | Content: deterministic. Persistent: stable for human decisions. Drift detection via divergence. |
| 4   | Output in memory, persistence = worker                              | Pure function.                                                                                  |
| 5   | Two SCC scopes (Normalize structural, Segmenter ordering)           | No contradiction.                                                                               |
| 6   | Determinism excludes runtimeStats                                   | Durations nondeterministic.                                                                     |
| 7   | Manifest sorted `(migrationOrder, id)`                              | Stable, collision-free.                                                                         |
| 8   | `triggers` = hazard (not ordering)                                  | Automation disabled during migration.                                                           |
| 9   | External edges → virtual segments; structural dangling → hard error | Defensive + graceful.                                                                           |
| 10  | Articulation ranked + capped at 20                                  | Unranked = noise.                                                                               |
| 11  | All thresholds injectable                                           | No magic numbers.                                                                               |
| 12  | One-pass SCC                                                        | Tarjan maximality guarantees DAG.                                                               |
| 13  | Three edge categories (strong/ordering/hazard)                      | `triggers` fits neither strong nor ordering.                                                    |
| 14  | CoordinationHazard fingerprint for ack tracking                     | Hazard without status = noise.                                                                  |
