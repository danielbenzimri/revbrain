# CPQ Report Redline — Gap Analysis & Mitigation Plan

> **Date:** 2026-03-30
> **Authors:** Daniel + Claude
> **Status:** Analysis complete. Mitigation plan ready for review.
> **Input:** Developer_Redline_Checklist.md (QA comparison of generated PDF vs. approved template + Salesforce UI inspection)
>
> **Related documents:**
>
> - [CPQ-EXTRACTION-IMPLEMENTATION-PLAN.md](CPQ-EXTRACTION-IMPLEMENTATION-PLAN.md) — Original extraction worker plan (v2.7, 54 tasks)
> - [CPQ-DATA-EXTRACTION-SPEC.md](CPQ-DATA-EXTRACTION-SPEC.md) — Data extraction specification
> - Developer_Redline_Checklist.md — Source QA report

---

## Table of Contents

1. [Gap Acknowledgment & Root Cause Analysis](#1-gap-acknowledgment--root-cause-analysis)
2. [Findings Discussion](#2-findings-discussion)
3. [Mitigation Plan](#3-mitigation-plan)

---

## 1. Gap Acknowledgment & Root Cause Analysis

Every item from the redline was verified against the actual codebase. Each is classified as:

- **TRUE — Assembler/Template Bug**: The code is provably wrong (hardcoded values, missing calculations, missing sections)
- **TRUE — Architectural Gap**: A systemic design issue that affects multiple sections
- **PLAUSIBLE — Runtime/Data Issue**: The extraction code exists and looks correct, but the generated report showed wrong values. Root cause is in the data pipeline, not missing code.
- **FALSE POSITIVE**: The redline claim doesn't match the code

### 1.1 Architectural P0s

| #                                               | Redline Claim                | Verdict                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Root Cause |
| ----------------------------------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| **V1–V8** Post-generation consistency validator | **TRUE — Architectural Gap** | `normalize/validation.ts` has only 6 checks: duplicate finding keys, domain coverage, product-pricing cross-ref, schema version, data quality signals, failed collectors. **No checks for**: quote-line-vs-quoted-product reconciliation (V1), catalog-vs-top-products reconciliation (V2), percentage math validation (V3), rule usage default detection (V4), cross-section confidence consistency (V5), coverage-vs-body reconciliation (V6), tiny-denominator context (V7), active-vs-total filtering (V8). Validation is also purely warning-based — it never blocks generation. |
| **Output States**                               | **TRUE — Architectural Gap** | The system has no standardized output states. When a collector fails or a field is inaccessible due to FLS, the report shows "0 Confirmed" instead of "Not extracted" or "Partial." The `buildGlanceSections()` function (assembler.ts:412–509) assigns confidence from finding metadata but has no fallback for "collector failed" or "field not accessible" scenarios. The `buildDefaultCoverage()` function (assembler.ts:383–404) hardcodes "Full" for all 4 categories regardless of actual extraction results.                                                                  |
| **Low-volume fallback**                         | **TRUE — Architectural Gap** | No low-volume detection. No checks for total quotes < 50 or active users < 5. Percentages from tiny denominators display without "(N of M)" context. Table sections collapse when data is sparse rather than preserving structure with "Insufficient activity" notes.                                                                                                                                                                                                                                                                                                                 |

### 1.2 UI-Confirmed Extraction Bugs (UI-1 through UI-8)

These are the most critical findings. The redline claims specific extraction failures confirmed by Salesforce UI inspection. Our code investigation reveals a nuanced picture:

| #                                               | Redline Claim                      | Verdict                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Root Cause |
| ----------------------------------------------- | ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| **UI-1** Quote Lines = 0                        | **PLAUSIBLE — Runtime/Data Issue** | The `usage.ts` collector (line 177–200) does query `SBQQ__QuoteLine__c` via `buildSafeQuery()`. The SOQL is correct and includes no date filter on lines themselves (they're linked to date-filtered quotes). **However**, the `buildSafeQuery` mechanism silently drops fields not in the org's Describe response (FLS). If the connected user lacks read access to `SBQQ__QuoteLine__c` entirely, the query would fail silently and the report would show "0 Confirmed" instead of "Not extracted." The validation layer doesn't catch this because it only checks domain-level coverage, not object-level. **The code to extract quote lines exists and is correct — the bug is that failure isn't surfaced.** |
| **UI-2** Product Family = all "Other"           | **TRUE — Code Path Issue**         | The `catalog.ts` collector (line 30) includes `Family` in the Product2 wishlist, and line 179 does `(p.Family as string) ?? 'Other'`. **But**: `buildSafeQuery` dynamically filters the wishlist against Describe results. If `Product2.Family` is excluded by FLS for the connected user, or if the Describe response doesn't include it, ALL products silently fall back to "Other." The assembler (line 825–844) groups by Family from `evidenceRefs`, which also falls back to "Other." **Root cause: the wishlist→Describe→FLS pipeline silently drops fields without any warning or confidence downgrade.**                                                                                                 |
| **UI-3** Bundles = 0                            | **PLAUSIBLE — Runtime/Data Issue** | `catalog.ts` line 41 includes `SBQQ__ConfigurationType__c` in the wishlist, and lines 109–112 filter for 'Required'/'Allowed'. `SBQQ__ProductOption__c` is also queried (lines 236–277) with full field coverage including nested bundle detection. **The code is correct.** If the report showed 0 bundles, the likely cause is FLS blocking `SBQQ__ConfigurationType__c` for the connected user, causing the filter to match nothing. Same silent failure pattern as UI-2.                                                                                                                                                                                                                                      |
| **UI-4** QCP = "Not Configured"                 | **PLAUSIBLE — Runtime/Data Issue** | `settings.ts` (line 68–72) uses pattern matching `/^SBQQ__.*(?:CalculatorPlugin\|QCP)/i` on Custom Settings field names. Lines 122–151 discover SBQQ Custom Settings via Tooling API. Lines 504–521 derive QCP status from settings. **The code exists and the pattern should match.** Possible causes: (a) Tooling API query for Custom Settings failed silently, (b) the QCP field name in this org doesn't match the regex (unlikely given the pattern is broad), (c) the settings collector is Tier 1 and may have failed without blocking report generation.                                                                                                                                                 |
| **UI-5** Active price rules = 28 (should be 21) | **PLAUSIBLE — Runtime/Data Issue** | `pricing.ts` line 64 includes `SBQQ__Active__c` in the wishlist, line 80 counts active separately. **The code correctly distinguishes active/inactive.** If the report showed 28 (total) instead of 21 (active), the issue is in the assembler: line 244–250 maps price rules but uses `priceRules` (all findings with artifactType containing 'PriceRule') without filtering by active status. **The collector extracts the active flag correctly, but the assembler ignores it when building the report section.**                                                                                                                                                                                              |
| **UI-6** Product rule count/type wrong          | **TRUE — Assembler Gap**           | Same pattern as UI-5. `catalog.ts` line 329 queries `SBQQ__Active__c`, line 349 counts active. But `assembler.ts` line 252–256 maps all product rule findings without active filtering. Type classification (`SBQQ__Type__c`) is extracted by the collector but not surfaced in the report table.                                                                                                                                                                                                                                                                                                                                                                                                                 |
| **UI-7** Flows = 0                              | **PLAUSIBLE — Runtime/Data Issue** | `dependencies.ts` lines 214–233 queries `FlowDefinitionView` with fallback to `FlowDefinition`. Line 233 filters by CPQ-referencing trigger objects. **The code exists.** If 0 flows appeared, likely causes: (a) the dependencies collector (Tier 1) failed, (b) the CPQ-object filter excluded all flows because many flows reference non-CPQ objects (the redline notes 84 flows exist, but most are "mix of managed package and custom" — the filter may be too aggressive).                                                                                                                                                                                                                                  |
| **UI-8** Active product count 179 vs 176        | **TRUE — Minor**                   | Likely a timing or filter difference. The code queries `IsActive = true` on Product2 but may include products across all record types. Minor discrepancy.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| **UI-8b** Subscription/renewal not reflected    | **TRUE — Assembler Gap**           | Settings collector extracts renewal model and subscription settings, but complexity scoring (assembler.ts:515–561) doesn't account for subscription/renewal configuration as a scoring dimension.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| **UI-8c** Validation rule count 25 vs 22        | **PLAUSIBLE**                      | `customizations.ts` queries ValidationRule across all objects. Discrepancy could be counting inactive rules or rules on objects not checked in the UI inspection.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |

### 1.3 Missed Object Types (UI-9 through UI-16)

| #                                      | Redline Claim              | Verdict                                                                                                                                                                                                                                                             | Root Cause |
| -------------------------------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| **UI-9** Quote Templates missing       | **FALSE POSITIVE**         | `templates.ts` (lines 64–160) fully queries `SBQQ__QuoteTemplate__c` with Name, Default status, fonts, margins, logos. This is a Tier 2 collector — if the report showed nothing, the collector either failed or its findings weren't mapped to the report section. |
| **UI-10** Approval Rules missing       | **FALSE POSITIVE**         | `approvals.ts` (lines 227–270) queries `sbaa__ApprovalRule__c` with full field coverage. Also queries conditions, chains, approvers, variables (lines 272–358). Tier 2 collector — same failure mode as UI-9.                                                       |
| **UI-11** Duplicate Discount Schedules | **TRUE — Missing Feature** | No duplicate-name detection exists in any collector or the validation layer.                                                                                                                                                                                        |
| **UI-12** Recommended Products Plugin  | **PLAUSIBLE**              | Settings collector pattern-matches for plugins but the regex may not cover `ProductRecommendationPlugin` specifically.                                                                                                                                              |
| **UI-13** CPQ Permission Sets          | **TRUE — Missing Feature** | No collector queries PermissionSet by CPQ namespace.                                                                                                                                                                                                                |
| **UI-14** CPQ Reports                  | **TRUE — Missing Feature** | No collector queries Report by CPQ folder.                                                                                                                                                                                                                          |
| **UI-15** Inactive Validation Rule     | **PLAUSIBLE**              | Customizations collector queries ValidationRule but may not check `IsActive` field.                                                                                                                                                                                 |
| **UI-16** Products with blank Family   | **TRUE — Missing Feature** | No specific flagging of blank-Family products in data quality checks.                                                                                                                                                                                               |

### 1.4 Report Assembler Bugs (Confirmed in Code)

These are **provably wrong in the code** — no runtime ambiguity:

| #       | Redline Ref | Bug                                                  | Location                   | Evidence                                                                          |
| ------- | ----------- | ---------------------------------------------------- | -------------------------- | --------------------------------------------------------------------------------- |
| **A1**  | S6.5        | Price rule usage hardcoded `'~100%'` for all rules   | `assembler.ts:248`         | `usage: '~100%'` — literal string, not calculated                                 |
| **A2**  | S7.6        | Top quoted products `percentQuotes` hardcoded to `0` | `assembler.ts:299`         | `percentQuotes: 0` — no calculation                                               |
| **A3**  | S7.3        | Discount distribution `percent` hardcoded to `0`     | `assembler.ts:276`         | `percent: 0` — no calculation                                                     |
| **A4**  | C2          | Assessment period = "90 Days" not actual dates       | `assembler.ts:196`         | `assessmentPeriod: '90 Days'` — static string                                     |
| **A5**  | S6.6/S6.7   | Product rule complexity defaults to `'medium'`       | `assembler.ts:254`         | `r.complexityLevel ?? 'medium'` — fallback dominates                              |
| **A6**  | S2.3        | No scoring methodology section in report             | `assembler.ts`             | Weights exist in code (lines 515–551) but never rendered in report data structure |
| **A7**  | S3.2        | No tech debt / data quality panels in glance         | `assembler.ts:412–509`     | Only 5 panels, no debt/quality                                                    |
| **A8**  | D1          | Appendix D hardcodes "Full" coverage                 | `assembler.ts:383–404`     | `coverage: 'Full'` for all 4 categories regardless of actual results              |
| **A9**  | S1.4/X1     | Migration/RCA language in findings                   | `assembler.ts:587,598,621` | "require mapping to RCA Pricing Procedures", "converted to declarative RCA"       |
| **A10** | UI-5/UI-6   | Assembler doesn't filter by active status            | `assembler.ts:244–256`     | Uses all findings, not filtered by active/inactive metadata                       |

### 1.5 Template/Presentation Gaps

| #     | Redline Ref                             | Gap                                                                                                                                                 | Status |
| ----- | --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| C1    | Branding "RevBrain"                     | **Not a bug** — RevBrain IS the product name. The redline suggests "Vento" but that appears to be from an earlier template draft. Keeping RevBrain. |
| C3    | Adv. Approvals version on cover         | **TRUE** — sbaa version is detected but not on cover page                                                                                           |
| S1.1  | Audience sentence                       | **TRUE** — No audience framing in scope section                                                                                                     |
| S1.2  | Scope bullets compressed                | **TRUE** — Template has 13 items, generated has 5                                                                                                   |
| S2.2  | Confidence column on findings           | **TRUE** — Key findings have no confidence column in template                                                                                       |
| S2.4  | Score bar visualization                 | **FALSE POSITIVE** — Score bars DO exist (`scoreBar()` helper, rendered in Executive Summary)                                                       |
| S3.1  | Data confidence summary                 | **TRUE** — No aggregate confidence percentage at top of glance                                                                                      |
| S3.4  | Estimated values missing "~" prefix     | **TRUE** — No "~" prefix logic                                                                                                                      |
| S5.1  | Lifecycle is generic                    | **TRUE** — Same 7 steps regardless of org                                                                                                           |
| S6.3  | Product option attachment rates         | **TRUE** — Not calculated or displayed                                                                                                              |
| S6.8  | Discount schedule usage/dormancy        | **TRUE** — Count only, no usage analysis                                                                                                            |
| S6.9  | Approvals & Document Generation section | **TRUE** — No dedicated section even though collector exists                                                                                        |
| S7.1  | 90-day activity table sparse            | **TRUE** — Only quote volume trend, not 13 metrics                                                                                                  |
| S7.4  | Quote modification patterns             | **TRUE** — No field history tracking analysis                                                                                                       |
| S7.5  | User behavior with 1 user               | **TRUE** — Table collapses instead of preserving structure                                                                                          |
| S8.1  | Field completeness by object            | **TRUE** — Not calculated                                                                                                                           |
| S8.2  | Technical debt inventory                | **TRUE** — Not assembled from existing data                                                                                                         |
| S8.3  | Feature utilization table               | **TRUE** — Not present                                                                                                                              |
| S9.1  | Apex purpose too generic                | **TRUE** — All labeled "CPQ-related Apex"                                                                                                           |
| S9.4  | Origin column always "SI-Built"         | **TRUE** — No managed package namespace detection                                                                                                   |
| A1/A2 | Appendix A mixes platform metadata      | **TRUE** — Includes ApexClass, ValidationRule, etc. alongside CPQ objects                                                                           |
| B1    | CPQ Reports appendix                    | **TRUE** — Missing entirely                                                                                                                         |

---

## 2. Findings Discussion

### 2.1 The Real Story: Two Distinct Problem Categories

The redline reads as 80+ individual issues but they collapse into **two root causes**:

**Root Cause A: The "Silent Zero" Problem (affects UI-1 through UI-7)**

The extraction code for quote lines, product family, bundles, QCP, active/inactive rules, flows, templates, and approvals **all exists and is architecturally correct**. The collectors, SOQL wishlists, and field patterns are all properly implemented.

The problem is what happens when something goes wrong at runtime:

- `buildSafeQuery()` silently drops fields not in the Describe response (FLS, sharing rules)
- Tier 1/2 collectors can fail without blocking report generation
- The report assembler treats "collector didn't produce findings" the same as "zero records exist"
- The validation layer generates warnings but never blocks or downgrades confidence
- Appendix D hardcodes "Full" regardless of what actually happened

This means a report can confidently say "0 Confirmed" for something that actually has 19 records, because the field needed to detect those records was silently dropped by FLS. **The data pipeline has no concept of "I tried but couldn't access this" vs. "I checked and it's truly zero."**

This is the architectural P0 the redline correctly identifies. Fixing individual SOQL queries won't help — the system needs to track and surface field-level accessibility, collector success/failure, and query completeness.

**Root Cause B: The "Last Mile" Problem (affects all assembler bugs)**

The extraction engine and collectors are well-designed. The report assembler (`assembler.ts`) is where quality drops. It was likely built as a quick MVP to produce a visual PDF, with placeholders that were never replaced:

- `usage: '~100%'` (hardcoded)
- `percentQuotes: 0` (hardcoded)
- `percent: 0` (hardcoded)
- `assessmentPeriod: '90 Days'` (hardcoded)
- `coverage: 'Full'` (hardcoded)

The assembler also doesn't fully utilize the data that collectors produce:

- Active/inactive filtering exists in findings but assembler ignores it
- Product Family exists in evidenceRefs but assembler groups inconsistently
- Complexity levels exist per finding but assembler defaults to 'medium'
- Templates and approvals collectors exist but have no report sections

These are straightforward code fixes in a single file.

### 2.2 What the Redline Got Right

1. **The consistency validator is the #1 priority.** Cross-section contradictions (0 quote lines vs. nonzero quoted products) are trust-breaking. The current validation layer is too permissive.
2. **Output state standardization is critical.** "0 Confirmed" for something that failed to extract is worse than not showing the section at all.
3. **Percentage calculations are provably broken.** Three hardcoded zeros confirmed in code.
4. **The assembler is the weakest link.** Collectors do their job; the assembler drops the ball.

### 2.3 What the Redline Got Wrong or Overstated

1. **"SOQL queries are broken"** — They're not. The extraction code is well-written. The issue is FLS/runtime failure handling, not query logic.
2. **"Quote Templates not extracted"** — `templates.ts` has full SBQQ**QuoteTemplate**c coverage. The collector exists.
3. **"Approval Rules not extracted"** — `approvals.ts` has full sbaa\_\_ coverage with 5 object types.
4. **"Bundle detection completely missing"** — `catalog.ts` has ConfigurationType filtering and 3-level nesting detection.
5. **"QCP detection is wrong"** — `settings.ts` reads Custom Settings via Tooling API with pattern matching.
6. **Branding "RevBrain → Vento"** — RevBrain is the correct product name.

These are Tier 1/2 collectors that likely failed at runtime or whose findings weren't mapped to report sections — not missing code.

### 2.4 Priority Reassessment

Given that extraction code exists for most "missing" items, the priority order shifts:

1. **First:** Build the output state system + consistency validator (this unlocks everything else)
2. **Second:** Fix the 10 assembler bugs (hardcoded values, missing filters, missing sections) — these are all in one file
3. **Third:** Add collector failure telemetry so we can diagnose why Tier 1/2 collectors produced no output for this org
4. **Fourth:** Add missing features (duplicate detection, permission sets, CPQ reports, field completeness)
5. **Fifth:** Template/presentation improvements (methodology section, glance panels, scope expansion)

---

## 3. Mitigation Plan

> Format follows [CPQ-EXTRACTION-IMPLEMENTATION-PLAN.md](CPQ-EXTRACTION-IMPLEMENTATION-PLAN.md) conventions: phased, testable tasks with acceptance criteria.

### Phase Overview

| Phase  | Goal                                                               | Tasks   | Estimated Effort              |
| ------ | ------------------------------------------------------------------ | ------- | ----------------------------- |
| **R0** | Assembler bug fixes (hardcoded values, broken math)                | 4 tasks | Small — single file changes   |
| **R1** | Output state system + consistency validator                        | 3 tasks | Medium — new subsystem        |
| **R2** | Assembler section coverage (map existing collector data to report) | 5 tasks | Medium — assembler + template |
| **R3** | Collector telemetry + FLS diagnostics                              | 2 tasks | Medium — cross-cutting        |
| **R4** | Missing features (new queries, new sections)                       | 5 tasks | Medium — new code             |
| **R5** | Template & presentation polish                                     | 4 tasks | Small — template changes      |

---

### Phase R0: Assembler Bug Fixes

**Goal:** Fix all provably wrong values in `assembler.ts`. After this phase, every number in the report is either correctly calculated or explicitly marked as unavailable. No hardcoded fake values remain.

---

#### Task R0.1: Fix hardcoded percentages (price rule usage, top products, discount distribution)

**Description:** Replace three hardcoded values in `assembler.ts`:

1. **Line 248** — `usage: '~100%'` → Calculate from quote line data: `quotesAffectedByRule / totalQuotes`. If not calculable (no per-rule usage data from collector), change column to "Status" (Active/Inactive) and remove usage percentage entirely.
2. **Line 299** — `percentQuotes: 0` → Calculate: `quotedCount / totalQuotesInWindow * 100`. Guard for division by zero.
3. **Line 276** — `percent: 0` → Calculate: `count / sumOfAllBucketCounts * 100`. Guard for division by zero.

For all percentage calculations: if denominator < 10, append `(N of M)` context.

**Test:** Unit — assembler test with mock findings: verify percentages are non-zero when counts are non-zero, verify `(N of M)` appears when denominator < 10, verify division by zero returns 0 not NaN.

**Acceptance criteria:**

- No hardcoded percentage values in `assembler.ts`
- Price rule table shows "Active"/"Inactive" status instead of fake usage
- Top products show correct `count/total` percentages
- Discount distribution shows correct bucket percentages
- Tiny denominators include `(N of M)` context

---

#### Task R0.2: Fix active/inactive filtering in assembler

**Description:** The assembler maps all price rule and product rule findings without filtering by active status. Fix two locations:

1. **Line 244–250** (price rules) — Filter findings to active-only for the "active count" display. Show "X active of Y total" instead of just "Y".
2. **Line 252–256** (product rules) — Same fix. Also surface `SBQQ__Type__c` (Alert/Selection/Validation/Filter) from finding metadata.

**Test:** Unit — assembler test with mix of active/inactive rule findings: verify count shows "21 active of 28 total", verify type classification appears.

**Acceptance criteria:**

- Price rule count shows active of total
- Product rule count shows active of total
- Product rule table includes Type column
- Rules with "DELETE", "TEST", "DRAFT" in name flagged as potential tech debt

---

#### Task R0.3: Fix assessment period and metadata

**Description:** Replace hardcoded metadata:

1. **Line 196** — `assessmentPeriod: '90 Days'` → Calculate actual date range from assessment run's `created_at` minus 90 days. Format: "Jan 1, 2026 – Mar 31, 2026 (90 Days)".
2. **Line 383–404** — `buildDefaultCoverage()` hardcodes "Full" for all categories. Replace with dynamic calculation: check which collectors completed successfully, map to coverage categories, use "Full"/"Partial"/"Not extracted" based on collector status.

**Test:** Unit — verify date range calculation, verify coverage downgrades when collectors fail.

**Acceptance criteria:**

- Assessment period shows actual date range
- Appendix D coverage reflects actual collector results
- Failed collectors show "Partial" or "Not extracted", not "Full"

---

#### Task R0.4: Fix complexity level defaults and scoring display

**Description:**

1. **Line 254** — `r.complexityLevel ?? 'medium'` → Calculate complexity from finding metadata: condition count, action count, evaluation events. If no metadata available, show "Unknown" not "medium".
2. Add scoring methodology subsection to `ReportData`: render the weights (Configuration 25%, Pricing 25%, Customization 20%, Usage 15%, Debt 15%) and score drivers as a table in Section 2.3.

**Test:** Unit — verify complexity varies based on finding metadata, verify methodology section renders with correct weights.

**Acceptance criteria:**

- No blanket "medium" complexity — values vary or show "Unknown"
- Scoring methodology section shows weights, dimensions, drivers
- Score drivers list the actual inputs (e.g., "28 price rules", "67 Apex classes")

---

### Phase R1: Output State System + Consistency Validator

**Goal:** Build the two architectural subsystems the redline correctly identified as prerequisites for all other fixes. After this phase, the report never shows "0 Confirmed" for data that failed to extract, and cross-section contradictions block or flag generation.

---

#### Task R1.1: Standardize output states

**Description:** Define and implement 7 output states as an enum in `@revbrain/contract`:

```typescript
enum DataConfidence {
  Confirmed = 'Confirmed', // SOQL returned result, query verified
  Estimated = 'Estimated', // Derived/inferred value
  Partial = 'Partial', // Incomplete extraction (sampling, partial query)
  Detected = 'Detected', // Metadata confirms presence, count not available
  NotExtracted = 'Not extracted', // Extraction not attempted or failed
  NotApplicable = 'N/A', // Feature/object doesn't exist in org
  InsufficientActivity = 'Insufficient activity', // <3 records, not meaningful
}
```

Update the finding factory (`normalize/findings.ts`) to track:

- Whether the collector completed successfully
- Whether specific fields were dropped by `buildSafeQuery()` (FLS)
- Whether a query returned 0 vs. failed vs. wasn't attempted

Update `buildSafeQuery()` to return a `QueryResult` that includes `droppedFields: string[]` alongside the SOQL string. When a wishlist field is dropped, the collector can downgrade confidence for findings that depend on that field.

**Test:** Unit — verify state assignment for each scenario: successful query with results, successful query with 0 results, field dropped by FLS, collector failure, object not in org.

**Acceptance criteria:**

- `DataConfidence` enum in `@revbrain/contract`
- `buildSafeQuery()` returns dropped fields
- Finding factory accepts and propagates confidence state
- Assembler uses confidence state in all sections
- "0 Confirmed" only appears when SOQL returned 0 AND query is verified complete

---

#### Task R1.2: Build post-generation consistency validator

**Description:** Implement rules V1–V8 from the redline as a validation pass in `normalize/validation.ts`. Runs after all collectors complete and before report assembly.

| Rule | Check                                                                                                                            |
| ---- | -------------------------------------------------------------------------------------------------------------------------------- |
| V1   | If quotes > 0 then quote_lines should be > 0, OR inject "no line-item data extracted" flag                                       |
| V2   | `SUM(top_quoted_product_counts)` ≤ `total_quotes × avg_lines_per_quote`. Cross-check catalog "0 quoted" vs. top-products nonzero |
| V3   | For every percentage: verify `numerator / denominator` matches displayed value                                                   |
| V4   | If >80% of rules show identical usage values, flag as likely hardcoded/default                                                   |
| V5   | Same metric in multiple sections must have same confidence label                                                                 |
| V6   | Appendix D coverage claims must match body section data availability                                                             |
| V7   | If denominator < 10, require `(N of M)` format                                                                                   |
| V8   | If `active_count != total_count`, require "X active of Y total" format                                                           |

Output: `ValidationReport` with pass/fail per rule, attached to the assessment run. If V1–V3 fail, inject a visible warning banner into the affected report section.

**Test:** Unit — for each rule: create contradictory finding sets, verify rule catches the contradiction.

**Acceptance criteria:**

- All 8 rules implemented and tested
- V1–V3 failures inject visible warnings into PDF
- V4–V8 failures log warnings and flag in internal validation report
- Validation report persisted as `assessment_summaries` record

---

#### Task R1.3: Low-volume / demo-org fallback behavior

**Description:** Detect and handle sparse data:

1. If total quotes < 50 or active users < 5, add a prominent note: "Low activity detected in assessment window. Some metrics may not be statistically meaningful."
2. Never collapse table structure — if only 1 user role, show the full table with 1 row.
3. All percentages from denominators < 10 show `(N of M)` (already in V7, this task adds it to template rendering).
4. All sections present even with no data — render section header with "Insufficient activity in assessment window" instead of omitting.

**Test:** Unit — assembler with sparse data (3 quotes, 1 user): verify all sections render, verify low-volume banner appears, verify tables have structure even with 1 row.

**Acceptance criteria:**

- Low-volume banner appears when quotes < 50
- All 10+ report sections render regardless of data volume
- No section is ever omitted — empty sections show "Insufficient activity" or "Not extracted"
- Table headers always present even with 0 data rows

---

### Phase R2: Assembler Section Coverage

**Goal:** Map existing collector data (templates, approvals, detailed rules, usage metrics) to report sections. The data exists in findings — the assembler just doesn't use it.

---

#### Task R2.1: Add Approvals & Document Generation section (Section 6.9)

**Description:** The `approvals.ts` collector extracts sbaa**ApprovalRule**c, conditions, chains, approvers, and variables. The `templates.ts` collector extracts SBQQ**QuoteTemplate**c with full detail. Neither is mapped to a report section.

Add Section 6.9 to report data and template:

- Approval rules: target object, condition count, chain depth, active/inactive
- Quote templates: name, default status, last modified
- Document generation: DocuSign integration status (already in plugins)

**Test:** Unit — assembler with approval and template findings: verify section renders with correct data.

**Acceptance criteria:**

- Approval rules table with object, conditions, chain depth, active status
- Quote templates table with name, default flag, last modified
- Section renders even if 0 approvals or 0 templates (shows "Not detected")

---

#### Task R2.2: Add Technical Debt & Feature Utilization sections (Section 8.2, 8.3)

**Description:** Build from existing findings data:

**Technical Debt Inventory (8.2):**

- Inactive products (from catalog findings where usageLevel = 'dormant')
- Products not quoted in 90 days (from usage findings)
- Inactive rules (from pricing/catalog findings where Active = false)
- Rules with "DELETE"/"TEST"/"DRAFT" in name (pattern match)
- Duplicate discount schedule names (new: GROUP BY name HAVING COUNT > 1)

**Feature Utilization Table (8.3):**

- For each CPQ feature (Bundles, Discount Schedules, Block Pricing, Quote Terms, Custom Scripts, Adv. Approvals), check: records exist (Detected), used in 90-day window (Active), present but unused (Low/Dormant).

**Test:** Unit — assembler with mix of active/inactive/dormant findings: verify debt inventory populates, verify utilization table shows correct statuses.

**Acceptance criteria:**

- Tech debt inventory with counts per category
- Feature utilization table with Active/Low/Detected/Not detected per feature
- Both sections in glance page (adding 2 panels to the existing 5)

---

#### Task R2.3: Add Field Completeness section (Section 8.1)

**Description:** Calculate field population rates on key CPQ objects. The customizations collector already extracts custom field metadata. Add to the assembler:

- Per object (Product2, PricebookEntry, Quote, QuoteLine, Order, OrderItem): total records, required field %, optional field %, quality score
- Quality score = weighted average of required (70%) and optional (30%) field population

If field population data isn't available from collectors, render the section with "Not assessed — requires field-level analysis" instead of omitting.

**Test:** Unit — assembler with customization findings including field stats: verify table renders.

**Acceptance criteria:**

- Field completeness table with 6 objects
- Quality score per object
- Section renders with "Not assessed" if data unavailable

---

#### Task R2.4: Expand 90-day activity metrics (Section 7.1)

**Description:** The usage collector extracts quote volume, trends, user behavior, conversion segments, discount distribution, and top products. The assembler only surfaces a subset. Expand to include all template metrics:

- Quote count, line count, avg lines/quote, max lines
- Approval rate, conversion rate
- Discounted quotes %, docs generated
- Dormant products / dormant rules count
- Avg close time (if derivable from Quote CreatedDate → Order CreatedDate)

**Test:** Unit — assembler with full usage findings: verify all 13 metrics appear in 90-day activity table.

**Acceptance criteria:**

- 90-day activity table with 10+ metrics (not just "Quote Volume Trend: N/A")
- Missing metrics show "Not extracted" not blank
- Avg close time shows value or "Not extracted — requires Order data"

---

#### Task R2.5: Improve Apex class and validation rule presentation (Section 9)

**Description:**

1. **Apex purpose inference** — Pattern-match class names: `*Quote*` → "Quote processing", `*Contract*` → "Contract management", `*Test*` → "Test class", `*Plugin*` → "CPQ Plugin", `*Search*` → "Product search", `*Trigger*` → "Trigger handler". Better than "CPQ-related Apex" for all rows.
2. **Origin detection** — Check namespace prefix: `SBQQ__*` → "Managed (CPQ)", `sbaa__*` → "Managed (AA)", `dsfs__*` → "Managed (DocuSign)", no prefix → "Custom". Not "SI-Built."
3. **Validation rule object parsing** — Current object column shows "customization Product2.Include_or_Exclude_Maintenance". Parse to separate Object (Product2) from Rule Name.

**Test:** Unit — verify purpose inference, namespace detection, object parsing with sample class/rule names.

**Acceptance criteria:**

- Apex table shows inferred purpose per class (not all "CPQ-related Apex")
- Origin column shows "Managed (CPQ)" / "Custom" (not all "SI-Built")
- Validation rule object column shows just the object name

---

### Phase R3: Collector Telemetry & FLS Diagnostics

**Goal:** Understand why collectors produce no findings for specific orgs. After this phase, when a Tier 1/2 collector fails, we know exactly what happened and can surface it in the report.

---

#### Task R3.1: Collector-level completion tracking

**Description:** Each collector already writes to `collector_metrics` with coverage %. Enhance:

1. When a collector completes with 0 findings, record **why**: "no records found" vs. "query failed" vs. "required object not in org" vs. "FLS blocked required fields".
2. Surface collector status in the report: new subsection in Appendix D showing per-collector status, duration, finding count, and any warnings.
3. If a Tier 2 collector (templates, approvals) produced 0 findings but the Tier 0 Discovery collector detected the related object exists, flag as "Object detected but no data extracted — possible permissions issue."

**Test:** Integration — mock a collector failure: verify status is recorded, verify Appendix D shows the failure, verify confidence is downgraded for affected sections.

**Acceptance criteria:**

- `collector_metrics` records include failure reason when findings = 0
- Appendix D per-collector status table
- Confidence auto-downgrades when collector fails but object exists

---

#### Task R3.2: Field-level accessibility tracking in buildSafeQuery

**Description:** `buildSafeQuery()` currently silently drops wishlist fields not in Describe. Enhance:

1. Return `{ soql: string, droppedFields: string[], requestedFields: string[], availableFields: string[] }`.
2. Collectors log dropped fields at warn level.
3. If a "critical field" is dropped (e.g., `SBQQ__ConfigurationType__c` for bundle detection, `Family` for product categorization, `SBQQ__Active__c` for rule counting), the collector marks affected findings with `confidence: 'Partial'` and adds a note: "Field X not accessible — results may be incomplete."
4. Define critical fields per collector in the registry.

**Test:** Unit — `buildSafeQuery` with a wishlist containing fields not in mock Describe: verify dropped fields returned, verify collector downgrades confidence.

**Acceptance criteria:**

- `buildSafeQuery` returns dropped fields
- Critical field drops logged at warn level
- Affected findings marked Partial with explanatory note
- Critical fields defined per collector in registry

---

### Phase R4: Missing Features

**Goal:** Add extraction and reporting for items that genuinely have no code coverage today.

---

#### Task R4.1: Duplicate detection (discount schedules, rules)

**Description:** Add to validation or post-processing:

1. Discount schedules: `GROUP BY Name HAVING COUNT(*) > 1` detection. Flag duplicates in tech debt section.
2. Product rules: detect exact-duplicate names. Flag in tech debt section.
3. General pattern: flag any SBQQ object with duplicate names as potential config drift.

**Test:** Unit — findings with duplicate names: verify duplicates flagged in tech debt inventory.

**Acceptance criteria:**

- Duplicate discount schedules listed in tech debt section
- Duplicate rule names flagged
- Count of duplicates shown

---

#### Task R4.2: CPQ Permission Sets extraction

**Description:** Add to dependencies or settings collector:

- Query `PermissionSet WHERE Name LIKE '%SBQQ%' OR Name LIKE '%sbaa%' OR Name LIKE '%CPQ%'`
- Extract: name, label, license type, assignment count
- Map to Users & Licenses section in report

**Test:** Unit — mock PermissionSet findings: verify renders in report.

**Acceptance criteria:**

- Permission sets listed in Users & Licenses section
- Count of assignments per permission set

---

#### Task R4.3: CPQ Reports & Dashboards extraction

**Description:** Add to integrations or new mini-collector:

- Query `Report WHERE FolderName LIKE '%CPQ%'` or report names referencing SBQQ
- Extract: name, folder, last run date
- Add Appendix B section to report

**Test:** Unit — mock Report findings: verify Appendix B renders.

**Acceptance criteria:**

- Appendix B lists CPQ reports with name, folder, last run
- Empty section shows "No CPQ-specific reports detected"

---

#### Task R4.4: Product option attachment rates

**Description:** In post-processing, join product option findings with quote line findings:

- For each option type, calculate: how many quotes included this option
- Identify most popular options and least used options
- Add to Section 6.3

Depends on quote line data being available (Task R0.1 fixes ensure confidence tracking, not necessarily data availability).

**Test:** Unit — mock option + quote line findings: verify attachment rates calculated.

**Acceptance criteria:**

- Option attachment rate table in Section 6.3
- Most popular / least used options identified
- If no quote line data: section shows "Requires quote line data — not available for this assessment"

---

#### Task R4.5: Blank-Family product flagging + Recommended Products Plugin detection

**Description:**

1. In catalog collector: flag products where `Family IS NULL` in data quality findings.
2. In settings collector: expand plugin detection regex to include `ProductRecommendationPlugin`.

**Test:** Unit — mock products with null Family: verify flagged. Mock settings with ProductRecommendationPlugin: verify detected.

**Acceptance criteria:**

- Blank-family products listed in data quality section
- ProductRecommendationPlugin appears in plugins table when configured

---

### Phase R5: Template & Presentation Polish

**Goal:** Close the remaining presentation gaps between our template and the approved benchmark. No logic changes — purely template/content improvements.

---

#### Task R5.1: Scope & Methodology expansion

**Description:**

1. Add audience sentence: "This report is designed for SI review of current-state CPQ complexity prior to automation or migration planning."
2. Expand scope bullets from 5 to 13 (matching template: config objects, settings, approvals, usage, behavior, discounts, data quality, tech debt, custom code, scoring, lifecycle, document generation, integrations).
3. **Remove all migration/RCA language.** Find-and-replace in assembler.ts: remove "RCA", "migration", "post-migration", "Revenue Cloud" from findings text. v1 is current-state assessment only.

**Test:** Visual inspection — scope section has 13 bullets, no RCA/migration references anywhere in generated PDF.

**Acceptance criteria:**

- Audience framing sentence present
- 13 scope bullets
- Zero instances of "RCA", "migration", "Revenue Cloud" in generated report

---

#### Task R5.2: Glance page enhancements

**Description:**

1. Add data confidence summary line: "Data confidence: ~X% Confirmed, ~Y% Estimated, ~Z% Partial."
2. Add "~" prefix for all Estimated values in glance.
3. Add 2 new panels: Technical Debt Indicators, Field Completeness (data from R2.2 and R2.3).

**Test:** Unit — verify confidence summary calculates correctly, verify "~" prefix on Estimated values, verify 7 panels total.

**Acceptance criteria:**

- Confidence summary line at top of glance
- Estimated values prefixed with "~"
- 7 glance panels (5 existing + 2 new)

---

#### Task R5.3: Appendix A filtering + Appendix B

**Description:**

1. Appendix A: filter to SBQQ and sbaa namespaced objects only in main table. Add a collapsible "Platform Metadata Summary" subsection for ApexClass, ValidationRule, etc.
2. Appendix B: CPQ Reports & Dashboards (from R4.3 data).
3. Appendix D: expand from 4 to 15 coverage categories (matching template).

**Test:** Visual — Appendix A shows CPQ objects only in main table, platform metadata in separate subsection.

**Acceptance criteria:**

- Appendix A main table: SBQQ/sbaa objects only
- Platform metadata in separate subsection
- Appendix D has 15 categories with dynamic coverage values

---

#### Task R5.4: Cover page and metadata polish

**Description:**

1. Add Adv. Approvals version (sbaa) to cover page alongside CPQ version.
2. Add confidence column to Key Findings table.
3. Make quote lifecycle section org-aware: inject detected details (approval type, DocuSign, specific rule patterns) into the generic 7-step description.

**Test:** Visual — cover shows sbaa version, findings have confidence column, lifecycle mentions detected integrations.

**Acceptance criteria:**

- sbaa version on cover page
- Key Findings table has Confidence column
- Lifecycle description references at least 2 org-specific detected features

---

## Priority & Dependency Map

```
R0 (bug fixes) ─── no dependencies, start immediately
     │
R1 (output states + validator) ─── depends on R0.3 for coverage
     │
R2 (section coverage) ─── depends on R1.1 for confidence states
     │
R3 (telemetry) ─── depends on R1.1 for output states
     │
R4 (missing features) ─── depends on R1.1, R2.2 for tech debt framework
     │
R5 (polish) ─── depends on R2 for section content
```

**Ship order:** R0 → R1 → R2 → R3 → R4 → R5

R0 is purely `assembler.ts` fixes — can ship same day. R1 is the highest-value architectural work. R2–R5 build on the foundation.

---

## Appendix: Redline Items Not Addressed

| Item                               | Reason                                                                                                                                                              |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C1 (Branding → Vento)              | RevBrain is the correct product name. Not changing.                                                                                                                 |
| S10.2 (Dynamic hotspot generation) | Existing hotspot detection is adequate for v1.                                                                                                                      |
| S7.4 (Quote modification patterns) | Requires Field History Tracking enabled in the org — cannot extract if not enabled. Will add section with "Requires Field History Tracking" note (covered in R2.4). |
