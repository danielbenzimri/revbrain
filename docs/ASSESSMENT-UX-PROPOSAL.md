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
│  LAYER 1: Domain Dashboards (8 domains)                 │
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

The assessment covers 8+ domains (Products, Pricing, Rules, Custom Code, Integrations, Amendments/Renewals, Approvals, Documents/Data). Should these be:

**Option A:** Tabs within the existing Assessment page (keeping the sidebar unchanged)
**Option B:** Sub-pages under Assessment in the project sidebar
**Option C:** A domain sidebar within the Assessment page content area (nested sidebar)

### Recommendation: Option A — Horizontal Tabs + Vertical Sub-tabs

**Why:** The project sidebar already has 10 items across 3 groups. Adding 8+ Assessment sub-items would make the sidebar scroll-heavy and dilute the project-level navigation. Instead, the Assessment page becomes a **mini-app within the workspace** with its own tab-based navigation.

```
┌─ PROJECT SIDEBAR ─┐  ┌─────────────────────────────────────────────────┐
│                    │  │  Assessment                        [Export ▾]   │
│  MIGRATION         │  │                                                 │
│  ◉ Overview        │  │  [Overview][Products][Pricing][Rules][Code]     │
│  ○ CPQ Explorer    │  │  [Integrations][Amendments][Approvals][Data]    │
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
│  [Overview] [Products] [Pricing] ...              [Export ▾] │
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
│  │ Products     ██████░░░░  6/10   187 items   →         │   │
│  │ Pricing      █████████░  9/10   243 rules   → ⚠️      │   │
│  │ Rules        ███████░░░  7/10    89 rules   →         │   │
│  │ Custom Code  ████████░░  8/10   112 items   → ⚠️      │   │
│  │ Integrations ██████░░░░  6/10    11 systems →         │   │
│  │ Amendments   ████████░░  8/10    34 flows   → ⚠️      │   │
│  │ Approvals    █████░░░░░  5/10    18 chains  →         │   │
│  │ Documents    ████░░░░░░  4/10     7 templ.  →         │   │
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

**Design notes:**
- Complexity heatmap bars use the same color system: low (emerald→amber→red) high
- Each heatmap row is clickable — navigates to that domain's tab
- Warning icon (⚠️) on rows with high complexity or blockers
- The 4-category breakdown (Auto/Guided/Manual/Blocked) uses the unified terminology from our design tokens
- No single "complexity score" number — auditors rejected this (no benchmark data to make it meaningful). The 4-category breakdown IS the honest representation.
- Key findings use severity icons with colors: ✅ emerald, ⚠️ amber, 🔴 red
- "Run #3 · 12m ago" dropdown allows switching between historical assessment snapshots

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

Each domain tab follows the same pattern: stats strip → migration status bar → inventory table → insights. The domains are:

| Tab | What It Covers | Key Metrics |
|---|---|---|
| **Products** | Product catalog, bundles, features, options, configuration attributes | Product count, bundle depth, option complexity |
| **Pricing** | Price rules, discount schedules, price books, calculator plugins, contracted pricing | Rule count, complexity distribution, Apex dependencies |
| **Rules** | Product rules, validation rules, summary variables, lookup queries | Rule count by type (validation/alert/selection/filter) |
| **Code** | Apex classes, triggers, LWC/Aura, QCP (JavaScript), Flows | LOC count, CPQ dependency %, code complexity |
| **Integrations** | External systems connected to CPQ, middleware, data flows | System count, integration direction, risk level |
| **Amendments** | Amendment behavior, renewal models, subscription management | Process count, customization depth |
| **Approvals** | Approval chains, advanced approvals, smart approvals | Chain count, approval variables, custom logic |
| **Data** | Data volumes, historical data, data quality, migration requirements | Record counts, data quality score |

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

| PDF Section | RevBrain Equivalent |
|---|---|
| Executive Summary (5-10 pages) | Assessment Overview tab — 30-second scan |
| Current State — Business Process (10-15 pages) | NOT automated — consultant adds via notes/annotations |
| Current State — Technical Inventory (15-25 pages) | 8 domain tabs with auto-generated inventories |
| RCA Target Architecture (8-12 pages) | Translation Matrix with (?) education popovers |
| Gap Analysis (8-12 pages) | Migration status bars + per-item status in every table |
| Risk Assessment (5-8 pages) | Top Risks + Blockers cards on Overview |
| Migration Strategy (5-8 pages) | Migration Plan tab (user-owned phases from UX spec) |
| Effort Estimation (5-8 pages) | NOT auto-generated (consultant fills in, per UX spec decision) |
| Appendices (10-20 pages) | CSV exports + full inventory tables in each domain tab |

**What RevBrain automates:** ~60-70% (inventory, scanning, gap mapping, risk detection, insights)
**What the consultant adds:** ~30-40% (business context, strategic recommendations, effort estimates, interview notes)

---

## 9. Design Principles for This Feature

1. **Progressive disclosure** — executive summary first, drill down to raw code last
2. **Interactive over static** — filter, sort, search, click through. A PDF is read; this is explored.
3. **Translation, not just inventory** — don't just list CPQ objects; explain what they mean and how they map to RCA
4. **Insights over data** — auto-generated observations ("47 rules drive 78% of effort") save the consultant from pattern-spotting
5. **Consultant workflow, not just viewer** — notes, annotations, triage (include/exclude/needs review), and branded export
6. **Same design language** — rounded-2xl cards, no borders, emerald/amber/red/violet color tokens, RTL-safe, translated

---

## 10. Open Questions for Design Review

1. **Should the domain heatmap use numeric scores (6/10) or verbal labels (Moderate/High)?** Both auditors previously rejected single numeric scores, but per-domain scores may be more defensible since they're relative within a domain, not cross-project.

2. **How should the "Plain English" AI description be visually differentiated from human-written content?** It needs to be clear that the description is AI-generated (may be imperfect) vs. consultant-verified.

3. **Should the split-view (CPQ ↔ RCA) be always visible or only on demand?** In the item detail panel, showing both sides is useful but space-constrained in a slide-over.

4. **How much of the AI Chat assistant UI should we design now** even if implementation is v1.1? Reserving space (collapsible right panel) affects the entire layout.

5. **Should domain tabs have badge counts?** E.g., "Pricing ⚠️ 47" (47 high-complexity items). Useful for quick scanning but visually noisy with 8+ tabs.

6. **How should the branded PDF export be previewed?** A full preview before generation, or just a "Generating..." progress bar? The preview is expensive to render but prevents "I didn't mean to include that section" complaints.
