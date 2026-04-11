# CPQ Extraction — Coverage Closure Task Cards

> **Companion to:** [CPQ-EXTRACTION-COVERAGE-GAPS.md](./CPQ-EXTRACTION-COVERAGE-GAPS.md) (**v1.1**)
> **Purpose:** The executable shard of the gaps doc. Every gap becomes one or more task cards sized for a single AI-agent invocation. Cards mirror the format used by [MIGRATION-PLANNER-BB3-TASKS.md](./MIGRATION-PLANNER-BB3-TASKS.md): self-contained, pinned to specific gap-doc sections, with explicit acceptance criteria and test plans.
> **Tasks doc version:** 1.0
> **Last updated:** 2026-04-11
> **Scope:** Closes the extraction-side gaps in `apps/worker/src/collectors/`. Does NOT change the assessment PDF surface (`apps/worker/src/report/`) — that's tracked separately. Does NOT change the BB-3 normalizer (`packages/bb3-normalizer/`) — those gaps closed in Wave 1 §8.3.

---

## 0. Status snapshot

**Where we are:** The worker reliably extracts the dominant CPQ artifacts (configuration objects, JS QCP source, customer Apex source, CPQ flow inventory, custom settings with hierarchy, integration metadata). After the BB-3 §8.3 fix, 250 of 250 staging findings round-trip into the IR. The extraction surface itself, however, has 7 known Tier-1 silent-miss classes and 6 cross-cutting hygiene issues that the [v1.1 audit](./CPQ-EXTRACTION-COVERAGE-GAPS.md) enumerates.

**What this doc tracks:** 22 task cards across 5 phases, sized for ~14.75 engineer-days of Tier-1 closure plus ~7 days of Tier-2 backlog. Phases are designed so each phase can ship + be validated in isolation, mirroring the BB-3 wave structure.

**What this doc does NOT track:**

- BB-3 normalizer changes (those are in BB3-TASKS.md).
- PDF report changes (a separate doc captures which gap closures should _eventually_ surface in the PDF — see §6 below).
- Tier 2 / Tier 3 backlog items unrelated to migration risk (translation workbench, field history, big object archives) — those land in TECH-DEBT.md after Phase E4.

### Phase rollup

| Phase                                        | Cards | Effort      | Status         | Goal                                                                               |
| -------------------------------------------- | ----- | ----------- | -------------- | ---------------------------------------------------------------------------------- |
| **PHE0 — Foundation hygiene**                | 2     | ~0.75 day   | 🔴 not started | Truncation discipline + test-class filtering — preconditions for body extraction   |
| **PHE1 — Cheap classification wins**         | 3     | ~1 day      | 🔴 not started | Apex plugin classification + plugin activation + template script uncap             |
| **PHE2 — Body extraction (existing types)**  | 3     | ~4.25 days  | 🔴 not started | Validation rule formulas + CMT records + Flow XML — uses existing collectors       |
| **PHE3 — New collector (component bundles)** | 4     | ~3 days     | 🔴 not started | LWC + Aura + VF + Static Resources via a new `components.ts` collector             |
| **PHE4 — Cross-cutting and Tier 2**          | 10    | ~6.75 days  | 🔴 not started | FLS introspection, dynamic dispatch detection, packaged extensions, Tier-2 backlog |
| **Total**                                    | 22    | ~15.75 days | —              | Closes all Tier-1 silent misses + the cross-cutting hygiene issues                 |

### How to continue

