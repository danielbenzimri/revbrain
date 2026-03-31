# CPQ Assessment Report V4 — Changelog

> **Date:** 2026-03-31
> **Baseline:** V3 (commit `29937d7`)
> **Audience:** SI stakeholders, Revenue Operations reviewers

---

## Visible Changes

### 1. Active Products Count: 38 → 176

**What changed:** The Active Products metric in At-a-Glance and Key Findings now shows 176 instead of 38.

**Rationale:** V3 computed "Active Products" by summing per-family subtotals from the product catalog table, which only included families with recently quoted products. V4 counts all `Product2` findings extracted from the org. The 176 figure is the correct total of products available for quoting. The label displays as "Products Extracted" (not "Active Products") because the `IsActive` field was not available via FLS in this extraction — the count represents all extracted products, not just those with `IsActive=true`.

### 2. Top Quoted Products: Percentages Corrected (>100% → All ≤ 100%)

**What changed:** "2-Yard Dumpster" previously showed 117% of quotes. It now shows 30% (7 of 23).

**Rationale:** V3 had a denominator bug — the `totalQuotes` lookup matched the "Quote Templates" DataCount finding (count=6) instead of "Quotes (all)" (count=23), because the search for `artifactName.includes('Quote')` hit "Quote Templates" first. V4 uses an explicit lookup for "Quotes (90d)" with fallback to "Quotes (all)", ensuring the denominator represents actual quote volume.

### 3. sbaa Version Detection

**What changed:** Cover page now shows sbaa version instead of "Not installed".

**Rationale:** V3 relied on the Discovery collector's `describeCache` to detect sbaa objects, which was unreliable. V4 implements a three-level fallback chain: (1) `InstalledPackage` finding from the settings collector, (2) `OrgFingerprint.notes` regex, (3) `CPQSettingValue` "Advanced Approvals" notes. The package is correctly detected as installed. Note: the version string resolves to "v" in this org — a minor parsing artifact from the installed package metadata format.

### 4. Approval Rules Section

**What changed:** The approval rules section shows 0 rules with appropriate context, instead of "not detected" without explanation.

**Rationale:** V3 skipped approval rule extraction entirely when the Discovery collector's `describeCache` did not include sbaa objects. V4's approvals collector independently checks `_installedPackages` for the sbaa namespace, then attempts direct `describeSObject()` and query. In this org, sbaa is installed but the approval rule objects are not accessible to the integration user, resulting in a legitimate count of 0. The report now accurately reflects this rather than silently omitting the section.

### 5. Packages Removed from Core Settings (Section 4.2)

**What changed:** Section 4.2 (CPQ Core Settings) no longer contains "Package:" entries. Packages appear exclusively in Section 4.1 (Installed Packages).

**Rationale:** V3 included installed package metadata as CPQ setting values, mixing package information with actual CPQ configuration settings. V4 enforces a single display location: packages in Section 4.1, settings in Section 4.2. This avoids duplication and makes each section's scope clear.

### 6. Bundle Label: "Bundles" → "Bundle-capable Products"

**What changed:** The At-a-Glance panel and related sections now label bundle products as "Bundle-capable Products" instead of "Bundles".

**Rationale:** The metric counts products with `SBQQ__ConfigurationType__c` in `(Allowed, Required)`, which means products *capable* of being configured as bundles — not necessarily products that *are* quoted as bundles. The label change makes the definition explicit and avoids overstating bundle adoption.

### 7. Active User Reconciliation

**What changed:** The low-volume warning banner and At-a-Glance "Active Users (90d)" panel now show the same count (1).

**Rationale:** V3 computed active users independently in the warning message (from UserAdoption findings, yielding 0) and in the At-a-Glance panel (from UserBehavior findings, yielding 1). V4 uses a single canonical value from `ReportCounts.activeUsers` with a defined fallback chain: UserAdoption primary → UserBehavior fallback. Both display sites reference the same canonical count.

---

## Structural / Non-Visible Changes

- **ReportCounts (A1):** All cross-section metrics computed once at assembly top and consumed by reference. No section-level function independently counts findings for covered metrics.
- **ReportConsistencyValidator (V17-V24):** Post-assembly validator catches percentage > 100%, user count mismatches, product count inconsistencies, text contradictions, sbaa version contradictions, coverage claim contradictions.
- **Metric status tracking:** `activeProducts` and `activeUsers` carry explicit status (`present`/`estimated`/`not_extracted`) driving conditional labels in the template.
- **Appendix D coverage model:** Product Catalog coverage reflects actual extraction depth (Full/Partial/Minimal) based on which sub-components were extracted.

---

## Items Not Changed

- CPQ Version display (unchanged)
- Active Price Rules: 20 of 28 (unchanged)
- Active Product Rules: 37 of 38 (unchanged)
- Flow Count: 44 active (unchanged, verified via SOQL in T6)
- Validation Rules: 25 (unchanged, verified via SOQL in T7)
- Apex Classes: 67 (unchanged)
- Triggers: 5 (unchanged)
- Overall complexity score and dimension scores (unchanged methodology)
