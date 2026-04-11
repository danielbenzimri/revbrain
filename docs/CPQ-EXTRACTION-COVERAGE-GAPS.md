# CPQ Extraction — Coverage Gaps and Closure Plan

**Status:** Draft for architectural review (v1.1 — audit-corrected)
**Audience:** Software architects and migration engineers reviewing the completeness of the CPQ extraction worker (`apps/worker/`) prior to Wave-2 scope freeze.
**Author:** Extraction-coverage audit, generated against `feat/bb3-wave1`.
**Scope:** This document enumerates _known and verified_ gaps in the customer-org extraction surface. It does **not** cover normalization (`packages/bb3-normalizer/`), reporting, or downstream LLM consumption — only the question "what is the worker missing when it walks a Salesforce CPQ org?"

> [!IMPORTANT]
> **v1.1 audit corrections** — This version incorporates fixes from an architectural audit that identified six Salesforce API impossibilities in the original closure plans. The corrected sections are marked with **(v1.1 fix)** annotations. See §11 for the audit trail.

---

## 1. Executive summary

The extraction worker covers the dominant CPQ artifacts well: configuration objects (`SBQQ__*`), JavaScript Quote Calculator Plugins (full source), customer Apex classes and triggers (full source), CPQ-related flows (inventory only), validation rule presence, custom settings (with hierarchy overrides), and integration metadata (named credentials, connected apps, external services).

It **does not** cover several artifact classes that, in real customer orgs, frequently host migration-relevant logic:

1. Apex implementations of CPQ plugin interfaces are pulled as raw source but not classified as plugins, so the report cannot answer "which Apex class is the active `QuoteCalculatorPluginInterface`?"
2. Custom Metadata Type **records** (the actual config-as-data) are not extracted — only the type definitions.
3. Validation rule **formulas** are not extracted — only the rule names and active flags.
4. JavaScript embedded in quote templates is truncated to 2,000 characters.
5. Lightning Web Components, Aura components, Visualforce pages and components, general Static Resources, Email Templates, Flow XML bodies, and Remote Site Settings are not extracted at all.
6. Several runtime-determined behaviors (`Type.forName`, dynamic SOQL, scheduled Apex registrations, package config that selects which plugin is active) are not resolved.

For an in-place "describe-the-org" assessment these gaps are tolerable. For a **migration** system — one that has to give a defensible answer to "if we cut over to Revenue Cloud Advanced tomorrow, what breaks?" — they are not.

---

## 2. Definitions

| Term                      | Meaning                                                                                                                                                                                                                                                  |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Code-bearing artifact** | Any Salesforce metadata or data record whose value is a string of source code (Apex, JavaScript, SOQL, formula expression, flow XML, HTML/CSS/JS bundle) that executes or transforms data at runtime.                                                    |
| **Plugin**                | A customer-supplied implementation of a Salesforce CPQ extension point — either a JavaScript Quote Calculator Plugin (`SBQQ__CustomScript__c` + Static Resource) or an Apex class implementing one of the `SBQQ.*PluginInterface` / `sbaa.*` interfaces. |
| **Migration-relevant**    | Capable of changing the result of a quote calculation, the visibility of a field, the state of a record, or the external systems contacted during a quote lifecycle.                                                                                     |
| **Silent miss**           | A class of artifact that exists in the source org and is not surfaced anywhere in the extractor's output, with no warning or counter to indicate its absence.                                                                                            |
| **Inventory-only**        | The artifact's existence and basic metadata are captured, but its body / contents / configuration are not. Sufficient for sizing but not for migration analysis.                                                                                         |
| **Body-extracted**        | The full source / contents of the artifact are stored in `AssessmentFinding.textValue` (gated by `config.codeExtractionEnabled`).                                                                                                                        |

---

## 3. Coverage matrix

Each row is verified against the codebase at `feat/bb3-wave1`. Citations point to the SOQL query that defines coverage.

