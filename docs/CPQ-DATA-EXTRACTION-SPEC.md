# Salesforce CPQ Data Extraction Specification

> **Purpose:** Definitive reference for which Salesforce CPQ data to extract, how to query it, where it lives, and what pitfalls to expect — structured specifically to enable CPQ → Revenue Cloud Advanced (RCA) migration mapping. This document covers the data layer only — orchestration, scoring, and report generation are addressed in separate specs.
>
> **Audience:** Implementation engineers, external auditors, partner solution architects
>
> **Date:** 2026-03-25
> **Version:** 2.2
> **Authors:** Daniel + Claude
> **Status:** Build-ready — approved by both auditors, cross-referenced against AllCloud Requirements + Product Spec
>
> **Audit History:**
> - v1.0-draft (2026-03-25): Initial specification
> - v2.0 (2026-03-25): Incorporated all critical/high/medium findings from two independent audits
> - v2.1 (2026-03-25): Final polish per v2 audit — RCA API object names, Pricing Recipes/BRE/Hooks, dynamic CPQ Settings discovery, Context Definition blueprint, Product Selling Model derived metrics, Opportunity Sync query fix, qualification rule mapping split, branding note
> - v2.2 (2026-03-25): Cross-reference audit fixes — Org Fingerprint extraction, contracted price derived metrics restored, synchronous dependency risk metric, runtime estimation inputs

---

## Table of Contents

