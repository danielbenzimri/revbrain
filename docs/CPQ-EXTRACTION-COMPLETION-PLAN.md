# CPQ Extraction — Completion Plan

> **Purpose:** Concrete task-by-task plan to close all remaining gaps in the CPQ data extraction pipeline. Covers code gaps found during honest audit, LLM enrichment infrastructure, PDF report generation, and data refresh. Each task includes description, implementation details, testing requirements, and acceptance criteria.
>
> **Date:** 2026-03-28
> **Version:** 1.3
> **Authors:** Daniel Aviram + Claude
> **Status:** Final (post-audit revision)
>
> **Audit history:**
>
> - v1.0 (2026-03-28): Initial 14-task completion plan
> - v1.1 (2026-03-28): Dual audit fixes — C-02 grouping (artifactType→sourceObject), L-03 DB write, L-02 timeout, R-03 deployment notes, R-05 async generation, R-01 typed interfaces, signed URLs, transform script task, LLM-to-PDF flow
> - v1.2 (2026-03-28): Final polish — L-02 ctx scope fix + return type, L-03 concrete DB write, C-02 metadata exclusion, C-04 artifact type fix, duplicate checklist, merge strategy comment
> - v1.3 (2026-03-28): Pre-implementation hardening — C-02 countValue vs finding count, C-04 DataCount source, L-02 zod validation, R-02 template literals over .hbs, R-05 sync v1, Batch 1 re-estimate, PDF 5MB target
>   **Audience:** Engineering team, external auditors
>
> **Related documents:**
>
> - [CPQ-EXTRACTION-GAP-ANALYSIS.md](CPQ-EXTRACTION-GAP-ANALYSIS.md) — Gap specification (v1.2, dual-audit approved A/A-)
> - [CPQ-EXTRACTION-IMPLEMENTATION-PLAN.md](CPQ-EXTRACTION-IMPLEMENTATION-PLAN.md) — Master task tracker (v3.1, 72 tasks)
> - [CPQ-DATA-EXTRACTION-SPEC.md](CPQ-DATA-EXTRACTION-SPEC.md) — What data to extract (v2.2)
> - [CPQ-EXTRACTION-JOB-ARCHITECTURE.md](CPQ-EXTRACTION-JOB-ARCHITECTURE.md) — How the job runs (v1.2)

---

## Table of Contents