| #     | Artifact                                                                                                                                                                                                                                                    | Status                                     | Body?                              | Citation                                                                                                                                                                                                              |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ | ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | JS Quote Calculator Plugin (`SBQQ__CustomScript__c`)                                                                                                                                                                                                        | Extracted                                  | Yes                                | [pricing.ts:316-405](file:///Users/danielaviram/repos/revbrain/apps/worker/src/collectors/pricing.ts#L316-L405)                                                                                                       |
| 2     | Customer Apex classes (`NamespacePrefix = null`, `Status = 'Active'`)                                                                                                                                                                                       | Extracted                                  | Yes                                | [dependencies.ts:60-145](file:///Users/danielaviram/repos/revbrain/apps/worker/src/collectors/dependencies.ts#L60-L145)                                                                                               |
| 3     | Customer Apex triggers (`NamespacePrefix = null`, `Status = 'Active'`)                                                                                                                                                                                      | Extracted                                  | Yes                                | [dependencies.ts:154-203](file:///Users/danielaviram/repos/revbrain/apps/worker/src/collectors/dependencies.ts#L154-L203)                                                                                             |
| 4     | Flows (CPQ-related, via `FlowDefinitionView`)                                                                                                                                                                                                               | Inventory only                             | **No**                             | [dependencies.ts:209-305](file:///Users/danielaviram/repos/revbrain/apps/worker/src/collectors/dependencies.ts#L209-L305)                                                                                             |
| 5     | Workflow Rules (legacy)                                                                                                                                                                                                                                     | Count only                                 | No                                 | [dependencies.ts:310-322](file:///Users/danielaviram/repos/revbrain/apps/worker/src/collectors/dependencies.ts#L310-L322)                                                                                             |
| 6     | Validation Rules                                                                                                                                                                                                                                            | Inventory only                             | **No** (formula body not selected) | [customizations.ts:146-194](file:///Users/danielaviram/repos/revbrain/apps/worker/src/collectors/customizations.ts#L146-L194)                                                                                         |
| 7     | Formula fields (CPQ objects)                                                                                                                                                                                                                                | Extracted                                  | Yes                                | [customizations.ts:61-101](file:///Users/danielaviram/repos/revbrain/apps/worker/src/collectors/customizations.ts#L61-L101)                                                                                           |
| 8     | Custom Metadata Types                                                                                                                                                                                                                                       | Type names only                            | **No** records                     | [customizations.ts:114-139](file:///Users/danielaviram/repos/revbrain/apps/worker/src/collectors/customizations.ts#L114-L139)                                                                                         |
| 9     | Custom Settings (`SBQQ` namespace)                                                                                                                                                                                                                          | Extracted with hierarchy                   | Yes (values)                       | [settings.ts:114-350](file:///Users/danielaviram/repos/revbrain/apps/worker/src/collectors/settings.ts#L114-L350)                                                                                                     |
| 10    | Quote Templates + Sections + Line Columns                                                                                                                                                                                                                   | Extracted                                  | n/a                                | [templates.ts:55-400](file:///Users/danielaviram/repos/revbrain/apps/worker/src/collectors/templates.ts#L55-L400)                                                                                                     |
| 11    | Quote Template `<script>` blocks                                                                                                                                                                                                                            | Extracted but **truncated to 2,000 chars** | Truncated                          | [templates.ts:304-305](file:///Users/danielaviram/repos/revbrain/apps/worker/src/collectors/templates.ts#L304-L305)                                                                                                   |
| 12–19 | Approvals, Named Credentials, External Data Sources, Connected Apps, Outbound Messages, External Services, Platform Events                                                                                                                                  | Extracted                                  | n/a                                | Various in [approvals.ts](file:///Users/danielaviram/repos/revbrain/apps/worker/src/collectors/approvals.ts), [integrations.ts](file:///Users/danielaviram/repos/revbrain/apps/worker/src/collectors/integrations.ts) |
| 20    | Permission Sets (CPQ-related)                                                                                                                                                                                                                               | Inventory only                             | n/a                                | [dependencies.ts:329-359](file:///Users/danielaviram/repos/revbrain/apps/worker/src/collectors/dependencies.ts#L329-L359)                                                                                             |
| 21–40 | Custom Permissions, PSGs, Static Resources, LWC, Aura, VF, Email Templates, Remote Sites, Page Layouts, FlexiPages, Scheduled Apex, Plugin classification, Plugin activation, FLS introspection, Doc-gen packages, Translations, Field history, Big Objects | **Missing**                                | —                                  | —                                                                                                                                                                                                                     |

---

## 4. Why these are real migration gaps

**P1. Migration systems must be defensible against the question "did we miss anything?"**
Every silent miss is a defect in the risk score that the customer will discover only after committing to a migration path.

**P2. The interesting code lives where you don't look first.**
Customers move logic into extension points when standard CPQ can't express what they need. A tool that only inspects standard objects will systematically understate migration cost on the customers who need it most.

**P3. Inventory is not analysis.**
"We found 47 flows" is not the same as "we know what the 47 flows do."

---

## 5. Tier 1 gaps — these will produce silent migration defects

### Gap 1.1 — Apex CPQ plugin interface classification

**Current state.** [dependencies.ts:60-145](file:///Users/danielaviram/repos/revbrain/apps/worker/src/collectors/dependencies.ts#L60-L145) extracts every customer-namespace `ApexClass` with body and flags each with business concerns (`pricing`, `approvals`, `quote-sync`, `integration`) via substring matching. It does **not** detect `implements SBQQ.*PluginInterface`. A class implementing `QuoteCalculatorPluginInterface` is indistinguishable from a utility class that happens to mention `SBQQ__Quote__c`.

**Closure plan.**

1. Add a deterministic `implements\s+(SBQQ|sbaa)\.\w+(PluginInterface|Condition|ChainCustomCondition)\b` scan after the body is fetched. Emit a separate finding with `findingType: 'cpq_apex_plugin'` and an `interfaceName` field on `evidenceRefs`.
2. For each detected interface, set `rcaTargetConcept` and `rcaMappingComplexity` from a static lookup table.
3. Cross-link with the active-plugin resolution from Gap 1.2.

**Effort.** ~0.5 day (regex), ~1.5 days (tree-sitter stretch).

---

### Gap 1.2 — Plugin registration / activation resolution

**Current state.** [settings.ts:114-350](file:///Users/danielaviram/repos/revbrain/apps/worker/src/collectors/settings.ts#L114-L350) extracts all SBQQ-namespaced custom settings with their hierarchy values, but stores them as flat fields without semantic interpretation. No cross-linking resolves which Apex class or QCP is the _active_ plugin.

**Closure plan.**

1. Catalog the CPQ "Plugins tab" custom settings (~20 fields across 3 settings objects). Encode as a static map: `(settingObject, fieldApiName) → pluginInterfaceName`.
2. After settings collector runs, walk the map and for each non-null value, find the matching Apex class / QCP and mark `isActivePlugin: true`.
3. Handle the absence case: record `usesStandardImplementation: true`.

**Effort.** ~1 day. **Depends on:** Gap 1.1.
**Risks.** CPQ settings field names change across major CPQ versions; the map should be versioned against the detected CPQ package version.

---

### Gap 1.3 — Custom Metadata Type records (v1.1 fix: query approach)

**Current state.** [customizations.ts:114-139](file:///Users/danielaviram/repos/revbrain/apps/worker/src/collectors/customizations.ts#L114-L139) queries only `DeveloperName` and `NamespacePrefix` for CMT types. Actual records are not queried.

> [!WARNING]
> **(v1.1 fix)** The original closure plan proposed `SELECT FIELDS(STANDARD), * FROM <Type>__mdt LIMIT 50000`. This is **illegal SOQL**: (a) `*` is not valid column projection, (b) `FIELDS(STANDARD)` and `FIELDS(ALL)` require a hard `LIMIT 200`.

**Corrected closure plan.**

1. For each discovered CMT type, call the REST API describe endpoint: `GET /services/data/vXX.X/sobjects/<Type>__mdt/describe/` to dynamically retrieve the field API names.
2. Construct an explicit `SELECT Id, DeveloperName, MasterLabel, <field1>, <field2>, ... FROM <Type>__mdt LIMIT 5000` using the discovered fields. Explicit `SELECT` with a named field list has no 200-row limit.
3. Cap per-type at a configurable limit (default 5,000 records) and flag in `warnings` if hit.
4. Heuristically classify CMTs that look like rules engines (by row count > 10 and presence of fields named `Active__c`, `Sequence__c`, `Condition__c`) as `rcaTargetConcept: 'DecisionTable candidate'`.

**Effort.** ~1.5 days.

---

### Gap 1.4 — Validation rule formula bodies (v1.1 fix: Tooling API constraints)

**Current state.** [customizations.ts:146-194](file:///Users/danielaviram/repos/revbrain/apps/worker/src/collectors/customizations.ts#L146-L194) queries `ValidationRule` selecting only `Id, ValidationName, Active, Description`. The `Metadata.errorConditionFormula` field is **not** selected. The comment at [customizations.ts:8](file:///Users/danielaviram/repos/revbrain/apps/worker/src/collectors/customizations.ts#L8) incorrectly claims "formulas preserved for LLM."

> [!WARNING]
> **(v1.1 fix)** The original closure plan proposed a bulk `SELECT Id, ValidationName, Metadata FROM ValidationRule WHERE ...`. The Tooling API **rejects** this with `MALFORMED_QUERY` — the `Metadata` and `FullName` columns require a strong filter (typically `WHERE Id = '...'` or `WHERE Id IN (...)`).

**Corrected closure plan.**

1. Keep the existing bulk query (`SELECT Id, ValidationName, Active, Description FROM ValidationRule WHERE ...`) for enumeration.
2. Batch the collected IDs into chunked `Metadata`-fetching queries: `SELECT Id, Metadata FROM ValidationRule WHERE Id IN ('<id1>', ..., '<idN>')` with a chunk size of 10–25 IDs per query.
3. Extract `Metadata.errorConditionFormula` from the returned JSON blobs.
4. Store the formula body in `textValue` (gated by `codeExtractionEnabled`).
5. Parse field references using the same regex as formula fields.
6. Fix the misleading comment at `customizations.ts:8`.

**Effort.** ~0.75 day.

---

### Gap 1.5 — Quote template `<script>` block truncation

**Current state.** [templates.ts:304-305](file:///Users/danielaviram/repos/revbrain/apps/worker/src/collectors/templates.ts#L304-L305) stores script blocks via `scripts.join('\n---\n').slice(0, 2000)`. The 2,000-character cap is hard-coded and silent. Additionally, [templates.ts:311](file:///Users/danielaviram/repos/revbrain/apps/worker/src/collectors/templates.ts#L311) truncates the first evidence snippet to 500 characters.

**Closure plan.**

1. Remove the hard cap. Store the full joined script body in `textValue`.
2. For very large blobs (>100 KB — see OQ-2), spill to object storage with a reference. This pattern is needed for Gap 1.7 and should be designed once.

**Effort.** ~0.25 day immediate fix, ~1 day with spill-to-storage pattern.

---

### Gap 1.6 — Flow XML body extraction (v1.1 fix: correct API surface)

**Current state.** [dependencies.ts:209-305](file:///Users/danielaviram/repos/revbrain/apps/worker/src/collectors/dependencies.ts#L209-L305) records flow inventory via `FlowDefinitionView` but does not fetch the flow definition body.

> [!WARNING]
> **(v1.1 fix)** The original closure plan hallucinated a `SELECT Definition FROM FlowVersionView` column that does not exist on `FlowVersionView` via SOQL or the Tooling API.

**Corrected closure plan — two viable options:**

**Option A: Tooling API `Flow` object with batched `Metadata` queries.**

1. For each CPQ-related flow, collect the `ActiveVersionId` (already available from FlowDefinitionView).
2. Batch IDs and query: `SELECT Id, Metadata FROM Flow WHERE Id IN ('<id1>', ..., '<idN>')` with chunks of 10 IDs (same strong-filter pattern as Gap 1.4).
3. The `Metadata` column returns a JSON representation of the flow including all elements, decisions, and formulas.

**Option B: Metadata API `retrieve()` for the `Flow` component type.**

1. Issue a Metadata API `retrieve()` for CPQ-related flows by `DeveloperName`.
2. Unzip the archive and extract each flow's XML definition.

**Recommended:** Option A if the worker has Tooling API `Metadata` support (reusable from Gap 1.4). Option B if the worker already has Metadata API SOAP plumbing.

4. Classify each flow with a deterministic complexity score: `simple` (≤5 elements), `medium` (6–25), `high` (26–100), `very-high` (>100).

**Effort.** ~2 days.

---

### Gap 1.7 — LWC, Aura, Visualforce, Static Resource bundles (v1.1 fix: MIME handling)

**Current state.** None of these artifact types are extracted. Zero hits for `LightningComponentBundle`, `AuraDefinitionBundle`, `ApexPage`, `ApexComponent`, or `StaticResource` across `apps/worker/src/`.

> [!WARNING]
> **(v1.1 fix — MIME type filtering is untrustworthy.)** Salesforce mangles MIME types during file uploads — `.js` files frequently arrive as `application/octet-stream` or `text/plain`. Filtering by `ContentType` will produce silent misses.
>
> **Corrected Static Resource body extraction policy:**
>
> 1. **Primary signal:** file extension on `Name` (`.js`, `.html`, `.json`, `.css`, `.xml`).
> 2. **Secondary signal:** `BodyLength` — extract all resources below 3 MB regardless of MIME type.
> 3. **Binary exclusion:** Skip only resources with known binary magic bytes (PNG, JPEG, ZIP, PDF headers) AND non-text `Name` extensions.

**Closure plan.** Add a new collector `apps/worker/src/collectors/components.ts` (Tier 2, ~10 min budget) covering LWC, Aura, VF pages/components, and Static Resources. Cross-reference extracted JS QCP bodies against the Static Resource inventory to detect split-QCP patterns.

**Effort.** ~3 days.

---

## 6. Tier 2 gaps — these will produce known-incomplete reports

| Gap                             | Description                                                                                                                           | Effort   |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| 2.1 — Email Templates           | `EmailTemplate` body/HTML not extracted. Merge field references hidden from dependency graph.                                         | 0.5 day  |
| 2.2 — Custom Permissions / PSGs | `CustomPermission` not extracted; `PermissionSetGroup` not inventoried. Feature flags invisible.                                      | 1 day    |
| 2.3 — Scheduled Apex            | `CronTrigger` / `AsyncApexJob` not queried. Cannot distinguish scheduled-critical from idle Apex.                                     | 0.5 day  |
| 2.4 — Page Layouts / FlexiPage  | Deferred per [metadata.ts](file:///Users/danielaviram/repos/revbrain/apps/worker/src/collectors/metadata.ts). SOAP plumbing required. | 3 days   |
| 2.5 — Remote Site Settings      | `RemoteSiteSetting` not extracted. Cannot cross-reference callout authorizations.                                                     | 0.25 day |
| 2.6 — Doc-gen packages          | DocuSign Gen / Conga / Drawloop templates and configs not inventoried.                                                                | 2 days   |
| 2.7 — Translation Workbench     | Multi-language field translations not extracted.                                                                                      | 0.5 day  |
| 2.8 — Field history tracking    | Field history tracking config not extracted.                                                                                          | 0.25 day |

---

## 7. Cross-cutting gaps

### CC-1 — Self-introspection of permissions (v1.1 fix: FLS)

> [!CAUTION]
> **(v1.1 fix)** `View All Data` does **NOT** override Field-Level Security. An integration user with VAD but without FLS read on `SBQQ__Quote__c.SBQQ__TargetCustomerAmount__c` will silently fail to extract that field from any SOQL query — the field is simply absent with no error.

**Corrected closure.** Query `FieldPermissions` for the running user's effective permission set aggregate against all `SBQQ__*` fields. Compare against a "minimum required FLS" baseline — the set of fields the extractor's queries actually project. Fail loudly if required fields lack FLS read.

**Effort.** ~1.5 days.

### CC-2 — Apex test class filtering

[dependencies.ts:60-145](file:///Users/danielaviram/repos/revbrain/apps/worker/src/collectors/dependencies.ts#L60-L145) does not exclude `@isTest` classes. They inflate `cpqRelatedApexClasses` counts and line totals.

**Closure.** Detect `@isTest` annotation, emit as separate finding type with `isTestClass: true`. **Effort.** ~0.25 day.

### CC-3 — Dynamic dispatch and runtime-resolved types (v1.1 fix: QCP patterns)

> [!IMPORTANT]
> **(v1.1 fix)** The original plan omitted the most dangerous QCP-specific pattern: **JSForce connection queries.** QCPs receive a JSForce `conn` object from the CPQ runtime. `conn.query(dynamicallyBuiltSoql)` has a dependency invisible to static analysis and is the primary hidden-dispatch vector in QCP source.

**Corrected pattern list:**

- **Apex:** `Type\.forName\b`, `Type\.newInstance\b`, `Database\.query\(`, `Database\.queryLocator\(`
- **QCP JavaScript:** `\beval\s*\(`, `new\s+Function\s*\(`, `import\s*\(`
- **QCP JSForce (critical):** `conn\.query\s*\(`

**Effort.** ~0.5 day.

### CC-4 — Managed-package extension via global classes

Add a second Apex query pass for `WHERE NamespacePrefix NOT IN ('SBQQ', 'sbaa', 'blng', ...) AND NamespacePrefix != null`. Mark as `inThirdPartyManagedPackage: true`. **Effort.** ~0.5 day.

### CC-5 — Body fetch determinism

Tag each finding with `stability: 'metadata' | 'runtime'`. **Effort.** ~0.25 day.

### CC-6 — Truncation discipline

Truncation sites without flags: [dependencies.ts:119](file:///Users/danielaviram/repos/revbrain/apps/worker/src/collectors/dependencies.ts#L119), [pricing.ts:380](file:///Users/danielaviram/repos/revbrain/apps/worker/src/collectors/pricing.ts#L380), [templates.ts:305](file:///Users/danielaviram/repos/revbrain/apps/worker/src/collectors/templates.ts#L305), [templates.ts:311](file:///Users/danielaviram/repos/revbrain/apps/worker/src/collectors/templates.ts#L311).

**Closure.** Adopt a single utility `truncateWithFlag(value, maxBytes)` returning `{ value, wasTruncated, originalBytes }`. **Effort.** ~0.5 day.

---

## 8. Recommended remediation order

| Order | Gap                                    | Effort   | Rationale                                                    |
| ----- | -------------------------------------- | -------- | ------------------------------------------------------------ |
| 1     | Gap 1.4 — Validation rule formulas     | 0.75 day | High value, removes a false comment in code.                 |
| 2     | Gap 1.1 — Apex plugin classification   | 0.5 day  | Reclassifies existing bodies, immediate report-quality jump. |
| 3     | Gap 1.5 — Template script truncation   | 0.25 day | Prevents silent data loss.                                   |
| 4     | CC-2 — Test class filtering            | 0.25 day | Cleans metrics before other gaps worsen them.                |
| 5     | CC-6 — Truncation discipline           | 0.5 day  | Foundation utility for new body-extraction collectors.       |
| 6     | CC-1 — Permission introspection        | 1.5 days | Prevents silently wrong reports.                             |
| 7     | Gap 1.2 — Plugin activation            | 1 day    | Depends on 1.1. Highest-leverage interpretive gap.           |
| 8     | Gap 1.3 — CMT records                  | 1.5 days | Largest content gap.                                         |
| 9     | Gap 1.6 — Flow XML                     | 2 days   | Required for modern automation coverage.                     |
| 10    | Gap 1.7 — LWC/Aura/VF/Static Resources | 3 days   | Largest silent-miss class. Needs spill-to-storage from 1.5.  |
| 11–21 | CC-3, CC-4, Tier 2 gaps                | ~8 days  | See individual estimates above.                              |

**Total Tier-1 closure:** ~14.75 engineer-days. **Total full closure:** ~22 engineer-days.

---

## 9. Verification methodology

**V-1 — Synthetic completeness fixture.** Maintain a sandbox seeded with one instance of every covered artifact class. Run the extractor and assert each is found, classified, and body-extracted where applicable.

**V-2 — Customer-org parity audit.** For each closed gap, run against three real customer orgs. Engineer's manual enumeration must match the extractor's output.

**V-3 — Negative-case verification.** Assert the absence case: an org with no QCP plugins produces "no plugins detected," not a missing finding.

**V-4 — Permission downgrade test.** Run with the integration user stripped of VAD/MAD. CC-1 must fail loudly.

**V-5 — Spec-to-code traceability.** Each closed gap must have a corresponding section in `docs/CPQ-EXTRACTION-SPEC.md`.

---

## 10. Open questions for architectural review

**OQ-1.** Third-party managed package Apex: include bodies with `ownedByCustomer: false` flag?

**OQ-2.** Inline vs. spill-to-storage threshold: recommend 100 KB inline cap.

**OQ-3.** Per-CPQ-version plugin registration map: recommend yes, versioned against detected CPQ package version.

**OQ-4.** Legitimate FLS restrictions: distinguish "required for collector function" (hard fail) from "affects coverage breadth" (warn).

**OQ-5.** Big Object archives: detect and report inventory; defer body extraction.

**OQ-6.** `components.ts` failure mode: per-sub-collector status, aggregate to `completed_warnings`.

---

## 11. Audit trail

| Date       | Version | Change                                             | Author                    |
| ---------- | ------- | -------------------------------------------------- | ------------------------- |
| 2026-04-11 | 1.0     | Initial draft                                      | Extraction coverage audit |
| 2026-04-11 | 1.1     | Audit-response pass — 6 Salesforce API corrections | Architectural review      |

### v1.1 audit corrections

| #   | Finding                                                                                | Where addressed                                                                             |
| --- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| 1   | Gap 1.3: illegal `SELECT FIELDS(STANDARD), *` and `LIMIT 50000` with `FIELDS()`        | §5 Gap 1.3: rewritten to REST describe → dynamic explicit field list                        |
| 2   | Gap 1.4: bulk `SELECT ... Metadata FROM ValidationRule` rejected without strong filter | §5 Gap 1.4: rewritten to two-phase (enumerate IDs → batched Metadata fetch)                 |
| 3   | Gap 1.6: hallucinated `SELECT Definition FROM FlowVersionView` column                  | §5 Gap 1.6: rewritten as two options (Tooling `Flow.Metadata` or Metadata API `retrieve()`) |
| 4   | Gap 1.7: MIME-type filtering for Static Resources is untrustworthy                     | §5 Gap 1.7: rewritten to extension + size-based extraction policy                           |
| 5   | CC-1: `View All Data` does NOT override Field-Level Security                           | §7 CC-1: added `FieldPermissions` query against running user's aggregate                    |
| 6   | CC-3: missing QCP-specific `conn.query()` JSForce pattern                              | §7 CC-3: added `conn\.query\s*\(` to detection list                                         |