1. [Context & Goals](#1-context--goals)
2. [RCA Target Model Reference](#2-rca-target-model-reference)
3. [Salesforce API Strategy](#3-salesforce-api-strategy)
4. [Prerequisite: Object & Field Discovery](#4-prerequisite-object--field-discovery)
5. [Collector 1: Product Catalog](#5-collector-1-product-catalog)
6. [Collector 2: Pricing Configuration](#6-collector-2-pricing-configuration)
7. [Collector 3: Quote Templates & Documents](#7-collector-3-quote-templates--documents)
8. [Collector 4: Approval Processes](#8-collector-4-approval-processes)
9. [Collector 5: Customizations (Objects, Fields, Validation)](#9-collector-5-customizations)
10. [Collector 6: Code & Flow Dependencies](#10-collector-6-code--flow-dependencies)
11. [Collector 7: Integration Artifacts](#11-collector-7-integration-artifacts)
12. [Collector 8: 90-Day Usage Analytics](#12-collector-8-90-day-usage-analytics)
13. [Collector 9: Order, Contract & Asset Lifecycle](#13-collector-9-order-contract--asset-lifecycle)
14. [Collector 10: Localization](#14-collector-10-localization)
15. [Collector 11: CPQ Package Settings](#15-collector-11-cpq-package-settings)
16. [Custom Objects via Configuration](#16-custom-objects-via-configuration)
17. [API Budget & Throttling](#17-api-budget--throttling)
18. [Dynamic Query Construction](#18-dynamic-query-construction)
19. [Per-Query Error Handling](#19-per-query-error-handling)
20. [Post-Extraction Validation](#20-post-extraction-validation)
21. [Idempotency & Checkpointing](#21-idempotency--checkpointing)
22. [Data Model: Normalized Assessment Graph](#22-data-model-normalized-assessment-graph)
23. [Gotchas & Edge Cases](#23-gotchas--edge-cases)
24. [Field Reference Tables](#24-field-reference-tables)
25. [Appendix A: CPQ Object Relationship Diagram](#appendix-a-cpq-object-relationship-diagram)
26. [Appendix B: Collector Execution Order & Dependencies](#appendix-b-collector-execution-order--dependencies)
27. [Appendix C: Minimum Required Permissions](#appendix-c-minimum-required-permissions)
28. [Appendix D: Glossary](#appendix-d-glossary)

---

## 1. Context & Goals

### What We're Building

RevBrain connects to a customer's Salesforce org (sandbox or production) and extracts CPQ configuration + usage data to produce a migration assessment. The assessment evaluates readiness for migrating from **Salesforce CPQ (SBQQ) to Revenue Cloud Advanced (RCA)**.

**Critical context:** RCA (formerly Revenue Lifecycle Management / RLM, now evolving into **Agentforce Revenue Management** per Salesforce's latest branding — though the core architecture including Context Definitions, Pricing Procedures, BRE, Decision Tables, and Hooks remains unchanged) has a fundamentally different data model than SBQQ. The extraction must be structured to enable mapping from CPQ's managed-package custom objects to RCA's native Salesforce object model. This spec defines both what to extract *and* how to structure the output for RCA mapping.

### What This Spec Covers

This document answers:
- **Which Salesforce objects** contain the data we need (both CPQ source and RCA target context)
- **Which fields** on each object matter for assessment and migration mapping
- **What SOQL queries / API calls** to execute, constructed dynamically from Describe results
- **What API** to use for each extraction (REST, Composite Batch, Bulk 2.0, Tooling, Metadata SOAP)
- **What gotchas** exist (namespace variations, FLS, governor limits, package version differences, Bulk API edge cases)
- **How to handle** partial data, missing objects, permission gaps, per-query errors, and job resumption
- **How extracted data maps** to RCA target concepts

### What This Spec Does NOT Cover

- Orchestration/job management (covered in implementation plan)
- Scoring formulas (covered in scoring spec)
- Report generation / PDF layout
- Detailed CPQ → RCA field-level mapping logic (covered in mapping spec)
- Write-back to Salesforce (explicitly out of scope for v1)

### Prerequisites

Before any collector runs, the system must have:
1. A valid OAuth connection with `api` and `refresh_token` scopes
2. Passed preflight validation (see [Section 4](#4-prerequisite-object--field-discovery))
3. The connected user must have the **API Enabled** permission and read access to CPQ objects (see [Appendix C](#appendix-c-minimum-required-permissions) for full permissions list)

---

## 2. RCA Target Model Reference

> **Why this section exists:** Both auditors flagged that extracting CPQ data without understanding the RCA target model makes the data comprehensive but not actionable for migration. This section provides the mapping context so every collector knows what it's extracting *for*.

### 2.1 CPQ → RCA Object Mapping Overview

Legacy CPQ uses managed-package custom objects (`SBQQ__*`). RCA replaces these with standard Salesforce objects and new platform-native objects. Some map 1:1; others require structural transformation.

| CPQ Source Object | RCA Target Concept | RCA API Object(s) | Mapping Complexity | Notes |
|---|---|---|---|---|
| `Product2` (with SBQQ__ fields) | Product Selling Model + Options | `ProductSellingModel`, `ProductSellingModelOption` (junction) | Medium | CPQ picklists (SubscriptionType, ChargeType, BillingFrequency) → PSM records. Unique combos define the set of PSMs to create |
| `SBQQ__ProductFeature__c` + `SBQQ__ProductOption__c` | Product Catalog Management / Attribute-Based Config | `ProductRelatedComponent`, `ProductComponentGroup`, `ProductClassification` | High | CPQ bundles → RCA product compositions + attribute sets. 12 color/size SKUs → 1 product with dynamic attributes |
| `SBQQ__ConfigurationAttribute__c` | Product Attributes | `AttributeDefinition`, `AttributeCategory`, `ProductAttributeDefinition`, `ProductClassificationAttribute` | High | Direct mapping target. Attributes are metadata-based in RCA (created once, used across many products). >10 per product flags need for Attribute Sets |
| `SBQQ__PriceRule__c` + Conditions + Actions | Pricing Procedures | `PricingProcedure`, `PricingProcedureStep` (+ related elements) | High | CPQ rules → RCA pricing procedure nodes. Must analyze rule chains for procedure graph |
| `SBQQ__CustomScript__c` (QCP) | Pricing Procedures (custom logic) or **Apex Hooks** | `PricingProcedure` + custom Apex Hooks | **Critical** | Custom JavaScript → declarative pricing procedure or Apex Hooks. QCP code that can't be made declarative maps to Hooks (available Summer '25+) |
| `SBQQ__SummaryVariable__c` | Pricing Procedure aggregate nodes | `PricingProcedureStep` (aggregate type) | High | Cross-line aggregation logic must be redesigned |
| `SBQQ__LookupQuery__c` + `SBQQ__LookupData__c` | Decision Tables + **Pricing Recipes** | `DecisionTable`, `DecisionTableParameter`, `PricingRecipe` | Medium | Data-driven pricing → RCA decision tables grouped into Pricing Recipes. Preserve LookupQuery→PriceRule parent relationship for Recipe grouping |
| `SBQQ__DiscountSchedule__c` + Tiers | Pricing Procedure + discount logic | `PricingProcedureStep` (discount type) | Medium | Volume/slab pricing redesign |
| `SBQQ__BlockPrice__c` | Pricing Procedure price nodes | `PricingProcedureStep` (price type) | Medium | Block pricing model mapping |
| `SBQQ__ContractedPrice__c` | Negotiated / Agreement Pricing | Pricing Procedure element (contract pricing flag) | Medium | RCA contracted pricing is procedure-driven (via List Operation Element with contract pricing checkbox), not standalone data records |
| `SBQQ__Quote__c` | Standard Quote (RCA-enhanced) | `Quote` (standard) | Medium | Custom → standard object. Field mapping required |
| `SBQQ__QuoteLine__c` | Transaction Line Items | `QuoteLineItem` (standard, enhanced) | Medium | Different field names and pricing waterfall |
| `SBQQ__QuoteTemplate__c` + sections | Document Generation | RCA-native doc gen or compatible | Medium | Template redesign usually needed |
| `SBQQ__ProductRule__c` (Type: Validation/Alert) | **CML** Constraint Rules | CML constraints via `ProductRule` | High | Validation/Alert rules → CML constraints. Must be re-evaluated for RCA's rule framework |
| `SBQQ__ProductRule__c` (Type: Selection) | **CML** Selection Rules | CML selection rules | High | Selection rules → CML selection logic |
| `SBQQ__ProductRule__c` (Type: Filter) | **Qualification Rule Procedures** | `QualificationProcedure`, BRE-driven Decision Tables | High | Filter rules → RCA Qualification Rules framework (separate from CML) |
| `SBQQ__Subscription__c` | Standard Subscription / ALM | `Subscription` (standard), Asset Lifecycle objects | Medium | Standard object alignment |
| `Order` + `OrderItem` (with SBQQ fields) | DRO / enhanced Order management | `Order`, `OrderItem` (standard, enhanced) | Medium | Order lifecycle redesign |
| `SBQQ__CustomAction__c` / Approval Processes | Approval orchestration | Flows + RCA-native approvals | Medium | Approval redesign |
| `SBQQ__ConsumptionSchedule__c` + Rates | Standard Consumption Schedules | `ConsumptionSchedule`, `ConsumptionRate` (standard) | Low-Medium | Direct standard object mapping |
| CPQ Package Settings (Custom Settings) | Revenue Settings / Pricing Setup | Salesforce Setup menus | Medium | Behavioral baseline for RCA configuration |
| **Context Definitions** (no CPQ equivalent) | Context Definitions | `ContextDefinition`, `ContextNode`, `ContextMapping` | N/A — new concept | Acts as a logical data model for data exchange between records and procedures. Build from fields referenced in pricing logic (see Section 6.14) |
| **Pricing Recipes** (no CPQ equivalent) | Pricing Recipes | `PricingRecipe` | N/A — new concept | Groups Decision Tables; only one active recipe per org. LookupQuery groupings inform Recipe structure |
| **BRE / Business Rule Engine** (no CPQ equivalent) | Business Rule Engine | BRE executes via Decision Tables + Procedures | N/A — new concept | Executes qualification, configuration, and pricing rules. CPQ ProductRule (Filter type) → BRE-driven qualification |

### 2.2 Key RCA Architectural Differences

1. **Attribute-Based Configuration:** CPQ's "flat" catalog (12 SKUs for color × size) → RCA's "hierarchical" model (1 product with Color + Size attributes via `AttributeDefinition` + `ProductAttributeDefinition`). RCA supports up to 200 attributes per product (expanded from 15). The extraction must identify products that are candidates for attribute consolidation. Product Classifications (`ProductClassification`) serve as reusable attribute templates across multiple products.

2. **Pricing Procedures + Pricing Recipes:** CPQ's Price Rules + QCP JavaScript → RCA's visual, declarative pricing procedure builder. Pricing Recipes group Decision Tables and ensure only linked tables are available during procedure execution (one active Recipe per org). Extraction must capture the full rule chain (rules → conditions → actions → variables) AND the LookupQuery→Rule parent relationships to inform Recipe structure.

3. **Business Rule Engine (BRE) + Hooks:** The BRE executes qualification, configuration, and pricing rules. CPQ Product Rules (Filter type) map to BRE-driven Qualification Rule Procedures, not CML. For custom logic that can't be made declarative, RCA provides **Apex Hooks** for Pricing Procedures (available Summer '25+), allowing developers to inject custom logic without breaking the overall flow — this is a more targeted mapping target for QCP code than a full rewrite.

4. **Context Definitions:** A new RCA concept with no CPQ equivalent. Context Definitions (`ContextDefinition`, `ContextNode`, `ContextMapping`) act as a logical data model defining how information is structured and exchanged between Salesforce records and procedures. They serve as the interface for data exchange and enable clean separation between business logic and data models. The fields participating in CPQ pricing logic (from Price Conditions, QCP, Summary Variables) inform what the RCA Context Definition needs to contain.

5. **Standard Objects:** RCA uses standard Salesforce objects (Quote, Order, Contract) with enhancements. CPQ uses custom objects (`SBQQ__Quote__c`). Field-level mapping between custom and standard is needed.

6. **Decision Tables + Sync Pricing Data:** CPQ's LookupQuery + LookupData → RCA's Decision Tables. Unlike CPQ's flat lookup data records, RCA Decision Tables reference live Salesforce objects and must be refreshed via "Sync Pricing Data" after configuration changes take effect. The extraction must capture not just the data but what source objects the lookup data conceptually represents.

7. **Pricing Waterfall:** RCA exposes the full pricing waterfall at the quote line level. Extraction must capture all CPQ pricing waterfall fields to verify mapping completeness. Contracted pricing in RCA is procedure-driven (via a List Operation Element with a contract pricing checkbox), not standalone data records.

### 2.3 Implications for Extraction

Every collector in this spec must:
1. Extract data in sufficient detail for RCA mapping (not just counting)
2. Tag findings with `migrationRelevance` using the mapping table above
3. Identify structural transformations needed (e.g., SKU consolidation candidates)
4. Flag items that have no direct RCA equivalent (require redesign)

---

## 3. Salesforce API Strategy

### 3.1 API Selection Matrix

| API | Use Case | When to Use | Rate Considerations |
|-----|----------|-------------|---------------------|
| **REST API** (`/services/data/vXX.0/`) | Small queries (<2,000 rows), org limits, single describes | Small record sets, aggregate queries | Counts against daily API limit (per-call) |
| **Composite Batch API** (`/services/data/vXX.0/composite/batch`) | Batching multiple REST requests | Discovery phase: bundle up to 25 Describe calls per request | Single API call, multiple sub-requests |
| **Bulk API 2.0** (`/services/data/vXX.0/jobs/query`) | Large record sets (>2,000 rows) | 90-day usage: quotes, quote lines, contracted prices, subscriptions | Separate bulk API limits; async job model |
| **Tooling API** (`/services/data/vXX.0/tooling/`) | Apex classes, triggers, validation rules, flow views, installed packages | Dependency scanning, code analysis, metadata queries | Counts against daily API limit |
| **Metadata API (SOAP)** | Full metadata retrieval: approval process steps, flow XML with element details, page layouts | Approval process structure, flow internals, layout analysis | Uses SOAP envelope; requires package.xml manifest for retrieve |

> **Audit fix (Auditor 2 #10):** The v1 spec incorrectly showed a REST-style call to `/metadata/read`. The Metadata API uses SOAP/WSDL (deploy/retrieve pattern), not REST endpoints. For queryable metadata (ValidationRule, FlowDefinitionView, WorkflowRule), use the **Tooling API**. For full metadata retrieval (approval process steps, flow XML with element details), use the **Metadata API via SOAP retrieve** which requires a zip manifest (package.xml). Consider using Tooling API exclusively where possible since it's simpler.

### 3.2 Composite Batch API for Discovery

> **Audit fix (Auditor 1 #4):** The v1 spec suggested iterating through 30-40 objects with individual REST calls. This is slow and "chatty."

Instead of individual Describe calls, batch them:

**Request:** `POST /services/data/v62.0/composite/batch`
```json
{
  "batchRequests": [
    { "method": "GET", "url": "v62.0/sobjects/Product2/describe" },
    { "method": "GET", "url": "v62.0/sobjects/SBQQ__Quote__c/describe" },
    { "method": "GET", "url": "v62.0/sobjects/SBQQ__QuoteLine__c/describe" }
  ]
}
```

- Maximum 25 sub-requests per batch call
- Chunk the list of CPQ objects into groups of 25
- **Impact:** Reduces Discovery phase from ~45 seconds (individual calls) to ~3 seconds (2 batched calls)
- Each sub-request returns its own status code — handle individual failures without aborting the batch

### 3.3 API Version

Use the API version detected during connection (stored in `salesforce_connections.metadata.apiVersion`). The existing audit service detects this. Minimum supported: **v55.0** (Summer '22 — CPQ objects stable from this version onward). Current recommended: **v62.0+**.

Before running extraction, verify the stored version is still supported by calling `GET /services/data/` (lists all supported versions). Salesforce retires API versions 3 years after release.

### 3.4 Authentication Pattern

All API calls use Bearer token authentication. On `401 Unauthorized`, attempt one token refresh via the stored refresh token. If refresh also fails, mark the connection as `expired` and abort the run with a clear error.

```
Authorization: Bearer {access_token}
```

### 3.5 Query Pagination

REST API SOQL queries return a maximum of 2,000 records per response. If `nextRecordsUrl` is present in the response, follow it to fetch all pages:

```json
{
  "done": false,
  "nextRecordsUrl": "/services/data/v62.0/query/01gxx0000000001-2000",
  "records": [...]
}
```

For Bulk API 2.0, results are streamed as CSV and may be split across multiple locator-based result sets (follow the `Sforce-Locator` header).

---

## 4. Prerequisite: Object & Field Discovery

> **API:** Composite Batch API for Describes, REST API for Describe Global and Limits
>
> **Purpose:** Before running any collector, discover which CPQ objects exist, which fields are accessible, extract Field Sets, and validate CPQ package settings. This handles namespace variations, package versions, and field-level security.

### Step 4.0: Org Fingerprint

> **Audit fix (Cross-reference audit, Gap #1):** The v2.0 spec did not include an explicit step to capture org identity information. The product spec (Section 3.1) requires capturing org ID, instance, environment type, and locale. This data is also needed for preflight (sandbox vs. production detection) and API budget estimation (edition determines daily API limit: 100K for Enterprise vs. 500K for Unlimited).

**Query:**
```sql
SELECT Id, Name, OrganizationType, InstanceName, IsSandbox,
       LanguageLocaleKey, DefaultLocaleSidKey, TimeZoneSidKey,
       TrialExpirationDate, Country
FROM Organization
```

**What to capture and store:**

| Field | Use |
|-------|-----|
| `Id` | Org ID — unique identifier for the assessment run |
| `Name` | Org name — display in reports |
| `OrganizationType` | Salesforce edition (Enterprise, Unlimited, etc.) — determines API limits |
| `InstanceName` | Instance (e.g., NA1, EU5) — included in org fingerprint |
| `IsSandbox` | Sandbox vs. production — affects data reliability assessment |
| `LanguageLocaleKey` | Default language — informs localization analysis |
| `DefaultLocaleSidKey` | Default locale — informs date/currency formatting |
| `TimeZoneSidKey` | Default timezone — run timestamp context |
| `TrialExpirationDate` | If not null, org is a trial — flag for assessment |
| `Country` | Org country — multi-region context |

This query runs as the **first step** of discovery, before Describe Global. The org fingerprint is stored with every assessment run and included in the evidence appendix.

### Step 4.1: Describe Global

**Endpoint:** `GET /services/data/vXX.0/sobjects/`

**What it returns:** A list of all SObject types visible to the connected user, with attributes like `queryable`, `createable`, `name`, `label`, `keyPrefix`.

**What to extract:**

```
For each object in the response:
  - name (API name)
  - label
  - queryable (boolean)
  - keyPrefix
  - custom (boolean)
```

**How to use it:**
1. Check for the presence of all required CPQ objects (see table below)
2. Detect the CPQ namespace — almost always `SBQQ__` but in rare cases could differ
3. Detect the Advanced Approvals namespace (`sbaa__`) if present
4. Identify any custom objects the customer has created (for Collector 5)
5. Detect Custom Metadata Types (`__mdt` suffix) for Collector 5
6. Record which objects are `queryable: true` vs `false`

### Step 4.2: Required Object Validation

Check for the presence of each object. If an object is missing, the corresponding collector runs in **degraded mode** (skips that object and logs a warning).

| Object API Name | Required For | Criticality | RCA Target | Notes |
|----------------|--------------|-------------|------------|-------|
| `Product2` | Catalog | **Required** | Product2 + Product Selling Model | Standard object, always present |
| `PricebookEntry` | Catalog/Pricing | **Required** | PricebookEntry (standard) | Standard object |
| `Pricebook2` | Catalog/Pricing | **Required** | Pricebook2 (standard) | Standard object |
| `SBQQ__ProductFeature__c` | Catalog (bundles) | High | PCM / Attribute-Based Config | Missing = no bundles configured |
| `SBQQ__ProductOption__c` | Catalog (bundles) | High | PCM / Product Compositions | Missing = no bundle options |
| `SBQQ__OptionConstraint__c` | Catalog (bundles) | Medium | CML / Constraint Rules | Missing = no option constraints |
| `SBQQ__ProductRule__c` | Catalog (rules) | High | CML / Product Rules | Product selection/validation rules |
| `SBQQ__ErrorCondition__c` | Catalog (rules) | Medium | CML conditions | Conditions for product rules |
| `SBQQ__ConfigurationAttribute__c` | Catalog (config) | High | **ProductAttribute** | Bundle config attributes → RCA attributes |
| `SBQQ__PriceRule__c` | Pricing | High | **Pricing Procedures** | Missing = no custom price rules |
| `SBQQ__PriceCondition__c` | Pricing | High | Pricing Procedure conditions | Conditions for price rules |
| `SBQQ__PriceAction__c` | Pricing | High | Pricing Procedure actions | Actions for price rules |
| `SBQQ__DiscountSchedule__c` | Pricing | High | Pricing Procedure discount logic | Volume/tiered discounts |
| `SBQQ__DiscountTier__c` | Pricing | High | Pricing Procedure tiers | Tiers within discount schedules |
| `SBQQ__BlockPrice__c` | Pricing | Medium | Pricing Procedure price nodes | Block pricing overrides |
| `SBQQ__ContractedPrice__c` | Pricing | Medium | Negotiated Prices / Agreement Pricing | Customer-specific pricing |
| `SBQQ__SummaryVariable__c` | Pricing | Medium | Pricing Procedure aggregate nodes | Aggregate variables used in rules |
| `SBQQ__CustomScript__c` | Pricing | **Critical** | Pricing Procedures (rewrite) | Quote Calculator Plugin scripts |
| `SBQQ__LookupQuery__c` | Pricing | Medium | **Decision Tables** | Lookup-based pricing queries |
| `SBQQ__LookupData__c` | Pricing | Medium | **Decision Tables** (data) | Lookup data records — **full extraction required** |
| `SBQQ__ConsumptionSchedule__c` | Pricing (usage-based) | Medium | Standard `ConsumptionSchedule` | Usage-based pricing schedules |
| `SBQQ__ConsumptionRate__c` | Pricing (usage-based) | Medium | Standard `ConsumptionRate` | Usage-based pricing rates |
| `SBQQ__Quote__c` | Quoting/Usage | **Required** | Standard `Quote` (RCA-enhanced) | Core CPQ object |
| `SBQQ__QuoteLine__c` | Quoting/Usage | **Required** | **Transaction Line Items** | Quote line items |
| `SBQQ__QuoteLineGroup__c` | Quoting | Medium | Transaction grouping | Quote line grouping |
| `SBQQ__QuoteDocument__c` | Templates | Medium | Document Generation | Generated quote documents |
| `SBQQ__QuoteTemplate__c` | Templates | High | Document Generation | Document templates |
| `SBQQ__TemplateContent__c` | Templates | Medium | Document Generation | Template content blocks |
| `SBQQ__TemplateSection__c` | Templates | Medium | Document Generation | Template section layout |
| `SBQQ__LineColumn__c` | Templates | Medium | Document Generation | Line item column configuration |
| `SBQQ__RelatedContent__c` | Templates | Low | Document Generation | Additional template content |
| `SBQQ__CustomAction__c` | Approvals | Medium | Flow-based approval orchestration | Custom CPQ actions/buttons |
| `SBQQ__Subscription__c` | Subscriptions | Medium | Standard Subscription / ALM | Subscription records |
| `SBQQ__SubscribedAsset__c` | Subscriptions | Low | Asset Lifecycle Management | Asset-subscription links |
| `SBQQ__WebQuote__c` | Quoting | Low | — | Web-published quotes |
| `SBQQ__SearchFilter__c` | Catalog | Low | PCM search config | Product search filters |
| `SBQQ__Term__c` | Templates | Medium | Document Generation | Quote terms and conditions |
| `SBQQ__Favorite__c` | Usage | Low | — | User favorites |
| `SBQQ__FavoriteProduct__c` | Usage | Low | — | Favorited products |
| `SBQQ__Localization__c` | Localization | Medium | Translation Workbench | CPQ-specific translations |

### Step 4.3: Per-Object Describe (via Composite Batch)

For each object that exists, call the Describe endpoint. **Batch these using the Composite Batch API** (Section 3.2) — chunk into groups of 25 objects per batch request.

**Endpoint:** `GET /services/data/vXX.0/sobjects/{ObjectName}/describe`

**What to extract per object:**

```
- fields[]: name, type, label, length, referenceTo, calculatedFormula,
            custom, nillable, picklistValues, defaultValue
- fieldSets[]: name, label, fields (list of field API names within each set)
- recordTypeInfos[]: name, recordTypeId, active
- childRelationships[]: childSObject, field, relationshipName
```

> **Audit fix (Auditor 1 #2):** The v1 spec did not extract `fieldSets`. CPQ uses Field Sets heavily (e.g., `SBQQ__LineEditor`, `SBQQ__SearchFilters`). RCA uses a different UI paradigm. We need to know which fields are in field sets to map them to RCA-specific attributes or layouts.

**How to use it:**
1. **Field availability check:** Before running any SOQL query, validate each field in the SELECT clause exists and is accessible. If a field is missing (removed, FLS restricted), drop it from the query and log a warning.
2. **Dynamic query construction:** Use the Describe results to build SOQL queries dynamically (see [Section 18](#18-dynamic-query-construction)). **Never hardcode field lists.**
3. **Custom field inventory:** Count custom fields (where `custom: true` AND NOT starting with `SBQQ__`) to measure customization depth.
4. **Formula field detection:** Fields with `calculatedFormula != null` indicate computed logic that may need migration.
5. **Relationship mapping:** `childRelationships` reveals which objects reference this one.
6. **Record type detection:** Multiple active record types indicate segmented business processes.
7. **Field Set inventory:** Capture which fields are in CPQ field sets — these define the CPQ UI configuration and must be mapped to RCA layouts.
8. **Twin Fields detection:** Map field API names across objects (Product2, QuoteLine, OrderItem, OpportunityLineItem). If `Custom_Field__c` exists on Product2 but not on QuoteLine, the auto-mapping breaks in CPQ — this is a specific readiness check.

### Step 4.4: Org Limits Check

**Endpoint:** `GET /services/data/vXX.0/limits/`

**What to extract:**

```json
{
  "DailyApiRequests": { "Max": 100000, "Remaining": 95000 },
  "DailyBulkV2QueryJobs": { "Max": 10000, "Remaining": 9990 },
  "DailyBulkV2QueryFileStorageMB": { "Max": 20000, "Remaining": 19900 },
  "ConcurrentAsyncGetReportInstances": { "Max": 200, "Remaining": 200 }
}
```

**Decision logic:**
- If `DailyApiRequests.Remaining < 5000`: warn, suggest off-hours run
- If `DailyApiRequests.Remaining < 1000`: block run, require user override
- If `DailyBulkV2QueryJobs.Remaining < 50`: warn about bulk extraction limits
- Store initial limits snapshot for post-run comparison and for determining actual concurrent bulk job limits (don't hardcode assumptions)

> **Important:** Salesforce documents that Limits values are accurate within approximately 5 minutes and may vary under rapid concurrent requests. Treat as advisory, not exact.

### Step 4.5: CPQ Package Version Detection

The existing `salesforce-audit.service.ts` already detects CPQ installation status. Extend to capture the exact package version, which affects available objects and fields.

**Query (Tooling API):**
```sql
SELECT Id, SubscriberPackageId, SubscriberPackage.Name,
       SubscriberPackage.NamespacePrefix,
       SubscriberPackageVersion.MajorVersion,
       SubscriberPackageVersion.MinorVersion,
       SubscriberPackageVersion.PatchVersion,
       SubscriberPackageVersion.BuildNumber
FROM InstalledSubscriberPackage
WHERE SubscriberPackage.NamespacePrefix = 'SBQQ'
```

> **Audit fix (Auditor 2 #5):** This query requires the **"Download AppExchange Packages"** permission, which is NOT commonly granted. Add this to the permissions checklist.
>
> **Fallback chain:**
> 1. Try `InstalledSubscriberPackage` query (requires Download AppExchange Packages permission)
> 2. If fails, try `SELECT Id, Name, NamespacePrefix FROM Publisher WHERE NamespacePrefix = 'SBQQ'` via Tooling API (lower permission requirements, less version detail)
> 3. If fails, check SBQQ namespace presence via Describe Global (confirms installation only, no version info)

**Also detect Advanced Approvals package:**
```sql
SELECT Id, SubscriberPackage.NamespacePrefix,
       SubscriberPackageVersion.MajorVersion,
       SubscriberPackageVersion.MinorVersion
FROM InstalledSubscriberPackage
WHERE SubscriberPackage.NamespacePrefix = 'sbaa'
```

**Also detect "phantom" packages that affect quote-to-cash:**
```sql
SELECT Id, SubscriberPackage.Name, SubscriberPackage.NamespacePrefix
FROM InstalledSubscriberPackage
WHERE SubscriberPackage.NamespacePrefix IN ('echosign_dev1', 'dsfs', 'Conga', 'loop')
```

> **Audit note (Auditor 1 — Phantom Packages):** Adobe Sign (EchoSign) or DocuSign objects linked to `SBQQ__Quote__c` affect quote-to-cash migration. If detected, flag as an integration dependency.

**Version implications:**
- Pre-v230: Some fields may be missing (e.g., `SBQQ__TermDiscountLevel__c` on `DiscountSchedule`)
- v232+: Quote Calculator Plugin v2 surfaces (`SBQQ__TranspiledCode__c`)
- v240+: Advanced approval chains
- v242+: Enhanced pricing waterfall fields
- v244+: Usage-based pricing fields

### Step 4.6: Data Size Estimation

> **Audit fix (Auditor 2 #22):** The v1 spec didn't estimate total data size before extraction.

After discovery, estimate total extraction size:

```sql
-- Run COUNT() for each object in scope
SELECT COUNT() FROM Product2
SELECT COUNT() FROM SBQQ__Quote__c WHERE CreatedDate >= LAST_N_DAYS:90
SELECT COUNT() FROM SBQQ__QuoteLine__c WHERE CreatedDate >= LAST_N_DAYS:90
-- ... for each object
```

**Estimate formula:** `recordCount × avgFieldCount × avgFieldSize`

Display the estimated data volume to the user before extraction starts. For large orgs (estimated > 500MB), warn about storage requirements and processing time.

**Runtime estimation inputs:** In addition to data volume, output a record count summary that the orchestrator uses to estimate runtime:

| Input | Source | Used For |
|-------|--------|----------|
| Record counts per object | COUNT() queries above | Determines REST vs. Bulk API path per collector |
| Bulk API job estimate | Count of objects exceeding 2,000 records | Each bulk job adds 30s-5min |
| REST call estimate | ~50-70 based on Section 17.1 budget table | At adaptive pacing, ~2-5 minutes |
| Org edition | Step 4.0 (OrganizationType) | Determines daily API limit (100K vs. 500K) |
| Current API headroom | Step 4.4 (Limits check) | May constrain parallelism |

The orchestrator combines these inputs to produce an estimated runtime range (e.g., "15-30 minutes") displayed to the user before extraction starts.

---

## 5. Collector 1: Product Catalog

> **API:** REST API for configuration data (<2,000 products), Bulk API 2.0 if >2,000 products
>
> **Purpose:** Inventory the product catalog, bundle structure, product rules, and catalog health. Identify candidates for RCA attribute-based configuration consolidation.
>
> **RCA mapping target:** Product2 + Product Selling Model + PCM + Attribute-Based Configuration

### 5.1 Products (Product2)

**Decision point:** After discovery, count products first:

```sql
SELECT COUNT() FROM Product2
```

If count > 2,000, use Bulk API 2.0. Otherwise, use REST API with pagination.

**Query construction:** Build the query dynamically from Describe results. The "wishlist" of desired SBQQ__ fields is:

```
-- Wishlist fields (filter against Describe before constructing query)
Id, Name, ProductCode, Family, Description, IsActive,
SBQQ__AssetAmendmentBehavior__c, SBQQ__AssetConversion__c,
SBQQ__BatchQuantity__c, SBQQ__BillingFrequency__c, SBQQ__BillingType__c,
SBQQ__BlockPricingField__c, SBQQ__ChargeType__c, SBQQ__Component__c,
SBQQ__ConfigurationType__c, SBQQ__ConfigurationEvent__c,
SBQQ__ConfigurationFieldSet__c, SBQQ__ConfigurationFormTitle__c,
SBQQ__ConfiguredCodePrefix__c, SBQQ__CostEditable__c,
SBQQ__DefaultQuantity__c, SBQQ__DescriptionLocked__c,
SBQQ__DiscountCategory__c, SBQQ__DiscountSchedule__c,
SBQQ__DynamicPricingConstraint__c, SBQQ__EnableLargeConfiguration__c,
SBQQ__ExcludeFromMaintenance__c, SBQQ__ExcludeFromOpportunity__c,
SBQQ__ExternallyConfigurable__c, SBQQ__GenerateContractedPrice__c,
SBQQ__HasConfigurationAttributes__c, SBQQ__HasConsumptionSchedule__c,
SBQQ__Hidden__c, SBQQ__HidePriceInSearchResults__c,
SBQQ__IncludeInMaintenance__c, SBQQ__NewQuoteGroup__c,
SBQQ__NonDiscountable__c, SBQQ__NonPartnerDiscountable__c,
SBQQ__Optional__c, SBQQ__OptionLayout__c, SBQQ__OptionSelectionMethod__c,
SBQQ__PriceEditable__c, SBQQ__PricingMethod__c,
SBQQ__PricingMethodEditable__c, SBQQ__QuantityEditable__c,
SBQQ__ReconfigurationDisabled__c, SBQQ__RenewalProduct__c,
SBQQ__SortOrder__c, SBQQ__SubscriptionBase__c,
SBQQ__SubscriptionCategory__c, SBQQ__SubscriptionPricing__c,
SBQQ__SubscriptionTerm__c, SBQQ__SubscriptionType__c,
SBQQ__Taxable__c, SBQQ__TermDiscountSchedule__c,
CreatedDate, LastModifiedDate
```

> **Audit fix (Auditor 2 #11, #19):** Do NOT hardcode this as a literal SOQL query. If you hardcode `SBQQ__TermDiscountLevel__c` and the client is on CPQ v218, the entire collector fails. Instead:
> 1. **Describe** the object (from Step 4.3 cache)
> 2. **Filter** the Describe result against the wishlist above
> 3. **Construct** the query string dynamically: `SELECT [SafeFields] FROM Product2 ORDER BY Name ASC`
>
> If the wishlist produces a QUERY_TOO_COMPLICATED error (too many formula fields), split into two queries: core fields + extended fields, join by ID in the application layer.

**Why all these fields:** Each SBQQ__ field represents a CPQ configuration decision. For RCA mapping we need to know:
- **Subscription model:** `ChargeType`, `BillingType`, `BillingFrequency`, `SubscriptionPricing`, `SubscriptionType` — determines RCA Product Selling Model
- **Bundle configuration:** `ConfigurationType`, `ConfigurationEvent`, `Component`, `Optional` — determines RCA attribute-based config approach
- **Pricing behavior:** `PricingMethod`, `BlockPricingField`, `DiscountSchedule`, `NonDiscountable` — determines Pricing Procedure complexity
- **Active/dormant:** `IsActive` + `LastModifiedDate` — cleanup recommendation input
- **Product families:** `Family` — product segmentation for concentration analysis

**Derived metrics:**

| Metric | Computation | RCA Relevance |
|--------|-------------|---------------|
| `totalProducts` | COUNT of all Product2 records | Catalog size for RCA planning |
| `activeProducts` | COUNT WHERE IsActive = true | Active catalog scope |
| `dormantProducts` | COUNT WHERE IsActive = false | Cleanup candidates |
| `staleDormantProducts` | Inactive AND LastModifiedDate < 1 year ago | Strong cleanup candidates |
| `bundleProducts` | COUNT WHERE ConfigurationType IN ('Required', 'Allowed') | Candidates for RCA PCM conversion |
| `subscriptionProducts` | COUNT WHERE SubscriptionType IS NOT NULL | Product Selling Model mapping |
| `productFamilyDistribution` | GROUP BY Family | Product segmentation |
| `pricingMethodDistribution` | GROUP BY PricingMethod | Pricing Procedure complexity |
| `chargeTypeDistribution` | GROUP BY ChargeType | Product Selling Model selection |
| `billingTypeDistribution` | GROUP BY BillingType | Revenue recognition mapping |
| `dynamicPricingCount` | COUNT WHERE PricingMethod = 'Dynamic' | High-complexity pricing |
| `blockPricingCount` | COUNT WHERE BlockPricingField IS NOT NULL | Block pricing migration |
| `externallyConfigurableCount` | COUNT WHERE ExternallyConfigurable = true | External config integration |
| `skuConsolidationCandidates` | Products with identical ConfigurationType, same parent ProductFeature structure, and differing only in a small set of picklist field values. Also: products with same Family + Name pattern (e.g., "Widget - Small", "Widget - Medium", "Widget - Large") | **Key RCA metric:** How many flat SKUs can become one attribute-based product |
| `productSellingModelCandidates` | DISTINCT combinations of (SubscriptionType, SubscriptionTerm, BillingFrequency, ChargeType) across active products | **Key RCA metric:** Each unique combo becomes a `ProductSellingModel` record. >10-15 unique combos flags a PSM simplification opportunity |

### 5.2 Product Features (SBQQ__ProductFeature__c)

Features define the grouping of options within a configurable bundle.

```
-- Wishlist (construct dynamically)
Id, Name, SBQQ__ConfiguredSKU__c, SBQQ__Category__c,
SBQQ__MinOptionCount__c, SBQQ__MaxOptionCount__c,
SBQQ__Number__c, SBQQ__OptionSelectionMethod__c
ORDER BY SBQQ__ConfiguredSKU__c, SBQQ__Number__c
```

**Derived metrics:**

| Metric | Computation |
|--------|-------------|
| `totalFeatures` | COUNT |
| `featuresPerBundle` | GROUP BY ConfiguredSKU → distribution |
| `constrainedFeatures` | COUNT WHERE MinOptionCount > 0 OR MaxOptionCount IS NOT NULL |

### 5.3 Product Options (SBQQ__ProductOption__c)

Options are the child products within a bundle.

```
-- Wishlist (construct dynamically)
Id, Name, SBQQ__ConfiguredSKU__c, SBQQ__OptionalSKU__c,
SBQQ__Feature__c, SBQQ__Number__c, SBQQ__Quantity__c,
SBQQ__QuantityEditable__c, SBQQ__Required__c, SBQQ__Selected__c,
SBQQ__Type__c, SBQQ__Bundled__c, SBQQ__DiscountedByPackage__c,
SBQQ__PriceEditable__c, SBQQ__UpliftedByPackage__c,
SBQQ__ExistingQuantity__c, SBQQ__ProductName__c,
SBQQ__AppliedImmediately__c, SBQQ__SubscriptionScope__c
ORDER BY SBQQ__ConfiguredSKU__c, SBQQ__Number__c
```

**Derived metrics:**

| Metric | Computation |
|--------|-------------|
| `totalOptions` | COUNT |
| `optionsPerBundle` | GROUP BY ConfiguredSKU → mean, max, distribution |
| `maxBundleDepth` | Recursive: options whose OptionalSKU is itself a bundle (nested bundles) |
| `requiredOptions` | COUNT WHERE Required = true |
| `bundledPricingOptions` | COUNT WHERE Bundled = true |

**Gotcha — Nested bundles:** An option's `SBQQ__OptionalSKU__c` may itself be a bundle product (has its own features/options). Detect this by cross-referencing with Product2 records where `SBQQ__ConfigurationType__c` is not null. Maximum nesting depth is a key complexity signal. CPQ supports up to 3 levels of nesting in practice; deeper nesting is rare but signals high complexity.

### 5.4 Option Constraints (SBQQ__OptionConstraint__c)

```
-- Wishlist
Id, SBQQ__ConfiguredSKU__c, SBQQ__ConstrainingOption__c,
SBQQ__ConstrainedOption__c, SBQQ__Type__c, SBQQ__Active__c,
SBQQ__OptionGroup__c
```

**RCA mapping:** Option constraints → CML constraint rules.

### 5.5 Product Rules (SBQQ__ProductRule__c)

```
-- Wishlist
Id, Name, SBQQ__Active__c, SBQQ__Type__c, SBQQ__Scope__c,
SBQQ__EvaluationEvent__c, SBQQ__EvaluationOrder__c,
SBQQ__ConditionsMet__c, SBQQ__ErrorMessage__c, SBQQ__Product__c,
SBQQ__LookupObject__c, SBQQ__LookupProductField__c,
SBQQ__LookupMessageField__c, SBQQ__LookupRequiredField__c,
SBQQ__LookupTypeField__c
```

**RCA mapping:** Product rules → CML / RCA Product Rules. Note: Instead of copying old rules, the logic must be re-evaluated and redesigned to fit RCA's rule framework.

**Derived metrics:**

| Metric | Computation |
|--------|-------------|
| `totalProductRules` | COUNT |
| `activeProductRules` | COUNT WHERE Active = true |
| `ruleTypeDistribution` | GROUP BY Type (Validation, Selection, Alert, Filter) |
| `ruleScopeDistribution` | GROUP BY Scope (Product, Quote) |
| `lookupRules` | COUNT WHERE LookupObject IS NOT NULL |

### 5.6 Error Conditions (SBQQ__ErrorCondition__c)

```
-- Wishlist
Id, SBQQ__Rule__c, SBQQ__Filter__c, SBQQ__FilterType__c,
SBQQ__FilterValue__c, SBQQ__FilterVariable__c, SBQQ__Index__c,
SBQQ__Operator__c, SBQQ__TestedField__c, SBQQ__TestedObject__c,
SBQQ__TestedVariable__c
```

### 5.7 Configuration Attributes (SBQQ__ConfigurationAttribute__c)

> **RCA mapping (Auditor 1 #12, Auditor 2 #1):** This is a critical extraction for RCA. Configuration Attributes map directly to RCA's **ProductAttribute** object. If a product has >10 attributes, this flags a need for "Attribute Sets" in RCA to avoid UI clutter.

```
-- Wishlist
Id, Name, SBQQ__Product__c, SBQQ__Feature__c,
SBQQ__TargetField__c, SBQQ__Required__c,
SBQQ__AppliedImmediately__c, SBQQ__ColumnOrder__c,
SBQQ__DisplayOrder__c, SBQQ__Hidden__c,
SBQQ__Position__c, SBQQ__Shippable__c
```

**Derived metrics:**

| Metric | Computation | RCA Relevance |
|--------|-------------|---------------|
| `totalConfigAttributes` | COUNT | Scale of attribute migration |
| `attributesPerProduct` | GROUP BY Product → distribution | >10 per product → needs Attribute Sets in RCA |
| `hiddenAttributes` | COUNT WHERE Hidden = true | May not need migration |

### 5.8 Search Filters (SBQQ__SearchFilter__c)

```
-- Wishlist
Id, Name, SBQQ__TargetObject__c, SBQQ__TargetField__c,
SBQQ__Operator__c, SBQQ__FilterValue__c,
SBQQ__FilterSourceField__c, SBQQ__FilterSourceObject__c
```

### 5.9 Twin Fields Analysis

> **Audit addition (Auditor 1 — Twin Fields):** CPQ relies on "Twin Fields" — fields with the same API name across Product2, QuoteLine, OrderItem, and OpportunityLineItem. If a custom field exists on one but not the others, auto-mapping breaks.

**Post-extraction analysis:** After collecting Describe data for Product2, SBQQ__QuoteLine__c, OrderItem, and OpportunityLineItem, build a cross-object field name map:

```
For each custom field on Product2 (non-SBQQ__):
  - Check if same API name exists on SBQQ__QuoteLine__c
  - Check if same API name exists on OrderItem
  - Check if same API name exists on OpportunityLineItem
  - Flag mismatches as "Twin Field Gap"
```

**Derived metric:** `twinFieldGaps` — count of custom fields present on Product2 but missing on QuoteLine/OrderItem/OLI.

---

## 6. Collector 2: Pricing Configuration

> **API:** REST API (pricing config is typically <2,000 records per object), Bulk API 2.0 for large datasets
>
> **Purpose:** Inventory all pricing rules, discount schedules, block prices, contracted prices, summary variables, consumption schedules, lookup data, and custom pricing scripts
>
> **RCA mapping target:** Pricing Procedures + Decision Tables + Negotiated Prices

### 6.1 Price Rules (SBQQ__PriceRule__c)

Price rules fire during quote calculation to modify quote line values. In RCA, these map to **Pricing Procedure** nodes.

```
-- Wishlist
Id, Name, SBQQ__Active__c, SBQQ__ConditionsMet__c,
SBQQ__ConfiguratorEvaluationEvent__c, SBQQ__EvaluationEvent__c,
SBQQ__EvaluationOrder__c, SBQQ__LookupObject__c,
SBQQ__Product__c, SBQQ__Scope__c, SBQQ__TargetObject__c,
SBQQ__Calculator__c, SBQQ__Configurator__c
```

**Derived metrics:**

| Metric | Computation |
|--------|-------------|
| `totalPriceRules` | COUNT |
| `activePriceRules` | COUNT WHERE Active = true |
| `calculatorRules` | COUNT WHERE Calculator = true |
| `configuratorRules` | COUNT WHERE Configurator = true |
| `lookupPriceRules` | COUNT WHERE LookupObject IS NOT NULL |
| `evaluationEventDistribution` | GROUP BY EvaluationEvent |
| `scopeDistribution` | GROUP BY Scope |

### 6.2 Price Conditions (SBQQ__PriceCondition__c)

```
-- Wishlist
Id, SBQQ__Rule__c, SBQQ__Field__c, SBQQ__Object__c,
SBQQ__Operator__c, SBQQ__Value__c, SBQQ__FilterType__c,
SBQQ__FilterVariable__c, SBQQ__FilterFormula__c, SBQQ__Index__c,
SBQQ__TestedField__c, SBQQ__TestedVariable__c,
SBQQ__ConcatenateResultsWith__c
```

### 6.3 Price Actions (SBQQ__PriceAction__c)

```
-- Wishlist
Id, SBQQ__Rule__c, SBQQ__Field__c, SBQQ__Formula__c,
SBQQ__Order__c, SBQQ__SourceLookupField__c,
SBQQ__SourceVariable__c, SBQQ__TargetObject__c,
SBQQ__Value__c, SBQQ__ValueField__c
```

### 6.4 Discount Schedules (SBQQ__DiscountSchedule__c)

```
-- Wishlist
Id, Name, SBQQ__Account__c, SBQQ__AggregationScope__c,
SBQQ__CrossOrders__c, SBQQ__CrossProducts__c,
SBQQ__DiscountUnit__c, SBQQ__ExceedsBehavior__c,
SBQQ__OverrideBehavior__c, SBQQ__PriceScale__c,
SBQQ__Product__c, SBQQ__QuoteLineQuantityField__c,
SBQQ__ScheduleType__c, SBQQ__Type__c,
SBQQ__UsePriorQuantity__c
```

### 6.5 Discount Tiers (SBQQ__DiscountTier__c)

```
-- Wishlist
Id, Name, SBQQ__Schedule__c, SBQQ__Discount__c,
SBQQ__LowerBound__c, SBQQ__UpperBound__c, SBQQ__Price__c
ORDER BY SBQQ__Schedule__c, SBQQ__LowerBound__c
```

**Derived metrics:**

| Metric | Computation |
|--------|-------------|
| `totalDiscountSchedules` | COUNT of schedules |
| `totalDiscountTiers` | COUNT of tiers |
| `tiersPerSchedule` | GROUP BY Schedule → mean, max |
| `scheduleTypeDistribution` | GROUP BY Type (Range, Slab) |
| `crossProductSchedules` | COUNT WHERE CrossProducts = true |
| `accountSpecificSchedules` | COUNT WHERE Account IS NOT NULL |

### 6.6 Block Prices (SBQQ__BlockPrice__c)

```
-- Wishlist
Id, Name, SBQQ__Product__c, SBQQ__LowerBound__c,
SBQQ__UpperBound__c, SBQQ__Price__c, SBQQ__PricebookEntry__c,
SBQQ__OveragePrice__c, SBQQ__OverageRate__c
ORDER BY SBQQ__Product__c, SBQQ__LowerBound__c
```

### 6.7 Contracted Prices (SBQQ__ContractedPrice__c)

Customer-specific negotiated prices. High volume in some orgs. Maps to RCA **Negotiated Prices / Agreement Pricing**.

```
-- Wishlist
Id, SBQQ__Account__c, SBQQ__Product__c, SBQQ__Discount__c,
SBQQ__Price__c, SBQQ__EffectiveDate__c, SBQQ__ExpirationDate__c,
SBQQ__OriginalQuoteLine__c, SBQQ__FilterField__c,
SBQQ__FilterValue__c, SBQQ__Operator__c
```

**Decision point:** If `COUNT() > 2000`, switch to Bulk API 2.0.

**Derived metrics:**

> **Audit fix (Cross-reference audit, Gap #2):** These metrics existed in v1 but were dropped during v2 restructuring. The product spec explicitly requires "customer-specific pricing footprint."

| Metric | Computation |
|--------|-------------|
| `totalContractedPrices` | COUNT |
| `activeContractedPrices` | COUNT WHERE ExpirationDate IS NULL OR ExpirationDate > TODAY |
| `expiredContractedPrices` | COUNT WHERE ExpirationDate < TODAY |
| `uniqueAccountsWithContractedPrices` | COUNT DISTINCT Account |
| `uniqueProductsWithContractedPrices` | COUNT DISTINCT Product |
| `contractedPricesByAccount` | GROUP BY Account → distribution (top N accounts by count) |

### 6.8 Summary Variables (SBQQ__SummaryVariable__c)

Summary variables aggregate values across quote lines. In RCA, these map to **Pricing Procedure aggregate nodes**.

```
-- Wishlist
Id, Name, SBQQ__AggregateField__c, SBQQ__AggregateFunction__c,
SBQQ__CombineWith__c, SBQQ__CompositeOperator__c,
SBQQ__FilterField__c, SBQQ__FilterValue__c, SBQQ__Operator__c,
SBQQ__Scope__c, SBQQ__SubScope__c, SBQQ__TargetObject__c,
SBQQ__Value__c
```

### 6.9 Custom Scripts / Quote Calculator Plugin (SBQQ__CustomScript__c)

The QCP is JavaScript that runs during quote calculation. This is the **highest-complexity migration item** — maps to RCA Pricing Procedures (custom logic nodes) and requires a full rewrite.

```
-- Wishlist
Id, Name, SBQQ__GroupFields__c, SBQQ__QuoteFields__c,
SBQQ__QuoteLineFields__c, SBQQ__TranspiledCode__c,
SBQQ__Code__c
```

**Important:** The `SBQQ__Code__c` and `SBQQ__TranspiledCode__c` fields contain the actual JavaScript source code. Extract and store for code scanning.

**Post-extraction code analysis — parse QCP source for:**
- References to `SBQQ__` field names
- References to custom field names (`__c` suffix)
- HTTP callout patterns (`fetch`, `XMLHttpRequest`)
- `conn.query()` patterns (SOQL from within QCP)
- Custom Metadata Type references (`__mdt`)
- External service URLs

**Derived metrics:**

| Metric | Computation |
|--------|-------------|
| `totalCustomScripts` | COUNT |
| `scriptCodeLineCount` | Line count of Code per script |
| `referencedQuoteFields` | Parse QuoteFields (comma-separated) |
| `referencedQuoteLineFields` | Parse QuoteLineFields (comma-separated) |
| `externalCalloutCount` | Count of HTTP/fetch patterns in code |
| `customMetadataReferences` | Count of `__mdt` references in code |

### 6.10 Lookup Queries (SBQQ__LookupQuery__c)

> **Audit fix (Reviewer 2, Issue #3):** Preserve the LookupQuery → PriceRule/ProductRule parent relationship. This relationship determines how Decision Tables are grouped into Pricing Recipes in RCA.

```
-- Wishlist
Id, SBQQ__MatchType__c, SBQQ__Operator__c,
SBQQ__PriceRule2__c, SBQQ__ProductRule__c,
SBQQ__TestedField__c, SBQQ__TestedObject__c,
SBQQ__TestedValue__c
```

**Post-extraction analysis:** For each LookupQuery, record its parent relationship (`PriceRule2__c` or `ProductRule__c`). Group LookupQueries by parent rule — these groupings inform which Decision Tables belong to the same Pricing Recipe in RCA.

### 6.11 Lookup Data (SBQQ__LookupData__c) — FULL EXTRACTION

> **Audit fix (Auditor 2 #2):** The v1 spec said "count only." This is wrong for migration-focused extraction. Lookup data in CPQ maps directly to **Decision Tables** in RCA. You need the actual data values to build those tables. This is configuration data, not transactional data.

```
-- Wishlist: ALL fields (construct dynamically from Describe)
SELECT [all accessible fields] FROM SBQQ__LookupData__c
```

**Decision point:** Use Bulk API 2.0 if count > 2,000 (common for lookup data).

**Post-extraction analysis:** For each LookupQuery, identify what "source object" the lookup data conceptually represents. This helps the migration engineer determine whether to create a custom object + Decision Table, or map to an existing standard object in RCA. Remember: RCA Decision Tables reference live Salesforce objects and must be refreshed via "Sync Pricing Data" — the data architecture is fundamentally different from CPQ's flat lookup records.

**Derived metrics:**

| Metric | Computation |
|--------|-------------|
| `totalLookupDataRecords` | COUNT |
| `lookupDataByQuery` | GROUP BY parent LookupQuery |
| `uniqueFieldsUsed` | Distinct fields referenced across all lookup data |
| `lookupQueryToRuleMapping` | Map of LookupQuery → parent PriceRule/ProductRule (for Recipe grouping) |

### 6.12 Consumption Schedules (SBQQ__ConsumptionSchedule__c + SBQQ__ConsumptionRate__c)

> **Audit addition (Auditor 1 #3, Auditor 2 #16):** If the customer uses Usage-Based Pricing, they likely use these objects. RCA uses the standard `ConsumptionSchedule` object.

```
-- Wishlist: ConsumptionSchedule
Id, Name, SBQQ__BillingTerm__c, SBQQ__BillingTermUnit__c,
SBQQ__Category__c, SBQQ__RatingMethod__c, SBQQ__Type__c,
SBQQ__UnitOfMeasure__c, SBQQ__MatchingAttribute__c
```

```
-- Wishlist: ConsumptionRate (child records)
Id, SBQQ__ConsumptionSchedule__c, SBQQ__LowerBound__c,
SBQQ__UpperBound__c, SBQQ__Price__c, SBQQ__PricingMethod__c,
SBQQ__ProcessingOrder__c
```

**Also check for standard ConsumptionSchedule/ConsumptionRate objects** (newer orgs may use these instead of SBQQ__ versions):

```sql
SELECT COUNT() FROM ConsumptionSchedule
SELECT COUNT() FROM ConsumptionRate
```

### 6.14 Context Definition Blueprint (Derived Analysis)

> **Audit fix (Reviewer 2, Issue #4):** Context Definitions are a new RCA concept with no CPQ equivalent. However, the data needed to *build* them exists across the extraction. This analysis step inventories all fields that participate in pricing logic to produce a blueprint for the RCA `SalesTransactionContext`.

**Post-extraction analysis:** After all pricing-related collectors complete, aggregate:

1. **Fields from Price Conditions:** All `SBQQ__TestedField__c` + `SBQQ__Field__c` values from `SBQQ__PriceCondition__c`
2. **Fields from Price Actions:** All `SBQQ__Field__c` + `SBQQ__TargetObject__c` values from `SBQQ__PriceAction__c`
3. **Fields from Summary Variables:** All `SBQQ__AggregateField__c` + `SBQQ__FilterField__c` values from `SBQQ__SummaryVariable__c`
4. **Fields from QCP code:** All `SBQQ__` and custom `__c` field references parsed from `SBQQ__CustomScript__c.SBQQ__Code__c`
5. **Fields from Product Rule conditions:** All `SBQQ__TestedField__c` values from `SBQQ__ErrorCondition__c`

**Output:** A deduplicated inventory of (ObjectName, FieldName) tuples that participate in pricing logic. This becomes the basis for the RCA Context Definition's `ContextNode` and `ContextMapping` configuration.

**Derived metrics:**

| Metric | Computation |
|--------|-------------|
| `contextFieldCount` | COUNT of unique (Object, Field) tuples across all pricing logic |
| `contextObjectCount` | COUNT of distinct objects referenced in pricing logic |
| `quoteFieldsInPricing` | Fields on SBQQ__Quote__c used in conditions/actions/QCP |
| `quoteLineFieldsInPricing` | Fields on SBQQ__QuoteLine__c used in conditions/actions/QCP |
| `customFieldsInPricing` | Non-SBQQ custom fields participating in pricing logic |

### 6.15 Pricing Complexity Score Inputs

| Signal | Weight Rationale | RCA Mapping |
|--------|-----------------|-------------|
| Price rule count (active) | More rules = more migration effort | Pricing Procedure nodes |
| Summary variable count | Cross-line computation complexity | Pricing Procedure aggregates |
| QCP presence and code size | Highest complexity: custom JavaScript | Pricing Procedure custom logic (rewrite) |
| Discount schedule count and type diversity | Volume/slab pricing mapping | Pricing Procedure discount nodes |
| Block pricing usage | Non-standard pricing model | Pricing Procedure price nodes |
| Contracted price volume | Customer-specific pricing data migration | Negotiated Prices |
| Lookup-based rules + full data | Data-dependent pricing logic | **Decision Tables** |
| Cross-product/cross-order discounts | Multi-object aggregation complexity | Pricing Procedure |
| Formula-based conditions/actions | Dynamic computation migration | Pricing Procedure |
| Consumption schedules | Usage-based pricing | Standard ConsumptionSchedule |

---

## 7. Collector 3: Quote Templates & Documents

> **API:** REST API
>
> **Purpose:** Inventory document generation configuration without invoking actual document generation. Identify document/image dependencies that may break during migration.
>
> **RCA mapping target:** Document Generation (RCA-native or compatible)

### 7.1 Quote Templates (SBQQ__QuoteTemplate__c)

```
-- Wishlist
Id, Name, SBQQ__Default__c, SBQQ__FontFamily__c, SBQQ__FontSize__c,
SBQQ__GroupName__c, SBQQ__HeaderHeight__c, SBQQ__FooterHeight__c,
SBQQ__PageHeight__c, SBQQ__PageWidth__c, SBQQ__TopMargin__c,
SBQQ__BottomMargin__c, SBQQ__BorderColor__c, SBQQ__ShadingColor__c,
SBQQ__CompanyName__c, SBQQ__CompanyPhone__c, SBQQ__CompanySlogan__c,
SBQQ__LogoDocument__c, SBQQ__WatermarkId__c,
CreatedDate, LastModifiedDate
```

### 7.2 Template Sections (SBQQ__TemplateSection__c)

```
-- Wishlist
Id, Name, SBQQ__Template__c, SBQQ__Content__c,
SBQQ__ConditionalPrintField__c, SBQQ__DisplayOrder__c,
SBQQ__SectionType__c, SBQQ__PageBreakBefore__c,
SBQQ__BorderColor__c, SBQQ__ShadingColor__c
ORDER BY SBQQ__Template__c, SBQQ__DisplayOrder__c
```

### 7.3 Template Content (SBQQ__TemplateContent__c)

```
-- Wishlist
Id, Name, SBQQ__FontFamily__c, SBQQ__FontSize__c,
SBQQ__Markup__c, SBQQ__RawMarkup__c, SBQQ__Type__c
```

**Merge field extraction — explicit regex patterns:**

> **Audit fix (Auditor 2 #8):** The v1 spec said to "parse for merge field references" but didn't specify the patterns. CPQ templates can contain multiple merge field syntaxes.

Parse `SBQQ__Markup__c` and `SBQQ__RawMarkup__c` with these patterns:

| Pattern | Regex | Example |
|---------|-------|---------|
| Standard merge field | `\{!(\w+)\.(\w+)\}` | `{!SBQQ__QuoteLine__c.SBQQ__NetPrice__c}` |
| Relationship traversal | `\{!(\w+)\.(\w+__r)\.(\w+)\}` | `{!SBQQ__Quote__c.SBQQ__Account__r.Name}` |
| Label reference | `\{\!\$ObjectType\.(\w+)\.Fields\.(\w+)\.Label\}` | `{!$ObjectType.SBQQ__QuoteLine__c.Fields.SBQQ__NetPrice__c.Label}` |
| JavaScript blocks | `<script[\s\S]*?<\/script>` | Any `<script>` in template content |

Store parsed results in a structured format:
```typescript
interface MergeFieldRef {
  objectName: string;
  fieldName: string;
  relationshipPath?: string;  // e.g., "SBQQ__Account__r.Name"
  source: string;  // which template content record
}
```

Also **flag any JavaScript `<script>` blocks** in template content — these are high-risk for migration.

### 7.4 Line Columns (SBQQ__LineColumn__c)

```
-- Wishlist
Id, Name, SBQQ__Template__c, SBQQ__FieldName__c,
SBQQ__DisplayOrder__c, SBQQ__SummaryDisplayType__c,
SBQQ__Width__c, SBQQ__Alignment__c,
SBQQ__ConditionalAppearanceField__c,
SBQQ__ConditionalAppearanceFilter__c, SBQQ__ShadingColor__c
ORDER BY SBQQ__Template__c, SBQQ__DisplayOrder__c
```

### 7.5 Quote Terms (SBQQ__Term__c)

```
-- Wishlist
Id, Name, SBQQ__Active__c, SBQQ__Body__c, SBQQ__PrintOrder__c,
SBQQ__ConditionalPrintField__c, SBQQ__ConditionalPrintValue__c,
SBQQ__StandardTerm__c
```

### 7.6 Related Content (SBQQ__RelatedContent__c)

```
-- Wishlist
Id, Name, SBQQ__DisplayOrder__c, SBQQ__ExternalDocumentUrl__c,
SBQQ__OpportunityProductField__c, SBQQ__Product__c,
SBQQ__QuoteDocumentId__c, SBQQ__Required__c,
SBQQ__TemplateSection__c
```

### 7.7 Quote Documents — Count Only (SBQQ__QuoteDocument__c)

```
-- Wishlist
Id, SBQQ__Template__c, SBQQ__Quote__c, SBQQ__Version__c, CreatedDate
WHERE CreatedDate >= LAST_N_DAYS:90
ORDER BY CreatedDate DESC
```

**Decision point:** If count > 2,000, use Bulk API 2.0.

### 7.8 Document & Image References

> **Audit addition (Auditor 1 — Documents/Images):** Templates often break during migration because they reference `Document` or `StaticResource` IDs that don't map cleanly. RCA uses Salesforce Files.

**Step 1:** Extract Document IDs referenced in template content (parsed from SBQQ__LogoDocument__c, SBQQ__WatermarkId__c, and merge fields in markup).

**Step 2:** For each referenced Document ID:
```sql
SELECT Id, Name, Type, ContentType, BodyLength, FolderId
FROM Document
WHERE Id IN ({referenced IDs})
```

We don't need the binary data — only metadata (size, type) to determine Salesforce Files compatibility.

**Derived metrics:**

| Metric | Computation |
|--------|-------------|
| `totalTemplates` | COUNT of QuoteTemplate |
| `sectionsPerTemplate` | GROUP BY Template → distribution |
| `templatesUsedLast90Days` | DISTINCT Template from QuoteDocument WHERE CreatedDate >= LAST_N_DAYS:90 |
| `unusedTemplates` | Templates with zero documents in 90 days |
| `conditionalSections` | COUNT WHERE ConditionalPrintField IS NOT NULL |
| `totalTerms` | COUNT of Term |
| `conditionalTerms` | COUNT WHERE ConditionalPrintField IS NOT NULL |
| `mergeFieldsUsed` | Parsed from template content markup (structured) |
| `javaScriptBlockCount` | COUNT of `<script>` blocks in template content |
| `externalDocumentReferences` | COUNT WHERE ExternalDocumentUrl IS NOT NULL in RelatedContent |
| `documentDependencies` | COUNT of referenced Document/StaticResource IDs |

---

## 8. Collector 4: Approval Processes

> **API:** REST API + Tooling API + Metadata API (SOAP)
>
> **Purpose:** Inventory approval complexity including CPQ-native approvals, standard Salesforce approval processes, and Advanced Approvals (sbaa__)
>
> **RCA mapping target:** Flow-based approval orchestration

### 8.1 CPQ Custom Actions (SBQQ__CustomAction__c)

```
-- Wishlist
Id, Name, SBQQ__Active__c, SBQQ__Type__c, SBQQ__DisplayOrder__c,
SBQQ__Location__c, SBQQ__TargetObject__c, SBQQ__TargetField__c,
SBQQ__TargetValue__c, SBQQ__ConditionsMet__c, SBQQ__Label__c,
SBQQ__Description__c, SBQQ__Default__c
```

### 8.2 CPQ Custom Action Conditions (SBQQ__CustomActionCondition__c)

```
-- Wishlist
Id, SBQQ__CustomAction__c, SBQQ__Field__c, SBQQ__Object__c,
SBQQ__Operator__c, SBQQ__FilterValue__c, SBQQ__FilterType__c,
SBQQ__FilterVariable__c, SBQQ__TestedField__c,
SBQQ__TestedObject__c, SBQQ__TestedVariable__c
```

### 8.3 Standard Approval Processes

**Via Tooling API (for inventory):**
```sql
SELECT Id, Name, TableEnumOrId, Description, Active
FROM ProcessDefinition
WHERE TableEnumOrId IN ('SBQQ__Quote__c', 'Opportunity', 'Order')
```

**Via Metadata API SOAP retrieve (for full structure including steps):**

To get approval process steps, entry criteria, and approver assignments, use the Metadata API retrieve with a `package.xml` manifest:

```xml
<Package>
  <types>
    <members>SBQQ__Quote__c.*</members>
    <members>Opportunity.*</members>
    <members>Order.*</members>
    <name>ApprovalProcess</name>
  </types>
  <version>62.0</version>
</Package>
```

**What to capture from the retrieved metadata:**
- Process name and object
- Whether it's active
- Number of steps
- Entry criteria complexity (field conditions, formula criteria)
- Step-level approver assignments
- Whether it involves CPQ objects (SBQQ__Quote__c specifically)

### 8.4 Advanced Approvals (sbaa__ namespace)

> **Audit fix (Auditor 2 #6):** The v1 spec queried `sbaa__Approval__c` (runtime records) instead of the approval configuration objects.

If the `sbaa__` namespace is detected during discovery, extract the **configuration** objects:

```
-- Approval Rules (the rule definitions)
-- Wishlist: construct dynamically from Describe
SELECT [accessible fields] FROM sbaa__ApprovalRule__c

-- Approval Variables (used in rule evaluation)
SELECT [accessible fields] FROM sbaa__ApprovalVariable__c

-- Approval Conditions (conditions on rules)
SELECT [accessible fields] FROM sbaa__ApprovalCondition__c

-- Approval Chains (chain definitions)
SELECT [accessible fields] FROM sbaa__ApprovalChain__c

-- Approver Assignments
SELECT [accessible fields] FROM sbaa__Approver__c
```

> **Note:** Since `sbaa__` field names vary by Advanced Approvals version, drive all queries from Describe results. Do not hardcode field lists.

**Derived metrics:**

| Metric | Computation |
|--------|-------------|
| `totalCustomActions` | COUNT of CustomAction |
| `activeCustomActions` | COUNT WHERE Active = true |
| `standardApprovalProcesses` | COUNT of ProcessDefinition for CPQ objects |
| `activeApprovalProcesses` | COUNT WHERE Active = true |
| `multiStepApprovals` | Approval processes with > 1 step (from Metadata API) |
| `advancedApprovalsInstalled` | Boolean: sbaa__ namespace detected |
| `approvalRuleCount` | COUNT of sbaa__ApprovalRule__c (if installed) |
| `approvalChainCount` | COUNT of sbaa__ApprovalChain__c (if installed) |
| `approvalVariableCount` | COUNT of sbaa__ApprovalVariable__c (if installed) |

---

## 9. Collector 5: Customizations

> **API:** REST API (Describe) + Tooling API
>
> **Purpose:** Detect custom objects, custom fields on CPQ objects, custom metadata types, validation rules, formula fields, sharing rules, and other declarative customizations
>
> **RCA mapping target:** Custom field migration, layout redesign

### 9.1 Custom Fields on CPQ Objects

For each CPQ object in scope, the per-object Describe (Step 4.3) already returns all fields. Extract custom fields by filtering:

```
custom fields = fields WHERE:
  - custom == true
  - NOT name.startsWith('SBQQ__')  // exclude managed package fields
  - NOT name.startsWith('sbaa__')  // exclude advanced approvals fields
```

**Key CPQ objects to scan for custom fields:**
- `Product2`
- `SBQQ__Quote__c`
- `SBQQ__QuoteLine__c`
- `SBQQ__QuoteLineGroup__c`
- `Opportunity`
- `Account`
- `Order`
- `OrderItem`
- `Contract`
- `Asset`

**Derived metrics per object:**

| Metric | Computation |
|--------|-------------|
| `customFieldCount` | COUNT of non-managed custom fields |
| `formulaFieldCount` | COUNT WHERE calculatedFormula IS NOT NULL |
| `lookupFieldCount` | COUNT WHERE type = 'reference' AND custom = true |
| `picklistFieldCount` | COUNT WHERE type IN ('picklist', 'multipicklist') AND custom = true |
| `requiredCustomFields` | COUNT WHERE nillable = false AND custom = true |

### 9.2 Custom Objects Related to CPQ

From Describe Global, identify custom objects related to CPQ by checking child relationships:

```
custom objects related to CPQ = objects WHERE:
  - custom == true
  - NOT name.startsWith('SBQQ__')
  - NOT name.startsWith('sbaa__')
  - NOT name.endsWith('__mdt')  // separate handling for Custom Metadata Types
  - Has a lookup/master-detail relationship TO any CPQ object
    OR is referenced BY a CPQ object
```

For each identified custom object, run a full Describe to get its field inventory.

### 9.3 Custom Metadata Types (`__mdt`)

> **Audit addition (Auditor 1 #5):** Sophisticated CPQ implementations often move logic out of code and into Custom Metadata Types, referenced by QCP. The v1 spec only looked at Custom Objects (`__c`).

**Via Tooling API:**
```sql
SELECT DeveloperName, NamespacePrefix, QualifiedApiName
FROM CustomObject
WHERE QualifiedApiName LIKE '%__mdt'
AND NamespacePrefix = null
```

For each customer-created Custom Metadata Type found:
1. Run Describe to get its fields
2. Extract all records: `SELECT [all fields] FROM {CustomMetadataType__mdt}`
3. Cross-reference with QCP code to determine if it contains pricing logic

**Why this matters:** These often contain the *actual* pricing logic (rate tables, tier definitions, feature flags) that drives QCP behavior. In RCA, this logic may need to move to Decision Tables or Pricing Procedure configuration.

### 9.4 Validation Rules

**API:** Tooling API

```sql
SELECT
  Id, EntityDefinitionId, EntityDefinition.QualifiedApiName,
  ValidationName, Active, Description, ErrorDisplayField,
  ErrorMessage, Metadata
FROM ValidationRule
WHERE EntityDefinition.QualifiedApiName IN (
  'Product2', 'SBQQ__Quote__c', 'SBQQ__QuoteLine__c',
  'SBQQ__QuoteLineGroup__c', 'Opportunity', 'Order',
  'OrderItem', 'Account', 'Contract'
)
```

**Derived metrics:**

| Metric | Computation |
|--------|-------------|
| `totalValidationRules` | COUNT |
| `activeValidationRules` | COUNT WHERE Active = true |
| `validationRulesPerObject` | GROUP BY EntityDefinition.QualifiedApiName |
| `complexValidationRules` | Rules whose formula references SBQQ__ fields (parse Metadata.formula) |

### 9.5 Record Types

From per-object Describe (`recordTypeInfos`):
```
For each CPQ object:
  - Count active record types
  - List record type names
```

Multiple record types on Quote or QuoteLine indicates segmented business processes — increased migration complexity.

### 9.6 Page Layouts (Metadata API)

Retrieve Layout metadata for SBQQ__Quote__c, SBQQ__QuoteLine__c, Product2 via Metadata API SOAP retrieve. Count sections, fields, and related lists per layout. High layout customization signals UI migration effort.

> **Note:** Page layout data is informational for v1. We count it but do not deeply analyze it.

### 9.7 Sharing Rules & OWD

> **Audit addition (Auditor 2 #20):** The v1 spec mentioned OWD/sharing as a consideration but didn't extract it. The sharing model on CPQ objects affects how Orders and Contracts work in RCA.

**Via Tooling API:**
```sql
SELECT QualifiedApiName, ExternalSharingModel, InternalSharingModel
FROM EntityDefinition
WHERE QualifiedApiName IN (
  'SBQQ__Quote__c', 'SBQQ__QuoteLine__c', 'Product2',
  'Opportunity', 'Order', 'Contract', 'Account'
)
```

**Derived metrics (aggregate):**

| Metric | Computation |
|--------|-------------|
| `totalCustomFieldsAcrossCPQ` | SUM of custom fields on all CPQ objects |
| `totalFormulaFieldsAcrossCPQ` | SUM of formula fields on all CPQ objects |
| `totalValidationRulesAcrossCPQ` | SUM of validation rules on all CPQ objects |
| `customObjectsLinkedToCPQ` | COUNT of custom objects with CPQ relationships |
| `customMetadataTypesCount` | COUNT of customer-created __mdt types |
| `recordTypeComplexity` | SUM of (recordTypeCount - 1) across CPQ objects |
| `sharingModelComplexity` | Count of objects with Private sharing model |

---

## 10. Collector 6: Code & Flow Dependencies

> **API:** Tooling API + Metadata API (SOAP)
>
> **Purpose:** Identify all Apex code, Flows, Process Builder processes, and Workflow Rules that touch CPQ objects

### 10.1 Apex Classes

**API:** Tooling API

```sql
SELECT
  Id, Name, NamespacePrefix, ApiVersion, Status,
  IsValid, LengthWithoutComments, Body,
  CreatedDate, LastModifiedDate
FROM ApexClass
WHERE NamespacePrefix = null
  AND Status = 'Active'
```

**Why `NamespacePrefix = null`:** We only want customer-written Apex, not managed package code.

**Post-query analysis — scan each class `Body` for:**
- `SBQQ__Quote__c` or `SBQQ__QuoteLine__c` string literals
- `SBQQ__` prefix in any context
- `Product2` with SBQQ field references
- Direct SOQL queries touching CPQ objects
- `QuoteCalculatorPlugin` interface implementation
- `SBQQ.TriggerControl` references (specifically `disable()` and `enable()`)

> **Audit addition (Auditor 1 — TriggerControl):** Specifically count classes invoking `SBQQ.TriggerControl.disable()` / `enable()`. If the client heavily relies on disabling triggers to bypass CPQ logic, that architectural pattern breaks in RCA (which uses Flows). This is a high-risk migration signal.

**Derived metrics:**

| Metric | Computation |
|--------|-------------|
| `totalCustomApexClasses` | COUNT |
| `cpqRelatedApexClasses` | COUNT where Body contains SBQQ references |
| `cpqApexLineCount` | Total lines of CPQ-related Apex |
| `triggerControlUsage` | Boolean: any class references SBQQ.TriggerControl |
| `triggerBypassCount` | COUNT of classes invoking TriggerControl.disable() |

### 10.2 Apex Triggers

```sql
SELECT
  Id, Name, TableEnumOrId, Body,
  ApiVersion, Status, IsValid,
  UsageBeforeInsert, UsageBeforeUpdate, UsageBeforeDelete,
  UsageAfterInsert, UsageAfterUpdate, UsageAfterDelete, UsageAfterUndelete,
  LengthWithoutComments,
  CreatedDate, LastModifiedDate
FROM ApexTrigger
WHERE NamespacePrefix = null
  AND Status = 'Active'
```

**Post-query analysis:** Filter for triggers on CPQ objects:
- `TableEnumOrId` matching any CPQ object API name
- Triggers on standard objects (Opportunity, Order, Contract) that reference SBQQ fields in Body

### 10.3 Flows

> **Audit fix (Auditor 2 #18):** Use `FlowDefinitionView` for the initial inventory (one row per flow, showing only the active version info), then `FlowVersionView` for details on specific flows.

**Step 1: Inventory via FlowDefinitionView (Tooling API):**
```sql
SELECT
  Id, DeveloperName, Description, ActiveVersionId,
  LatestVersionId, ProcessType, TriggerType,
  TriggerObjectOrEvent, IsActive, ApiName
FROM FlowDefinitionView
WHERE IsActive = true
```

**Step 2: Details for CPQ-related flows via FlowVersionView (Tooling API):**
```sql
SELECT
  Id, Definition.DeveloperName, ProcessType, Status,
  VersionNumber, ApiVersion, TriggerType,
  TriggerObjectOrEventId, TriggerObjectOrEventLabel,
  RunInMode, CreatedDate, LastModifiedDate
FROM FlowVersionView
WHERE Status = 'Active'
AND Definition.DeveloperName IN ({CPQ-related flow names from Step 1})
```

**Post-query analysis:**
- Filter flows where `TriggerObjectOrEvent` matches CPQ objects
- `ProcessType` values of interest:
  - `Workflow` — Process Builder (deprecated, must migrate)
  - `AutoLaunchedFlow` — auto-launched flow
  - `Flow` — screen flow
  - `RecordTriggerFlow` — record-triggered flow

**Step 3: For CPQ-related flows, get full structure via Metadata API SOAP retrieve:**

```xml
<Package>
  <types>
    <members>{FlowDeveloperName1}</members>
    <members>{FlowDeveloperName2}</members>
    <name>Flow</name>
  </types>
  <version>62.0</version>
</Package>
```

This returns full flow XML including decision elements, record lookups/creates/updates on CPQ objects, action calls, and subflow references.

### 10.4 Workflow Rules (Legacy)

**API:** Tooling API

```sql
SELECT
  Id, Name, TableEnumOrId,
  CreatedDate, LastModifiedDate
FROM WorkflowRule
WHERE TableEnumOrId IN (
  'SBQQ__Quote__c', 'SBQQ__QuoteLine__c', 'SBQQ__QuoteLineGroup__c',
  'Product2', 'Opportunity', 'Order', 'OrderItem'
)
```

### 10.5 Dependency Summary

| Dependency Type | Source | CPQ Relevance | Migration Risk | RCA Target |
|-----------------|--------|---------------|----------------|------------|
| Apex Class | Tooling API | References SBQQ | High — requires rewrite | Apex or Flow |
| Apex Trigger | Tooling API | On SBQQ object | High — requires rewrite | Flow triggers |
| Flow (record-triggered) | Tooling API + Metadata | Triggers on CPQ object | Medium — may need redesign | Updated Flow |
| Process Builder | Tooling API | Triggers on CPQ object | Medium — deprecated, must migrate | Flow |
| Workflow Rule | Tooling API | On CPQ object | Low-Medium — often simple field updates | Flow |
| QCP (Custom Script) | SOQL | Custom pricing logic | **Critical** — custom JS, full rewrite | Pricing Procedures |
| TriggerControl bypass | Tooling API (Apex) | Disables CPQ triggers | **High** — pattern breaks in RCA | Redesign required |

> **Audit fix (Cross-reference audit, Gap #3):** The product spec (8.8) requires a "synchronous dependency risk" metric — an explicit sync vs. async classification.

**Synchronous dependency risk metrics:**

| Metric | Computation |
|--------|-------------|
| `synchronousDependencyCount` | COUNT of before-triggers (UsageBeforeInsert/Update/Delete = true) + synchronous record-triggered flows (RunInMode = 'DefaultMode' or 'SystemModeWithSharing') on CPQ objects |
| `synchronousDependencyRisk` | High if >5 synchronous triggers/flows on SBQQ__Quote__c or SBQQ__QuoteLine__c; Medium if 3-5; Low if <3 |
| `asyncDependencyCount` | COUNT of after-triggers + async flows + @future methods + queueable jobs referencing CPQ |

---

## 11. Collector 7: Integration Artifacts

> **API:** Tooling API + Metadata API
>
> **Purpose:** Detect external integrations that touch the quote-to-cash path

### 11.1 Named Credentials

```sql
SELECT
  Id, DeveloperName, Endpoint, PrincipalType,
  Protocol, AuthProvider.DeveloperName
FROM NamedCredential
```

### 11.2 Remote Site Settings

**API:** Metadata API SOAP retrieve with `RemoteSiteSetting` in manifest.

### 11.3 External Data Sources

```sql
SELECT
  Id, DeveloperName, Type, Endpoint,
  IsWritable, PrincipalType
FROM ExternalDataSource
```

### 11.4 Connected Apps (Outbound)

```sql
SELECT
  Id, Name, ContactEmail,
  Description, LogoUrl, MobileStartUrl,
  OptionsAllowAdminApprovedUsersOnly,
  StartUrl
FROM ConnectedApplication
```

### 11.5 Outbound Messages (from Workflow Rules)

**API:** Tooling API

```sql
SELECT
  Id, Name, ApiVersion,
  EndpointUrl, IncludeSessionId,
  EntityDefinition.QualifiedApiName
FROM WorkflowOutboundMessage
WHERE EntityDefinition.QualifiedApiName IN (
  'SBQQ__Quote__c', 'SBQQ__QuoteLine__c',
  'Opportunity', 'Order', 'Contract'
)
```

### 11.6 External Service Registrations

```sql
SELECT
  Id, DeveloperName, Description,
  NamedCredentialReference, SchemaUrl
FROM ExternalServiceRegistration
```

### 11.7 Platform Events

> **Audit fix (Auditor 2 #17):** The v1 query matched non-event objects. Platform events always end in `__e`.

```sql
SELECT QualifiedApiName, DeveloperName, Label, Description
FROM EntityDefinition
WHERE IsCustomizable = true AND QualifiedApiName LIKE '%__e'
```

### 11.8 Callout Detection from Code

Cross-reference with Apex analysis (Collector 6): scan Apex class bodies for:
- `Http h = new Http()` or `HttpRequest`
- `WebServiceCallout`
- `@future(callout=true)`
- `System.enqueueJob` with callout
- Named credential references in code

### 11.9 E-Signature Package Detection

> **Audit addition (Auditor 1 — Phantom Packages):** Check for signature packages linked to quotes.

If `echosign_dev1` or `dsfs` (DocuSign) namespace detected in Step 4.5:
```sql
-- Check for DocuSign/EchoSign fields on Quote (via Describe results)
-- If echosign_dev1__* or dsfs__* fields exist on SBQQ__Quote__c, flag as integration dependency
```

**Derived metrics:**

| Metric | Computation |
|--------|-------------|
| `totalNamedCredentials` | COUNT |
| `totalRemoteSites` | COUNT |
| `totalExternalDataSources` | COUNT |
| `outboundMessagesOnCPQ` | COUNT of outbound messages on CPQ objects |
| `externalServiceCount` | COUNT |
| `platformEventCount` | COUNT of custom platform events |
| `apexCalloutClasses` | COUNT of Apex classes with callout patterns |
| `eSignatureIntegration` | Boolean: DocuSign/EchoSign detected |
| `quotePathExternalDependencies` | Union of all external dependencies touching quote/order path |

---

## 12. Collector 8: 90-Day Usage Analytics

> **API:** Bulk API 2.0 (mandatory for usage data — potentially thousands of records)
>
> **Purpose:** Analyze real operational patterns from the last 90 days + 12-month trends

### 12.1 Why Bulk API 2.0 for Usage Data

Usage queries can return tens of thousands of records. Bulk API 2.0 workflow:

1. Create a query job (POST `/services/data/vXX.0/jobs/query`)
2. Poll for completion (`GET .../jobs/query/{jobId}` — wait for `state: "JobComplete"`)
3. Retrieve results as CSV (`GET .../jobs/query/{jobId}/results`)
4. If `Sforce-Locator` header present, follow for next chunk

### 12.2 Quotes — 90-Day Window (SBQQ__Quote__c)

```
-- Wishlist (construct dynamically, include CurrencyIsoCode if multi-currency)
Id, Name, SBQQ__Status__c, SBQQ__Type__c, SBQQ__Primary__c,
SBQQ__Account__c, SBQQ__Opportunity2__c, SBQQ__SalesRep__c,
SBQQ__NetAmount__c, SBQQ__CustomerAmount__c, SBQQ__ListAmount__c,
SBQQ__RegularAmount__c, SBQQ__GrandTotal__c,
SBQQ__TotalCustomerDiscountAmount__c,
SBQQ__AverageCustomerDiscount__c, SBQQ__AveragePartnerDiscount__c,
SBQQ__AdditionalDiscountAmount__c, SBQQ__LineItemCount__c,
SBQQ__StartDate__c, SBQQ__EndDate__c, SBQQ__SubscriptionTerm__c,
SBQQ__ExpirationDate__c, SBQQ__PaymentTerms__c,
SBQQ__PricebookId__c, SBQQ__QuoteTemplate__c, SBQQ__Ordered__c,
SBQQ__OrderByQuoteLineGroup__c, SBQQ__ContractingMethod__c,
SBQQ__RenewalTerm__c, SBQQ__Source__c, SBQQ__MasterContract__c,
CreatedDate, LastModifiedDate, CreatedById
WHERE CreatedDate >= LAST_N_DAYS:90
ORDER BY CreatedDate DESC
```

### 12.3 12-Month Aggregate Trend (Mandatory)

> **Audit fix (Auditor 2 #12):** The v1 spec made this optional ("also fetch"). It is mandatory for understanding seasonal patterns (e.g., quarter-end quote spikes).

```sql
SELECT
  CALENDAR_MONTH(CreatedDate) monthNum,
  CALENDAR_YEAR(CreatedDate) yearNum,
  COUNT(Id) quoteCount
FROM SBQQ__Quote__c
WHERE CreatedDate >= LAST_N_DAYS:365
GROUP BY CALENDAR_MONTH(CreatedDate), CALENDAR_YEAR(CreatedDate)
ORDER BY CALENDAR_YEAR(CreatedDate), CALENDAR_MONTH(CreatedDate)
```

Also extract 12-month status distribution:
```sql
SELECT
  CALENDAR_MONTH(CreatedDate) monthNum,
  CALENDAR_YEAR(CreatedDate) yearNum,
  SBQQ__Status__c,
  COUNT(Id) quoteCount
FROM SBQQ__Quote__c
WHERE CreatedDate >= LAST_N_DAYS:365
GROUP BY CALENDAR_MONTH(CreatedDate), CALENDAR_YEAR(CreatedDate), SBQQ__Status__c
ORDER BY CALENDAR_YEAR(CreatedDate), CALENDAR_MONTH(CreatedDate)
```

> **Note:** These aggregate queries use REST API (small result set).

### 12.4 Quote Lines — 90-Day Window (SBQQ__QuoteLine__c)

> **Audit fix (Auditor 2 #14):** The v1 spec missed critical pricing waterfall fields.

```
-- Wishlist (construct dynamically, include ALL SBQQ__ fields ideally)
Id, SBQQ__Quote__c, SBQQ__Product__c, SBQQ__ProductName__c,
SBQQ__ProductFamily__c, SBQQ__Quantity__c,
SBQQ__ListPrice__c, SBQQ__CustomerPrice__c,
SBQQ__NetPrice__c, SBQQ__NetTotal__c,
SBQQ__RegularPrice__c, SBQQ__PartnerPrice__c,
SBQQ__SpecialPrice__c, SBQQ__OriginalPrice__c,
SBQQ__ContractedPrice__c,
SBQQ__Discount__c, SBQQ__AdditionalDiscount__c,
SBQQ__CustomerDiscount__c, SBQQ__PartnerDiscount__c,
SBQQ__DistributorDiscount__c,
SBQQ__MarkupRate__c, SBQQ__MarkupAmount__c, SBQQ__Markup__c,
SBQQ__UnitCost__c,
SBQQ__TotalDiscountAmount__c, SBQQ__TotalDiscountRate__c,
SBQQ__ProrateMultiplier__c,
SBQQ__PreviousSegmentPrice__c, SBQQ__PreviousSegmentUplift__c,
SBQQ__Uplift__c, SBQQ__UpliftAmount__c,
SBQQ__PricingMethod__c, SBQQ__PriceEditable__c,
SBQQ__DiscountSchedule__c, SBQQ__DiscountScheduleType__c,
SBQQ__BlockPrice__c, SBQQ__TermDiscountSchedule__c,
SBQQ__Bundle__c, SBQQ__BundledQuantity__c,
SBQQ__RequiredBy__c, SBQQ__ProductOption__c,
SBQQ__OptionLevel__c, SBQQ__OptionType__c,
SBQQ__Optional__c, SBQQ__Group__c, SBQQ__Number__c,
SBQQ__SubscriptionType__c, SBQQ__SubscriptionPricing__c,
SBQQ__ChargeType__c, SBQQ__BillingType__c,
SBQQ__BillingFrequency__c,
SBQQ__StartDate__c, SBQQ__EndDate__c,
SBQQ__SubscriptionTerm__c,
SBQQ__RenewedSubscription__c, SBQQ__UpgradedSubscription__c,
SBQQ__Source__c, SBQQ__Existing__c, SBQQ__Renewal__c,
CreatedDate
WHERE CreatedDate >= LAST_N_DAYS:90
ORDER BY SBQQ__Quote__c, SBQQ__Number__c
```

> **Best practice:** Rather than maintaining a wishlist of 50+ fields, query ALL `SBQQ__` fields on QuoteLine (dynamically from Describe). The pricing waterfall is complex and field-specific — missing any waterfall field means incomplete migration analysis.

**Bulk API 2.0 WHERE clause strategy:**

> **Audit fix (Auditor 2 #4):** The v1 spec proposed a relationship filter (`SBQQ__Quote__r.CreatedDate`) with a fallback of large IN clauses. Both have issues.

**Fallback chain (do NOT use large IN clauses):**
1. **Try:** `WHERE CreatedDate >= LAST_N_DAYS:90` directly on QuoteLine (simplest, most reliable)
2. **Alternative:** `WHERE SBQQ__Quote__r.CreatedDate >= LAST_N_DAYS:90` (relationship filter — may fail on some orgs)
3. **If needed:** Batch Quote IDs into chunks of **300 max per query** (SOQL has a 100,000 character limit — 5,000+ IDs in an IN clause will exceed it)
4. **Post-filter:** In application code, join QuoteLines to Quotes using extracted Quote IDs

### 12.5 Quote Line Groups (SBQQ__QuoteLineGroup__c)

```
-- Wishlist
Id, SBQQ__Quote__c, SBQQ__Number__c,
SBQQ__CustomerTotal__c, SBQQ__ListTotal__c, SBQQ__NetTotal__c
WHERE CreatedDate >= LAST_N_DAYS:90
```

### 12.6 Opportunity Sync Health

> **Audit addition (Auditor 1 — Opportunity Sync):** A major blocker for migration is when CPQ Quotes are out of sync with Opportunities.

> **Audit fix (Reviewer 2, Issue #13):** Inline subqueries with `COUNT()` don't work in standard SOQL. Use separate aggregate queries instead.

**Query 1 — OLI counts per Opportunity:**
```sql
SELECT OpportunityId, COUNT(Id) oliCount
FROM OpportunityLineItem
WHERE Opportunity.CloseDate >= LAST_N_DAYS:90
GROUP BY OpportunityId
```

**Query 2 — Primary Quote line counts per Opportunity:**
```sql
SELECT SBQQ__Opportunity2__c, COUNT(Id) qlCount
FROM SBQQ__QuoteLine__c
WHERE SBQQ__Quote__r.SBQQ__Primary__c = true
  AND SBQQ__Quote__r.SBQQ__Opportunity2__r.CloseDate >= LAST_N_DAYS:90
GROUP BY SBQQ__Opportunity2__c
```

**Analysis (in RevBrain's database):** Join the two result sets by Opportunity ID. If `oliCount != qlCount` for any Opportunity, flag as **"High Integrity Risk"**. Quote-Opportunity sync issues must be resolved before migration.

### 12.7 Subscription Data (SBQQ__Subscription__c)

If the org uses subscriptions:

```
-- Wishlist
Id, SBQQ__Product__c, SBQQ__Account__c, SBQQ__Contract__c,
SBQQ__Quantity__c, SBQQ__NetPrice__c, SBQQ__StartDate__c,
SBQQ__EndDate__c, SBQQ__RenewalPrice__c, SBQQ__RenewalQuantity__c,
SBQQ__TerminatedDate__c, SBQQ__SubscriptionType__c
WHERE SBQQ__StartDate__c >= LAST_N_DAYS:365 OR SBQQ__EndDate__c >= TODAY
```

**Decision point:** Use Bulk API 2.0 if count > 2,000.

### 12.8 Usage Analytics — Derived Metrics

All joins and aggregations happen in RevBrain's database after extraction. **Never do joins in SOQL.**

| Metric | Computation | Purpose |
|--------|-------------|---------|
| `quoteVolumeLast90Days` | COUNT of quotes | Overall activity level |
| `quotesPerMonth` | GROUP BY month (from 12-month aggregate) | Trend + seasonality analysis |
| `quoteStatusDistribution` | GROUP BY Status | Draft/Approved/Rejected/Presented ratio |
| `avgQuoteLinesPerQuote` | AVG(COUNT of lines per quote) | Quote complexity |
| `maxQuoteLinesPerQuote` | MAX(COUNT of lines per quote) | Peak complexity |
| `avgNetAmount` | AVG(NetAmount) | Deal size context |
| `discountingFrequency` | % of lines where any discount field > 0 | Discount prevalence |
| `avgDiscountRate` | AVG of non-zero discount values | Discount depth |
| `discountTypeDistribution` | Customer vs Partner vs Additional vs Distributor | Discount channel mix |
| `manualPriceOverrides` | COUNT WHERE PriceEditable = true AND price differs from list | Manual intervention rate |
| `productConcentration` | Top N products by line count (Pareto) | 80/20 analysis |
| `dormantProducts` | Products in catalog but zero usage in 90 days | Cleanup candidates |
| `activeProductUtilization` | Active products with usage / Total active products | Catalog health |
| `bundleUsageRate` | Lines with Bundle = true / total lines | Bundle adoption |
| `subscriptionUsageRate` | Lines with subscription fields populated / total | Subscription model adoption |
| `quotesWithDiscountSchedules` | Quotes where any line uses a discount schedule | Schedule adoption |
| `quotesWithGroups` | Quotes with > 0 quote line groups | Group adoption |
| `templateUsageDistribution` | GROUP BY QuoteTemplate | Template popularity |
| `primaryQuoteRate` | % of quotes where Primary = true | Quote lifecycle pattern |
| `quoteToOrderRate` | % of quotes where Ordered = true | Conversion rate |
| `avgSubscriptionTerm` | AVG(SubscriptionTerm) WHERE not null | Contract length pattern |
| `renewalQuoteRate` | % where Source = 'Renewal' or Type = 'Renewal' | Renewal maturity |
| `amendmentQuoteRate` | % where Type = 'Amendment' | Amendment complexity |
| `salesRepDistribution` | GROUP BY SalesRep | User adoption |
| `opportunitySyncIssues` | COUNT of Opportunities with OLI/QuoteLine mismatch | Data integrity risk |
| `pricingWaterfallUsage` | % of lines using Uplift, ProrateMultiplier, ContractedPrice fields | Waterfall complexity |

---

## 13. Collector 9: Order, Contract & Asset Lifecycle

> **Audit addition (Auditor 2 #9):** The v1 spec focused on the quote side but missed Order/Contract/Asset data, which is critical for RCA mapping (Order Management, Contract Lifecycle Management, Dynamic Revenue Orchestrator).
>
> **RCA mapping target:** Enhanced Order Management + DRO + Asset Lifecycle Management

### 13.1 Orders with CPQ Fields

```sql
-- Count first
SELECT COUNT() FROM Order WHERE CreatedDate >= LAST_N_DAYS:90
```

```
-- Wishlist (construct dynamically — include all SBQQ__ fields from Describe)
Id, OrderNumber, Status, Type, EffectedDate, EndDate,
SBQQ__Quote__c, SBQQ__ContractingMethod__c,
SBQQ__PaymentTerm__c, SBQQ__RenewalTerm__c,
SBQQ__Contracted__c, SBQQ__RenewalUpliftRate__c,
AccountId, OpportunityId, ContractId,
TotalAmount, CreatedDate, LastModifiedDate
WHERE CreatedDate >= LAST_N_DAYS:90
```

### 13.2 Order Items with CPQ Fields

```
-- Wishlist (construct dynamically)
Id, OrderId, Product2Id, Quantity, UnitPrice, TotalPrice,
SBQQ__QuoteLine__c, SBQQ__ContractingMethod__c,
SBQQ__ChargeType__c, SBQQ__BillingType__c,
SBQQ__BillingFrequency__c, SBQQ__SubscriptionType__c,
SBQQ__OrderedQuantity__c, SBQQ__Status__c,
CreatedDate
WHERE Order.CreatedDate >= LAST_N_DAYS:90
```

### 13.3 Contracts with CPQ Fields

```sql
SELECT COUNT() FROM Contract WHERE CreatedDate >= LAST_N_DAYS:365
```

```
-- Wishlist (construct dynamically)
Id, ContractNumber, Status, StartDate, EndDate, ContractTerm,
SBQQ__Quote__c, SBQQ__RenewalForecast__c,
SBQQ__RenewalQuoted__c, SBQQ__RenewalOpportunity__c,
SBQQ__AmendmentStartDate__c,
AccountId, CreatedDate, LastModifiedDate
WHERE StartDate >= LAST_N_DAYS:365 OR EndDate >= TODAY
```

### 13.4 Assets with Subscription Fields

```sql
SELECT COUNT() FROM Asset WHERE SBQQ__CurrentSubscription__c != null
```

If count > 0:
```
-- Wishlist
Id, Name, Product2Id, AccountId, Quantity,
SBQQ__CurrentSubscription__c, SBQQ__QuoteLine__c,
SBQQ__OrderProduct__c, SBQQ__SubscriptionType__c,
InstallDate, UsageEndDate, Status
```

**Derived metrics:**

| Metric | Computation |
|--------|-------------|
| `ordersLast90Days` | COUNT of Orders |
| `orderItemsLast90Days` | COUNT of OrderItems |
| `contractsActive` | COUNT WHERE Status = 'Activated' |
| `assetsWithSubscriptions` | COUNT WHERE CurrentSubscription IS NOT NULL |
| `orderToContractConversion` | % of Orders linked to Contracts |
| `sbqqFieldsOnOrder` | COUNT of SBQQ__ fields on Order (from Describe) |
| `sbqqFieldsOnOrderItem` | COUNT of SBQQ__ fields on OrderItem (from Describe) |

---

## 14. Collector 10: Localization

> **Audit addition (Auditor 1 #1):** RCA handles localization differently than CPQ. If we don't assess translation volume, the migration estimate will be off by weeks.
>
> **RCA mapping target:** Translation Workbench (standard Salesforce)

### 14.1 CPQ Localization Records (SBQQ__Localization__c)

> **Audit note (Reviewer 2, Issue #14):** Field names on SBQQ__Localization__c should be driven from Describe, not assumed — consistent with the dynamic query construction pattern.

```
-- Wishlist (construct dynamically from Describe)
Id, Name, SBQQ__Language__c, SBQQ__Label__c, SBQQ__Text__c,
SBQQ__RichText__c, SBQQ__APIName__c,
SBQQ__QuoteTemplate__c, SBQQ__Product__c
```

**Decision point:** If count > 2,000, use Bulk API 2.0.

### 14.2 Custom Labels (SBQQ namespace)

> **Audit addition (Reviewer 2, Issue #15):** CPQ stores most of its labels and messages as Custom Label records. These can be overridden with new text and are a localization data source.

**Via Tooling API:**
```sql
SELECT Id, Name, Value, Language, NamespacePrefix, Category
FROM ExternalString
WHERE NamespacePrefix = 'SBQQ'
```

This captures CPQ-managed labels. Also query for customer-created labels that reference CPQ:
```sql
SELECT Id, Name, Value, Language, Category
FROM ExternalString
WHERE NamespacePrefix = null AND Category LIKE '%CPQ%'
```

### 14.3 Translation Workbench Status

Check if Translation Workbench is enabled:
```sql
SELECT LanguageLocaleKey FROM Organization
```

Also check for active languages:
```sql
SELECT Language, IsActive FROM LanguageLocaleKey WHERE IsActive = true
```

> **Note:** If Translation Workbench data is extensive, it's better detected via Metadata API retrieve rather than queried. For v1, capturing the count and language distribution from SBQQ__Localization__c is sufficient.

**Derived metrics:**

| Metric | Computation | Migration Impact |
|--------|-------------|-----------------|
| `translationVolume` | COUNT of Localization records | >1000 = complex multi-region migration |
| `languageDistribution` | GROUP BY Language | Number of target languages |
| `translatedTemplates` | DISTINCT QuoteTemplate from Localization | Template localization scope |
| `translatedProducts` | DISTINCT Product from Localization | Product localization scope |

---

## 15. Collector 11: CPQ Package Settings

> **Audit addition (Auditor 2 #3):** The v1 spec completely missed CPQ Package Settings — the org-level configuration that governs CPQ behavior. These are Custom Settings, not standard objects.
>
> **RCA mapping target:** Revenue Settings / Salesforce Pricing Setup

### 15.1 What Are CPQ Package Settings?

CPQ's global behavior is controlled by Custom Settings objects that define calculation order, multi-currency behavior, subscription proration, renewal model, etc. These don't appear in Describe Global as normal queryable objects — they're Custom Settings accessed via specific endpoints.

### 15.2 Discovery-Driven Extraction

> **Audit fix (Reviewer 2, Issues #2/#10):** The v2 spec listed hardcoded setting object names (`SBQQ__GeneralSettings__c`, etc.) which may not match actual API names. CPQ settings are accessed via Setup → Installed Packages → Configure, and actual Custom Setting object names vary by CPQ version. Some settings are internally managed by CPQ and may not be directly queryable.

**Step 1: Discover all SBQQ Custom Settings via Tooling API:**

```sql
SELECT DeveloperName, QualifiedApiName, Description
FROM CustomObject
WHERE NamespacePrefix = 'SBQQ'
```

Filter results for Custom Setting types (distinguished from Custom Objects by their metadata attributes in the Describe response — Custom Settings have `customSettingsType: 'Hierarchy'` or `'List'`).

**Known CPQ Custom Settings to look for** (actual names discovered dynamically):
- General/global settings (calculation order, UI behavior)
- Quote settings (calculation, display)
- Pricing settings (engine configuration)
- Subscription settings (renewal behavior, proration)
- Order settings (order generation)
- Plugin settings (`SBQQ__Plugin__c`)
- Trigger control (`SBQQ__TriggerControl__c`)
- Field metadata (`SBQQ__FieldMetadata__c` — internally managed, used by price rules)

**Step 2: For each discovered Custom Setting, extract all records:**

```sql
SELECT [all accessible fields from Describe]
FROM {DiscoveredSettingObject}
```

> **Note:** Custom Settings may have Organization-level defaults and Profile-level overrides. Query with `SetupOwnerId` to capture both:
> - `SetupOwnerId = '{OrgId}'` — org-wide defaults
> - Other SetupOwnerId values — profile/user overrides
>
> Some Custom Settings (like `SBQQ__FieldMetadata__c`) are internally managed by CPQ and their data may not be directly useful for migration. Extract them anyway — the migration engineer can determine relevance.

### 15.4 Why This Matters for RCA

These settings define the behavioral baseline that must be replicated in RCA's Revenue Settings. For example:
- **Calculation order** affects how Pricing Procedures should be structured
- **Subscription proration model** affects how RCA's subscription management is configured
- **Multi-currency settings** affect pricing procedure design
- **Renewal model** (Same Product vs Different Product) affects Asset Lifecycle Management setup

---

## 16. Custom Objects via Configuration

> **Purpose:** Allow the user to specify additional objects for extraction beyond the standard CPQ object set

### 16.1 Configuration Interface

The assessment scope page should allow users to add custom objects for analysis. This handles:
- Custom objects that extend CPQ (e.g., `Custom_Pricing_Matrix__c`)
- Industry-specific objects linked to the quote path
- Custom junction objects

### 16.2 For Each User-Specified Custom Object

1. **Validate existence:** Check via Describe Global
2. **Run Describe:** Get field inventory
3. **Count records:** `SELECT COUNT() FROM {ObjectName}`
4. **Detect relationships:** Check for lookup/master-detail to CPQ objects
5. **Extract:** If count < 2,000, full extraction via REST. If > 2,000, use Bulk API 2.0
6. **Analyze fields:** Custom fields, formula fields, validation rules

### 16.3 Auto-Detection Heuristic

Beyond user-specified objects, auto-detect custom objects likely related to CPQ:
1. Objects with lookup fields pointing to `SBQQ__Quote__c`, `SBQQ__QuoteLine__c`, `Product2`, `Opportunity`, `Order`
2. Objects referenced in Apex triggers/classes that also reference SBQQ objects
3. Objects referenced in flows triggered by CPQ objects
4. Custom Metadata Types (`__mdt`) referenced in QCP code

---

## 17. API Budget & Throttling

### 17.1 Estimated API Call Budget per Collector

| Collector | REST/Composite Calls | Bulk API Jobs | Tooling/Metadata Calls | Notes |
|-----------|---------------------|---------------|----------------------|-------|
| Discovery | 1 (Describe Global) + 2 (Composite batches of 25) + 1 (Limits) | 0 | 1-3 (package detection) | ~5 total calls |
| Catalog | 8-10 queries | 0-1 (if >2K products) | 0 | Paginated if needed |
| Pricing | 12-15 queries | 0-2 (contracted prices, lookup data) | 0 | Includes consumption schedules |
| Templates | 6-8 queries | 0-1 (if >2K documents) | 0 | |
| Approvals | 2-3 queries | 0 | 1-3 (ProcessDefinition, Metadata retrieve) | |
| Customizations | 0 (uses Describe data) | 0 | 3-5 (validation rules, sharing, __mdt) | Reuses discovery data |
| Dependencies | 0 | 0 | 4-8 (Apex, triggers, flows, workflows) | Tooling API queries |
| Integrations | 0 | 0 | 5-8 | Small record sets |
| Usage (90-day) | 3-5 (aggregate queries) | 2-5 (quotes, lines, groups, subs) | 0 | Bulk for large datasets |
| Order/Contract/Asset | 4-6 queries | 0-2 | 0 | Depends on volume |
| Localization | 1-2 queries | 0-1 | 0 | |
| CPQ Settings | 4-6 queries | 0 | 0 | Custom Settings |
| **Total estimate** | **~50-70** | **~4-12** | **~14-28** | |

### 17.2 Throttling Rules

1. **Pre-run budget check:** Estimate total API calls needed. If `Remaining < EstimatedBudget * 2`, warn the user.
2. **Adaptive rate limiting:** Use response headers and `/limits/` checks instead of a fixed delay. Start with no delay; if a request returns HTTP 429 or response time exceeds 2 seconds, add incremental delays. Salesforce's per-second rate limit is typically 25+ concurrent requests — a fixed 100ms delay is unnecessarily conservative.
3. **Concurrent bulk jobs:** Use `/limits/` to check actual concurrent job limits dynamically (typically 5 for query jobs). Do not hardcode assumptions.
4. **Mid-run limit check:** After each collector completes, re-check `/limits/`. If remaining drops below 20% of estimated remaining budget, pause and warn.
5. **Exponential backoff:** On HTTP 429 or HTTP 503, back off: 1s → 2s → 4s → 8s → 16s → fail.
6. **Hard stop threshold:** If `DailyApiRequests.Remaining < 500`, abort run gracefully with partial results.

---

## 18. Dynamic Query Construction

> **Audit fix (Auditor 1 #9, Auditor 2 #19):** This is a critical implementation pattern. Never hardcode SOQL field lists.

### 18.1 The Pattern

For every SOQL query in this spec:

1. **Describe** the target object (from Step 4.3 cache — already fetched via Composite Batch)
2. **Build a wishlist** of desired fields (the field lists in each collector section)
3. **Filter** the wishlist against the Describe result — keep only fields that exist AND are accessible
4. **Log** any wishlist fields that were removed (FLS-restricted or missing in this CPQ version)
5. **Construct** the SOQL query dynamically: `SELECT [SafeFields] FROM [Object] WHERE ...`
6. **If QUERY_TOO_COMPLICATED error:** Split field list into two queries (core + extended), join by ID in app layer

### 18.2 Why This Matters

| Problem | What happens with hardcoded queries | What happens with dynamic queries |
|---------|-------------------------------------|-----------------------------------|
| FLS restriction | Entire query fails with INVALID_FIELD | Field silently removed, query succeeds with warning |
| CPQ version difference | Query fails (field doesn't exist in v218) | Field removed, query succeeds |
| Too many formula fields | QUERY_TOO_COMPLICATED error | Detect and split automatically |
| Custom field addition | Need spec update to capture new fields | Automatically included if pattern matched |

### 18.3 Implementation

```typescript
function buildSafeQuery(
  objectName: string,
  wishlistFields: string[],
  describeResult: DescribeResult,
  whereClause?: string,
  orderBy?: string
): { query: string; skippedFields: string[] } {
  const accessibleFieldNames = new Set(
    describeResult.fields.map(f => f.name)
  );
  const safeFields: string[] = [];
  const skippedFields: string[] = [];

  for (const field of wishlistFields) {
    if (accessibleFieldNames.has(field)) {
      safeFields.push(field);
    } else {
      skippedFields.push(field);
    }
  }

  let query = `SELECT ${safeFields.join(', ')} FROM ${objectName}`;
  if (whereClause) query += ` WHERE ${whereClause}`;
  if (orderBy) query += ` ORDER BY ${orderBy}`;

  return { query, skippedFields };
}
```

---

## 19. Per-Query Error Handling

> **Audit addition (Auditor 2 #7):** The v1 spec only defined global retry/backoff. Per-query error handling is critical for a reliable data fetch job.

### 19.1 Error Response Handling

| SOQL Error Code | Meaning | Action |
|----------------|---------|--------|
| `INVALID_FIELD` | Field doesn't exist or FLS restricted | Remove offending field from query, retry. Log warning. |
| `INVALID_TYPE` | Object doesn't exist | Skip this collector component entirely. Log error. |
| `QUERY_TOO_COMPLICATED` | Too many formula fields expand the query cost | Split field list into two queries, join by ID in app layer. |
| `MALFORMED_QUERY` | Syntax error or query too long (>100K chars) | Log full query for debugging, skip. If caused by large IN clause, reduce batch size. |
| `REQUEST_LIMIT_EXCEEDED` | API limit hit | Stop run, report partial results, suggest retry later. |
| `INSUFFICIENT_ACCESS` | Object/field permission denied | Skip with warning, continue other collectors. |
| HTTP 401 | Token expired | Refresh token, retry once. If refresh fails, abort run. |
| HTTP 429 | Rate limited | Exponential backoff: 1s → 2s → 4s → 8s → 16s. |
| HTTP 503 | Service unavailable | Same backoff as 429. |

### 19.2 Collector Resilience

Each collector must independently report one of:
- `success` — all data collected
- `partial` — some data missing, warnings logged
- `failed` — collector could not complete, error logged
- `skipped` — prerequisite object doesn't exist

**A run can complete with warnings.** If one collector fails but others succeed, the assessment proceeds with explicit coverage gaps noted in the report.

---

## 20. Post-Extraction Validation

> **Audit addition (Auditor 2 #13):** Data quality issues in the source org directly impact migration planning. After extraction, validate data consistency.

### 20.1 Referential Integrity Checks

| Check | Query (in RevBrain's database) | Finding if Failed |
|-------|-------------------------------|-------------------|
| QuoteLines reference valid Quotes | QuoteLines WHERE QuoteId NOT IN (extracted Quote IDs) | Orphaned QuoteLines |
| ProductOptions reference valid Products | Options WHERE OptionalSKU NOT IN (extracted Product IDs) | Orphaned Options |
| PriceConditions reference valid PriceRules | Conditions WHERE Rule NOT IN (extracted Rule IDs) | Orphaned Conditions |
| DiscountTiers reference valid Schedules | Tiers WHERE Schedule NOT IN (extracted Schedule IDs) | Orphaned Tiers |
| OrderItems reference valid Orders | OrderItems WHERE OrderId NOT IN (extracted Order IDs) | Orphaned OrderItems |

### 20.2 Data Quality Signals

| Signal | Detection | Migration Impact |
|--------|-----------|-----------------|
| Duplicate product codes | GROUP BY ProductCode HAVING COUNT > 1 | Catalog cleanup required before migration |
| Orphaned records | Referential integrity checks above | Data cleanup pre-migration |
| Null required fields | Records with null values in fields that should be populated | Data quality remediation |
| Inconsistent pricing | QuoteLines where NetPrice = 0 but Quantity > 0 | Pricing logic issue |
| Stale draft quotes | Quotes with Status = 'Draft' and LastModifiedDate > 180 days ago | Cleanup candidates |

---

## 21. Idempotency & Checkpointing

> **Audit addition (Auditor 2 #23):** If a data fetch job fails halfway through, it must be resumable.

### 21.1 Checkpoint Strategy

Each collector writes a checkpoint record upon completion:

```typescript
interface CollectorCheckpoint {
  runId: string;
  collectorName: string;
  status: 'pending' | 'running' | 'success' | 'partial' | 'failed' | 'skipped';
  startedAt: Date;
  completedAt?: Date;
  recordsExtracted: number;
  lastProcessedId?: string;  // For resumable pagination
  warnings: string[];
  error?: string;
}
```

### 21.2 Resume Logic

On run restart:
1. Load all checkpoints for the run
2. Skip collectors with `status: 'success'`
3. Re-run collectors with `status: 'failed'` or `status: 'running'` (interrupted)
4. For Bulk API 2.0 jobs, check if the job still exists and is complete — retrieve results instead of re-submitting

### 21.3 Idempotency Rules

- Discovery can always be safely re-run (read-only)
- SOQL queries are idempotent (read-only)
- Bulk API 2.0 jobs should be checked for existing completion before re-submitting
- All writes to RevBrain's database should use upsert (by Salesforce record ID) to avoid duplicates on re-run

---

## 22. Data Model: Normalized Assessment Graph

All collector outputs are normalized into a single assessment graph stored in RevBrain's database.

### 22.1 Core Schema

```typescript
interface AssessmentFinding {
  id: string;                          // UUID
  runId: string;                       // Assessment run ID
  domain: AssessmentDomain;
  artifactType: string;               // e.g., "Product2", "SBQQ__PriceRule__c", "ApexClass"
  artifactName: string;               // e.g., "Enterprise Bundle", "Volume Discount Rule"
  artifactId?: string;                 // Salesforce record ID (for evidence traceability)
  sourceType: SourceType;
  sourceRef: string;                   // API endpoint or query used to obtain this
  detected: boolean;
  countValue?: number;
  textValue?: string;
  usageLevel?: UsageLevel;
  riskLevel?: RiskLevel;
  complexityLevel?: ComplexityLevel;
  migrationRelevance?: MigrationRelevance;
  rcaTargetConcept?: string;          // RCA target (from Section 2 mapping table)
  rcaMappingComplexity?: 'direct' | 'transform' | 'redesign' | 'no-equivalent';
  evidenceRefs: EvidenceRef[];
  notes?: string;
  createdAt: Date;
}

type AssessmentDomain =
  | 'catalog' | 'pricing' | 'templates' | 'approvals'
  | 'customization' | 'dependency' | 'integration' | 'usage'
  | 'order-lifecycle' | 'localization' | 'settings';

type SourceType = 'object' | 'metadata' | 'tooling' | 'bulk-usage' | 'inferred';
type UsageLevel = 'high' | 'medium' | 'low' | 'dormant';
type RiskLevel = 'critical' | 'high' | 'medium' | 'low' | 'info';
type ComplexityLevel = 'very-high' | 'high' | 'medium' | 'low';
type MigrationRelevance = 'must-migrate' | 'should-migrate' | 'optional' | 'not-applicable';

interface EvidenceRef {
  type: 'record-id' | 'query' | 'api-response' | 'code-snippet' | 'count';
  value: string;
  label?: string;
}
```

### 22.2 Assessment Relationship Graph

> **Audit addition (Auditor 2 #21):** The v1 schema was flat. For migration mapping, we need to understand dependency chains (e.g., "this PriceRule depends on this SummaryVariable which references these QuoteLine fields").

```typescript
interface AssessmentRelationship {
  id: string;
  runId: string;
  sourceArtifactId: string;           // AssessmentFinding.id
  targetArtifactId: string;           // AssessmentFinding.id
  relationshipType: 'depends-on' | 'references' | 'parent-of' | 'triggers' | 'maps-to';
  description?: string;               // e.g., "PriceRule uses SummaryVariable in condition"
}
```

This enables graph queries like:
- "Show me all artifacts that depend on SummaryVariable X"
- "What does this QCP code reference?"
- "Which flows trigger on objects that this Apex trigger also modifies?"

### 22.3 Metric Summary Schema

```typescript
interface CollectorMetrics {
  runId: string;
  collectorName: string;
  domain: AssessmentDomain;
  metrics: Record<string, number | string | boolean>;
  warnings: string[];
  coverage: number;                    // 0-100
  collectedAt: Date;
  durationMs: number;
}
```

---

## 23. Gotchas & Edge Cases

### 23.1 Namespace Variations

| Scenario | Detection | Handling |
|----------|-----------|---------|
| Standard `SBQQ__` namespace | Describe Global: objects starting with `SBQQ__` | Default path |
| Advanced Approvals `sbaa__` | Describe Global: objects starting with `sbaa__` | Enable approval collector extension |
| CPQ not installed | No `SBQQ__` objects in Describe Global | Abort with clear message: "CPQ package not detected" |
| Partial CPQ installation | Some SBQQ objects missing | Run in degraded mode, skip missing object collectors |
| E-Signature packages | `echosign_dev1__` or `dsfs__` namespaces | Flag as integration dependency |

### 23.2 Field-Level Security (FLS)

Even if an object is visible, individual fields may be restricted. Per-object Describe returns only accessible fields. Handle via dynamic query construction (Section 18).

### 23.3 Record-Level Security

**Impact:** Usage analytics may undercount if the connected user lacks full visibility.

**Recommendation:** Connect with a user that has "View All Data" permission, or at minimum "View All" on CPQ objects.

### 23.4 Large Data Volumes

| Scenario | Object | Threshold | Handling |
|----------|--------|-----------|---------|
| Many products | Product2 | >2,000 | Switch to Bulk API 2.0 |
| Many quotes | SBQQ__Quote__c | >2,000 (in 90 days) | Already using Bulk API 2.0 |
| Many quote lines | SBQQ__QuoteLine__c | >10,000 (in 90 days) | Already using Bulk API 2.0 |
| Many contracted prices | SBQQ__ContractedPrice__c | >2,000 | Switch to Bulk API 2.0 |
| Many subscriptions | SBQQ__Subscription__c | >2,000 | Switch to Bulk API 2.0 |
| Many lookup data records | SBQQ__LookupData__c | >2,000 | Use Bulk API 2.0 (full extraction required for Decision Tables) |
| Many localizations | SBQQ__Localization__c | >2,000 | Switch to Bulk API 2.0 |

### 23.5 Bulk API 2.0 WHERE Clause Risks

> **Audit fix (Auditor 2 #4):** SOQL statements can't exceed 100,000 characters. Large IN clauses will fail.

- Never use IN clauses with more than 300 IDs per query
- Prefer direct date filters (`CreatedDate >= LAST_N_DAYS:90`) over relationship filters
- If relationship filters fail, use direct date filter + post-processing in app layer
- If batching IDs is necessary, chunk into groups of 300 max

### 23.6 CPQ Package Version Differences

Always validate field existence via Describe before including in queries. See Step 4.5 for version implications.

### 23.7 Sandbox vs Production Considerations

| Aspect | Sandbox | Production |
|--------|---------|------------|
| Data volume | May be subset (partial copy sandbox) | Full data |
| Configuration | Should mirror production | Authoritative |
| Usage data | May be stale or missing | Live, current |
| API limits | Same as production edition | Full limits |

**Recommendation:** For assessment accuracy, production connection is preferred. If only sandbox is available, note in the report.

### 23.8 Multi-Currency Orgs

If the org has multi-currency enabled (detect via `CurrencyIsoCode` in Quote Describe):
- Extract `CurrencyIsoCode` alongside all monetary fields
- Note currency distribution in usage analysis
- Flag for CPQ Settings review (multi-currency pricing behavior)

### 23.9 Person Accounts

Detect via: `SELECT Id FROM RecordType WHERE SObjectType = 'Account' AND IsPersonType = true LIMIT 1`

Informational — note in assessment if present.

### 23.10 Query Timeout on Large Objects

SOQL queries via REST API timeout after ~120 seconds. If a query times out:
- Reduce the date range
- Split field list (reduce formula field expansion)
- Switch to Bulk API 2.0

### 23.11 Deleted/Archived Records

SOQL queries exclude deleted records by default. This is correct for assessment. Exception: if the org uses custom "Archive" status on quotes, ensure the 90-day filter doesn't exclude recently-archived quotes.

---

## 24. Field Reference Tables

### 24.1 Product2 — Full CPQ Field Inventory

> These are the standard SBQQ__ managed package fields on Product2. Actual availability depends on CPQ version. Always validate via Describe.

| Field API Name | Type | Assessment Relevance | RCA Target |
|---------------|------|---------------------|------------|
| `SBQQ__ChargeType__c` | Picklist | One-Time/Recurring/Usage | Product Selling Model |
| `SBQQ__BillingType__c` | Picklist | Billing model (Arrears/Advance) | Revenue recognition |
| `SBQQ__BillingFrequency__c` | Picklist | Revenue recognition mapping | Pricing Procedure |
| `SBQQ__SubscriptionType__c` | Picklist | Renewable/One-Time/Evergreen | Asset Lifecycle Management |
| `SBQQ__SubscriptionPricing__c` | Picklist | Fixed/Percent of Total | Pricing Procedure |
| `SBQQ__ConfigurationType__c` | Picklist | Bundle type (Required/Allowed/Static) | PCM / Attribute-Based Config |
| `SBQQ__PricingMethod__c` | Picklist | List/Cost/Block/Percent/Custom | Pricing Procedure complexity |
| `SBQQ__ExternallyConfigurable__c` | Boolean | Uses external configurator | Integration mapping |
| `SBQQ__HasConfigurationAttributes__c` | Boolean | Has config attributes | ProductAttribute migration |
| `SBQQ__HasConsumptionSchedule__c` | Boolean | Usage-based pricing | ConsumptionSchedule mapping |
| `SBQQ__NonDiscountable__c` | Boolean | Cannot be discounted | Pricing Procedure constraint |
| `SBQQ__PriceEditable__c` | Boolean | Allow manual price override | Pricing Procedure |
| `SBQQ__DiscountSchedule__c` | Lookup | Volume discount schedule | Pricing Procedure |
| `SBQQ__BlockPricingField__c` | Picklist | Block pricing trigger field | Pricing Procedure |
| `SBQQ__GenerateContractedPrice__c` | Picklist | Auto-generate contracted price | Negotiated Prices |

### 24.2 Key Picklist Values to Track

| Field | Values | Why It Matters |
|-------|--------|----------------|
| `SBQQ__ChargeType__c` | One-Time, Recurring, Usage | Determines RCA Product Selling Model |
| `SBQQ__BillingType__c` | Arrears, Advance | Revenue recognition mapping |
| `SBQQ__SubscriptionType__c` | Renewable, One-time, Evergreen | Contract lifecycle in RCA |
| `SBQQ__PricingMethod__c` | List, Cost, Block, Percent of Total, Custom | Pricing Procedure complexity |
| `SBQQ__ConfigurationType__c` | Required, Allowed, Static | Bundle → attribute-based config |
| `SBQQ__Status__c` (Quote) | Draft, In Review, Approved, Denied, Presented, Accepted | Quote lifecycle tracking |

---

## Appendix A: CPQ Object Relationship Diagram

```
Product2
  ├── PricebookEntry (standard)
  ├── SBQQ__ProductFeature__c (1:M — bundle features)
  │     └── SBQQ__ProductOption__c (1:M — options within features)
  │           └── SBQQ__OptionConstraint__c (M:M — option dependencies)
  ├── SBQQ__ProductRule__c (1:M — validation/selection rules)
  │     └── SBQQ__ErrorCondition__c (1:M — rule conditions)
  ├── SBQQ__ConfigurationAttribute__c (1:M — config UI attributes → RCA ProductAttribute)
  ├── SBQQ__DiscountSchedule__c (0:1 — volume discount)
  │     └── SBQQ__DiscountTier__c (1:M — tier definitions)
  ├── SBQQ__BlockPrice__c (1:M — block pricing entries)
  ├── SBQQ__ContractedPrice__c (M — customer-specific prices → RCA Negotiated Prices)
  ├── SBQQ__ConsumptionSchedule__c (0:1 — usage-based pricing)
  │     └── SBQQ__ConsumptionRate__c (1:M — rate tiers)
  └── SBQQ__SearchFilter__c (1:M — search filters)

SBQQ__Quote__c → RCA: Standard Quote (enhanced)
  ├── SBQQ__QuoteLine__c (1:M — line items → RCA: Transaction Line Items)
  │     ├── Links to Product2
  │     ├── Links to SBQQ__DiscountSchedule__c
  │     ├── Links to SBQQ__BlockPrice__c
  │     └── Links to SBQQ__ProductOption__c (if from bundle)
  ├── SBQQ__QuoteLineGroup__c (1:M — line grouping)
  ├── SBQQ__QuoteDocument__c (1:M — generated documents)
  │     └── Links to SBQQ__QuoteTemplate__c
  └── Links to Account, Opportunity, Pricebook2

SBQQ__PriceRule__c → RCA: Pricing Procedures
  ├── SBQQ__PriceCondition__c (1:M — when to fire)
  └── SBQQ__PriceAction__c (1:M — what to do)

SBQQ__SummaryVariable__c → RCA: Pricing Procedure aggregates
SBQQ__CustomScript__c → RCA: Pricing Procedures (REWRITE)
SBQQ__LookupQuery__c → SBQQ__LookupData__c → RCA: Decision Tables
SBQQ__CustomAction__c → SBQQ__CustomActionCondition__c
SBQQ__Term__c (standalone — quote terms & conditions)
SBQQ__Subscription__c → RCA: Standard Subscription / ALM
SBQQ__Localization__c → RCA: Translation Workbench

Order/Contract/Asset (standard with SBQQ__ fields) → RCA: DRO / Enhanced Order Mgmt

Standard Salesforce Metadata (non-SOQL):
  ├── ApprovalProcess (on SBQQ__Quote__c)
  ├── Flow / ProcessDefinition (triggered by CPQ objects)
  ├── ApexClass / ApexTrigger (referencing CPQ)
  ├── ValidationRule (on CPQ objects)
  ├── WorkflowRule (on CPQ objects)
  ├── NamedCredential / RemoteSiteSetting (external integrations)
  └── ExternalServiceRegistration

CPQ Package Settings (Custom Settings):
  ├── SBQQ__GeneralSettings__c → RCA: Revenue Settings
  ├── SBQQ__PricingSettings__c → RCA: Salesforce Pricing Setup
  └── SBQQ__SubscriptionSettings__c → RCA: Subscription Config
```

---

## Appendix B: Collector Execution Order & Dependencies

```
Phase 1: Discovery (must complete first)
  └── Object & Field Discovery (Section 4)
       Output: validated object list, field maps (with Field Sets),
               limits snapshot, CPQ version, data size estimates

Phase 2: Parallel Extraction — Configuration (can run concurrently)
  ├── Catalog Collector (Section 5)        → uses: discovery field maps
  ├── Pricing Collector (Section 6)        → uses: discovery field maps
  ├── Template Collector (Section 7)       → uses: discovery field maps
  ├── Approval Collector (Section 8)       → uses: discovery field maps
  ├── Customization Collector (Section 9)  → uses: discovery Describe data
  ├── Localization Collector (Section 14)  → uses: discovery field maps
  └── CPQ Settings Collector (Section 15)  → uses: discovery object list

Phase 3: Parallel Extraction — Dependencies & Integrations (can run concurrently)
  ├── Dependency Collector (Section 10)    → uses: discovery object list
  └── Integration Collector (Section 11)   → uses: discovery object list

Phase 4: Usage Extraction (can run concurrently with Phases 2-3)
  ├── Usage Collector (Section 12)         → uses: Bulk API 2.0 (async)
  └── Order/Contract Collector (Section 13) → uses: Bulk API 2.0 if needed

Phase 5: Post-Processing
  ├── Twin Fields Analysis (Section 5.9)   → uses: Describe data from multiple objects
  ├── Post-Extraction Validation (Section 20) → uses: all extracted data
  └── Normalization → Assessment Graph (Section 22)
```

---

## Appendix C: Minimum Required Permissions

| Permission | Required For | Type |
|------------|--------------|------|
| **API Enabled** | All API calls | System Permission |
| **View All Data** (strongly recommended) | Full record visibility | System Permission |
| Read access to all `SBQQ__` objects | Configuration extraction | Object Permission |
| Read access to `Product2`, `Pricebook2`, `PricebookEntry` | Catalog extraction | Object Permission |
| Read access to `Opportunity`, `Account`, `Order`, `OrderItem`, `Contract`, `Asset` | Lifecycle data | Object Permission |
| `ViewSetup` or equivalent | Tooling API / Metadata access | System Permission |
| Read access to `ApexClass`, `ApexTrigger` | Dependency scan | Tooling API |
| Read access to `FlowDefinitionView`, `FlowVersionView` | Flow analysis | Tooling API |
| **Download AppExchange Packages** | CPQ version detection via InstalledSubscriberPackage | System Permission |
| `Modify Metadata` | Metadata API reads (approval processes, flows) | System Permission |

**Minimum viable permission set (if "View All Data" is not available):**
- API Enabled
- Read on all SBQQ__ objects and sbaa__ objects (if Advanced Approvals)
- Read on standard objects: Product2, Opportunity, Account, Order, OrderItem, Contract, Asset, Pricebook2, PricebookEntry
- Modify Metadata (for Metadata API reads)

> **Note:** If "Download AppExchange Packages" is not available, version detection falls back to Publisher query or namespace detection (see Step 4.5).

The preflight check (Step 4.2) validates these permissions before extraction begins.

---

## Appendix D: Glossary

| Term | Definition |
|------|-----------|
| **SBQQ** | Steelbrick Quote-to-Cash — namespace prefix for Salesforce CPQ managed package objects |
| **sbaa** | Steelbrick Advanced Approvals — separate managed package namespace |
| **RCA** | Revenue Cloud Advanced — Salesforce's next-generation CPQ replacement (formerly RLM, now evolving into Agentforce Revenue Management — same core architecture) |
| **BRE** | Business Rule Engine — RCA's engine for executing qualification, configuration, and pricing rules |
| **Hooks** | Apex Hooks for Pricing Procedures — RCA extension points for custom logic that can't be made declarative |
| **Pricing Recipe** | RCA object that groups Decision Tables; only one active recipe per org |
| **Context Definition** | RCA logical data model defining how information is structured and exchanged between records and procedures |
| **PSM** | Product Selling Model — RCA's product classification object (One-Time, Evergreen, Term-Defined) replacing CPQ picklist fields |
| **PCM** | Product Catalog Management — RCA's product catalog system |
| **CML** | Constraint Modeling Language — RCA's rule framework for product configuration |
| **DRO** | Dynamic Revenue Orchestrator — RCA's order lifecycle management |
| **ALM** | Asset Lifecycle Management — RCA's subscription/asset management |
| **QCP** | Quote Calculator Plugin — custom JavaScript that runs during CPQ quote calculation |
| **FLS** | Field-Level Security — Salesforce's per-field access control |
| **OWD** | Organization-Wide Defaults — Salesforce's default sharing model |
| **SOQL** | Salesforce Object Query Language |
| **Bulk API 2.0** | Salesforce's asynchronous bulk data query/load API |
| **Tooling API** | Salesforce API for metadata and development tool operations |
| **Metadata API** | Salesforce SOAP-based API for declarative metadata retrieval |
| **Composite Batch API** | Salesforce REST API for batching up to 25 sub-requests in one call |
| **Decision Tables** | RCA's data-driven lookup mechanism (replaces CPQ LookupQuery/LookupData) |
| **Pricing Procedures** | RCA's declarative, visual pricing engine (replaces CPQ Price Rules + QCP) |
| **Product Selling Model** | RCA's product classification (One-Time, Evergreen, Term-Defined) — see also PSM |
| **ProductAttribute** | RCA's attribute-based configuration object (replaces CPQ ConfigurationAttribute) |
| **Describe Global** | Salesforce API endpoint listing all visible objects |
| **Governor Limits** | Salesforce-enforced limits on API calls, query rows, etc. |
| **Connected App** | Salesforce OAuth application registration |
| **PKCE** | Proof Key for Code Exchange — OAuth security extension |

---

## Document Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0-draft | 2026-03-25 | Daniel + Claude | Initial specification |
| 2.0 | 2026-03-25 | Daniel + Claude | Full revision per dual audit. Added: RCA target model reference, Composite Batch API, dynamic query construction, CPQ Settings collector, Order/Contract/Asset collector, Localization collector, Consumption Schedules, full LookupData extraction, Field Sets extraction, Custom Metadata Types, Twin Fields analysis, per-query error handling, post-extraction validation, idempotency/checkpointing, assessment relationship graph, merge field regex patterns, Advanced Approvals config queries, document/image references, Opportunity sync health, TriggerControl analysis, phantom package detection, sharing rules extraction, Bulk API IN clause safety. Fixed: Metadata API confusion (SOAP vs REST), FlowDefinitionView vs FlowVersionView, Platform Events query, concurrent bulk job limits, InstalledSubscriberPackage permissions. |
| 2.1 | 2026-03-25 | Daniel + Claude | Final polish per v2 audit approval. Added: RCA API object names to mapping table (`ProductSellingModel`, `AttributeDefinition`, `ProductRelatedComponent`, `DecisionTable`, `PricingRecipe`, `ContextDefinition`, etc.), Pricing Recipes + BRE + Hooks to RCA model, Context Definition Blueprint derived analysis (Section 6.14), `productSellingModelCandidates` derived metric, Custom Labels extraction for localization, LookupQuery→Rule parent relationship for Recipe grouping, Qualification Rule Procedure mapping (split from CML). Fixed: Opportunity Sync Health query (split into valid aggregate SOQL), CPQ Settings discovery made dynamic (Tooling API enumeration instead of hardcoded names), Localization field names driven from Describe. Notes: Agentforce Revenue Management branding evolution, Sync Pricing Data operational concept, contracted pricing is procedure-driven in RCA. |
| 2.2 | 2026-03-25 | Daniel + Claude | Cross-reference audit against AllCloud Requirements + Product Spec. Added: Org Fingerprint extraction (Step 4.0 — Organization SOQL query for org ID, instance, edition, sandbox status, locale), synchronous dependency risk metric (sync vs. async classification of code dependencies), runtime estimation inputs (record counts + bulk job estimates for orchestrator). Restored: contracted price derived metrics (totalContractedPrices, activeContractedPrices, uniqueAccounts/Products — dropped during v2 restructuring). Both auditors confirmed: spec covers 100% of AllCloud Requirements and 95%+ of Product Spec data requirements. |
