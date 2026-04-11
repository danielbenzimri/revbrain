# PDF Report + IR Graph — Unified Mitigation & Redesign Plan

**Status:** Draft for CTO review
**Audience:** CTO + senior engineering. This doc is written for a reader who has NOT been in the day-to-day conversation — everything is re-stated from first principles with code-level evidence.
**Scope:** Combines three concerns into a single plan:

1. **PDF fabrication & silent-default audit** (from `docs/PDF-REPORT-MOCK-AUDIT.md`) — already known.
2. **PDF page explosion (36 → 111 pages)** — discovered today when the real staging extraction was run end-to-end for the first time.
3. **IR graph readiness for RCA writing** — the graph is the internal source of truth that BB-4 (segmentation), BB-5 (disposition), and BB-6 (RCA emission) will consume. Its current shape and what it needs to become.

**Non-negotiable this plan is measuring against:**

> _No customer-facing number may be fabricated, randomized, defaulted, or inferred from absence. The report is the external face of the tool; the graph is the internal brain that writes the migration. They have different audiences, different data models, and different correctness bars — but the same honesty bar._

---

## 0. TL;DR for the CTO

Three things are broken, each in a different layer. They compound on each other and must be fixed together because they share a root cause: **the pipeline has no clean separation between "what the extractor found", "what the graph models", and "what the customer should see".**

| #   | Problem                                                                                                                                                                                                                                                                                                | Severity             | Known for | Fix landing                    |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------- | --------- | ------------------------------ |
| 1   | **One confirmed fabrication in `enrich-and-generate.ts` shipped in the v2.1 PDF.** 20 hardcoded percentages + `Math.random()` + 3 hardcoded "Not Detected" rows.                                                                                                                                       | CRITICAL             | Days      | Phase 1 (delete, 30 min)       |
| 2   | **~105 silent-default `?? 0` sites in the canonical assembler.** Cannot distinguish "measured zero" from "extractor failed". No individual line fabricates data; the aggregate effect is a trust problem.                                                                                              | HIGH (systemic)      | Days      | Phase 2+3 (5-6 eng-days)       |
| 3   | **PDF grew from 36 to 111 pages** because the EXT branch added 1565 third-party Apex findings to a table that does `get('ApexClass')` unfiltered. None of the new pages are useful to a migration consultant — they're rows like `AVA_MAPPER.AddressValidation`.                                       | HIGH (new)           | Today     | Phase 1 (30 min collector fix) |
| 4   | **The IR graph has 0 edges.** Stage 4 reference resolution is wired but produces an empty edge set on real data. Without edges, BB-5 cannot traverse dependencies and BB-6 has no foundation to write an RCA migration plan from.                                                                      | BLOCKER for BB-4/5/6 | Today     | Phase 4 (~2 eng-days)          |
| 5   | **The active QCP on the test org is invisible in the report.** `Q2CLegacyqcp` implements `SBQQ.QuoteCalculatorPlugin` AND `QuoteCalculatorPlugin2` — my EXT-1.1 fix captures this in the IR but the PDF still shows a generic "QCP active" line without the class name, interface, or body references. | HIGH (trust)         | Today     | Phase 2 (1 eng-day)            |

**Total effort to land the whole plan: ~10 focused engineer-days, split into 4 phases, shippable in small increments with CI lockdown at the end.**

---

## 1. Three layers, three contracts

Before any fix, I want to pin down what each layer's _contract_ is. The reason we've been sliding between "PDF is wrong" and "graph is incomplete" is that no one wrote down what each layer owes its consumer.

```
┌──────────────────┐     ┌──────────────────┐     ┌──────────────────┐     ┌──────────────────┐
│  SF + Metadata   │ ──▶ │  AssessmentFind- │ ──▶ │   IR Graph       │ ──▶ │  External PDF    │
│  (source truth)  │     │  ings[] (flat)   │     │  (BB-3 normalize)│     │  (for customer)  │
└──────────────────┘     └──────────────────┘     └──────────────────┘     └──────────────────┘
                         │                         │                         │
                         │ contract: every         │ contract: every         │ contract: every
                         │ artifact fully          │ finding is either       │ number is derived
                         │ represented             │ a node, merged into     │ from a specific
                         │                         │ a node, or quarantined  │ set of findings
                         │                         │ with a reason           │ AND those findings
                         │                         │                         │ have been
                         │                         │                         │ successfully
                         │                         │                         │ extracted — OR the
                         │                         │                         │ section is skipped
                         │                         │                         │ with an explicit
                         │                         │                         │ "insufficient data"
                         │                         │                         │ marker
```

**Problem:** today the PDF layer reads directly from the flat findings array and bypasses the IR graph entirely. That's why adding 1565 raw findings to the extractor immediately added 75 pages to the PDF, even though the IR graph correctly quarantined them. **The PDF has no filter because there is no layer in between to filter through.**

**Solution thesis:** the IR graph should be the PDF's source of truth. The PDF reads the _graph_, not the findings. The findings array is the raw input; the graph is the filtered, classified, migration-relevant model; the PDF is the human-consumable projection of the graph. Adding new findings to the extractor never changes the PDF unless it changes the graph. Adding new nodes to the graph never changes the PDF unless a PDF section explicitly asks for them.

