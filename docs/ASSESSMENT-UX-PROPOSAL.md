# CPQ Migration Assessment — UI/UX Design Proposal

> **Purpose:** Define how RevBrain displays the CPQ→RCA migration assessment as an interactive workspace rather than a static PDF. This document provides full context for an external UI/UX design review.
>
> **Date:** 2026-03-24
> **Author:** Daniel + Claude
> **Audience:** UI/UX designers, product reviewers, external consultants

---

## 1. Problem Statement

When a Salesforce consulting partner (SI) sells a CPQ-to-Revenue Cloud migration, the first deliverable is a **60-100 page assessment document**. This document is the scoping artifact — it determines budget, timeline, team size, and go/no-go decisions.

Today, producing this document requires **3 people × 4-8 weeks** of manual work: connecting to the Salesforce org, inventorying hundreds of objects, interviewing stakeholders, analyzing custom code, mapping CPQ features to RCA equivalents, identifying gaps, estimating effort, and documenting everything in a branded PDF.

**RevBrain's value proposition:** automate the 60-70% of this work that is archaeology (scanning, inventorying, mapping, gap analysis) so consultants spend their time on the 30-40% that requires human judgment (business context, strategy, recommendations).

**The design challenge:** replace a linear, 100-page PDF with an interactive workspace that is more useful than the PDF, while still producing a polished, branded PDF export when needed.

---

## 2. Current RevBrain Design Context

### Application Shell

RevBrain is a multi-tenant SaaS for Salesforce consulting partners. The application has two levels:

**Org-level (main app):**
- Left sidebar: Dashboard, My Projects, Customers, Reports & Invoices, Settings, Help
- Dark gradient sidebar (`from-[#1e293b]` to `[#0f172a]`), white content area
- User profile at bottom of sidebar

**Project-level (workspace):**
- Left sidebar with project-specific navigation in three groups:
  - **MIGRATION:** Overview, CPQ Explorer, Assessment, Deployment
  - **OPERATIONS:** Runs, Issues
  - **PROJECT:** Team, Activity, Artifacts & Docs, Settings
- Same dark sidebar design
- Connection status panel at bottom of sidebar (source/target org status, API budget)
- Locked items with tooltips for features not yet available (progressive unlock)

### Design Language

| Token | Color | Usage |
|---|---|---|
| Active / Connected / Pass / Auto | `emerald-500` | Success states, auto-mappable items |
| Warning / Needs Attention / Guided | `amber-500` | Review needed, guided items |
| Error / Failed / Manual | `red-500` | Failures, manual-only items |
| In Progress / Running | `violet-500` | Active operations |
| Locked / Unavailable / Blocked | `slate-400` | Disabled items, blockers |
| Info / Neutral | `sky-500` | Informational items |

- Cards: `rounded-2xl`, no borders, `bg-white` on `bg-slate-50` background
- Typography: Inter font, `text-slate-900` for headings, `text-slate-500` for secondary
- Interactive hover: subtle shadow + slight vertical lift (`hover:shadow-md hover:-translate-y-0.5`)
- RTL support for Hebrew (logical CSS properties throughout)
- No borders on cards — background contrast creates visual separation
- `max-w-7xl mx-auto` for centered content on wide screens

### Current Assessment Page

The Assessment page currently exists as a placeholder with three tabs:
1. **Report** — stakeholder-facing complexity breakdown (Auto/Guided/Manual/Blocked)
2. **Mapping** — CPQ→RCA object mapping table
3. **Migration Plan** — user-owned phase planning

This proposal expands the Assessment from a single page into a **multi-page workspace** that replaces the traditional PDF assessment document.

---

## 3. Information Architecture

The assessment should be structured as a **layer cake** — progressive disclosure from executive summary to raw evidence.

```
┌─────────────────────────────────────────────────────────┐
│  LAYER 0: Executive Command Center                      │
│  "Give me the answer in 30 seconds"                     │
│  → What is the migration complexity? What are the risks? │
│  → How much effort? What approach?                       │
├─────────────────────────────────────────────────────────┤
│  LAYER 1: Domain Dashboards (9 domains)                 │
│  "Show me everything about pricing"                     │
│  → Per-domain: stats, inventory, migration status,      │
│    insights, drill-down tables                           │
├─────────────────────────────────────────────────────────┤
│  LAYER 2: Item-Level Detail                             │
│  "Show me this specific price rule"                     │
│  → Individual rule/object detail, field mapping,        │
│    dependencies, code view, migration recommendation     │
├─────────────────────────────────────────────────────────┤
│  LAYER 3: Evidence & Raw Data                           │
│  "Show me the actual config / code / screenshot"        │
│  → Raw Salesforce metadata, code with syntax highlight, │
│    API responses, comparison views                       │
├─────────────────────────────────────────────────────────┤
│  HORIZONTAL CAPABILITIES (available on every layer)      │
│  → Export (PDF, CSV, share link)                         │
│  → AI Chat Assistant (context-aware)                     │
│  → Search (⌘K command palette)                           │
│  → Bookmarks / Annotations                               │
└─────────────────────────────────────────────────────────┘
```

---

## 4. Navigation Design Decision: Tabs vs. Sidebar

### The Question

The assessment covers 9 domains (Products, Pricing, Rules, Custom Code, Integrations, Amendments/Renewals, Approvals, Documents, Data & Reporting). Should these be:

**Option A:** Tabs within the existing Assessment page (keeping the sidebar unchanged)
**Option B:** Sub-pages under Assessment in the project sidebar
**Option C:** A domain sidebar within the Assessment page content area (nested sidebar)

### Recommendation: Option A — Horizontal Tabs + Vertical Sub-tabs

**Why:** The project sidebar already has 10 items across 3 groups. Adding 9+ Assessment sub-items would make the sidebar scroll-heavy and dilute the project-level navigation. Instead, the Assessment page becomes a **mini-app within the workspace** with its own tab-based navigation.

```
┌─ PROJECT SIDEBAR ─┐  ┌─────────────────────────────────────────────────┐
│                    │  │  Assessment                        [Export ▾]   │
│  MIGRATION         │  │                                                 │
│  ◉ Overview        │  │  [Overview][Products][Pricing][Rules][Code]     │
│  ○ CPQ Explorer    │  │  [Integrations][Amendments][Approvals]         │
│                    │  │  [Documents][Data & Reporting]                  │
│  ● Assessment  ←── │  │                                                 │
│  ○ Deployment      │  │  ┌─────────────────────────────────────────┐   │
│                    │  │  │                                         │   │
│  OPERATIONS        │  │  │         TAB CONTENT AREA                │   │
│  ...               │  │  │                                         │   │
│                    │  │  │  (changes based on selected tab)        │   │
│  PROJECT           │  │  │                                         │   │
│  ...               │  │  └─────────────────────────────────────────┘   │
│                    │  │                                                 │
└────────────────────┘  └─────────────────────────────────────────────────┘
```

The Assessment tab in the sidebar becomes the **entry point**. Once inside, horizontal tabs across the top let the user navigate between domains. The first tab ("Overview") is the Executive Command Center.

**Tab behavior:**
- Tabs persist in URL: `/project/:id/assessment?tab=pricing`
- Active tab has violet underline
- Tabs scroll horizontally on smaller screens
- Badge on tabs with issues: "Pricing ⚠️" or "Code 3" (count of blockers/findings)
- Each tab loads its own content — no full-page navigation

---

## 5. Screen Designs

### 5.1 Assessment Overview (Executive Command Center)

**Route:** `/project/:id/assessment?tab=overview`

This is what the VP of Revenue Ops opens. In 30 seconds, they know the migration scope, complexity, top risks, and recommended approach.

**Layout:**

