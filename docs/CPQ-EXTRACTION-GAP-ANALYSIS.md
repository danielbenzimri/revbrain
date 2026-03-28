# CPQ Extraction Gap Analysis & Mitigation Plan

> **Purpose:** This document identifies gaps in RevBrain's CPQ data extraction pipeline relative to a comprehensive benchmark assessment report (22-page SI-grade document covering configuration inventory, usage analytics, data quality, technical debt, and complexity scoring). Each gap includes severity, root cause, mitigation approach, required SOQL/API calls, affected collectors, testing requirements, and LLM integration points where applicable.
>
> **Date:** 2026-03-28
> **Version:** 1.2
> **Authors:** Daniel Aviram + Claude
> **Status:** Final — approved by both auditors (A / A-)
>
> **Audit history:**
>
> - v1.0 (2026-03-28): Initial 17-gap analysis
> - v1.1 (2026-03-28): Dual audit fixes — SOQL syntax errors (COUNT DISTINCT), G-06/G-08/G-10 logic corrections, 4 new gaps (G-18–G-21), effort re-estimates, artifact schemas, LLM prompt schema
> - v1.2 (2026-03-28): Final polish — regex anchoring (G-01), weighted discount avg (G-05), discount field combination fix (G-05), LLM JSON-only instruction, evidenceRefs type convention, G-19 query performance guard
>   **Audience:** Engineering team, product leadership, external auditors
>
> **Related documents:**
>
> - [CPQ-DATA-EXTRACTION-SPEC.md](CPQ-DATA-EXTRACTION-SPEC.md) — What data to extract (v2.2)
> - [CPQ-EXTRACTION-JOB-ARCHITECTURE.md](CPQ-EXTRACTION-JOB-ARCHITECTURE.md) — How the job runs (v1.2)
> - [CPQ-EXTRACTION-IMPLEMENTATION-PLAN.md](CPQ-EXTRACTION-IMPLEMENTATION-PLAN.md) — Task tracker (v3.1, Phase 14 gap tasks)

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Benchmark Reference](#2-benchmark-reference)
3. [Gap Inventory](#3-gap-inventory)
   - 3.1 [G-01: CPQ Settings Panel Values](#31-g-01-cpq-settings-panel-values)
   - 3.2 [G-02: Plugin Detection & Status](#32-g-02-plugin-detection--status)
   - 3.3 [G-03: CPQ License & User Adoption Metrics](#33-g-03-cpq-license--user-adoption-metrics)
   - 3.4 [G-04: User Behavior by Role](#34-g-04-user-behavior-by-role)
   - 3.5 [G-05: Discount Distribution by Range](#35-g-05-discount-distribution-by-range)
   - 3.6 [G-06: Manual Price Override Detection](#36-g-06-manual-price-override-detection)
   - 3.7 [G-07: Product Option Attachment Rates](#37-g-07-product-option-attachment-rates)
   - 3.8 [G-08: Top Quoted Products Inventory](#38-g-08-top-quoted-products-inventory)
   - 3.9 [G-09: Conversion by Deal Size Segment](#39-g-09-conversion-by-deal-size-segment)
   - 3.10 [G-10: Quote Modification Patterns](#310-g-10-quote-modification-patterns)
   - 3.11 [G-11: Field Completeness & Data Quality](#311-g-11-field-completeness--data-quality)
   - 3.12 [G-12: Feature Utilization Inventory](#312-g-12-feature-utilization-inventory)
   - 3.13 [G-13: Complexity Hotspot Analysis](#313-g-13-complexity-hotspot-analysis)
   - 3.14 [G-14: Consolidated Object Inventory](#314-g-14-consolidated-object-inventory)
   - 3.15 [G-15: CPQ Reports & Dashboards](#315-g-15-cpq-reports--dashboards)
   - 3.16 [G-16: Quote Lifecycle Flow](#316-g-16-quote-lifecycle-flow)
   - 3.17 [G-17: Extraction Confidence Metadata](#317-g-17-extraction-confidence-metadata)
   - 3.18 [G-18: Trend Indicators](#318-g-18-trend-indicators)
   - 3.19 [G-19: Data Quality Flags](#319-g-19-data-quality-flags)
   - 3.20 [G-20: Avg Close Time per Segment](#320-g-20-avg-close-time-per-segment)
   - 3.21 [G-21: CPQ at a Glance Dashboard Structure](#321-g-21-cpq-at-a-glance-dashboard-structure)
4. [LLM Integration Strategy](#4-llm-integration-strategy)
5. [Implementation Phases](#5-implementation-phases)
6. [Testing Strategy](#6-testing-strategy)
7. [Impact on Existing Components](#7-impact-on-existing-components)

---

## 1. Executive Summary

An audit of our extraction pipeline against a benchmark 22-page CPQ assessment report revealed **21 gaps** across 4 severity levels. The benchmark report ("Vento CPQ Assessment Tool v1.0") represents the standard an SI expects to see before scoping a migration engagement.

**Current coverage:** Our 12 collectors extract ~70% of the data in the benchmark report. The gaps fall into three categories:

1. **Settings & configuration** (G-01, G-02) — We discover CPQ Custom Settings dynamically but never read their field values. We detect QCP source code but don't produce a structured plugin inventory.
2. **Usage analytics depth** (G-03 through G-10) — We extract quote volumes and conversion rates but lack the behavioral analytics layer: discount distribution, override rates, role-based activity, deal-size segmentation, modification patterns.
3. **Assessment presentation** (G-11 through G-17) — We produce raw findings but lack the synthesis layer that produces confidence-scored tables, hotspot analysis, feature utilization summaries, and a consolidated object inventory.

**Mitigation approach:** Categories 1 and 2 require collector enhancements (additional SOQL queries within existing collectors). Category 3 requires post-processing enhancements and — for hotspot analysis and executive summary generation — an LLM integration layer.

| Severity     | Count | Gaps                                                                                                                                                                                 |
| ------------ | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Critical** | 2     | G-01 (Settings panel), G-02 (Plugin detection)                                                                                                                                       |
| **High**     | 7     | G-03 (Licenses), G-04 (User roles), G-05 (Discount ranges), G-06 (Overrides), G-07 (Attach rates), G-08 (Top products), G-09 (Deal size)                                             |
| **Medium**   | 8     | G-10 (Modifications), G-11 (Field completeness), G-12 (Feature utilization), G-13 (Hotspots), G-14 (Object inventory), G-17 (Confidence), G-20 (Close time), G-21 (Glance dashboard) |
| **Low**      | 4     | G-15 (Reports), G-16 (Lifecycle flow), G-18 (Trends), G-19 (Data quality flags)                                                                                                      |

---

## 2. Benchmark Reference

The benchmark report is a 22-page assessment produced by "Vento CPQ Assessment Tool v1.0" for a real Salesforce CPQ environment (Krispy Krunchy Foods, LLC — sample data). It covers:

| Section                 | Content                                                                               | Our Coverage                                                                                                               |
| ----------------------- | ------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| §1 Scope & Methodology  | Assessment scope, methodology, confidence levels                                      | Not produced                                                                                                               |
| §2 Executive Summary    | 5 key findings, complexity scores (72/100), scoring methodology                       | Partial (scores computed, findings not synthesized)                                                                        |
| §3 CPQ at a Glance      | Single-page dashboard of all key metrics                                              | Not produced                                                                                                               |
| §4 CPQ Package Settings | Settings panel values, installed packages, plugins                                    | Installed packages: covered by Discovery (InstalledSubscriberPackage query). Settings values + plugins: **Gap G-01, G-02** |
| §5 Quote Lifecycle      | 7-step process flow                                                                   | **Gap G-16**                                                                                                               |
| §6 Configuration Domain | Product catalog by category, pricing rules, approvals, templates                      | Mostly covered                                                                                                             |
| §7 Usage & Adoption     | 90-day quoting, conversion by size, discounts, overrides, user behavior, top products | **Gaps G-03–G-10**                                                                                                         |
| §8 Data Quality & Debt  | Field completeness, flagged areas, technical debt, feature utilization                | **Gaps G-11, G-12**                                                                                                        |
| §9 Custom Code          | Apex, triggers, flows, validation rules                                               | Covered                                                                                                                    |
| §10 Complexity Hotspots | Named convergence points                                                              | **Gap G-13**                                                                                                               |
| Appendix A              | Configuration object inventory (44 objects)                                           | **Gap G-14**                                                                                                               |
| Appendix B              | CPQ Reports & Dashboards                                                              | **Gap G-15**                                                                                                               |
| Appendix C              | Glossary                                                                              | Can be static                                                                                                              |
| Appendix D              | Extraction coverage / confidence                                                      | **Gap G-17**                                                                                                               |

---

## 3. Gap Inventory

### 3.1 G-01: CPQ Settings Panel Values

**Severity:** Critical
**Affected collector:** `settings.ts`
**Root cause:** The Settings collector uses the Tooling API to discover SBQQ Custom Settings objects dynamically, then queries record counts. It never reads the actual field values of these settings records (e.g., `SBQQ__QLEEnabled__c`, `SBQQ__TwinFieldsEnabled__c`).

**What the benchmark shows:**

| Setting                | Value              | Notes                             |
| ---------------------- | ------------------ | --------------------------------- |
| Quote Line Editor      | Enabled            | Default editor for adding/editing |
| Multi-Currency         | Enabled (USD, CAD) | Supports US and Canada            |
| Contracted Pricing     | Enabled            | Account-level contracted prices   |
| Subscription Proration | Disabled           | Not in use                        |
| Renewal Model          | None               | No renewal workflows              |
| Twin Fields            | Enabled            | Quote-to-Opportunity sync         |
| Large Quote Threshold  | 500 lines          | Performance optimization trigger  |

**Mitigation:**

Enhance the Settings collector to read the org-default record from `SBQQ__TriggerControl__c` and the primary SBQQ custom settings. The key Custom Setting is typically named `SBQQ__PackageSetting__c` or similar — but since CPQ settings are stored in `SBQQ__*` Custom Settings with `SetupOwnerId = OrganizationId`, the collector already retrieves these records. The fix is to extract field values, not just record counts.

**Implementation:**

> **Audit fix (A1 §2.1):** CPQ stores settings across multiple Custom Setting objects, not just one. Field API names vary by CPQ version. Use regex-based fuzzy matching, not exact field name hardcoding.

```
1. Enumerate ALL SBQQ__* Custom Settings from Describe cache (already done by settings collector)

2. For each Custom Setting with an org-level record (SetupOwnerId starts with '00D'):
   - Build full field list from Describe (SOQL does NOT support SELECT *)
   - Query: SELECT {field1, field2, ...} FROM {SettingName} WHERE SetupOwnerId = '{OrgId}'
   - Store all field values in evidenceRefs as field-ref entries

3. Use KNOWN_SETTINGS_MAP to match fields to human-readable labels:

   // Patterns anchored to SBQQ__ prefix to avoid false matches on custom fields
   const KNOWN_SETTINGS: Array<{ pattern: RegExp; label: string; category: string }> = [
     { pattern: /^SBQQ__.*(?:QuoteLineEditor|EnableQLE)/i, label: 'Quote Line Editor', category: 'Quoting' },
     { pattern: /^SBQQ__.*MultiCurrency/i, label: 'Multi-Currency', category: 'Pricing' },
     { pattern: /^SBQQ__.*ContractedPric/i, label: 'Contracted Pricing', category: 'Pricing' },
     { pattern: /^SBQQ__.*SubscriptionProrat/i, label: 'Subscription Proration', category: 'Subscription' },
     { pattern: /^SBQQ__.*RenewalModel/i, label: 'Renewal Model', category: 'Subscription' },
     { pattern: /^SBQQ__.*TwinField/i, label: 'Twin Fields', category: 'Sync' },
     { pattern: /^SBQQ__.*LargeQuoteThreshold/i, label: 'Large Quote Threshold', category: 'Performance' },
     { pattern: /^SBQQ__.*(?:CalculatorPlugin|QCP)/i, label: 'Quote Calculator Plugin', category: 'Plugins' },
     { pattern: /^SBQQ__.*DocumentStorePlugin/i, label: 'Document Store Plugin', category: 'Plugins' },
     { pattern: /^SBQQ__.*PaymentGateway/i, label: 'Payment Gateway', category: 'Plugins' },
     { pattern: /^SBQQ__.*ExternalConfigurat/i, label: 'External Configurator', category: 'Plugins' },
     // ... ~20-30 known field patterns
   ];

4. For each matched field, produce one CPQSettingValue finding with:
   - artifactName: human-readable label
   - notes: "{label}: {value}" (e.g., "Quote Line Editor: Enabled")
   - evidenceRefs: [{ type: 'field-ref', value: '{ObjectName}.{FieldApiName}' }]
```

**SOQL required:**

```sql
-- Same query the settings collector already runs, but with full field list instead of just Id/SetupOwnerId/Name
SELECT {all_fields_from_describe}
FROM {SBQQ_Custom_Setting_Name}
WHERE SetupOwnerId LIKE '00D%'
```

The field list is built from the Describe result for each Custom Setting object (already in the Describe cache from Discovery). No new API calls — just broader field selection on existing queries.

**New artifact type:** `CPQSettingValue` (one per key setting)

**Test:**

- Unit: Mock settings query returns org-level record with known field values. Verify `CPQSettingValue` findings produced with correct field names and values.
- Integration: Run against live SF org. Verify QLE, Twin Fields, Multi-Currency values match what the admin sees in Setup > CPQ Settings.

---

### 3.2 G-02: Plugin Detection & Status

**Severity:** Critical
**Affected collector:** `settings.ts` + `discovery.ts`
**Root cause:** We detect QCP source code in the Pricing collector and e-signature packages in the Discovery collector, but we don't produce a structured plugin inventory as the benchmark does.

**What the benchmark shows:**

| Plugin                        | Status          | Notes                 |
| ----------------------------- | --------------- | --------------------- |
| Quote Calculator Plugin (QCP) | Not Configured  | No custom JS detected |
| Electronic Signature          | DocuSign Active | OLU, FeF, RoR flow    |
| Document Store Plugin         | Not Configured  | Standard storage      |
| Payment Gateway               | Not Configured  | No payment processing |
| External Configurator         | Not Configured  | Standard configurator |

**Mitigation:**

Create a dedicated post-processing step that synthesizes plugin status from existing collector outputs:

```
1. QCP Status:
   - Source: Pricing collector CustomScript findings
   - If 0 CustomScript findings → "Not Configured"
   - If >0 → "Active" with script count and callout detection

2. Electronic Signature:
   - Source: Discovery collector phantomPackages (echosign_dev1, dsfs)
   - If detected → "Active (DocuSign|Adobe Sign)"
   - Else → "Not Configured"

3. Document Store Plugin:
   - Source: CPQ Settings field SBQQ__DocumentStorePlugin__c (from G-01 fix)
   - If populated → "Active" with class name
   - Else → "Not Configured"

4. Payment Gateway:
   - Source: CPQ Settings field SBQQ__PaymentGateway__c
   - If populated → "Active"
   - Else → "Not Configured"

5. External Configurator:
   - Source: CPQ Settings field SBQQ__ExternalConfigurator__c
   - If populated → "Active" with URL
   - Else → "Not Configured"
```

**New artifact type:** `PluginStatus` (one per plugin)

**Dependencies:** Requires G-01 (settings field values) to be completed first.

**Test:**

- Unit: Given known settings + package findings, verify correct plugin status classification.
- Verify "Not Configured" for absent plugins and "Active" for present ones.

---

### 3.3 G-03: CPQ License & User Adoption Metrics

**Severity:** High
**Affected collector:** `discovery.ts`
**Root cause:** We detect org edition and installed packages but never query CPQ license assignment or active user counts.

**What the benchmark shows:**

- CPQ Licenses Provisioned: 75
- Active Users (90d): 42 (56%)
- Quote Creators (90d): 38
- Profiles with CPQ Access: 5

**Mitigation:**

Add three SOQL queries to the Discovery collector:

> **Audit fix (A2 §1):** SOQL does not support `COUNT(DISTINCT field)`. Use `GROUP BY` and count result rows in code.

```sql
-- 1. CPQ license assignments
SELECT COUNT() FROM UserPackageLicense
WHERE PackageLicense.NamespacePrefix = 'SBQQ'

-- 2. Active quote creators in last 90 days (GROUP BY, count rows in code)
SELECT CreatedById
FROM SBQQ__Quote__c
WHERE CreatedDate >= LAST_N_DAYS:90
GROUP BY CreatedById
-- Then: const uniqueCreators = results.length;

-- 3. Profiles with CPQ object access (GROUP BY, count rows in code)
SELECT Assignee.ProfileId
FROM PermissionSetAssignment
WHERE PermissionSet.NamespacePrefix = 'SBQQ'
  AND Assignee.IsActive = true
GROUP BY Assignee.ProfileId
-- Then: const profileCount = results.length;
```

> **Fallback chain (Audit fix A1 §2.2):** Query 1 may fail (`INVALID_TYPE`) in some editions.
>
> 1. Try `UserPackageLicense WHERE PackageLicense.NamespacePrefix = 'SBQQ'` → Confirmed
> 2. If fails, try `PermissionSetAssignment WHERE PermissionSet.NamespacePrefix = 'SBQQ' GROUP BY AssigneeId` → Estimated
> 3. If fails, count distinct `CreatedById` from `SBQQ__Quote__c` as floor estimate → Estimated

**New metrics:** `cpqLicensesProvisioned`, `activeQuoteCreators90d`, `profilesWithCpqAccess`

**New artifact type:** `UserAdoption` (single aggregate finding)

**Test:**

- Unit: Mock API returns license count, creator count, profile count. Verify metrics and finding produced.
- Edge case: `UserPackageLicense` query fails (INVALID_TYPE). Verify graceful fallback.

---

### 3.4 G-04: User Behavior by Role

**Severity:** High
**Affected collector:** `usage.ts`
**Root cause:** We capture `CreatedById` on quotes but never join to User/Profile to segment activity by role.

**What the benchmark shows:**

| Role               | Users | % Quotes | Avg Quotes/Mo | Avg Value | Conv % |
| ------------------ | ----- | -------- | ------------- | --------- | ------ |
| Sales Reps (Field) | 28    | ~52%     | ~14.5         | ~$12,400  | ~48%   |
| Inside Sales       | 8     | ~31%     | ~28.5         | ~$6,200   | ~58%   |

**Mitigation:**

After extracting quotes, group by `CreatedById` and enrich with a User query:

```sql
-- Get user profile for each quote creator
SELECT Id, Name, Profile.Name, UserRole.Name, IsActive
FROM User
WHERE Id IN ({unique_creator_ids})
```

Then aggregate per `Profile.Name` (not per canonical group):

> **Audit fix (A1 §2.3, A2 §6):** Role grouping (Sales Reps, Inside Sales, Management, Admin) is org-specific. Don't attempt fragile static mapping. Instead: present raw data grouped by `Profile.Name`. The LLM narrative layer (Phase D) can optionally group profiles into canonical role categories using keyword matching. This keeps the data layer honest and the presentation layer flexible.

- Per profile: user count, quote count, % of total, avg net amount, conversion rate
- Produce one `UserBehavior` finding per distinct `Profile.Name`

**API budget:** 1 additional REST query (User lookup). Creator IDs already available from existing quote extraction.

**Confidence level:** Estimated (profile assignment may not reflect functional role)

**New artifact type:** `UserBehavior` (one per profile group)

**Test:**

- Unit: Given 3 users across 2 profiles, verify correct aggregation per profile.
- Verify conversion rate calculation (ordered quotes / total quotes per user).
- Edge case: user with no Profile (Partner Community user) → group as "Other".

---

### 3.5 G-05: Discount Distribution by Range

**Severity:** High
**Affected collector:** `usage.ts`
**Root cause:** We calculate `discountingFrequency` (% of quotes with any discount) but don't bucket the discount values into ranges.

**What the benchmark shows:**

| Range  | Count | %    | Typical Scenario    | Approval      |
| ------ | ----- | ---- | ------------------- | ------------- |
| 0–5%   | ~420  | ~45% | Standard volume     | Rarely        |
| 6–10%  | ~299  | ~32% | Multi-unit deal     | Sometimes     |
| 11–15% | ~150  | ~16% | Large project       | Usually       |
| 16–20% | ~53   | ~6%  | Enterprise          | Always        |
| >20%   | ~14   | ~1%  | Executive exception | Always + Exec |

**Mitigation:**

After extracting quote lines (already done), compute discount distribution:

> **Audit fix (A2 §2):** `SBQQ__CustomerDiscount__c` is a quote-level field that some orgs leave empty, applying discounts only at line level. Use a multi-source approach with priority chain.

```typescript
// Priority: quote-level discount > weighted avg of line-level discounts
for (const quote of recentQuotes) {
  let effectiveDiscount = Number(quote.SBQQ__CustomerDiscount__c ?? 0);

  // Fallback: compute revenue-weighted avg from line-level discounts if quote-level is empty
  if (effectiveDiscount <= 0) {
    const lines = linesByQuoteId.get(quote.Id) ?? [];
    // Combine primary + additional discounts (they are independent, not fallbacks)
    const lineData = lines
      .map((l) => ({
        discount: Number(l.SBQQ__Discount__c ?? 0) + Number(l.SBQQ__AdditionalDiscount__c ?? 0),
        revenue: Number(l.SBQQ__NetTotal__c ?? 0),
      }))
      .filter((d) => d.discount > 0);

    if (lineData.length > 0) {
      // Revenue-weighted average (A1 §2.2): high-value lines contribute more
      const totalRevenue = lineData.reduce((sum, l) => sum + l.revenue, 0);
      effectiveDiscount =
        totalRevenue > 0
          ? lineData.reduce((sum, l) => sum + (l.discount * l.revenue) / totalRevenue, 0)
          : lineData.reduce((sum, l) => sum + l.discount, 0) / lineData.length;
    }
  }

  if (effectiveDiscount <= 0) continue;
  if (effectiveDiscount <= 5) discountBuckets['0-5']++;
  else if (effectiveDiscount <= 10) discountBuckets['6-10']++;
  else if (effectiveDiscount <= 15) discountBuckets['11-15']++;
  else if (effectiveDiscount <= 20) discountBuckets['16-20']++;
  else discountBuckets['>20']++;
}
```

**No additional SOQL needed** — both quote-level and line-level discount fields are already extracted.

**New artifact type:** `DiscountDistribution` (single aggregate finding with buckets in `evidenceRefs`)

**New metrics:** `discountBuckets`, `avgDiscountPercent`, `medianDiscountPercent`

**Test:**

- Unit: Given 10 quotes with known discounts, verify correct bucketing.
- Verify edge cases: 0% discount excluded, exactly 5% goes in 0-5 bucket.

---

### 3.6 G-06: Manual Price Override Detection

**Severity:** High
**Affected collector:** `usage.ts`
**Root cause:** Not extracted at all. Overrides occur when a user manually changes a price on a quote line, overriding the calculated price.

**What the benchmark shows:**

- 185 quotes (7.9%) had manual overrides
- Revenue impact: -$68,400
- Top reasons: competitive match (39%), loyalty (25%), market conditions (16%)

**Mitigation:**

Detect overrides using CPQ's own override indicator fields:

> **Audit fix (A1 §2.4, A2 §3):** The v1.0 heuristic (OriginalPrice ≠ NetPrice AND no discounts) produces false negatives (misses overrides with concurrent discounts) and false positives (price rules can change NetPrice without overrides). Use CPQ's dedicated override fields instead.

```typescript
// Already have: quoteLines with all SBQQ__ fields
let overrideCount = 0;
let overrideRevenueImpact = 0;

for (const line of quoteLines) {
  // Primary indicator: CPQ's explicit override type field
  const specialPriceType = line.SBQQ__SpecialPriceType__c as string;
  const pricingMethodOverride = line.SBQQ__PricingMethodOverride__c;

  const isOverride =
    specialPriceType === 'Custom' || // User explicitly set a custom price
    pricingMethodOverride != null || // User overrode the pricing method
    (line.SBQQ__SpecialPrice__c != null && // SpecialPrice set AND
      line.SBQQ__SpecialPrice__c !== line.SBQQ__ListPrice__c && // differs from list
      line.SBQQ__PriceEditable__c === true); // field was editable

  if (isOverride) {
    overrideCount++;
    const listPrice = Number(line.SBQQ__ListPrice__c ?? 0);
    const netPrice = Number(line.SBQQ__NetPrice__c ?? 0);
    const quantity = Number(line.SBQQ__Quantity__c ?? 1);
    overrideRevenueImpact += (listPrice - netPrice) * quantity;
  }
}
```

> **Note:** Override _reasons_ (competitive match, loyalty, market conditions) are **not extractable** from CPQ data — there is no standard field that stores override reasons. The benchmark marks these as "Estimated" for the same reason. If included, mark as **Partial** confidence with a note that reason classification requires manual input or LLM inference.

**No additional SOQL needed** — `SBQQ__SpecialPriceType__c`, `SBQQ__PricingMethodOverride__c`, `SBQQ__SpecialPrice__c`, `SBQQ__PriceEditable__c` are all SBQQ fields captured by the dynamic field query.

**New metrics:** `manualOverrideCount`, `manualOverrideRate`, `overrideRevenueImpact`

**New artifact type:** `PriceOverrideAnalysis` (single finding)

**Test:**

- Unit: Given quote lines with known original/net prices, verify override detection.
- Edge case: line with OriginalPrice=NetPrice → not an override.
- Edge case: line with discount schedule explaining the delta → not a manual override.

---

### 3.7 G-07: Product Option Attachment Rates

**Severity:** High
**Affected collector:** `usage.ts` + `catalog.ts` (cross-collector)
**Root cause:** We extract product options (catalog) and quote lines (usage) separately but never join them to compute which options are actually used and how often.

**What the benchmark shows:**

| Option Category  | Attach Rate | Most Popular            | Least Used           |
| ---------------- | ----------- | ----------------------- | -------------------- |
| Equipment Type   | ~89%        | Standard Package (72%)  | Premium (8%)         |
| Graphics Package | ~64%        | Standard Exterior (58%) | Custom Interior (5%) |

**Mitigation:**

This is a **post-processing** computation. After both Catalog and Usage collectors complete:

> **Audit fix (A1 §2.5):** Don't use quote-level co-occurrence (inflates rates for unrelated products). Use `SBQQ__RequiredBy__c` on quote lines to determine actual parent-child relationships.

```
1. From catalog: Build Map<ParentProductId, Set<OptionProductId>>
   from SBQQ__ProductOption__c findings (SBQQ__ConfiguredSKU__c → SBQQ__OptionalSKU__c)

2. From usage: For each quote line where SBQQ__RequiredBy__c is populated:
   - RequiredBy line's SBQQ__Product__c = parent product
   - This line's SBQQ__Product__c = option product
   - Increment attach counter for that (parent, option) pair

3. Compute per option:
   attach rate = (distinct quotes where option appeared under parent)
               / (distinct quotes where parent appeared)

4. Group by ProductFeature (from catalog findings) for category-level summary
```

**Implementation location:** `normalize/metrics.ts` — add `computeAttachmentRates()` function called after all collectors complete.

**Dependencies:** Requires Catalog (ProductOption findings with `SBQQ__OptionalSKU__c`, `SBQQ__ConfiguredSKU__c`) and Usage (quote lines with `SBQQ__Product__c`, `SBQQ__RequiredBy__c`) to be complete. Both fields are captured by existing dynamic SBQQ queries.

**New artifact type:** `OptionAttachmentRate` (one per option category)

**Test:**

- Unit: Given 3 products with 5 options and 10 quotes, verify correct attach rate calculation.
- Edge case: product with no options → skip.

---

### 3.8 G-08: Top Quoted Products Inventory

**Severity:** High
**Affected collector:** `usage.ts`
**Root cause:** We compute `top5ProductConcentration` (% of volume from top 5 products) but don't produce the actual product list with names, categories, and quote counts.

**What the benchmark shows:** Top 10 products with SKU, category, quoted count, % of quotes.

**Mitigation:**

> **Audit fix (A2 §2):** The benchmark's "Quoted" column counts **distinct quotes containing the product**, not total quote lines. A product on 8 lines of 1 quote = 1 quoted, not 8.

```typescript
// Count DISTINCT QUOTES per product (not total lines)
const productQuoteSets = new Map<string, Set<string>>();
for (const line of quoteLines) {
  const productId = line.SBQQ__Product__c as string;
  const quoteId = line.SBQQ__Quote__c as string;
  if (!productQuoteSets.has(productId)) productQuoteSets.set(productId, new Set());
  productQuoteSets.get(productId)!.add(quoteId);
}

// Sort by distinct quote count and take top 10
const top10 = [...productQuoteSets.entries()]
  .map(([id, quotes]) => ({ id, quotedCount: quotes.size }))
  .sort((a, b) => b.quotedCount - a.quotedCount)
  .slice(0, 10);

// Enrich with product names
// SELECT Id, Name, ProductCode, Family FROM Product2 WHERE Id IN ({top10_ids})
```

**API budget:** 1 additional REST query (product name lookup for top 10 IDs).

**New artifact type:** `TopQuotedProduct` (one per product, up to 10)

**Test:**

- Unit: Given quote lines referencing 20 products, verify top 10 sorted correctly.
- Verify product names enriched from lookup.

---

### 3.9 G-09: Conversion by Deal Size Segment

**Severity:** High
**Affected collector:** `usage.ts`
**Root cause:** We compute overall `quoteToOrderRate` but don't segment by deal size.

**What the benchmark shows:**

| Size                | % Quotes | % Revenue | Conversion | Avg Close Time |
| ------------------- | -------- | --------- | ---------- | -------------- |
| Small (<$5K)        | ~34%     | ~8%       | ~61%       | ~2.3 days      |
| Medium ($5K-$25K)   | ~47%     | ~32%      | ~54%       | ~5.8 days      |
| Large ($25K-$100K)  | ~16%     | ~38%      | ~47%       | ~14.2 days     |
| Enterprise (>$100K) | ~3%      | ~22%      | ~38%       | ~31.7 days     |

**Mitigation:**

```typescript
// Already have: recentQuotes with SBQQ__NetAmount__c and SBQQ__Ordered__c
const segments = [
  { label: 'Small (<$5K)', min: 0, max: 5000 },
  { label: 'Medium ($5K-$25K)', min: 5000, max: 25000 },
  { label: 'Large ($25K-$100K)', min: 25000, max: 100000 },
  { label: 'Enterprise (>$100K)', min: 100000, max: Infinity },
];

for (const seg of segments) {
  const inSegment = recentQuotes.filter((q) => {
    const amount = Number(q.SBQQ__NetAmount__c ?? 0);
    return amount >= seg.min && amount < seg.max;
  });
  const ordered = inSegment.filter((q) => q.SBQQ__Ordered__c === true);
  // Compute: % quotes, % revenue, conversion rate, avg close time
}
```

**No additional SOQL needed** — NetAmount and Ordered fields already extracted.

**New artifact type:** `ConversionSegment` (one per size bucket)

**Test:**

- Unit: Given 20 quotes across 4 size buckets, verify correct segmentation and conversion rates.

---

### 3.10 G-10: Quote Modification Patterns

**Severity:** Medium
**Affected collector:** `usage.ts`
**Root cause:** We capture `LastModifiedDate` but don't analyze modification frequency or patterns.

**Mitigation:**

> **Audit fix (A1 §2.6, A2 §3):** `LastModifiedDate` is updated by workflows, flows (4 active quote flows in the benchmark org!), triggers, approval status changes, and CPQ recalculation — not just user edits. The 1-hour threshold produces massive false positives. Use a tiered approach.

**Approach 1 (preferred): Quote versioning field**

```typescript
// SBQQ__Version__c > 1 means the quote was explicitly versioned = strong modification signal
const versionedQuotes = recentQuotes.filter((q) => Number(q.SBQQ__Version__c ?? 1) > 1);
const modificationRate = versionedQuotes.length / recentQuotes.length;
```

**Approach 2 (fallback): Field History Tracking** (if enabled on the org)

```sql
-- Will fail with INVALID_TYPE if history tracking is not enabled for Quote
SELECT ParentId, COUNT(Id) changeCount
FROM SBQQ__Quote__History
WHERE CreatedDate >= LAST_N_DAYS:90
GROUP BY ParentId
```

Then: `avgModificationsPerQuote = sum(changeCount) / distinctParents`

**Approach 3 (last resort): LastModifiedDate heuristic** with 24-hour threshold (not 1 hour)

- Mark confidence as **Partial** (not Estimated) — systematically biased upward

Modification reasons (volume adjustment, substitution, etc.) **cannot be determined** without custom audit trail fields. The benchmark marks these as "Estimated" for the same reason.

**New metrics:** `quoteModificationRate`, `avgModificationsPerQuote`
**Confidence:** Confirmed for Approach 1, Estimated for Approach 2, **Partial** for Approach 3

**Test:**

- Unit: Given quotes with known Created/Modified dates, verify modification rate.

---

### 3.11 G-11: Field Completeness & Data Quality

**Severity:** Medium
**Affected collector:** New — `data-quality.ts` (or post-processing in `validation.ts`)
**Root cause:** We check metadata-level presence of fields but never sample actual data to compute population rates.

**What the benchmark shows:** Per-object required field completeness (~97%), optional field completeness (~81%), overall quality score.

**Mitigation:**

Add a lightweight data sampling step. For each key CPQ object, query a sample of records and compute fill rates:

> **Audit fix (A1 §2.7):** `ORDER BY CreatedDate DESC LIMIT 100` biases toward recent records (new required fields show artificially high population). Use stratified sampling: 33 from each third of the date range.

```sql
-- Stratified sample: recent, mid-range, and older records
SELECT {all_fields} FROM SBQQ__Quote__c
WHERE CreatedDate >= LAST_N_DAYS:30 ORDER BY CreatedDate DESC LIMIT 34

SELECT {all_fields} FROM SBQQ__Quote__c
WHERE CreatedDate >= LAST_N_DAYS:60 AND CreatedDate < LAST_N_DAYS:30
ORDER BY CreatedDate DESC LIMIT 33

SELECT {all_fields} FROM SBQQ__Quote__c
WHERE CreatedDate >= LAST_N_DAYS:90 AND CreatedDate < LAST_N_DAYS:60
ORDER BY CreatedDate DESC LIMIT 33
```

Then compute:

- For each field: `populationRate = countNonNull / sampleSize`
- Required vs optional classification from Describe (`nillable` flag)
- Flag fields with <5% population as "low-population"

**API budget:** 18 queries (6 objects × 3 strata each). Still well within API limits.

**Confidence level:** **Estimated** (stratified sampling, not full scan — document the recency distribution)

**New artifact type:** `FieldCompleteness` (one per object)

**Test:**

- Unit: Given 100 sample records with known null patterns, verify population rates.
- Verify required vs optional classification from Describe.

---

### 3.12 G-12: Feature Utilization Inventory

**Severity:** Medium
**Affected location:** `normalize/metrics.ts` (feature adoption heatmap)
**Root cause:** Our `featureAdoption` heatmap covers 11 features but misses several that the benchmark reports: Block Pricing, Price Dimensions, Quote Terms, Quote Processes, Import Formats.

**Mitigation:**

Extend the `computeFeatureAdoption()` function to cover all benchmark features:

| Feature          | Detection Source             | Current | Fix                                              |
| ---------------- | ---------------------------- | ------- | ------------------------------------------------ |
| Block Pricing    | Pricing collector findings   | Missing | Add: `f.artifactType === 'BlockPrice'` check     |
| Price Dimensions | Pricing collector findings   | Missing | Add: `f.artifactType === 'PriceDimension'` check |
| Quote Terms      | Templates collector findings | Missing | Add: `f.artifactType === 'QuoteTerm'` check      |
| Quote Processes  | Settings or Tooling API      | Missing | Add: Tooling query for `SBQQ__QuoteProcess__c`   |
| Import Formats   | Settings or Tooling API      | Missing | Add: Tooling query for `SBQQ__ImportFormat__c`   |
| Twin Fields      | G-01 (settings values)       | Missing | Check `SBQQ__TwinFieldsEnabled__c` value         |
| Localizations    | Localization collector       | Exists  | Already covered                                  |

**Test:**

- Unit: Given findings with BlockPrice and PriceDimension types, verify feature adoption includes them.

---

### 3.13 G-13: Complexity Hotspot Analysis

**Severity:** Medium
**Affected location:** `summaries/builder.ts` + **LLM** (see §4)
**Root cause:** We produce per-domain highlights but don't identify **convergence points** where multiple complex configurations interact.

**What the benchmark shows:**

| Hotspot                   | Severity | Analysis                                                                                    |
| ------------------------- | -------- | ------------------------------------------------------------------------------------------- |
| Quote Pricing Engine      | Critical | 6 Price Rules + 4 Product Rules + Discount Schedules + Custom Scripts → multi-layered chain |
| Brand/Region Logic        | High     | 39% of objects use Region\_\_c filtering across all domains                                 |
| DocuSign Document Chain   | High     | PDF → DocuSign → signing → status update → Order creation                                   |
| Quote-to-Order Automation | High     | Acceptance → Flow → Order creation with complex field mapping                               |

**Mitigation — Phase 1 (rule-based):**

Add `identifyHotspots()` to `summaries/builder.ts`:

> **Audit fix (A1 §2.8):** Use domain complexity scores (already computed in `metrics.ts`) rather than raw counts. Raw counts are org-size-dependent; a small org with 2 price rules + 1 complex QCP is equally complex as a large org with 6 price rules. Complexity scores normalize for this.

```
1. Pricing Engine Hotspot:
   - Trigger: domainComplexity['pricing'] > 60
     OR (priceRules > 0 AND productRules > 0 AND customScripts > 0)  // multi-layered even if few
   - Severity: Critical if score > 75, High otherwise

2. Cross-Cutting Filter Field Hotspot (generalized from Brand/Region):
   - Trigger: Scan all findings' evidenceRefs for any single field name
     that appears across >30% of distinct objects
   - Common patterns: Region__c, Market__c, Country__c, Brand__c, Segment__c
   - If detected → "Cross-Cutting Data Partitioning" hotspot with the field name
   - Severity: High

3. Document Chain Hotspot:
   - Trigger: templateCount > 0 AND eSignatureDetected AND quoteToOrderFlow detected
   - Severity: High

4. Quote-to-Order Hotspot:
   - Trigger: Flow findings with "Order" in name AND orderLifecycle findings exist
   - Severity: High
```

**Mitigation — Phase 2 (LLM-enhanced):**

After rule-based hotspots are identified, an LLM call enriches each hotspot with natural-language analysis. See §4 for integration details.

**New artifact type:** `ComplexityHotspot` (one per identified hotspot)

**Test:**

- Unit: Given findings that trigger each hotspot rule, verify hotspot produced.
- Given findings that don't trigger, verify no false positive.

---

### 3.14 G-14: Consolidated Object Inventory

**Severity:** Medium
**Affected location:** Post-processing / `transform-to-ui.ts`
**Root cause:** The benchmark Appendix A shows a numbered inventory of all 44+ CPQ objects with count, brand flag, dependency phase, and complexity. We have the raw data across collectors but don't consolidate it.

**Mitigation:**

Add a `buildObjectInventory()` post-processing step that:

1. Iterates all findings across all collectors
2. Groups by Salesforce object API name (extracted from `artifactType` or `artifactId`)
3. For each object: count of records, brand-specific flag (from Region\_\_c field presence), dependency phase (from collector tier), complexity (from finding `complexityLevel`)
4. Produces a sorted inventory

**No new SOQL needed** — derives from existing findings.

**New artifact type:** `ObjectInventoryItem` (one per CPQ object)

**Test:**

- Unit: Given findings from 3 collectors referencing 10 objects, verify inventory has 10 entries with correct counts.

---

### 3.15 G-15: CPQ Reports & Dashboards

**Severity:** Low
**Affected collector:** `integrations.ts` or new `reports.ts`
**Root cause:** We don't query the org's existing CPQ-related reports/dashboards.

**Mitigation:**

Add to Integrations collector or create a lightweight addition:

```sql
SELECT Id, Name, Description, FolderName
FROM Report
WHERE Name LIKE '%CPQ%' OR Name LIKE '%Quote%' OR Name LIKE '%SBQQ%'
   OR FolderName LIKE '%CPQ%'
LIMIT 50
```

**API budget:** 1 REST query.

**New artifact type:** `CPQReport` (one per report)

**Test:**

- Unit: Mock API returns 5 reports. Verify findings produced.

---

### 3.16 G-16: Quote Lifecycle Flow

**Severity:** Low
**Affected location:** Post-processing / **LLM** (see §4)
**Root cause:** The benchmark shows a 7-step lifecycle flow (Lead → Quote → Approval → DocuSign → Order). This requires synthesizing data from multiple collectors.

**Mitigation — Phase 1 (rule-based):**

Derive lifecycle steps from existing findings:

1. **Lead → Opportunity:** Always present (standard Salesforce)
2. **Opportunity → Quote:** Detected (we extract quotes with SBQQ**Opportunity2**c)
3. **Quote → Line Editor:** Detected (QLE enabled from G-01)
4. **Line Editor → Pricing:** Detected (price rules + product rules from Pricing/Catalog)
5. **Pricing → Approval:** Detected (approval findings from Approvals collector)
6. **Approval → Document:** Detected (template + DocuSign from Templates/Integrations)
7. **Document → Order:** Detected (order lifecycle findings)

**Mitigation — Phase 2 (LLM-enhanced):**

Pass all lifecycle-relevant findings to the LLM to generate a natural-language lifecycle description with org-specific details (e.g., "New Location quotes require RSM approval; Existing Location quotes are auto-accepted"). See §4.

**New artifact type:** `QuoteLifecycleStep` (one per step)

**Test:**

- Unit: Given findings from all relevant collectors, verify 7 lifecycle steps produced.

---

### 3.17 G-17: Extraction Confidence Metadata

**Severity:** Medium
**Affected location:** `validation.ts` + `summaries/builder.ts`
**Root cause:** The benchmark Appendix D shows per-category confidence (Full / Partial / Estimated / Not Extracted). Our `validation.ts` checks domain coverage but doesn't produce this structured confidence map.

**Mitigation:**

Add `buildConfidenceMap()` to validation or summaries:

```typescript
const confidenceMap = [
  {
    category: 'CPQ Config Objects (SBQQ)',
    coverage: 'Full',
    notes: `${objectCount} objects detected. Record counts confirmed.`,
  },
  {
    category: 'Transactional Data (Quotes, Orders)',
    coverage: collector.usage.status === 'success' ? 'Full' : 'Partial',
    notes: `90-day SOQL extracts for Quote, QuoteLine, Order, OrderItem.`,
  },
  // ... one entry per category from benchmark
];
```

> **Audit fix (A1 §2.9, A2 §6):** Include explicit "Not Extracted" entries for out-of-scope categories. Map to the benchmark's 3-star rating system.

**Collector status → confidence level mapping:**

- Collector `success` with 100% coverage → **Full** → Confirmed (★★★)
- Collector `success` with <100% coverage → **Partial** → Partial (★)
- Collector `partial` → **Partial** → Partial (★)
- Collector `failed` → **Not Extracted** → (no stars)
- Derived metrics (no direct extraction) → **Estimated** → Estimated (★★)

**Out-of-scope categories (static list):**

```typescript
const OUT_OF_SCOPE = [
  {
    category: 'LWC / Visualforce',
    coverage: 'Not Extracted',
    notes: 'Not in current assessment scope.',
  },
  {
    category: 'Community / Experience Cloud',
    coverage: 'Not Extracted',
    notes: 'Not in current assessment scope.',
  },
  {
    category: 'Einstein Analytics',
    coverage: 'Not Extracted',
    notes: 'Not in current assessment scope.',
  },
  {
    category: 'CPQ-B2B Commerce Integration',
    coverage: 'Not Extracted',
    notes: 'Not in current assessment scope.',
  },
];
```

**New artifact type:** `ExtractionConfidence` (one per category, including out-of-scope)

**Test:**

- Unit: Given mixed collector statuses, verify correct confidence classification.
- Verify out-of-scope categories included with "Not Extracted" status.

---

### 3.18 G-18: Trend Indicators

> **Added per audit (A1 §3A, A2 §4).**

**Severity:** Low
**Affected collector:** `usage.ts` (post-processing)
**Root cause:** The benchmark §7.1 shows trend columns (↑ 12%, ↓ improved, Stable) but we produce no trend data.

**Mitigation:**

Split the 90-day quote window into three 30-day segments (Month 1, Month 2, Month 3) and compute month-over-month change for key metrics:

```typescript
const month1 = recentQuotes.filter((q) => daysAgo(q.CreatedDate) >= 60);
const month2 = recentQuotes.filter(
  (q) => daysAgo(q.CreatedDate) >= 30 && daysAgo(q.CreatedDate) < 60
);
const month3 = recentQuotes.filter((q) => daysAgo(q.CreatedDate) < 30);

const quotesTrend = ((month3.length - month2.length) / month2.length) * 100;
// quotesTrend > 5 → "↑ X%", < -5 → "↓ X%", else → "Stable"
```

Compute trends for: quote count, quote line count, conversion rate, discount frequency, doc generation count.

For first-run assessments (no prior run data), use the 3-month internal trend. For subsequent runs, also compute run-over-run delta.

**New artifact type:** `TrendIndicator` (one per metric)

**Test:**

- Unit: Given 3 months of data with known counts, verify correct trend classification.
- Edge case: month with 0 quotes → "N/A" not divide-by-zero.

---

### 3.19 G-19: Data Quality Flags

> **Added per audit (A1 §3D, A2 §4).**

**Severity:** Low
**Affected collector:** `usage.ts` or post-processing in `validation.ts`
**Root cause:** Benchmark §8.2 shows specific data quality diagnostic checks (duplicate products, orphaned quote lines, invalid picklist values, inactive on active quotes). These serve as explicit "we checked this" or "flagged for follow-up" signals for the SI.

**Mitigation:**

Add targeted data quality queries:

```sql
-- 1. Orphaned quote lines (lines without parent quote)
SELECT COUNT() FROM SBQQ__QuoteLine__c
WHERE SBQQ__Quote__c = null
  AND CreatedDate >= LAST_N_DAYS:90

-- 2. Inactive products on ordered quotes (scoped to 90 days for performance on large orgs)
SELECT COUNT() FROM SBQQ__QuoteLine__c
WHERE SBQQ__Product__r.IsActive = false
  AND SBQQ__Quote__r.SBQQ__Ordered__c = true
  AND CreatedDate >= LAST_N_DAYS:90

-- 3. Duplicate product codes (same ProductCode, different Id)
SELECT ProductCode, COUNT(Id) dupeCount
FROM Product2
WHERE IsActive = true AND ProductCode != null
GROUP BY ProductCode
HAVING COUNT(Id) > 1
```

For items not assessed (invalid picklist values — requires full schema + data scan), produce an explicit "Not Assessed" finding so the SI knows the check was acknowledged.

**API budget:** 3 additional queries.

**New artifact type:** `DataQualityFlag` (one per check, status: `clean` | `flagged` | `not_assessed`)

**Test:**

- Unit: Mock returns 5 orphaned lines → flagged finding produced with count.
- Verify "not_assessed" findings produced for out-of-scope checks.

---

### 3.20 G-20: Avg Close Time per Segment

> **Added per audit (A2 §2).**

**Severity:** Medium
**Affected collector:** `usage.ts`
**Root cause:** G-09 (Conversion by Deal Size) computes conversion rates per segment but doesn't address how "Avg Close Time" is computed. The benchmark shows 2.3 to 31.7 days per segment.

**Mitigation:**

Close time = Order.CreatedDate − Quote.CreatedDate for ordered quotes. Requires joining quotes to their resulting orders:

```sql
-- Orders with quote reference (may already be extracted by order-lifecycle collector)
SELECT Id, CreatedDate, SBQQ__Quote__c
FROM Order
WHERE CreatedDate >= LAST_N_DAYS:90
  AND SBQQ__Quote__c != null
```

Then in G-09 segmentation:

```typescript
for (const quote of orderedQuotesInSegment) {
  const order = ordersByQuoteId.get(quote.Id);
  if (order) {
    const quoteCreated = new Date(quote.CreatedDate);
    const orderCreated = new Date(order.CreatedDate);
    closeTimeDays.push((orderCreated.getTime() - quoteCreated.getTime()) / 86400000);
  }
}
const avgCloseTime = closeTimeDays.reduce((a, b) => a + b, 0) / closeTimeDays.length;
```

> **Note:** Check if order-lifecycle collector already extracts `Order.SBQQ__Quote__c` — if so, no additional SOQL needed. If not, add 1 query.

**API budget:** 0–1 additional query (depends on existing order extraction).

**Test:**

- Unit: Given 5 orders with known quote→order date deltas, verify avg close time per segment.

---

### 3.21 G-21: CPQ at a Glance Dashboard Structure

> **Added per audit (A1 §3C).**

**Severity:** Medium
**Affected location:** Post-processing / transform
**Root cause:** Benchmark §3 shows a single-page structured dashboard with all key metrics in named sections (Product Catalog, Pricing & Rules, Quoting, Approvals & Documents, Users & Licenses, Automation & Code, Technical Debt, Field Completeness). This requires a specific data structure, not just raw findings.

**Mitigation:**

Add a `buildGlanceDashboard()` post-processing step that aggregates metrics from all collectors into a structured grid:

```typescript
interface GlanceDashboard {
  sections: Array<{
    title: string;
    metrics: Array<{
      label: string;
      value: string | number;
      confidence: 'Confirmed' | 'Estimated' | 'Partial';
    }>;
  }>;
}
```

Each section maps to specific collector outputs:

- **Product Catalog:** catalog collector metrics (active/inactive products, bundles, custom products, price books)
- **Pricing & Rules:** pricing collector metrics (price rules, product rules, discount schedules, QCP)
- **Quoting (90 Days):** usage collector metrics (quotes, lines, conversion, avg lines, docs)
- **Approvals & Documents:** approvals + templates collector metrics
- **Users & Licenses:** G-03 metrics (licenses, active users, creators, profiles)
- **Automation & Code:** dependencies collector metrics (triggers, flows, validation rules, apex)
- **Technical Debt:** catalog dormancy + dependencies inactive flows + G-12 feature utilization
- **Field Completeness:** G-11 metrics

**New artifact type:** `GlanceDashboard` (single finding with structured content in `evidenceRefs`)

**Test:**

- Unit: Given collector results from all domains, verify dashboard has all 8 sections populated.

---

## 4. LLM Integration Strategy

Three gaps require LLM-powered analysis that cannot be fully addressed with rule-based logic:

### 4.1 When to Use LLM

| Gap                   | Phase 1 (Rule-Based)                          | Phase 2 (LLM-Enhanced)                           |
| --------------------- | --------------------------------------------- | ------------------------------------------------ |
| **G-13 Hotspots**     | Rule-based detection (convergence thresholds) | LLM writes natural-language analysis per hotspot |
| **G-16 Lifecycle**    | Step detection from findings                  | LLM writes org-specific lifecycle narrative      |
| **Executive Summary** | Key findings from collector metrics           | LLM synthesizes 5 key findings + recommendations |

### 4.2 LLM Call Design

**Model:** Claude Sonnet (fast, cost-effective for structured summarization)

**When called:** Post-processing Phase 5 (after summaries are built), as an optional enhancement. The pipeline produces a valid assessment without LLM — the LLM only enriches it.

**Input construction (structured context window):**

```typescript
interface LLMAssessmentInput {
  // Layer 1: Summaries (always loaded, ~5KB)
  overallScore: number;
  domainSummaries: DomainSummary[];
  riskDistribution: RiskDistribution;
  featureAdoption: Record<string, FeatureAdoption>;
  derivedMetrics: DerivedMetrics;

  // Layer 2: Key findings for context (~10KB)
  hotspots: ComplexityHotspot[]; // From G-13 rule-based detection
  lifecycleSteps: QuoteLifecycleStep[]; // From G-16 step detection
  settingsValues: CPQSettingValue[]; // From G-01
  pluginStatuses: PluginStatus[]; // From G-02

  // Layer 3: Top risks (selective, ~5KB)
  criticalFindings: AssessmentFindingInput[]; // riskLevel === 'critical'
  highFindings: AssessmentFindingInput[]; // riskLevel === 'high' (top 10)
}
```

**Prompt template:**

> **Audit fix (A2 §6):** Include the full output schema in the prompt for reliable structured output. Use tool_use / function calling if available.

```
You are a Salesforce CPQ migration analyst. Based on the following extraction data from a customer's Salesforce org, produce a structured assessment enrichment.

<extraction_data>
{JSON.stringify(llmInput)}
</extraction_data>

Output a JSON object matching this exact TypeScript interface:

interface LLMEnrichmentOutput {
  executiveSummary: Array<{
    id: string;           // "kf-1", "kf-2", etc.
    title: string;        // Short finding title (e.g., "Pricing logic is concentrated in business-specific rules")
    detail: string;       // 2-3 sentence detail paragraph
    confidence: 'Confirmed' | 'Estimated' | 'Partial';
  }>;  // Exactly 5 findings, ordered by migration impact

  hotspotAnalyses: Array<{
    hotspotName: string;  // Must match a hotspot from the input data
    severity: 'Critical' | 'High' | 'Medium';
    analysis: string;     // 2-3 sentences: WHY this area concentrates complexity + migration risk
  }>;  // One per input hotspot

  lifecycleDescription: Array<{
    stepNumber: number;   // 1-7
    title: string;        // e.g., "Lead qualified → converted to Account, Contact, Opportunity"
    detail: string;       // Org-specific details (approval types, template names, integration names)
  }>;  // 5-7 steps from lead to order
}

Rules:
- Use ONLY data from the extraction. Do not invent metrics or features not present in the input.
- Executive summary findings must reference specific numbers from the data.
- Lifecycle steps must use org-specific names (template names, approval step names, integration names).
- Output ONLY the raw JSON object. No markdown code blocks, no preamble text, no explanation after the JSON.
- All output must be valid JSON parseable by JSON.parse().
```

**LLM call parameters:**

- **Temperature:** 0 (deterministic structured output)
- **Max output tokens:** 4096 (cap to prevent runaway)
- **Preferred mode:** Use Claude's tool_use / function calling if available — guarantees schema compliance without prompt-level JSON instructions. Fall back to text generation with the above prompt if tool_use is unavailable.

**Output storage:**

- Stored in `assessment_summaries` table with `summary_type = 'llm_enrichment'`
- Available via `GET /v1/projects/:id/assessment/runs/:runId/findings?domain=summaries`

### 4.3 LLM Error Handling

- LLM call is **non-blocking** — if it fails, the assessment is still complete without it
- Timeout: 30 seconds
- Retry: 1 attempt
- Fallback: rule-based summaries used if LLM unavailable
- Cost: ~$0.01-0.03 per assessment (Sonnet, ~20K input tokens)

### 4.4 LLM Call Location

```
Pipeline Phase 5.5 (new, after buildSummaries):
  if (config.llmEnrichmentEnabled) {
    try {
      const enrichment = await enrichWithLLM(ctx, results, summaries);
      await writeSummary(ctx, 'llm_enrichment', enrichment);
    } catch (err) {
      log.warn('llm_enrichment_failed (non-fatal)');
    }
  }
```

---

## 5. Implementation Phases

### Phase A: Settings & Plugin Intelligence (G-01, G-02)

**Effort:** 1-2 days
**Collector changes:** `settings.ts`
**Dependencies:** None (self-contained)

1. Enhance settings query to full field list (from Describe) for org-level records
2. Build `KNOWN_SETTINGS_MAP` with regex patterns for ~20-30 known fields
3. Produce `CPQSettingValue` findings for matched settings
4. Derive `PluginStatus` findings from settings values + existing package/script detection

### Phase B: Usage Analytics Depth (G-03 through G-10, G-18, G-19, G-20)

**Effort:** 4-5 days

> **Audit fix (A1 §4, A2 §5):** v1.0 estimated 2-3 days. Corrected to 4-5 days — G-07 (attachment rates) involves non-trivial cross-collector join logic, G-04 (role mapping) needs careful Profile.Name handling, and G-06 (overrides) requires CPQ field validation.

**Collector changes:** `usage.ts`, `discovery.ts`
**Dependencies:** Phase A (for some feature flags)

1. G-03: Add license/user queries to Discovery (fallback chain)
2. G-04: Add User profile lookup + per-profile aggregation to Usage
3. G-05: Add discount bucketing with line-level fallback (no new SOQL)
4. G-06: Add override detection using `SpecialPriceType__c` / `PricingMethodOverride__c` (no new SOQL)
5. G-08: Add top-10 product query counting **distinct quotes** per product (1 new SOQL)
6. G-09: Add deal-size segmentation (no new SOQL)
7. G-10: Add modification rate using `Version__c` with History fallback (0-1 new SOQL)
8. G-07: Add attachment rate post-processing using `RequiredBy__c` (cross-collector)
9. G-18: Add 3-month trend computation (no new SOQL)
10. G-19: Add data quality flag queries (3 new SOQL)
11. G-20: Add close time computation using quote→order join (0-1 new SOQL)

### Phase C: Assessment Presentation (G-11, G-12, G-14, G-15, G-17, G-21)

**Effort:** 3-4 days
**Location changes:** `normalize/`, `summaries/`, new `data-quality.ts`
**Dependencies:** Phase A + B

1. G-11: Field completeness stratified sampling (18 new SOQL queries)
2. G-12: Extend feature adoption heatmap with missing features
3. G-14: Consolidated object inventory builder
4. G-15: CPQ reports query (1 new SOQL)
5. G-17: Confidence map builder with out-of-scope entries
6. G-21: Glance dashboard structure builder

### Phase D: LLM Enrichment (G-13, G-16 + Executive Summary)

**Effort:** 2-3 days
**Dependencies:** Phase A + B + C
**New dependency:** Anthropic SDK (`@anthropic-ai/sdk`)

1. G-13: Rule-based hotspot detection (complexity-score-based thresholds) + LLM narrative
2. G-16: Lifecycle step detection + LLM narrative
3. Executive summary generation with full output schema in prompt

### Phase E: Report Generation

**Effort:** 5-8 days (separate spec)

> **Audit fix (A2 §5):** v1.0 estimated 2-3 days. Corrected to 5-8 days — PDF generation with styled tables, conditional formatting, bar charts, multi-column layouts, and dynamic TOC is significantly more complex than data extraction. Consider `puppeteer` (HTML→PDF) for manageability.

**Dependencies:** Phase A-D

Produce a branded PDF report matching the benchmark format. Separate planning exercise with its own spec.

**Revised total effort: 15-22 days** (Phases A-D: 10-14 days, Phase E: 5-8 days)

---

## 6. Testing Strategy

### 6.1 Unit Tests (per gap)

Each gap mitigation includes specific unit test requirements (documented in §3). Standard patterns:

- **Mock API responses:** Simulate SOQL results for new queries
- **Edge cases:** Empty data, missing fields, API failures
- **Regression:** Existing tests must continue to pass
- **Metric accuracy:** Verify computed metrics against hand-calculated expected values

### 6.2 Integration Tests

| Test                                           | What It Validates                              |
| ---------------------------------------------- | ---------------------------------------------- |
| Settings extraction → CPQSettingValue findings | G-01: Real CPQ settings field values extracted |
| Plugin inventory complete                      | G-02: All 5 plugin statuses produced           |
| User adoption metrics populated                | G-03: License + creator counts match org       |
| Discount distribution sums to total            | G-05: All discounted quotes bucketed           |
| Override count <= discounted quotes            | G-06: No false positive overrides              |
| Top 10 products enriched with names            | G-08: Product lookup successful                |
| Field completeness in valid range              | G-11: All rates between 0-100%                 |
| Hotspot detection fires correctly              | G-13: Known complex org triggers hotspots      |
| Confidence map covers all categories           | G-17: No "undefined" coverage entries          |

### 6.3 LLM Integration Tests

| Test                                            | What It Validates                    |
| ----------------------------------------------- | ------------------------------------ |
| LLM produces valid JSON schema                  | Output matches `LLMEnrichmentSchema` |
| LLM call timeout → graceful fallback            | Assessment complete without LLM      |
| LLM error → assessment still valid              | Non-blocking failure mode            |
| Executive summary has 5 findings                | Output matches benchmark structure   |
| Hotspot analysis covers all identified hotspots | No hotspot left without narrative    |

### 6.4 E2E / Playwright

- Assessment dashboard renders all new data types (settings panel, plugin inventory, discount chart, top products table, feature utilization grid)
- Hotspot analysis section visible in overview tab
- Confidence level badges shown on key metrics

---

## 7. Impact on Existing Components

### 7.1 New Artifact Types

| Type                    | Collector       | Count         | Description                        |
| ----------------------- | --------------- | ------------- | ---------------------------------- |
| `CPQSettingValue`       | settings        | ~10 per run   | Individual setting field values    |
| `PluginStatus`          | settings (post) | 5 per run     | Plugin configured/not status       |
| `UserAdoption`          | discovery       | 1 per run     | License + user metrics             |
| `UserBehavior`          | usage           | 3-6 per run   | Per-role behavior aggregate        |
| `DiscountDistribution`  | usage           | 1 per run     | Bucketed discount analysis         |
| `PriceOverrideAnalysis` | usage           | 1 per run     | Override rate + revenue impact     |
| `OptionAttachmentRate`  | metrics (post)  | 3-8 per run   | Per-category attach rates          |
| `TopQuotedProduct`      | usage           | 10 per run    | Product name + count               |
| `ConversionSegment`     | usage           | 4 per run     | Deal-size conversion               |
| `FieldCompleteness`     | data-quality    | 6 per run     | Per-object fill rates              |
| `ComplexityHotspot`     | summaries       | 2-5 per run   | Named convergence points           |
| `ObjectInventoryItem`   | post-processing | 30-50 per run | Consolidated object list           |
| `CPQReport`             | integrations    | 5-15 per run  | Org CPQ reports                    |
| `QuoteLifecycleStep`    | post-processing | 5-7 per run   | Lifecycle flow steps               |
| `ExtractionConfidence`  | validation      | 12-15 per run | Per-category confidence            |
| `TrendIndicator`        | usage (post)    | 5-8 per run   | Month-over-month trends            |
| `DataQualityFlag`       | validation      | 4-6 per run   | Orphans, duplicates, inactive refs |
| `GlanceDashboard`       | post-processing | 1 per run     | Structured dashboard metrics       |

**Estimated additional findings per run:** 100-160 (on top of existing ~550)

### 7.2 API Budget Impact

| Phase            | New SOQL Queries                                            | Estimated API Calls |
| ---------------- | ----------------------------------------------------------- | ------------------- |
| A (Settings)     | 0 (broader SELECT on existing)                              | 0                   |
| B (Usage)        | 5-7 (licenses, users, product names, orders, quality flags) | 5-7                 |
| C (Presentation) | 19 (18 field sampling + 1 reports)                          | 19                  |
| D (LLM)          | 0                                                           | 1 (Anthropic API)   |
| **Total**        | **24-27**                                                   | **25-27**           |

Current extraction uses ~200 API calls. Addition of ~25 brings total to ~225, well within the 15,000/day limit.

### 7.3 Transform Script Impact

`transform-to-ui.ts` needs updates to handle:

- New `CPQSettingValue` → Settings panel section in UI
- New `PluginStatus` → Plugin inventory section
- New usage analytics findings → Usage & Adoption tab
- New `ComplexityHotspot` → Hotspots section in Overview
- New `ExtractionConfidence` → Confidence badges throughout

### 7.4 Database Impact

No schema changes needed. All new artifact types use existing `assessment_findings` table columns (`artifactType`, `notes`, `evidenceRefs`, `countValue`).

### 7.5 Backward Compatibility

All changes are additive. Existing findings are not modified. The assessment is valid with or without these enhancements — the LLM layer is explicitly optional.

---

## Appendix: Key Artifact Schemas

> **Added per audit (A1 §4):** Without defined schemas, different developers will implement inconsistently. Each artifact type below specifies exactly what goes in `countValue`, `notes`, and `evidenceRefs`.
>
> **`evidenceRefs.type` convention:** The `type: 'count'` is used for all numeric values (counts, percentages, durations) to avoid schema proliferation. The `label` field disambiguates the unit (e.g., `"% of quotes"`, `"avg close days"`, `"conversion %"`). If future needs require typed numerics, introduce `type: 'percentage'` and `type: 'duration-days'` at that point.

### CPQSettingValue

```typescript
{
  artifactType: 'CPQSettingValue',
  artifactName: 'Quote Line Editor',           // Human-readable label from KNOWN_SETTINGS_MAP
  artifactId: 'SBQQ__GeneralSettings__c.SBQQ__QLEEnabled__c',  // Object.Field
  countValue: null,
  notes: 'Quote Line Editor: Enabled',         // "{label}: {value}"
  evidenceRefs: [{ type: 'field-ref', value: 'SBQQ__GeneralSettings__c.SBQQ__QLEEnabled__c', label: 'Enabled' }],
  riskLevel: 'info',
  rcaMappingComplexity: 'direct',              // Most settings have RCA equivalents
}
```

### PluginStatus

```typescript
{
  artifactType: 'PluginStatus',
  artifactName: 'Quote Calculator Plugin (QCP)',
  countValue: 0,                               // 0 = not configured, >0 = active with count
  notes: 'Not Configured — no custom JavaScript calculation injection detected',
  evidenceRefs: [],                            // Or [{ type: 'record-id', value: scriptId }] if active
  riskLevel: 'info',
}
```

### DiscountDistribution

```typescript
{
  artifactType: 'DiscountDistribution',
  artifactName: 'Discount Distribution (90-day)',
  countValue: 936,                             // Total discounted quotes
  notes: 'Avg discount: 7.2%. 45% in 0-5% range, 32% in 6-10%, 16% in 11-15%, 6% in 16-20%, 1% >20%',
  evidenceRefs: [
    { type: 'count', value: '420', label: '0-5%' },
    { type: 'count', value: '299', label: '6-10%' },
    { type: 'count', value: '150', label: '11-15%' },
    { type: 'count', value: '53', label: '16-20%' },
    { type: 'count', value: '14', label: '>20%' },
  ],
}
```

### TopQuotedProduct

```typescript
{
  artifactType: 'TopQuotedProduct',
  artifactName: '2SST6lWrap',                 // Product name
  artifactId: '01tXXXXXXXXXXXXXXX',          // Product2 Id
  countValue: 1245,                            // Distinct quotes containing this product
  notes: 'Category: Equipment. Quoted on 53.2% of quotes (1245 / 2340).',
  evidenceRefs: [
    { type: 'field-ref', value: 'Product2.ProductCode', label: '2SST6lWrap' },
    { type: 'field-ref', value: 'Product2.Family', label: 'Equipment' },
  ],
}
```

### ConversionSegment

```typescript
{
  artifactType: 'ConversionSegment',
  artifactName: 'Medium ($5K-$25K)',
  countValue: 1100,                            // Quotes in this segment
  notes: '47% of quotes, 32% of revenue. Conversion: 54%. Avg close: 5.8 days.',
  evidenceRefs: [
    { type: 'count', value: '47', label: '% of quotes' },
    { type: 'count', value: '32', label: '% of revenue' },
    { type: 'count', value: '54', label: 'conversion %' },
    { type: 'count', value: '5.8', label: 'avg close days' },
  ],
}
```

### ComplexityHotspot

```typescript
{
  artifactType: 'ComplexityHotspot',
  artifactName: 'Quote Pricing Engine',
  riskLevel: 'critical',
  notes: '6 Price Rules + 4 Product Rules + Discount Schedules + Custom Scripts form a multi-layered calculation chain.',
  evidenceRefs: [
    { type: 'count', value: '6', label: 'Price Rules' },
    { type: 'count', value: '4', label: 'Product Rules' },
    { type: 'count', value: '12', label: 'Discount Schedules' },
  ],
  textValue: null,                             // Populated by LLM narrative in Phase D
}
```

### DataQualityFlag

```typescript
{
  artifactType: 'DataQualityFlag',
  artifactName: 'Orphaned Quote Lines',
  countValue: 12,                              // 0 = clean, >0 = flagged
  notes: '12 quote lines found without parent quote in 90-day window. Status: flagged.',
  riskLevel: 'low',                            // or 'info' if clean
  // For "not assessed" items:
  // artifactName: 'Duplicate Products', countValue: null, notes: 'Not assessed in current scope.'
}
```
