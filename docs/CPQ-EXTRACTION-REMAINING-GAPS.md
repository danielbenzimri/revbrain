# CPQ Extraction — Remaining Gaps for Full Coverage Report

> **Date:** 2026-03-28
> **Context:** After live extraction against rdolce-23march23-385-demo (720 findings, 67.9s)
> **PDF:** Generated, 293 KB, 28 pages — most sections populated but some empty due to data/API limitations

---

## What's Populated in the PDF (working)

| Section               | Data                                                                                                                      | Status        |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------- | ------------- |
| Cover page            | Org ID, CPQ v232.2.0, Enterprise Edition                                                                                  | Populated     |
| Scope & Methodology   | Static content + confidence table                                                                                         | Populated     |
| Executive Summary     | 3 key findings, complexity scores (32/100 overall)                                                                        | Populated     |
| CPQ at a Glance       | Products: 179, Price Rules: 28, Product Rules: 38, Discount Schedules: 22, QCP: 5, Quotes: 23, Licenses: 344, Triggers: 5 | **Populated** |
| Plugins               | 5 plugins (QCP Not Configured, DocuSign detected via packages, etc.)                                                      | Populated     |
| Quote Lifecycle       | 7-step flow                                                                                                               | Populated     |
| Configuration Domain  | Price rules: 28 rows, Product rules: 38 rows                                                                              | **Populated** |
| Custom Code           | Apex: 67 classes, Triggers: 5                                                                                             | Populated     |
| Data Quality          | 4 flags (orphans, dupes, inactive, picklist)                                                                              | Populated     |
| Top Products          | 10 products with names + categories                                                                                       | Populated     |
| CPQ Reports           | 50 reports                                                                                                                | Populated     |
| Appendix D (Coverage) | 4 confidence categories                                                                                                   | Populated     |

## What's Empty in the PDF (and why)

### 1. Settings Panel Values (CPQSettingValue) — 0 rows

**Root cause:** The Settings collector discovers all 77 SBQQ custom objects but only extracts field values when a Describe exists in the cache. Discovery only describes 33 core CPQ objects. The remaining 44 SBQQ objects don't have Describes, so the field-value extraction loop (`for field of describe.fields`) is skipped.

**Fix:** In the Settings collector, after discovering a settings object, run `this.ctx.restApi.describe(apiName)` for each one that isn't in the cache. This adds ~44 Describe API calls (~5 seconds).

**Effort:** 30 min

---

### 2. Usage Analytics (Discounts, Overrides, User Behavior, Conversion) — all 0

**Root cause:** The demo org has 23 quotes total but **0 in the last 90 days** (`SBQQ__Quote__c_90d: 0`). All usage analytics (G-04 through G-10) operate on `recentQuotes` which is filtered to 90 days. Since there are no recent quotes, all usage sections produce empty results.

**This is NOT a code bug.** The demo data is simply older than 90 days.

**Fix options:**

1. Create a few test quotes in the demo org (best for demo)
2. Extend the window from 90 to 365 days as a configurable parameter
3. Accept that "0 recent quotes" is the correct output for this org's data

**Recommended:** Option 2 — make the window configurable via environment variable (default 90 days, allow override for demo orgs).

**Effort:** 15 min (env var) + re-run extraction

---

### 3. Object Inventory (Appendix A) — 0 rows

**Root cause:** The `buildObjectInventory()` function in `summaries/builder.ts` is called during the pipeline's `buildSummaries()` phase but its output (`inventoryFindings`) is logged but **never added to the collector results**. The inventory findings are computed but not returned to the pipeline and therefore not included in the export.

**Fix:** In `buildSummaries()`, return the inventory findings or merge them into the summary output so they're available in `assessment-results.json`.

**Effort:** 30 min

---

### 4. Complexity Hotspots — 0 rows

**Root cause:** The `identifyHotspots()` function checks if `priceRules > 0 AND productRules > 0` using artifact type counts. But it's counting `PriceRule` (short name) while the actual type is `SBQQ__PriceRule__c`. Same naming mismatch as the assembler had.

**Fix:** Update `identifyHotspots()` to search for both naming conventions, like we fixed in the assembler.

**Effort:** 15 min

---

### 5. Installed Packages table — empty

**Root cause:** The report assembler has `installedPackages: []` hardcoded. The Discovery collector extracts package info (SBQQ v232.2.0, DocuSign v7.5.2) but stores it in metrics, not as findings.

**Fix:** In the assembler, read from Discovery findings/metrics to populate the installed packages table.

**Effort:** 30 min

---

### 6. Product Catalog by Category — empty

**Root cause:** The benchmark shows products grouped by category (Equipment, Graphics, Kit). The assembler has `productCatalog: []` because it doesn't aggregate Product2 findings by Family field.

**Fix:** Group Product2 findings by Family, count active/inactive/quoted per category.

**Effort:** 30 min

---

## Summary: What to Fix

| Item                       | Root Cause                            | Effort | Impact                              |
| -------------------------- | ------------------------------------- | ------ | ----------------------------------- |
| Settings field values      | No Describe for settings objects      | 30 min | Settings panel + Twin Fields + QLE  |
| Usage analytics            | 0 recent quotes (data issue, not bug) | 15 min | Discounts, overrides, user behavior |
| Object inventory           | Computed but not returned             | 30 min | Appendix A                          |
| Complexity hotspots        | Artifact type naming mismatch         | 15 min | §10 hotspots                        |
| Installed packages         | Hardcoded empty array                 | 30 min | §4.1 packages                       |
| Product catalog categories | Not aggregated by Family              | 30 min | §6.1 catalog                        |

**Total: ~2.5 hours of fixes** to get the PDF from 60% populated to ~95% populated.

## Known Limitations (cannot fix without different data)

1. **90-day quote window:** Demo org has no quotes in last 90 days. Usage analytics will be empty until quotes are created or window is extended.
2. **Flows:** `FlowDefinitionView` and `FlowDefinition` both returned 0 active flows. The org may use Process Builder instead (detected as Apex).
3. **Advanced Approvals (sbaa):** Not installed on this org. Approval section will be limited to standard custom actions.

## UI Bugs (noted, separate from extraction)

1. SF connection status not refreshing in sidebar after OAuth
2. Connect button locks after first click
3. "Connect Source Org" smart card onClick broken