1. [Situation Assessment](#1-situation-assessment)
2. [Batch 1: Code Gap Fixes](#2-batch-1-code-gap-fixes)
   - 2.1 [C-01: Product Option Attachment Rates (G-07)](#21-c-01-product-option-attachment-rates-g-07)
   - 2.2 [C-02: Consolidated Object Inventory (G-14)](#22-c-02-consolidated-object-inventory-g-14)
   - 2.3 [C-03: CPQ Reports & Dashboards Query (G-15)](#23-c-03-cpq-reports--dashboards-query-g-15)
   - 2.4 [C-04: Quote Processes & Import Formats Feature Detection (G-12 remainder)](#24-c-04-quote-processes--import-formats-feature-detection-g-12-remainder)
   - 2.5 [C-05: Transform Script Updates](#25-c-05-transform-script-updates)
3. [Batch 2: LLM Enrichment Infrastructure](#3-batch-2-llm-enrichment-infrastructure)
   - 3.1 [L-01: Worker Config Flag](#31-l-01-worker-config-flag)
   - 3.2 [L-02: LLM Client Module](#32-l-02-llm-client-module)
   - 3.3 [L-03: Pipeline Integration (Phase 5.5)](#33-l-03-pipeline-integration-phase-55)
4. [Batch 3: PDF Report Generator](#4-batch-3-pdf-report-generator)
   - 4.1 [R-01: Report Data Assembler](#41-r-01-report-data-assembler)
   - 4.2 [R-02: HTML Template System](#42-r-02-html-template-system)
   - 4.3 [R-03: PDF Rendering via Puppeteer](#43-r-03-pdf-rendering-via-puppeteer)
   - 4.4 [R-04: Section Templates (22 pages)](#44-r-04-section-templates-22-pages)
   - 4.5 [R-05: API Endpoint & Download Flow](#45-r-05-api-endpoint--download-flow)
5. [Batch 4: Field Completeness Sampling (G-11)](#5-batch-4-field-completeness-sampling-g-11)
6. [Batch 5: Data Refresh & End-to-End Validation](#6-batch-5-data-refresh--end-to-end-validation)
7. [Track Record](#7-track-record)
8. [Dependency Graph](#8-dependency-graph)
9. [Effort & Timeline](#9-effort--timeline)

---

## 1. Situation Assessment

### What's Done (63 of 72 tasks)

The extraction pipeline is functionally complete:

- 12 collectors extracting real data from live Salesforce (547 findings, 22.9s)
- Post-processing: relationships, metrics, validation, context blueprint, summaries
- DB tables live on staging Supabase (migration 0042)
- API routes (6 endpoints) wired to Drizzle + Mock repositories
- Client hooks calling real API with adaptive polling
- Assessment Dashboard rendering 532 real items across 9 domain tabs
- Gap analysis mitigations: settings panel, plugin status, user adoption, discount distribution, overrides, top products, conversion segments, trends, data quality flags, hotspot detection, confidence map
- 1146 tests passing, 0 lint errors

### What's Remaining — Honest Audit

A self-audit revealed that 4 gaps marked "completed" in the tracker have incomplete implementations, and 3 tasks remain unstarted. Additionally, the extracted data JSON is stale (pre-gap-analysis).

| Category                                         | Items                                                                                   | Root Cause                                                               |
| ------------------------------------------------ | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| **Code gaps** (marked done, actually incomplete) | G-07 attachment rates, G-14 object inventory, G-15 reports query, G-12 partial features | Post-processing functions specified in gap analysis but code not written |
| **LLM enrichment** (not started)                 | Config flag, client module, pipeline integration                                        | Requires Anthropic SDK; designed as non-blocking optional feature        |
| **PDF report** (not started)                     | 22-page branded report matching benchmark                                               | Separate workstream, largest remaining effort                            |
| **Field completeness** (deferred)                | G-11 stratified sampling                                                                | 18 SOQL queries; significant API budget                                  |
| **Stale data**                                   | assessment-results.json, assessment-real-data.json                                      | Generated before gap analysis enhancements                               |

### Design Principles

1. **Toggle, don't block.** LLM enrichment is behind a feature flag. The pipeline produces a valid assessment without it.
2. **PDF is independent.** Report generation reads from DB findings — it doesn't modify the extraction pipeline.
3. **Test what you build.** Every task includes specific unit tests. No "will test later."
4. **Re-run extraction last.** Data refresh comes after all code changes are complete.

---

## 2. Batch 1: Code Gap Fixes

**Goal:** Close the 4 code gaps that were marked complete but have missing implementations.

**Effort:** 7-8 hours (includes C-05 transform handlers)
**Dependencies:** None (self-contained)
**Affected files:** `normalize/metrics.ts`, `summaries/builder.ts`, `collectors/integrations.ts`, `scripts/transform-to-ui.ts`

---

### 2.1 C-01: Product Option Attachment Rates (G-07)

**Gap:** The gap analysis specifies computing option attachment rates using `SBQQ__RequiredBy__c` on quote lines. Task 14.6 was marked complete but only G-08 (top products) was implemented. The `computeAttachmentRates()` function does not exist.

**Implementation location:** `apps/worker/src/normalize/metrics.ts`

**Algorithm:**

```typescript
export function computeAttachmentRates(
  results: Map<string, CollectorResult>
): AssessmentFindingInput[] {
  // 1. From catalog collector: build Map<ParentProductId, Set<OptionProductId>>
  //    Source: ProductOption findings with SBQQ__ConfiguredSKU__c → SBQQ__OptionalSKU__c
  const catalogResult = results.get('catalog');
  const usageResult = results.get('usage');
  if (!catalogResult || !usageResult) return [];

  const optionMap = new Map<string, Set<string>>(); // parent → Set<option product IDs>
  for (const f of catalogResult.findings) {
    if (f.artifactType !== 'ProductOption') continue;
    // Extract parent and option product IDs from evidenceRefs
    const parentRef = f.evidenceRefs?.find((r) => r.label === 'ConfiguredSKU');
    const optionRef = f.evidenceRefs?.find((r) => r.label === 'OptionalSKU');
    if (parentRef && optionRef) {
      if (!optionMap.has(parentRef.value)) optionMap.set(parentRef.value, new Set());
      optionMap.get(parentRef.value)!.add(optionRef.value);
    }
  }

  // 2. From usage collector: find quote lines with RequiredBy populated
  //    RequiredBy line's Product = parent, this line's Product = option
  //    Group by (parent, option) and count distinct quotes
  // ... (as specified in Gap Analysis §3.7)

  // 3. Compute attach rate per option category (Feature grouping)
  // 4. Produce OptionAttachmentRate findings
}
```

> **Audit fix (A1 §2.1, A2 §2):** Before implementing, inspect the actual `ProductOption` findings from the catalog collector to verify evidenceRef label conventions. The labels (`ConfiguredSKU`, `OptionalSKU`) may differ from what the catalog collector actually produces. Add defensive logging if no matching refs found.

```typescript
if (optionMap.size === 0) {
  log.warn(
    'attachment_rates_skip: no ProductOption findings with ConfiguredSKU/OptionalSKU refs found'
  );
  return [];
}
```

**Called from:** `pipeline.ts` Phase 4 (post-processing), after both catalog and usage collectors complete.

**New artifact type:** `OptionAttachmentRate`

**Test:**

- Unit: Given 3 parent products with 5 options and 10 quotes with known RequiredBy relationships, verify correct attach rates.
- Edge case: product with no options → no finding produced.
- Edge case: option never quoted → 0% attach rate.
- Edge case: evidenceRef labels don't match expected convention → warning logged, empty result.

**Acceptance criteria:**

- `computeAttachmentRates()` function exists and is called in pipeline
- Produces `OptionAttachmentRate` findings with correct percentages
- Verify label convention matches catalog collector's actual output format
- Existing tests still pass

---

### 2.2 C-02: Consolidated Object Inventory (G-14)

**Gap:** The benchmark Appendix A shows a numbered inventory of all 44+ CPQ objects. The gap analysis §3.14 specifies a `buildObjectInventory()` function. Not implemented.

**Implementation location:** `apps/worker/src/summaries/builder.ts`

**Algorithm:**

> **Audit fix (A1 §2.2, A2 §1):** The v1.0 algorithm grouped by `artifactType` which produces an inventory of RevBrain artifact categories, not Salesforce objects. The benchmark Appendix A lists Salesforce API names (`SBQQ__PriceRule__c`, `Product2`, etc.). Fix: use a static mapping from artifactType → Salesforce object API name, and exclude synthetic types.

```typescript
// Static mapping: artifactType → Salesforce object API name
const ARTIFACT_TO_SF_OBJECT: Record<string, string> = {
  Product2: 'Product2',
  ProductFeature: 'SBQQ__ProductFeature__c',
  ProductOption: 'SBQQ__ProductOption__c',
  ProductRule: 'SBQQ__ProductRule__c',
  ConfigurationAttribute: 'SBQQ__ConfigurationAttribute__c',
  PriceRule: 'SBQQ__PriceRule__c',
  PriceCondition: 'SBQQ__PriceCondition__c',
  PriceAction: 'SBQQ__PriceAction__c',
  DiscountSchedule: 'SBQQ__DiscountSchedule__c',
  DiscountTier: 'SBQQ__DiscountTier__c',
  ContractedPrice: 'SBQQ__ContractedPrice__c',
  CustomScript: 'SBQQ__CustomScript__c',
  SummaryVariable: 'SBQQ__SummaryVariable__c',
  LookupQuery: 'SBQQ__LookupQuery__c',
  QuoteTemplate: 'SBQQ__QuoteTemplate__c',
  TemplateSection: 'SBQQ__TemplateSection__c',
  QuoteTerm: 'SBQQ__QuoteTerm__c',
  // ... 30-40 SBQQ/sbaa data object mappings total
};

// Metadata/code types — covered in §9 (Custom Code), NOT in Appendix A object inventory
const METADATA_TYPES = new Set([
  'ApexClass',
  'ApexTrigger',
  'Flow',
  'WorkflowRule',
  'ValidationRule',
  'CustomField',
  'CustomMetadataType',
  'FormulaField',
  'RecordType',
]);

// Synthetic types to EXCLUDE from object inventory:
const SYNTHETIC_TYPES = new Set([
  'CPQSettingValue',
  'PluginStatus',
  'UserAdoption',
  'UserBehavior',
  'DiscountDistribution',
  'PriceOverrideAnalysis',
  'TopQuotedProduct',
  'ConversionSegment',
  'TrendIndicator',
  'DataQualityFlag',
  'ComplexityHotspot',
  'ExtractionConfidence',
  'OptionAttachmentRate',
  'DataCount',
  'OrgFingerprint',
  'UsageOverview',
  'OrderLifecycleOverview',
]);

function buildObjectInventory(results: Map<string, CollectorResult>): AssessmentFindingInput[] {
  const objectMap = new Map<
    string,
    { count: number; domain: string; maxComplexity: string; brandSpecific: boolean }
  >();

  for (const [, result] of results) {
    for (const f of result.findings) {
      if (SYNTHETIC_TYPES.has(f.artifactType) || METADATA_TYPES.has(f.artifactType)) continue;
      if (!ARTIFACT_TO_SF_OBJECT[f.artifactType]) {
        log.warn({ artifactType: f.artifactType }, 'object_inventory_unmapped_artifact_type');
        continue; // Unknown type — skip, don't pollute inventory
      }
      const sfObject = ARTIFACT_TO_SF_OBJECT[f.artifactType];
      const existing = objectMap.get(sfObject) ?? {
        count: 0,
        domain: f.domain,
        maxComplexity: 'low',
        brandSpecific: false,
      };

      // Use countValue for aggregate findings (DataCount → "688 products"),
      // increment for individual record findings (PriceRule → one finding per rule)
      if (f.countValue != null && f.countValue > 0) {
        existing.count = Math.max(existing.count, f.countValue);
      } else {
        existing.count++;
      }

      // ... complexity + brand detection
      objectMap.set(sfObject, existing);
    }
  }
  // ... produce ObjectInventoryItem findings
}
```

**Called from:** `summaries/builder.ts` inside `buildSummaries()`.

**New artifact type:** `ObjectInventoryItem`

**Test:**

- Unit: Given findings with artifactType `PriceRule`, verify inventory entry uses `SBQQ__PriceRule__c`.
- Unit: Given synthetic findings (`TopQuotedProduct`, `TrendIndicator`), verify they're excluded.
- Unit: Given findings from 3 collectors, verify inventory groups by SF object API name.
- Verify sorting: by domain/tier, then count descending.

**Acceptance criteria:**

- Inventory groups by **Salesforce object API name** (not artifactType)
- Synthetic findings excluded
- Output matches benchmark Appendix A structure (~30-50 objects)

---

### 2.3 C-03: CPQ Reports & Dashboards Query (G-15)

**Gap:** The gap analysis §3.15 specifies a SOQL query to discover CPQ-related reports. Not implemented.

**Implementation location:** `apps/worker/src/collectors/integrations.ts`

**SOQL:**

```sql
SELECT Id, Name, Description, FolderName
FROM Report
WHERE Name LIKE '%CPQ%' OR Name LIKE '%Quote%' OR Name LIKE '%SBQQ%'
   OR FolderName LIKE '%CPQ%'
LIMIT 50
```

**Implementation:** Add as a new section at the end of the Integrations collector (after platform events), wrapped in try/catch (non-critical if Report object is not queryable).

**New artifact type:** `CPQReport`

**Test:**

- Unit: Mock API returns 5 reports. Verify 5 `CPQReport` findings produced.
- Edge case: Report object not queryable → no findings, no error.

**Acceptance criteria:**

- SOQL query added to integrations collector
- `CPQReport` findings produced with name, description, folder
- Graceful failure if Report is not queryable

---

### 2.4 C-04: Quote Processes & Import Formats Feature Detection (G-12 remainder)

**Gap:** The feature utilization heatmap (G-12) was extended with 7 new features but 2 remain: Quote Processes and Import Formats. These need Tooling API queries to detect.

**Implementation location:** `apps/worker/src/normalize/metrics.ts` — extend `computeFeatureAdoption()`

**Detection logic:**

> **Audit hardening (A1 #1, A2 #2):** `SBQQ__QuoteProcess__c` and `SBQQ__ImportFormat__c` are regular CPQ config objects, NOT Custom Settings. They appear as `DataCount` findings from the Discovery collector (SBQQ namespace scan), not as `CPQSettingValue` from Settings. Before implementing, verify these objects exist in the actual 547 findings from a live extraction.

```typescript
{
  name: 'Quote Processes',
  check: (f) => {
    // These are custom objects discovered by Discovery, not Settings
    const qp = f.filter((x) =>
      x.artifactType === 'DataCount' &&
      (x.artifactName?.includes('QuoteProcess') ||
       x.artifactId?.includes('SBQQ__QuoteProcess'))
    );
    const count = qp.reduce((sum, x) => sum + (x.countValue ?? 0), 0);
    return { used: count > 0, level: count > 0 ? 'light' : 'none', findingsCount: count };
  },
},
{
  name: 'Import Formats',
  check: (f) => {
    const imp = f.filter((x) =>
      x.artifactType === 'DataCount' &&
      (x.artifactName?.includes('ImportFormat') ||
       x.artifactId?.includes('SBQQ__ImportFormat'))
    );
    const count = imp.reduce((sum, x) => sum + (x.countValue ?? 0), 0);
    return { used: count > 0, level: count > 0 ? 'light' : 'none', findingsCount: count };
  },
},
```

> **Pre-implementation verification:** Inspect the actual Discovery collector output for `QuoteProcess` and `ImportFormat` findings. If these objects aren't in the Discovery namespace scan list, add them to `COUNT_OBJECTS` in `discovery.ts` (one SOQL COUNT each).

**Test:**

- Unit: Given findings with QuoteProcess and ImportFormat settings, verify feature adoption includes them.
- Given no such findings, verify `used: false, level: 'none'`.

**Acceptance criteria:**

- Feature adoption heatmap now covers all 18 features from the benchmark
- No new SOQL queries required

---

### 2.5 C-05: Transform Script Updates

> **Added per audit (A1 §2.9):** New artifact types from Batch 1 (and prior Phase 14 work) won't appear in the Assessment Dashboard unless `transform-to-ui.ts` handles them.

**Gap:** The transform script maps findings to UI data structure. New artifact types (`OptionAttachmentRate`, `ObjectInventoryItem`, `CPQReport`, `FieldCompleteness`, `CPQSettingValue`, `PluginStatus`, `UserBehavior`, `DiscountDistribution`, `PriceOverrideAnalysis`, `ConversionSegment`, `TrendIndicator`, `DataQualityFlag`, `ComplexityHotspot`, `ExtractionConfidence`) need transform handlers.

**Implementation location:** `apps/worker/scripts/transform-to-ui.ts`

**Changes:**

- `CPQSettingValue` → new "Settings Panel" section in domain extras
- `PluginStatus` → new "Plugins" section in domain extras
- `UserBehavior` → Usage & Adoption → user behavior table
- `DiscountDistribution` → Usage & Adoption → discount chart data
- `PriceOverrideAnalysis` → Usage & Adoption → override summary
- `TopQuotedProduct` → Usage & Adoption → top products table
- `ConversionSegment` → Usage & Adoption → conversion by size table
- `TrendIndicator` → metrics with trend arrows
- `DataQualityFlag` → Data Quality section
- `ComplexityHotspot` → Overview → hotspots section
- `ExtractionConfidence` → confidence badges throughout
- `ObjectInventoryItem` → Appendix A equivalent
- `CPQReport` → Integrations → reports list

**Test:**

- Unit: Given findings of each new artifact type, verify transform produces correct UI data.
- Existing transform tests still pass.

**Acceptance criteria:**

- All 14+ new artifact types handled by transform
- Assessment Dashboard renders new data sections
- No regression on existing domain tab data

---

## 3. Batch 2: LLM Enrichment Infrastructure

**Goal:** Build the LLM enrichment module with Anthropic SDK integration, prompt template, structured output parsing, and non-blocking pipeline integration. The feature is toggled **off by default** via config flag and can be enabled when an API key is available.

**Effort:** 4-5 hours
**Dependencies:** Batch 1 (hotspot detection is input to LLM)
**New dependency:** `@anthropic-ai/sdk` package
**Affected files:** `config.ts`, new `summaries/llm-enrichment.ts`, `pipeline.ts`

---

### 3.1 L-01: Worker Config Flag

**Description:** Add `llmEnrichmentEnabled` and `anthropicApiKey` to the worker config.

**Implementation location:** `apps/worker/src/config.ts`

**Changes:**

```typescript
// Add to WorkerConfig interface:
llmEnrichmentEnabled: boolean;
anthropicApiKey: string | null;
anthropicModel: string | null;

// Add to loadConfig():
llmEnrichmentEnabled: process.env.LLM_ENRICHMENT_ENABLED === 'true',
anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? null,
anthropicModel: process.env.ANTHROPIC_MODEL ?? null, // defaults to claude-sonnet-4-20250514 in L-02
```

**Also add to:**

- `CollectorContext.config` — pass through to pipeline
- `.env.example` — document both variables
- `.env.local` / `.env.real` — set `LLM_ENRICHMENT_ENABLED=false` (default off)

**Test:**

- Unit: Config loads with `LLM_ENRICHMENT_ENABLED=false` → `llmEnrichmentEnabled === false`.
- Unit: Config loads with `LLM_ENRICHMENT_ENABLED=true` and `ANTHROPIC_API_KEY=sk-ant-xxx` → both populated.
- Unit: Missing `ANTHROPIC_API_KEY` when enabled → warning logged, feature disabled at runtime.

**Acceptance criteria:**

- Config flag exists and defaults to `false`
- Env vars documented in `.env.example`
- Existing tests still pass

---

### 3.2 L-02: LLM Client Module

**Description:** Create `apps/worker/src/summaries/llm-enrichment.ts` — the Anthropic API client that takes structured assessment data and produces enriched narratives.

**Implementation:**

```typescript
import Anthropic from '@anthropic-ai/sdk';
import type { SummarySchema } from './schemas.ts';
import type { CollectorResult } from '../collectors/base.ts';

export interface LLMEnrichmentOutput {
  executiveSummary: Array<{
    id: string;
    title: string;
    detail: string;
    confidence: 'Confirmed' | 'Estimated' | 'Partial';
  }>;
  hotspotAnalyses: Array<{
    hotspotName: string;
    severity: 'Critical' | 'High' | 'Medium';
    analysis: string;
  }>;
  lifecycleDescription: Array<{
    stepNumber: number;
    title: string;
    detail: string;
  }>;
}

export async function enrichWithLLM(opts: {
  apiKey: string;
  model?: string;
  summaries: SummarySchema;
  results: Map<string, CollectorResult>;
}): Promise<LLMEnrichmentOutput | null> {
  const client = new Anthropic({ apiKey: opts.apiKey });

  // Build structured input (Layers 1-3 from Gap Analysis §4.2)
  const input = buildLLMInput(opts.summaries, opts.results);

  // Call Claude with structured output + 30s timeout
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
  try {
    const response = await client.messages.create(
      {
        model: opts.model ?? 'claude-sonnet-4-20250514',
        max_tokens: 4096,
        temperature: 0,
        messages: [{ role: 'user', content: buildPrompt(input) }],
      },
      { signal: controller.signal }
    );

    const text = response.content[0].type === 'text' ? response.content[0].text : '';
    const parsed = JSON.parse(text);

    // Runtime schema validation — prevent malformed LLM output from reaching DB
    const validated = LLMEnrichmentSchema.parse(parsed);
    return validated;
  } finally {
    clearTimeout(timeout);
  }
}
```

**Runtime schema validation:**

> **Audit hardening (A1 #2):** LLM output is untrusted. `JSON.parse` succeeding doesn't mean the structure is correct. Use `zod` to validate before writing to DB.

```typescript
import { z } from 'zod';

const LLMEnrichmentSchema = z.object({
  executiveSummary: z
    .array(
      z.object({
        id: z.string(),
        title: z.string(),
        detail: z.string(),
        confidence: z.enum(['Confirmed', 'Estimated', 'Partial']),
      })
    )
    .min(1)
    .max(10),
  hotspotAnalyses: z.array(
    z.object({
      hotspotName: z.string(),
      severity: z.enum(['Critical', 'High', 'Medium']),
      analysis: z.string(),
    })
  ),
  lifecycleDescription: z.array(
    z.object({
      stepNumber: z.number().int().min(1).max(10),
      title: z.string(),
      detail: z.string(),
    })
  ),
});
```

**Prompt:** Uses the full TypeScript schema from Gap Analysis §4.2 (v1.2), including the JSON-only instruction and rules from the audit fixes.

**Error handling:**

- 30-second timeout (AbortController)
- 1 retry on transient failure
- Zod validation after JSON.parse — rejects malformed structure
- Returns `null` on any error (parse, validation, timeout, API — all non-blocking)
- All errors logged as warnings

**Test:**

- Unit: Mock Anthropic client returns valid JSON → parsed correctly.
- Unit: Mock Anthropic client throws timeout → returns null, no crash.
- Unit: Mock Anthropic client returns invalid JSON → returns null, warning logged.
- Unit: Input builder produces valid `LLMAssessmentInput` from sample results.

**Acceptance criteria:**

- Module compiles and exports `enrichWithLLM()` function
- Prompt matches Gap Analysis §4.2 specification exactly
- Non-blocking error handling verified
- No actual API call in tests (fully mocked)

---

### 3.3 L-03: Pipeline Integration (Phase 5.5)

**Description:** Add LLM enrichment call to `pipeline.ts` between Phase 5 (summaries) and the final return.

**Implementation:**

> **Audit fix (A2 §3):** v1.0 computed LLM enrichment but never wrote it to DB. The gap analysis §4.2 specifies storage in `assessment_summaries` table with `summary_type = 'llm_enrichment'`.

```typescript
// In pipeline.ts, after buildSummaries():

// ── Phase 5.5: LLM Enrichment (optional) ─────────────────────
if (ctx.config.llmEnrichmentEnabled && ctx.config.anthropicApiKey) {
  log.info('phase_5_5_start: llm_enrichment');
  try {
    const enrichment = await enrichWithLLM(ctx.config.anthropicApiKey, summaries, results);
    if (enrichment) {
      // Write enrichment to assessment_summaries (authoritative store — not a collector)
      await ctx.sql`
        INSERT INTO assessment_summaries (run_id, summary_type, content, schema_version)
        VALUES (${ctx.runId}, 'llm_enrichment', ${JSON.stringify(enrichment)}, '1.0')
        ON CONFLICT (run_id, summary_type, COALESCE(domain, '_global'))
        DO UPDATE SET content = EXCLUDED.content, created_at = NOW()
      `;

      log.info(
        {
          executiveSummaryCount: enrichment.executiveSummary.length,
          hotspotCount: enrichment.hotspotAnalyses.length,
          lifecycleSteps: enrichment.lifecycleDescription.length,
        },
        'llm_enrichment_complete'
      );
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.warn({ error: msg }, 'phase_5_5_warning: llm enrichment failed (non-fatal)');
  }
} else {
  log.info('phase_5_5_skip: llm_enrichment_disabled');
}
```

**Test:**

- Unit: With `llmEnrichmentEnabled: false` → Phase 5.5 skipped, log shows "disabled".
- Unit: With `llmEnrichmentEnabled: true` and mock enrichment → Phase 5.5 runs, enrichment logged.
- Unit: LLM call throws → pipeline continues, final status unchanged.

**Acceptance criteria:**

- Pipeline runs successfully with LLM disabled (existing behavior preserved)
- Pipeline runs successfully with LLM enabled + mock (no real API call)
- LLM failure is non-fatal — pipeline status unchanged

---

## 4. Batch 3: PDF Report Generator

**Goal:** Produce a branded PDF report matching the 22-page benchmark format. The generator reads from assessment findings in the DB (or mock data) and produces a downloadable PDF.

**Effort:** 5-8 days
**Dependencies:** Batch 1 + Batch 2 (all data sources must be available)
**No new dependencies** — uses Playwright (already installed for E2E tests) for HTML → PDF rendering
**Location:** New `apps/worker/src/report/` directory (or new `apps/report-generator/` package)

> **Architecture decision:** The report generator is a **separate module** within the worker package, not a collector. It reads findings from the DB after extraction is complete and produces a PDF file that gets uploaded to Supabase Storage. The API exposes a download URL.

---

### 4.1 R-01: Report Data Assembler

**Description:** Module that reads all findings for a completed run and assembles them into a structured `ReportData` object matching the benchmark report's 10 sections + 4 appendices.

**Implementation location:** `apps/worker/src/report/assembler.ts`

**Interface:**

```typescript
export interface ReportData {
  metadata: {
    clientName: string;
    orgId: string;
    environment: string;
    assessmentDate: string;
    assessmentPeriod: string;
    cpqVersion: string;
    sbaaVersion: string | null;
    generatedBy: string;
  };
  executiveSummary: {
    keyFindings: Array<{ title: string; detail: string; confidence: string }>;
    complexityScores: {
      overall: number;
      configurationDepth: number;
      pricingLogic: number;
      customizationLevel: number;
      dataVolumeUsage: number;
      technicalDebt: number;
    };
  };
  cpqAtAGlance: Record<string, Array<{ label: string; value: string; confidence: string }>>;
  packageSettings: {
    installedPackages: Array<{ name: string; namespace: string; version: string; status: string }>;
    coreSettings: Array<{ setting: string; value: string; notes: string; confidence: string }>;
    plugins: Array<{ plugin: string; status: string; notes: string; confidence: string }>;
  };
  quoteLifecycle: Array<{ step: number; description: string }>;
  // All fields below are fully typed (audit fix A1 §2.3, A2 §7 — v1.0 used any[])
  configurationDomain: {
    productCatalog: {
      categories: Array<{
        category: string;
        active: number;
        inactive: number;
        quoted90d: number;
        percentQuoted: number;
        confidence: string;
      }>;
    };
    pricingLogic: {
      priceRules: Array<{
        name: string;
        description: string;
        complexity: string;
        usage: string;
        confidence: string;
      }>;
      productRules: Array<{
        name: string;
        description: string;
        complexity: string;
        confidence: string;
      }>;
    };
    approvalsDocuments: {
      approvalType: string;
      steps: string;
      templates: Array<{ name: string; status: string; confidence: string }>;
    };
  };
  usageAdoption: {
    quotingActivity: Array<{ metric: string; value: string; trend: string; confidence: string }>;
    conversionBySize: Array<{
      segment: string;
      percentQuotes: number;
      percentRevenue: number;
      conversionRate: number;
      avgCloseDays: number;
      confidence: string;
    }>;
    discountDistribution: Array<{ range: string; count: number; percent: number }>;
    overrideAnalysis: {
      count: number;
      rate: number;
      revenueImpact: number;
      confidence: string;
    } | null;
    modificationPatterns: { rate: number; avgPerQuote: number; confidence: string } | null;
    userBehavior: Array<{
      profile: string;
      users: number;
      percentQuotes: number;
      avgValue: number;
      conversionRate: number;
    }>;
    topProducts: Array<{
      name: string;
      sku: string;
      category: string;
      quotedCount: number;
      percentQuotes: number;
    }>;
  };
  dataQualityDebt: {
    fieldCompleteness: Array<{
      object: string;
      requiredPct: number;
      optionalPct: number;
      qualityPct: number;
      confidence: string;
    }>;
    flaggedAreas: Array<{ issue: string; status: string; detail: string; confidence: string }>;
    technicalDebt: Array<{
      category: string;
      count: number;
      percentOfTotal: number;
      detail: string;
      confidence: string;
    }>;
    featureUtilization: Array<{
      feature: string;
      status: string;
      detail: string;
      confidence: string;
    }>;
  };
  customCodeAutomation: {
    apexClasses: Array<{
      name: string;
      lines: number;
      purpose: string;
      origin: string;
      sbqqObjects: string;
      confidence: string;
    }>;
    triggersFlows: Array<{
      name: string;
      type: string;
      object: string;
      origin: string;
      status: string;
      confidence: string;
    }>;
    validationRules: Array<{
      object: string;
      rule: string;
      status: string;
      complexity: string;
      confidence: string;
    }>;
  };
  complexityHotspots: Array<{ name: string; severity: string; analysis: string }>;
  appendixA: Array<{
    id: number;
    objects: string;
    apiName: string;
    count: number | string;
    brandSpecific: boolean;
    phase: number;
    complexity: string;
    confidence: string;
  }>;
  appendixB: Array<{ name: string; description: string; confidence: string }>;
  appendixD: Array<{ category: string; coverage: string; notes: string }>;
  // LLM enrichment (optional — may be null if LLM disabled)
  llmEnrichment: LLMEnrichmentOutput | null;
}
```

**Data source:** `assessmentFindings` table via `AssessmentRepository.findFindingsByRun()`, grouped and transformed by `artifactType`.

**Test:**

- Unit: Given a set of mock findings covering all artifact types, verify `ReportData` has all sections populated.
- Verify empty sections produce "N/A" or "Not assessed" rather than nulls.

**Acceptance criteria:**

- Assembler produces complete `ReportData` from any completed run
- All 10 sections + 4 appendices populated
- Graceful handling of missing data (partial runs)

---

### 4.2 R-02: HTML Template System

**Description:** TypeScript template literal functions that render `ReportData` into styled HTML matching the benchmark's visual design.

> **Audit hardening (A2 #6):** v1.0-v1.2 specified Handlebars `.hbs` files. These won't survive TypeScript compilation (they're plain text assets, not copied to `dist/`). Switched to template literals in `.ts` files — no asset pipeline needed, full TypeScript type checking, works in all deployment environments.

**Implementation location:** `apps/worker/src/report/templates/`

**Template structure:**

```
apps/worker/src/report/templates/
├── index.ts             ← Main render function: assembles all sections
├── styles.ts            ← Print-optimized CSS as string constant
├── sections/
│   ├── cover.ts         ← Page 1: Title page with client info
│   ├── scope.ts         ← Pages 2-3: Scope & methodology
│   ├── executive.ts     ← Pages 4-5: Executive summary + scores
│   ├── glance.ts        ← Pages 6-7: CPQ at a Glance (most complex)
│   ├── settings.ts      ← Page 8: Package settings + plugins
│   ├── lifecycle.ts     ← Page 9: Quote lifecycle flow
│   ├── config.ts        ← Pages 10-11: Configuration domain
│   ├── usage.ts         ← Pages 12-14: Usage & adoption
│   ├── quality.ts       ← Pages 15-16: Data quality & debt
│   ├── code.ts          ← Pages 17-18: Custom code inventory
│   ├── hotspots.ts      ← Page 19: Complexity hotspots
│   ├── appendix-a.ts    ← Page 20: Object inventory
│   ├── appendix-b.ts    ← Page 21: Reports & dashboards
│   ├── appendix-cd.ts   ← Page 22: Glossary + confidence
│   └── partials/
│       ├── table.ts     ← Reusable table helper
│       ├── score-bar.ts ← Complexity score bar (CSS-only)
│       ├── badge.ts     ← Confidence badge (Confirmed/Estimated/Partial)
│       └── header.ts    ← Page header with logo + "Confidential"
```

**Template pattern:**

```typescript
// Each section is a pure function: ReportData → HTML string
export function renderCover(data: ReportData): string {
  return `
    <div class="cover-page">
      <h1>SALESFORCE CPQ<br/>ENVIRONMENT ASSESSMENT REPORT</h1>
      <table class="info-table">
        <tr><td><strong>Client Name</strong></td><td>${escapeHtml(data.metadata.clientName)}</td></tr>
        <tr><td><strong>Salesforce Org ID</strong></td><td>${data.metadata.orgId}</td></tr>
        <!-- ... -->
      </table>
    </div>
  `;
}
```

**Styling approach:**

- CSS as a single exported string in `styles.ts`
- Print media queries for page breaks: `page-break-before: always` between sections
- Table styling matching benchmark: blue header, alternating row colors, right-aligned numbers
- Score bars: CSS flexbox with percentage-based width + color gradient
- Confidence badges: colored inline labels (green=Confirmed, orange=Estimated, gray=Partial)
- All HTML escaped via `escapeHtml()` helper to prevent XSS from finding data

**Test:**

- Render each section template independently with sample data → valid HTML.
- Full report render → valid HTML with all sections present.

**Acceptance criteria:**

- Templates produce valid HTML
- CSS handles page breaks for print
- Visual output approximates benchmark format (blue/orange color scheme, table styling)

---

### 4.3 R-03: PDF Rendering via Playwright

**Description:** Convert the assembled HTML to PDF using Playwright — already installed as a project dependency for E2E tests. No new dependencies needed.

> **Design decision:** Playwright over Puppeteer. Both use Chromium and have identical `page.pdf()` APIs. Playwright is already in `package.json` (used by E2E tests), so adding Puppeteer would be a redundant ~280MB dependency. Playwright also supports Firefox/WebKit rendering if needed.

**Implementation location:** `apps/worker/src/report/renderer.ts`

**Implementation:**

```typescript
import { chromium } from 'playwright';

export async function renderPdf(html: string): Promise<Buffer> {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: 'networkidle' });
  const pdf = await page.pdf({
    format: 'A4',
    margin: { top: '20mm', bottom: '25mm', left: '15mm', right: '15mm' },
    printBackground: true,
    displayHeaderFooter: true,
    headerTemplate:
      '<div style="font-size: 8px; color: #999; width: 100%; text-align: center;">Salesforce CPQ Assessment Report<span style="float: right;">Confidential</span></div>',
    footerTemplate:
      '<div style="font-size: 8px; color: #999; width: 100%; text-align: center;">Generated by RevBrain CPQ Assessment Tool<span style="float: right;">Page <span class="pageNumber"></span></span></div>',
  });
  await browser.close();
  return Buffer.from(pdf);
}
```

**Key differences from Puppeteer:**

- `chromium.launch()` instead of `puppeteer.launch()` (no `--no-sandbox` needed — Playwright handles this)
- `waitUntil: 'networkidle'` instead of `'networkidle0'`
- Same `page.pdf()` options — A4, margins, headers, footers all identical

**Test:**

- Unit: Given minimal valid HTML, produces a non-empty PDF buffer.
- Unit: PDF buffer starts with `%PDF` magic bytes.
- Integration: Full report HTML → PDF → file saved → readable in PDF viewer.

**Deployment considerations:**

Playwright's Chromium is already present in the project (installed via `npx playwright install chromium`). For production:

| Environment            | Approach                                                                                                                           |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| **Docker** (Cloud Run) | Use `mcr.microsoft.com/playwright` base image or `npx playwright install --with-deps chromium` in Dockerfile. Allocate 512MB+ RAM. |
| **CI**                 | Already configured — Playwright browsers installed for E2E tests.                                                                  |
| **Serverless**         | Use `playwright-core` + custom Chromium binary path if needed.                                                                     |

**Acceptance criteria:**

- PDF is A4 format with correct margins
- Header and footer on every page
- Page numbers auto-incremented
- Background colors and table styling rendered correctly
- File size reasonable (target < 5MB, warn > 8MB)
- No new npm dependency added (uses existing Playwright)

---

### 4.4 R-04: Section Templates (22 pages)

**Description:** Implement all 14 section templates matching the benchmark report layout. This is the bulk of the PDF work.

**Sections (ordered by implementation priority):**

| #   | Section              | Template          | Complexity | Notes                                                         |
| --- | -------------------- | ----------------- | ---------- | ------------------------------------------------------------- |
| 1   | Cover Page           | `cover.hbs`       | Low        | Client info table, title, branding                            |
| 2   | Executive Summary    | `executive.hbs`   | Medium     | Key findings table + complexity score bars                    |
| 3   | CPQ at a Glance      | `glance.hbs`      | High       | Multi-column metric grid (the most complex layout)            |
| 4   | Package Settings     | `settings.hbs`    | Medium     | 3 tables: packages, settings, plugins                         |
| 5   | Quote Lifecycle      | `lifecycle.hbs`   | Low        | Numbered list                                                 |
| 6   | Configuration Domain | `config.hbs`      | Medium     | Product catalog table, pricing rules table, approvals summary |
| 7   | Usage & Adoption     | `usage.hbs`       | High       | Multiple tables + discount distribution                       |
| 8   | Data Quality         | `quality.hbs`     | Medium     | Field completeness + tech debt tables                         |
| 9   | Custom Code          | `code.hbs`        | Medium     | Apex, triggers, flows tables                                  |
| 10  | Complexity Hotspots  | `hotspots.hbs`    | Low        | Severity + analysis table                                     |
| 11  | Appendix A           | `appendix-a.hbs`  | Medium     | 44-row object inventory                                       |
| 12  | Appendix B           | `appendix-b.hbs`  | Low        | Reports list                                                  |
| 13  | Appendix C+D         | `appendix-cd.hbs` | Low        | Glossary (static) + confidence map                            |
| 14  | Scope & Methodology  | `scope.hbs`       | Low        | Assessment scope (mostly static text)                         |

**Test:**

- Each section template renders without errors with sample data.
- Full report renders all 14 sections in correct order.

**Acceptance criteria:**

- All 14 sections implemented
- Table formatting matches benchmark (headers, alignment, colors)
- Score bars render correctly in PDF
- Confidence badges inline on every data point
- Page breaks between major sections

---

### 4.5 R-05: API Endpoint & Download Flow

**Description:** Server API endpoint to trigger report generation and return a download URL.

> **Audit hardening (A2 #5):** v1.1 specified async background job generation, but "background job" was never defined (no queue, no executor). For v1: **generate synchronously** in the request handler. A 22-page PDF with Playwright takes 5-10 seconds — acceptable for a download action. Cache the result for subsequent requests. Add async later if latency becomes a problem.

**Endpoint:**

```
POST /v1/projects/:projectId/assessment/runs/:runId/report
  → 200 { downloadUrl: '...' } (generates + uploads + returns signed URL)
  → 200 { downloadUrl: '...' } (returns cached signed URL if already generated)
  → 400 if run not completed

  Generates synchronously (~5-10 seconds). Caches PDF in Supabase Storage.
  Subsequent calls return fresh signed URL for the cached PDF.
  Re-generation forced via query param: POST .../report?regenerate=true
```

**Flow:**

1. `POST .../report` validates run is completed
2. Check if PDF already exists: `assessment_runs.metadata.reportPath`
3. If cached and no `?regenerate=true`: generate fresh signed URL, return immediately
4. If not cached or regenerate: assemble → render → PDF → upload → return signed URL

```typescript
assessmentRouter.post('/:projectId/assessment/runs/:runId/report', async (c) => {
  const run = await repos.assessmentRuns.findRunById(runId);
  if (!run || !['completed', 'completed_warnings'].includes(run.status)) {
    return c.json(
      { success: false, error: { code: 'BAD_REQUEST', message: 'Run not completed' } },
      400
    );
  }

  const regenerate = c.req.query('regenerate') === 'true';
  const existingPath = (run.metadata as any)?.reportPath;

  if (existingPath && !regenerate) {
    // Return cached PDF via fresh signed URL
    const { data } = await supabase.storage
      .from('assessment-reports')
      .createSignedUrl(existingPath, 900); // 15-min expiry
    return c.json({ success: true, data: { downloadUrl: data.signedUrl } });
  }

  // Generate synchronously (~5-10 seconds)
  const findings = await repos.assessmentRuns.findFindingsByRun(runId);
  const reportData = assembleReport(findings, run);
  const html = renderReport(reportData);
  const pdf = await renderPdf(html);

  // Upload to Supabase Storage
  const storagePath = `${runId}/report.pdf`;
  await supabase.storage.from('assessment-reports').upload(storagePath, pdf, {
    contentType: 'application/pdf',
    upsert: true,
  });

  // Cache path in run metadata
  await repos.assessmentRuns.updateRunStatus(runId, run.status, {
    statusReason: JSON.stringify({
      ...(run.metadata ?? {}),
      reportPath: storagePath,
      reportGeneratedAt: new Date().toISOString(),
    }),
  });

  const { data } = await supabase.storage
    .from('assessment-reports')
    .createSignedUrl(storagePath, 900);
  return c.json({ success: true, data: { downloadUrl: data.signedUrl } });
});
```

> **Audit fix (A2 §8):** Use Supabase signed URLs — never expose public storage URLs for confidential assessment reports.

**LLM enrichment flow to PDF:**

> **Audit fix (A2 §10):** R-01 assembler must also read from `assessment_summaries` table to include LLM-generated content.

```typescript
// In assembler, after loading findings:
const llmEnrichment = await repo.findSummaryByType(runId, 'llm_enrichment');
if (llmEnrichment) {
  reportData.executiveSummary.keyFindings = llmEnrichment.executiveSummary;
  // Merge strategy: for each rule-based hotspot, if LLM produced an analysis
  // with matching hotspotName, replace the analysis text with LLM version.
  // Keep rule-based severity and evidence counts; use LLM narrative text.
  reportData.complexityHotspots = mergeHotspotNarratives(
    reportData.complexityHotspots, // rule-based (severity, evidence)
    llmEnrichment.hotspotAnalyses // LLM narratives (analysis text only)
  );
  reportData.quoteLifecycle = llmEnrichment.lifecycleDescription;
  reportData.llmEnrichment = llmEnrichment;
}
// LLM precedence rules:
// - LLM content ONLY overrides narrative fields (analysis text, lifecycle descriptions)
// - Raw counts, tables, and metrics ALWAYS come from extracted findings (never LLM)
// - If LLM is absent, report renders fully with rule-based/default summaries
// - LLM-enriched fields are marked with confidence: 'Estimated' in the report
```

**Test:**

- Integration: POST to report endpoint for completed run → 202 Accepted.
- GET returns `status: 'generating'` while in progress.
- GET returns `status: 'ready'` with signed URL after completion.
- Signed URL downloads valid PDF.
- POST for non-completed run → 400.
- GET signed URL after 15 min → expired (new GET generates fresh URL).

**Acceptance criteria:**

- Async report generation (POST returns 202, not blocking)
- PDF uploaded to Supabase Storage at `assessment-reports/{runId}/report.pdf`
- Download via signed URLs only (15-min expiry, generated per request)
- LLM enrichment content included when available, rule-based fallback otherwise
- Report reflects all findings from the run

---

## 5. Batch 4: Field Completeness Sampling (G-11)

**Goal:** Implement stratified data sampling to compute per-object field population rates.

**Effort:** 1 day
**Dependencies:** None (can run in parallel with Batch 3)
**Requires:** Live Salesforce connection (`pnpm local:real`) for integration testing
**Affected files:** New `collectors/data-quality.ts` or post-processing in `normalize/validation.ts`

**Implementation:** As specified in Gap Analysis §3.11 (v1.2) — 3 strata per object (recent/mid/old), 100 records total, population rate per field, required vs optional from Describe.

> **Audit fix (A2 §9):** Stratified sampling (18 queries) is a marginal accuracy improvement over simple sampling (6 queries). The benchmark marks all field completeness as "Estimated" regardless. Default to 6-query version.

**SOQL budget:** 6 queries (1 per object, 100 records each). Stratified sampling (18 queries, 3 strata per object) available as a future enhancement for orgs with evolving schemas.

**Test:**

- Unit: Given 100 mock records with known null patterns, verify population rates.
- Unit: Verify required vs optional classification from Describe `nillable` flag.
- Integration: Run against live SF, verify rates are between 0-100%.

**Acceptance criteria:**

- `FieldCompleteness` findings produced per CPQ object
- Required field completeness vs optional field completeness computed separately
- Low-population fields (<5%) flagged
- Confidence marked as "Estimated" (sampling-based)

---

## 6. Batch 5: Data Refresh & End-to-End Validation

**Goal:** Re-run the full extraction against live Salesforce with all enhancements, regenerate UI data, and validate end-to-end.

**Effort:** Half day
**Dependencies:** Batches 1-4 complete
**Requires:** `pnpm local:real` with live Salesforce credentials

**Steps:**

1. Start mock server with real SF credentials: `pnpm local:real`
2. Run full extraction: `npx tsx apps/worker/scripts/export-assessment.ts`
3. Transform to UI format: `npx tsx apps/worker/scripts/transform-to-ui.ts`
4. Copy updated JSON to client: `cp apps/worker/output/assessment-ui-data.json apps/client/src/features/projects/mocks/assessment-real-data.json`
5. Run E2E tests: `npx playwright test e2e/assessment-real-data.spec.ts`
6. Verify new artifact types render in dashboard

**Validation checklist:**

- [ ] CPQSettingValue findings appear in extraction output
- [ ] PluginStatus findings appear (5 plugins)
- [ ] UserAdoption finding with license counts
- [ ] UserBehavior findings per profile
- [ ] DiscountDistribution finding with buckets
- [ ] PriceOverrideAnalysis finding
- [ ] TopQuotedProduct findings (10 products with names)
- [ ] ConversionSegment findings (4 segments)
- [ ] TrendIndicator finding
- [ ] DataQualityFlag findings (orphans, duplicates, inactive)
- [ ] ObjectInventoryItem findings (30-50 objects)
- [ ] CPQReport findings
- [ ] ComplexityHotspot findings
- [ ] ExtractionConfidence findings
- [ ] OptionAttachmentRate findings (3-8 per run)
- [ ] FieldCompleteness findings (6 objects with population rates)
- [ ] ReportData.cpqAtAGlance assembled with all 8 sections
- [ ] Total findings > 700 (up from ~550)
- [ ] E2E tests 10/10
- [ ] PDF report generates from completed run
- [ ] Transform script handles all new artifact types

**Acceptance criteria:**

- All new artifact types present in extraction output
- Assessment Dashboard renders enriched data
- E2E tests pass

---

## 7. Track Record

| Batch | Task | Description                                       | Test Type                               | Status        |
| ----- | ---- | ------------------------------------------------- | --------------------------------------- | ------------- |
| **1** | C-01 | Product option attachment rates (G-07)            | Unit (RequiredBy join, rate calc)       | did not start |
| **1** | C-02 | Consolidated object inventory (G-14)              | Unit (grouping, sorting, brand flag)    | did not start |
| **1** | C-03 | CPQ reports & dashboards query (G-15)             | Unit (SOQL, graceful failure)           | did not start |
| **1** | C-04 | Quote Processes + Import Formats detection (G-12) | Unit (feature check)                    | did not start |
| **1** | C-05 | Transform script updates (all new artifact types) | Unit (transform handles 14+ types)      | did not start |
| **2** | L-01 | Worker config flag (llmEnrichmentEnabled)         | Unit (env loading, default off)         | did not start |
| **2** | L-02 | LLM client module (Anthropic SDK)                 | Unit (mock client, error handling)      | did not start |
| **2** | L-03 | Pipeline integration (Phase 5.5)                  | Unit (skip when disabled, non-blocking) | did not start |
| **3** | R-01 | Report data assembler                             | Unit (all sections populated)           | did not start |
| **3** | R-02 | HTML template system                              | Unit (valid HTML per section)           | did not start |
| **3** | R-03 | PDF rendering (Puppeteer)                         | Unit + Integration (PDF output)         | did not start |
| **3** | R-04 | Section templates (14 sections)                   | Unit (each section renders)             | did not start |
| **3** | R-05 | API endpoint & download flow                      | Integration (trigger + download)        | did not start |
| **4** | F-01 | Field completeness sampling (G-11)                | Unit + Integration (population rates)   | did not start |
| **5** | V-01 | Data refresh + E2E validation                     | E2E (full pipeline + dashboard)         | did not start |

**Total: 15 tasks** | Completed: 0 | Remaining: 15

---

## 8. Dependency Graph

```
Batch 1 (Code Gaps)             Batch 2 (LLM Infra)
  C-03, C-04 (quick wins)        L-01 → L-02 → L-03
  C-01 (attachment rates)
  C-02 (object inventory)
  C-05 (transform script)
         │                              │
         └──────────────┬───────────────┘
                        │
                Batch 3 (PDF Report)     Batch 4 (Field Sampling)
                R-01 → R-02 → R-03      F-01 (independent, 6 queries)
                        ↓
                  R-04 → R-05
                        │
                        ↓
                Batch 5 (Data Refresh)
                      V-01
```

**Parallelization:**

- Batch 1 and Batch 2 can run in parallel
- Batch 3 and Batch 4 can run in parallel (both depend on Batch 1+2)
- Batch 5 runs last (depends on all)
- Within Batch 1: Start with C-03, C-04 (quick wins, 30 min each), then C-01, then C-02, then C-05
- Within Batch 3: R-01 → R-02 → R-03 are sequential; R-04 depends on R-02; R-05 depends on R-03
- R-04 "CPQ at a Glance" template (glance.hbs) is the most complex layout — budget 1-2 days for it alone

---

## 9. Effort & Timeline

| Batch                                | Effort    | Can Parallelize With | Blocking Dependencies |
| ------------------------------------ | --------- | -------------------- | --------------------- |
| **Batch 1** Code Gap Fixes (5 tasks) | 7-8 hours | Batch 2              | None                  |
| **Batch 2** LLM Infra (3 tasks)      | 4-5 hours | Batch 1              | None                  |
| **Batch 3** PDF Report (5 tasks)     | 7-10 days | Batch 4              | Batch 1 + 2           |
| **Batch 4** Field Sampling (1 task)  | 1 day     | Batch 3              | Live SF connection    |
| **Batch 5** Data Refresh (1 task)    | Half day  | —                    | All above + live SF   |

> **Audit fix (A2 §6):** Batch 3 re-estimated from 5-8 to 7-10 days. The "CPQ at a Glance" template alone is 1-2 days; Usage section with 7 sub-tables is another 1-2 days; print debugging always takes longer than expected. Accept "functional, not pixel-perfect" v1, then polish in a follow-up pass.

**Critical path:** Batch 1 → Batch 3 → Batch 5 (8-11 days)

**With parallelization:** Batch 1+2 (1 day) → Batch 3+4 parallel (7-10 days) → Batch 5 (half day) = **9-12 days total**

**What's achievable without external dependencies:**

- Batch 1: All 5 tasks (code only, no SF needed)
- Batch 2: All 3 tasks (mock SDK, no API key needed)
- Batch 3: R-01 through R-04 (templates + renderer — local file output)
- Total: ~8-9 days of work, fully offline

**What requires external access:**

- Batch 4: Live Salesforce connection (`pnpm local:real`)
- Batch 5: Live SF + running server
- Batch 3 R-05: Supabase Storage for upload (local file output as development alternative)
- LLM testing with real API: Anthropic API key (mocked in tests)