```
┌──────────────────────────────────────────────────────────────┐
│  Assessment                               Run #3 · 12m ago  │
│  [Overview] [Products] [Pricing] ... [Documents] [Data & Rpt] [Export ▾] │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  MIGRATION READINESS                                         │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐    │
│  │ Auto     │  │ Guided   │  │ Manual   │  │ Blocked  │    │
│  │ 82       │  │ 47       │  │ 23       │  │ 5        │    │
│  │ ████████ │  │ ██████░░ │  │ ███░░░░░ │  │ █░░░░░░░ │    │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘    │
│                                                              │
│  COMPLEXITY BY DOMAIN                                        │
│  ┌───────────────────────────────────────────────────────┐   │
│  │ Products     ██████░░░░  Mod.   187 items   →         │   │
│  │ Pricing      █████████░  High   243 rules   → ⚠️      │   │
│  │ Rules        ███████░░░  High    89 rules   →         │   │
│  │ Custom Code  ████████░░  High   112 items   → ⚠️      │   │
│  │ Integrations ██████░░░░  Mod.    11 systems →         │   │
│  │ Amendments   ████████░░  High    34 flows   → ⚠️      │   │
│  │ Approvals    █████░░░░░  Mod.    18 chains  →         │   │
│  │ Documents    ████░░░░░░  Low      7 templ.  →         │   │
│  │ Data & Rpt.  ███████░░░  Mod.   450K recs   →         │   │
│  └───────────────────────────────────────────────────────┘   │
│  (each row clickable → navigates to that domain tab)         │
│                                                              │
│  ┌─ TOP RISKS ──────────────┐  ┌─ BLOCKERS ──────────────┐  │
│  │ 🔴 Calculator plugins    │  │ 🚫 MDQ has no RCA parity│  │
│  │    require full rewrite   │  │    for 23 products      │  │
│  │    (3 plugins, ~4200 LOC) │  │                         │  │
│  │                           │  │ 🚫 Custom QLE component │  │
│  │ 🔴 12 integrations       │  │    "DealOptimizer" has  │  │
│  │    reference CPQ objects  │  │    no RCA equivalent    │  │
│  │                           │  │                         │  │
│  │ [View all 23 risks →]    │  │ [View all 8 blockers →] │  │
│  └───────────────────────────┘  └─────────────────────────┘  │
│                                                              │
│  KEY FINDINGS                                                │
│  ✅ Bundle structure compatible with Product Selling Models  │
│  ✅ Standard product mappings available in RCA               │
│  ⚠️ 3 price rules use SOQL lookups — manual review needed   │
│  ⚠️ Discount tiers use custom formula — partial RCA match   │
│  🔴 QCP onBeforeCalculate has external callout (142 LOC)    │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

**Additional Overview sections (below the current layout):**

```
│                                                              │
│  READINESS PREREQUISITES                                     │
│  ┌──────────────────────────────────────────────────────┐    │
│  │ ✅ Salesforce Edition: Enterprise (compatible)        │    │
│  │ ⚠️ RCA Licenses: Not detected — required for deploy  │    │
│  │ ✅ Org Health: API 42% · Storage 61% · Apex 28%      │    │
│  │ ⚠️ Salesforce Billing: Detected — expands scope      │    │
│  │ ✅ Governor Limits: No migration-blocking limits      │    │
│  └──────────────────────────────────────────────────────┘    │
│                                                              │
│  MIGRATION STRATEGY SUMMARY                                  │
│  ┌──────────────────────────────────────────────────────┐    │
│  │ Recommended Approach: Phased (3 phases)               │    │
│  │                                                       │    │
│  │  Phase 1: Core (Products + Pricing)     → 8-12 wks   │    │
│  │  Phase 2: Extensions (Rules + Code)     → 6-10 wks   │    │
│  │  Phase 3: Integrations + Cutover        → 4-6 wks    │    │
│  │                                                       │    │
│  │  Key Assumptions:                                     │    │
│  │  · Parallel run period included                       │    │
│  │  · Inactive items excluded from scope                 │    │
│  │  · [Edit assumptions →]                               │    │
│  │                                                       │    │
│  │  [Open Migration Plan tab →]                          │    │
│  └──────────────────────────────────────────────────────┘    │
│                                                              │
│  ASSESSMENT COMPLETENESS                                     │
│  ━━━━━━━━━━━━━━━━━━━░░░░░  78%                              │
│  ✅ Org scanned (Run #3, Jan 15)                             │
│  ✅ All domains inventoried                                   │
│  ✅ Gap analysis generated                                    │
│  ⬜ 23 items untriaged in Pricing                            │
│  ⬜ Business process notes not added                          │
│  ⬜ Effort estimation not filled in                           │
│  ⬜ Risk mitigations not assigned                             │
│  ⬜ Consultant sections incomplete (3 of 5 empty)            │
│  ⬜ PDF not yet generated                                     │
│                                                              │
```

**Design notes:**
- Complexity heatmap bars use the same color system: low (emerald→amber→red) high
- Each heatmap row is clickable — navigates to that domain's tab
- Warning icon (⚠️) on rows with high complexity or blockers
- The 4-category breakdown (Auto/Guided/Manual/Blocked) uses the unified terminology from our design tokens
- No single "complexity score" number — auditors rejected this (no benchmark data to make it meaningful). The 4-category breakdown IS the honest representation.
- Key findings use severity icons with colors: ✅ emerald, ⚠️ amber, 🔴 red
- "Run #3 · 12m ago" dropdown allows switching between historical assessment snapshots
- Readiness Prerequisites: auto-detected from org metadata scan. License and Billing items are go/no-go flags — use amber/red for missing/detected items that expand scope.
- Migration Strategy Summary: initially auto-suggested based on scan complexity, consultant edits. Links to the existing Migration Plan tab for detailed phase planning.
- Assessment Completeness: tracks both automated steps (scan, inventory, gap analysis) and consultant steps (triage, business context, effort estimation, consultant sections). Keeps the consultant inside the tool instead of tracking progress elsewhere.

### 5.2 Domain Dashboard (Example: Pricing)

**Route:** `/project/:id/assessment?tab=pricing`

When the user clicks "Pricing" from the tab bar or heatmap, they see a domain-specific dashboard.

**Layout:**

```
┌──────────────────────────────────────────────────────────────┐
│  Assessment > Pricing                           [Export CSV] │
│  [Overview] [Products] [●Pricing] [Rules] ...                │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐       │
│  │ 243      │ │ 47       │ │ 12       │ │ 3        │       │
│  │ Total    │ │ High     │ │ With     │ │ Calc.    │       │
│  │ Rules    │ │ Complex. │ │ Apex     │ │ Plugins  │       │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘       │
│                                                              │
│  RCA MIGRATION STATUS                                        │
│  ┌───────────────────────────────────────────────────────┐   │
│  │  ████████████████████████░░░░░░░░░░░░░░░░░░░░░░░░░░  │   │
│  │  ██ Auto (34%)  ██ Guided (41%)  ░░ Manual/Gap (25%) │   │
│  │                                                       │   │
│  │  82 rules → Pricing Procedures (direct mapping)       │   │
│  │  100 rules → Pricing Procedures (needs redesign)      │   │
│  │  61 rules → No RCA equivalent (custom dev needed)     │   │
│  └───────────────────────────────────────────────────────┘   │
│                                                              │
│  PRICE RULES INVENTORY                                       │
│  Filter: [Complexity ▾] [Status ▾] [Active ▾] [Search... ]  │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐  │
│  │ Name              │ Complexity │ Status    │ Apex? │ → │  │
│  ├───────────────────┼────────────┼───────────┼───────┼───┤  │
│  │ Enterprise Vol.   │ 🔴 High    │ ⚠️ Gap    │ Yes   │ → │  │
│  │ Partner Tier      │ 🔴 High    │ 🔄 Guided │ Yes   │ → │  │
│  │ Geo-based Markup  │ 🟡 Medium  │ 🔄 Guided │ No    │ → │  │
│  │ Standard List     │ 🟢 Low     │ ✅ Auto   │ No    │ → │  │
│  │ ... 239 more                                          │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                              │
│  INSIGHTS                                                    │
│  💡 47 rules have complexity ≥ 7 — they drive 78% of the   │
│     estimated pricing migration effort.                      │
│  💡 12 rules reference Apex classes — cannot be auto-mapped. │
│  💡 31 rules are inactive. Consider retiring them to reduce │
│     migration scope. [View inactive →]                       │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

**Design notes:**
- Stats strip at top — same card style as the rest of the app (rounded-2xl, no border)
- Migration status bar — a horizontal stacked bar showing the proportion of Auto/Guided/Manual items. Uses our color tokens (emerald/amber/red). Pure CSS, no charting library.
- Inventory table — sortable, filterable, searchable. Each row is clickable → opens item detail. This is the **Layer 2** drill-down.
- Insights panel — auto-generated observations below the table. These are the "smart findings" that save the consultant from having to manually spot patterns.
- Arrow (→) on each row indicates it's clickable for detail view
- Export CSV button — the consultant's table goes directly to their spreadsheet

### 5.3 Item Detail (Slide-Over Panel)

When the user clicks a specific item (e.g., "Enterprise Volume Discount" price rule), a **slide-over panel** opens from the right side (or left in RTL). This is **Layer 2** detail.

**Layout:**

```
┌─ SLIDE-OVER PANEL (max-w-2xl) ──────────────────────────────┐
│                                                              │
│  Enterprise Volume Discount               [Close ✕]         │
│  SBQQ__PriceRule__c                                          │
│                                                              │
│  ┌─ STATUS ──────────────────────────────────────────────┐   │
│  │  Complexity: 🔴 High (9/10)                           │   │
│  │  Migration:  ⚠️ Gap — No direct RCA equivalent        │   │
│  │  Active:     Yes                                       │   │
│  │  Last modified: Jan 12, 2025                           │   │
│  └───────────────────────────────────────────────────────┘   │
│                                                              │
│  PLAIN ENGLISH DESCRIPTION                                   │
│  "If the customer is in EMEA and orders more than 100 units  │
│   of any Hardware product, apply a 15% volume discount       │
│   on the entire quote line group."                           │
│  [Toggle: View raw formula →]                                │
│                                                              │
│  CPQ → RCA MAPPING                                           │
│  ┌─ CPQ (current) ──────────┐  ┌─ RCA (target) ──────────┐ │
│  │ SBQQ__PriceRule__c       │  │ PricingProcedure        │ │
│  │ + 8 PriceActions         │  │ + PricingProcedureStep  │ │
│  │ + 3 PriceConditions      │  │ + ContextDefinition     │ │
│  │ + Apex: VolumeCalc.cls   │  │                         │ │
│  │                           │  │ ⚠️ Apex logic must be  │ │
│  │                           │  │   rewritten as pricing  │ │
│  │                           │  │   procedure steps       │ │
│  └───────────────────────────┘  └─────────────────────────┘ │
│                                                              │
│  DEPENDENCIES                                                │
│  · Referenced by: 4 products, 2 quote templates              │
│  · Depends on: Apex class VolumeCalc.cls (89 LOC)           │
│  · Related rules: Partner Tier Pricing, Geo Markup           │
│                                                              │
│  RECOMMENDATION                                              │
│  This rule requires manual redesign as an RCA Pricing        │
│  Procedure. The Apex dependency (VolumeCalc.cls) must be     │
│  rewritten as declarative pricing procedure steps.           │
│  Estimated effort: 16-24 hours.                              │
│                                                              │
│  CONSULTANT NOTES                                            │
│  [Add a note...]                                             │
│                                                              │
│  [View in CPQ Explorer →]  [View Apex Code →]               │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

**Design notes:**
- Same slide-over pattern as our Customer detail drawer (max-w-2xl, slide from end)
- "Plain English" description is AI-generated from the rule's conditions/actions — the killer feature for non-technical stakeholders
- CPQ → RCA split view shows current state and target state side by side
- Dependencies list is clickable — navigating to related items
- Consultant Notes — free-text area for human context that the tool can't automate
- Recommendation — auto-generated suggestion with effort estimate
- Links to CPQ Explorer and code viewer for raw evidence

### 5.4 The Domains

Each domain tab follows the same pattern: stats strip → migration status bar → inventory table → insights → business context area. Domains with significant sub-areas use **vertical sub-tabs** within the tab content area.

```
┌──────────────────────────────────────────────────────────────┐
│  Assessment > Products                         [Export CSV]  │
│  [Overview] [●Products] [Pricing] [Rules] ...                │
├──────────────────────────────────────────────────────────────┤
│  ┌──────────────────┐ ┌────────────────────────────────────┐ │
│  │ Sub-tabs:        │ │                                    │ │
│  │ ● Catalog        │ │  Sub-tab content area              │ │
│  │ ○ Guided Selling │ │  (stats, table, insights)          │ │
│  │ ○ QLE Customs.   │ │                                    │ │
│  │ ○ Twin Fields    │ │                                    │ │
│  └──────────────────┘ └────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────┘
```

Sub-tabs appear as a vertical pill list on the leading side of the tab content. Domains without sub-areas show content directly (no sub-tab sidebar). Sub-tab selection persists in URL: `?tab=products&sub=guided-selling`.

#### Domain Tab Reference

| Tab | Sub-tabs | What It Covers | Key Metrics |
|---|---|---|---|
| **Products** | Catalog, Guided Selling, QLE Customizations, Twin Fields | Product catalog, bundles, features, options, configuration attributes, guided selling flows, QLE customizations, twin field mappings | Product count, bundle depth, option complexity, guided flow count, QLE custom components, twin field pairs |
| **Pricing** | Price Rules, Contracted Pricing, Multi-Currency | Price rules, discount schedules, price books, calculator plugins, contracted/special pricing, multi-currency configuration | Rule count, complexity distribution, Apex dependencies, contracted price records, active currencies |
| **Rules** | *(no sub-tabs)* | Product rules, validation rules, summary variables, lookup queries | Rule count by type (validation/alert/selection/filter) |
| **Code** | Code Inventory, Security & Permissions | Apex classes, triggers, LWC/Aura, QCP (JavaScript), Flows, permission sets referencing CPQ, sharing rules, FLS configurations | LOC count, CPQ dependency %, code complexity, permission set count, sharing rule count |
| **Integrations** | External Systems, Package Dependencies, Experience Cloud, Salesforce Billing | External systems connected to CPQ, middleware, data flows, managed packages referencing CPQ objects, Experience Cloud CPQ components, Salesforce Billing objects | System count, integration direction, risk level, package count, billing object count |
| **Amendments** | Amendments, Renewals, Subscription Management | Amendment behavior, renewal models, co-termination, proration, MDQ, evergreen vs end-dated, uplift/escalation | Process count, customization depth, MDQ product count, subscription model type |
| **Approvals** | *(no sub-tabs)* | Approval chains, advanced approvals, smart approvals | Chain count, approval variables, custom logic |
| **Documents** | Templates, Merge Fields, Output Formats | Quote templates, template sections, conditional logic, merge field mapping (CPQ → RCA DocGen), output formats, multi-language handling | Template count, section count, merge field count, conditional rules |
| **Data & Reporting** | Data Volumes, Reports & Dashboards, Org Health, Licenses & Edition | Record counts, data quality, historical data analysis, reports/dashboards referencing CPQ objects, governor limits, storage, current edition, license inventory | Record counts, data quality score, report count, dashboard count, limits usage %, license types |

#### New Sub-tab Details

**Products → Guided Selling Flows:**
Inventory of wizard-like flows that auto-configure product selections for sales reps. Must be rebuilt in OmniStudio (FlexCards/OmniScripts) for RCA. Each flow shows: name, step count, input fields, output product mappings, conditional branching, and RCA equivalent approach.

**Products → QLE Customizations:**
The Quote Line Editor is the primary CPQ UI for sales reps. Many orgs customize it extensively: custom columns, buttons, JavaScript, lookup fields, page layout overrides, QLE plugins. All break in RCA (completely different configuration UI). Each customization shows: type, description, affected UI area, and migration approach.

**Products → Twin Fields:**
CPQ twin fields automatically sync values between related objects (e.g., Quote ↔ Opportunity, Quote Line ↔ Order Product). These are configured via CPQ settings, not visible in Apex/Flow. Missing a twin field causes post-migration data inconsistencies. Each pair shows: source object.field, target object.field, sync direction, and RCA recreation approach.

**Pricing → Contracted Pricing:**
Customer-specific pricing agreements (contracted prices, special prices). Shows: number of contracted price records, accounts with special pricing, expiration handling, override logic, and RCA mapping (which works differently).

**Pricing → Multi-Currency:**
Active currencies, exchange rate management approach, dated exchange rates usage, and impact on pricing/templates/reporting/integrations. Flags RCA multi-currency compatibility issues.

**Code → Security & Permissions:**
Permission sets referencing CPQ objects, sharing rules on CPQ objects, field-level security configurations, profile-level access, record type assignments. These must be mapped to RCA's object model. Feeds effort estimate for "security model migration."

**Integrations → Package Dependencies:**
Managed packages installed alongside CPQ (DocuSign, Conga, DealHub, LeanData, nCino, etc.) that reference CPQ objects. Shows: package name, version, CPQ object references, and impact assessment for post-migration.

**Integrations → Experience Cloud:**
Detection of CPQ components exposed through Experience Cloud (partner quoting, self-service). Shows: site name, exposed CPQ components, guest user access, partner-specific pricing/product visibility rules.

**Integrations → Salesforce Billing:**
If detected, inventories Salesforce Billing objects, billing-specific customizations, and impact on billing pipeline post-CPQ removal. If Billing is present, this sub-tab gets prominent visual treatment (it doubles migration complexity).

**Amendments → Subscription Management:**
Granular breakdown of subscription-specific complexities:
- **Co-termination** — how new subscriptions align to existing contract end dates
- **Proration rules** — partial period calculation methods
- **Evergreen vs. end-dated** — subscription model in use
- **MDQ (Multi-Dimensional Quoting)** — products quoted across time segments (known partial-parity area, frequent blocker)
- **Uplift/escalation** — automatic price increases on renewals
- **Subscription term handling** — term calculation, defaults, overrides

Each has a different RCA equivalent (or gap). MDQ items flagged with blocker status if detected.

**Documents (full tab):**
Quote templates are deceptively complex — often 5-8 pages in professional assessments. Template inventory with section-level detail, merge field mapping (CPQ merge fields → RCA document generation equivalents), conditional section logic, grouping behavior, multi-language handling, and per-template migration status.

**Data & Reporting → Reports & Dashboards:**
Reports and dashboards built on CPQ objects (SBQQ__Quote__c, SBQQ__QuoteLine__c, etc.) all break when CPQ is decommissioned. Shows: report count, dashboard count, folders/ownership, last run date (actively used vs. stale), and which need rebuilding on RCA objects. This is often the surprise scope that blows timelines.

**Data & Reporting → Org Health:**
Current API consumption, Apex execution time budget, storage usage, and whether the org is near governor limits that could affect migration activities (bulk data loads, deployments). Flags risks if limits are tight.

**Data & Reporting → Licenses & Edition:**
Current Salesforce edition, CPQ license count/type, whether required RCA licenses (Industry Cloud) are in place, and cost implications. This is a go/no-go consideration — if additional licenses are needed, that cost belongs in the assessment.

### 5.5 CPQ → RCA Translation Matrix

A dedicated view (accessible from each domain tab via a "View Mappings" button) showing the side-by-side translation of CPQ concepts to RCA:

```
┌──────────────────────────────────────────────────────────────┐
│  CPQ → RCA Mapping                           [Export CSV]    │
│                                                              │
│  Filter: [Domain ▾] [Status ▾] [Search...]                  │
│                                                              │
│  ┌──────────────┬────────────────────┬────────┬──────────┐  │
│  │ CPQ Feature   │ RCA Equivalent     │ Status │ (?) Info │  │
│  ├──────────────┼────────────────────┼────────┼──────────┤  │
│  │ Product       │ Product Selling    │ ✅ Auto│ (?)      │  │
│  │ Bundles       │ Model              │        │          │  │
│  ├──────────────┼────────────────────┼────────┼──────────┤  │
│  │ Price Rules   │ Pricing Procedures │ 🔄 Gui.│ (?)      │  │
│  ├──────────────┼────────────────────┼────────┼──────────┤  │
│  │ QCP (JS)      │ Pricing Proc.     │ 🔴 Man.│ (?)      │  │
│  │               │ + custom Apex      │        │          │  │
│  ├──────────────┼────────────────────┼────────┼──────────┤  │
│  │ Quote Templ.  │ OmniStudio DocGen │ 🔄 Gui.│ (?)      │  │
│  └──────────────┴────────────────────┴────────┴──────────┘  │
│                                                              │
│  (?) icon opens a popover with:                              │
│  - What this RCA concept is (1-2 sentences)                  │
│  - How it differs from CPQ                                   │
│  - Link to Salesforce documentation                          │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

The (?) popovers are **educational content** — they teach CPQ experts about RCA. This is proprietary knowledge that becomes a competitive moat.

---

## 6. Export & Share

The assessment workspace must produce polished output:

### Branded PDF Export

A "Generate Report" button produces a professional PDF that uses the **customer's brand colors and logo** (set in the Customer detail drawer). The PDF follows the traditional 60-100 page structure but is auto-populated:

- Cover page with customer logo, brand colors, date, RevBrain branding
- Executive summary with the 4-category breakdown
- Per-domain sections with stats, inventory tables, migration status
- Gap analysis matrix
- Risk summary
- Appendices with full inventory tables

The consultant reviews the PDF, adds any human-judgment sections (business process notes, strategic recommendations), and delivers it to the client.

### CSV Export

Every inventory table has a "Export CSV" button. Enterprise users always end up copying data into spreadsheets.

### Share a View

"Copy Link" on any filtered view → produces a URL that opens exactly to that state. Example: `/project/:id/assessment?tab=pricing&filter=complexity:high&status=gap`

This enables: "Hey, look at these 47 high-complexity pricing rules" → share link in Slack → recipient sees exactly that filtered view.

---

## 7. AI Chat Assistant (Future — v1.1)

A collapsible chat panel on the right edge of the assessment workspace. Context-aware:

- If the user is on the Pricing tab: "I see you're looking at Pricing. You have 243 rules, 47 are high complexity. What would you like to know?"
- "Explain this price rule in plain English" → generates human-readable description
- "Show me all rules that affect the Enterprise product line" → generates filtered table inline
- "What's the risk if we skip migrating inactive rules?" → generates analysis
- "Summarize the top 5 risks for my executive presentation" → generates slide-ready bullets

This is deferred from v1 but the UI should reserve space for it (collapsible right panel).

---

## 8. How This Replaces the PDF

| PDF Section | RevBrain Equivalent | Coverage |
|---|---|---|
| Executive Summary (5-10 pages) | Overview tab — readiness cards, heatmap, risks, blockers, prerequisites, migration strategy summary | ✅ Auto + consultant review |
| Current State — Business Process (10-15 pages) | Business Context sections per domain tab + Consultant Workspace templates (see §12) | 🟡 Structured templates, consultant-authored |
| Current State — Technical Inventory (15-25 pages) | 9 domain tabs with auto-generated inventories and sub-tabs | ✅ Fully automated |
| Guided Selling / QLE / Twin Fields | Products tab sub-tabs (Guided Selling, QLE Customizations, Twin Fields) | ✅ Auto-scanned |
| Contracted Pricing / Multi-Currency | Pricing tab sub-tabs (Contracted Pricing, Multi-Currency) | ✅ Auto-scanned |
| Quote Templates / Document Generation | Documents tab — templates, sections, merge fields, conditional logic, output formats | ✅ Auto-scanned |
| Subscription Management Details | Amendments tab → Subscription Management sub-tab (co-term, proration, MDQ, evergreen, uplift) | ✅ Auto-scanned + consultant context |
| Reports & Dashboards Impact | Data & Reporting tab → Reports & Dashboards sub-tab | ✅ Auto-scanned |
| Security / Permissions / Sharing | Code tab → Security & Permissions sub-tab | ✅ Auto-scanned |
| Package Dependencies | Integrations tab → Package Dependencies sub-tab | ✅ Auto-scanned |
| Experience Cloud / Portal Impact | Integrations tab → Experience Cloud sub-tab | ✅ Auto-detected |
| Salesforce Billing | Integrations tab → Salesforce Billing sub-tab (if detected) | ✅ Auto-detected |
| Org Health / Governor Limits | Data & Reporting tab → Org Health sub-tab + Overview prerequisites | ✅ Auto-scanned |
| Licenses & Edition | Data & Reporting tab → Licenses & Edition sub-tab + Overview prerequisites | ✅ Auto-detected |
| RCA Target Architecture (8-12 pages) | Translation Matrix + Consultant Workspace → Target Architecture template (see §12) | 🟡 Auto-mapping + consultant design |
| Gap Analysis (8-12 pages) | Migration status bars + per-item status + RCA Target column in every table | ✅ Fully automated |
| Risk Assessment (5-8 pages) | Full Risk Register (§11.5) with category, severity, affected items, mitigation, owner | ✅ Auto-detected + consultant-enriched |
| Migration Strategy (5-8 pages) | Overview → Migration Strategy Summary + Migration Plan tab | 🟡 Auto-suggested + consultant-authored |
| Effort Estimation (5-8 pages) | Effort Estimation table (§11.3) with auto-populated counts + consultant hours | 🟡 Auto-populated structure + consultant hours |
| Testing Strategy (5-8 pages) | Consultant Workspace → Testing Strategy template (see §12) | 🟡 Pre-populated categories + consultant plan |
| Change Management & Training (3-5 pages) | Consultant Workspace → Change Management template (see §12) | 🟡 User persona detection + consultant plan |
| Performance Baseline | Data & Reporting tab → Org Health sub-tab (performance metrics section) | ✅ Auto-measured |
| Appendices (10-20 pages) | CSV exports + full inventory tables in each domain tab | ✅ Fully automated |

**What RevBrain automates:** ~70-80% (inventory, scanning, gap mapping, risk detection, insights, org health, license detection, report/dashboard inventory, package dependencies, subscription details, guided selling detection)
**What the consultant adds with structured templates:** ~15-20% (business context, target architecture, testing strategy, change management, effort hours)
**Pure human judgment:** ~5-10% (strategic recommendations, organizational risk assessment, political considerations)

---

## 9. Design Principles for This Feature

1. **Progressive disclosure** — executive summary first, drill down to raw code last
2. **Interactive over static** — filter, sort, search, click through. A PDF is read; this is explored.
3. **Translation, not just inventory** — don't just list CPQ objects; explain what they mean and how they map to RCA
4. **Insights over data** — auto-generated observations ("47 rules drive 78% of effort") save the consultant from pattern-spotting
5. **Consultant workflow, not just viewer** — notes, annotations, triage (include/exclude/needs review), and branded export
6. **Same design language** — rounded-2xl cards, no borders, emerald/amber/red/violet color tokens, RTL-safe, translated

---

## 10. Design Review — Resolved Questions

These were open questions in v1. Both external reviewers agreed on the answers.

### Q1: Numeric Scores vs. Verbal Labels → **Verbal Labels**

Kill numeric scores (6/10). Without cross-project benchmarks, numbers are arbitrary and invite arguments ("Why is our pricing a 9 and not a 7?"). Use three verbal levels:

- 🟢 **Low** (emerald) — straightforward migration
- 🟡 **Moderate** (amber) — needs attention but manageable
- 🔴 **High** (red) — significant complexity, major effort

The 4-category item counts (Auto/Guided/Manual/Blocked) are the quantitative layer — they're based on actual data. Domain-level assessment stays verbal.

### Q2: AI-Generated Content Differentiation → **Sparkle Icon + Edit/Verify**

```
┌─ AI-GENERATED ─────────────────────────────────────────┐
│ ✨ "If the customer is in EMEA and orders more than    │
│    100 units of any Hardware product, apply a 15%      │
│    volume discount on the entire quote line group."     │
│                                                        │
│    [✏️ Edit]  [✓ Verify]                                │
│                                                        │
│    ✨ AI-generated from CPQ logic · [View raw formula]  │
└────────────────────────────────────────────────────────┘
```

- Faint `bg-violet-50` background, ✨ sparkle icon
- "Edit" → inline edit mode. Once edited: "✏️ Edited by @name"
- "Verify" → consultant-reviewed stamp: "✓ Verified by @name"
- Unverified descriptions get a disclaimer in PDF export
- The goal: transparency without undermining trust

### Q3: CPQ ↔ RCA Split View → **On Demand (Stacked Vertically)**

The slide-over is too narrow for side-by-side. Two options, both valid:

- **Stacked vertically:** `[CPQ Current State]` → arrow → `[Target RCA State]`
- **Tab/toggle within detail:** `[ Current (CPQ) | Target (RCA) ]` pill toggle

For full-page detail view (see Section 11 below), both can be visible. For the slide-over quick preview, use tabs.

### Q4: AI Chat UI → **Design the Container Now, Build Later**

- Reserve a 48px vertical strip on the trailing edge
- Show a chat bubble icon (💬) with "Coming Soon" tooltip
- The main content area must work at both full width AND with ~320-400px removed
- Test every layout at both widths during development
- Don't design the chat conversation UI yet — that's a separate sprint

### Q5: Tab Badge Counts → **Red Dots for Blockers Only**

```
[Overview] [Products] [Pricing 🔴] [Rules] [Code 🔴] [Integrations] ...
```

A red dot means "this domain has blocked items." No numbers — just a signal to look. Numbers invite counting and comparison arguments. The Overview heatmap has the detailed counts.

### Q6: PDF Export Preview → **Configuration Modal, Not WYSIWYG**

```
┌─ GENERATE ASSESSMENT REPORT ─────────────────────────┐
│                                                       │
│  BRANDING                                             │
│  Customer: Acme Corp                                  │
│  Logo: [acme-logo.png]  Colors: [■ ■ ■]              │
│                                                       │
│  SCAN-GENERATED SECTIONS           Est. Pages         │
│  ☑ Executive Summary                  3-5             │
│  ☑ Readiness Prerequisites            1-2             │
│  ☑ Products Assessment                8-12            │
│  ☑ Pricing Assessment                 10-15           │
│  ☑ Rules Assessment                   5-8             │
│  ☑ Custom Code Assessment             8-12            │
│  ☑ Integrations Assessment            4-6             │
│  ☑ Amendments & Renewals              5-8             │
│  ☑ Approvals Assessment               3-5             │
│  ☑ Documents Assessment               5-8             │
│  ☑ Data & Reporting Assessment        5-8             │
│  ☑ Gap Analysis Matrix                5-8             │
│  ☑ Risk Register                      5-8             │
│  ☑ Effort Estimation Table            2-3             │
│  ☐ Full Inventory Appendices          15-25           │
│                                                       │
│  CONSULTANT SECTIONS                                  │
│  ☐ Business Process (As-Is)  [empty — add content ↗]  │
│  ☐ Target Architecture       [empty — add content ↗]  │
│  ☐ Data Migration Strategy   [empty — add content ↗]  │
│  ☐ Testing Strategy          [empty — add content ↗]  │
│  ☐ Change Mgmt & Training    [empty — add content ↗]  │
│  ☐ Strategic Recommendations [empty — add content ↗]  │
│                                                       │
│  Estimated total: 80-120 pages                        │
│                                                       │
│  [Cancel]                      [Generate PDF]         │
│                                                       │
│  PDF generation takes 1-3 minutes.                    │
│  You'll be notified when ready.                       │
└───────────────────────────────────────────────────────┘
```

Checkboxes for section inclusion, estimated page counts, nudges for empty consultant sections. No WYSIWYG preview — that's massive scope for minimal value.

---

## 11. Design Review — New Requirements (from Reviewer Feedback)

Both reviewers identified critical gaps that must be addressed before implementation.

### 11.1 Dependency Visualization (The Killer Feature)

**Why:** This is what makes a GUI fundamentally superior to any PDF. A consultant can never manually draw the dependency web for 500+ interrelated objects.

**Two forms:**

**Local dependency graph (v1 — on item detail):** When viewing "Enterprise Volume Discount," show a small directed graph (1-2 hops) of immediate dependencies. More useful than the flat list in the current slide-over design.

```
┌─ DEPENDENCIES ──────────────────────────────────────┐
│                                                      │
│              ┌──────────────┐                        │
│              │ Enterprise   │                        │
│              │ Vol. Discount│                        │
│              └──────┬───────┘                        │
│         ┌───────────┼───────────┐                    │
│    ┌────▼────┐ ┌────▼────┐ ┌───▼────┐              │
│    │ Summary │ │ Apex:   │ │ 23     │              │
│    │ Var: Q  │ │ VolCalc │ │Products│              │
│    │ Total   │ │ .cls    │ │affected│              │
│    └─────────┘ └────┬────┘ └────────┘              │
│                ┌────▼────┐                           │
│                │ Trigger:│                           │
│                │ QuoteLn │                           │
│                └─────────┘                           │
│                                                      │
│  [Expand to full explorer →]                         │
└──────────────────────────────────────────────────────┘
```

**Global dependency explorer (v1.1):** A dedicated view, filterable by domain, migration status, risk level. "If I migrate this one Apex class, it affects 47 downstream rules."

### 11.2 Item Triage Workflow

**Why:** This turns the tool from a read-only report into a **working scoping artifact.** Without it, consultants export to spreadsheets.

Every item in every inventory table gets a triage state:

| State | Meaning | Visual | Who Sets It |
|---|---|---|---|
| Untriaged | Not yet reviewed | No indicator (default) | — |
| In Scope | Confirmed for migration | ✅ subtle checkmark | Consultant |
| Excluded | Intentionally out of scope | ~~dimmed row~~ | Consultant |
| Needs Discussion | Requires client conversation | 💬 flag | Consultant |
| Overridden | Disagrees with auto-assessment | ✏️ with original visible | Consultant |

**Bulk triage:** Checkboxes on table rows → "Bulk Action" dropdown → `Set In Scope`, `Exclude`, `Needs Discussion`. This instantly updates Overview stats: "243 pricing rules → 31 excluded → 212 in scope."

**Why this is critical:** The SI's deliverable isn't "here's what exists in your CPQ." It's "here's what's IN SCOPE for migration." Triage defines scope. Scope defines budget.

### 11.3 Effort Estimation Interface

**Why:** Even though RevBrain doesn't auto-generate hours, it should provide the structured form that bridges scanning and SOW creation.

```
EFFORT ESTIMATION                                    [Export to CSV]
┌───────────────┬───────┬──────┬────────┬────────┬──────────────┐
│ Domain        │ Items │ Auto │ Guided │ Manual │ Est. Hours   │
├───────────────┼───────┼──────┼────────┼────────┼──────────────┤
│ Products      │  187  │  120 │   45   │   22   │ [________]   │
│ Pricing       │  243  │   82 │  100   │   61   │ [________]   │
│ Rules         │   89  │   34 │   38   │   17   │ [________]   │
│ Custom Code   │  112  │    0 │   67   │   45   │ [________]   │
│ Integrations  │   11  │    2 │    5   │    4   │ [________]   │
│ Amendments    │   34  │    8 │   14   │   12   │ [________]   │
│ Approvals     │   18  │   10 │    6   │    2   │ [________]   │
│ Data          │    —  │    — │     —  │     —  │ [________]   │
├───────────────┼───────┼──────┼────────┼────────┼──────────────┤
│ Subtotal      │  694  │  256 │  275   │  163   │ [auto-sum]   │
│ Testing & QA  │       │      │        │        │ [________]   │
│ Project Mgmt  │       │      │        │        │ [________]   │
│ Training / CM │       │      │        │        │ [________]   │
├───────────────┼───────┼──────┼────────┼────────┼──────────────┤
│ GRAND TOTAL   │       │      │        │        │ [auto-sum]   │
└───────────────┴───────┴──────┴────────┴────────┴──────────────┘
```

Item counts auto-populated. Hours column consultant-editable. Auto-sums. This is the bridge to SOW creation. SIs will love being able to sum the column directly.

Additionally, on each **item detail slide-over**, add: `Estimated Hours to Migrate: [___] hrs`. When exporting CSV, include this column — SIs price their SOW directly from these numbers.

### 11.4 Business Context Areas

**Why:** Section 8 says business process documentation is "NOT automated — consultant adds via notes/annotations." But WHERE?

Each domain tab gets a collapsible **"Business Context"** section at the top:

```
┌─ BUSINESS CONTEXT (Pricing) ──────────── [Collapse ▴] ┐
│                                                        │
│  [Rich text area — consultant documents pricing        │
│   governance, discount authority matrix, sales          │
│   motion types, business rules that can't be           │
│   extracted from configuration...]                     │
│                                                        │
│  Last edited by Sarah Chen · 2 days ago                │
└────────────────────────────────────────────────────────┘
```

Additionally, the Overview tab gets a "Business Process Summary" section — a structured area for the consultant to document the quote-to-cash process, stakeholder map, and known pain points.

This isn't glamorous, but without it, the consultant writes in Google Docs separately and the "single source of truth" value proposition breaks.

### 11.5 Risk Register

**Why:** "Top Risks + Blockers cards on Overview" isn't enough. The PDF equivalent has a full risk register.

Dedicated risk view (accessible from Overview's "View all N risks →" link):

| Risk | Category | Severity | Affected Items | Mitigation | Owner |
|---|---|---|---|---|---|
| Calculator plugins require full rewrite | Technical | 🔴 Critical | 3 plugins, ~4200 LOC | Phase 2 dedicated sprint | [___] |
| 12 integrations reference CPQ objects | Technical | 🔴 High | 12 systems | Integration audit in Phase 1 | [___] |
| User adoption risk during transition | Business | 🟡 Medium | All users | Training plan + parallel run | [___] |

Auto-detected risks are the starting point. Consultant adds business risks, adjusts severity, writes mitigation plans, assigns owners. Another "working artifact" that makes the tool sticky.

### 11.6 Run Comparison (Delta View)

**Why:** The client cleans up 40 inactive rules between scans. The consultant needs to see what changed.

After re-running the assessment, show a delta summary on Overview:

```
CHANGES SINCE LAST RUN (Run #3 vs Run #2)
┌──────────────────────────────────────────────────┐
│  ✅ 31 rules removed (inactive cleanup)          │
│  ⚠️  4 new rules detected                        │
│  ─  Pricing complexity: unchanged (High)         │
│  ⚠️  1 new Apex trigger added on QuoteLine       │
│                                                   │
│  [View detailed comparison →]                     │
└──────────────────────────────────────────────────┘
```

This validates that cleanup work happened and catches regressions. A simple diff summary on Overview is sufficient for v1 — full visual diff is v1.1.

### 11.7 Assessment Completeness Checklist

**Why:** The consultant needs to know when the assessment is "done enough" to deliver.

```
ASSESSMENT COMPLETENESS
━━━━━━━━━━━━━━━━━━━░░░░░  78%

✅ Org scanned (Run #3, Jan 15)
✅ All domains inventoried
✅ Gap analysis generated
⬜ 23 items untriaged in Pricing
⬜ Business process notes not added
⬜ Effort estimation not filled in
⬜ Risk mitigations not assigned
⬜ PDF not yet generated
```

This turns the assessment from "view scan results" into "complete the assessment." Keeps the consultant inside the tool instead of tracking progress elsewhere.

### 11.8 Slide-Over vs. Full-Page Detail

**Why:** The `max-w-2xl` slide-over works for quick preview but is too narrow for complex items (200+ LOC calculator plugins, 8 dependencies, multi-paragraph recommendations).

**Solution:** Slide-over for quick preview → "Open Full Detail →" link for full-page view. Same pattern as Linear/Notion — hover for preview, click for full.

Full-page detail view has room for:
- Local dependency graph
- Full CPQ ↔ RCA mapping (both visible, not tabbed)
- Code view with syntax highlighting
- All dependencies with clickable links
- Consultant notes + effort estimate

### 11.9 "Why?" Tooltips on Migration Status

**Why:** When a rule shows `🔴 Gap / Manual`, the consultant's immediate thought is "why?"

In the inventory table, hover over a Gap/Manual status → tooltip: *"Relies on QCP JavaScript callout which is not supported in RCA Pricing Procedures."*

This eliminates one click per item for the most common question. Small detail, big time savings across 243 rules.

### 11.10 Blocker Visual Weight

The 4-category model treats Blocked as one of four equal categories. But blockers are qualitatively different — they're potential go/no-go decisions.

- Blocked card in stats strip gets a red tint or border (others stay neutral)
- Dedicated "Blockers" callout on Overview (not just a number in the stats)
- In the heatmap, blocked items called out per domain with a 🚫 icon

5 blockers might kill the entire migration. They must be impossible to miss.

### 11.11 Integrated RCA Mapping in Domain Tables

The Translation Matrix shouldn't require a separate click. Add a subtle "RCA Target" column directly in each domain's inventory table:

```
│ Name           │ Complexity │ Status  │ RCA Target              │ → │
│ Enterprise Vol │ 🔴 High    │ ⚠️ Gap  │ PricingProcedure (?)    │ → │
│ Partner Tier   │ 🔴 High    │ 🔄 Gui. │ PricingProcedure (?)    │ → │
```

Hovering (?) shows the education popover inline. The standalone Translation Matrix still exists as a cross-domain summary for architects.

---

---

## Implementation Roadmap

> All tasks are mock-mode implementations: rich client-side mock data, translation-compliant, following existing patterns (mock services, `useTranslation()`, RTL-safe).

### Phase A: Mock Data Foundation

| Task | Description | Status |
|---|---|---|
| A.1 | Rich assessment mock data: 9 domain tabs with realistic inventory (Products: 187 items, Pricing: 243 rules, Rules: 89, Code: 112, Integrations: 11, Amendments: 34, Approvals: 18, Documents: 7 templates, Data & Reporting stats). Per-item: name, complexity, migration status, dependencies, AI description, triage state. | ⬜ Not Started |
| A.2 | Sub-tab mock data: Guided Selling (5 flows), QLE Customizations (12 items), Twin Fields (18 pairs), Contracted Pricing (340 records across 45 accounts), Multi-Currency (4 currencies), Reports & Dashboards (85 reports, 12 dashboards with last-run dates), Security & Permissions (8 permission sets, 5 sharing rules), Package Dependencies (6 packages), Experience Cloud (1 site with 4 CPQ components), Subscription Management (co-term config, 23 MDQ products, proration rules) | ⬜ Not Started |
| A.3 | Mock org health data: API usage 42%, storage 61%, Apex governor 28%, edition Enterprise, CPQ licenses 58, RCA licenses 0 (not detected), Salesforce Billing detected with 12 custom objects | ⬜ Not Started |
| A.4 | Mock risk register: 23 risks with category (technical/business/timeline/organizational), severity, likelihood, affected items, mitigation, owner fields | ⬜ Not Started |
| A.5 | Mock run history: 3 assessment runs with delta data between runs | ⬜ Not Started |
| A.6 | Mock consultant sections: 1 section with draft content (Business Process), 5 sections empty — to demonstrate both states | ⬜ Not Started |
| A.7 | Translation files: `en/assessment.json` + `he/assessment.json` with ALL strings for every screen including sub-tabs and consultant workspace | ⬜ Not Started |

### Phase B: Assessment Shell + Overview Tab

| Task | Description | Status |
|---|---|---|
| B.1 | Assessment page with horizontal tab bar (Overview, Products, Pricing, Rules, Code, Integrations, Amendments, Approvals, Documents, Data & Reporting). URL-persisted: `?tab=pricing`. Red dot badges on tabs with blockers. | ⬜ Not Started |
| B.2 | Overview tab: 4-category breakdown cards (Auto/Guided/Manual/Blocked with bar charts) | ⬜ Not Started |
| B.3 | Overview tab: complexity heatmap by domain (9 rows, clickable, verbal labels Low/Moderate/High, warning icons) | ⬜ Not Started |
| B.4 | Overview tab: Top Risks + Blockers cards (side by side, "View all →" links) with enhanced blocker visual weight | ⬜ Not Started |
| B.5 | Overview tab: Key Findings list with severity icons | ⬜ Not Started |
| B.6 | Overview tab: Readiness Prerequisites section (edition, RCA licenses, org health, Billing detection, governor limits) | ⬜ Not Started |
| B.7 | Overview tab: Migration Strategy Summary (recommended approach, phase breakdown, key assumptions, link to Migration Plan tab) | ⬜ Not Started |
| B.8 | Overview tab: Consultant Sections panel with status (Empty/Draft/Complete) and PDF include toggles | ⬜ Not Started |
| B.9 | Overview tab: Assessment completeness checklist (progress bar + automated + consultant steps) | ⬜ Not Started |
| B.10 | Overview tab: Run selector dropdown (#3 · 12m ago) with history switching | ⬜ Not Started |
| B.11 | Overview tab: Delta summary from last run (changes since Run #2) | ⬜ Not Started |

### Phase C: Domain Tabs + Sub-tabs

| Task | Description | Status |
|---|---|---|
| C.1 | Domain tab template: reusable component (stats strip + migration status bar + inventory table + insights panel + business context area). Support optional vertical sub-tab sidebar. | ⬜ Not Started |
| C.2 | Sub-tab navigation component: vertical pill list on leading side, URL-persisted (`?tab=products&sub=guided-selling`), only renders for domains with sub-areas | ⬜ Not Started |
| C.3 | Products domain tab: Catalog (187 items, bundles, features, options) + Guided Selling sub-tab (5 flows with steps, inputs, outputs) + QLE Customizations sub-tab (12 items) + Twin Fields sub-tab (18 pairs) | ⬜ Not Started |
| C.4 | Pricing domain tab: Price Rules (243 rules, discount schedules, calc plugins) + Contracted Pricing sub-tab (340 records, 45 accounts) + Multi-Currency sub-tab (4 currencies, exchange rate config) | ⬜ Not Started |
| C.5 | Rules domain tab: product rules, validation rules, summary variables, lookup queries (no sub-tabs) | ⬜ Not Started |
| C.6 | Code domain tab: Code Inventory (Apex, triggers, QCP, Flows with LOC counts) + Security & Permissions sub-tab (permission sets, sharing rules, FLS) | ⬜ Not Started |
| C.7 | Integrations domain tab: External Systems + Package Dependencies sub-tab (6 packages) + Experience Cloud sub-tab (1 site, 4 components) + Salesforce Billing sub-tab (12 custom objects) | ⬜ Not Started |
| C.8 | Amendments domain tab: Amendments + Renewals + Subscription Management sub-tab (co-term, proration, MDQ, evergreen, uplift) | ⬜ Not Started |
| C.9 | Approvals domain tab: approval chains, advanced approvals, smart approvals (no sub-tabs) | ⬜ Not Started |
| C.10 | Documents domain tab (NEW): Templates (7), template sections with conditional logic, merge field mapping, output formats, multi-language handling | ⬜ Not Started |
| C.11 | Data & Reporting domain tab (EXPANDED): Data Volumes + Reports & Dashboards sub-tab (85 reports, 12 dashboards, last-run dates) + Org Health sub-tab (limits, storage, performance) + Licenses & Edition sub-tab | ⬜ Not Started |
| C.12 | Inventory table features: sortable columns, filter dropdowns (complexity, status, active), search, pagination | ⬜ Not Started |
| C.13 | "Why?" tooltips on Gap/Manual status in tables | ⬜ Not Started |
| C.14 | Integrated RCA Target column in domain tables with (?) education popovers | ⬜ Not Started |

### Phase D: Item Detail + Triage

| Task | Description | Status |
|---|---|---|
| D.1 | Item detail slide-over: status block, AI description (✨ sparkle + Edit/Verify), CPQ→RCA mapping (stacked), dependencies list, recommendation, consultant notes | ⬜ Not Started |
| D.2 | Full-page item detail view: expanded layout with local dependency graph, code view, full mapping | ⬜ Not Started |
| D.3 | Item triage workflow: checkboxes on table rows, bulk actions (In Scope / Excluded / Needs Discussion), Overview stats update in real-time | ⬜ Not Started |
| D.4 | Per-item effort estimate field: `Estimated Hours: [___]` on slide-over | ⬜ Not Started |

### Phase E: Working Artifact Features

| Task | Description | Status |
|---|---|---|
| E.1 | Risk register: dedicated view with full risk table (category, severity, likelihood, affected items, mitigation, owner) — editable, with risk heat map (likelihood × impact) | ⬜ Not Started |
| E.2 | Effort estimation table: domain × category grid with auto-sums, consultant-editable hours column, additional rows for Testing/PM/Training | ⬜ Not Started |
| E.3 | Business context sections: collapsible rich text area per domain tab + Overview business process summary | ⬜ Not Started |
| E.4 | Translation Matrix: cross-domain CPQ→RCA mapping table with (?) education popovers, filterable | ⬜ Not Started |

### Phase E2: Consultant Workspace

| Task | Description | Status |
|---|---|---|
| E2.1 | Consultant section editor: full-width rich text editor with structured prompt templates and auto-populated scan context (read-only context blocks) | ⬜ Not Started |
| E2.2 | Business Process (As-Is) template: 4 prompt areas (Quote-to-Cash, Sales Motions, Pricing Governance, Stakeholder Map) with scan context | ⬜ Not Started |
| E2.3 | Target Architecture (To-Be) template: 4 prompt areas (Product Model, Pricing Architecture, Document Generation, Integration Architecture) with auto-context from scan | ⬜ Not Started |
| E2.4 | Data Migration Strategy template: 3 prompt areas (Historical Data Retention, Transformation Rules, Cutover Approach) with volume/distribution data | ⬜ Not Started |
| E2.5 | Testing Strategy template: auto-populated test categories based on scan results, per-category rich text areas | ⬜ Not Started |
| E2.6 | Change Management & Training template: auto-detected user personas + Training Plan + Communication Plan areas | ⬜ Not Started |
| E2.7 | Strategic Recommendations template: risk register + gap analysis as foundation, free-form rich text | ⬜ Not Started |
| E2.8 | Section status tracking: Empty → Draft → Complete progression, reflected in Overview completeness checklist | ⬜ Not Started |

### Phase F: Export + Polish

| Task | Description | Status |
|---|---|---|
| F.1 | PDF export configuration modal: section checkboxes (including all consultant sections + sub-tab content), branding preview, estimated pages, nudges for empty sections | ⬜ Not Started |
| F.2 | CSV export on every inventory table + mapping table + sub-tab tables | ⬜ Not Started |
| F.3 | Share a View: "Copy Link" button producing URL with current tab + sub-tab + filters | ⬜ Not Started |
| F.4 | Accessibility: ARIA labels, keyboard navigation, screen reader support for all new components | ⬜ Not Started |
| F.5 | RTL verification: all assessment pages including sub-tabs render correctly in Hebrew | ⬜ Not Started |

### Phase G: Testing

| Task | Description | Status |
|---|---|---|
| G.1 | Component tests: all new React components including sub-tab navigation and consultant editor (vitest + React Testing Library) | ⬜ Not Started |
| G.2 | E2E: navigate to assessment, switch tabs + sub-tabs, verify data loads per domain and sub-area | ⬜ Not Started |
| G.3 | E2E: item detail slide-over opens, shows correct data, triage actions work | ⬜ Not Started |
| G.4 | E2E: search/filter in inventory tables, URL state persists (tab + sub-tab + filters) | ⬜ Not Started |
| G.5 | E2E: consultant section editor — create, edit, save, status progression | ⬜ Not Started |
| G.6 | Visual review: screenshot all tabs + sub-tabs, iterate on design quality | ⬜ Not Started |

---

## 12. Consultant Workspace

### The Problem

Professional assessment PDFs contain 20-30 pages of purely consultant-authored content: business process documentation, target state architecture, testing strategy, change management plans. The earlier version of this proposal acknowledged these areas but provided no design for where or how consultants create this content.

Without structured space inside the tool, consultants write in Google Docs separately and the "single source of truth" value proposition breaks.

### Design: Structured Templates with Context

The Consultant Workspace is not a separate tab — it's a **concept** that manifests in two places:

**1. Per-domain Business Context sections** (designed in §11.4) — collapsible rich text areas at the top of each domain tab where consultants document domain-specific business processes and context.

**2. Assessment-wide Consultant Sections** — accessible from a "Consultant Sections" area on the Overview tab and from the PDF export modal. Each section has a structured template with prompts (not a blank text box), pre-populated context from scan results, rich text editing, and an inclusion toggle for PDF export.

### Consultant Sections

```
┌─ CONSULTANT SECTIONS ──────────────────────────────────────────┐
│                                                                 │
│  These sections require human expertise. Templates and scan     │
│  context are provided to accelerate your work.                  │
│                                                                 │
│  ┌─────────────────────────────────┬──────────┬──────────────┐ │
│  │ Section                         │ Status   │ PDF Include  │ │
│  ├─────────────────────────────────┼──────────┼──────────────┤ │
│  │ Business Process (As-Is)        │ ⬜ Empty  │ ☐           │ │
│  │ Target Architecture (To-Be)     │ ⬜ Empty  │ ☐           │ │
│  │ Data Migration Strategy         │ ⬜ Empty  │ ☐           │ │
│  │ Testing Strategy                │ ⬜ Empty  │ ☐           │ │
│  │ Change Management & Training    │ ⬜ Empty  │ ☐           │ │
│  │ Strategic Recommendations       │ ⬜ Empty  │ ☐           │ │
│  └─────────────────────────────────┴──────────┴──────────────┘ │
│                                                                 │
│  Click any section to open editor with template prompts.        │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

Status progression: ⬜ Empty → ✏️ Draft → ✅ Complete. Status is shown in the Assessment Completeness checklist on Overview.

### Section Templates

Each section opens a full-width editor with structured prompts and auto-populated context. The consultant fills in the human-judgment parts while the tool provides the data foundation.

**Business Process (As-Is):**
```
┌─ BUSINESS PROCESS DOCUMENTATION ────────────────────────────┐
│                                                              │
│  QUOTE-TO-CASH PROCESS                                       │
│  Template prompt: "Describe the end-to-end process from      │
│  opportunity creation through quote generation, approval,     │
│  order, and invoicing."                                      │
│  [Rich text editor area...]                                  │
│                                                              │
│  SALES MOTIONS                                               │
│  Template prompt: "Describe the different sales motions      │
│  (new business, renewal, amendment, upsell). How does each   │
│  flow through CPQ?"                                          │
│  Context: Your org has 34 amendment flows and 3 renewal      │
│  models detected.                                            │
│  [Rich text editor area...]                                  │
│                                                              │
│  PRICING GOVERNANCE                                          │
│  Template prompt: "Describe the discount authority matrix,   │
│  deal desk governance, and pricing approval routing."        │
│  Context: 18 approval chains detected, 3 use custom logic.  │
│  [Rich text editor area...]                                  │
│                                                              │
│  STAKEHOLDER MAP                                             │
│  Template prompt: "Who are the key stakeholders affected     │
│  by this migration? (Sales ops, deal desk, finance, IT)"     │
│  [Rich text editor area...]                                  │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

**Target Architecture (To-Be):**
```
┌─ TARGET STATE ARCHITECTURE ─────────────────────────────────┐
│                                                              │
│  PRODUCT MODEL DESIGN                                        │
│  Auto-context: "Your org has 187 products including 23      │
│  bundles with avg. 8 options. 82% map to Product Selling    │
│  Models. 4 bundles have nested depth > 3."                  │
│  Template prompt: "Describe the proposed Product Selling     │
│  Model structure in RCA."                                    │
│  [Rich text editor area...]                                  │
│                                                              │
│  PRICING ARCHITECTURE                                        │
│  Auto-context: "243 price rules, 3 calculator plugins       │
│  (4,200 LOC). 34% auto-mappable to Pricing Procedures."     │
│  Template prompt: "Describe the proposed Pricing Procedure   │
│  design pattern for RCA."                                    │
│  [Rich text editor area...]                                  │
│                                                              │
│  DOCUMENT GENERATION ARCHITECTURE                            │
│  Auto-context: "7 quote templates, 42 merge fields, 12     │
│  conditional sections."                                      │
│  Template prompt: "Describe the proposed OmniStudio DocGen  │
│  approach."                                                  │
│  [Rich text editor area...]                                  │
│                                                              │
│  INTEGRATION ARCHITECTURE                                    │
│  Auto-context: "11 external systems, 3 middleware layers.   │
│  12 integrations reference CPQ objects directly."            │
│  Template prompt: "Describe the integration refactoring     │
│  approach post-migration."                                   │
│  [Rich text editor area...]                                  │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

**Data Migration Strategy:**
```
┌─ DATA MIGRATION STRATEGY ───────────────────────────────────┐
│                                                              │
│  HISTORICAL DATA RETENTION                                   │
│  Auto-context: "450,000 historical quotes. 89% older than   │
│  2 years. 12,000 in 'Draft' status. 3,200 active            │
│  subscriptions."                                             │
│  Template prompt: "Define retention policy — migrate all,    │
│  last N years, or active only?"                              │
│  [Rich text editor area...]                                  │
│                                                              │
│  DATA TRANSFORMATION RULES                                   │
│  Auto-context: "47 picklist fields on CPQ objects. 12 have  │
│  values that don't exist in RCA equivalents."                │
│  Template prompt: "Document field value mappings, picklist   │
│  value changes, and record type migrations."                 │
│  [Rich text editor area...]                                  │
│                                                              │
│  CUTOVER APPROACH                                            │
│  Template prompt: "Define the cutover approach: big bang     │
│  vs. phased? How are in-flight quotes handled during         │
│  transition? Is a parallel run period needed?"               │
│  [Rich text editor area...]                                  │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

**Testing Strategy:**
```
┌─ TESTING STRATEGY ──────────────────────────────────────────┐
│                                                              │
│  Auto-populated test categories based on scan results:       │
│                                                              │
│  ☑ Unit Testing — 112 custom code items to validate          │
│  ☑ Integration Testing — 11 external systems                 │
│  ☑ Pricing Validation — 243 rules to verify output parity   │
│  ☑ Document Generation — 7 templates to validate             │
│  ☑ Approval Routing — 18 chains to verify                   │
│  ☑ Data Migration Validation — record count reconciliation   │
│  ☑ UAT — user acceptance for [consultant defines scope]      │
│  ☑ Performance Testing — baseline metrics available          │
│  ☐ Regression Testing — [consultant defines scope]           │
│                                                              │
│  Template prompt: "For each category, describe the testing   │
│  approach, responsible team, estimated effort, and success   │
│  criteria."                                                  │
│  [Rich text editor area per category...]                     │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

**Change Management & Training:**
```
┌─ CHANGE MANAGEMENT & TRAINING ──────────────────────────────┐
│                                                              │
│  USER IMPACT ASSESSMENT                                      │
│  Auto-context: "Detected CPQ user personas: 45 Sales Rep    │
│  profiles, 8 Sales Ops profiles, 3 Deal Desk profiles,      │
│  2 Admin profiles with CPQ access."                          │
│  Template prompt: "Describe impact on each user group.       │
│  RCA has a fundamentally different UI than CPQ — all users   │
│  need retraining."                                           │
│  [Rich text editor area...]                                  │
│                                                              │
│  TRAINING PLAN                                               │
│  Template prompt: "Who needs training, on what, how much,    │
│  and in what format? (classroom, self-paced, sandbox)"       │
│  [Rich text editor area...]                                  │
│                                                              │
│  COMMUNICATION PLAN                                          │
│  Template prompt: "How and when will affected users be       │
│  informed about the migration? Key milestones to             │
│  communicate?"                                               │
│  [Rich text editor area...]                                  │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

### Design Notes

- Templates use the same `bg-violet-50` background as AI-generated content (they're AI-assisted starting points)
- Auto-context blocks are read-only, pulled live from the latest scan data
- Rich text editor supports markdown, tables, and image upload (for process flow diagrams)
- Each section has a "Last edited by @name · date" footer
- Sections included in PDF export render as full pages with appropriate formatting
- Empty sections show a nudge in the PDF export modal: "empty — add content ↗"

---

## 13. Coverage Analysis

### What the scanner should auto-detect (add to existing domain tabs)

These 8 areas are metadata-scannable and should be added as sub-sections within existing domain tabs:

| Area | Where It Lives | Detection Method |
|---|---|---|
| Guided Selling Flows | Products → Guided Selling | OmniStudio/CPQ guided selling metadata |
| QLE Customizations | Products → QLE Customizations | QLE plugin configs, custom JS, page layouts |
| Twin Fields | Products → Twin Fields | CPQ twin field setting records |
| Contracted Pricing | Pricing → Contracted Pricing | SBQQ__ContractedPrice__c records |
| Multi-Currency Details | Pricing → Multi-Currency | CurrencyType metadata, dated exchange rates |
| Reports & Dashboards | Data & Reporting → Reports & Dashboards | Report/Dashboard metadata referencing SBQQ objects |
| Security / Permissions | Code → Security & Permissions | PermissionSet/Profile metadata referencing CPQ objects |
| Package Dependencies | Integrations → Package Dependencies | InstalledPackage metadata + cross-reference to CPQ objects |

### What is partially scannable (tool detects, consultant interprets)

| Area | What Tool Auto-Detects | What Consultant Adds |
|---|---|---|
| Subscription Management | Co-term settings, MDQ usage, proration config | Business process context, edge cases |
| Experience Cloud / Portal | CPQ components in Experience sites | User journey impact, partner workflow |
| Salesforce Billing | Billing objects and customizations | Billing workflow impact, scope decision |
| Org Health / Governor Limits | Limits API data, current usage | Risk assessment for migration activities |
| Performance Baseline | Page load times, calculation times | Acceptability thresholds, user expectations |

### What is purely consultant-authored (tool provides structure)

| Area | How Tool Helps |
|---|---|
| Business Process (As-Is) | Structured prompts per domain + scan context |
| Target State Architecture | Auto-suggested starting point from scan + structured templates |
| Data Migration Strategy | Volume/distribution data pre-populated + retention/cutover templates |
| Testing Strategy | Pre-populated test categories based on scan results |
| Change Management & Training | User persona detection + structured template |
| Strategic Recommendations | Risk register + gap analysis as foundation |

### Coverage Summary

| Dimension | Professional PDF | RevBrain (with this proposal) |
|---|---|---|
| Technical inventory depth | 100% | ~95% (8 scannable areas added) |
| Business process coverage | 100% | ~55% (structured templates, consultant writes) |
| Gap analysis completeness | 100% | ~90% (sub-tab expansion + RCA column) |
| Risk assessment depth | 100% | ~80% (full risk register + auto-detection) |
| Migration strategy & planning | 100% | ~70% (auto-suggested + consultant-authored) |
| Effort estimation | 100% | ~60% (auto-populated counts + consultant hours) |
| Target state architecture | 100% | ~50% (auto-context + consultant design) |
| Appendices & evidence | 100% | 100% (CSV exports + full inventory tables) |

**Overall: ~80-85% of professional PDF content**, with the remaining 15-20% being genuinely human-judgment content that no tool should try to automate. That coverage at dramatically lower effort (hours instead of weeks) is the value proposition.

---

## 14. Terminology Consistency Note

Two dimensions must be clearly distinguished everywhere:

| Dimension | What It Measures | Values |
|---|---|---|
| **Complexity** | How hard is this item to understand/deal with? (intrinsic to CPQ config) | Low / Moderate / High |
| **Migration Status** | What's the path to RCA? | Auto / Guided / Manual / Blocked |

These are related but different. A high-complexity item might be Auto-mappable (complex in CPQ but has a direct RCA equivalent). A low-complexity item might be Blocked (simple in CPQ but no RCA equivalent exists). Both must be visible and filterable in every inventory table.

---

## 15. Updated Design Principles

1. **Progressive disclosure** — executive summary first, drill down to raw code last
2. **Interactive over static** — filter, sort, search, click through. A PDF is read; this is explored.
3. **Translation, not just inventory** — explain what CPQ objects mean and how they map to RCA
4. **Insights over data** — auto-generated observations save consultants from pattern-spotting
5. **Consultant workflow, not just viewer** — triage, notes, effort estimates, branded export
6. **Working artifact, not one-time scan** — triage states, business context, effort estimation make it a living document
7. **Structured guidance for human judgment** — templates with prompts and auto-context, not blank text boxes. Consultants write faster when they're filling in structure, not staring at empty pages.
8. **Complete coverage** — every section of a professional assessment PDF has a home in the tool, whether auto-generated, consultant-authored, or hybrid
9. **Same design language** — rounded-2xl cards, no borders, emerald/amber/red/violet tokens, RTL-safe
10. **Dependency visualization** — the feature that makes GUI fundamentally superior to PDF
11. **Trust through transparency** — AI content clearly marked, editable, verifiable

---

## 16. Implementation Progress

> **Goal:** Build a premium assessment demo on the Q1 Migration mock project that showcases how RevBrain's interactive workspace is superior to a 100-page PDF. All mock-mode, following existing patterns (client-side mock data, `useTranslation()`, RTL-safe, co-located tests).
>
> **Target project:** Q1 Migration (`MOCK_IDS.PROJECT_Q1_MIGRATION`) — mid-journey project with source connected and data extracted.
>
> **Workflow per task:** implement → write co-located tests → `pnpm lint && pnpm test && pnpm build` → commit → push → verify CI.

### Task 1: Assessment mock data types and seed data

**Objective:** Create rich, realistic assessment mock data for the Q1 Migration project representing a complex enterprise CPQ org (694 items across 9 domains).

**What to build:**
- `apps/client/src/features/projects/mocks/assessment-mock-data.ts` — TypeScript types + mock data
- Types: `AssessmentDomain`, `AssessmentItem`, `AssessmentRisk`, `AssessmentRun`, `DomainStats`, `MigrationStatus` (`auto` | `guided` | `manual` | `blocked`), `Complexity` (`low` | `moderate` | `high`), `TriageState` (`untriaged` | `in_scope` | `excluded` | `needs_discussion`), `SubTab`, plus per-domain sub-tab types
- Data: 9 domains with realistic item counts from proposal (Products: 187, Pricing: 243, Rules: 89, Code: 112, Integrations: 11, Amendments: 34, Approvals: 18, Documents: 7, Data: volume stats). Per-item: id, name, apiName, complexity, migrationStatus, triageState, rcaTarget, dependencies array, aiDescription, whyStatus tooltip. Only 5-8 representative items per domain (not all 694 — enough for UI fidelity).
- 23 risks with category/severity/affected items/mitigation/owner
- 3 run history entries with delta data
- Sub-tab data: Guided Selling (3 flows), QLE (4 items), Twin Fields (5 pairs), Contracted Pricing (summary stats), Multi-Currency (3 currencies), Reports (12 reports), Security (3 permission sets), Package Dependencies (4 packages), Subscription Management (co-term/MDQ config)
- Org health data: API %, storage %, limits, edition, licenses
- Assessment completeness checklist items
- Export function: `getMockAssessmentData(projectId: string)` — returns data for Q1 Migration, null for others

**Tests** (`assessment-mock-data.test.ts`):
- All domain counts sum to expected totals
- Every item has required fields (id, name, migrationStatus, complexity)
- Risk register has 23 entries with valid categories
- Run history is chronologically ordered
- Function returns null for non-Q1 projects
- No duplicate IDs across all domains

| Status |
|---|
| ⬜ Not Started |

---

### Task 2: Assessment translation strings (en + he)

**Objective:** Add all assessment UI strings in both languages, following existing locale patterns.

**What to build:**
- `apps/client/src/locales/en/assessment.json` — English strings
- `apps/client/src/locales/he/assessment.json` — Hebrew strings
- Register in i18n config (add to resource imports)

**Key string groups:**
- Tab names: overview, products, pricing, rules, code, integrations, amendments, approvals, documents, dataReporting
- Overview sections: migrationReadiness (auto/guided/manual/blocked labels), complexityByDomain, topRisks, blockers, keyFindings, prerequisites, migrationStrategy, completeness
- Domain template: stats labels, migrationStatus bar labels, inventory table headers (name, complexity, status, rcaTarget), insights heading, businessContext heading
- Sub-tab names per domain
- Item detail: statusBlock, aiDescription (sparkle label, edit, verify), cpqRcaMapping, dependencies, recommendation, consultantNotes
- Risk register: column headers, category labels, severity labels
- Effort estimation: domain column, items, auto, guided, manual, estHours, subtotal, grandTotal
- Triage states: untriaged, inScope, excluded, needsDiscussion, overridden
- Complexity labels: low, moderate, high
- Migration status: auto, guided, manual, blocked (with descriptions)
- Export: generateReport, exportCsv, copyLink
- Empty states per section

**Tests** (`assessment-translations.test.ts` in client):
- Every key in en/assessment.json exists in he/assessment.json
- Every key in he/assessment.json exists in en/assessment.json
- No empty string values
- Tab name keys match domain list
- Hebrew strings are non-empty and different from English

| Status |
|---|
| ⬜ Not Started |

---

### Task 3: Assessment page shell with tab navigation

**Objective:** Replace the current placeholder AssessmentPage with a tabbed workspace shell. URL-persisted tabs, empty state preserved for projects without assessment data.

**What to build:**
- Rewrite `AssessmentPage.tsx` with horizontal tab bar
- Tabs: Overview, Products, Pricing, Rules, Code, Integrations, Amendments, Approvals, Documents, Data & Reporting
- URL persistence: `?tab=pricing` via `useSearchParams`
- Default to Overview tab
- Red dot badge on tabs whose domains have blocked items
- Header: "Assessment" title + run info ("Run #3 · 12m ago") + Export dropdown placeholder
- Preserve empty state (no assessment data) using existing translation keys
- Each tab renders a placeholder `<div>` with tab name (content built in later tasks)
- Use `useTranslation('assessment')` for all strings

**Tests** (`AssessmentPage.test.tsx`):
- Renders empty state when no assessment data
- Renders tab bar when assessment data exists
- All 10 tabs visible
- Default tab is overview
- Clicking a tab updates URL searchParam
- Tab with blocked items shows red dot indicator
- Header shows run info from mock data

| Status |
|---|
| ⬜ Not Started |

---

### Task 4: Overview tab — migration readiness + complexity heatmap

**Objective:** Build the top half of the Overview tab: the 4 stat cards and domain complexity heatmap.

**What to build:**
- `apps/client/src/features/projects/components/assessment/OverviewTab.tsx`
- Migration Readiness section: 4 cards (Auto/Guided/Manual/Blocked) with counts, percentage bars, color-coded dots (emerald/amber/amber/red)
- Stacked horizontal bar showing proportions
- Complexity by Domain section: 9 rows, each with domain name, complexity bar (colored by level), verbal label (Low/Moderate/High), item count, arrow, warning icon if blockers exist
- Rows clickable — call `onDomainClick(tabName)` to switch tabs
- All strings from assessment translations

**Tests** (`OverviewTab.test.tsx`):
- Renders 4 stat cards with correct counts from mock data
- Renders 9 domain rows in heatmap
- Domain rows show correct complexity labels
- Warning icon appears on domains with blocked items
- Clicking a domain row calls onDomainClick with correct tab name
- Stacked bar widths sum to 100%

| Status |
|---|
| ⬜ Not Started |

---

### Task 5: Overview tab — risks, blockers, key findings

**Objective:** Build the middle section of the Overview tab: risk/blocker cards and key findings list.

**What to build:**
- `apps/client/src/features/projects/components/assessment/RiskBlockerCards.tsx`
- Top Risks card: shows top 3 risks with severity icon + description, "View all N risks →" link
- Blockers card: shows blocked items with 🚫 icon, "View all N blockers →" link. Red-tinted border for visual weight.
- Key Findings list: auto-generated observations with severity icons (✅ emerald, ⚠️ amber, 🔴 red)
- Side-by-side layout (risks | blockers), findings below

**Tests** (`RiskBlockerCards.test.tsx`):
- Renders top 3 risks from mock data
- Renders blocked items
- "View all" links show correct counts
- Blocker card has red visual treatment
- Key findings show correct severity icons
- Correct number of findings rendered

| Status |
|---|
| ⬜ Not Started |

---

### Task 6: Overview tab — prerequisites + completeness + strategy

**Objective:** Build the bottom section of the Overview tab: readiness prerequisites, migration strategy summary, and assessment completeness checklist.

**What to build:**
- `apps/client/src/features/projects/components/assessment/OverviewBottomSections.tsx`
- Readiness Prerequisites: checklist items (edition ✅, RCA licenses ⚠️, org health ✅, billing detection ⚠️, governor limits ✅) from mock org health data
- Migration Strategy Summary: recommended approach (Phased), phase breakdown with week ranges, key assumptions list
- Assessment Completeness: progress bar (%) + checklist of done/pending items (scan ✅, inventory ✅, gap analysis ✅, triage ⬜, business context ⬜, effort estimation ⬜, consultant sections ⬜, PDF ⬜)
- Wire all three into OverviewTab

**Tests** (`OverviewBottomSections.test.tsx`):
- Prerequisites render all items with correct status icons
- Strategy shows phase count and approach
- Completeness progress bar percentage matches completed/total items
- Completed items show ✅, pending show ⬜

| Status |
|---|
| ⬜ Not Started |

---

### Task 7: Domain tab template component

**Objective:** Build the reusable domain tab template that all 9 domain tabs share: stats strip, migration status bar, inventory table, insights panel, business context area.

**What to build:**
- `apps/client/src/features/projects/components/assessment/DomainTab.tsx` — accepts domain data, optional sub-tabs config
- Stats strip: 3-4 stat cards specific to domain (total items, high complexity count, with Apex count, etc.) — configurable via props
- Migration status bar: horizontal stacked bar (Auto %/Guided %/Manual %) with legend
- Inventory table: columns (Name, Complexity badge, Migration Status badge + "why?" tooltip, RCA Target with (?) popover, arrow). Sortable headers, filter dropdowns (complexity, status), search input, pagination (10 per page)
- Insights panel: list of auto-generated observations with 💡 icon
- Business context area: collapsible section with placeholder text area, "Last edited by..." footer
- Sub-tab sidebar: if domain has sub-tabs, render vertical pill list on leading side with sub-tab content area
- Row click emits `onItemClick(itemId)` for slide-over (wired later)

**Tests** (`DomainTab.test.tsx`):
- Renders stats strip with provided stat cards
- Migration status bar shows correct percentages
- Inventory table renders items with correct badges
- Search filters table rows by name
- Complexity filter reduces visible rows
- Sort by complexity reorders rows
- Pagination shows correct page of items
- "Why?" tooltip appears on hover for Gap/Manual items
- Sub-tab sidebar renders when sub-tabs provided
- Business context section is collapsible

| Status |
|---|
| ⬜ Not Started |

---

### Task 8: Products + Pricing domain tabs (showcase domains)

**Objective:** Wire the domain template to Products and Pricing tabs with full mock data and sub-tabs. These are the two showcase domains with the richest data.

**What to build:**
- `apps/client/src/features/projects/components/assessment/domains/ProductsTab.tsx`
  - Sub-tabs: Catalog (default), Guided Selling, QLE Customizations, Twin Fields
  - Stats: 187 products, 23 bundles, 4 guided flows, 12 QLE customs
  - 5-8 representative product items in table
  - Sub-tab content shows sub-tab-specific items
- `apps/client/src/features/projects/components/assessment/domains/PricingTab.tsx`
  - Sub-tabs: Price Rules (default), Contracted Pricing, Multi-Currency
  - Stats: 243 rules, 47 high complexity, 12 with Apex, 3 calc plugins
  - 5-8 representative pricing items in table
  - Contracted Pricing sub-tab: summary cards (340 records, 45 accounts, expiration stats)
  - Multi-Currency sub-tab: currency list with exchange rate info
- Wire both into AssessmentPage tab content

**Tests** (`ProductsTab.test.tsx`, `PricingTab.test.tsx`):
- Products renders 4 sub-tabs, default to Catalog
- Products stats show correct counts
- Pricing renders 3 sub-tabs, default to Price Rules
- Pricing stats show correct counts
- Sub-tab click switches content
- URL updates with sub-tab: `?tab=products&sub=guided-selling`
- Items render in inventory table

| Status |
|---|
| ⬜ Not Started |

---

### Task 9: Remaining 7 domain tabs

**Objective:** Wire the domain template to all remaining domain tabs with mock data and sub-tabs where applicable.

**What to build:**
- `domains/RulesTab.tsx` — no sub-tabs, 89 rules, 4 types
- `domains/CodeTab.tsx` — sub-tabs: Code Inventory, Security & Permissions
- `domains/IntegrationsTab.tsx` — sub-tabs: External Systems, Package Dependencies, Experience Cloud, Salesforce Billing
- `domains/AmendmentsTab.tsx` — sub-tabs: Amendments, Renewals, Subscription Management
- `domains/ApprovalsTab.tsx` — no sub-tabs, 18 chains
- `domains/DocumentsTab.tsx` — no sub-tabs, 7 templates with sections
- `domains/DataReportingTab.tsx` — sub-tabs: Data Volumes, Reports & Dashboards, Org Health, Licenses & Edition
- Wire all into AssessmentPage tab content

**Tests** (`DomainTabs.test.tsx` — shared test file):
- Each of the 7 tabs renders without errors
- Tabs with sub-tabs show correct sub-tab count
- Data volumes shows record counts
- Reports sub-tab shows report/dashboard counts
- Org Health shows limits percentages
- Code tab shows LOC counts
- Integrations shows system count

| Status |
|---|
| ⬜ Not Started |

---

### Task 10: Item detail slide-over panel

**Objective:** Build the slide-over that opens when clicking an item in any inventory table. Shows full item detail with CPQ→RCA mapping.

**What to build:**
- `apps/client/src/features/projects/components/assessment/ItemDetailPanel.tsx`
- Uses existing `Sheet` component from `@/components/ui/sheet`
- Sections: Status block (complexity badge, migration status, active, last modified) → AI description with ✨ sparkle icon, Edit/Verify buttons, "View raw" toggle → CPQ→RCA mapping (stacked vertically, CPQ objects top, RCA objects bottom, with gap/warning callouts) → Dependencies list (clickable items) → Recommendation text with effort estimate → Consultant Notes text area
- AI description block: faint `bg-violet-50` background, ✨ prefix
- "Open Full Detail →" link placeholder (full-page view deferred)
- Wired to DomainTab's `onItemClick` — opens panel with selected item data

**Tests** (`ItemDetailPanel.test.tsx`):
- Panel opens when item selected
- Shows correct item name and API name
- Status block shows complexity and migration status
- AI description renders with sparkle icon
- CPQ→RCA mapping shows source and target objects
- Dependencies list renders items
- Recommendation text is visible
- Notes area is editable
- Panel closes on close button click

| Status |
|---|
| ⬜ Not Started |

---

### Task 11: Risk register dedicated view

**Objective:** Build the full risk register table accessible from Overview's "View all risks →" link.

**What to build:**
- `apps/client/src/features/projects/components/assessment/RiskRegister.tsx`
- Full-width table: Risk description, Category (Technical/Business/Timeline/Organizational), Severity (Critical/High/Medium/Low with color badges), Affected Items (linked count), Mitigation text, Owner field
- Filterable by category and severity
- Searchable
- Both auto-detected risks (from scan) and placeholder for consultant-added risks
- Accessible as a modal/overlay from Overview or as inline content when "View all" clicked
- Risk heat map: simple 2D scatter showing likelihood × impact (CSS grid, no charting library)

**Tests** (`RiskRegister.test.tsx`):
- Renders all 23 risks from mock data
- Category filter reduces visible risks
- Severity filter works
- Search filters by description text
- Risk heat map renders with correct quadrant placement
- Severity badges use correct colors (red for Critical, amber for High, etc.)

| Status |
|---|
| ⬜ Not Started |

---

### Task 12: Effort estimation table

**Objective:** Build the effort estimation table bridging scan data and SOW creation.

**What to build:**
- `apps/client/src/features/projects/components/assessment/EffortEstimation.tsx`
- Table: Domain | Items | Auto | Guided | Manual | Est. Hours (editable input)
- 9 domain rows with auto-populated counts from assessment data
- Additional rows: Testing & QA, Project Management, Training / Change Management (hours-only, no item counts)
- Subtotal row with auto-sum
- Grand Total row with auto-sum
- Export CSV button
- Accessible from Overview's completeness checklist or as a section within the workspace

**Tests** (`EffortEstimation.test.tsx`):
- Renders all 9 domain rows with correct item counts
- Auto/Guided/Manual columns show correct breakdowns
- Hours input accepts numeric input
- Subtotal auto-sums domain hours
- Additional rows (Testing, PM, Training) are editable
- Grand total sums subtotal + additional rows
- Export CSV button is present

| Status |
|---|
| ⬜ Not Started |

---

### Task 13: Run comparison delta view

**Objective:** Show what changed between assessment runs on the Overview tab.

**What to build:**
- `apps/client/src/features/projects/components/assessment/RunDelta.tsx`
- Run selector dropdown in page header: "Run #3 · 12m ago" with dropdown showing run history
- Delta summary card on Overview: "Changes since last run" with added/removed/unchanged item counts, per-domain delta, severity-coded entries
- Uses mock run history data (3 runs)

**Tests** (`RunDelta.test.tsx`):
- Run selector shows current run info
- Dropdown lists all historical runs
- Delta summary shows correct change counts
- Added items show ✅ icon, removed show 🔴
- Switching runs updates delta display

| Status |
|---|
| ⬜ Not Started |

---

### Task 14: Integration, polish + RTL verification

**Objective:** Wire everything together, ensure consistent styling, verify RTL rendering, add accessibility attributes.

**What to build:**
- Full integration of all components into AssessmentPage
- Navigation flows: Overview heatmap row click → domain tab, domain table row click → slide-over, "View all risks" → risk register, completeness item click → relevant section
- ARIA labels on all interactive elements
- Keyboard navigation: Tab through domain tabs, Enter to select, Escape to close slide-over
- RTL verification: test all pages in Hebrew, ensure `start-*`/`end-*` CSS throughout
- Visual polish: ensure consistent `rounded-2xl`, `bg-white` on `bg-slate-50`, proper spacing

**Tests** (`AssessmentIntegration.test.tsx`):
- Full page renders without errors with Q1 Migration data
- Tab navigation works end-to-end
- Heatmap click navigates to correct domain tab
- Table row click opens slide-over with correct item
- "View all risks" opens risk register
- All text uses translation keys (no hardcoded English)
- Key interactive elements have aria-labels

| Status |
|---|
| ⬜ Not Started |

---

### Implementation Log

| Date | Task | Commit | Notes |
|---|---|---|---|
| — | — | — | — |