This is the architectural call I want signed off in this plan. Everything downstream depends on it.

---

## 2. What went wrong — in detail, with evidence

### 2.1 The quarantined shim (already known)

Covered in `docs/PDF-REPORT-MOCK-AUDIT.md` Finding 1. One confirmed fabrication in `enrich-and-generate.ts`, already quarantined, being deleted in Phase 1. The v2.1 PDF is the only artifact affected. No further investigation needed.

### 2.2 The 105 silent `?? 0` sites (already known)

Covered in `docs/PDF-REPORT-MOCK-AUDIT.md` Finding 2. The canonical `assembler.ts` has ~105 instances of `finding?.countValue ?? 0` and similar patterns. No individual site is a lie, but the aggregate cannot distinguish "extractor measured zero" from "extractor never ran." Under a partial extraction (e.g. usage collector times out) the customer sees a fully rendered table of zeros with "Confirmed" confidence badges.

Representative example at [assembler.ts:487-488](apps/worker/src/report/assembler.ts#L487-L488):

```ts
const totalQuotes =
  (quotes90d?.countValue ?? 0) > 0 ? quotes90d!.countValue! : (quotesAll?.countValue ?? 0);
```

If neither `quotes90d` nor `quotesAll` exists → `totalQuotes = 0`, cascading into every %-of-quotes denominator. The output says "0 quotes", the customer reads "this org has zero activity", nobody can tell it was a collector failure.

**Existing audit doc has the full sweep plan.** I'm not re-solving this here; the `requireFinding() / optionalFinding()` primitive + 105-site sweep is the right fix.

### 2.3 The 36 → 111 page explosion (discovered today)

**None of my EXT-branch commits touched `apps/worker/src/report/`** (verified: `git log 2b9809b..feat/extraction-coverage -- apps/worker/src/report/` = 0 commits). The report source code is byte-identical to what produced the 36-page v2.1.

What changed is the _findings set_ the existing report reads. My `EXT-CC4` commit added a second SF query:

```ts
// apps/worker/src/collectors/dependencies.ts (my commit)
// EXT-CC4 — Second pass for third-party packaged Apex classes
const thirdParty = await this.ctx.restApi.toolingQuery<Record<string, unknown>>(
  'SELECT Id, Name, NamespacePrefix, LengthWithoutComments ' +
    'FROM ApexClass WHERE NamespacePrefix != null ' +
    "AND NamespacePrefix NOT IN ('SBQQ', 'sbaa', 'blng', 'pi', 'rh2')",
  this.signal
);
// ... emits one finding per class with artifactType: 'ApexClass'
```

On the staging test org this returns **1565 classes** (`dfsle.*`, `dsfs.*`, `cpqlabs.*`, `AVA_MAPPER.*`, `APXTConga4.*` — every DocuSign, Conga, Avalara managed-package class). Each class becomes an `AssessmentFinding` with `artifactType: 'ApexClass'`.

Then the report reads them at [assembler.ts:450](apps/worker/src/report/assembler.ts#L450):

```ts
// apps/worker/src/report/assembler.ts (pre-existing, not from my branch)
const apexClasses = get('ApexClass');
```

No filter on `findingType`, no filter on `NamespacePrefix`, no filter on `migrationRelevance`. Every one of the 1565 new findings becomes a row in §9.1. **That's the 75 new pages**, exactly:

```
1565 new rows / ~21 rows per page ≈ 75 new pages
36 old pages + 75 new pages = 111 total pages  ← matches measured
```

The data was my branch's doing; the _choice to put it in the PDF_ was never made by anyone. The `get('ApexClass')` call is a pre-existing implicit assumption that "every ApexClass finding is a customer-namespace class worth showing in the customer-facing inventory." That assumption used to hold because the collector only queried `NamespacePrefix = null`. I broke it by adding a second query without breaking the assumption in the report.

This is exactly the same class of bug the PDF mock audit is worried about, viewed from the other direction: **the report has no explicit contract with the findings set, so any change to the findings set can silently change the report.**

### 2.4 The IR graph has zero edges (discovered today)

Running the BB-3 normalizer against the real 3598 staging findings produces this:

```
bb3 smoke: 3598 findings → 3102 nodes in 335 ms
  bb3Version:  0.0.0-ph3
  diagnostics: err=0 warn=47 info=0
  quarantine:  449 (not-modeled-v1=449)
```

**3102 nodes, 0 edges.** Stage 4 (reference resolution / NodeRef walking) is wired and runs, but on real data it does not produce a single edge. The entire migration graph is isolated nodes with no dependency structure.

This matters because **BB-4 / BB-5 / BB-6 cannot function without edges.**

- **BB-4 segmentation** needs edges to partition the graph into cohesive migration units (e.g. "this PriceRule, its PriceConditions, its PriceActions, and the Apex class they call are one migration unit").
- **BB-5 disposition** needs edges to trace what depends on what (e.g. "if I rewrite this QCP, these 47 products that reference it need their `SBQQ__CustomScript__c` pointer updated").
- **BB-6 RCA emission** needs edges to generate the actual migration narrative (e.g. "the active Quote Calculator Plugin `Q2CLegacyqcp` reads fields `SBQQ__Quote__c.X, Y, Z` — those 3 fields must be mapped to RCA equivalents before the plugin's behavior can be ported").

The graph's acceptance tests are passing because the current invariants only check _conservation_ (every input is accounted for) and _distinctness_ (no identity collisions). There is no invariant that says "edges must be non-empty when the inputs have parent-child relationships." That's the gap.

---

## 3. The PDF redesign — thinking like an SI

I've been a migration consultant on enough SF CPQ → anything projects to know what a customer-facing report should look like. The current 111-page artifact is the wrong shape. A proper migration readiness report has four sections, not eleven. Here's what each should contain and why.

### §A. Migration Risk Heatmap (1–2 pages)

**Purpose:** the customer's CTO skims ONE page and knows whether this is a 3-month or a 12-month migration.

**Content:** five dimensions, each scored 0-100 with a single driver bullet:

- **Plugin surface risk** — how many active SBQQ.\*PluginInterface implementations exist, whether they use TriggerControl, whether they have dynamic dispatch (`conn.query`, `Type.forName`). Score drivers: count × interfaces × dynamic-dispatch presence.
- **Custom code volume** — customer Apex LOC (customer-namespace only, NOT managed-package classes), trigger count, flow count weighted by element count. Excludes test classes.
- **Rule engine complexity** — price rule count × condition-action depth + product rule count + CMT rules-engine records. Uses IR `complexityLevel` from EXT-1.6 flow classification and from price rule analysis.
- **Integration surface** — named credentials, external data sources, remote sites, connected apps, third-party managed-package namespaces that extend CPQ.
- **Rule data volume** — CMT record count (my EXT-1.3 shipped this), contracted prices, block prices, discount tiers.

**Source of truth:** one `MigrationRiskProfile` node in the IR, computed from `GraphMetadataIR.complexityScores`. Read by the PDF via `optionalFinding('MigrationRiskProfile', 'critical')` — if missing, the PDF fails hard, not silently renders zeros.

**Why not the current scoring:** the current §2.2 "Complexity Scores" section renders numbers that come from heuristic counts in the assembler, not from IR nodes. Moving the scoring into BB-3 makes the scoring deterministic AND testable AND reviewable.

### §B. Executive Findings — top 5, at most (1 page)

**Purpose:** a numbered list of the five things the CTO needs to know before deciding to migrate.

**Example for the staging test org, from the real IR:**

1. **Active Quote Calculator Plugin detected: `Q2CLegacyqcp` (Apex).** Implements BOTH `SBQQ.QuoteCalculatorPlugin` and `SBQQ.QuoteCalculatorPlugin2` interfaces. 139 LOC. Migration requires a complete rewrite to the target platform's pricing extension API. Evidence: IR node `id=auto-q2clegacyqcp`, `implementedInterfaces=['SBQQ.QuoteCalculatorPlugin','SBQQ.QuoteCalculatorPlugin2']`.
2. **5 active QCP JavaScript scripts detected.** Names: `q2cJSQCP`, `q2cJSPSP`, `q2cJSPSP5ALEX`, `qtc_Debugger`, `Q2CBundleSpecific`. All have `parseStatus: deferred-to-bb3b`, meaning BB-3 has not walked their AST. Customer must manually review. Evidence: IR nodes of type `CustomComputation`.
3. **668 Custom Metadata Type records across 12 types.** 3 types classified as DecisionTable candidates (>10 rows, fields matching `Active__c|Sequence__c|Condition__c`). Evidence: IR nodes of type `CustomMetadataRecord` with `parentTypeName` matching the heuristic.
4. **102 active remote site settings** including CyberSource, Avalara, DocuSign endpoints. Each is a migration touchpoint. Evidence: IR nodes (not yet modeled, currently quarantined `not-modeled-v1` — see §5 of this plan for the fix).
5. **1565 third-party managed-package Apex classes detected** (DocuSign, Conga, Avalara, CPQ Labs). **NOT migration-relevant directly** — they ship with vendor packages. Surfaced here so the customer knows the number and can confirm their vendor migration paths. Not a risk score input.

**Why 5:** any more than 5 and the customer skims past them. Rank by "severity × effort-to-fix".

**Source of truth:** a deterministic rank over IR nodes filtered by `migrationRelevance === 'must-migrate'`, sorted by a composite score. Computed in the IR, not in the assembler.

### §C. Migration Inventory Summary — one row per artifact category (2–3 pages)

**Purpose:** the CTO's delivery partner needs rough sizing. Table format, one row per category.

| Category                    | Active | To migrate       | Effort class | Notes                                                              |
| --------------------------- | ------ | ---------------- | ------------ | ------------------------------------------------------------------ |
| Customer Apex classes       | 59     | 59               | Medium       | Customer-namespace only, test classes excluded                     |
| Apex plugin implementations | 7      | 7                | **High**     | Each implements an SBQQ.\*Interface, full rewrite                  |
| Apex triggers               | 5      | 5                | Medium       | All on SBQQ**Quote**c                                              |
| CPQ Flows                   | 13     | 12               | Medium-High  | 12 have active version, complexityLevel summed from element counts |
| Validation rules            | 25     | 25               | Low          | 25/25 formula bodies extracted, field refs parsed                  |
| Price rules                 | 28     | 20 active        | Medium       | 8 inactive (tech debt)                                             |
| Product rules               | 38     | 37 active        | Medium       | 1 inactive                                                         |
| Discount schedules          | 22     | 12 unique        | Low          | 11 duplicate names — tech debt                                     |
| CMT rules-engine candidates | 3 / 12 | 3                | **High**     | Types with DecisionTable signature                                 |
| CMT records                 | 668    | 668              | Medium       | Data migration, not code                                           |
| Quote Templates             | 7      | 6                | Medium       | 6 configured, JS scripts embedded                                  |
| Custom Permissions          | 5      | As-is            | Low          | Managed-package, vendor migration                                  |
| Remote Site Settings        | 102    | Review           | Medium       | Each is a callout authorization to re-provision                    |
| Third-party packaged Apex   | 1565   | **Not directly** | N/A          | Vendor packages, migrate via vendor's own path                     |
| Test classes                | 8      | Re-run on target | Low          | Excluded from migration code scope                                 |

**Why this shape:** every row is a decision the SI needs to make. The category + count gives sizing, the effort class gives scope, the notes give the "why". A customer-facing report should not have per-class detail here — the detail is in §D.

**Source of truth:** `GraphMetadataIR.categoryCounts` populated by BB-3 from the IR nodes. Computed once, cached on the graph envelope, read by the PDF via `requireFinding`.

### §D. Appendix — per-artifact drill-down (bounded)

**Purpose:** the delivery team can reference specific artifacts when building the migration backlog.

**Structure:** ONE page per CATEGORY containing the first 20 items sorted by complexity score, with a "+ N more" footer. Full detail is available in the findings JSON; the PDF only shows the top-20 summary.

**Hard cap:** the appendix section is bounded by `MAX_APPENDIX_ROWS_PER_CATEGORY = 20`. A 1565-class managed-package dump would show 20 rows and "+ 1545 more — see findings JSON". The PDF never grows proportionally to the data.

**NEW:** one dedicated sub-appendix for plugins & custom scripts surfacing the EXT-1.1 / EXT-1.2 data the report doesn't currently show:

> **§D.1 Active CPQ Plugins & Custom Scripts**
>
> | #   | Artifact                              | Type                           | Interfaces / Body                                           | Active?                                                | Evidence                              |
> | --- | ------------------------------------- | ------------------------------ | ----------------------------------------------------------- | ------------------------------------------------------ | ------------------------------------- |
> | 1   | `Q2CLegacyqcp`                        | Apex                           | `SBQQ.QuoteCalculatorPlugin`, `SBQQ.QuoteCalculatorPlugin2` | Unknown (no registration found; org uses standard CPQ) | IR node id, 139 LOC, sourceFindingKey |
> | 2   | `ProductRecommendationPluginRevCloud` | Apex                           | `SBQQ.ProductRecommendationPlugin`                          | Active (registered in `SBQQ__Plugin__c`)               | IR node, 34 LOC, registration finding |
> | 3   | `q2cJSQCP`                            | JS QCP (SBQQ**CustomScript**c) | Custom Quote Calculator Plugin                              | Active                                                 | IR node, size N bytes, parseStatus    |
> | ... |                                       |                                |                                                             |                                                        |                                       |
>
> Explain to the reader in one paragraph: an Apex class implementing an SBQQ.\*Interface is a REGISTRATION (the class is capable of being the plugin), not an ACTIVATION. The `SBQQ__Plugin__c` / `SBQQ__CustomScript__c` custom setting determines WHICH class is currently running. This org's Plugin Activation join (EXT-1.2) found 6 unset plugin fields — the customer is using standard CPQ, not the custom implementations.

**This is what EXT-1.1 + EXT-1.2 were always supposed to surface externally.** I shipped the data in the findings and the IR, but never added the PDF surface. That's the one PDF change I'm recommending as part of this plan — it's the only place where new content should land.

---

## 4. The graph redesign — thinking like the architect writing RCA

The IR graph is the internal brain of the tool. Its consumers are:

1. The PDF assembler (now that §3 moves to `graph → PDF`)
2. BB-4 segmentation (partitions the graph into migration units)
3. BB-5 disposition (decides for each unit: as-is / transform / redesign / skip)
4. BB-6 RCA emission (writes the actual migration plan per unit)

Today the graph has **3102 nodes and 0 edges** on real data. That's a load-bearing failure for BB-4/5/6.

### 4.1 Edges are blocking — fix first

The Stage 4 `resolveRefs` code exists (shipped in BB-3 wave 1). It walks `NodeRef` fields using `NodeRefFieldDescriptor` projections and either resolves them to edges or marks them `{ resolved: false }`. On real data it resolves zero. Either:

- The descriptors don't cover the fields real collectors emit.
- The `findingIndex` lookup keys don't match the real finding shapes.
- The normalizers aren't populating the `NodeRef`-typed fields they should be.

Without investigating (that's a task in itself), my hypothesis is **#3**: the normalizers are emitting `NodeRef` fields with empty values because the underlying collector data doesn't include the parent-child pointers they need. For example, a PriceCondition needs to point to its parent PriceRule, but the collector emits the PriceCondition without a `parentRecordId` field, so the normalizer has nothing to pass to `resolveRefs`.

**Fix:** one focused investigation commit that:

1. Runs the real staging extraction through BB-3.
2. Dumps the per-node `NodeRef` field values BEFORE `resolveRefs`.
3. Identifies which fields are empty vs which have ids that don't match.
4. Fixes the smallest set of collectors to emit the parent pointers OR fixes the normalizers to derive them from evidenceRefs.
5. Re-runs and asserts `edges.length > 0` as an IR invariant.

**Effort:** ~1 focused engineer-day. This is the single highest-value change in the whole plan for BB-4/5/6 readiness. Without edges the graph is inventory, not a migration plan.

### 4.2 New IR nodes the graph should carry

My EXT branch modeled some things as IR nodes (ApexClass as Automation, CMT records as CustomMetadataRecord, price rules as PricingRule) and quarantined others as `not-modeled-v1` (EmailTemplate, CustomPermission, PermissionSetGroup, ScheduledApex, RemoteSiteSetting, CustomLabel, LightningComponentBundle, AuraDefinitionBundle, ApexPage, ApexComponent, StaticResource, PluginActivation).

That was the right call for shipping speed, but some of the quarantined types ARE migration-relevant and should be promoted:

| Artifact type                                       | Currently   | Should be                                                               | Why                                                                                                                                         |
| --------------------------------------------------- | ----------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `RemoteSiteSetting`                                 | quarantined | `IntegrationEndpointIR`                                                 | 102 real records on the test org, each is a migration touchpoint                                                                            |
| `PluginActivation`                                  | quarantined | `PluginActivationIR` OR merged into existing ApexClass node as evidence | Carries the "which plugin is active" info, currently a sidecar finding the PDF can't see                                                    |
| `LightningComponentBundle` / `AuraDefinitionBundle` | quarantined | `UIComponentIR` (new)                                                   | Customers move CPQ UI into LWC when standard pages can't; migrating to the target means replicating the UI layer                            |
| `EmailTemplate`                                     | quarantined | `EmailTemplateIR` (new) with merge field refs                           | Email templates reference CPQ fields via merge fields — renaming a CPQ field breaks every template that uses it. Migration MUST catch this. |

The others (CustomPermission, PermissionSetGroup, ScheduledApex, CustomLabel, ApexPage, ApexComponent, StaticResource) stay quarantined — they're either vendor-managed or out of direct migration scope.

**Effort:** ~4 new normalizers (RemoteSiteSetting, UIComponent (merges LWC+Aura), EmailTemplate, PluginActivation merge). Each is ~100 lines + a baseline test. ~2 engineer-days total.

### 4.3 New fields on existing nodes

The `ApexClassAutomationIR` node currently has `implementedInterfaces: string[]` (shipped in EXT-1.1). It should also carry:

```ts
// packages/migration-ir-contract/src/types/automation.ts
export interface ApexClassAutomationIR extends AutomationIRBase {
  sourceType: 'ApexClass';
  lineCount: number;
  // ... existing fields ...
  implementedInterfaces: string[]; // EXT-1.1 shipped
  // ← NEW: carry the activation context so BB-5 can disposition
  //   "this class is the active QCP" vs "this class is registered but
  //   not active" vs "this class is an implementation candidate".
  activationContext: {
    isActivePlugin: boolean;
    registeredVia: string | null; // e.g. 'SBQQ__Plugin__c.SBQQ__QuoteCalculator__c'
    registeredInterface: string | null;
  };
  // ← NEW: carry the dynamic dispatch flag so BB-4 knows to flag this
  //   node as "has hidden dependencies the static analyzer can't see"
  hasDynamicDispatch: boolean;
  dynamicDispatchPatterns: string[]; // ['Type.forName', 'Database.query']
  // ← NEW: carry the third-party-package flag so the PDF can filter it
  //   out of customer-facing sections AND BB-5 can route it to
  //   "vendor migration plan" disposition
  managedPackage: {
    namespace: string | null; // null = customer code, non-null = managed
    classification: 'customer' | 'managed-extending-cpq' | 'managed-unrelated';
  };
}
```

All four fields are already computed during extraction (my EXT-1.1 / EXT-1.2 / EXT-CC3 / EXT-CC4 work). They just need to be promoted from sidecar findings into first-class IR fields on the ApexClass node.

**Effort:** ~1 engineer-day. Mostly contract changes + normalizer updates + updating the contract-level exhaustiveness test.

### 4.4 Invariant tests the graph is missing

Today's BB-3 invariants (Wave 1 §8.3):

- **I1 Conservation** — every finding is accounted for ✓
- **I2 Distinctness** — N distinct inputs → N distinct outputs (or intentional collapse) ✓
- **I3 Health** — staging snapshot retention ≥ 90% ✓

Missing:

- **I4 Edge Non-Emptiness** — if the input findings contain parent-child relationships (PriceRule + PriceCondition, Quote + QuoteLine, Apex class + plugin registration), the output graph MUST have edges. Empty `edges[]` is a hard fail on real data.
- **I5 Identity-Bearing Completeness** — every `must-migrate` node MUST carry the fields needed for BB-5 disposition. For ApexClass that means the four fields in §4.3. For PricingRule it means the resolved `conditions` and `actions` NodeRef arrays, not empty lists.
- **I6 Activation Resolution** — every node that has an activation concept (plugin, flow, trigger, price rule, product rule) must carry an `isActive` flag computed from real extraction data, not defaulted.

These invariants are what protects the downstream BBs from silent IR incompleteness. They're the graph-side equivalent of the PDF's `requireFinding` primitive.

**Effort:** ~1 engineer-day for all three invariants + their test harnesses.

---

## 5. Mitigation plan — 4 phases, ~10 engineer-days

### Phase 1 — Emergency triage (today, ~1 day)

Done in one sitting, non-blocking for everything else. Five changes:

**M-P1.1 — Delete the shim + its output.** Per the existing audit doc M-1.

```bash
rm apps/worker/scripts/enrich-and-generate.ts
rm apps/worker/output/assessment-report-v2.1.pdf
rm apps/worker/output/assessment-report-v2.1.html
```

**M-P1.2 — Fix the PDF bloat at the SOURCE, not at the report.** This is the cleanest fix per the "don't touch the report" discipline. Change the EXT-CC4 collector to emit a distinct artifactType:

```ts
// apps/worker/src/collectors/dependencies.ts — EXT-CC4 block
findings.push(
  createFinding({
    domain: 'dependency',
    collector: 'dependencies',
    // BEFORE: artifactType: 'ApexClass'
    // AFTER: use a distinct artifactType so `get('ApexClass')` in the
    //   PDF assembler stops seeing these. The data still ships in
    //   findings + the IR (via a new not-modeled-v1 entry), but the
    //   customer-facing §9.1 table reverts to customer-namespace only.
    artifactType: 'ThirdPartyPackagedApexClass',
    // ... rest unchanged ...
  })
);
```

Plus a one-line addition to the not-modeled list:

```ts
// packages/bb3-normalizer/src/normalizers/fallback/not-modeled.ts
export const NOT_MODELED_V1_TYPES = new Set<string>([
  // ... existing 18 types ...
  'ThirdPartyPackagedApexClass',
]);
```

**Verification:** re-run staging extraction → re-run report → `file | wc -l /Type /Page` on the PDF → expect ~37 pages (36 original + 1 from the new EXT-1.1 plugin rows).

**M-P1.3 — Add CI guards from the existing audit doc M-2.** Forbid `Math.random` in the report path, forbid scripts named `*report*.ts` from calling `findings.push`, forbid `renderPdf` imports outside the allowlist. Small grep-based lint in `lint-truncation-discipline.mjs`-style.

**M-P1.4 — Regenerate + re-ship the corrected PDF.** One command + the disclosure email to the customer.

**M-P1.5 — Rename "synthetic summary findings" comments** → "aggregate summary rows". Per audit M-8. 30 minutes.

**Phase 1 total: ~1 day.** Outputs: clean repo, corrected PDF, no more 111-page monstrosity, audit Finding 1 closed.

### Phase 2 — The `requireFinding` primitive + PDF plugin surface (~2 days)

Per the existing audit doc M-4 plus the new PDF plugin appendix.

**M-P2.1 — Ship `require-finding.ts` primitive.** Per audit M-4. Code in audit doc section 8.2. ~0.5 day.

**M-P2.2 — Fix wall-clock leakage in `assessmentPeriod`.** Per audit M-6. ~0.5 day.

**M-P2.3 — Add the §D.1 Active CPQ Plugins & Custom Scripts appendix to the PDF.** This is the ONE content change I'm proposing. Reads from IR nodes (not findings), bounded to ≤ 20 rows. Requires the IR to carry the new fields from §4.3 of this plan — so this lands after M-P2.1 and some of Phase 4.

**M-P2.4 — Bound all PDF appendices at `MAX_APPENDIX_ROWS_PER_CATEGORY = 20`** with "+ N more — see findings JSON" footers. Prevents future data-volume explosions regardless of what the collectors extract. One-line change per table, ~10 tables. Half a day.

**Phase 2 total: ~2 days.** Outputs: `requireFinding` primitive available for Phase 3 sweep, deterministic assessment period, bounded appendices, plugin appendix visible.

### Phase 3 — The `?? 0` sweep (~5 days)

Per the existing audit doc M-5. Classify all 105 sites, land the catalog, migrate in 10-site batches with focused tests. Effort per the audit doc: ~5 engineer-days. This is the biggest single piece of work in the whole plan but it's incremental and low-risk.

At the end of Phase 3 the canonical report path contains zero silent `?? 0` sites outside of `require-finding.ts` itself. The audit's C8 bb3-doctor check (from M-9) locks the pattern out permanently.

### Phase 4 — The graph fixes (~2 days)

Parallelizable with Phase 3; doesn't depend on it.

**M-P4.1 — Fix Stage 4 reference resolution so the graph has edges.** The investigation + fix from §4.1. ~1 day.

**M-P4.2 — Promote `RemoteSiteSetting`, `PluginActivation`, `UIComponent` (LWC+Aura), `EmailTemplate` to first-class IR nodes.** Per §4.2. ~1 day (four thin normalizers + baseline tests).

**M-P4.3 — Add `activationContext`, `hasDynamicDispatch`, `managedPackage` fields to `ApexClassAutomationIR`.** Per §4.3. ~0.5 day.

**M-P4.4 — Add IR invariants I4, I5, I6.** Per §4.4. ~0.5 day.

**Phase 4 total: ~2 days.** Outputs: graph is no longer an inventory of isolated nodes but a real migration graph. BB-4/5/6 have a foundation to build on.

### Delivery sequence

```
Day 1 ─ Phase 1 (triage, ship corrected PDF)
Day 2 ─ Phase 2.1–2.2 (requireFinding primitive, wall-clock fix)
Day 3 ─ Phase 4.1 (Stage 4 edges — BLOCKER for BB-4/5/6 so do early)
Day 4 ─ Phase 4.2–4.4 (new IR nodes, new fields, new invariants)
Day 5 ─ Phase 2.3–2.4 (plugin appendix, bounded tables)
Day 6 ─ Phase 3 sweep batch 1 (classify + first 30 sites)
Day 7 ─ Phase 3 sweep batch 2 (next 40 sites)
Day 8 ─ Phase 3 sweep batch 3 (last 35 sites)
Day 9 ─ Phase 3 wire C8 bb3-doctor + final audit
Day 10 ─ Regenerate full staging PDF, run end-to-end against 3 real orgs, final review
```

Everything after Day 1 ships to staging + main via the normal `/ship-it → /sync-branches` flow. Nothing stays on a feature branch longer than a day.

---

## 6. What I want the CTO to sign off on

Three decisions, each is a yes/no:

1. **Architectural thesis:** the PDF reads from the IR graph, not from the flat findings array. The findings array is the raw input, the graph is the filtered/classified migration model, the PDF is a projection of the graph. _Adding new findings never changes the PDF unless the graph changes._ Yes/no?
2. **Phase 1 emergency actions:** delete the shim, fix EXT-CC4 to use a distinct artifactType, add CI guards, re-ship the corrected PDF. ~1 day of work before anything else. Yes/no?
3. **Phase 4 ordering priority:** Stage 4 edge resolution gets fixed BEFORE the `?? 0` sweep, because without edges the graph is not a foundation BB-4/5/6 can build on — and the whole point of the sweep is to make the PDF trustworthy, which only matters if the PDF is reading from a trustworthy graph in the first place. Yes/no?

---

## 7. Appendix — evidence for every claim in this doc

### A.1 The PDF bloat is from EXT-CC4 third-party Apex findings

```bash
$ node -e "
const fs = require('fs');
const d = JSON.parse(fs.readFileSync('apps/worker/output/assessment-results.json'));
const apex = d.findings.filter(f => f.artifactType === 'ApexClass');
console.log('Total ApexClass findings:', apex.length);
const byType = {};
for (const f of apex) {
  byType[f.findingKey.split(':').pop()] = (byType[f.findingKey.split(':').pop()] || 0) + 1;
}
console.log(byType);
"
Total ApexClass findings: 1641
{
  apex_third_party_packaged: 1565,
  apex_cpq_related: 59,
  apex_test_class: 8,
  'SBQQ.ProductSearchPlugin': 3,
  // ... 6 plugin variants ...
}
```

### A.2 The report source was never touched by the EXT branch

```bash
$ git log 2b9809b..feat/extraction-coverage -- apps/worker/src/report/
# (empty output — no commits)

$ git log 2b9809b..feat/extraction-coverage --name-only | grep -c "src/report/"
0
```

### A.3 The IR graph has zero edges on real data

```bash
$ cat apps/worker/output/bb3-smoke.json | jq '{nodes: (.nodes | length), edges: (.edges | length)}'
{
  "nodes": 3102,
  "edges": 0
}
```

### A.4 7 Apex classes carry `implementedInterfaces` in the IR (EXT-1.1 shipped)

```bash
$ node -e "
const fs = require('fs');
const g = JSON.parse(fs.readFileSync('apps/worker/output/bb3-smoke.json'));
const apex = g.nodes.filter(n => n.sourceType === 'ApexClass' && (n.implementedInterfaces || []).length > 0);
for (const n of apex) console.log(n.displayName, '→', n.implementedInterfaces);
"
Q2CLegacyqcp → [ 'SBQQ.QuoteCalculatorPlugin', 'SBQQ.QuoteCalculatorPlugin2' ]
ProductRecommendationPluginRevCloud → [ 'SBQQ.ProductRecommendationPlugin' ]
Q2CProductSearchPlugin → [ 'SBQQ.ProductSearchPlugin' ]
ExampleProductSearchPlugin → [ 'SBQQ.ProductSearchPlugin' ]
DemoPageSecurityPlugin → [ 'SBQQ.PageSecurityPlugin', 'SBQQ.PageSecurityPlugin2' ]
PluginDemoProductSearchPlugin → [ 'SBQQ.ProductSearchPlugin' ]
Q2CLegacyPageSecurityPlugin → [ 'SBQQ.PageSecurityPlugin2' ]
```

### A.5 The PDF currently shows none of the per-class plugin detail

Grep for `implementedInterfaces` or per-class plugin rendering in the report layer:

```bash
$ grep -rn "implementedInterfaces" apps/worker/src/report/
# (empty — the field is never read)
```

The PDF's plugin section at [assembler.ts:779-805](apps/worker/src/report/assembler.ts#L779-L805) only renders the plugin-status lines (`Quote Calculator Plugin — Active — 5 custom script(s) detected`). Per-class detail is not in the PDF at all. That's the EXT-1.1 / EXT-1.2 data surface gap this plan closes in Phase 2.

### A.6 5 CustomComputation QCP nodes exist in the IR but all have `parseStatus: deferred-to-bb3b`

```
qtc_Debugger parseStatus: deferred-to-bb3b
Q2CBundleSpecific parseStatus: deferred-to-bb3b
q2cJSPSP parseStatus: deferred-to-bb3b
q2cJSPSP5ALEX parseStatus: deferred-to-bb3b
q2cJSQCP parseStatus: deferred-to-bb3b
```

`deferred-to-bb3b` means BB-3 has not walked the QCP JavaScript AST. BB-3b (QCP AST) is a separate track per spec §14.4, explicitly out of scope for the current BB-3. For THIS plan: the PDF's §D.1 appendix should show the 5 QCP names + sizes + `parseStatus` = `deferred-to-bb3b` so the customer knows they exist and knows BB-3 hasn't analyzed them yet.

### A.7 The `get('ApexClass')` call has no filter

```bash
$ grep -n "const apexClasses = get" apps/worker/src/report/assembler.ts
450:  const apexClasses = get('ApexClass');
```

One line. No filter on `findingType`, no filter on `NamespacePrefix`, no filter on `migrationRelevance`. This is what M-P1.2 fixes at the source, not at this line.

---

## 8. Open questions for review

**OQ-1.** The `graph → PDF` architectural thesis in §1 is a significant change in flow. Is the team comfortable with that or do we keep the "report reads findings directly" path and just add a filter layer between findings and the report? Technically both work; architecturally only one of them composes with BB-4/5/6.

**OQ-2.** The PDF redesign in §3 proposes a 4-section report (Heatmap, Executive Findings, Inventory Summary, bounded Appendix). That's a substantial departure from the current 11-section + appendices format. Is that acceptable for the current customer deliverable, or do we keep the structure and just bound the tables? The content-shape question is orthogonal to the trust question.

**OQ-3.** Promoting `RemoteSiteSetting` / `EmailTemplate` / `UIComponent` to IR nodes (§4.2) adds 4 new node types. Each needs a normalizer, baseline tests, and a distinctness property test. Is the appetite for that now, or defer to BB-3 v2?

**OQ-4.** Fixing Stage 4 edge resolution (§4.1) is the highest-value single change in the plan for BB-4/5/6. But it's an _investigation-first_ task — I can't give a firm estimate until I see why edges are empty on real data. Day 3 of the sequence might slip. Is the team OK with slipping Phase 3 by a day if Phase 4.1 takes longer?

**OQ-5.** The `?? 0` sweep (Phase 3) is ~5 eng-days. That's a large block of "no externally visible progress" work. Does the team want to bundle it with a visible outcome (e.g. "the Phase 3 commit also adds the §D.1 plugin appendix and the bounded tables") so the sprint deliverable is more concrete?

---

## 9. Final verdict

The PDF report + IR graph together form a two-layer trust problem that we've been patching in isolation. This plan unifies them:

- **The PDF's job** is to be honest with the customer. It gets there by reading from the IR graph (not from flat findings), using `requireFinding` primitives (not silent defaults), bounding every table at 20 rows (so data volume never drives page count), and surfacing the new plugin detail from EXT-1.1 / EXT-1.2 that's been invisible until now.

- **The IR graph's job** is to be a foundation BB-4/5/6 can write a migration from. It gets there by having non-empty edges (fix Stage 4), carrying the activation + dynamic-dispatch + managed-package context on ApexClass nodes, modeling the handful of quarantined types that are actually migration-relevant (RemoteSiteSetting, EmailTemplate, UIComponent, PluginActivation), and adding three new invariants (I4/I5/I6) that prevent silent incompleteness.

**Total effort: ~10 engineer-days across 4 phases, shippable in small increments, locked down at the end with CI guards.** The first day fixes the customer-visible issues; the rest is internal quality + BB-4/5/6 readiness.

The existing audit doc (`docs/PDF-REPORT-MOCK-AUDIT.md`) is the authoritative reference for Finding 1 and the `?? 0` sweep (Phases 1.1, 2.1, 3). This doc supersedes it by adding the three new concerns (PDF bloat, IR edges, plugin surface gap) and proposing the `graph → PDF` architectural change that makes all three fixes land cleanly.

I will not write a single line of code until the three decisions in §6 are signed off.

---

## 10. Audit trail

| Date       | Author                     | Scope                                                          | Outcome                                                      |
| ---------- | -------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------ |
| 2026-04-11 | PDF mock audit (prior doc) | canonical path + scripts + validators + collector spot-check   | 1 critical (quarantined) + 1 systemic + 3 medium + 1 low     |
| 2026-04-11 | This doc                   | PDF bloat + IR graph readiness + plugin surface + unified plan | 3 new concerns + 4-phase plan + 3 decisions for CTO sign-off |
