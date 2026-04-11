# PDF + Graph Mitigation Plan — Decision Log

**Purpose:** Record the 5 CTO sign-off decisions from `docs/PDF-AND-GRAPH-MITIGATION-PLAN.md` §6 + §8, one per question, with full context and the reasoning that led to each choice. Used as the authoritative source when the engineering work starts.

**Last updated:** 2026-04-11

---

## Decision 1 — Architectural thesis: PDF reads from the graph, not from flat findings

**Status:** ❌ **DEFERRED to tech debt.** The change is correct but not now.

**Rationale (user):**

> "we should do the single source of truth but not now, i think we are close enough and we have something that is almost production ready (the assessment doc) so for now we should fix what we have and plan to change this in the future"

**How it will eventually land (user's plan):**
Dual-path migration: when the graph-sourced PDF lands, it will run side-by-side with the current findings-sourced PDF. Both produce a PDF from the same extraction run. Only when the two outputs match byte-for-byte (or with a documented small diff) across multiple real staging runs do we delete the findings-sourced path. This removes all risk of a customer-facing regression during the switchover.

**What this means for the current mitigation plan:**

- Phase 2.1 `requireFinding` primitive still ships (it's inside the existing assembler, not a new path).
- Phase 3 `?? 0` sweep still ships (same reason).
- Phase 4 graph fixes still ship (edges, new IR nodes, new fields, new invariants) — they make the graph ready for the future switchover and they benefit BB-4/5/6 immediately.
- The **adapter layer** (`report-input.ts`) does NOT ship as part of this plan. Added to TECH-DEBT.md as a deferred item.
- The CI lint rule forbidding `findings.find(` in the report path does NOT ship (it would block the current assembler). Revisited when the dual-path work starts.

**Tech debt entry to add to `docs/TECH-DEBT.md`:**

> **Single source of truth: PDF → IR graph (deferred)**
> Impact: PDF assembler currently reads directly from the flat findings array. Any new extraction finding can silently change PDF output (discovered 2026-04-11 when EXT-CC4 added 1565 third-party Apex findings and the PDF grew from 36 to 111 pages). Not a correctness issue on the current well-known flows, but a class of bug the architecture cannot prevent.
> When needed: before BB-4/5/6 start consuming the graph in production.
> Approach: dual-path — run graph-sourced PDF side-by-side with the current findings-sourced PDF until they match, then retire the old path.
> Effort: ~5-7 engineer-days for the adapter + parity testing across 3+ real orgs. Separate from the current plan.

---

## Decision 2 — Phase 1 emergency actions

**Status:** ✅ **APPROVED all five actions, in the suggested order.**

**Rationale (user):** "yes to all"

**The approved order:**

1. **Delete the quarantined shim + its outputs** — `rm enrich-and-generate.ts + assessment-report-v2.1.{pdf,html}`. Zero dependencies, immediate win, closes audit Finding 1.
2. **Rename "synthetic summary findings" → "aggregate summary rows"** in assembler comments. 5-minute edit, removes a dangerous word from the codebase.
3. **Add CI guards** (grep-based lint rules):
   - Forbid `Math.random` in `apps/worker/src/report/` + `apps/worker/scripts/*report*.ts`.
   - Forbid `findings.push(` in any script under `apps/worker/scripts/` matching `*report*.ts` (would have blocked the shim at commit).
   - Forbid `renderPdf` imports outside `apps/worker/scripts/generate-report.ts`.
4. **Fix EXT-CC4 at the collector source** — emit `artifactType: 'ThirdPartyPackagedApexClass'` instead of `'ApexClass'`. Add to `NOT_MODELED_V1_TYPES`. Add a summary-by-namespace builder in the report layer (per Decision "Third-party Apex C+D") and a `showThirdPartyApexDetail` config flag for internal diagnostic mode. Full test cycle: unit tests → staging extraction → BB-3 normalize → PDF regeneration → byte-compare PDF page count against expected ~37-40.
5. **Regenerate + ship the corrected PDF** (blocked on action 4 completing).

**Stop condition:** if action 4's tests fail against real staging, stop and report back. No "fix through" the failure.

**Out of scope for Phase 1:** `requireFinding` primitive, `?? 0` sweep, Stage 4 edge fix, new IR node promotions, any PDF content redesign.

**Estimated effort:** ~4-5 hours total in one working session.

---

## Decision 3 — PDF format: 11-section-with-bounds or 4-section redesign

**Status:** ✅ **Keep 11 sections as-is. Add §D.1 Active CPQ Plugins & Custom Scripts as the ONE new content item. Do NOT add general MAX_APPENDIX_ROWS_PER_CATEGORY bounds. Do NOT put the 4-section redesign in tech debt.**

**Rationale (user):**

> "keep 11 section as is and add the plugin appendix, in any case the design is the customer request and currently this is the format he wishes to recieve"

**Key context:** the 11-section format is NOT an internal design choice — it's a **customer requirement**. The customer explicitly requested this layout. That locks the format regardless of engineering opinions about what's easier for a CTO to skim. The 4-section redesign I proposed in the plan is NOT a deferred item; it's rejected by the customer contract unless the customer changes their mind.

**What this means concretely:**

1. **All 11 existing sections unchanged.** §1 Scope & Methodology through §10 Related Functionality plus Appendices A/B/D all stay in their current shape.
2. **Add §D.1 Active CPQ Plugins & Custom Scripts** as a new sub-appendix under §9 Custom Code & Automation Inventory. This is the ONE content addition. Sourced from the IR graph via a small per-section adapter function (not a general adapter layer). Shows the 7 plugin-implementing Apex classes with interface names + LOC + active/registered status, and the 5 QCP scripts with names + sizes + parseStatus.
3. **No general table bound.** The known bloat (1565 third-party Apex rows in §9.1) is fixed at the source in Decision 2 action 4 — the collector emits a distinct artifactType, so the report's `get('ApexClass')` naturally reverts to customer-namespace-only. Once that lands, every category in the current report is under 20 items anyway. A generalized `MAX_APPENDIX_ROWS_PER_CATEGORY` is future-proofing for a problem we don't have.
4. **4-section redesign is OUT, not deferred.** Customer has set the format. Don't add it to tech debt as a "someday" item. If the customer ever asks for a different format in the future, that becomes a new project with a new customer conversation.

**Why the §D.1 appendix is the one exception to "don't add content":**

- The data already exists in the IR (shipped in EXT-1.1, verified end-to-end against real staging).
- The current PDF cannot see it — customer gets a generic "QCP active" line without the class name, interface, or body reference.
- It's ~30-50 lines of new renderer code sourced from the IR via a small adapter function for this one section.
- Without it, the plugin data my branch extracted is invisible in the customer-facing report — which undermines the entire EXT-1.1 work.
- **Bounded at 20 rows by construction** (there are only 7 plugin Apex classes + 5 QCP scripts = 12 total on this org). The bound is content-inherent, not a generic cap.

---

## Decision 4 — Phase 4.1 Stage 4 edge resolution (graph correctness)

**Status:** ✅ **Promoted to BLOCKER. Runs second (after Phase 1). No time box. Add I4/I5/I6 graph-structure invariants + bb3-doctor C8 check.**

**Rationale (user):**

> "i think we definitely need to fix that, the graph should look and act like a graph and should be validated the edges and nodes are correct and that the pointers are correct — if it is not the case it is a real problem"

**Key framing change:** this is NOT an investigation task that slips. It's a **structural correctness defect**. A graph with 3102 nodes and 0 edges is not a graph. The §8.3 lesson (acceptance tests passing on structurally-broken data) applies directly: current BB-3 invariants I1/I2/I3 all pass on a zero-edge graph because they only check conservation, distinctness, and health — none of them check whether the graph is actually a graph. Same class of defect as the silent identity collisions in wave 1, same severity, same fix pattern (make the invariant executable).

**Revised sequencing:**

```
Day 1        — Phase 1 (corrected PDF, shim delete, CI guards, EXT-CC4 fix)
Day 2-N      — Phase 4.1 Stage 4 edge resolution + I4/I5/I6 invariants. BLOCKER. No time box.
Day 2-N+1+   — Phase 3 (?? 0 sweep) + Phase 4.2/4.3/4.4 (new IR nodes, new fields)
```

**Concrete scope for Phase 4.1:**

1. **Diagnosis script** at `apps/worker/scripts/diagnose-graph-edges.ts` — dumps per-node NodeRef field values (raw + resolution state) for the real staging run, classifies unresolved refs into ("empty field", "target not in index", "nodeType mismatch", "silently dropped"). Produces a one-page diagnosis report in one run instead of four debugging sessions. Time-boxed at ~4 hours.
2. **Root-cause fix at the lowest correct layer** — collector emits parent pointers, OR normalizer populates NodeRef fields, OR descriptor table extends, OR resolver stops silently dropping. Whichever layer is actually broken gets fixed. No time box on the fix itself.
3. **New invariants** in `packages/bb3-normalizer/__tests__/invariants/graph-structure.test.ts`:
   - **I4 Edge Non-Emptiness** — if input findings contain parent-child relationships, output graph MUST have edges. Empty edges[] on a non-trivial finding set is a hard fail.
   - **I5 Pointer Resolution Completeness** — every `NodeRef` field on every node is either resolved (points to an existing node id) or explicitly marked `{ resolved: false, reason: ... }`. Silent undefineds fail.
   - **I6 Graph Connectivity** — at least 50% of non-singleton nodes have ≥ 1 edge on the staging snapshot. A graph where 99% of nodes are isolated is a structural defect.
4. **bb3-doctor C8 check** — the existing skill gains a new class: "graph has edges or fail loudly". Any BB-3 ship-it producing `edges.length === 0` on a non-trivial finding set fails the doctor check.
5. **Pause-and-decide point** — after the diagnosis step (end of day 2 hour 4), if the fix looks bigger than 3 days, pause and decide together: go deep on all edge types, or carve off the minimum viable subset (e.g. just plugin → field edges for §D.1, other edge types later).

**Parallelism:** Phase 4.1 runs BEFORE Phase 3 sequentially, because without edges the rest of the downstream architecture is broken. But Phase 4.2/4.3/4.4 (new IR nodes, new fields, new invariants) can run AFTER Phase 4.1 + parallel with Phase 3 since they touch different files.

**Consequences for BB-4/5/6 readiness:**
Once Phase 4.1 lands, BB-4 segmentation has a connected graph to partition, BB-5 disposition can traverse dependencies, BB-6 RCA emission can walk the graph. The §D.1 plugin appendix gains "fields this plugin reads" detail from the new plugin → FieldRef edges.

---

## Decision 5 — Phase 3 sweep bundling strategy

**Status:** ✅ **Option C — per-section commits with a classification-first pass.**

**Rationale (user):** "option c like you suggested"

**Concrete plan:**

1. **Classification pass (first commit, ~4 hours):** build `apps/worker/src/report/require-finding.catalog.ts` listing all 105 `?? 0` / `?? ''` / `?? 'Unknown'` sites with their classification: `required` (absence = hard error), `optional-explicit` (absence = section suppression), or `legitimately-zero` (with a justifying comment). Ships as a standalone commit BEFORE any migration code. This is the forest-view that prevents whack-a-mole.

2. **Per-section migration commits (~10-12 total):** one commit per assembler section, each ~10 sites, ~200 lines of diff. Each commit follows the same shape:
   - Migrate all `?? 0` sites in that section to `requireFinding` / `optionalFinding`.
   - Add a focused test `assembler-<section>-partial.test.ts` covering full AND partial extraction scenarios (usage collector missing, catalog collector missing, etc.).
   - Update the catalog to mark the section as migrated.
   - Commit message includes site count + classification breakdown.

3. **Final commit:** wire the `bb3-doctor` C8 check (audit M-9). Any new `?? 0` in the report path fails the doctor immediately. Locks the pattern out permanently.

4. **Do NOT bundle with §D.1 plugin appendix.** The plugin appendix has different dependencies (it needs Phase 4 graph fields). Both ship independently on their own schedule through normal `/ship-it` → `/sync-branches` flow.

5. **Do NOT bundle with bounded-table work.** Decision 3 rejected generalized `MAX_APPENDIX_ROWS_PER_CATEGORY`; including it here would be unrequested work.

**Why this shape:**

- Review fatigue is the real risk on a 5-day internal hygiene refactor. Per-section commits with focused tests give reviewers a concrete demoable outcome per commit instead of "yet another silent-fallback fix".
- Classification up front prevents whack-a-mole.
- Partial-extraction tests are the invariant that makes this worth doing. Without them, the sweep is cosmetic; with them, it's a correctness upgrade that catches collector failures at render time.
- Independent shipping of §D.1 and bounded tables keeps each deliverable on its own critical path.

---

## All 5 decisions made — execution starts now

Phase ordering (final):

```
Day 1        — Phase 1 emergency actions (this document's execution, starts now)
Day 2-N      — Phase 4.1 Stage 4 edge resolution (BLOCKER, no time box)
Day 2-N+1+   — Phase 2 (requireFinding primitive)
             — Phase 3 (?? 0 sweep, per-section + classification-first)
             — Phase 4.2/4.3/4.4 (new IR nodes, new fields, new invariants)
             — §D.1 plugin appendix (depends on Phase 4 graph fields)
```

Deferred to `docs/TECH-DEBT.md`:

- Single source of truth: PDF → IR graph (dual-path migration, ~5-7 eng-days, separate project)

Rejected (not deferred, not reconsidered):

- 4-section PDF redesign (customer has locked the 11-section format)
- Generalized `MAX_APPENDIX_ROWS_PER_CATEGORY` cap (known bloat fixed at source)

---

## Already-decided (from prior messages)

### Third-party Apex handling — Option C + D

**Status:** ✅ Decided (before the formal decision log started)

**Answer:** Collector emits third-party Apex with a distinct `artifactType`, report shows a per-namespace summary by default (one row per managed package, not one row per class), with a `showThirdPartyApexDetail` config flag for internal diagnostic mode that expands every class.

**Rationale (user):**

> "we have the data we present only the summary, we can make this configurable to also show 3rd party"

**Consequence:** PDF reverts from 111 pages to ~37-40 pages on the default path. Internal runs can still get the full per-class detail when needed.