Same workflow as BB-3: `/bb3-next` style picking (pick the next unblocked card from the lowest phase), implement, `/ship-it`, `/sync-branches` at phase boundaries. Cards in the same phase can be parallelized when their `Depends on` lists are empty. All extraction work happens on a feature branch (`feat/extraction-coverage` — separate from BB-3 wave branches because the surfaces don't overlap).

### Non-negotiables (apply to every card)

1. **No silent data loss.** Any truncation must set a flag (CC-6). Any skipped artifact must increment a counter on `metrics`. Any failed query must populate `warnings`.
2. **Body extraction must be gated** by `config.codeExtractionEnabled` so the worker can be configured to skip code blobs in privacy-sensitive deployments.
3. **No new wall-clock dependencies in finding output.** Per BB-3 §6.2 — anything that flows into `IRGraph` must be deterministic. Wall-clock telemetry is allowed in `metrics` (sidecar), not in `evidenceRefs`.
4. **Per-card SOQL changes must be backed by a Tooling-API or describe-cache check** before issuing a wide query. The v1.1 audit caught 6 illegal SOQL constructs in the original gaps doc — defensive verification is mandatory before adding any new SF query.
5. **Every new finding type must be picked up by the BB-3 normalizer registry** (`packages/bb3-normalizer/src/normalizers/register-all.ts`) — either with a real normalizer or with an explicit `not-modeled-v1` entry. This is the lesson from §8.3: silent fall-through to UnknownArtifact is always a bug.

### Card anatomy

```
### EXT-X.Y — Title
Goal:          One sentence.
Phase:         PHE0 / PHE1 / PHE2 / PHE3 / PHE4
Depends on:    [list of card IDs that MUST be merged first]
Gap-doc ref:   §X.Y in CPQ-EXTRACTION-COVERAGE-GAPS.md
Effort:        S (≤ 2h), M (2-6h), L (6-12h), XL (12-24h)
PDF-relevant:  Yes / No — does this gap closure feed information the human PDF reader would benefit from?

Files:             Paths to create / modify
Implementation:    3-5 bullets
Acceptance:        Checklist of testable conditions
Test coverage:     unit | integration | property | e2e | smoke | lint
Out of scope:      What NOT to do
```

---

## 1. Phase E0 — Foundation hygiene

> **Why first:** these two cards are zero-risk, ~0.75 day combined, and they unblock every body-extraction card in PHE2 and PHE3. Doing them after the body extractors would force a round-2 retrofit. Doing them first means every new collector is built on top of the right primitives.

### EXT-CC6 — Truncation discipline utility

Goal: Replace four ad-hoc `.slice(0, N)` calls with a single utility that flags every truncation in `evidenceRefs` so the BB-3 layer can detect partial bodies.
Phase: PHE0
Depends on: none
Gap-doc ref: §7 CC-6
Effort: S (~0.5 day)
PDF-relevant: **Yes** — the PDF should eventually show "(content truncated)" badges on findings whose body was capped.

Files:

- Create `apps/worker/src/lib/truncate.ts` — the new utility.
- Create `apps/worker/src/lib/truncate.test.ts` — unit tests.
- Modify [`apps/worker/src/collectors/dependencies.ts`](../apps/worker/src/collectors/dependencies.ts) line 119 (Apex `code-snippet` evidenceRef).
- Modify [`apps/worker/src/collectors/pricing.ts`](../apps/worker/src/collectors/pricing.ts) line 380 (QCP body slice).
- Modify [`apps/worker/src/collectors/templates.ts`](../apps/worker/src/collectors/templates.ts) lines 304-305 + 311 (template script + evidence snippet).

Implementation:

- Export a single function `truncateWithFlag(value: string, maxBytes: number): { value: string; wasTruncated: boolean; originalBytes: number }`. The function uses `Buffer.byteLength(value, 'utf8')` for the size check (not `.length`, which is char count) so multi-byte content isn't silently mistruncated.
- Where the truncation site currently lives in an `evidenceRefs` entry, add a sibling field on the same ref: `truncated: true` and `originalBytes: <number>` when applicable.
- For `textValue` truncation sites (only PHE2 / PHE3 will introduce these), the same utility is used and the per-finding `notes` gets a one-line `(textValue truncated from N bytes to M)` annotation.
- Default cap stays at the existing values in each call site. This card is purely refactor — semantic behavior is unchanged.

Acceptance:

- [ ] All four call sites use `truncateWithFlag`.
- [ ] Each truncation adds `truncated: true` to the produced evidenceRef.
- [ ] Unit test asserts the function flags correctly for: (a) under-cap input, (b) at-cap input, (c) over-cap multi-byte input.
- [ ] `pnpm --filter @revbrain/worker test` is green.
- [ ] grep `\.slice\(0, [0-9]+\)` across `apps/worker/src/collectors/` returns only the four (now-utility-wrapped) sites.

Test coverage: **unit** (the helper) + **lint** (a grep guard added to the existing lint script that fails the build if a new `.slice(0, N)` appears in the collectors dir).

Out of scope: removing the truncation cap entirely (that's EXT-1.5 — needs a spill-to-storage design first).

---

### EXT-CC2 — Apex test class filtering

Goal: Stop counting `@isTest` Apex classes against `cpqRelatedApexClasses` and `cpqApexLineCount`. Emit them as a separate finding type so they're still accounted for but don't pollute the migration metrics.
Phase: PHE0
Depends on: none
Gap-doc ref: §7 CC-2
Effort: S (~0.25 day)
PDF-relevant: **Yes** — the report's "47 Apex classes" line is currently inflated by test classes that don't migrate. After this fix the count is honest.

Files: [`apps/worker/src/collectors/dependencies.ts`](../apps/worker/src/collectors/dependencies.ts) lines 60–145.

Implementation:

- Detect `@isTest\b` (case-insensitive, word boundary) in the body OR a class-level `@IsTest` annotation. Set `isTestClass: true` on the finding.
- When `isTestClass`, set `findingType: 'apex_test_class'` (not `apex_cpq_related`), `migrationRelevance: 'optional'`, and exclude from the `cpqApexClasses++` counter.
- Add `metrics.testClassCount` so the test-class population is still tracked.
- Add a property test in `dependencies.test.ts` that asserts a body containing `@isTest` produces a test-class finding with the right counters.

Acceptance:

- [ ] Test classes do not increment `cpqRelatedApexClasses`, `cpqApexLineCount`, or `triggerControlCount`.
- [ ] Test classes still appear in findings (so BB-3 can normalize them) but with `findingType: 'apex_test_class'`.
- [ ] `metrics.testClassCount` is populated.
- [ ] Unit test passes.
- [ ] `pnpm --filter @revbrain/worker test` is green.

Test coverage: **unit**.

Out of scope: classifying test classes by what they exercise (e.g. "tests the QCP plugin"). Pure isTest gating only.

---

## 2. Phase E1 — Cheap classification wins

> **Why now:** these three cards reclassify or expand bodies the worker already has; no new SF queries, no new collectors. They're each ≤ 0.5 day and produce immediate report-quality jumps.

### EXT-1.1 — Apex CPQ plugin interface classification

Goal: Detect `implements (SBQQ|sbaa).*PluginInterface` in extracted Apex bodies and emit a separate `cpq_apex_plugin` finding type so the report (and BB-3) can answer "which Apex class IS the active QCP?"
Phase: PHE1
Depends on: EXT-CC2 (so test classes are already filtered out before classification runs)
Gap-doc ref: §5 Gap 1.1
Effort: S (~0.5 day)
PDF-relevant: **Yes** — the PDF could eventually surface "Active Quote Calculator Plugin: AcmePricingPlugin.cls (340 LOC, references 12 fields, uses TriggerControl)".

Files:

- [`apps/worker/src/collectors/dependencies.ts`](../apps/worker/src/collectors/dependencies.ts) lines 60–145.
- New constant in [`apps/worker/src/collectors/base.ts`](../apps/worker/src/collectors/base.ts) or a sibling: `CPQ_PLUGIN_INTERFACES` map of `interfaceName → { rcaTargetConcept, rcaMappingComplexity }`.

Implementation:

- After the existing body fetch, run a deterministic regex `/\bimplements\s+((?:SBQQ|sbaa)\.[A-Za-z_][A-Za-z0-9_]*(?:PluginInterface|Condition|ChainCustomCondition))\b/` against the body. Multiple matches (rare but legal) all get captured.
- For each detected interface, emit an additional finding with `findingType: 'cpq_apex_plugin'`, `interfaceName` on `evidenceRefs[0]`, and `rcaTargetConcept` / `rcaMappingComplexity` from the static map.
- The original `apex_cpq_related` finding still emits — the plugin finding is **additional**, not a replacement, so back-compat is preserved and the BB-3 normalizer can join them by `artifactId`.
- Static map of interface → mapping complexity lives in worker config (not in `@revbrain/contract`) because BB-3 must stay RCA-neutral per spec §2.4.
- BB-3 registry update: add a new normalizer routing for `findingType === 'cpq_apex_plugin'` (or extend the existing ApexClass normalizer to recognize the new finding type) — the plugin classification IS identity-bearing.

Acceptance:

- [ ] An Apex body containing `class Foo implements SBQQ.QuoteCalculatorPluginInterface { ... }` produces TWO findings: one `apex_cpq_related` (existing) and one `cpq_apex_plugin` (new).
- [ ] The new finding has `interfaceName: 'QuoteCalculatorPluginInterface'` (or full namespaced name) on its evidence ref.
- [ ] A class implementing two interfaces produces two `cpq_apex_plugin` findings.
- [ ] BB-3 normalizer registry has a route for `cpq_apex_plugin` and downstream property tests confirm distinct plugin findings produce distinct nodes.
- [ ] `pnpm --filter @revbrain/worker test` and `pnpm --filter @revbrain/bb3-normalizer test` are both green.

Test coverage: **unit** (regex), **integration** (BB-3 register-all picks it up), **property** (distinctness invariant on the new finding type).

Out of scope: tree-sitter Apex parsing. Pure regex is sufficient for the classification step. Tree-sitter is reserved for the QCP AST work in BB-3b per spec §14.4.

---

### EXT-1.2 — Plugin registration / activation resolution

Goal: After settings collector runs, walk the CPQ "Plugins tab" custom settings and mark the matching Apex / QCP finding as `isActivePlugin: true`. Currently no cross-link exists.
Phase: PHE1
Depends on: EXT-1.1
Gap-doc ref: §5 Gap 1.2
Effort: M (~1 day)
PDF-relevant: **Yes** — pairs with EXT-1.1 to give "Active QCP" surface area in the report.

Files:

- New file `apps/worker/src/collectors/plugin-activation.ts` — runs after the settings + dependencies collectors.
- New constant: a per-CPQ-version map `(settingsObject, fieldApiName) → pluginInterfaceName`. Lives in this file. Versioned against `metrics.cpqPackageVersion` per OQ-3.
- Modify [`apps/worker/src/pipeline.ts`](../apps/worker/src/pipeline.ts) to invoke `plugin-activation` after `settings` and `dependencies` complete (it's a join-collector, not an extract-collector, so it doesn't fit the existing collector registry — wire it directly).

Implementation:

- Catalog the ~20 plugin-registration fields across `SBQQ__Plugin__c` and any related settings objects. This requires one-time research against a real CPQ org; check the v1 of the CPQ Reference Guide for the canonical list.
- For each non-null setting value (the field stores the API name of the active class), find the matching `cpq_apex_plugin` finding and set `isActivePlugin: true` on its `evidenceRefs[0]`. Also set `migrationRelevance: 'must-migrate'` and bump `riskLevel` to `'high'` since active plugins are always migration-blocking.
- For each registration field that's null, emit a finding `findingType: 'cpq_plugin_unset'` with `notes: 'Standard CPQ implementation in use for <interfaceName>'` so the absence is positively asserted (G1: every input is accounted for).
- The CPQ-version-aware part: the field-name map is keyed by major CPQ version. If the detected `cpqPackageVersion` doesn't match any known map version, emit a degraded warning and use the latest map but flag findings with `confidenceLevel: 'low'`.

Acceptance:

- [ ] An org with `SBQQ__Plugin__c.SBQQ__QuoteCalculator__c = 'AcmePricingPlugin'` produces a finding for `AcmePricingPlugin` with `isActivePlugin: true`.
- [ ] An org with the same setting null produces a `cpq_plugin_unset` finding for `QuoteCalculatorPluginInterface`.
- [ ] Activation runs AFTER settings + dependencies in `pipeline.ts`.
- [ ] If `cpqPackageVersion` is unknown, the activation collector emits a `degraded` warning but does not fail.
- [ ] Per BB-3 normalizer: a finding with `isActivePlugin: true` produces a node whose `migrationRelevance` is `must-migrate`.

Test coverage: **unit** (the cross-link logic), **integration** (run against a fixture with both active and unset plugins).

Out of scope: dynamic dispatch detection (`Type.forName` resolution) — that's EXT-CC3. Plugin activation only handles the static registration table.

---

### EXT-1.5 — Quote template script uncap

Goal: Remove the silent 2,000-character cap on quote template `<script>` blocks. Use the truncation utility from EXT-CC6 with a much larger cap (initially 100 KB) and flag if hit.
Phase: PHE1
Depends on: EXT-CC6
Gap-doc ref: §5 Gap 1.5
Effort: S (~0.25 day)
PDF-relevant: **No** — the PDF already says "JavaScript in template detected"; the body matters only to BB-3 + BB-4.

Files: [`apps/worker/src/collectors/templates.ts`](../apps/worker/src/collectors/templates.ts) lines 304–305 and 311.

Implementation:

- Replace `scripts.join('\n---\n').slice(0, 2000)` with `truncateWithFlag(scripts.join('\n---\n'), 102_400)`.
- The 100 KB cap is from gaps-doc OQ-2. Anything larger triggers the spill-to-storage pattern from EXT-1.7's components collector — for now, just flag and continue (graceful degradation).
- Update the `notes` field to include the truncation status when truncated.
- Do NOT remove the truncation entirely until the spill pattern lands (EXT-1.7).

Acceptance:

- [ ] Template scripts up to 100 KB are extracted in full.
- [ ] Scripts > 100 KB are flagged with `truncated: true` in the evidenceRef + a note.
- [ ] `evidenceRefs[0]` snippet (the 500-char preview) keeps its existing behavior but uses the same `truncateWithFlag` so it's also flagged.

Test coverage: **unit** (with synthetic 50 KB and 200 KB script bodies).

Out of scope: object-storage spill (EXT-1.7 introduces it).

---

## 3. Phase E2 — Body extraction (existing types)

> **Why grouped:** these three cards add `Metadata` body fetches via the Tooling API two-phase pattern (enumerate IDs → batched chunked fetch) that the v1.1 audit landed on. Doing them together means the chunked-fetch helper is shared.

### EXT-1.4 — Validation rule formula bodies

Goal: Fetch `Metadata.errorConditionFormula` for every CPQ-related ValidationRule and store it in `textValue`. Currently only the rule names + active flag are extracted; the misleading code comment claiming "formulas preserved for LLM" is corrected.
Phase: PHE2
Depends on: EXT-CC6
Gap-doc ref: §5 Gap 1.4
Effort: M (~0.75 day)
PDF-relevant: **Yes** — enables "12 of 25 validation rules reference renamed RCA fields" which is a real migration-risk surface.

Files:

- [`apps/worker/src/collectors/customizations.ts`](../apps/worker/src/collectors/customizations.ts) lines 146–194.
- New helper `apps/worker/src/salesforce/tooling-metadata-fetch.ts` (shared by EXT-1.4 + EXT-1.6).
- Fix the misleading comment at `customizations.ts:8`.

Implementation:

- Keep the existing bulk enumerate query (`SELECT Id, ValidationName, Active, Description FROM ValidationRule WHERE EntityDefinition.DeveloperName = '<obj>'`).
- Add a second pass: chunk the collected IDs into groups of **10** (the conservative end of the v1.1 fix's 10–25 range — favoring stability over throughput) and issue `SELECT Id, Metadata FROM ValidationRule WHERE Id IN ('<id1>', ..., '<id10>')` per chunk.
- Per chunk: parse `record.Metadata.errorConditionFormula`. Set `textValue` (gated by `codeExtractionEnabled`).
- Parse field references from the formula using the same regex as the existing formula-fields collector (`SBQQ__\w+__c|[A-Z][A-Za-z0-9_]+\.[A-Z][A-Za-z0-9_]+__r`). Surface them in `evidenceRefs` as `field-ref` entries.
- Truncate via `truncateWithFlag` if the formula > 32 KB (validation rules don't normally exceed this, but defensive).
- Surface a `metrics.validationRulesWithFormulaBody` counter so we can verify the round-trip in tests.
- New helper `tooling-metadata-fetch.ts`: takes `(objectName, ids[], chunkSize)`, returns `Map<id, metadata>`. Handles retries, deduplication, and rate-limiting via the existing throttle module. EXT-1.6 will reuse this helper.

Acceptance:

- [ ] After running, every `ValidationRule` finding has `textValue` populated (when `codeExtractionEnabled`).
- [ ] `evidenceRefs` includes `field-ref` entries for every field name parsed out of the formula.
- [ ] Bulk enumerate query is unchanged; the new chunked query is added as a second pass.
- [ ] Chunking helper has unit tests for: (a) zero IDs, (b) fewer than chunk size, (c) exactly chunk size, (d) multiple chunks, (e) one chunk failing while others succeed (continues, surfaces warning).
- [ ] The misleading comment at line 8 is fixed.
- [ ] `metrics.validationRulesWithFormulaBody === metrics.totalValidationRules` for an org where all VRs are reachable.
- [ ] `pnpm --filter @revbrain/worker test` is green.

Test coverage: **unit** (chunking helper), **integration** (full collector run against a synthetic org with 30 ValidationRules, asserting 3 chunks of 10).

Out of scope: validation rule message catalog extraction (separate Tier 2 item). Cross-object validation analysis (BB-4 territory).

---

### EXT-1.3 — Custom Metadata Type record extraction

Goal: For each discovered CMT type, extract its actual records via the dynamic-describe → explicit-field-list pattern from the v1.1 fix. Currently only type names are captured; the records (which often hold rules-engine config) are silently absent.
Phase: PHE2
Depends on: EXT-CC6
Gap-doc ref: §5 Gap 1.3
Effort: L (~1.5 days)
PDF-relevant: **Yes** — enables "12 CMT types containing 4,387 records — 3 types appear to be DecisionTable candidates".

Files:

- [`apps/worker/src/collectors/customizations.ts`](../apps/worker/src/collectors/customizations.ts) lines 114–139.
- Use the existing `restApi.describe()` from `apps/worker/src/salesforce/rest.ts`.

Implementation:

- For each CMT type returned by the existing enumerate query, call `this.ctx.restApi.describe('<TypeName>__mdt', this.signal)` to get the field list.
- Filter to **explicit user fields** (skip `Id`, `IsDeleted`, `SystemModstamp`, `CreatedBy`, etc.) to keep query width sensible. Always include `Id`, `DeveloperName`, `MasterLabel`.
- Build an explicit `SELECT Id, DeveloperName, MasterLabel, <field1>, <field2>, ... FROM <TypeName>__mdt LIMIT 5000` query. Explicit field lists have NO 200-row cap (the 200-row cap is `FIELDS(STANDARD)`-only).
- Cap per-type at 5,000 records (configurable via `config.cmtRecordCap`). If hit, add a `truncated` warning.
- Heuristic classification: if a CMT type has > 10 records AND has fields named like `Active__c`, `Sequence__c`, `Condition__c` (case-insensitive contains match), set `rcaTargetConcept: 'DecisionTable candidate'` and `complexityLevel: 'high'` on the per-type finding.
- Emit one finding per CMT **type** (existing) PLUS one finding per CMT **record** with `findingType: 'custom_metadata_record'` and the record's serialized values in `evidenceRefs`.
- Cache the describe results in `ctx.describeCache` so a re-run doesn't re-describe the same type.
- BB-3 normalizer registry update: add a route for `findingType === 'custom_metadata_record'` so records become individual `CustomMetadataTypeIR` nodes (or a new node type if the spec calls for it).

Acceptance:

- [ ] An org with 12 CMT types and 4,387 total records produces 12 type findings + 4,387 record findings (modulo the per-type cap).
- [ ] CMT types matching the rules-engine heuristic are tagged `rcaTargetConcept: 'DecisionTable candidate'`.
- [ ] Per-type capping works: a 6,000-record type produces 5,000 findings + 1 truncation warning.
- [ ] All explicit `SELECT` queries pass — no `FIELDS(STANDARD)`, no `*`, no `LIMIT > 200` with `FIELDS()`.
- [ ] BB-3 normalizer produces N distinct nodes for N distinct CMT records (per the §8.3 distinctness invariant).
- [ ] `pnpm --filter @revbrain/worker test` is green.

Test coverage: **unit** (the field-list construction), **integration** (full collector run against a synthetic org with multiple CMT types of varying sizes).

Out of scope: querying CMT records that have field-level encryption (defer to PHE4).

---

### EXT-1.6 — Flow XML body extraction

Goal: For each CPQ-related Flow, fetch its `Metadata` JSON via the Tooling API (Option A from the v1.1 audit) so BB-3 can analyze flow logic instead of just counting flows.
Phase: PHE2
Depends on: EXT-CC6, EXT-1.4 (reuses the chunked-fetch helper)
Gap-doc ref: §5 Gap 1.6
Effort: L (~2 days)
PDF-relevant: **No** — the report already has flow inventory + complexity scoring; the XML body matters only to downstream BBs.

Files:

- [`apps/worker/src/collectors/dependencies.ts`](../apps/worker/src/collectors/dependencies.ts) lines 209–305.
- Reuse the helper from EXT-1.4: `tooling-metadata-fetch.ts`.

Implementation:

- After the existing `FlowDefinitionView` enumerate query, collect each flow's `ActiveVersionId`.
- Use the chunked-fetch helper with chunks of **10**: `SELECT Id, Metadata FROM Flow WHERE Id IN ('<id1>', ..., '<id10>')`.
- The `Metadata` field returns a JSON representation of the flow including all elements, decisions, formulas, and assignments. Store it in `textValue` (gated).
- Compute a deterministic complexity score from the parsed Metadata: `simple` (≤ 5 elements), `medium` (6–25), `high` (26–100), `very-high` (> 100). Element count = `metadata.actionCalls + metadata.assignments + metadata.decisions + metadata.recordCreates + metadata.recordLookups + metadata.recordUpdates + metadata.subflows`. Set `complexityLevel` from this.
- Surface element-by-element field references in `evidenceRefs` for the BB-3 normalizer to consume.
- Truncate via `truncateWithFlag` at 256 KB (very large flows; flag if hit).
- Inactive flows (no `ActiveVersionId`): skip body fetch but still emit the inventory finding.
- A flow whose Metadata fetch fails: emit the inventory finding + a `bodyFetchFailed: true` evidenceRef + a warning.

Acceptance:

- [ ] All CPQ-related flows with an active version have `textValue` populated when `codeExtractionEnabled`.
- [ ] `complexityLevel` is computed from element count, not just inventory presence.
- [ ] Flows without active versions still appear as findings.
- [ ] Failed Metadata fetches degrade gracefully — collector does not fail.
- [ ] BB-3 normalizer receives the flow body and produces nodes that round-trip via the §8.3 distinctness invariant.
- [ ] No new SF queries violate the v1.1 audit rules (no `FIELDS()`, all bulk Metadata fetches are chunked with strong filters).

Test coverage: **unit** (complexity calculation, element count parser), **integration** (synthetic flow Metadata JSON fixtures of varying sizes).

Out of scope: full flow simulation / formula evaluation. The XML body and the field references are enough for BB-3; semantic analysis is BB-4 territory.

---

## 4. Phase E3 — New collector (component bundles)

> **Why a single phase:** all four artifact classes (LWC, Aura, VF page/component, Static Resource) belong in one new collector module. Splitting them into per-card files just adds boilerplate without parallelism benefit. The cards split the implementation into sub-features that can be developed and tested independently inside one PR.

### EXT-1.7a — components.ts collector skeleton

Goal: Create the new `apps/worker/src/collectors/components.ts` collector with the per-sub-collector status pattern from gaps-doc OQ-6 (each artifact type can degrade independently). No artifacts extracted yet — this card is just the skeleton.
Phase: PHE3
Depends on: EXT-CC6
Gap-doc ref: §5 Gap 1.7
Effort: M (~0.5 day)
PDF-relevant: **No** — internal worker plumbing.

Files:

- New file `apps/worker/src/collectors/components.ts`.
- New file `apps/worker/src/collectors/components.test.ts`.
- Modify [`apps/worker/src/collectors/registry.ts`](../apps/worker/src/collectors/registry.ts) to register the new collector.

Implementation:

- Mirror the structure of an existing collector (e.g. `customizations.ts`): a class extending `BaseCollector` with `name`, `tier`, and `collect()`.
- `collect()` runs four sub-collectors in sequence: `extractLwc()`, `extractAura()`, `extractVisualforce()`, `extractStaticResources()`. Each is a try/catch independent unit; failure of one does not block the others.
- Aggregate per-sub-collector status into `metrics`: `{ lwcStatus, auraStatus, vfStatus, staticResourceStatus }` each as `'ok' | 'degraded' | 'failed'`.
- Tier: `'tier-2'` (per gaps-doc — 10-minute budget).
- Skeleton stubs for all four extractors return `[]` and `'ok'` for now. Subsequent cards (EXT-1.7b/c/d/e) replace each stub.

Acceptance:

- [ ] Collector registered in registry, picked up by pipeline.
- [ ] All four sub-extractor stubs return cleanly.
- [ ] Per-sub-collector status surfaces in `metrics`.
- [ ] `pnpm --filter @revbrain/worker test` is green.

Test coverage: **unit** (each sub-extractor stub returns `[]`), **integration** (collector registered and picked up).

Out of scope: actual artifact extraction — that's the next four cards.

---

### EXT-1.7b — LWC + Aura bundle extraction

Goal: Replace the LWC + Aura stubs with real extractors. LWC: query `LightningComponentBundle` + `LightningComponentResource`. Aura: query `AuraDefinitionBundle` + `AuraDefinition`.
Phase: PHE3
Depends on: EXT-1.7a
Gap-doc ref: §5 Gap 1.7
Effort: M (~1 day)
PDF-relevant: **No** for now. (Could surface "12 LWC components reference SBQQ**Quote**c" as a Tier 2 PDF improvement later.)

Files: [`apps/worker/src/collectors/components.ts`](../apps/worker/src/collectors/components.ts) (modify the LWC + Aura stubs).

Implementation:

- LWC: `SELECT Id, DeveloperName, NamespacePrefix, ApiVersion FROM LightningComponentBundle WHERE NamespacePrefix = null` (the bundle itself), then for each bundle: `SELECT Id, FilePath, Format, Source FROM LightningComponentResource WHERE LightningComponentBundleId = '<id>'`. Each resource is a single file in the bundle (e.g. `foo.html`, `foo.js`, `foo.css`).
- Aura: `SELECT Id, DeveloperName, NamespacePrefix, ApiVersion FROM AuraDefinitionBundle WHERE NamespacePrefix = null`, then for each bundle: `SELECT Id, DefType, Source FROM AuraDefinition WHERE AuraDefinitionBundleId = '<id>'`.
- For each bundle, emit one bundle-level finding (`artifactType: 'LightningComponentBundle' | 'AuraDefinitionBundle'`) and one finding per file (`findingType: 'lwc_resource' | 'aura_definition'` with the source in `textValue`).
- Filter to CPQ-related bundles by string match against the source: any bundle whose source mentions `SBQQ__`, `Quote__c`, `QuoteLine__c`, or related CPQ tokens. Non-matching bundles are still inventoried (count only) but not body-extracted.
- Use `truncateWithFlag` per file at 256 KB.

Acceptance:

- [ ] CPQ-related LWC bundles have all their files extracted.
- [ ] Non-CPQ LWC bundles are inventoried (count) but not body-extracted.
- [ ] Same for Aura.
- [ ] `metrics.lwcBundleCount`, `metrics.lwcCpqRelatedBundleCount`, `metrics.auraBundleCount`, `metrics.auraCpqRelatedBundleCount` all populated.
- [ ] BB-3 normalizer registry route exists for the new finding types (or they fall through to UnknownArtifact deliberately, with a `not-modeled-v1` entry — explicit choice required).

Test coverage: **unit** (per-extractor), **integration** (against a fixture with mixed CPQ + non-CPQ bundles).

Out of scope: parsing the LWC/Aura JS source for field references. That's EXT-CC3 + a future BB-4 task.

---

### EXT-1.7c — Visualforce + Static Resource extraction

Goal: Replace the VF + Static Resource stubs. VF: `ApexPage` + `ApexComponent` (similar to ApexClass). Static Resources: extract by file extension + size, NOT by MIME type per the v1.1 fix.
Phase: PHE3
Depends on: EXT-1.7a
Gap-doc ref: §5 Gap 1.7
Effort: M (~1 day)
PDF-relevant: **No** for now.

Files: [`apps/worker/src/collectors/components.ts`](../apps/worker/src/collectors/components.ts) (modify the VF + Static Resource stubs).

Implementation:

- VF: `SELECT Id, Name, Markup, ApiVersion FROM ApexPage WHERE NamespacePrefix = null` and same for `ApexComponent`. Filter to CPQ-related by markup grep (same tokens as EXT-1.7b).
- Static Resources: `SELECT Id, Name, ContentType, BodyLength FROM StaticResource WHERE NamespacePrefix = null AND BodyLength < 3145728` (3 MB).
- For each Static Resource: extract via the v1.1 corrected policy:
  1. **Primary signal**: `Name` extension. If `.js | .html | .json | .css | .xml | .txt`, fetch body.
  2. **Secondary signal**: `BodyLength < 3 MB` AND not detected as binary by magic-byte sniff (PNG/JPEG/ZIP/PDF headers).
  3. Skip files matching binary magic bytes regardless of extension.
- Body fetch: GET `/services/data/vXX.X/sobjects/StaticResource/<Id>/Body` (this returns the raw body, not JSON).
- Cross-link: every QCP body extracted by `pricing.ts` should be checked against the Static Resource inventory. If a static resource matches a QCP body byte-for-byte, mark it as `linkedToQcp: true`. This catches the "split-QCP" pattern where customers store the QCP source in a static resource and reference it from `SBQQ__CustomScript__c`.
- Truncate via `truncateWithFlag` at 1 MB (much larger than other artifacts since static resources legitimately hold whole bundled JS).

Acceptance:

- [ ] CPQ-related VF pages and components have `textValue` populated.
- [ ] Static resources matching the extraction policy are extracted with bodies; binary resources are inventoried only.
- [ ] Static resources matching a known QCP body are flagged `linkedToQcp: true`.
- [ ] `metrics.vfPageCount`, `metrics.vfComponentCount`, `metrics.staticResourceCount`, `metrics.staticResourceTextExtractedCount` all populated.

Test coverage: **unit** (file-extension + magic-byte gating), **integration**.

Out of scope: parsing VF page formulas. They're emitted as `textValue` for downstream consumption.

---

### EXT-1.7d — components.ts complete (registry + BB-3 normalizer route)

Goal: Wire all the new finding types from EXT-1.7b/c into BB-3 normalizer registry. Either with a real normalizer or with explicit `not-modeled-v1` entries — silent fall-through is forbidden.
Phase: PHE3
Depends on: EXT-1.7b, EXT-1.7c
Gap-doc ref: §5 Gap 1.7 + the §8.3 lesson about silent fall-through
Effort: M (~0.5 day)
PDF-relevant: **No**.

Files:

- [`packages/bb3-normalizer/src/normalizers/register-all.ts`](../packages/bb3-normalizer/src/normalizers/register-all.ts).
- [`packages/bb3-normalizer/src/normalizers/fallback/not-modeled.ts`](../packages/bb3-normalizer/src/normalizers/fallback/not-modeled.ts) — add new types to the `NOT_MODELED_V1_TYPES` set if not modeled.
- New normalizers in `packages/bb3-normalizer/src/normalizers/components/` if modeling.

Implementation:

- For each new artifact type (`LightningComponentBundle`, `lwc_resource`, `AuraDefinitionBundle`, `aura_definition`, `ApexPage`, `ApexComponent`, `StaticResource`), make an explicit choice:
  - **Wave 1 modeled**: write a thin normalizer that produces a node with `nodeType: 'ComponentBundle'` (or per-type if the spec calls for it). Identity recipe per the §8.3 auto-discriminator.
  - **Not-modeled-v1**: add to `NOT_MODELED_V1_TYPES` and let the existing fallback emit explicit quarantine entries.
- Default for this card: **modeled** for the four bundle types (LWC, Aura, VF page, VF component), **not-modeled-v1** for individual `lwc_resource` / `aura_definition` files (they're aggregated into the bundle node's evidenceRefs, not their own nodes). Static Resources: **modeled** with `nodeType: 'StaticResource'`.
- Run the §8.3 distinctness property test on each new normalizer.

Acceptance:

- [ ] No new artifact type from EXT-1.7b/c falls through to UnknownArtifact silently.
- [ ] Each new modeled type has a passing distinctness test.
- [ ] BB-3 normalizer test suite stays green.
- [ ] PDF↔IRGraph parity test (from §8.3) extended to assert the new bundle counts match.

Test coverage: **unit** (per-normalizer baseline), **integration** (BB-3 register-all snapshot), **property** (distinctness invariant).

Out of scope: spill-to-storage for very large bundles (defer to a follow-up if needed).

---

## 5. Phase E4 — Cross-cutting and Tier 2

> **Why deferred:** Cards in this phase are independent of each other and can be picked up in any order. They're sized so that any subset can ship without blocking the others.

### EXT-CC1 — FLS introspection (running user)

Goal: At extraction start, query `FieldPermissions` against the running user's effective permission-set aggregate to detect missing FLS read on any field the worker queries. Fail loudly if a required field is unreadable.
Phase: PHE4
Depends on: none
Gap-doc ref: §7 CC-1
Effort: L (~1.5 days)
PDF-relevant: **Yes** — a banner: "This report was generated with restricted FLS read on N CPQ fields — coverage is incomplete."

Files:

- New file `apps/worker/src/salesforce/fls-introspect.ts`.
- Modify [`apps/worker/src/pipeline.ts`](../apps/worker/src/pipeline.ts) to call FLS introspection in the pre-flight phase.
- New const `apps/worker/src/collectors/required-fls.ts` listing the minimum field set every collector requires.

Implementation:

- Build a static `REQUIRED_FLS` map: `objectName → Set<fieldApiName>` covering every field in every collector's SOQL `SELECT` projection. Generate manually for v1; consider auto-extraction in a follow-up.
- At extraction start, query `SELECT Field, PermissionsRead, PermissionsEdit FROM FieldPermissions WHERE ParentId IN (SELECT PermissionSetId FROM PermissionSetAssignment WHERE AssigneeId = '<runningUserId>')`. Aggregate per field.
- For each `(object, field)` in `REQUIRED_FLS`, check if the running user has `PermissionsRead = true`. Surface missing fields in a `flsGap` array.
- Two failure modes per OQ-4:
  - **Hard fail** (collector cannot function): if any of `Id`, `Name`, `DeveloperName`, `NamespacePrefix` is unreadable on a base object — abort the extraction with a clear error.
  - **Warn** (coverage breadth affected): emit a `degraded` warning with the missing field list. Continue with reduced coverage.
- Surface the missing field count via `metrics.flsGapCount` and the full gap list via a top-level `degradedInputs` entry.

Acceptance:

- [ ] Running user with full FLS produces zero `flsGap` entries.
- [ ] Running user with FLS missing on `SBQQ__Quote__c.SBQQ__TargetCustomerAmount__c` produces a `degraded` warning, the worker continues, and the metric is surfaced.
- [ ] Running user with FLS missing on `SBQQ__Quote__c.Id` fails fast with a clear error message.
- [ ] All test cases run against a synthetic permission-set fixture.

Test coverage: **unit** (the gap-detection logic), **integration** (against the fixture).

Out of scope: profile-based permissions (we only support permission-set-based FLS for v1; profile-only orgs get a warning to migrate to permission sets).

---

### EXT-CC3 — Dynamic dispatch detection

Goal: Scan extracted Apex + QCP JS bodies for runtime-resolved type / dynamic SOQL patterns. Emit a separate finding type so BB-3 + downstream BBs know which artifacts have non-static dependencies.
Phase: PHE4
Depends on: EXT-CC2 (test classes already excluded)
Gap-doc ref: §7 CC-3 (with v1.1 fix for `conn.query()`)
Effort: M (~0.5 day)
PDF-relevant: **No** — this is downstream-BB metadata, not human-PDF metadata.

Files: [`apps/worker/src/collectors/dependencies.ts`](../apps/worker/src/collectors/dependencies.ts) and [`apps/worker/src/collectors/pricing.ts`](../apps/worker/src/collectors/pricing.ts).

Implementation:

- Define the patterns from the v1.1 audit:
  - **Apex**: `\bType\.forName\b`, `\bType\.newInstance\b`, `\bDatabase\.query\b`, `\bDatabase\.queryLocator\b`
  - **QCP JS**: `\beval\s*\(`, `\bnew\s+Function\s*\(`, `\bimport\s*\(`
  - **QCP JSForce (critical)**: `\bconn\.query\s*\(`
- For each Apex finding, count matches per pattern. If any non-zero, set `evidenceRefs[].hasDynamicDispatch = true` and add a `dynamicDispatchPatterns` field listing matched patterns.
- Same for QCP findings.
- Surface `metrics.dynamicDispatchClassCount` so the count is observable.

Acceptance:

- [ ] An Apex class with `Type.forName('Foo')` produces a finding with `dynamicDispatchPatterns: ['Type.forName']`.
- [ ] A QCP body with `conn.query(dynSql)` produces a finding with `dynamicDispatchPatterns: ['conn.query']`.
- [ ] Pure-static classes have no dynamic dispatch flag.
- [ ] Counts are reflected in metrics.

Test coverage: **unit** (per pattern, with positive and negative cases).

Out of scope: resolving dynamic dispatch (can't be done statically). We just flag it.

---

### EXT-CC4 — Third-party packaged Apex extension

Goal: Add a second Apex query pass for third-party packaged classes (NamespacePrefix NOT in `SBQQ`, `sbaa`, `blng`, but not null). Mark them with `inThirdPartyManagedPackage: true`. Catches DocuSign Gen, Conga, etc. extending CPQ.
Phase: PHE4
Depends on: EXT-CC2
Gap-doc ref: §7 CC-4
Effort: S (~0.5 day)
PDF-relevant: **No** for the global metric, but the per-package list may eventually surface.

Files: [`apps/worker/src/collectors/dependencies.ts`](../apps/worker/src/collectors/dependencies.ts).

Implementation:

- Add a second pass: `SELECT Id, Name, NamespacePrefix, Body, LengthWithoutComments FROM ApexClass WHERE NamespacePrefix != null AND NamespacePrefix NOT IN ('SBQQ', 'sbaa', 'blng', 'pi', 'rh2')`.
- For each class, body grep for CPQ tokens (`SBQQ__`, `Quote__c`, etc). Only emit findings for classes that touch CPQ.
- Set `inThirdPartyManagedPackage: true` and `notes` includes the package namespace.
- Risk level: `medium` by default (third-party doesn't migrate via Apex rewrite — needs a vendor migration plan).

Acceptance:

- [ ] Classes from third-party packages that reference CPQ are surfaced.
- [ ] Each finding has the namespace identified.
- [ ] `metrics.thirdPartyExtensionClassCount` populated.

Test coverage: **unit** (synthetic third-party class fixture).

Out of scope: extracting bodies of unmanaged classes outside customer namespace.

---

### EXT-CC5 — Stability tag on every finding

Goal: Tag each finding with `stability: 'metadata' | 'runtime'` so BB-3 + downstream BBs know which fields are deterministic across re-extractions and which can drift between runs.
Phase: PHE4
Depends on: none
Gap-doc ref: §7 CC-5
Effort: S (~0.25 day)
PDF-relevant: **No**.

Files:

- [`packages/contract/src/assessment.ts`](../packages/contract/src/assessment.ts) — add the `stability` field to the schema.
- All collector files — set the field on every produced finding.

Implementation:

- Add `stability: z.enum(['metadata', 'runtime']).default('metadata')` to `AssessmentFindingSchema`. Default to `metadata` so existing collectors don't need changes immediately.
- Then go through each collector and set `stability: 'runtime'` for any finding whose value is observed at extraction time and could differ between runs (e.g. usage counts, last-modified timestamps, async job statuses).
- Default `metadata` for everything else (Apex bodies, formulas, validation rules — any source-controlled artifact).
- Document the contract in a JSDoc on the schema.

Acceptance:

- [ ] Schema accepts the new field.
- [ ] Every collector that produces a runtime-observed finding sets `stability: 'runtime'`.
- [ ] BB-3 normalizer can read the field but does not depend on it for identity (per §6.2 determinism).

Test coverage: **unit** (schema validation), **lint** (a grep guard checking that any collector emitting `usageLevel` or counts also sets `stability: 'runtime'`).

Out of scope: changing existing behavior — this is purely metadata addition.

---

### EXT-2.1 — Email Templates

Goal: Extract `EmailTemplate` body and HTML for templates referenced by CPQ flows or rules.
Phase: PHE4
Effort: S (~0.5 day)
Gap-doc ref: §6 (Tier 2 row 2.1)
Depends on: EXT-CC6
PDF-relevant: **No**.

Files: New file `apps/worker/src/collectors/email-templates.ts` or extend `customizations.ts`.

Implementation:

- Query `SELECT Id, DeveloperName, Subject, Body, HtmlValue, TemplateType FROM EmailTemplate WHERE FolderName LIKE '%CPQ%' OR Body LIKE '%SBQQ__%' OR HtmlValue LIKE '%SBQQ__%'`.
- Emit one finding per template with body in `textValue`.
- Parse merge field references via the existing merge-field regex.

Acceptance: tests + populated metrics + body extracted with merge fields parsed.

Test coverage: **unit** + **integration**.

---

### EXT-2.2 — Custom Permissions and PSGs

Goal: Inventory `CustomPermission` and `PermissionSetGroup` records.
Phase: PHE4
Effort: M (~1 day)
Gap-doc ref: §6 (Tier 2 row 2.2)
Depends on: none
PDF-relevant: **No**.

Implementation per gaps doc — straightforward inventory queries.

---

### EXT-2.3 — Scheduled Apex

Goal: Query `CronTrigger` and `AsyncApexJob` to inventory scheduled Apex jobs.
Phase: PHE4
Effort: S (~0.5 day)
Gap-doc ref: §6 (Tier 2 row 2.3)
Depends on: none
PDF-relevant: **No**.

Implementation per gaps doc.

---

### EXT-2.5 — Remote Site Settings

Goal: Inventory `RemoteSiteSetting` for callout authorization cross-reference.
Phase: PHE4
Effort: S (~0.25 day)
Gap-doc ref: §6 (Tier 2 row 2.5)
Depends on: none
PDF-relevant: **No**.

Implementation per gaps doc — single-query inventory.

---

### EXT-2.6 — Doc-gen package inventory

Goal: Detect DocuSign Gen / Conga / Drawloop installations and inventory their templates + configs.
Phase: PHE4
Effort: L (~2 days)
Gap-doc ref: §6 (Tier 2 row 2.6)
Depends on: EXT-CC4 (third-party namespace handling lands first)
PDF-relevant: **No** for now.

Implementation: package detection via `InstalledSubscriberPackage` query, then per-package collector logic. Defer to a separate sub-spec since each doc-gen vendor has its own object model.

---

### EXT-2.7 — Translation Workbench

Goal: Extract field translations + custom label translations for CPQ objects.
Phase: PHE4
Effort: S (~0.5 day)
Gap-doc ref: §6 (Tier 2 row 2.7)
Depends on: none
PDF-relevant: **No**.

Implementation per gaps doc.

---

## 6. PDF-relevant follow-ups (NOT IMPLEMENTED YET)

> **Per the user's instruction:** "if there is something from the gaps that you think needs to be in the PDF — let me know about it but for now we are not changing the PDF". This section captures the items that, after their backing extraction work lands, would benefit from a corresponding PDF surface change. It is a **tracking list**, not an action list. PDF changes are deferred until extraction closure is complete and the PDF audit can use the new data.

| Extraction card   | What the PDF could eventually surface                                                                                         | Why it matters                                                                                       |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| EXT-1.1 + EXT-1.2 | "Active Quote Calculator Plugin: `<className>` (LOC, fields, TriggerControl flag)" instead of just "47 Apex classes"          | The single most important migration-risk artifact today is invisible in the PDF                      |
| EXT-1.4           | "12 of 25 validation rules reference RCA-renamed fields" instead of "25 validation rules"                                     | Converts an opaque count into a defensible migration risk surface                                    |
| EXT-1.3           | "12 CMT types containing 4,387 records — 3 types appear to be DecisionTable candidates" instead of "12 Custom Metadata Types" | CMT types alone is sizing; record counts + rules-engine flag is analysis                             |
| EXT-CC6           | A "(content truncated)" badge wherever a finding's body was capped                                                            | Builds trust — readers know which findings are partial vs full                                       |
| EXT-CC1           | Top-of-report banner: "Generated with restricted FLS read on N CPQ fields — coverage is incomplete"                           | Without this, a privilege-restricted run produces a silent under-report and the customer never knows |

The other extraction cards either already have adequate PDF coverage (flow inventory, template detection) or feed downstream BBs (BB-4 segmentation, BB-5 disposition) without needing a human-facing surface.

---

## 7. Verification methodology

Mirrors §9 of the gaps doc. For every closed card:

- **V-1 (synthetic completeness)**: a fixture in `apps/worker/tests/fixtures/extraction-coverage/` containing one instance of every artifact class the card touches. Test asserts each artifact is found, classified, and body-extracted where applicable.
- **V-2 (real-org parity)**: at the end of each phase, a manual run against a real staging org with engineer-validated counts.
- **V-3 (negative-case)**: every collector test asserts the absence case (an org with no QCP plugins produces "no plugins detected", not a missing finding).
- **V-4 (permission downgrade)**: only required for EXT-CC1. The test runs the worker with a stripped-permission integration user and asserts the FLS gap surfaces.
- **V-5 (spec traceability)**: each PR description must link the relevant card ID and gap-doc section.

---

## 8. Branching and shipping

- Feature branch: `feat/extraction-coverage` (separate from `feat/bb3-wave1` since the surfaces don't overlap; the two can ship in parallel).
- Commits: one per task card, with `Task: <EXT-ID>` in the commit body.
- Promotion: same `/sync-branches` workflow as BB-3 — `feat/extraction-coverage` → `staging` → `main`.
- Phase boundary discipline: at the end of each phase (PHE0, PHE1, PHE2, PHE3, PHE4), run `/wave-review` against the extraction work before picking up the next phase.

---

## 9. Open questions (carried over from gaps doc §10)

These need answers from the user / architect before the cards that depend on them can ship. Each is annotated with which card it blocks.

- **OQ-1** (third-party Apex with bodies): **blocks EXT-CC4** if we want to extract bodies. Default for v1: inventory only, no body. Resolution: confirm or override.
- **OQ-2** (inline-vs-spill threshold): **blocks EXT-1.7c** if a static resource > 1 MB needs to be stored. Default for v1: inline up to 1 MB, flag and skip if larger. Resolution: confirm or pick a spill mechanism.
- **OQ-3** (per-CPQ-version plugin map versioning): **blocks EXT-1.2**. Default for v1: hardcoded for the latest CPQ version with a degraded warning if the detected version doesn't match. Resolution: confirm.
- **OQ-4** (FLS hard-fail vs warn distinction): **blocks EXT-CC1**. Default for v1: hard-fail on absent base-object identifiers, warn for everything else. Resolution: confirm.
- **OQ-5** (Big Object archives): **deferred to Tier 3** — not on the card list yet.
- **OQ-6** (components.ts per-sub-collector failure mode): **resolved** — implemented in EXT-1.7a.

---

## 10. Audit trail

| Date       | Version | Change             | Author                                                                                                          |
| ---------- | ------- | ------------------ | --------------------------------------------------------------------------------------------------------------- |
| 2026-04-11 | 1.0     | Initial task cards | CTO directive — cross-checked against [CPQ-EXTRACTION-COVERAGE-GAPS.md](./CPQ-EXTRACTION-COVERAGE-GAPS.md) v1.1 |
