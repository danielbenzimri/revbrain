# CPQ Assessment Report V3 — Implementation Plan

> **Purpose:** Task-by-task implementation plan for closing all gaps identified in the Developer Redline Checklist v2 (Final). Each task maps to one or more redline items, targets specific files, and has defined acceptance criteria. This plan covers the full report generation pipeline: collectors, assembler, templates, and post-generation validator.
>
> **Date:** 2026-03-30
> **Version:** 1.0
> **Authors:** Daniel + Claude
> **Status:** Approved for implementation
>
> **Source document:** Developer_Redline_Checklist_v2_Final.md (37 items: 8 P0, 8 P1, 17 P2, 4 P3)
>
> **Related documents:**
>
> - [CPQ-EXTRACTION-IMPLEMENTATION-PLAN.md](CPQ-EXTRACTION-IMPLEMENTATION-PLAN.md) — Extraction worker plan (v2.7, implemented)
> - [CPQ-DATA-EXTRACTION-SPEC.md](CPQ-DATA-EXTRACTION-SPEC.md) — Data extraction specification
> - [CPQ-EXTRACTION-JOB-ARCHITECTURE.md](CPQ-EXTRACTION-JOB-ARCHITECTURE.md) — Job architecture

---

## Table of Contents

1. [Scope & Affected Files](#1-scope--affected-files)
2. [Commit & Quality Gate Protocol](#2-commit--quality-gate-protocol)
3. [Phase 0: P0 Ship Blockers](#phase-0-p0-ship-blockers)
4. [Phase 1: P1 SI Review Blockers](#phase-1-p1-si-review-blockers)
5. [Phase 2: P2 Quality Improvements](#phase-2-p2-quality-improvements)
6. [Phase 3: P3 Polish](#phase-3-p3-polish)
7. [Dependency Graph](#7-dependency-graph)
8. [Risk Register](#8-risk-register)

---

## 1. Scope & Affected Files

All changes are within the report generation pipeline in `apps/worker/src/report/` and `apps/worker/src/normalize/`. No collector extraction logic changes are required — the data is already being extracted correctly; the issues are in how findings are assembled and rendered.

| File | Role | Tasks Touching It |
|------|------|-------------------|
| `apps/worker/src/report/assembler.ts` | Transforms findings → ReportData | 0.1, 0.2, 0.4, 0.5, 0.6, 0.8, 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 2.1–2.7, 2.9–2.12, 2.14 |
| `apps/worker/src/report/templates/index.ts` | Renders ReportData → HTML | 0.1, 0.3, 0.5, 0.6, 1.4, 1.5, 1.8, 2.3, 2.6, 2.8, 2.9, 2.11 |
| `apps/worker/src/report/renderer.ts` | HTML → PDF (Playwright) | 0.6 |
| `apps/worker/src/normalize/validation.ts` | Post-extraction consistency checks | 0.7, 2.13, 2.17 |
| `apps/worker/src/collectors/approvals.ts` | Approvals data extraction | 0.1 (evidence enrichment only) |

---

## 2. Commit & Quality Gate Protocol

Same as the extraction worker plan. Before each commit:

```bash
pnpm lint && pnpm test && pnpm build
```

Commit message format: `fix(report): <description>` for bug fixes, `feat(report): <description>` for new capabilities.

Each task produces a single commit. Tasks within a phase can be committed independently — dependency ordering within a phase is recommended but not required unless noted.

---

## Phase 0: P0 Ship Blockers

**Goal:** Fix all 8 trust-breaking / demo-blocking issues. No report should be shared externally until these are closed. Each P0 task is independent unless noted.

---

### Task 0.1: Fix approvals section — query correct Salesforce objects

**Redline:** P0-1

**Problem:** Section 6.4 shows `SBQQ__CustomAction__c` records (CPQ custom action buttons like "Add Products," "Calculate," "Quick Save") labeled as "Approval Rules." Every row has Target Object = blank and Conditions = 0, confirming the wrong object. The collector *does* extract `sbaa__ApprovalRule__c`, `sbaa__ApprovalChain__c`, and `sbaa__ApprovalCondition__c` correctly (see `approvals.ts` lines 226–314), but the assembler ignores them.

**Root cause:** `buildApprovalsAndDocs()` in `assembler.ts:1241` filters for `CustomAction` findings and renders them as approval rules. It never references `AdvancedApprovalRule` findings.

**Files:**

| File | Change |
|------|--------|
| `assembler.ts` | Rewrite `buildApprovalsAndDocs()` to split into three data sets: (1) Custom Actions (`CustomAction` findings) labeled as "CPQ Custom Action Buttons," (2) Advanced Approval Rules (`AdvancedApprovalRule` findings) with columns Rule Name / Target Object / Condition Count / Active, (3) Approval Chains (`AdvancedApprovals` summary finding parsed for chain count). |
| `assembler.ts` | Extend `ReportData['approvalsAndDocs']` interface to include `customActions` (separate from `approvalRules`) and `approvalChains`. |
| `templates/index.ts` | Rewrite `renderApprovalsAndDocs()` to render three sub-sections under separate `<h3>` headers: "CPQ Custom Action Buttons," "Advanced Approval Rules (sbaa)," "Approval Chains." |
| `approvals.ts` | Enrich `AdvancedApprovalRule` findings with `evidenceRefs` for `sbaa__TargetObject__c` (currently only in `notes` string). Add `countValue` for condition count per rule by cross-referencing `sbaa__ApprovalCondition__c` results. |

**Acceptance criteria:**

- Section 6.6 (renumbered per Task 0.3) shows Advanced Approval Rules from `sbaa__ApprovalRule__c` with correct Target Object and Condition Count columns
- Custom actions (Add Products, Calculate, etc.) rendered under a separate "CPQ Custom Action Buttons" header, not labeled as approval rules
- Approval chain count visible in the section
- When sbaa objects are not installed, section shows: "Advanced Approvals (sbaa) not detected. Custom action buttons listed below."

**Dependencies:** None (Task 0.3 renumbers the section header, but the content fix is independent)

---

### Task 0.2: Fix price rule count labeling mismatch

**Redline:** P0-2, P0-8 (partial)

**Problem:** At-a-Glance says "Price Rules (Active): 28" but Section 2.1 says "20 active price rules." Both are correct — 20 active, 28 total — but the At-a-Glance label is wrong because the count function (`assembler.ts:832`) counts all findings including inactive.

**Root cause:** The `count()` helper in `buildGlanceSections()` counts all findings matching the artifact type. It does not filter by active status. Inactive rules have `usageLevel === 'dormant'` or `notes` containing "Inactive."

**Files:**

| File | Change |
|------|--------|
| `assembler.ts` | (1) Add `countActive(...types)` helper that filters out `usageLevel === 'dormant'` findings. (2) In `buildGlanceSections()`, use `countActive()` for "Price Rules (Active)" and "Product Rules (Active)" rows. (3) Extract active/total counts once in `assembleReport()` and pass them to both `buildGlanceSections()` and `buildKeyFindings()` to ensure reconciliation. |

**Acceptance criteria:**

- At-a-Glance "Price Rules (Active)" shows 20 (not 28)
- At-a-Glance "Product Rules (Active)" shows 37 (not 38)
- Section 2.1 "20 active price rules" matches At-a-Glance exactly
- If a different basis is shown (e.g., total), the label explicitly says "(Total)"

**Dependencies:** None

---

### Task 0.3: Fix section numbering — duplicate 6.4

**Redline:** P0-3

**Problem:** "6.4" appears twice: Discount Schedules (page 14) and Approvals & Document Generation (page 15).

**Root cause:** Section numbers are hardcoded in `templates/index.ts`. The Config Domain renderer uses 6.1–6.4 (Catalog, Price Rules, Product Rules, Discount Schedules), and `renderApprovalsAndDocs()` also starts at "6.4."

**Files:**

| File | Change |
|------|--------|
| `templates/index.ts` | Renumber section headers: 6.1 Product Catalog (no change), 6.2 Price Rules (no change), 6.3 Product Rules (no change), 6.4 Discount Schedules (no change), 6.5 Product Option Attachment (currently part of 6.4 page), 6.6 Approvals & Document Generation (was 6.4). |

**Acceptance criteria:**

- No section number appears twice in the rendered PDF
- Table of contents (if present) reflects updated numbering
- Sections flow: 6.1 → 6.2 → 6.3 → 6.4 → 6.5 → 6.6

**Dependencies:** None

---

### Task 0.4: Remove duplicate Appendix B render

**Redline:** P0-4

**Problem:** The CPQ Reports list appears twice — once with last-run dates, once without. This is a rendering loop bug.

**Root cause:** The collector produces duplicate `CPQReport` findings — the `reports` collector may be yielding both summary and detail findings with the same artifact name. The assembler (`assembler.ts:619`) maps all of them without deduplication.

**Files:**

| File | Change |
|------|--------|
| `assembler.ts` | In the `appendixB` builder (line 619): deduplicate by report name using a `Set<string>`. When duplicates exist, keep the entry with the longer `description` (which contains the last-run date). |

**Implementation:**

```typescript
// Before: reports.map(r => ({ name: r.artifactName, description: r.notes ?? '' }))
// After:
const seenReports = new Set<string>();
const appendixB: Array<{ name: string; description: string }> = [];
for (const r of reports) {
  if (seenReports.has(r.artifactName)) continue;
  seenReports.add(r.artifactName);
  appendixB.push({ name: r.artifactName, description: r.notes ?? '' });
}
```

**Acceptance criteria:**

- Each report name appears exactly once in Appendix B
- The version with last-run dates is preserved (not the empty one)
- Report count in the section matches unique report count

**Dependencies:** None

---

### Task 0.5: Fix field completeness — suppress broken table

**Redline:** P0-5

**Problem:** Section 8.4 shows every object with 0 fields >50% populated, 0 fields <5% populated, Quality Score = N/A. Field population analysis was never implemented — the discovery collector doesn't produce `FieldCompleteness` findings.

**Root cause:** `buildFieldCompleteness()` (`assembler.ts:1603`) falls back to stub entries with `totalFields: 0` when no `FieldCompleteness` findings exist. The stub creates a misleading table of zeros.

**Files:**

| File | Change |
|------|--------|
| `assembler.ts` | In `buildFieldCompleteness()`: when the primary lookup finds no `FieldCompleteness` findings, return an empty array instead of stub entries. Also update the `ReportData` type to allow the array to be empty. |
| `templates/index.ts` | In `renderDataQuality()`: when `fieldCompleteness` array is empty, render: `"Field completeness analysis not extracted in current scope. Requires full schema and data scan."` instead of the table. |

**Acceptance criteria:**

- No all-zero table appears in the report
- Section 8.4 shows the honest omission message
- If `FieldCompleteness` findings *do* exist in a future extraction, the table renders correctly

**Dependencies:** None

---

### Task 0.6: Global branding — RevBrain → Vento

**Redline:** P0-6

**Problem:** Cover page, every page header, every page footer, and "Report Generated By" all say "RevBrain CPQ Assessment Tool." This was P1 in V1 and was elevated to P0.

**Root cause:** Hardcoded strings in three files.

**Files:**

| File | Line(s) | Change |
|------|---------|--------|
| `assembler.ts` | 370 | `generatedBy: 'RevBrain CPQ Assessment Tool v1.0'` → `'Vento CPQ Assessment Tool v1.0'` |
| `renderer.ts` | 39 | Footer: `Generated by RevBrain CPQ Assessment Tool` → `Generated by Vento CPQ Assessment Tool` |
| `templates/index.ts` | 69 | Section footer: `Generated by RevBrain CPQ Assessment Tool` → `Generated by Vento CPQ Assessment Tool` |

**Acceptance criteria:**

- `grep -r "RevBrain" apps/worker/src/report/` returns zero results
- Cover page shows "Vento CPQ Assessment Tool v1.0"
- Every page footer says "Generated by Vento CPQ Assessment Tool"
- No other references to "RevBrain" in the report pipeline

**Dependencies:** None

---

### Task 0.7: Build post-generation validator rules V9–V12

**Redline:** P0-7, P0-8

**Problem:** The validator (`validation.ts`) has 8 rules (V1–V8) but doesn't catch: At-a-Glance / Section reconciliation failures, duplicate appendix entries, all-zero field completeness, or duplicate section numbers. V2 shipped with all of these.

**Root cause:** The existing validator runs *before* the assembler — it validates extraction findings, not the assembled ReportData. Reconciliation between assembled sections requires a second validation pass.

**Files:**

| File | Change |
|------|--------|
| `validation.ts` | Add 4 new rules to `validateExtraction()`: |

**New rules:**

| Rule | Check | Severity | On Failure |
|------|-------|----------|------------|
| **V9** | Active price rule count in At-a-Glance must match active count from findings (filter `usageLevel !== 'dormant'`). Same for product rules. | error | Report banner: "At-a-Glance counts do not match section detail." |
| **V10** | No two entries in the reports appendix array share the same `artifactName`. | warning | Log warning + auto-deduplicate in assembler. |
| **V11** | If all `FieldCompleteness` findings have `score === 'N/A'` or none exist, flag for suppression. | warning | Assembler suppresses the table (Task 0.5 handles render). |
| **V12** | Each finding-based percentage total (conversion segments, discount distribution) sums to 90–110%. | error | Report banner: "Percentage calculations inconsistent." |

**Additionally:** Add a new export `validateReportData(data: ReportData): ReportValidationResult` that runs *after* assembly. This catches post-assembly issues (duplicate section numbers, inconsistent counts between sections). Wire it into the report generation pipeline between `assembleReport()` and `renderReport()`.

**Acceptance criteria:**

- V9 catches the active/total count mismatch from P0-2 (if Task 0.2 is not applied)
- V10 catches the duplicate appendix from P0-4 (if Task 0.4 is not applied)
- V11 catches the all-zero field completeness from P0-5 (if Task 0.5 is not applied)
- Validator failures inject visible banners into the PDF report
- `validateReportData()` exported and wired into the pipeline

**Dependencies:** None (defensive — catches issues even if individual P0 fixes are applied)

---

### Task 0.8: At-a-Glance reconciliation architecture

**Redline:** P0-8

**Problem:** No mechanism ensures At-a-Glance numbers match downstream section numbers. P0-2 fixes the immediate bug; this task ensures it can't regress.

**Root cause:** `buildGlanceSections()` re-counts findings independently from the section builders (e.g., `buildPriceRules()`). Each function computes its own count, so they can diverge.

**Files:**

| File | Change |
|------|--------|
| `assembler.ts` | Refactor `assembleReport()` to compute canonical counts once and pass them to both glance and section builders. Add a `ReportCounts` struct: `{ activePriceRules, totalPriceRules, activeProductRules, totalProductRules, totalQuotes, totalQuoteLines, discountScheduleTotal, discountScheduleUnique }`. Both `buildGlanceSections()` and section-level builders receive this struct instead of re-counting from findings. |

**Acceptance criteria:**

- No count is computed more than once
- At-a-Glance "Price Rules (Active)" and Section 6.2 "X active of Y total" use the same variable
- Adding a new metric to At-a-Glance requires adding it to `ReportCounts` first (enforced by types)

**Dependencies:** Task 0.2 (which introduces the active filtering — this task prevents regression)

---

## Phase 1: P1 SI Review Blockers

**Goal:** Fix 8 issues that would undermine credibility during an SI review. All P0s should be committed before starting Phase 1.

---

### Task 1.1: Installed packages — namespace-based CPQ filter

**Redline:** P1-1

**Problem:** Section 4.2 lists 30+ packages including MockAdapter, B2B LE Video Player, SalesforceA Connected Apps. These are not CPQ-relevant and create noise.

**Root cause:** The discovery collector extracts all `InstalledSubscriberPackage` records. The assembler dumps them into `coreSettings` as "Package: X" rows without filtering by relevance.

**Files:**

| File | Change |
|------|--------|
| `assembler.ts` | (1) Add a `CPQ_RELEVANT_NAMESPACES` constant with the allowlist from P1-1: `SBQQ`, `sbaa`, `blng`, `sbc`, `dsfs`, `dfsle`, `SBQQDS`, `APXTConga4`, `APXTCFQ`, `AVA_MAPPER`, `AVA_BLNG`, `SFBD`, `cpqea`, `cpqlabs`. (2) In `buildInstalledPackages()`, populate from all `InstalledPackage` findings. Filter: if `namespace` is in the allowlist, include in `installedPackages` table. (3) Count remaining packages and add a single summary line: "X additional packages installed — not CPQ-relevant." (4) Remove individual package entries from `coreSettings`. |

**Acceptance criteria:**

- Installed Packages table (Section 4.1) shows only CPQ-relevant packages (SBQQ, sbaa, blng, dsfs, dfsle, SBQQDS, APXTConga4, APXTCFQ, AVA_MAPPER, AVA_BLNG, SFBD, cpqea, cpqlabs, and packages with no namespace that are clearly CPQ-related)
- Core CPQ Settings table (Section 4.2) no longer has "Package: MockAdapter," "Package: B2B LE Video Player," etc.
- Summary line at bottom of 4.1: "X additional packages installed — not CPQ-relevant"

**Dependencies:** None

---

### Task 1.2: Fix scoring model — Technical Debt vs Customization drivers

**Redline:** P1-2

**Problem:** Section 2.3 says Technical Debt score drivers are "Apex class count, trigger count, flow complexity, code dependencies." Those are Customization drivers. Technical Debt should reflect dormant/redundant configuration.

**Root cause:** `computeComplexityScores()` (`assembler.ts:998`) maps the `dependency` domain (Apex, triggers, flows) to `technicalDebt`. The `dependency` domain is clearly Customization.

**Files:**

| File | Change |
|------|--------|
| `assembler.ts` | (1) In `computeComplexityScores()`: map `dependency` domain → `customizationLevel` (was `technicalDebt`). (2) Compute `technicalDebt` from actual tech debt indicators: findings with `usageLevel === 'dormant'`, findings whose `notes` contain "Inactive," "Duplicate," or stale/test markers. Create a helper `scoreTechnicalDebt(findings)` that filters for these. (3) In `buildScoringMethodology()`: update Technical Debt drivers text to: "Inactive price rules, stale/test rules, duplicate discount schedules, dormant products." Update Customization Level drivers to: "Apex class count, trigger count, flow complexity, code dependencies, custom fields, validation rules." |

**Acceptance criteria:**

- Technical Debt score driven by dormant/inactive/duplicate findings, not code volume
- Customization Level score reflects Apex + triggers + flows + custom fields
- Scoring Methodology table (Section 2.3) drivers column matches actual computation
- An org with 67 Apex classes but zero inactive rules shows low Technical Debt, high Customization

**Dependencies:** None

---

### Task 1.3: Deduplicate product rule entry

**Redline:** P1-3

**Problem:** "PowerSlide Server: Selection (Configuration Attribute = Security)" appears twice at the bottom of the product rules table.

**Root cause:** The collector produces two findings with identical names. The assembler maps all product rule findings without deduplication.

**Files:**

| File | Change |
|------|--------|
| `assembler.ts` | In the product rules mapping section: deduplicate by `artifactName + type`. Use a `Set<string>` key. If genuinely different records share a name, distinguish by appending the `artifactId` suffix. |

**Acceptance criteria:**

- No product rule name appears twice in the Section 6.3 table
- If two distinct records share a name (verified by different IDs), they appear with a distinguishing suffix

**Dependencies:** None

---

### Task 1.4: Clarify discount schedule count inconsistency

**Redline:** P1-4

**Problem:** Section 6.4 says "12 unique schedule names" but At-a-Glance says ~22. The math (12 unique + 10 duplicates) is never stated.

**Files:**

| File | Change |
|------|--------|
| `assembler.ts` | Add `discountScheduleTotalCount` and `discountScheduleUniqueCount` to `ReportData['configurationDomain']`. Populate from `buildDiscountScheduleAnalysis()` return data. Add `discountScheduleDuplicateDetail` string field. |
| `templates/index.ts` | In `renderConfigDomain()` discount schedules section: replace the current summary with: "X total schedules: Y unique names. 'Z' appears N times — flagged as duplicate in Technical Debt inventory." using the new data fields. |

**Acceptance criteria:**

- Section 6.4 header shows total count, unique count, and explicit duplicate explanation
- At-a-Glance discount schedule count matches the total (22), not the unique (12)
- An SI reading both sections gets a consistent and self-explanatory picture

**Dependencies:** None

---

### Task 1.5: Fix product option attachment placeholder

**Redline:** P1-5

**Problem:** Section 6.5 is a half-finished sentence stub: "475 product options across 76 bundle products. Per-option attachment rate analysis requires quote line cross-reference data."

**Files:**

| File | Change |
|------|--------|
| `assembler.ts` | In `optionAttachmentSummary`: check if quote-line-to-option cross-reference data exists in findings (artifact type check). If not, set to `null` (indicating not extracted). |
| `templates/index.ts` | In `renderConfigDomain()` option attachment section: when `optionAttachmentSummary` is null, render a single-row table: `Attachment Rate Analysis | Not extracted — requires quote line cross-reference data.` Preserve the section header and the "475 options across 76 bundles" fact as a paragraph above the table. |

**Acceptance criteria:**

- No sentence stub appears in the report
- Section 6.5 has a clear header, a summary line with bundle/option counts, and a clean "not extracted" table row
- If attachment rates are implemented in the future, the table populates correctly

**Dependencies:** Task 0.3 (renumbers this to 6.5)

---

### Task 1.6: Appendix D — downgrade Advanced Approvals from "Full"

**Redline:** P1-6

**Problem:** Appendix D says "Advanced Approvals: Full" but the approvals section was querying the wrong object. Even after P0-1, the coverage claim should reflect what was *actually* extracted.

**Root cause:** `buildDynamicCoverage()` (`assembler.ts:1314`) marks approvals as "Full" if >5 findings exist. Since 63 CustomAction findings exist (wrong object), it passed the threshold.

**Files:**

| File | Change |
|------|--------|
| `assembler.ts` | In `buildDynamicCoverage()`, replace the generic `countInDomain(domain) > 5 ? 'Full' : 'Partial'` check for the `approvals` domain with a specific check: require `AdvancedApprovalRule` findings AND `CustomAction` findings for "Full." If only `CustomAction` findings exist, mark as "Partial — approval action buttons detected; sbaa approval rules and chains not yet extracted." If only `AdvancedApprovalRule` exists, mark as "Partial — approval rules extracted; custom action buttons not extracted." |

**Acceptance criteria:**

- Appendix D Advanced Approvals coverage reflects actual extraction depth
- After P0-1 fix, coverage upgrades to "Full" when both sbaa rules and custom actions are extracted
- Notes column explains what is/isn't extracted

**Dependencies:** Task 0.1 (fixes the actual data; this task fixes the claim)

---

### Task 1.7: Appendix D — tighten all remaining coverage claims

**Redline:** P1-7

**Problem:** Several coverage claims are overstated: "Transactional Data: Full" when quote modification rate wasn't extracted; "Custom Fields & Validation: Full" when field completeness is N/A.

**Files:**

| File | Change |
|------|--------|
| `assembler.ts` | Refactor `buildDynamicCoverage()` to use per-category specific checks instead of a generic count > 5 threshold. For each category, define what artifact types constitute "Full" extraction: |

**Coverage rules:**

| Category | "Full" Requires | "Partial" When |
|----------|----------------|----------------|
| Product Catalog | Product2 + ProductOption findings | Products exist but no options |
| Pricing & Rules | PriceRule + DiscountSchedule + CustomScript findings | Missing any sub-category |
| Transactional Data | Quote + QuoteLine + UserBehavior findings | Quote data exists but no user behavior or modification rate |
| Custom Fields & Validation | ValidationRule + FormulaField + FieldCompleteness findings | Validation rules exist but field completeness is N/A |
| Custom Code | ApexClass + ApexTrigger + Flow findings | Missing triggers or flows |
| Quote Templates | QuoteTemplate + TemplateSection findings | Templates exist but no section detail |
| Advanced Approvals | AdvancedApprovalRule + CustomAction findings | Only one type extracted |
| User Behavior | UserBehavior findings with non-inferred source | Only inferred data |

**Acceptance criteria:**

- Every row in Appendix D is an honest representation of extraction depth
- No "Full" claim when key sub-components are missing
- Qualifying notes explain what is/isn't available

**Dependencies:** Task 1.6 (Advanced Approvals specific case)

---

### Task 1.8: Cover page — add missing version fields

**Redline:** P1-8

**Problem:** Template requires "Adv. Approvals Version" and "Document Version" fields on the cover page. V2 has neither.

**Root cause:** `ReportData.metadata` already has `sbaaVersion` (extracted in `assembler.ts:369`) but the cover page template doesn't render it. No `documentVersion` field exists.

**Files:**

| File | Change |
|------|--------|
| `assembler.ts` | Add `documentVersion: '1.0'` to the metadata object. Verify `sbaaVersion` is populated from the `InstalledSubscriberPackage` finding where namespace = 'sbaa'. |
| `templates/index.ts` | In `renderCover()`: add two rows to the cover metadata table — "Adv. Approvals Version" (from `metadata.sbaaVersion`, e.g., "Advanced Approvals (sbaa) v232.2.0") and "Document Version" (from `metadata.documentVersion`). |

**Acceptance criteria:**

- Cover page shows Adv. Approvals Version with the actual version from InstalledSubscriberPackage
- Cover page shows Document Version: 1.0
- If sbaa is not installed, Adv. Approvals Version shows "Not installed"

**Dependencies:** None

---

## Phase 2: P2 Quality Improvements

**Goal:** Improve report maturity with better synthesis, honest confidence labels, and template parity. Grouped by file to minimize context switching.

---

### Task 2.1: At-a-Glance — add Active Users and Avg Lines / Quote

**Redline:** P2-1, P2-14

**Files:**

| File | Change |
|------|--------|
| `assembler.ts` | In `buildGlanceSections()`: (1) Add "Active Users (90d)" to the "Users & Licenses" panel. Source from `UserBehavior` or `UserAdoption` findings. If 0 detected, show "0 — Confirmed" with a note. (2) Add "Avg Lines / Quote" to the "Quoting (90 Days)" panel. Compute from `totalQuoteLines / totalQuotes`. Show as e.g., "3.2 — Confirmed." |

**Acceptance criteria:**

- Users & Licenses panel includes Active Users metric
- Quoting panel includes Avg Lines / Quote metric
- Both values reconcile with raw data in their respective detail sections

---

### Task 2.2: Product rule complexity — replace "unknown" with defensible values

**Redline:** P2-2

**Problem:** All 38 product rules show complexity = "unknown." Price rules correctly show high/medium/low based on evaluation event count.

**Files:**

| File | Change |
|------|--------|
| `assembler.ts` | In the product rules mapping: check if `complexityLevel` from findings is meaningful (not 'medium' default). If eval event data is available for product rules, use the same logic as price rules (4+ = high, 2-3 = medium, 1 = low). If condition count is available from `countValue`, use that: 3+ conditions = medium, 5+ = high. If neither is available, label column as "Not assessed" instead of "unknown." |

**Acceptance criteria:**

- No product rule shows "unknown" for complexity
- Either shows computed complexity (if data exists) or "Not assessed" (honest label)
- Column header reflects the status: "Complexity" if computed, "Confidence" note if not

---

### Task 2.3: Add summary paragraphs above rule tables

**Redline:** P2-3

**Files:**

| File | Change |
|------|--------|
| `templates/index.ts` | In `renderConfigDomain()`: add a 2-line summary paragraph above each rules table. For price rules: "X of Y rules active. Z high-complexity (4+ eval events). W inactive rules flagged as technical debt." For product rules: "X Selection, Y Alert, Z Validation, W Filter rules active. N inactive, M stale/test flagged." Derive counts from the `ReportData` arrays. |
| `assembler.ts` | Add `priceRuleSummary` and `productRuleSummary` computed structs to `configurationDomain` data with pre-computed counts by complexity and type. |

**Acceptance criteria:**

- Each rules section opens with a synthesis paragraph before the inventory table
- Summary counts match the table data

---

### Task 2.4: Executive Summary — enforce synthesis standard

**Redline:** P2-4

**Problem:** Findings can drift toward descriptive status messages. Standard: each finding must combine ≥2 extracted facts + 1 implication or complexity signal.

**Files:**

| File | Change |
|------|--------|
| `assembler.ts` | In `buildKeyFindings()`: apply the synthesis standard to all 5 findings. For example, Finding 5 changes from: "179 products across 21 product families" → "179 products across 21 families — 14 of 21 families show zero quoting activity in the assessment window, suggesting catalog sprawl and a cleanup opportunity." Add `dormantFamilyCount` to the finding detail by cross-referencing product catalog data. |

**Acceptance criteria:**

- All 5 key findings include ≥2 facts + 1 implication
- No finding is purely descriptive ("X detected")
- Each finding suggests a complexity signal or action item

---

### Task 2.5: Add score rationale per dimension

**Redline:** P2-5

**Files:**

| File | Change |
|------|--------|
| `assembler.ts` | Extend `scoringMethodology` array items with a `rationale: string` field. Populate with 1-2 sentences per dimension explaining primary drivers. Example for Technical Debt: "Score reflects 8 inactive price rules, 3 stale/test rules, 11 duplicate discount schedules, and 3 dormant products. No Apex cleanup burden detected." |
| `templates/index.ts` | In `renderExecutiveSummary()`: render the rationale text below each scoring methodology table row. |

**Acceptance criteria:**

- Each of the 5 scoring dimensions has a rationale paragraph
- Technical Debt rationale is especially clear (most likely to draw SI questions after P1-2 correction)
- Rationale references specific counts that match the detail sections

**Dependencies:** Task 1.2 (corrects what drives Technical Debt — rationale must match)

---

### Task 2.6: Quote lifecycle — add evidence attribution or caveat

**Redline:** P2-6

**Files:**

| File | Change |
|------|--------|
| `templates/index.ts` | In `renderLifecycle()`: add an italicized note at the top of Section 5: "The following lifecycle is derived from detected configuration patterns. Step sequence and frequency are inferred from metadata and have not been verified through direct process observation." |

**Acceptance criteria:**

- Section 5 opens with the caveat note
- Lifecycle content otherwise unchanged

---

### Task 2.7: Feature utilization — 5-level status model

**Redline:** P2-7

**Files:**

| File | Change |
|------|--------|
| `assembler.ts` | In `buildFeatureUtilization()`: replace binary Active / Not Detected with 5 levels: **Active Usage** (transactional evidence), **Configured** (setup exists, usage unconfirmed), **Low Usage** (configured, minimal activity), **Detected / Unverified** (records exist, conditions not extracted), **Not Detected**. Apply contextually based on finding source type and evidence quality. |

**Status mapping:**

| Feature | Current | New | Justification |
|---------|---------|-----|---------------|
| Product Bundles | Active | Active Usage | 76 bundles + quoting data |
| Discount Schedules | Active | Active Usage | 22 schedules detected |
| Custom Scripts (QCP) | Active | Active Usage | 5 scripts + calculation evidence |
| Quote Templates | Active | Configured | Templates exist, usage not tracked |
| Advanced Approvals | Active | Detected / Unverified | Until P0-1 is fixed and sbaa rules extracted |
| Contracted Pricing | Not Detected | Configured | ContractedPrice object exists per settings |

**Acceptance criteria:**

- Feature utilization table uses 5 levels
- No feature claims "Active Usage" without transactional evidence
- Status column uses badge styling to differentiate levels

---

### Task 2.8: Low-volume inline confidence downgrade

**Redline:** P2-8

**Files:**

| File | Change |
|------|--------|
| `templates/index.ts` | In `renderUsage()`: add inline warning to any section where sample size < 30 records: "⚠ Low-volume data — results may not be statistically meaningful (N=X)." Downgrade confidence labels from "Estimated" to "Low confidence — small sample" where denominator < 10. |
| `assembler.ts` | Add `lowVolumeThreshold` check: when `totalQuotes < 30`, set a flag on all usage metrics. When denominator < 10, downgrade confidence. |

**Acceptance criteria:**

- Section 7 conversion/discount tables show inline warnings when N < 30
- Confidence badges downgrade from "Estimated" to "Low confidence" when denominator < 10
- Section 1 banner and Section 7 inline warnings are both present (belt and suspenders)

---

### Task 2.9: Product catalog dormancy synthesis

**Redline:** P2-9

**Files:**

| File | Change |
|------|--------|
| `templates/index.ts` | In `renderConfigDomain()`: after the product catalog table, compute and render dormancy note: "X of Y product families show zero quoting activity in the 90-day window — including [top 3 families by product count]. This may indicate dormant catalog segments, seasonal patterns, or a narrow active use-case." |
| `assembler.ts` | Add `dormantFamilies: Array<{ name: string; productCount: number }>` to `configurationDomain`. Compute from product catalog data where `quoted90d === 0`. |

**Acceptance criteria:**

- Interpretive note appears below the product catalog table
- Lists the top 3 dormant families by product count
- Note present only when dormant families exist

---

### Task 2.10: Add bundle/option density hotspot

**Redline:** P2-10

**Files:**

| File | Change |
|------|--------|
| `assembler.ts` | In `detectHotspots()`: add a fourth hotspot when bundle count > 50 or option count > 200: "Bundle & Option Configuration — High. X bundle products with Y product options, enforced by Selection, Validation, Filter, and Alert product rules. Nested bundle configurations increase quote calculation complexity and UI surface area." |

**Acceptance criteria:**

- Hotspots section shows 4 entries (was 3) when bundle/option thresholds met
- Bundle hotspot references actual counts and rule types

---

### Task 2.11: Curate Appendix B — sort, flag stale, summarize

**Redline:** P2-11

**Files:**

| File | Change |
|------|--------|
| `assembler.ts` | In the appendixB builder: (1) Sort reports by last-run date descending (parse from description). (2) Add `isStale: boolean` flag for reports with last run > 2 years ago. (3) Add `appendixBSummary` struct: `{ total, runLast12Mo, staleCount }`. |
| `templates/index.ts` | In `renderAppendixB()`: (1) Add summary header: "X CPQ reports detected. Y run in the last 12 months. Z not run in over 2 years — potential reporting technical debt." (2) Append "⚠ Stale" badge to stale report rows. (3) Optionally truncate to 20 most recently run with note: "+ N additional reports not run since [year]." |

**Acceptance criteria:**

- Appendix B opens with a summary header
- Reports sorted by last-run date (most recent first)
- Stale reports flagged with visual indicator
- No duplicate render (covered by Task 0.4)

---

### Task 2.12: Appendix A — add deployment Phase column

**Redline:** P2-12

**Files:**

| File | Change |
|------|--------|
| `assembler.ts` | Add optional `phase: string` field to the appendixA item interface. Populate from a static mapping of CPQ deployment objects to phases (provided by SI). Default to empty if no mapping available. |
| `templates/index.ts` | In `renderAppendixA()`: add "Phase" column to the table. Show phase value or "—" if not mapped. |

**Acceptance criteria:**

- Appendix A table includes Phase column
- Phase values populated where mapping exists
- Column gracefully shows "—" for unmapped objects

---

### Task 2.13: Section-level confidence generation rule

**Redline:** P2-13

**Files:**

| File | Change |
|------|--------|
| `assembler.ts` | Add a `sectionConfidence(findings, sectionArtifactTypes): 'Confirmed' | 'Estimated' | 'Partial'` helper. Logic: if all findings are `sourceType === 'object'` or `sourceType === 'tooling'` → Confirmed. If any are `sourceType === 'inferred'` → Estimated. If section has gaps or suppressions → Partial. Attach confidence to each section header. |
| `validation.ts` | Add V13: section confidence must not exceed its weakest finding. If a section is labeled "Confirmed" but contains inferred data, flag as warning. |

**Acceptance criteria:**

- Each major section carries a confidence label consistent with its data quality
- No section claims "Confirmed" when containing inferred or estimated data
- Validator catches overclaiming

---

### Task 2.14: (Merged into Task 2.1)

---

### Task 2.15: Price Rules Usage column — skip with documentation

**Redline:** P2-15

**Decision:** No defensible source for per-rule usage frequency exists. The column was intentionally removed in V2 (confirmed fixed in redline).

**Files:**

| File | Change |
|------|--------|
| `assembler.ts` | In `buildDynamicCoverage()`: add note to Pricing & Rules: "Price rule usage frequency: Not extracted — requires rule-to-quote linkage data." |

**Acceptance criteria:**

- No fake usage percentages appear
- Appendix D documents the omission

---

### Task 2.16: Apex SBQQ Objects column — skip with documentation

**Redline:** P2-16

**Decision:** Not feasible without code parsing (full Apex body analysis). SymbolTable metadata may provide partial data but is unreliable.

**Files:**

| File | Change |
|------|--------|
| `assembler.ts` | In `buildDynamicCoverage()`: add note to Custom Code: "Apex class → SBQQ object dependencies: Not extracted — requires code-level analysis." |

**Acceptance criteria:**

- No column added
- Appendix D documents the omission

---

### Task 2.17: Template parity pre-release verification

**Redline:** P2-17

**Files:**

| File | Change |
|------|--------|
| `validation.ts` | Add `validateTemplateParity(data: ReportData): ValidationRule[]` with checks: (1) Cover page has all required fields (client name, org ID, environment, assessment date, period, CPQ version, sbaa version, document version, generated by). (2) Executive Summary has exactly 5 findings, each with title + detail + confidence. (3) At-a-Glance panels include: Active Products, Product Bundles, Price Books, Price Rules, Product Rules, Discount Schedules, QCP, Quotes, Quote Lines, Avg Lines/Quote, CPQ Licenses, Active Users, Triggers, Flows, Validation Rules, Tech Debt items, Feature Utilization items. (4) Appendix D has ≥10 category rows with honest labels. |

**Acceptance criteria:**

- Parity check runs as part of `validateReportData()`
- Missing template fields generate warnings (not errors — allows graceful degradation)
- Parity check prevents regressions even after individual items are fixed

---

## Phase 3: P3 Polish

**Goal:** Visual polish and classification improvements. Lowest priority — implement when P0-P2 are complete.

---

### Task 3.1: Score bar visualization

**Redline:** P3-1

**Problem:** Template had visual score bars next to scores. V2 shows numbers only.

**Files:**

| File | Change |
|------|--------|
| `templates/index.ts` | The `scoreBar()` helper already exists in `partials/helpers.ts`. Verify it's being called in `renderExecutiveSummary()` for complexity scores. If not, wire it in. The score bars use CSS `width` percentage — verify they render in the Playwright PDF. |

**Acceptance criteria:**

- Complexity scores show visual bars next to numbers
- Bars render correctly in PDF output

---

### Task 3.2: Apex origin — namespace detection with metadata preference

**Redline:** P3-2

**Problem:** All 67 Apex classes show Origin = "Custom." Some may be managed package code.

**Files:**

| File | Change |
|------|--------|
| `assembler.ts` | In `inferApexOrigin()`: (1) Check if the class name matches a known managed package namespace prefix (from `InstalledSubscriberPackage` findings). (2) Check if `NamespacePrefix` metadata exists in the finding's evidence refs. (3) Fall back to name-based heuristics only if metadata is unavailable. |

**Acceptance criteria:**

- Classes with known namespace prefixes (SBQQ, sbaa, dsfs, blng, etc.) marked as "Managed Package"
- Classes without namespace metadata use name heuristics as fallback
- `inferApexOrigin()` prioritizes metadata over heuristics

---

### Task 3.3: Apex purpose — metadata-first inference

**Redline:** P3-3

**Problem:** Many large classes show "CPQ-related Apex" as purpose. Class names are descriptive enough for better inference.

**Files:**

| File | Change |
|------|--------|
| `assembler.ts` | In the Apex purpose inference (currently in the `apexClasses` mapping): enhance the heuristic with a name-based lookup table: "Test" → Test class, "Controller"/"CTRL" → Controller, "Plugin" → CPQ Plugin, "Contract" → Contract management, "Order" → Order processing, "Bill"/"Invoice" → Billing integration, "Quote" → Quote processing, "Utility"/"Utils" → Utility class, "Clean" → Org maintenance, "DataCannon"/"Blaster" → Data generation. Apply after metadata check (annotations, interface implementations). |

**Acceptance criteria:**

- CleanOrg (1,142 lines) shows purpose: "Org maintenance"
- QTCProd (274 lines) shows purpose: "CPQ-related Apex" or better if metadata helps
- Q2C_DataCannon shows purpose: "Data generation"
- "CPQ-related Apex" is a last resort, not the default

---

### Task 3.4: Quote Templates — extract LastModifiedDate

**Redline:** P3-4

**Problem:** All 7 templates show "Last Modified: Unknown."

**Root cause:** The templates collector may not extract `LastModifiedDate`, or the assembler may not surface it from evidence refs.

**Files:**

| File | Change |
|------|--------|
| `assembler.ts` | In `buildApprovalsAndDocs()`: check for `LastModifiedDate` in template findings' evidence refs. If present, format as readable date. If null/missing, show "Not available" (not "Unknown" — "Unknown" implies extraction failure). |
| `collectors/templates.ts` | Verify `LastModifiedDate` is in the field wishlist for `SBQQ__QuoteTemplate__c`. If missing, add it. Store in evidence refs. |

**Acceptance criteria:**

- Templates show actual LastModifiedDate values where available
- Missing dates show "Not available" (not "Unknown")
- Date format is human-readable (e.g., "2023-05-15")

---

## 7. Dependency Graph

```
Phase 0 (P0 — parallel except where noted):
  0.1 (approvals) ──┐
  0.2 (active count) ──→ 0.8 (reconciliation arch)
  0.3 (numbering) ──────→ 1.5 (option attachment, uses new 6.5 number)
  0.4 (appendix dedup)
  0.5 (field completeness)
  0.6 (branding)
  0.7 (validator V9–V12)

Phase 1 (P1 — after all P0s committed):
  1.1 (packages)
  1.2 (scoring) ──→ 2.5 (score rationale)
  1.3 (product rule dedup)
  1.4 (discount count)
  1.5 (option attachment) ← 0.3
  1.6 (appendix D approvals) ← 0.1
  1.7 (appendix D all) ← 1.6
  1.8 (cover page)

Phase 2 (P2 — after all P1s committed):
  2.1–2.17 (all parallel except 2.5 ← 1.2)

Phase 3 (P3 — after all P2s committed):
  3.1–3.4 (all parallel)
```

---

## 8. Risk Register

| Risk | Impact | Mitigation |
|------|--------|------------|
| Approvals collector doesn't produce `AdvancedApprovalRule` findings in test orgs | Task 0.1 can't be verified | The collector code (approvals.ts:226-265) clearly produces these findings when sbaa objects exist. Test with the same org that generated the V2 report. |
| Appendix B duplication root cause is in collector, not assembler | Task 0.4 dedup is a band-aid | Add dedup in assembler (immediate fix) AND investigate collector for root cause (follow-up). |
| Branding change (P0-6) may miss references outside the 3 known files | "RevBrain" appears somewhere else | Run `grep -r "RevBrain" apps/worker/` after fix to verify zero results. |
| Score model change (Task 1.2) may produce unexpected score values | Technical Debt score drops dramatically, confusing returning users | Document the methodology change in the report. Add a release note. |
| Field completeness suppression (Task 0.5) removes a section entirely | SI expects to see it | The "not extracted" message is preferable to a table of zeros. Redline explicitly says this. |

---

## Track Record

| Task | Status | Commit |
|------|--------|--------|
| 0.1 | Pending | — |
| 0.2 | Pending | — |
| 0.3 | Pending | — |
| 0.4 | Pending | — |
| 0.5 | Pending | — |
| 0.6 | Pending | — |
| 0.7 | Pending | — |
| 0.8 | Pending | — |
| 1.1 | Pending | — |
| 1.2 | Pending | — |
| 1.3 | Pending | — |
| 1.4 | Pending | — |
| 1.5 | Pending | — |
| 1.6 | Pending | — |
| 1.7 | Pending | — |
| 1.8 | Pending | — |
| 2.1 | Pending | — |
| 2.2 | Pending | — |
| 2.3 | Pending | — |
| 2.4 | Pending | — |
| 2.5 | Pending | — |
| 2.6 | Pending | — |
| 2.7 | Pending | — |
| 2.8 | Pending | — |
| 2.9 | Pending | — |
| 2.10 | Pending | — |
| 2.11 | Pending | — |
| 2.12 | Pending | — |
| 2.13 | Pending | — |
| 2.15 | Pending | — |
| 2.16 | Pending | — |
| 2.17 | Pending | — |
| 3.1 | Pending | — |
| 3.2 | Pending | — |
| 3.3 | Pending | — |
| 3.4 | Pending | — |
