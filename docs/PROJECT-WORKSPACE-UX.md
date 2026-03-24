# Project Workspace — UX & Page Design

> **Purpose:** Define the pages, navigation, and flow inside a RevBrain project workspace.
> **Design philosophy:** Guide the user through a migration journey — not dump them into a dashboard. Every screen earns its place by unblocking the next step.
> **Version:** v3 — revised after second round of PM/UX audit. See [Review Decisions](#review-decisions) for rationale on all contested points across both rounds.

---

## Core Insight

A RevBrain project is a **guided but iterative journey** from "I have CPQ" to "I'm running on RCA." The UI should communicate direction without enforcing rigid linearity — migrations loop back, re-extract, re-deploy, and revisit earlier steps constantly.

**The user's mental model:**

```
Connect my Salesforce → See what I have → Understand the migration → Execute it → Verify it works
                ↑______________|                    ↑___________________|
                      (re-extract when data changes)    (fix mappings, re-deploy)
```

The workspace should guide this flow while respecting that real work is messy.

---

## Navigation Model: Stable Sidebar with Locked States

All sidebar items are **always visible**. Locked items are visually muted with a lock icon and tooltip explaining what unlocks them. Clicking a locked item navigates to a **contextual empty state** with a CTA that performs the unlock action.

**Why stable over progressive reveal:** Hiding items is disorienting — users can't see what's coming or build a mental map of the product. A stable sidebar with disabled states teaches the full workflow on day one. The lock icon + tooltip creates the same guided feeling without the "where did that menu item come from?" confusion.

**Unlock conditions:**

| Item             | Available When                        | Lock Tooltip                                   |
| ---------------- | ------------------------------------- | ---------------------------------------------- |
| Overview         | Always                                | —                                              |
| CPQ Explorer     | Source connected                      | "Connect your source org to explore CPQ data"  |
| Assessment       | First extraction complete             | "Extract CPQ data to generate your assessment" |
| Deployment       | Target connected                      | "Connect your target org to begin deployment"  |
| Runs             | Always                                | —                                              |
| Issues           | Always (empty until first assessment) | —                                              |
| Team             | Always                                | —                                              |
| Activity         | Always                                | —                                              |
| Artifacts & Docs | Always                                | —                                              |
| Settings         | Always                                | —                                              |

---

## Sidebar

```
┌─────────────────────────────┐
│  ◆ RevBrain                 │
│  ▾ GlobalCorp Migration     │  ← Project switcher (dropdown with search)
│  ───────────────────────    │
│                             │
│  MIGRATION                  │
│  ◉ Overview                 │  ← Command center
│  ○ CPQ Explorer       🔒   │  ← Locked until source connected
│  ○ Assessment         🔒   │  ← Locked until first extraction
│  ○ Deployment         🔒   │  ← Locked until target connected
│                             │
│  OPERATIONS                 │
│  ◦ Runs                     │  ← Extraction, deployment, validation history
│  ◦ Issues              3    │  ← Aggregated blockers & warnings (count badge)
│                             │
│  PROJECT                    │
│  ◦ Team                     │
│  ◦ Activity                 │
│  ◦ Artifacts & Docs         │  ← Generated reports + user uploads
│  ◦ Settings                 │
│                             │
│  ───────────────────────    │
│  Source: acme.my.sf.com  ●  │  ← Org name, not just "Connected"
│    Production · v62         │
│  Target: Not connected   ○  │
│  API: 89,250 / 100,000     │  ← API budget indicator
│    Resets in 6h 23m         │  ← Rolling 24h window context
│  ───────────────────────    │
│  🔔 2                       │  ← Notification count (bell icon)
│                             │
│  👤 Daniel Aviram           │
│     Owner                   │  ← Project role, not system role
└─────────────────────────────┘
```

### Design Notes

- **Three groups:** "Migration" (the core workflow), "Operations" (monitoring & troubleshooting), "Project" (admin & collaboration). Clear separation of concerns.
- **Project switcher** at top — click the project name, get a dropdown with search field + recent projects with status indicators. Consulting partners run 5-50+ projects over time. Search across all, show last 5 recent, "View all projects" link at bottom.
- **Connection status panel** — richer than pills. Shows org name, instance type, API version. Amber pulsing on warning states (not just a different dot color). Clicking navigates to Overview connection section.
- **API budget** — always visible with **reset timer**. Salesforce API limits are rolling 24-hour windows. "Resets in 6h 23m" tells users when they'll have headroom. Critical because RevBrain shares limits with every other integration in the Salesforce org.
- **Notification bell** — bridges background workers and user awareness. Dropdown shows recent events requiring attention.
- **Project role** shown in sidebar (Owner/Admin/Operator), not system role (org_owner). Users think of themselves by their project function, not their org-level permission tier.
- **Locked items** — visually muted (`text-slate-400`, lock icon). Tooltip on hover explains what unlocks them. Click navigates to contextual empty state with CTA.

---

## URL Design: Everything Is Deep-Linkable

Every state the user can see must be representable in the URL. This enables collaboration ("hey, look at this issue: [link]") and debugging ("the customer sent me this URL showing their failed run").

| URL Pattern               | Example                                                      |
| ------------------------- | ------------------------------------------------------------ |
| Explorer with filters     | `/project/:id/cpq-explorer?category=pricing&search=discount` |
| Specific issue            | `/project/:id/issues/:issueId`                               |
| Specific run              | `/project/:id/runs/:runId`                                   |
| Assessment tab + object   | `/project/:id/assessment?tab=mapping&object=SBQQ__PriceRule` |
| Activity filtered by user | `/project/:id/activity?user=daniel&date=today`               |
| Deployment step           | `/project/:id/deployment#validation`                         |

Filter state, tab state, search terms, and selected items all persist in the URL. This is not a v2 feature — it's a v1 requirement. Without it, users can't share links in Slack, bookmark their common views, or navigate back with the browser.

---

## Page Designs

### 1. Overview (The Command Center)

**Route:** `/project/:id`

The single page a user opens every morning to know where they stand. Not a static dashboard — a living status view with a clear next action.

#### Layout: Health Strip + Connections + What's Next + Issues

```
┌──────────────────────────────────────────────────────────────┐
│                                                              │
│  Source ● → Data ● → Assessment ● → Target ○ → Deploy ○ → Validate ○
│   Connected  12,847 rec  Moderate      Needed                │
│                                                              │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌─ SOURCE ORG ───────────────────┐ ┌─ TARGET ORG ────────┐ │
│  │ ● acme.my.salesforce.com       │ │  Connect Target Org  │ │
│  │   Production · API v62 · CPQ 24│ │  [Connect Salesforce]│ │
│  │                                 │ │                      │ │
│  │   Connection: healthy (2m ago)  │ │  Required for deploy │ │
│  │   Data: extracted 2hr ago       │ │  step.               │ │
│  │         12,847 rec · 42 objects │ │                      │ │
│  │                                 │ │                      │ │
│  │   [Test] [Re-extract] [Disconnect]│                      │ │
│  └─────────────────────────────────┘ └──────────────────────┘ │
│                                                              │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  What's Next                                                 │
│  ┌───────────────────────────────────────────────────────┐   │
│  │  Connect your target Salesforce org                   │   │
│  │  Assessment complete. Connect your target org to      │   │
│  │  begin deploying RCA configuration.                   │   │
│  │                                                       │   │
│  │  [Connect Target Org →]                               │   │
│  │  or review 2 open blockers first                      │   │
│  └───────────────────────────────────────────────────────┘   │
│                                                              │
│  Top Issues                              [View all →]        │
│  🔴 QCP onBeforeCalculate has external callout (142 LOC)     │
│  🟡 3 price rules use SOQL lookups — manual review needed    │
│  🟢 All standard product mappings available in RCA           │
│                                                              │
│  Recent Activity                         [View all →]        │
│  · Assessment completed — moderate           12 min ago      │
│  · Extraction completed — 42 obj, 12,847 rec    1hr ago     │
│  · Source org connected by Daniel                   2hr ago  │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

#### Key Design Changes from v2

- **Health strip replaces health cards.** Six large cards consumed too much vertical space before the user reached actionable content. The compact horizontal strip communicates the same information in ~60px instead of ~200px. Each pill is clickable (navigates to the relevant page). Hover shows detail. The health strip is _status at a glance_, not the primary interaction surface.
- **Connection cards separate health from data freshness.** "Connection: healthy (2m ago)" and "Data: extracted 2hr ago" are distinct concepts. A healthy connection with stale data is common — the client changed CPQ config since last extraction. Showing both prevents confusion.
- **"What's Next" card supports primary + secondary action.** The primary CTA (button) is the most logical next step. A secondary text link below acknowledges alternative valid actions: "or review 2 open blockers first." This preserves clarity while respecting that experienced users have judgment about sequencing.

#### State Progression (What's Next Card)

| Project State       | Primary Action                                         | Secondary Action                  | Error Override                           |
| ------------------- | ------------------------------------------------------ | --------------------------------- | ---------------------------------------- |
| No connections      | "Connect your source Salesforce org" [Connect →]       | —                                 | —                                        |
| Source connected    | "Extract your CPQ data" [Start Extraction →]           | "or connect target org now"       | "Reconnect source — connection lost"     |
| Extraction running  | Progress bar + "Extracting 42 objects..."              | —                                 | "Extraction paused — API limit at 80%"   |
| Extraction complete | "Review your migration assessment" [View Assessment →] | —                                 | —                                        |
| Assessment complete | "Connect your target org" [Connect →]                  | "or review N open blockers first" | —                                        |
| Target connected    | "Review deployment plan" [Go to Deployment →]          | "or re-analyze with latest data"  | "Reconnect target — needs attention"     |
| Deployment complete | "Run validation" [Run Validation →]                    | "or review deployment errors"     | "Deployment partially failed — N errors" |
| Validation passed   | Success state + [Export Migration Report]              | —                                 | "N quotes failed. Review discrepancies." |

---

### 2. CPQ Explorer

**Route:** `/project/:id/cpq-explorer`
**Available when:** Source connected (progressively useful before full extraction)

This is where RevBrain proves its value. The user sees their entire CPQ configuration laid out, organized, and searchable — something Salesforce itself doesn't offer.

#### Progressive Availability (Not All-or-Nothing)

| State                         | What's Shown                                                                                                                 |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| **Connected, pre-extraction** | Connection audit + schema discovery: CPQ version, object list, field counts. **First extraction gets ceremony** (see below). |
| **Extraction in progress**    | Banner: "Extraction in progress — 245/312 objects — ETA 4 min." Partial results appear as they arrive.                       |
| **Extraction complete**       | Full browsing: all categories, search, detail panels, dependencies.                                                          |

#### First Extraction vs. Subsequent

The first extraction is a significant moment — RevBrain is about to read the customer's entire CPQ configuration for the first time. This deserves more ceremony than a toolbar button.

- **First extraction:** Full-width card with context: "RevBrain will read your CPQ configuration: 42 objects, approximately 12,400 records. This typically takes 3-8 minutes and will use approximately 2,400 API calls (you have 89,250 remaining). [Start First Extraction →]"
- **Subsequent extractions:** Compact toolbar with [Refresh Changed] and [Re-extract All] buttons.

This pattern (prominent first time, compact subsequently) correctly signals importance without permanent clutter.

#### Layout: Category Sidebar + Data Table + Detail Panel

```
┌────────────┬─────────────────────────────────┬──────────────────┐
│ CATEGORIES │  Products (847)          🔍     │  DETAIL          │
│            │                                 │                  │
│ ▸ Products │  Name        ▲  Type    Price   │  Enterprise Lic  │
│   847      │  ─────────────────────────────  │  Product2        │
│ ▸ Pricing  │  Enterprise   Lic    $2,400/yr  │                  │
│   1,203    │  Professional Lic    $1,200/yr  │  Fields: 34      │
│ ▾ Rules    │  Add-On Pack  Add       $99/mo  │  Rules: 12       │
│   Price    │  ...                            │  Bundles: 3      │
│   Config   │                                 │                  │
│   Discount │  Showing 1-50 of 847            │  Dependencies:   │
│ ▸ QCP Code │                                 │  · 4 price rules │
│   3 files  │  ┌─ EXTRACTION ───────────────┐ │  · 2 discounts   │
│ ▸ Custom   │  │ Last: 2hr ago  [Refresh ↻] │ │  · 1 config rule │
│   Fields   │  │ API: 89,250 / 100,000      │ │                  │
│            │  └────────────────────────────┘ │  [View in SF →]  │
└────────────┴─────────────────────────────────┴──────────────────┘
```

> **Implementation note:** The three-panel layout is the most complex component in the product. The data table requires server-side pagination (or virtualized scrolling for large datasets). For v1, consider launching with category sidebar + data table only, with the detail panel as a slide-over sheet. This reduces layout complexity significantly while keeping all data accessible. Promote to persistent third panel when polished.

#### Categories (Logical Grouping, Not Raw Objects)

| Category          | Objects Included                                                                       | Icon       |
| ----------------- | -------------------------------------------------------------------------------------- | ---------- |
| **Products**      | Product2, SBQQ\_\_ProductOption, bundles, features                                     | Package    |
| **Pricing**       | PricebookEntry, SBQQ**PriceRule, SBQQ**PriceAction, SBQQ**BlockPrice, SBQQ**Cost       | DollarSign |
| **Rules**         | SBQQ**ConfigurationRule, SBQQ**DiscountSchedule, SBQQ**DiscountTier, SBQQ**LookupQuery | GitBranch  |
| **QCP Code**      | CustomScript, StaticResource (JS)                                                      | Code       |
| **Contracts**     | Contract, SBQQ**Subscription, SBQQ**Amendment                                          | ScrollText |
| **Custom Fields** | Non-standard fields across all objects                                                 | Puzzle     |

> **Note on Quotes:** Quote data (SBQQ**Quote, SBQQ**QuoteLine) is extracted separately as **validation baselines** — accessible from the Deployment page, not as a primary Explorer category. Quote data is high-volume, compliance-sensitive, and not needed for configuration analysis. Extraction of quote snapshots is opt-in and scoped to representative samples.

#### Extraction Toolbar (Post-First Extraction)

Compact toolbar within CPQ Explorer:

- Last extraction timestamp + record count summary
- [Refresh Changed] button (incremental) + [Re-extract All] button
- API usage indicator (mirrors sidebar, more detail on hover)
- Warning banner at 80% API usage

**Delta Summary on re-extraction:** When [Refresh Changed] completes, show a notification: "Extraction complete: 3 new Price Rules added, 1 Product modified, 0 deleted since last run." This is critical for SIs managing change orders when clients modify CPQ config mid-migration.

#### Key Features

- **Search across categories.** Type "discount" and see matching products, rules, price actions, and QCP code — results grouped by category with counts. Filter state persists in URL for bookmarking and sharing.
- **Dependencies panel** in detail view. Click a product → see every rule, price action, and bundle that references it, as a structured list with counts and clickable links.
- **QCP code viewer** with syntax highlighting, method detection badges (onBeforeCalculate, onAfterCalculate, etc.), and complexity classification (simple/moderate/complex based on LOC + pattern detection).
- **Bundle tree** for product options — collapsible hierarchy showing features → options → nested bundles.
- **CSV export** of current filtered view. Enterprise users always end up screenshotting tables — give them the data directly.

---

### 3. Assessment

**Route:** `/project/:id/assessment`
**Available when:** First extraction complete

This page answers: "How hard is this migration, and what's the plan?" It serves two audiences via tabs.

#### Unified Terminology

Throughout the product, we use one consistent scale for migration complexity:

| Category    | Meaning                                                           | Color         |
| ----------- | ----------------------------------------------------------------- | ------------- |
| **Auto**    | Direct mapping, RevBrain handles it                               | `emerald-500` |
| **Guided**  | Mapping exists but needs operator review/decisions                | `amber-500`   |
| **Manual**  | No automated mapping — requires custom work                       | `red-500`     |
| **Blocked** | No RCA equivalent exists — requires re-architecture or workaround | `slate-500`   |

These terms are used everywhere: Assessment breakdown, Mapping table status column, Issues page, exported PDFs. Never mix with "Simple/Moderate/Complex" — that's ambiguous and creates confusion in client-facing reports.

#### Tab 1: Report (Stakeholder View)

The view a consulting partner shows their end-client. Designed for export as PDF.

```
┌──────────────────────────────────────────────────────────────┐
│                                                              │
│  Migration Assessment            Run #3 · 12 min ago  [▾]   │
│                                         ↑ history dropdown   │
│                                                              │
│  Complexity Breakdown                                        │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐    │
│  │ Auto     │  │ Guided   │  │ Manual   │  │ Blocked  │    │
│  │ 12 items │  │ 8 items  │  │ 3 items  │  │ 1 item   │    │
│  │ ████████ │  │ ██████░░ │  │ ███░░░░░ │  │ █░░░░░░░ │    │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘    │
│                                                              │
│  Key Findings                                                │
│  🔴 QCP onBeforeCalculate has external callout (142 LOC)     │
│  🟡 3 price rules use SOQL lookups (requires manual review)  │
│  🟡 Discount tiers use custom formula — partial RCA match    │
│  🟢 All standard product mappings available in RCA           │
│  🟢 Bundle structure compatible with Product Selling Models  │
│                                                              │
│                    [Export PDF] [Export CSV] [Re-analyze]     │
└──────────────────────────────────────────────────────────────┘
```

**No auto-generated effort estimate.** The same logic that killed the Gantt chart applies here. RevBrain doesn't know team capacity, skill level, or client responsiveness. When "4-6 weeks" is wrong — and it will be — it undermines either the consultant's credibility or RevBrain's. The 4-category breakdown IS the honest version of this information. Consultants will draw their own timeline conclusions — they're better at it than any heuristic we'll build.

**Assessment History:** The dropdown (Run #3 · 12 min ago) switches between historical snapshots. When you select a past run, the page renders that version's data with a banner: "Viewing historical assessment from [date]. [View current →]". No side-by-side diff in v1 — that's v2 work. But switching between snapshots lets users track how complexity evolves as the client modifies CPQ config.

#### Tab 2: Mapping Detail (Operator View)

The working view for the person doing the migration. Object-by-object CPQ → RCA mapping.

| CPQ Object                | RCA Equivalent                    | Status | Notes             |     |
| ------------------------- | --------------------------------- | ------ | ----------------- | --- |
| SBQQ\_\_Product           | Product Selling Model             | Auto   | Direct mapping    | (?) |
| SBQQ\_\_PriceRule         | Pricing Plan                      | Guided | Conditions differ | (?) |
| SBQQ\_\_CustomScript      | Apex/Flow + Calculation Procedure | Manual | Requires rewrite  | (?) |
| SBQQ\_\_ConfigurationRule | Product Configuration             | Guided | Partial match     | (?) |

Each row expandable to show: field-level mapping, transformation notes, "View in Explorer" link.

**Inline RCA education:** The (?) icon on each RCA equivalent opens a popover with: what this RCA concept is (1-2 sentences), how it differs from the CPQ equivalent, and a link to Salesforce documentation. This transforms RevBrain from a mapping _tool_ into a migration _teacher_. A consultant who knows CPQ deeply may have no idea what a "Pricing Plan" is in RCA. This educational content is proprietary knowledge — a moat that competitors would need to build from scratch.

**CSV export** of the full mapping table with all columns.

#### Tab 3: Migration Plan (User-Owned)

A workspace where users organize mapping items into phases. RevBrain pre-populates a sensible default (simple items first, complex last, respecting dependencies), but **the user owns it**. No auto-generated time estimates — consultants enter their own.

```
┌──────────────────────────────────────────────────────────────┐
│  Migration Plan                          [Reset to default]  │
│                                                              │
│  Phase 1: Products & Catalog                                 │
│  ┌─ SBQQ__Product (Auto) ─┐ ┌─ Product2 (Auto) ──────────┐ │
│  └─────────────────────────┘ └────────────────────────────┘  │
│  ┌─ SBQQ__ProductOption (Auto) ──────────────────────────┐   │
│  └───────────────────────────────────────────────────────┘   │
│  Your estimate: [________]                                   │
│                                                              │
│  Phase 2: Pricing Rules                                      │
│  ...                                                         │
│                                                              │
│  + Add Phase                                                 │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

Users can: add/remove phases, drag mapping items between phases, reorder phases, enter their own effort estimates per phase. The plan persists across re-assessments — if new items appear (client added CPQ objects), they land in an "Unassigned" section for the user to triage.

> **Why user-owned instead of auto-generated:** RevBrain can sort by complexity and dependencies. It cannot model team capacity, vacation schedules, parallel workstreams, or client responsiveness. A plan that pretends to know these things will be wrong and ignored. A plan that organizes the _what_ and lets consultants own the _when_ is actually useful.

---

### 4. Deployment

**Route:** `/project/:id/deployment`
**Available when:** Target connected

#### Environment Strategy

Real Salesforce migrations go: Source (Prod) → Target (Dev Sandbox) → Target (UAT Sandbox) → Target (Prod). The target connection shouldn't be a permanent 1:1 relationship.

**"Switch Target Environment" dropdown** on the Deployment page header. Users can disconnect the current target and connect a new one (sandbox → production) without creating a new project. The deployment checklist resets, but assessment and extracted data are preserved.

#### Layout: Grouped Checklist Wizard

A checklist grouped by **ownership** — making it clear which steps are RevBrain's job and which are the customer's.

```
┌──────────────────────────────────────────────────────────────┐
│  Deployment                    Target: sandbox.acme.sf [▾]   │
│                                                              │
│  PRE-DEPLOYMENT CHECKS (automatic)                           │
│  ✅ Coexistence check passed                                 │
│     └ [Expand for details]                                  │
│  ✅ External ID fields verified                              │
│                                                              │
│  METADATA (your team deploys)                                │
│  ⬜ Deploy metadata package via your CI/CD                   │
│     └ Custom fields + permission sets                       │
│       [Download Package]  [View Instructions]               │
│  ⬜ Verify metadata in target                                │
│     └ [Verify Metadata →] (checks target org automatically) │
│                                                              │
│  DATA MIGRATION (RevBrain executes)                          │
│  ⬜ Dry run (validate without committing)                    │
│     └ Simulates API payloads against target schema          │
│       [Run Dry Run →]                                       │
│  ⬜ Start data migration                                     │
│     └ 847 products · 1,203 pricing records · 312 rules      │
│     └ Estimated API calls: ~4,200 (you have 89,250 left)    │
│       [Start Migration →]                                   │
│                                                              │
│  VALIDATION                                                  │
│  ⬜ Run pricing validation                                   │
│     └ Compare RCA pricing against CPQ snapshots             │
│       [Run Validation]                                      │
│                                                              │
│  SIGN-OFF                                                    │
│  ⬜ Mark migration as complete                               │
│     └ Generates final report + archives project             │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

#### Key Changes from v2

- **"Verify Metadata" replaces "Mark as Deployed."** The biggest friction point in any migration tool is the handoff between "what the tool does" and "what the user's admin does." If you let the customer manually confirm metadata deployment, they will inevitably be wrong, the data migration will fail, and they will blame RevBrain. The [Verify Metadata →] button makes an API call to the target org to check that required custom fields, objects, and permission sets exist. If verification fails, it shows exactly what's missing.
- **Dry Run step added before data migration.** Simulates API payloads against target schema rules without committing data. Catches `FIELD_CUSTOM_VALIDATION_EXCEPTION`, `REQUIRED_FIELD_MISSING`, and schema mismatches before actual records are created. Prevents the "oops, 15,000 bad records that now need rollback" scenario.
- **API call estimate shown before migration.** "Estimated API calls: ~4,200 (you have 89,250 left)" lets users make informed decisions about _when_ to run operations. If the estimate exceeds remaining budget, show a warning with reset timer.
- **Target environment switcher** at top of deployment page.

#### Coexistence Check (Expanded for Non-Happy Paths)

The coexistence check is one of the most important steps in the migration. The non-happy paths need real UI:

| Scenario                           | What User Sees                                                                                            | Action                                      |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| Clean target (no CPQ, RCA enabled) | ✅ "No CPQ detected. RCA enabled. 0 product overlap."                                                     | Proceed                                     |
| CPQ installed in target            | 🔴 "CPQ detected in target org. Coexistence migration required."                                          | Link to coexistence approach docs           |
| RCA not enabled                    | 🔴 "Revenue Cloud Advanced not provisioned. Contact Salesforce."                                          | Link to provisioning instructions           |
| Product overlap                    | 🟡 "47 products in target match source by name. Choose per product: update existing / skip / create new." | Selection UI (bulk + per-product)           |
| Permission issues                  | 🔴 "Connected user lacks Create permission on ProductSellingModel, PricingPlan."                          | List of missing permissions + what to grant |

#### Rollback (Multi-Step Confirmation Flow)

Rollback is one of the highest-anxiety moments in the product. A single confirmation modal is not enough.

```
Step 1: Impact Summary
┌────────────────────────────────────────┐
│  Rollback will delete:                 │
│  · 847 products                        │
│  · 1,203 pricing records               │
│  · 312 rules                           │
│                                        │
│  Will NOT rollback:                    │
│  · Metadata (custom fields, perms)     │
│  · Records created outside RevBrain    │
│                                        │
│  ⚠ 3 records modified since deployment │
│    Rollback will overwrite changes.    │
│    [View affected records]             │
│                                        │
│  [Cancel]             [Continue →]     │
└────────────────────────────────────────┘

Step 2: Type to Confirm
┌────────────────────────────────────────┐
│  Type "rollback GlobalCorp" to confirm │
│  ┌──────────────────────────────────┐  │
│  │                                  │  │
│  └──────────────────────────────────┘  │
│  [Cancel]             [Rollback →]     │
└────────────────────────────────────────┘

Step 3: Progress
  Rollback in progress... 543 / 2,362 records

Step 4: Summary
  Rollback complete. 2,362 records deleted.
  Target org restored to pre-deployment state.
  [View Rollback Run in Runs →]
```

The critical addition is **Step 1's "Will NOT rollback" section and the modified-since-deploy warning.** Users need to understand the _boundaries_ of rollback, not just confirm they want it.

#### Error Recovery

| Failure                                     | What User Sees                                                                    | Actions Available                                   |
| ------------------------------------------- | --------------------------------------------------------------------------------- | --------------------------------------------------- |
| Dry run: 12 validation errors               | "Dry run found 12 issues. Fix these before migrating real data."                  | [View Errors] [Re-run Dry Run]                      |
| Data migration: 200/847 created, then error | "Migration paused at 200/847 products. Error: FIELD_INTEGRITY on Product X."      | [View Error Details] [Retry Failed] [Rollback]      |
| Validation: 3/312 quotes failed             | "309 passed, 3 failed. Review discrepancies."                                     | [View Failures] [Export Report] [Re-run Validation] |
| Metadata not deployed                       | "Metadata verification failed. Missing: RevBrain_Migration_Key\_\_c on Product2." | [Download Package] [View Instructions] [Re-verify]  |

> **Note on partial failure recovery:** For v1, partial migration failures offer [Retry Failed] and [Rollback]. "Skip & Continue" is deferred to v1.1 — safely skipping records in highly relational CPQ data (where a skipped product causes cascading child failures) requires careful dependency analysis that shouldn't be rushed.

---

### 5. Runs (Operations History)

**Route:** `/project/:id/runs`

Every async operation — extraction, assessment, deployment, validation, dry run — is a **run**. This page is the single source of truth when something goes wrong.

```
┌──────────────────────────────────────────────────────────────┐
│  Runs                                            [Filter ▾]  │
│                                                              │
│  ┌─ #12 ─────────────────────────────────────────────────┐   │
│  │ Validation Run          ● Passed         2:14 PM today│   │
│  │ 312/312 quotes passed · Duration: 8m 42s · By: Daniel │   │
│  │ Artifacts: [Validation Report PDF] [CSV]              │   │
│  └───────────────────────────────────────────────────────┘   │
│                                                              │
│  ┌─ #11 ─────────────────────────────────────────────────┐   │
│  │ Data Migration          ● Complete       1:58 PM today│   │
│  │ 2,362 records created · Duration: 12m · By: Daniel    │   │
│  │ Artifacts: [Deployment Manifest] [Error Log (0)]      │   │
│  └───────────────────────────────────────────────────────┘   │
│                                                              │
│  ┌─ #8 ──────────────────────────────────────────────────┐   │
│  │ Data Migration          🔴 Failed        Yesterday    │   │
│  │ 200/847 products · Error: FIELD_INTEGRITY · By: Daniel│   │
│  │ [View Error Log] [Retry]                              │   │
│  └───────────────────────────────────────────────────────┘   │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

#### Run Detail View (Click to Expand)

- **Status + duration + triggered by**
- **Live progress** if running (progress bar + per-object counts)
- **Logs** — structured event log, filterable by severity
- **Artifacts** — generated files (reports, metadata packages, error logs) with download links. CSV export available for all tabular artifacts.
- **Retry / Re-run** button for failed runs

#### Why This Page Is Non-Negotiable

Extraction, deployment, and validation are all async operations that can take minutes to hours. Without a Runs page, users have no way to answer: "What happened?" "Why did it fail?" "Can I retry?" "What did it produce?" This is the operational backbone of the product.

---

### 6. Issues

**Route:** `/project/:id/issues`

Aggregated view of every finding, blocker, warning, and risk across the project.

#### Issue Lifecycle

Issues have explicit statuses with real workflow:

| Status           | Meaning                                                 | Transition                                        |
| ---------------- | ------------------------------------------------------- | ------------------------------------------------- |
| **Open**         | Auto-created by assessment/deployment/validation/audit  | Default for new issues                            |
| **Acknowledged** | "I've seen this, will handle it"                        | Manual by user                                    |
| **Won't Fix**    | "False positive" or "accepted risk" (requires a reason) | Manual, only for Warnings and Info                |
| **Resolved**     | Fixed — verified by system or user                      | Via [Re-verify] for blockers, manual for warnings |

**Key rules:**

- **Blockers cannot be manually resolved.** If RevBrain found the problem (missing permissions, unmappable object), RevBrain must verify the fix. The "Resolve" action for blockers is [Re-verify Fix →] which triggers a micro-audit to confirm the issue is actually gone.
- **Warnings and Info can be manually acknowledged or marked Won't Fix** with a required reason.
- **Auto-resolution:** When a re-assessment or re-validation no longer detects a previously open issue, it's auto-marked as "Resolved (auto-verified)" with a link to the run that verified it.

#### Comment Thread Per Issue

Each issue has a comment thread — plain text with timestamps, no @mentions needed for v1. Migration teams need to discuss findings: "I talked to the client, this QCP callout is for logging only — we can replace it with a Platform Event." That context gets lost in Slack. Having it attached to the issue in RevBrain means it's discoverable by anyone on the project.

#### Layout

```
┌──────────────────────────────────────────────────────────────┐
│  Issues (14)         [Filter: All ▾] [Sort: ▾] [Export CSV]  │
│                                                              │
│  BLOCKERS (2)                                                │
│  ┌───────────────────────────────────────────────────────┐   │
│  │ 🔴 QCP external callout in onBeforeCalculate          │   │
│  │    142 LOC · Cannot auto-migrate · Requires Apex rewrite  │
│  │    Source: Assessment Run #10 · [View in Explorer]    │   │
│  │    Status: Open · [Acknowledge] [Re-verify Fix →]     │   │
│  │    💬 2 comments                                      │   │
│  └───────────────────────────────────────────────────────┘   │
│  ...                                                         │
└──────────────────────────────────────────────────────────────┘
```

Issues are **auto-populated** from: connection audits, assessment analysis, deployment errors, validation failures. Each has: severity, source run, recommended action, link to relevant record, status, and comment thread.

---

### 7. Team

**Route:** `/project/:id/team`

Project-scoped team view.

```
┌──────────────────────────────────────────────────────────────┐
│  Project Team                                    [+ Invite]  │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐    │
│  │  Daniel Aviram           Owner                       │    │
│  │     Connected source org · 12 actions today          │    │
│  ├──────────────────────────────────────────────────────┤    │
│  │  Sarah Chen              Admin                       │    │
│  │     Last active 2 hours ago · Ran extraction         │    │
│  ├──────────────────────────────────────────────────────┤    │
│  │  Mike Johnson            Operator                    │    │
│  │     Invited · Not yet active · [Resend Invite]       │    │
│  └──────────────────────────────────────────────────────┘    │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

- **Activity counts are links.** "12 actions today" navigates to `/project/:id/activity?user=daniel&date=today`. Creates a natural drill-down path.
- **[Resend Invite]** for pending users. Enterprise invite emails get lost in spam filters constantly.

---

### 8. Activity Log

**Route:** `/project/:id/activity`

Chronological feed of everything that happened in this project. Filterable by: person, event type, date range. Supports URL-based filtering for deep links from Team page and notifications.

---

### 9. Artifacts & Docs

**Route:** `/project/:id/artifacts`

Renamed from "Documents" to reflect its primary purpose: generated output + supporting files.

**Primary content:** Auto-generated reports — assessment PDFs, validation reports, deployment manifests, error logs. Each artifact links back to the run that produced it.

**Secondary content:** User-uploaded files — SOWs, test plans, customer sign-off sheets.

This reframing makes the page feel integral to the product ("output of RevBrain's analysis") rather than a file cabinet that might go unused.

---

### 10. Settings

**Route:** `/project/:id/settings`

Extend with:

- **Project details** (name, description, dates) — existing
- **Salesforce connections** — detailed connection management (full audit metadata, reconnect, disconnect)
- **Extraction settings** — which object categories to include, quote snapshot sampling options
- **Data & privacy** — data retention policy display, storage indicator ("12,847 records, 48 MB"), manual purge ("Delete all extracted Salesforce data"), region indicator ("Data stored in [region]"). Surfacing this proactively tells enterprise buyers "we've thought about this" before they ask.
- **Danger zone** — archive project, delete project

---

## Empty States & First-Run Experience

Every page needs a compelling empty state. Not "No data" — but "Here's what this page will show you, and here's how to get there."

| Page                                     | Empty State Message                                                                | CTA                                                     |
| ---------------------------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------- |
| Overview (no connection)                 | "Connect your Salesforce org to begin your migration journey"                      | [Connect Source Org] with instance type selector inline |
| CPQ Explorer (locked)                    | "Your CPQ configuration will appear here. Connect your source org to get started." | [Connect Source Org →]                                  |
| CPQ Explorer (connected, pre-extraction) | Schema preview + first extraction card (see CPQ Explorer section)                  | [Start First Extraction →]                              |
| Assessment (locked)                      | "We'll analyze your CPQ configuration and map it to RCA. Extract your data first." | [Go to CPQ Explorer →]                                  |
| Deployment (locked)                      | "Connect your target Salesforce org when you're ready to deploy."                  | [Connect Target Org →]                                  |
| Runs (no runs yet)                       | "Operations will appear here as you extract, deploy, and validate."                | —                                                       |
| Issues (no issues)                       | "No issues found. Issues are auto-populated from assessments and deployments."     | —                                                       |
| Activity (new project)                   | "Actions in this project will appear here as your team works."                     | —                                                       |

---

## Connection Flow (Integrated into Overview)

The connection flow lives in the Overview page's connection cards:

1. **Click "Connect"** → Instance type selector appears inline (Production / Sandbox / Custom Domain)
2. **Click "Continue"** → Popup opens to Salesforce login
3. **Overview shows "Connecting..."** with spinner on the card
4. **Popup completes** → Card transitions to connected state with org metadata
5. **"What's Next" updates** → Now shows extraction CTA

If popup is blocked: fall back to redirect flow + toast notification. Detect `?sf_connected=true` on return → show success toast.

---

## Notification System

Bell icon with count in the sidebar. Clicking opens a dropdown showing the 5 most recent notifications.

**Persistence model:**

- **Server-side storage** (not client-state). Survives page refreshes, visible across devices.
- **Read/unread state** per user. Clicking a notification marks it read. "Mark all as read" at top.
- **Retention:** Last 50 notifications or last 30 days, whichever is fewer.
- **Polling:** Every 30 seconds when app is in foreground. Pauses when backgrounded.
- **"View all" link** at bottom of dropdown → filtered Activity log view.

Events that generate notifications:

- Connection lost / needs attention
- API limit warnings (80%, 90%)
- Long-running operation complete (extraction, deployment, validation)
- Operation failed
- Issue auto-resolved
- Team member joined project

Email notifications for critical events (connection lost, deployment failed) via existing Resend integration, rate-limited to 1 per 24 hours per event type.

---

## Responsive Behavior

- **Desktop (>1024px):** Primary design target. Full layouts as specified.
- **Tablet (768-1024px):** Supported. Collapsed sidebar (icons only, expand on click). CPQ Explorer drops to two panels (detail as slide-over sheet).
- **Mobile (<768px):** Functional but not optimized. Single-column layouts, hamburger menu. **Mobile is read-only status checking, not an active work surface.** Migration operators work at desks with large screens. Explicitly designing for mobile CPQ Explorer or Deployment workflows is wasted effort.

---

## Accessibility

- Health strip pills: `role="status"` with descriptive `aria-label`
- Locked menu items: `aria-disabled="true"` with `aria-describedby` pointing to unlock hint
- Connection status: not color-only — text labels + icons always present
- All breakdowns: `aria-label` with text summary (e.g., "12 auto, 8 guided, 3 manual, 1 blocked")
- Live operation progress: `aria-live="polite"` region for count updates
- Issues severity: icon + text label, not color alone
- Notification bell: `aria-label="2 unread notifications"`

---

## Design Tokens (Consistent Visual Language)

| Concept                            | Color                               | Usage                                            |
| ---------------------------------- | ----------------------------------- | ------------------------------------------------ |
| Active / Connected / Pass / Auto   | `emerald-500`                       | Status dots, success badges, auto-mappable items |
| Warning / Needs Attention / Guided | `amber-500`                         | API warnings, connection issues, guided items    |
| Error / Failed / Manual            | `red-500`                           | Disconnected, validation fail, manual items      |
| In Progress / Running              | `violet-500`                        | Active operations, loading states                |
| Locked / Unavailable / Blocked     | `slate-400`                         | Locked items, disabled buttons, blocked items    |
| Info / Neutral                     | `sky-500`                           | Info-level issues                                |
| Success (completed flow)           | `emerald-500` with subtle checkmark | Professional completion state                    |

---

## v1.1 Roadmap (Deferred Features)

Features that are genuinely valuable but deferred from v1 to manage scope. Ordered by impact-to-effort ratio:

| Feature                                   | Why Deferred                                                                      | Trigger to Build                                                       |
| ----------------------------------------- | --------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| **Command palette (Cmd+K)**               | Low effort, but needs entity index. Power users will request it.                  | After 10+ active projects per user                                     |
| **Assessment diff (compare runs)**        | v1 has snapshot switching. Side-by-side diff is significant engineering.          | When consultants report difficulty tracking CPQ changes                |
| **Concurrency awareness / presence**      | Valuable but requires real-time infrastructure (presence service).                | When teams >3 people actively collide on same project                  |
| **Contextual RCA education content**      | High-value moat, but content creation is significant.                             | Ongoing — build incrementally per mapping rule                         |
| **Skip & Continue in partial deployment** | Safe skipping in relational data needs dependency analysis.                       | After v1 deployment experience reveals common partial-failure patterns |
| **Data retention UI in Settings**         | Important for enterprise trust, but v1 handles retention via backend jobs.        | Before first enterprise security review                                |
| **Saved views/filters in Explorer**       | URL-based filters give bookmarking in v1. Named saved views are v2.               | When power users report >5 recurring queries                           |
| **Project onboarding checklist**          | "What's Next" card already guides first-run. Dedicated checklist is nice-to-have. | If activation metrics show first-session dropoff                       |

---

## Summary: What Makes This Great

1. **Stable navigation with progressive unlock** — users see the full product map from day one
2. **"What's Next" with primary + secondary actions** — guided without being rigid
3. **Health strip over linear stepper** — honest about the iterative nature of migrations
4. **Inline connection flow** — no page jumps for the most critical action
5. **CPQ Explorer with dependencies + delta summaries** — see what you have and what changed
6. **Assessment with unified terminology + user-owned migration plan** — actionable, exportable, honest
7. **Deployment with verify-not-trust + dry run + environment switching** — confidence at every step
8. **Multi-step rollback with impact analysis** — high-anxiety moments handled with care
9. **Runs page** — every async operation is traceable, retryable, and produces artifacts
10. **Issues with real lifecycle + comments** — blockers can't be wished away, only verified
11. **Deep-linkable everything** — collaboration-ready from day one
12. **Professional completion state** — clean success + Export Report, earned not gratuitous

The principle throughout: **reduce cognitive load, increase confidence.** At every step, the user knows where they are, what's working, what needs attention, and what comes next.

---

## Implementation Progress Tracker

### Foundation

| Task | Description                                                                                                                                | Status            |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------ | ----------------- |
| F.1  | Mock data: multiple projects at different journey stages + all entity seed data                                                            | ✅ Done `3c9cfef` |
| F.2  | Project workspace layout: new sidebar with 3 groups (Migration/Operations/Project), connection status panel, API budget, notification bell | ✅ Done `3c9cfef` |
| F.3  | Locked sidebar items with tooltips + navigation to contextual empty states                                                                 | ✅ Done `3c9cfef` |
| F.4  | Project switcher dropdown with search                                                                                                      | ✅ Done `3c9cfef` |
| F.5  | Translation files: `en/workspace.json` + `he/workspace.json` with all new strings                                                          | ✅ Done `3c9cfef` |
| F.6  | URL routing: all 10 workspace pages registered in router                                                                                   | ✅ Done `3c9cfef` |

### Pages

| Task | Description                                                                                           | Status            |
| ---- | ----------------------------------------------------------------------------------------------------- | ----------------- |
| P.1  | Overview: health strip (6 pills with status + click navigation)                                       | ✅ Done `3c9cfef` |
| P.2  | Overview: connection cards (source + target) with inline connect flow                                 | ✅ Done `3c9cfef` |
| P.3  | Overview: "What's Next" card with primary + secondary action, state progression table                 | ✅ Done `3c9cfef` |
| P.4  | Overview: top issues panel + recent activity feed                                                     | ✅ Done `3c9cfef` |
| P.5  | CPQ Explorer: category sidebar + data table with search + extraction toolbar                          | ⬜ Not Started    |
| P.6  | CPQ Explorer: first extraction ceremony card vs compact subsequent toolbar                            | ⬜ Not Started    |
| P.7  | CPQ Explorer: detail panel (slide-over sheet for v1) with dependencies list                           | ⬜ Not Started    |
| P.8  | Assessment: Tab 1 — Report view with complexity breakdown (Auto/Guided/Manual/Blocked) + key findings | ⬜ Not Started    |
| P.9  | Assessment: Tab 2 — Mapping detail table with expandable rows + RCA education popovers                | ⬜ Not Started    |
| P.10 | Assessment: Tab 3 — User-owned migration plan with drag-and-drop phases                               | ⬜ Not Started    |
| P.11 | Assessment: history dropdown (switch between past assessment runs)                                    | ⬜ Not Started    |
| P.12 | Deployment: grouped checklist wizard (pre-checks / metadata / data / validation / sign-off)           | ⬜ Not Started    |
| P.13 | Deployment: coexistence check expanded view (5 scenarios)                                             | ⬜ Not Started    |
| P.14 | Deployment: data migration progress (inline, per-object bars)                                         | ⬜ Not Started    |
| P.15 | Deployment: validation results (pass/fail per scenario, field diffs)                                  | ⬜ Not Started    |
| P.16 | Deployment: multi-step rollback flow (impact → type-to-confirm → progress → summary)                  | ⬜ Not Started    |
| P.17 | Deployment: target environment switcher                                                               | ⬜ Not Started    |
| P.18 | Runs: operations history list with filter + run detail expand                                         | ⬜ Not Started    |
| P.19 | Runs: live progress for running operations                                                            | ⬜ Not Started    |
| P.20 | Issues: aggregated view with severity grouping (Blocker/Warning/Info)                                 | ⬜ Not Started    |
| P.21 | Issues: lifecycle buttons (Acknowledge / Won't Fix / Re-verify Fix)                                   | ⬜ Not Started    |
| P.22 | Issues: comment thread per issue                                                                      | ⬜ Not Started    |
| P.23 | Team: project-scoped team view with activity counts as links + resend invite                          | ⬜ Not Started    |
| P.24 | Activity: chronological feed with person/type/date filters + URL-based filtering                      | ⬜ Not Started    |
| P.25 | Artifacts & Docs: auto-generated reports section + user uploads                                       | ⬜ Not Started    |
| P.26 | Settings: extended with Salesforce connections, extraction settings, data & privacy, danger zone      | ⬜ Not Started    |

### Empty States & Connection Flow

| Task | Description                                                                                  | Status            |
| ---- | -------------------------------------------------------------------------------------------- | ----------------- |
| E.1  | All empty states per the empty state table (10 contextual empty states with CTAs)            | ✅ Done `3c9cfef` |
| E.2  | Connection flow: inline in Overview with instance type selector → popup → success transition | ⬜ Not Started    |
| E.3  | Connection flow: popup blocked fallback (redirect + toast + `?sf_connected=true` detection)  | ⬜ Not Started    |

### Notifications

| Task | Description                                                 | Status         |
| ---- | ----------------------------------------------------------- | -------------- |
| N.1  | Notification bell dropdown with unread count + mark-as-read | ⬜ Not Started |
| N.2  | Notification polling (30s) + server-side persistence model  | ⬜ Not Started |

### Testing

| Task | Description                                                                           | Status         |
| ---- | ------------------------------------------------------------------------------------- | -------------- |
| T.1  | Unit tests: all new React components (vitest + React Testing Library)                 | ⬜ Not Started |
| T.2  | E2E: project creation flow (create → navigate to workspace → verify sidebar)          | ⬜ Not Started |
| T.3  | E2E: project workspace navigation (all 10 pages load, locked items show empty states) | ⬜ Not Started |
| T.4  | E2E: connection flow mock (connect → status change → What's Next updates)             | ⬜ Not Started |
| T.5  | E2E: project lifecycle (create → work through stages → archive)                       | ⬜ Not Started |
| T.6  | Visual review: screenshot all pages, iterate on design quality                        | ⬜ Not Started |

### Quality & Polish

| Task | Description                                                                          | Status         |
| ---- | ------------------------------------------------------------------------------------ | -------------- |
| Q.1  | Accessibility audit: ARIA labels, keyboard navigation, screen reader, color-not-only | ⬜ Not Started |
| Q.2  | RTL verification: all pages render correctly in Hebrew                               | ⬜ Not Started |
| Q.3  | Responsive: desktop (primary), tablet (collapsed sidebar), mobile (functional)       | ⬜ Not Started |
| Q.4  | Design tokens: consistent color usage per the design tokens table                    | ⬜ Not Started |

---

## Review Decisions

Documenting all contested points across both review rounds and the reasoning behind each decision.

### Round 2 — Accepted Changes

| Feedback                                       | Decision                                                                      | Rationale                                                                                                                                               |
| ---------------------------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| What's Next needs primary + secondary action   | **Added secondary text link below primary CTA**                               | States exist where two actions are valid (extract OR connect target). Primary button + secondary link preserves clarity while respecting user judgment. |
| Health cards → compact strip                   | **Replaced 6 cards with horizontal status strip**                             | Cards consumed ~200px before actionable content. Strip communicates same info in ~60px. Health is glance-status, not interaction surface.               |
| First extraction deserves ceremony             | **Full card for first extraction, toolbar for subsequent**                    | First time = significant moment. Subsequent = maintenance action. Standard first-run vs. returning-user pattern.                                        |
| Remove effort estimate from Assessment         | **Removed "4-6 weeks" line**                                                  | Same logic as Gantt chart. RevBrain can't model team capacity. Wrong estimates undermine credibility. Category breakdown IS the honest version.         |
| Suggested Phases → user-owned Migration Plan   | **Reframed: RevBrain pre-populates, user owns**                               | Consultants know their team. RevBrain knows the dependencies. Collaborative default, not prescriptive auto-generation.                                  |
| Standardize terminology                        | **Unified on Auto/Guided/Manual/Blocked everywhere**                          | Mixing "Simple/Moderate/Complex" with "Auto/Guided/Manual/Blocked" confuses exported PDFs. One scale, used consistently.                                |
| Rollback → multi-step confirmation             | **4-step flow: impact → type-to-confirm → progress → summary**                | Rollback is highest-anxiety moment. "Will NOT rollback" section + modified-since-deploy warning are critical for user confidence.                       |
| Verify Metadata replaces Mark as Deployed      | **[Verify Metadata →] makes API call to target org**                          | Honor system fails. SIs say "deployed" when they forgot permission sets. System verification prevents cascading data migration failures.                |
| Add Dry Run before data migration              | **New step in deployment checklist**                                          | Validates API payloads against target schema without committing. Catches errors before 15,000 bad records need rollback.                                |
| Separate connection health from data freshness | **Two distinct lines in connection card**                                     | Healthy connection + stale data is common. "Connection: healthy (2m)" and "Data: extracted 2hr ago" are different concepts.                             |
| Issues → real resolution workflow              | **4 statuses + re-verify for blockers + comments**                            | Blockers can't be wished away. If system found the problem, system verifies the fix. Comments capture team discussion that gets lost in Slack.          |
| Add inline RCA education                       | **(?​) icon with popover on each RCA equivalent**                             | CPQ expert ≠ RCA expert. Transforms mapping tool into migration teacher. Proprietary content = competitive moat.                                        |
| Add CSV export throughout                      | **CSV export on Explorer, Assessment, Issues, Runs, Validation**              | Low effort, high value. Enterprise users always screenshot tables into spreadsheets. Give them the data directly.                                       |
| Deep-linkable URLs                             | **Every state in URL. v1 requirement, not v2.**                               | Without deep links, users can't share filtered views in Slack or bookmark common queries. Essential for collaboration.                                  |
| Notification persistence + read state          | **Server-side, read/unread, 50 cap, 30s polling**                             | Defined the model explicitly to prevent implementation ambiguity.                                                                                       |
| Project switcher needs search                  | **Added search field in dropdown**                                            | Consultants with 50+ projects over time need search, not just "recent 5."                                                                               |
| Be honest about mobile                         | **Explicitly: "functional, not optimized" for <768px**                        | Migration operators work at desks. Designing mobile CPQ Explorer is wasted effort.                                                                      |
| Documents → Artifacts & Docs                   | **Renamed, reframed as generated output + uploads**                           | "Artifacts & Docs" feels integral to the product. "Documents" felt like a file cabinet.                                                                 |
| Team: link activity counts + resend invite     | **"12 actions today" → filtered Activity link. [Resend Invite] for pending.** | Natural drill-down path. Enterprise spam filters eat invites.                                                                                           |
| Environment strategy (sandbox → prod)          | **"Switch Target Environment" dropdown on Deployment page**                   | Real migrations go through multiple target environments. Same project, different targets.                                                               |
| Delta summary on re-extraction                 | **Notification: "3 new Price Rules added, 1 modified since last run"**        | Critical for SIs tracking client changes mid-migration. Enables change orders.                                                                          |
| API budget forecasting                         | **Show estimated API calls before extraction/deployment**                     | Users share limits with entire SF org. Informed decisions about when to run operations.                                                                 |
| API reset timer                                | **"Resets in 6h 23m" in sidebar**                                             | SF limits are rolling 24h, not midnight. Knowing when headroom returns is critical for planning.                                                        |
| Show project role, not system role             | **"Owner" instead of "org_owner" in sidebar**                                 | Users think by project function, not org-level permission tier.                                                                                         |
| Expand coexistence check                       | **5 scenarios with specific UI per non-happy path**                           | Product overlap alone needs a real selection UI. One-line check is insufficient.                                                                        |
| Data & privacy section in Settings             | **Retention policy, storage indicator, manual purge, region**                 | Enterprise trust signal. Proactive > reactive when buyers ask about data handling.                                                                      |
| Assessment history → define comparison model   | **v1: snapshot switching with banner. v2: side-by-side diff.**                | Explicit scoping prevents scope creep. Switching is useful and cheap. Diffing is useful and expensive.                                                  |

### Round 2 — Kept Despite Pushback

| Feedback                                             | Decision                                                                  | Rationale                                                                                                                                                                                                                                                          |
| ---------------------------------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| "Remove Documents/Artifacts from sidebar entirely"   | **Kept as "Artifacts & Docs" in PROJECT group**                           | Renamed to earn its place. Auto-generated reports are primary content. SI teams do upload SOWs and sign-offs. The rename addresses the "glorified Drive folder" concern.                                                                                           |
| "Remove QCP code viewer from v1"                     | **Kept syntax highlighting + method badges**                              | QCP analysis is core product value — it's the hardest part of migration assessment. We don't need Monaco editor — lightweight prismjs highlighting + method detection badges are sufficient and high-impact. A [Download .js] link alone doesn't analyze anything. |
| "Force all-or-nothing on partial deployment failure" | **Kept [Retry Failed] + [Rollback]. Deferred [Skip & Continue] to v1.1.** | All-or-nothing is too extreme for large migrations where 1 of 847 products fails. [Retry Failed] after fixing the root cause is a basic requirement. [Skip & Continue] is genuinely complex for relational data and is fairly deferred.                            |
| "Command palette should be in v1"                    | **Deferred to v1.1**                                                      | Genuinely valuable for power users but needs entity indexing. The base product (sidebar nav + URL-based deep links) must exist first. Build after users hit navigation limits.                                                                                     |

### Round 1 Decisions (Carried Forward)

All Round 1 decisions remain in effect. Key ones:

| Decision                                         | Status                                                             |
| ------------------------------------------------ | ------------------------------------------------------------------ |
| Health dashboard over linear stepper             | ✅ Carried forward (now compact strip)                             |
| Stable sidebar with locked states                | ✅ Carried forward                                                 |
| Extraction as action within CPQ Explorer         | ✅ Carried forward (now with first-run ceremony)                   |
| Two tabs on Assessment (stakeholder + operator)  | ✅ Carried forward (now three tabs with user-owned Migration Plan) |
| Dependencies panel over force-directed graph     | ✅ Carried forward                                                 |
| Validation within Deployment (not separate page) | ✅ Carried forward                                                 |
| Runs and Issues as first-class pages             | ✅ Carried forward                                                 |
| Professional completion state (no confetti)      | ✅ Carried forward                                                 |
