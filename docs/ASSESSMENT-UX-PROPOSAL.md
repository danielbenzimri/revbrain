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
│  SECTIONS TO INCLUDE               Est. Pages         │
│  ☑ Executive Summary                  3-5             │
│  ☑ Products Assessment                8-12            │
│  ☑ Pricing Assessment                 10-15           │
│  ☑ Rules Assessment                   5-8             │
│  ☑ Custom Code Assessment             8-12            │
│  ☑ Integrations Assessment            4-6             │
│  ☑ Amendments & Renewals              5-8             │
│  ☑ Approvals Assessment               3-5             │
│  ☑ Data Assessment                    3-5             │
│  ☑ Gap Analysis Matrix                5-8             │
│  ☑ Risk Summary                       3-5             │
│  ☐ Full Inventory Appendices          15-25           │
│                                                       │
│  CONSULTANT SECTIONS                                  │
│  ☐ Business Process Notes    [empty — add content ↗]  │
│  ☐ Strategic Recommendations [empty — add content ↗]  │
│  ☐ Effort Estimation         [empty — add content ↗]  │
│                                                       │
│  Estimated total: 65-90 pages                         │
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
| A.1 | Rich assessment mock data: 8 domains with realistic inventory (Products: 187 items, Pricing: 243 rules, Rules: 89, Code: 112, Integrations: 11, Amendments: 34, Approvals: 18, Data stats). Per-item: name, complexity, migration status, dependencies, AI description, triage state. | ⬜ Not Started |
| A.2 | Mock risk register: 23 risks with category, severity, affected items, mitigation, owner fields | ⬜ Not Started |
| A.3 | Mock run history: 3 assessment runs with delta data between runs | ⬜ Not Started |
| A.4 | Translation files: `en/assessment.json` + `he/assessment.json` with ALL strings for every screen | ⬜ Not Started |

### Phase B: Assessment Shell + Overview Tab

| Task | Description | Status |
|---|---|---|
| B.1 | Assessment page with horizontal tab bar (Overview, Products, Pricing, Rules, Code, Integrations, Amendments, Approvals, Data). URL-persisted: `?tab=pricing`. Red dot badges on tabs with blockers. | ⬜ Not Started |
| B.2 | Overview tab: 4-category breakdown cards (Auto/Guided/Manual/Blocked with bar charts) | ⬜ Not Started |
| B.3 | Overview tab: complexity heatmap by domain (8 rows, clickable, verbal labels Low/Moderate/High, warning icons) | ⬜ Not Started |
| B.4 | Overview tab: Top Risks + Blockers cards (side by side, "View all →" links) with enhanced blocker visual weight | ⬜ Not Started |
| B.5 | Overview tab: Key Findings list with severity icons | ⬜ Not Started |
| B.6 | Overview tab: Run selector dropdown (#3 · 12m ago) with history switching | ⬜ Not Started |
| B.7 | Overview tab: Assessment completeness checklist (progress bar + item list) | ⬜ Not Started |
| B.8 | Overview tab: Delta summary from last run (changes since Run #2) | ⬜ Not Started |

### Phase C: Domain Tabs

| Task | Description | Status |
|---|---|---|
| C.1 | Domain tab template: reusable component (stats strip + migration status bar + inventory table + insights panel + business context area) | ⬜ Not Started |
| C.2 | Products domain tab: filled with mock product data (187 items, bundles, features, options) | ⬜ Not Started |
| C.3 | Pricing domain tab: filled with mock pricing data (243 rules, discount schedules, calc plugins) — the showcase domain | ⬜ Not Started |
| C.4 | Rules domain tab: product rules, validation rules, summary variables, lookup queries | ⬜ Not Started |
| C.5 | Code domain tab: Apex classes, triggers, QCP JavaScript, Flows — with LOC counts | ⬜ Not Started |
| C.6 | Remaining domains (Integrations, Amendments, Approvals, Data) — using template with domain-specific data | ⬜ Not Started |
| C.7 | Inventory table features: sortable columns, filter dropdowns (complexity, status, active), search, pagination | ⬜ Not Started |
| C.8 | "Why?" tooltips on Gap/Manual status in tables | ⬜ Not Started |
| C.9 | Integrated RCA Target column in domain tables with (?) education popovers | ⬜ Not Started |

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
| E.1 | Risk register: dedicated view with full risk table (category, severity, affected items, mitigation, owner) — editable | ⬜ Not Started |
| E.2 | Effort estimation table: domain × category grid with auto-sums, consultant-editable hours column | ⬜ Not Started |
| E.3 | Business context sections: collapsible rich text area per domain tab + Overview business process summary | ⬜ Not Started |
| E.4 | Translation Matrix: cross-domain CPQ→RCA mapping table with (?) education popovers, filterable | ⬜ Not Started |

### Phase F: Export + Polish

| Task | Description | Status |
|---|---|---|
| F.1 | PDF export configuration modal: section checkboxes, branding preview, estimated pages, consultant section nudges | ⬜ Not Started |
| F.2 | CSV export on every inventory table + mapping table | ⬜ Not Started |
| F.3 | Share a View: "Copy Link" button producing URL with current tab + filters | ⬜ Not Started |
| F.4 | Accessibility: ARIA labels, keyboard navigation, screen reader support for all new components | ⬜ Not Started |
| F.5 | RTL verification: all assessment pages render correctly in Hebrew | ⬜ Not Started |

### Phase G: Testing

| Task | Description | Status |
|---|---|---|
| G.1 | Component tests: all new React components (vitest + React Testing Library) | ⬜ Not Started |
| G.2 | E2E: navigate to assessment, switch tabs, verify data loads per domain | ⬜ Not Started |
| G.3 | E2E: item detail slide-over opens, shows correct data, triage actions work | ⬜ Not Started |
| G.4 | E2E: search/filter in inventory tables, URL state persists | ⬜ Not Started |
| G.5 | Visual review: screenshot all tabs, iterate on design quality | ⬜ Not Started |

---

## 12. Terminology Consistency Note

Two dimensions must be clearly distinguished everywhere:

| Dimension | What It Measures | Values |
|---|---|---|
| **Complexity** | How hard is this item to understand/deal with? (intrinsic to CPQ config) | Low / Moderate / High |
| **Migration Status** | What's the path to RCA? | Auto / Guided / Manual / Blocked |

These are related but different. A high-complexity item might be Auto-mappable (complex in CPQ but has a direct RCA equivalent). A low-complexity item might be Blocked (simple in CPQ but no RCA equivalent exists). Both must be visible and filterable in every inventory table.

---

## 13. Updated Design Principles

1. **Progressive disclosure** — executive summary first, drill down to raw code last
2. **Interactive over static** — filter, sort, search, click through. A PDF is read; this is explored.
3. **Translation, not just inventory** — explain what CPQ objects mean and how they map to RCA
4. **Insights over data** — auto-generated observations save consultants from pattern-spotting
5. **Consultant workflow, not just viewer** — triage, notes, effort estimates, branded export
6. **Working artifact, not one-time scan** — triage states, business context, effort estimation make it a living document
7. **Same design language** — rounded-2xl cards, no borders, emerald/amber/red/violet tokens, RTL-safe
8. **Dependency visualization** — the feature that makes GUI fundamentally superior to PDF
9. **Trust through transparency** — AI content clearly marked, editable, verifiable
