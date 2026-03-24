llm1 :

# CPQ → RCA Migration Assessment: Deep Breakdown

## Why It Takes 3 People × 4-8 Weeks

The short answer: **every CPQ org is a snowflake.** Salesforce CPQ implementations are almost never vanilla — they accumulate years of custom logic, tribal knowledge, and undocumented workarounds. The assessment team is essentially reverse-engineering a live production system.

---

## The Core Reasons It's So Labor-Intensive

### 1. Discovery Requires Org Access + Human Interviews (Both)

You can't just scan the org metadata. You need to understand **intent**.

- A price rule might exist but be inactive — is it deprecated or waiting for next quarter?
- A custom Apex trigger might override standard CPQ behavior — was that intentional or a hack?
- An approval process might have 14 steps — do they all still have real approvers?

**The team has to:**

- Interview sales ops, revenue ops, deal desk, admins, developers
- Cross-reference what people _say_ the system does vs. what it _actually_ does
- Document business processes that were never formally documented
- Identify who owns what (often nobody knows)

### 2. CPQ Has an Enormous Configuration Surface Area

Salesforce CPQ alone has **dozens of interrelated configuration layers**:

```
Product Catalog
├── Products (standard, subscription, usage-based, one-time)
├── Product Features
├── Product Options (bundles, nested bundles)
├── Option Constraints
├── Configuration Rules
├── Configuration Attributes
├── Dynamic bundles vs. static bundles
├── Product filtering / search filters
└── Twin fields

Pricing
├── Price Books (standard + custom)
├── Price Rules + Price Actions + Price Conditions
├── Cost & Markup models
├── Block pricing
├── Tiered / Slab pricing
├── Percent-of-total pricing
├── Contracted pricing
├── Partner / Channel pricing
├── Discount Schedules (slab vs. range)
├── Term-based discounting
├── Multi-currency handling
├── Proration rules
└── Custom pricing Apex plugins (calculator plugins)

Quoting
├── Quote Templates (multiple per org)
├── Quote Line Groups
├── Quote Line Editor (QLE) customizations
├── Additional Documents
├── Dynamic sections / conditional content
├── Template-level custom logic
├── Line-level vs. group-level subtotals
└── Multi-language templates

Rules Engine
├── Product Rules (validation, alert, selection, filter)
├── Summary Variables
├── Lookup Queries
├── Error Conditions
├── Product Actions
├── Rule evaluation order / complexity
└── Rules referencing custom fields

Approvals
├── Advanced Approvals (CPQ-native)
├── Approval chains
├── Smart approvals
├── Approval variables / conditions
├── Delegated approvers
├── Email templates for approvals
└── Custom approval logic

Amendments & Renewals
├── Amendment behavior / contracted price handling
├── Renewal models (same product, uplift %, custom)
├── Evergreen vs. end-dated subscriptions
├── Co-termination logic
├── Amendment-specific price rules
└── Renewal opportunity automation

Guided Selling
├── Guided selling processes
├── Input fields
├── Output mappings
└── Process conditions
```

Each of these areas needs to be inventoried, assessed for RCA compatibility, and documented.

### 3. Custom Code Is the Biggest Unknown

Typical mature CPQ orgs have:

| Custom Code Type                      | Typical Volume  | Why It Matters                                  |
| ------------------------------------- | --------------- | ----------------------------------------------- |
| Apex Classes touching CPQ objects     | 30-150+ classes | Must assess: rewrite, refactor, or retire       |
| Apex Triggers on Quote/QuoteLine/etc. | 10-40+ triggers | Many conflict with RCA's different object model |
| CPQ Calculator Plugins (JS/Apex)      | 1-10+ plugins   | RCA has a completely different pricing engine   |
| Flows / Process Builders              | 20-80+          | Need to evaluate which reference CPQ objects    |
| LWC / Aura Components                 | 5-30+           | Custom QLE extensions, embedded components      |
| Validation Rules                      | 20-60+          | May reference CPQ-specific fields               |
| Custom Fields on CPQ Objects          | 50-300+         | Must map to RCA equivalent objects              |
| SOQL in reports/dashboards            | 20-50+          | Will break if objects change                    |

**Someone has to read the code** to understand what it does, whether it's still used, and how to handle it in RCA. This alone can take weeks.

### 4. Integration Mapping Is Critical and Complex

CPQ rarely lives alone:

```
                    ┌──────────────┐
                    │   Salesforce  │
                    │     CPQ       │
                    └──────┬───────┘
                           │
        ┌──────────────────┼──────────────────────┐
        │                  │                       │
   ┌────▼────┐      ┌─────▼──────┐        ┌──────▼──────┐
   │  ERP     │      │  Billing   │        │  E-Sign     │
   │(NetSuite,│      │(SF Billing,│        │(DocuSign,   │
   │ SAP, etc)│      │ Zuora,     │        │ Adobe Sign) │
   └────┬────┘      │ Chargebee) │        └─────────────┘
        │            └─────┬──────┘
   ┌────▼────┐      ┌─────▼──────┐        ┌─────────────┐
   │  Tax     │      │  Revenue   │        │  CLM /      │
   │(Avalara, │      │  Recognition│       │  Contract   │
   │ Vertex)  │      │  Systems   │        │  Mgmt       │
   └─────────┘      └────────────┘        └─────────────┘

   + CRM Analytics, Data Cloud, Custom Portals,
     Partner Communities, CPQ-B2B Commerce, etc.
```

Each integration point needs:

- Current state documentation
- Data flow mapping (what fields, what direction, what frequency)
- Impact assessment (will it break? need rework?)
- RCA equivalent approach

### 5. The Gap Analysis Is Where Real Expertise Is Needed

RCA is **not** a 1:1 replacement for CPQ. It has a different:

- **Object model** (different objects, different relationships)
- **Pricing engine** (declarative pricing procedures vs. calculator plugins)
- **Configuration UX** (different product configurator)
- **Rules framework** (different approach to validation/selection)
- **Amendment/renewal model**
- **Quote document generation** (different templating approach)

The team must go feature-by-feature:

| CPQ Feature                     | RCA Equivalent                    | Gap Status                                    |
| ------------------------------- | --------------------------------- | --------------------------------------------- |
| Product Bundles                 | Product Compositions              | Partial — nested bundles handled differently  |
| Price Rules                     | Pricing Procedures                | Different paradigm — rules must be redesigned |
| Calculator Plugin (Apex)        | No direct equivalent              | Full rewrite into pricing procedures          |
| Quote Templates                 | Document Generation               | Different engine, templates rebuilt           |
| Advanced Approvals              | SF native approvals or OmniStudio | Architecture change                           |
| Twin Fields                     | Not applicable                    | Custom solution needed                        |
| Guided Selling                  | OmniStudio FlexCards/OmniScripts  | Rebuild required                              |
| Contracted Pricing              | Pricing Procedures                | Different implementation                      |
| MDQ (Multi-Dimensional Quoting) | Segmented pricing                 | Partial parity                                |

**This gap analysis is the most valuable part of the document** and requires deep expertise in _both_ CPQ and RCA.

---

## What the 60-100 Page Document Typically Contains

### Document Structure

```
SECTION 1: EXECUTIVE SUMMARY (5-8 pages)
├── Project background & objectives
├── Assessment methodology
├── Key findings summary
├── Critical risks & blockers (top 5-10)
├── High-level recommendation (Big Bang vs. Phased)
├── Effort estimate summary (total hours, cost range, timeline)
└── Go/No-Go considerations

SECTION 2: CURRENT STATE — BUSINESS PROCESS ANALYSIS (10-15 pages)
├── Quote-to-Cash process flow (as-is)
│   ├── Visual process diagrams
│   ├── Stakeholder/role mapping
│   └── Decision points & business rules
├── Sales motion types (new business, renewal, amendment, upsell)
├── Deal desk involvement & approval workflows
├── Pricing governance (who can discount, how much, under what rules)
├── Contract lifecycle (how quotes become orders become contracts)
├── Revenue recognition implications
└── Pain points & known issues with current implementation

SECTION 3: CURRENT STATE — TECHNICAL INVENTORY (15-25 pages)
├── 3.1 Product Catalog Assessment
│   ├── Total products (active/inactive)
│   ├── Product types breakdown (subscription, one-time, usage)
│   ├── Bundle architecture (depth, complexity, option counts)
│   ├── Product features & option constraints
│   ├── Configuration attributes
│   └── Catalog health issues (duplicates, orphans, misconfigurations)
│
├── 3.2 Pricing Assessment
│   ├── Price books inventory
│   ├── Price rules inventory (with complexity rating per rule)
│   ├── Discount schedules
│   ├── Contracted pricing usage
│   ├── Multi-currency setup
│   ├── Custom pricing logic (calculator plugins, Apex)
│   └── Pricing edge cases & special handling
│
├── 3.3 Quote Configuration Assessment
│   ├── Quote templates inventory
│   ├── Quote template complexity (sections, conditional logic)
│   ├── QLE customizations
│   ├── Guided selling flows
│   └── Quote document generation process
│
├── 3.4 Rules Engine Assessment
│   ├── Product rules (count, type, complexity)
│   ├── Validation rules on CPQ objects
│   ├── Summary variables
│   ├── Lookup queries
│   ├── Rule interdependencies
│   └── Rule performance issues
│
├── 3.5 Amendments & Renewals Assessment
│   ├── Amendment process & behavior
│   ├── Renewal process & automation
│   ├── Co-termination handling
│   ├── Subscription management complexity
│   └── Edge cases & known issues
│
├── 3.6 Approvals Assessment
│   ├── Approval chains & routing logic
│   ├── Approval variables
│   ├── Smart approval configuration
│   ├── Custom approval components
│   └── Approval reporting / audit trail
│
├── 3.7 Custom Code Inventory
│   ├── Apex classes (with CPQ dependency mapping)
│   ├── Apex triggers (with object mapping)
│   ├── LWC / Aura components
│   ├── Calculator plugins
│   ├── Flows & Process Builders
│   ├── Custom objects related to CPQ
│   ├── Custom fields on standard/CPQ objects
│   └── Code quality & technical debt assessment
│
├── 3.8 Integration Assessment
│   ├── Integration inventory (system, direction, frequency)
│   ├── Integration architecture diagrams
│   ├── Data flow mappings
│   ├── API usage & limits
│   ├── Middleware / iPaaS tools involved
│   └── Integration-specific risks
│
└── 3.9 Data Assessment
    ├── Data volumes (quotes, quote lines, subscriptions, contracts)
    ├── Historical data migration requirements
    ├── Data quality issues
    ├── Data model diagram (current ERD)
    └── Data transformation requirements

SECTION 4: RCA TARGET STATE ARCHITECTURE (8-12 pages)
├── RCA object model overview
├── Proposed product catalog design in RCA
├── Proposed pricing procedures design
├── Proposed configuration approach
├── Proposed document generation approach
├── Proposed approval architecture
├── Target state process flows (to-be)
└── Architecture decision records (ADRs) for key choices

SECTION 5: GAP ANALYSIS (8-12 pages)
├── Feature-by-feature gap matrix
│   ├── Full parity features
│   ├── Partial parity (with workaround details)
│   ├── No parity (requires custom development)
│   └── Deprecated (features to retire)
├── Functional gaps with business impact rating
├── Technical gaps with complexity rating
├── RCA roadmap items (features coming in future releases)
└── Gap resolution recommendations

SECTION 6: RISK ASSESSMENT (5-8 pages)
├── Technical risks
│   ├── RCA platform maturity risks
│   ├── Feature gap risks
│   ├── Performance risks
│   ├── Data migration risks
│   └── Integration risks
├── Business risks
│   ├── User adoption risk
│   ├── Revenue impact during transition
│   ├── Parallel running complexity
│   └── Training & change management
├── Timeline risks
├── Risk mitigation strategies
└── Risk heat map (likelihood × impact)

SECTION 7: MIGRATION STRATEGY & RECOMMENDATIONS (5-8 pages)
├── Recommended approach (Big Bang vs. Phased vs. Parallel)
├── Phase breakdown (if phased)
│   ├── Phase 1: Foundation (catalog, basic pricing)
│   ├── Phase 2: Advanced pricing & rules
│   ├── Phase 3: Amendments, renewals, integrations
│   └── Phase 4: Cutover & decommission
├── Data migration strategy
├── Testing strategy
├── Rollback plan
├── Change management recommendations
└── Training plan outline

SECTION 8: EFFORT ESTIMATION & TIMELINE (5-8 pages)
├── Work breakdown structure (WBS)
├── Effort by phase & workstream
│   ├── Product catalog migration: X hours
│   ├── Pricing procedures: X hours
│   ├── Custom development: X hours
│   ├── Integration rework: X hours
│   ├── Data migration: X hours
│   ├── Testing: X hours
│   ├── Training & change mgmt: X hours
│   └── Project management: X hours
├── Team composition & roles needed
├── Timeline (Gantt chart or milestone view)
├── Cost estimate (range: optimistic / likely / pessimistic)
└── Assumptions & constraints

APPENDICES (10-20 pages)
├── A: Complete product catalog inventory (table)
├── B: Complete price rules inventory (table)
├── C: Complete product rules inventory (table)
├── D: Complete custom code inventory (table)
├── E: Complete integration inventory (table)
├── F: Field mapping: CPQ → RCA objects
├── G: Glossary
├── H: Interview notes summary
└── I: Screenshots of key configurations
```

---

## Why It's 60-100 Pages

| Content Type       | Why It's Bulky                                                                               |
| ------------------ | -------------------------------------------------------------------------------------------- |
| Inventory tables   | A single org can have 200+ price rules, 500+ products, 100+ custom fields. Each needs a row. |
| Process diagrams   | Visual flows for every sales motion (new, renewal, amendment, upsell) × every business unit  |
| Gap matrices       | Feature-by-feature comparison — CPQ has 100+ configurable features                           |
| Code inventory     | Each Apex class needs: name, purpose, CPQ dependency, migration action                       |
| Risk documentation | Each risk needs: description, likelihood, impact, mitigation, owner                          |
| Screenshots        | Current config evidence — protects the consultant if the client says "you missed this"       |

**The real insight:** probably **15-20 pages are actual analysis and recommendations.** The remaining 40-80 pages are **inventory evidence and appendices** — detailed tables that prove the consultants actually looked at everything and didn't miss anything. It's as much a CYA document as an analysis document.

---

## What This Means for Your Product

The assessment work breaks down into:

```
AUTOMATABLE (via metadata API + tooling API + code scanning)
├── Product catalog inventory & statistics
├── Price rules / product rules inventory
├── Custom code inventory & dependency analysis
├── Custom fields / objects / validation rules inventory
├── Flow / Process Builder inventory
├── Integration touchpoint detection
├── Data volume & health metrics
├── Object relationship mapping (ERD generation)
├── CPQ → RCA gap matrix (known, static mapping)
└── Complexity scoring (rules-based)

SEMI-AUTOMATABLE (scan + human refinement)
├── Code purpose classification (AI/LLM can help)
├── Rule complexity scoring
├── Risk identification (pattern-based)
├── Effort estimation (model-based with adjustment)
└── Migration action recommendation per item

NOT AUTOMATABLE (requires human judgment)
├── Business process understanding & documentation
├── Intent behind configurations
├── Stakeholder interviews
├── Political / organizational risks
├── Strategic recommendations (phased vs big bang)
├── Business impact assessment
└── Change management planning
```

**Your product could reduce the 4-8 weeks to 1-2 weeks** by automating the entire "inventory + scanning + gap analysis" layer — which is probably 60-70% of the labor. The consultants then spend their time on the human-judgment work that actually requires expertise.

Want me to go deeper on the product architecture — how you'd actually scan an org, structure the data model, and build the UI for this?

---

llm 2 :

This is an excellent and highly lucrative problem to solve. Migrating from Classic Salesforce CPQ (formerly SteelBrick) to the new Salesforce Revenue Cloud (often referred to as Revenue Lifecycle Management or RLM) is a massive paradigm shift.

To build a product that automates this, you first need to understand why System Integrators (SIs) like AllCloud, Slalom, or Deloitte take 4-8 weeks and 100 pages to do it manually.

Here is the breakdown of why the process is so intensive, and what exactly is inside that massive PDF.

---

### Part 1: Why is the manual audit so intensive and time-consuming?

A 3-person team taking 4-8 weeks isn't just padding their billable hours; Salesforce CPQ is notoriously difficult to reverse-engineer. Here is why:

**1. "Data as Metadata" Architecture**
In standard Salesforce, automation (like Flows or Apex) is stored as _metadata_. You can easily pull a dependency report. In Salesforce CPQ, the business logic (Price Rules, Product Rules, Summary Variables, Discount Schedules) is stored as **data records** (e.g., `SBQQ__PriceRule__c`). Standard Salesforce audit tools cannot map relationships between data records. SIs have to write custom SOQL queries, export to Excel, and manually map out which rule affects which product.

**2. The QCP (Quote Calculator Plugin) Black Box**
Almost every enterprise CPQ org uses the QCP—a massive block of custom JavaScript used to bypass CPQ's standard limits. Analyzing this requires a senior developer to manually read thousands of lines of JavaScript to figure out _what_ it's doing and _why_, so they can figure out how to rebuild it in the new Revenue Cloud pricing engine.

**3. Years of Tech Debt and "Ghost Rules"**
CPQ implementations evolve over years. SIs find hundreds of inactive price rules, overlapping discount schedules, and temporary "quick fixes" that were never removed. SIs spend weeks untangling this to figure out what is _actually_ driving the current pricing logic, rather than just documenting everything blindly.

**4. The Business Context Gap (The Human Element)**
A configuration rule might say: `If Product A = true, add a 15% discount to Product B`. But _why_? Is that still a valid sales strategy? SIs spend 50% of those 4-8 weeks in workshops with Sales, Finance, Legal, and RevOps asking, _"Do you still sell this way?"_

**5. Architecture Mapping (CPQ vs. Revenue Cloud/RLM)**
The new Salesforce Revenue Cloud is built on entirely different architecture (OmniStudio, Product Catalog Management, Context Rules, Pricing Procedures). SIs have to manually translate the old CPQ logic into the new RLM concepts. There is no 1-to-1 mapping.

---

### Part 2: What is actually in that 60-100 page PDF?

The document is massive because it serves three purposes: **A technical blueprint, a risk mitigation document, and a sales pitch for the actual migration project.**

Here is the typical structure and what it includes:

#### 1. Executive Summary (5-10 pages)

- High-level assessment of the current state.
- Major risks identified (e.g., "Your QCP is 5,000 lines of code and will be hard to migrate").
- T-shirt sizing for the migration (Cost and Timeline).

#### 2. Current State Architecture / As-Is Analysis (25-40 pages)

_This is the most tedious part to write manually, and the easiest for your tool to automate._

- **Product Catalog & Bundling:** How many products, bundles, features, and options exist? How deep do the nested bundles go?
- **Pricing Architecture:** Detailed documentation of Price Books, Discount Schedules, Block Pricing, Slab Pricing, and Multi-Dimensional Quoting (MDQ).
- **Automation & Rules:** A matrix of Price Rules, Product Rules (Validation, Alert, Selection, Filter), and Summary Variables.
- **Custom Code:** Detailed analysis of Apex triggers on the Quote/Quote Line, and the dreaded QCP (JavaScript).
- **Approvals & DocGen:** How Advanced Approvals are configured, and what Quote Templates (or third-party tools like Conga) are used.

#### 3. Technical Debt & Anomaly Report (10-15 pages)

- Identification of unused fields, inactive rules, and unassigned products.
- Hardcoded IDs inside formulas or code (a massive migration risk).
- Performance bottlenecks (why it takes 30 seconds for a quote to calculate).

#### 4. Future State Architecture / To-Be Mapping (15-20 pages)

_This is where the SI justifies their expertise._

- How legacy CPQ Product Bundles will map to the new **Product Catalog Management (PCM)**.
- How CPQ Price Rules and QCP will be replaced by **Pricing Procedures and Context Rules**.
- How Quote Templates will transition to **OmniStudio Document Generation**.

#### 5. Migration Strategy & Roadmap (10-15 pages)

- **Data Migration Plan:** Moving CPQ relational data (which is a nightmare) to the new RLM data model.
- **Phasing:** Can we move direct sales first, and partner sales later?
- **Testing Strategy:** How to ensure a quote in legacy CPQ matches a quote in the new Revenue Cloud exactly to the penny.

---

### Part 3: How to translate this into a Product (GUI)

If you want to build a tool that replaces or accelerates this 8-week process, your UI needs to act as an automated "X-Ray Machine" for Salesforce CPQ.

Here is how you structure the core features of your product:

**1. Automated Dependency Visualizer (The "Killer Feature")**
Instead of static text, build a node-based UI map. If a user clicks on `Product X`, they visually see every `Price Rule`, `Product Rule`, and `Summary Variable` connected to it. _SIs would pay thousands of dollars just to avoid mapping this manually in Visio/Lucidchart._

**2. Tech Debt Dashboard**
A UI tab that instantly calculates a "System Health Score." It should automatically flag:

- Inactive rules.
- Rules that haven't been triggered in 12 months.
- Hardcoded IDs in formulas.
- The size/complexity of the QCP.

**3. Auto-Mapping Engine (CPQ to RLM)**
Build a translation layer. For example, the UI shows a legacy CPQ "Discount Schedule" on the left, and automatically suggests the corresponding "Pricing Procedure / Context Rule" architecture for Revenue Cloud on the right.

**4. The PDF Generator**
Once the SI or customer reviews the data in your beautiful UI, they click "Generate Audit." Your tool injects this real-time data into a branded, 60-page PDF template that includes all the required tables, charts, and executive summaries, turning an 8-week job into a 3-day job.

**Summary for your product vision:**
Do not try to automate the _human_ element (asking the business _why_ they do things). Automate the _archaeology_. Let your tool do the digging, mapping, and translation in minutes so the SI can spend their 4 weeks purely on high-value business consulting and strategy.

---

llm 1)
To replace a static, 100-page PDF with a "clever GUI," the foundational UX design principle you must use is **Progressive Disclosure**.

This means showing the executive summary first, but allowing the user to click, drill down, and explore the deepest, most complex corner cases without overwhelming them initially. Unlike a PDF, your GUI shouldn't just be a report; it should be an **interactive migration workspace**.

Here is exactly how you should architect the UI and functionality to deliver a superior experience.

---

### 1. The Global Layout & Navigation

- **Left Sidebar (The Chapters):** Navigation tied to the core pillars of CPQ (Executive Summary, Product Catalog, Pricing Architecture, Custom Code/QCP, Approvals & DocGen, Tech Debt).
- **Top Bar (Global Filters):** Allow the user to filter the entire assessment by specific Business Units, Product Families, or "Active vs. Inactive" rules.
- **Main Content Area:** The dynamic data visualization space.
- **Floating Right Panel / Bottom Widget:** The AI Chat Assistant (always accessible).

---

### 2. The Core Screens & Functionality

#### A. The "Executive Summary" Dashboard (The Landing Page)

_What replaces the first 10 pages of the PDF._

- **The "Migration Complexity Score":** A massive, visual gauge (e.g., 78/100). Hovering over it explains _why_ the score is high (e.g., "Driven by heavy custom JavaScript and 400+ Price Rules").
- **T-Shirt Sizing & Timeline:** A high-level visual Gantt chart showing the estimated effort to migrate.
- **The "Top 5 Migration Risks" Cards:** Big, clickable red/yellow alert cards. Example: _Risk 1: 5,000 lines of QCP Code_. Clicking the card instantly teleports the user to the Custom Code section of the app.

#### B. The "Architecture X-Ray" (Visualizing the Current State)

_What replaces the 40 pages of boring data tables._

- **The Interactive Node Graph:** Instead of reading lists of rules, the user sees a visual mind-map.
  - _Functionality:_ The user clicks on a "Hardware Bundle" node. The UI smoothly animates and draws lines connecting that bundle to 5 Price Rules, 2 Discount Schedules, and 3 Product Rules.
- **The "Plain English" Translator Side-Panel:** When a user clicks on a specific `Price Rule` node, a side panel slides out. Instead of showing ugly Salesforce formulas, your UI translates it: _"If the Customer is in EMEA, apply a 15% discount to all Software."_ (Underneath, there's a toggle to "View Raw SOQL/Formula" for the developers).

#### C. The "Translation Matrix" (CPQ -> RLM To-Be Mapping)

_What replaces the 20 pages of future-state architecture._

- **Split-Screen View:** Left side is "Legacy CPQ", right side is "New RLM".
- **Confidence Badges:** Next to each CPQ feature, display a visual badge:
  - `Green (Native Fit)`: 1-to-1 mapping exists in RLM.
  - `Yellow (Refactor Required)`: RLM can do this, but the logic must be rebuilt differently (e.g., CPQ Price Rule -> RLM Pricing Procedure).
  - `Red (Gap / Custom)`: RLM currently doesn't support this natively; requires OmniStudio dev.
- **Interactive Triage:** Let the user check boxes next to rules and tag them: `Migrate`, `Deprecate`, or `Needs Review`. (This turns the assessment into a working tool, not just a report).

#### D. The "Tech Debt & Anomalies" Inbox

_What replaces the 15 pages of warnings._

- **"Inbox Zero" Style UI:** Present tech debt like an email inbox or a Jira board.
- **Smart Categorization Tabs:** `Ghost Rules` (inactive for 12 months), `Hardcoded IDs` (massive risk), `Circular Dependencies`.
- **One-Click Action:** The user can review a ghost rule and click a button to say "Exclude from Migration Scope."

---

### 3. The "Smart Copilot" (Chat UI)

This is where the product goes from "good" to "mind-blowing." A 100-page PDF is hard to search; an AI chat UI makes exploring the data conversational.

- **Context-Aware Chat:** If the user is looking at the "Pricing Architecture" screen and opens the chat, the AI should say: _"I see you are looking at Pricing. You have 150 Price rules, but 40 are inactive. What would you like to know?"_
- **Deep-Dive Prompting:** The user can type: _"Show me all the rules that affect the 'Premium Server' product."_ The chat doesn't just reply with text; it **generates UI components** directly in the chat window (e.g., a mini interactive table of those rules).
- **"Explain This" Button:** Anywhere in the GUI where there is a complex custom script (like the QCP JavaScript), the user clicks an "Explain" sparkle icon. The chat panel opens and provides a line-by-line summary of what the code is doing in business terms.
- **Scenario Testing via Chat:** User asks: _"If we migrate direct sales first, which rules can we leave behind?"_ The AI queries the assessment data and provides a specific list.

---

### 4. The Export & Share Layer

- **The "Share a View" Feature:** An executive doesn't want to log in and click around. Allow the SI/Consultant to configure a specific view (e.g., the Tech Debt board), click "Generate Link," and send a secure web link that opens exactly to that pre-filtered view.
- **The "Dynamic PDF Generator":** Even though the GUI is better, people still want PDFs for their archives. Provide a button that takes all the data, ignores the "Excluded/Deprecated" items the user tagged, and beautifuly formats a white-labeled 40-page PDF on demand.

### Why this UX wins:

A PDF tells you: _"You have 400 price rules. This is highly complex."_
Your GUI allows a user to say: _"Show me those rules. Oh, 200 are inactive? Let's tag them for deletion. Show me how the remaining 200 map to RLM. Okay, mapping looks good. Chatbot, summarize the remaining risks."_

You transition the assessment from a **static diagnostic** to an **interactive migration roadmap**.

---

llm2)

# CPQ → RCA Migration Assessment: Product UI Design

## Core Design Philosophy

```
THE PDF PROBLEM:          THE GUI SOLUTION:

Linear                    Non-linear exploration
100 pages = overwhelming  Progressive disclosure
Ctrl+F is the only UX     Faceted navigation + search + chat
Static tables             Interactive, filterable, sortable
One reading path           Multiple entry points by role
"Read everything first"   "See what matters, drill when needed"
```

---

## Information Architecture: The Layer Cake

```
┌─────────────────────────────────────────────────────────┐
│  LAYER 0: Executive Command Center (single screen)      │
│  "Give me the answer in 30 seconds"                     │
├─────────────────────────────────────────────────────────┤
│  LAYER 1: Domain Dashboards (8 domains)                 │
│  "Show me everything about pricing"                     │
├─────────────────────────────────────────────────────────┤
│  LAYER 2: Item-Level Inventory & Detail                 │
│  "Show me this specific price rule"                     │
├─────────────────────────────────────────────────────────┤
│  LAYER 3: Evidence & Raw Data                           │
│  "Show me the actual code / config / screenshot"        │
├─────────────────────────────────────────────────────────┤
│  HORIZONTAL: Chat AI │ Search │ Bookmarks │ Export      │
│  Available on every screen                              │
└─────────────────────────────────────────────────────────┘
```

---

## Global Shell / Layout

```
┌──────────────────────────────────────────────────────────────────┐
│  ┌─────┐  Migration Assessment: Acme Corp        🔍  🔔  👤  ⚙️ │
│  │LOGO │  Last scanned: Jan 15, 2025                             │
├──┴─────┴────┬────────────────────────────────────────────┬───────┤
│              │                                            │       │
│  SIDEBAR     │         MAIN CONTENT AREA                  │ CHAT  │
│  NAV         │                                            │ PANEL │
│              │                                            │       │
│  📊 Overview │                                            │  💬   │
│              │                                            │       │
│  📦 Products │    (changes based on navigation)           │ (col- │
│  💰 Pricing  │                                            │ laps- │
│  📋 Rules    │                                            │  ible)│
│  ⚙️ Code     │                                            │       │
│  🔗 Integr.  │                                            │       │
│  🔄 Amend.   │                                            │       │
│  ✅ Approvals│                                            │       │
│  📄 Docs     │                                            │       │
│  💾 Data     │                                            │       │
│              │                                            │       │
│  ──────────  │                                            │       │
│  🎯 Gaps     │                                            │       │
│  ⚠️ Risks    │                                            │       │
│  📅 Plan     │                                            │       │
│  📊 Effort   │                                            │       │
│              │                                            │       │
│  ──────────  │                                            │       │
│  📥 Export   │                                            │       │
│  ⚙️ Settings │                                            │       │
│              │                                            │       │
└──────────────┴────────────────────────────────────────────┴───────┘
```

**Key shell behaviors:**

- Sidebar is collapsible to icons only
- Chat panel slides in/out from right edge
- Breadcrumb trail always visible below header
- Global search (⌘K) opens command palette overlay
- Every screen has a "Export this view" option

---

## LAYER 0: Executive Command Center

This is the landing page. A CEO, VP of Sales Ops, or CTO should understand the situation in under 60 seconds.

```
┌─────────────────────────────────────────────────────────────────┐
│  MIGRATION READINESS                                             │
│                                                                   │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐        │
│  │          │  │          │  │          │  │          │        │
│  │   6.2    │  │   HIGH   │  │  2,400   │  │  9-14    │        │
│  │  /10     │  │   ●●●○   │  │  hours   │  │  months  │        │
│  │          │  │          │  │  est.    │  │  est.    │        │
│  │Migration │  │Overall   │  │Total     │  │Timeline  │        │
│  │Readiness │  │Complexity│  │Effort    │  │Range     │        │
│  │Score     │  │Rating    │  │Estimate  │  │          │        │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘        │
│                                                                   │
├─────────────────────────────────────────────────────────────────┤
│  COMPLEXITY HEATMAP BY DOMAIN                                    │
│                                                                   │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                                                         │    │
│  │  Products    ██████░░░░  6/10   187 items  →            │    │
│  │  Pricing     █████████░  9/10   243 rules  →   ⚠️ HIGH  │    │
│  │  Rules       ███████░░░  7/10    89 rules  →            │    │
│  │  Custom Code ████████░░  8/10   112 items  →   ⚠️ HIGH  │    │
│  │  Integrations██████░░░░  6/10    11 sys    →            │    │
│  │  Amend/Renew ████████░░  8/10    34 flows  →   ⚠️ HIGH  │    │
│  │  Approvals   █████░░░░░  5/10    18 chains →            │    │
│  │  Documents   ████░░░░░░  4/10     7 templ  →            │    │
│  │  Data        ██████░░░░  6/10   2.1M recs  →            │    │
│  │                                                         │    │
│  └─────────────────────────────────────────────────────────┘    │
│  (each row is clickable → navigates to domain dashboard)        │
│                                                                   │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌─────────────────────────┐  ┌─────────────────────────────┐  │
│  │  TOP RISKS              │  │  TOP BLOCKERS               │  │
│  │                         │  │                               │  │
│  │  🔴 Calculator plugins  │  │  🚫 MDQ has no RCA parity   │  │
│  │     require full        │  │     for 23 products          │  │
│  │     rewrite (3 plugins, │  │                               │  │
│  │     ~4200 lines Apex)   │  │  🚫 Custom QLE component     │  │
│  │                         │  │     "DealOptimizer" has no   │  │
│  │  🔴 12 integrations     │  │     RCA equivalent           │  │
│  │     reference CPQ       │  │                               │  │
│  │     object model        │  │  🚫 Nested bundles (3+       │  │
│  │     directly            │  │     levels deep) used in     │  │
│  │                         │  │     Enterprise product line  │  │
│  │  🟡 34 Apex triggers    │  │                               │  │
│  │     on Quote/QuoteLine  │  │                               │  │
│  │                         │  │                               │  │
│  │  🟡 Amendment logic     │  │                               │  │
│  │     heavily customized  │  │                               │  │
│  │                         │  │                               │  │
│  │  [View all 23 risks →]  │  │  [View all 8 blockers →]    │  │
│  └─────────────────────────┘  └─────────────────────────────┘  │
│                                                                   │
├─────────────────────────────────────────────────────────────────┤
│  RECOMMENDED APPROACH                                            │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  Phased Migration (3 phases)                            │    │
│  │                                                         │    │
│  │  Phase 1         Phase 2            Phase 3             │    │
│  │  Foundation      Advanced Logic     Cutover             │    │
│  │  ───────────     ──────────────     ──────────          │    │
│  │  Catalog +       Pricing rules +    Amendments +        │    │
│  │  Basic pricing   Code rewrite +     Renewals +          │    │
│  │  + Doc Gen       Integrations       Data migration +    │    │
│  │                                     Decommission        │    │
│  │  ~800 hrs        ~1,100 hrs         ~500 hrs            │    │
│  │  3-4 months      4-5 months         2-3 months          │    │
│  │                                                         │    │
│  │  [View detailed plan →]                                 │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

---

## LAYER 1: Domain Dashboards (Example: Pricing)

When a user clicks any domain from the heatmap or sidebar, they get a domain-specific dashboard.

```
┌─────────────────────────────────────────────────────────────────┐
│  📊 Overview > 💰 Pricing                                        │
│                                                                   │
│  PRICING COMPLEXITY SCORE: 9/10 ██████████████████░░ HIGH        │
│                                                                   │
├─────────────┬──────────────┬──────────────┬─────────────────────┤
│  243        │  47          │  12          │  3                   │
│  Total      │  High        │  With Custom │  Calculator         │
│  Price      │  Complexity  │  Apex        │  Plugins            │
│  Rules      │  Rules       │  References  │  (4,200 LOC)        │
├─────────────┴──────────────┴──────────────┴─────────────────────┤
│                                                                   │
│  RCA MIGRATION STATUS                                            │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                                                         │    │
│  │  ████████████████████████████████░░░░░░░░░░░░░░░░░░░░  │    │
│  │  ██ Direct Map (34%) ██ Redesign (41%) ░░ Gap (25%)    │    │
│  │                                                         │    │
│  │  82 rules → Pricing Procedures (straightforward)        │    │
│  │  100 rules → Pricing Procedures (needs redesign)        │    │
│  │  61 rules → No RCA equivalent (custom dev needed)       │    │
│  │                                                         │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  TABS:                                                    │   │
│  │  [ Price Rules ][ Discount Schedules ][ Price Books ]     │   │
│  │  [ Calculator Plugins ][ Contracted Pricing ]             │   │
│  │  [ Multi-Currency ][ Custom Pricing Logic ]               │   │
│  ├──────────────────────────────────────────────────────────┤   │
│  │                                                           │   │
│  │  PRICE RULES INVENTORY                                    │   │
│  │                                                           │   │
│  │  Filter: [Complexity ▼] [Migration Status ▼] [Active ▼]  │   │
│  │          [Search rules...                    ] 🔍         │   │
│  │                                                           │   │
│  │  ┌─────────────────────────────────────────────────────┐ │   │
│  │  │ Name          │Complex│ Status    │Actions│Apex?│ → │ │   │
│  │  ├───────────────┼───────┼───────────┼───────┼─────┼───┤ │   │
│  │  │ Enterprise    │ 🔴 9  │ ⚠️ Gap    │  8    │ Yes │ → │ │   │
│  │  │ Volume Disc.  │       │           │       │     │   │ │   │
│  │  ├───────────────┼───────┼───────────┼───────┼─────┼───┤ │   │
│  │  │ Partner Tier  │ 🔴 8  │ 🔄 Redes. │  5    │ Yes │ → │ │   │
│  │  │ Pricing       │       │           │       │     │   │ │   │
│  │  ├───────────────┼───────┼───────────┼───────┼─────┼───┤ │   │
│  │  │ Geo-based     │ 🟡 6  │ 🔄 Redes. │  3    │ No  │ → │ │   │
│  │  │ Markup        │       │           │       │     │   │ │   │
│  │  ├───────────────┼───────┼───────────┼───────┼─────┼───┤ │   │
│  │  │ Standard      │ 🟢 2  │ ✅ Direct │  1    │ No  │ → │ │   │
│  │  │ List Price    │       │           │       │     │   │ │   │
│  │  ├───────────────┼───────┼───────────┼───────┼─────┼───┤ │   │
│  │  │ ... 239 more rows (paginated / virtual scroll)    │   │ │   │
│  │  └─────────────────────────────────────────────────────┘ │   │
│  │                                                           │   │
│  │  INSIGHTS PANEL (below or sidebar)                        │   │
│  │  ┌─────────────────────────────────────────────────────┐ │   │
│  │  │ 💡 47 rules have complexity ≥ 7. These drive 78%   │ │   │
│  │  │    of the estimated pricing migration effort.       │ │   │
│  │  │                                                     │ │   │
│  │  │ 💡 12 rules reference Apex classes. These cannot    │ │   │
│  │  │    be auto-mapped and require manual redesign.      │ │   │
│  │  │                                                     │ │   │
│  │  │ 💡 31 rules are inactive. Consider retiring them    │ │   │
│  │  │    to reduce migration scope. [View inactive →]     │ │   │
│  │  └─────────────────────────────────────────────────────┘ │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

### All 8 Domain Dashboards Follow the Same Pattern:

```
EVERY DOMAIN DASHBOARD HAS:
├── Complexity score + rating (top banner)
├── Key metrics (4 stat cards)
├── RCA migration status bar (direct / redesign / gap breakdown)
├── Tabbed sub-categories
├── Filterable, sortable inventory table
├── AI-generated insights panel
└── Each row is clickable → opens Layer 2 detail
```

**Domain list:**

| Domain                   | Key Tabs                                                                               |
| ------------------------ | -------------------------------------------------------------------------------------- |
| 📦 Products              | Products, Bundles, Options, Features, Config Attributes, Filters                       |
| 💰 Pricing               | Price Rules, Discount Schedules, Price Books, Calc Plugins, Contracted, Multi-Currency |
| 📋 Rules                 | Product Rules, Validation Rules, Summary Variables, Lookup Queries                     |
| ⚙️ Custom Code           | Apex Classes, Triggers, Flows, LWC/Aura, Process Builders                              |
| 🔗 Integrations          | Systems, Data Flows, APIs, Middleware                                                  |
| 🔄 Amendments & Renewals | Amendment Processes, Renewal Models, Co-term, Subscriptions                            |
| ✅ Approvals             | Chains, Variables, Smart Approvals, Custom Components                                  |
| 📄 Documents             | Quote Templates, Sections, Conditional Logic, Output Formats                           |
| 💾 Data                  | Volumes, Quality, Migration Scope, Historical Retention                                |

---

## LAYER 2: Item-Level Detail (Example: A Single Price Rule)

When a user clicks a row in any inventory table, a detail panel slides in or a detail page opens.

```
┌─────────────────────────────────────────────────────────────────┐
│  📊 Overview > 💰 Pricing > Price Rules > Enterprise Volume Disc │
│                                                                   │
│  ┌──────────────────────────────────┬──────────────────────────┐ │
│  │  RULE DETAILS                    │  MIGRATION ASSESSMENT    │ │
│  │                                  │                          │ │
│  │  Name: Enterprise Volume Disc.   │  Status: ⚠️ GAP          │ │
│  │  API Name: Ent_Vol_Disc_PR       │                          │ │
│  │  Active: ✅ Yes                  │  RCA Approach:           │ │
│  │  Evaluation Event: Before Calc.  │  No direct equivalent.   │ │
│  │  Type: Price Rule                │  Requires custom pricing │ │
│  │  Conditions: 5                   │  procedure + Apex        │ │
│  │  Actions: 8                      │  extension.              │ │
│  │  Scope: Quote Line              │                          │ │
│  │  Created: 2021-03-14            │  Effort: ~40 hours       │ │
│  │  Last Modified: 2024-11-22      │  Risk: Medium            │ │
│  │  Modified By: Sarah Chen        │                          │ │
│  │                                  │  Depends On:             │ │
│  │  Complexity Score: 🔴 9/10       │  • SummaryVar_TotalQty   │ │
│  │                                  │  • LookupQuery_TierTable │ │
│  │  WHY HIGH COMPLEXITY:           │  • ApexClass:            │ │
│  │  • References Apex class        │    VolumeDiscountCalc    │ │
│  │  • Uses 2 summary variables    │  • 23 products reference │ │
│  │  • Nested conditions (3 levels) │    this rule             │ │
│  │  • Cross-object field refs      │                          │ │
│  │                                  │  [View RCA Design        │ │
│  │                                  │   Recommendation →]      │ │
│  ├──────────────────────────────────┴──────────────────────────┤ │
│  │                                                              │ │
│  │  TABS: [Conditions] [Actions] [Dependencies] [Impact]       │ │
│  │         [Code References] [RCA Mapping]                     │ │
│  │                                                              │ │
│  │  ┌── CONDITIONS ──────────────────────────────────────────┐ │ │
│  │  │                                                        │ │ │
│  │  │  1. SBQQ__Quote__r.SBQQ__Account__r.Type              │ │ │
│  │  │     = "Enterprise"                                     │ │ │
│  │  │                                                        │ │ │
│  │  │  2. SBQQ__Quote__r.SBQQ__SubscriptionTerm__c          │ │ │
│  │  │     >= 12                                              │ │ │
│  │  │                                                        │ │ │
│  │  │  3. Custom_Total_Seats__c >= 100                       │ │ │
│  │  │     (references Summary Variable: SummaryVar_TotalQty) │ │ │
│  │  │                                                        │ │ │
│  │  │  4. SBQQ__ProductCode__c IN ("ENT-100", "ENT-200",    │ │ │
│  │  │     "ENT-300", "ENT-400")                              │ │ │
│  │  │                                                        │ │ │
│  │  │  5. NOT(Is_Partner_Deal__c = true)                     │ │ │
│  │  │                                                        │ │ │
│  │  │  RCA MAPPING:                                          │ │ │
│  │  │  ┌────────────────────────────────────────────────┐   │ │ │
│  │  │  │ Condition 1 → ✅ Maps to Account attribute      │   │ │ │
│  │  │  │ Condition 2 → ✅ Maps to pricing variable       │   │ │ │
│  │  │  │ Condition 3 → ⚠️ Summary vars need redesign    │   │ │ │
│  │  │  │ Condition 4 → ✅ Maps to product filter         │   │ │ │
│  │  │  │ Condition 5 → ✅ Maps to pricing attribute      │   │ │ │
│  │  │  └────────────────────────────────────────────────┘   │ │ │
│  │  └────────────────────────────────────────────────────────┘ │ │
│  │                                                              │ │
│  │  ┌── DEPENDENCY GRAPH (visual) ───────────────────────────┐ │ │
│  │  │                                                        │ │ │
│  │  │          ┌─────────────────┐                           │ │ │
│  │  │          │ Enterprise Vol  │                           │ │ │
│  │  │          │ Discount Rule   │                           │ │ │
│  │  │          └────────┬────────┘                           │ │ │
│  │  │       ┌───────────┼───────────┐                       │ │ │
│  │  │       ▼           ▼           ▼                       │ │ │
│  │  │  ┌─────────┐ ┌─────────┐ ┌──────────┐               │ │ │
│  │  │  │SummVar  │ │Lookup   │ │Apex:     │               │ │ │
│  │  │  │TotalQty │ │TierTable│ │VolDisCalc│               │ │ │
│  │  │  └─────────┘ └─────────┘ └──────────┘               │ │ │
│  │  │       │                         │                     │ │ │
│  │  │       ▼                         ▼                     │ │ │
│  │  │  ┌─────────┐            ┌──────────────┐             │ │ │
│  │  │  │23 Prods │            │Trigger:      │             │ │ │
│  │  │  │affected │            │QuoteLineCalc │             │ │ │
│  │  │  └─────────┘            └──────────────┘             │ │ │
│  │  │                                                        │ │ │
│  │  │  (interactive: click any node to navigate to it)       │ │ │
│  │  └────────────────────────────────────────────────────────┘ │ │
│  │                                                              │ │
│  └──────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

---

## Cross-Cutting Views (Not Tied to One Domain)

### 🎯 Gap Analysis View

```
┌─────────────────────────────────────────────────────────────────┐
│  🎯 GAP ANALYSIS: CPQ → RCA                                     │
│                                                                   │
│  VIEW: [By Domain ▼]  [By Severity ▼]  [By Effort ▼]           │
│                                                                   │
│  SUMMARY:                                                        │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐           │
│  │  ✅ 156  │ │  🔄 98   │ │  ⚠️ 61   │ │  🗑️ 43   │           │
│  │  Full    │ │  Partial │ │  No      │ │  Retire  │           │
│  │  Parity  │ │  (redes.)│ │  Parity  │ │  (unused)│           │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘           │
│                                                                   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  CPQ Feature        │ RCA Equivalent    │ Parity │ Notes  │   │
│  ├─────────────────────┼───────────────────┼────────┼────────┤   │
│  │ Product Bundles      │ Product Compos.   │ 🔄     │ Nest...│   │
│  │ Price Rules (basic)  │ Pricing Proced.   │ ✅     │        │   │
│  │ Price Rules (Apex)   │ Custom Proc.Step  │ ⚠️     │ Rewri..│   │
│  │ Calculator Plugin    │ —                 │ ⚠️     │ No eq..│   │
│  │ Quote Templates      │ Doc Generation    │ 🔄     │ Rebui..│   │
│  │ Advanced Approvals   │ SF Approvals      │ 🔄     │ Archi..│   │
│  │ Guided Selling       │ OmniStudio        │ 🔄     │ Rebui..│   │
│  │ Twin Fields          │ —                 │ ⚠️     │ Custo..│   │
│  │ MDQ                  │ Segmented Pricing │ 🔄     │ Parti..│   │
│  │ Subscription Prorate │ Pricing Proced.   │ ✅     │        │   │
│  │ ... expandable                                              │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                   │
│  Each row expandable → shows detailed mapping, affected items,   │
│  recommended approach, effort estimate                           │
└─────────────────────────────────────────────────────────────────┘
```

### ⚠️ Risk Register View

```
┌─────────────────────────────────────────────────────────────────┐
│  ⚠️ RISK REGISTER                                                │
│                                                                   │
│  ┌── RISK MATRIX (interactive) ──────────────────────────────┐  │
│  │                                                            │  │
│  │  IMPACT  │                                                 │  │
│  │    5     │              │         │  ●R3    │  ●R1  ●R2   │  │
│  │    4     │              │  ●R7    │  ●R4    │  ●R5        │  │
│  │    3     │     ●R12    │  ●R8    │  ●R6    │              │  │
│  │    2     │     ●R11    │  ●R9    │         │              │  │
│  │    1     │     ●R13    │  ●R10   │         │              │  │
│  │          ├──────────────┼─────────┼─────────┼──────────── │  │
│  │          │      1       │    2    │    3    │    4   5     │  │
│  │                              LIKELIHOOD                    │  │
│  │                                                            │  │
│  │  (click any dot to see risk details below)                 │  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                   │
│  ┌── RISK LIST ──────────────────────────────────────────────┐  │
│  │ R1 │🔴│ Calculator plugin rewrite may delay timeline by   │  │
│  │    │  │ 6+ weeks. 4,200 LOC, complex business logic.     │  │
│  │    │  │ Mitigation: Start Apex rewrite in Phase 1...      │  │
│  │    │  │ Affected: 3 plugins, 67 products, 12 price rules  │  │
│  │    │  │ [View affected items →]                           │  │
│  ├────┼──┼───────────────────────────────────────────────────┤  │
│  │ R2 │🔴│ Integration rework for NetSuite sync requires...  │  │
│  │    │  │ ...                                               │  │
│  └────┴──┴───────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

### 📅 Migration Plan View

```
┌─────────────────────────────────────────────────────────────────┐
│  📅 MIGRATION PLAN                                               │
│                                                                   │
│  VIEW: [Timeline ▼] [Work Breakdown ▼] [Team ▼]                │
│                                                                   │
│  ┌── INTERACTIVE TIMELINE ───────────────────────────────────┐  │
│  │                                                            │  │
│  │  2025                                          2026        │  │
│  │  Q1        Q2        Q3        Q4        Q1               │  │
│  │  │─────────│─────────│─────────│─────────│                │  │
│  │                                                            │  │
│  │  ████████████████                                          │  │
│  │  Phase 1: Foundation (800h)                                │  │
│  │  ├ Catalog migration                                       │  │
│  │  ├ Basic pricing procedures                                │  │
│  │  └ Document gen setup                                      │  │
│  │                                                            │  │
│  │            ██████████████████████████                       │  │
│  │            Phase 2: Advanced (1,100h)                      │  │
│  │            ├ Complex pricing redesign                       │  │
│  │            ├ Apex rewrites                                  │  │
│  │            ├ Integration rework                             │  │
│  │            └ Rules migration                                │  │
│  │                                                            │  │
│  │                                    ██████████████           │  │
│  │                                    Phase 3: Cutover (500h) │  │
│  │                                    ├ Amendments & renewals  │  │
│  │                                    ├ Data migration         │  │
│  │                                    ├ UAT                    │  │
│  │                                    └ Go-live + hypercare    │  │
│  │                                                            │  │
│  │  (interactive: click any phase/task to see details)        │  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                   │
│  ┌── EFFORT BREAKDOWN (interactive donut/bar) ───────────────┐  │
│  │                                                            │  │
│  │   Catalog Migration        ████░░░░░░░░    320h  (13%)   │  │
│  │   Pricing Procedures       █████████░░░    580h  (24%)   │  │
│  │   Custom Code Rewrite      ██████████░░    640h  (27%)   │  │
│  │   Integration Rework       █████░░░░░░░    280h  (12%)   │  │
│  │   Testing & QA             ████░░░░░░░░    240h  (10%)   │  │
│  │   Data Migration           ██░░░░░░░░░░    120h   (5%)   │  │
│  │   Training & Change Mgmt   ██░░░░░░░░░░    100h   (4%)   │  │
│  │   Project Management       ██░░░░░░░░░░    120h   (5%)   │  │
│  │                                           ─────────────   │  │
│  │                                    TOTAL:  2,400h          │  │
│  └────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

---

## The Chat Panel

The chat panel is a persistent, collapsible panel on the right side. It serves multiple purposes:

```
┌──────────────────────────────┐
│  💬 Assessment Assistant      │
│  ─────────────────────────── │
│                               │
│  Hi! I can help you explore  │
│  the assessment. Try:        │
│                               │
│  • "What's the biggest risk?"│
│  • "Show me all Apex that    │
│     touches pricing"         │
│  • "Why is the pricing       │
│     complexity score 9?"     │
│  • "What would Phase 1 look │
│     like if we exclude       │
│     amendments?"             │
│  • "Compare our complexity   │
│     to typical orgs"         │
│  • "Export the risk section" │
│                               │
│  ─────────────────────────── │
│                               │
│  👤 Why are calculator        │
│     plugins rated as the     │
│     highest risk?            │
│                               │
│  🤖 Calculator plugins are   │
│     your highest risk for    │
│     3 reasons:               │
│                               │
│     1. **Volume**: You have 3│
│        plugins with 4,200    │
│        total lines of Apex   │
│                               │
│     2. **No RCA equivalent**:│
│        RCA uses Pricing      │
│        Procedures which are  │
│        declarative. Your     │
│        plugin logic must be  │
│        fully rewritten.      │
│                               │
│     3. **Business critical**:│
│        These plugins handle  │
│        your Enterprise tier  │
│        volume discounting,   │
│        affecting 67 products │
│        and ~40% of revenue.  │
│                               │
│     → View the 3 plugins     │  ← clickable, navigates
│     → View affected products │  ← clickable, navigates
│     → View effort estimate   │  ← clickable, navigates
│                               │
│  ─────────────────────────── │
│                               │
│  👤 Can we do the migration  │
│     without rewriting the    │
│     plugins in phase 1?      │
│                               │
│  🤖 Technically yes, but     │
│     with caveats:            │
│                               │
│     If you defer plugin      │
│     rewrite to Phase 2, you  │
│     could go live with RCA   │
│     for **simple products    │
│     only** (the 120 products │
│     not affected by plugin   │
│     logic).                  │
│                               │
│     However, your Enterprise │
│     sales team (67 products) │
│     would remain on CPQ      │
│     during Phase 1, meaning: │
│                               │
│     ⚠️ Dual system operation  │
│     ⚠️ Double maintenance     │
│     ⚠️ Reporting complexity   │
│                               │
│     I'd recommend against    │
│     this unless timeline     │
│     pressure is extreme.     │
│                               │
│  ─────────────────────────── │
│  [Type a question...     ] ⏎ │
└──────────────────────────────┘
```

### Chat Capabilities

```
NAVIGATION
├── "Take me to the pricing section"
├── "Show me all high-risk items"
├── "Find the Apex class that handles volume discounting"
└── Responses include clickable links that navigate the UI

EXPLANATION
├── "Why is this scored as high complexity?"
├── "What does this price rule actually do?"
├── "Explain the difference between CPQ bundles and RCA compositions"
└── Contextual: chat knows what screen the user is currently viewing

WHAT-IF SCENARIOS
├── "What if we descope amendments from Phase 1?"
├── "What would the effort be if we retire inactive rules?"
├── "How does complexity change if we simplify to 2 price books?"
└── Recalculates and shows adjusted estimates

COMPARISON
├── "How does our org compare to typical CPQ orgs?"
├── "Is our number of price rules normal?"
├── "What's the average migration timeline for orgs like ours?"
└── Benchmarking against anonymized data

EXPORT
├── "Generate a PDF of the executive summary"
├── "Export the risk register as a spreadsheet"
├── "Create a slide deck for my VP"
└── Triggers export flows
```

---

## Key Interaction Patterns

### 1. Everything Is Linked / Cross-Referenced

```
When viewing a Price Rule:
  → Click the referenced Apex class → navigate to Code detail
  → Click "23 affected products" → navigate to filtered product list
  → Click the Summary Variable → navigate to its detail page
  → Click "Phase 2" tag → navigate to migration plan, Phase 2

EVERY item in the system links to:
  → What depends on it (upstream)
  → What it depends on (downstream)
  → Its migration status
  → Its gap analysis entry
  → Its risk entries (if any)
  → Its effort estimate
  → Its phase assignment
```

### 2. Universal Command Palette (⌘K)

```
┌─────────────────────────────────────────────────┐
│  🔍  Search assessment...                        │
│  ─────────────────────────────────────────────── │
│                                                   │
│  RECENT                                          │
│  📋 Enterprise Volume Discount (Price Rule)      │
│  ⚙️ VolumeDiscountCalc.cls (Apex Class)          │
│  📦 ENT-200 Enterprise Platform (Product)        │
│                                                   │
│  QUICK ACTIONS                                   │
│  🎯 Go to Gap Analysis                          │
│  ⚠️ Go to Risk Register                         │
│  📥 Export Full Report as PDF                    │
│  💬 Open Chat Assistant                          │
│                                                   │
│  TYPE TO SEARCH                                  │
│  Searches across: products, rules, code,         │
│  integrations, risks, gaps — everything          │
└─────────────────────────────────────────────────┘
```

### 3. Contextual Hover Cards

```
When any linked item appears in text or tables,
hovering shows a preview card:

         ┌─────────────────────────────┐
         │ 📋 Enterprise Volume Disc.   │
         │ Price Rule | Active | 🔴 9   │
         │                             │
         │ Migration: ⚠️ Gap            │
         │ Effort: ~40 hours           │
         │ Phase: 2                    │
         │ Dependencies: 4            │
         │                             │
         │ [Open Detail →]             │
         └─────────────────────────────┘

No need to navigate away — quick glance at any item.
```

### 4. Annotation / Collaboration Layer

```
Any item can have:
├── 💬 Comments (team discussion threads)
├── 📌 Bookmarks (save for later / add to report)
├── 🏷️ Custom tags (user-defined categorization)
├── ✅ Sign-off (stakeholder acknowledgment)
└── 📝 Override (manually adjust automated scores with justification)

Example: An architect reviews an auto-scored Price Rule
and thinks the complexity should be 7, not 9:

  "Overriding complexity from 9→7: The nested conditions
   look complex but 2 of 3 levels are simple null checks.
   Actual migration effort is moderate."
   — @john.architect, Jan 20, 2025
```

---

## PDF Export: Not an Afterthought

```
EXPORT OPTIONS:
├── 📄 Full Assessment Report (the 100-page equivalent)
│    └── Branded, paginated, TOC, all sections
│
├── 📊 Executive Summary (5-page version)
│    └── Scores, top risks, recommendation, timeline, cost
│
├── 🎯 Gap Analysis Only
│
├── ⚠️ Risk Register Only
│
├── 📅 Migration Plan Only
│
├── 📋 Technical Inventory (appendix-style tables)
│
├── 🎨 Custom Export
│    └── User picks which sections/views to include
│
└── All exports use customer's branding (logo, colors, fonts)
    configured in Settings
```

The PDF is **generated from the same data** the UI shows — it's a rendering format, not a separate document. This guarantees consistency.

---

## Screen Map / Navigation Architecture

```
                        ┌─────────────┐
                        │  EXECUTIVE   │
                        │  COMMAND     │
                        │  CENTER      │
                        └──────┬──────┘
                               │
            ┌──────────────────┼──────────────────────┐
            │                  │                       │
     ┌──────▼──────┐   ┌──────▼──────┐        ┌──────▼──────┐
     │  DOMAIN      │   │  CROSS-CUT  │        │  PLANNING   │
     │  DASHBOARDS  │   │  VIEWS      │        │  VIEWS      │
     │              │   │             │        │             │
     │ • Products   │   │ • Gap       │        │ • Plan      │
     │ • Pricing    │   │   Analysis  │        │ • Effort    │
     │ • Rules      │   │ • Risk      │        │ • Team      │
     │ • Code       │   │   Register  │        │ • Timeline  │
     │ • Integr.    │   │ • Dependency│        │             │
     │ • Amend/Ren  │   │   Graph     │        │             │
     │ • Approvals  │   │ • Business  │        │             │
     │ • Documents  │   │   Process   │        │             │
     │ • Data       │   │   Flows     │        │             │
     └──────┬──────┘   └─────────────┘        └─────────────┘
            │
     ┌──────▼──────┐
     │  ITEM        │
     │  DETAIL      │
     │  (any item   │
     │   in any     │
     │   domain)    │
     └──────┬──────┘
            │
     ┌──────▼──────┐
     │  EVIDENCE    │
     │  (code,      │
     │   config,    │
     │   raw data)  │
     └─────────────┘


HORIZONTAL (available everywhere):
├── 💬 Chat Assistant (right panel)
├── 🔍 Command Palette (⌘K overlay)
├── 📥 Export (any view)
├── 📌 Bookmarks
└── 💬 Comments / Annotations
```

---

## One Extra View: The Dependency Graph (Global)

This is the view that no PDF can match — an interactive, navigable graph of the entire CPQ configuration and its interdependencies:

```
┌─────────────────────────────────────────────────────────────────┐
│  🕸️ DEPENDENCY GRAPH                                             │
│                                                                   │
│  Filter: [All ▼] [Pricing Only ▼] [High Risk Only ▼]           │
│  Color:  🟢 Direct Map  🟡 Redesign  🔴 Gap  ⚪ Retire          │
│                                                                   │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │                                                           │  │
│  │                    ┌─────────┐                            │  │
│  │              ┌─────│Product  │─────┐                      │  │
│  │              │     │Bundle A │     │                      │  │
│  │              │     └────┬────┘     │                      │  │
│  │              ▼          │          ▼                      │  │
│  │        ┌─────────┐     │    ┌──────────┐                 │  │
│  │    ┌───│Config   │     │    │Option    │───┐             │  │
│  │    │   │Rule 1   │     │    │Constraint│   │             │  │
│  │    │   └─────────┘     │    └──────────┘   │             │  │
│  │    │                   │                    │             │  │
│  │    ▼                   ▼                    ▼             │  │
│  │  ┌─────────┐    ┌──────────┐         ┌─────────┐        │  │
│  │  │Price    │    │Summary   │         │Apex:    │        │  │
│  │  │Rule 1 🔴│←──│Variable 1│────────→│VolCalc  │        │  │
│  │  └─────────┘    └──────────┘         └────┬────┘        │  │
│  │       │                                    │             │  │
│  │       ▼                                    ▼             │  │
│  │  ┌──────────┐                       ┌──────────┐        │  │
│  │  │Lookup    │                       │Trigger:  │        │  │
│  │  │Query 1   │                       │QLineCalc │        │  │
│  │  └──────────┘                       └──────────┘        │  │
│  │                                                           │  │
│  │  (pan, zoom, click any node, highlight paths,             │  │
│  │   filter by migration status, isolate subgraphs)          │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                   │
│  Clicking a node: shows detail panel on right                    │
│  Hovering a node: shows hover card with key metrics              │
│  Double-click: navigates to item detail page                     │
└─────────────────────────────────────────────────────────────────┘
```

This is the **killer feature** that makes the GUI fundamentally superior to any PDF. A consultant can never draw this for 500+ interconnected objects — but the tool can.

---

## Summary: What Makes This Better Than the PDF

| Dimension                   | 100-page PDF                | Interactive GUI                           |
| --------------------------- | --------------------------- | ----------------------------------------- |
| Time to first insight       | Read 5-8 pages              | 30 seconds (command center)               |
| Finding a specific item     | Ctrl+F, scroll              | ⌘K, instant navigation                    |
| Understanding dependencies  | Impossible in flat doc      | Interactive dependency graph              |
| Asking follow-up questions  | Email the consultant, wait  | Chat assistant, instant                   |
| Exploring what-if scenarios | Not possible                | Chat: "what if we descope X?"             |
| Sharing specific findings   | "See page 47"               | Direct link to any item/view              |
| Keeping up to date          | Regenerate entire PDF       | Live data, always current                 |
| Collaboration               | Comments in margins         | Threaded comments, annotations, sign-offs |
| Customizing the view        | Not possible                | Filters, sorts, grouping, saved views     |
| Cross-referencing           | Manually flip between pages | Everything is hyperlinked                 |

---

# Honest Gap Analysis: Does the Proposal Match the Professional PDF?

**Short answer: it covers roughly 65-70% of what a professional assessment document contains.** The technical inventory layer is strong. But there are significant content areas that the proposal either doesn't mention at all, treats too superficially, or structurally can't accommodate in the current design.

Let me walk through this systematically.

---

## Full Coverage Map

I've gone through every section of a typical AllCloud/Cognizant/Deloitte-style assessment document and mapped it against what the proposal explicitly addresses.

### ✅ Well Covered (proposal has explicit design for this)

| PDF Section                                   | Proposal Coverage                                 |
| --------------------------------------------- | ------------------------------------------------- |
| Executive Summary                             | Overview tab with stats, heatmap, risks, blockers |
| Product Catalog Inventory                     | Products domain tab                               |
| Pricing Rules Inventory                       | Pricing domain tab                                |
| Product Rules Inventory                       | Rules domain tab                                  |
| Custom Code Inventory (Apex, Triggers, Flows) | Code domain tab                                   |
| Integration Inventory                         | Integrations domain tab                           |
| Amendments & Renewals Inventory               | Amendments domain tab                             |
| Approvals Inventory                           | Approvals domain tab                              |
| Data Volumes                                  | Data domain tab                                   |
| CPQ → RCA Feature Gap Matrix                  | Translation Matrix + per-item migration status    |
| Top Risks & Blockers                          | Overview cards                                    |
| Item-Level Detail & Evidence                  | Slide-over panel                                  |
| Branded PDF Export                            | Export flow                                       |

**This is the 60-70% that's archaeology and scanning. The proposal handles it well.**

---

### 🟡 Partially Covered (mentioned but not designed or too shallow)

These appear somewhere in the proposal text but lack the depth a professional document would give them.

#### 1. Risk Register — No Structured View

**What the PDF has:** A full risk register (typically 15-25 risks), each with description, category (technical / business / timeline / organizational), likelihood rating, impact rating, likelihood × impact matrix visualization, mitigation strategy, risk owner, and status.

**What the proposal has:** Two cards on the Overview — "Top Risks" and "Blockers" — with a "View all 23 risks →" link that goes nowhere designed.

**What's needed:** A full risk management view. Every auto-detected risk plus the ability for consultants to add manual risks. Each risk should be a first-class object with severity, category, affected items (linked), mitigation notes, and owner. The risk heat map (likelihood × impact scatter plot) is a standard deliverable that stakeholders expect to see.

#### 2. Effort Estimation — No Interface

**What the PDF has:** 5-8 pages with work breakdown structure by domain and phase, team composition (# of architects, developers, admins, PMs), timeline (Gantt or milestone view), cost range (optimistic / likely / pessimistic), and explicit assumptions.

**What the proposal has:** "NOT auto-generated (consultant fills in)" with no design for where or how.

**What's needed:** At minimum, a structured estimation table pre-populated with domain item counts where the consultant fills in hours. Better: a phase-planning interface where items are assigned to phases, and effort rolls up. The proposal's "Migration Plan" tab (mentioned in the existing sidebar) might be where this lives but it's not connected to the assessment data.

#### 3. Business Process Documentation — No Home

**What the PDF has:** 10-15 pages of process flow diagrams (as-is quote-to-cash), sales motion descriptions, stakeholder role mapping, deal desk governance, pricing authority matrix, approval routing logic in business terms.

**What the proposal has:** "NOT automated — consultant adds via notes/annotations."

**What's needed:** Structured areas — not just free-text notes scattered across items. Something like a "Business Context" section per domain tab (or a dedicated tab) where the consultant can document the process-level story. Consider structured templates:

- "Describe the quote creation process for new business deals"
- "Describe how renewals are handled today"
- "Describe the approval governance model"

These prompts help consultants produce consistent documentation without staring at a blank page.

#### 4. Quote Templates / Document Generation — Buried

**What the PDF has:** Detailed inventory of all quote templates, their sections, conditional logic (show/hide rules), merge fields, line item columns, grouping behavior, multi-language handling, output formats (PDF vs. Word), and custom components. This is often 5-8 pages because quote templates are deceptively complex.

**What the proposal has:** "Documents" appears once in the domain list table with "Quote Templates, Sections, Conditional Logic, Output Formats" as description. But no wireframe, no detail on what the tab shows, and the earlier proposal text doesn't elaborate.

**What's needed:** The Documents domain tab deserves the same design treatment as Pricing or Products. Template inventory with section-level detail, merge field mapping (CPQ merge fields → RCA document generation equivalents), conditional section logic inventory, and per-template migration status.

#### 5. Data Migration Strategy — Beyond Volumes

**What the PDF has:** Not just "how many records" but decisions about historical data. Do you migrate all historical quotes? Only last 2 years? Only active subscriptions? What about in-flight quotes during cutover? Data transformation rules (field value mappings, picklist value changes, record type migrations).

**What the proposal has:** "Data" domain tab with "Record counts, data quality score."

**What's needed:** A data migration strategy section that covers retention policy recommendations, transformation rules, cutover approach, and in-flight transaction handling. Much of this is consultant-authored, but the tool should provide the volume and distribution data that informs these decisions: "You have 450,000 historical quotes. 89% are older than 2 years. 12,000 are in 'Draft' status."

---

### 🔴 Not Covered At All

These are sections that appear in professional assessment documents but are completely absent from the proposal.

#### 6. Guided Selling Flows

Most mature CPQ orgs have guided selling processes — wizard-like interfaces that ask sales reps questions and auto-configure product selections. These must be rebuilt in OmniStudio (FlexCards/OmniScripts) for RCA. This is a significant workstream that isn't mentioned anywhere in the proposal.

**Where it should live:** Either within the Products domain tab (as a sub-tab) or as its own domain tab if the org has significant guided selling complexity. The inventory should include: flow name, number of steps, input fields, output product mappings, conditional branching logic, and RCA equivalent approach.

#### 7. QLE (Quote Line Editor) Customizations

The Quote Line Editor is the primary UI that sales reps interact with in CPQ. Many orgs have extensively customized it: custom columns, custom buttons, custom JavaScript, lookup fields, related list components, page layout overrides, and QLE plugins.

**Where it should live:** Within the Products or Documents domain tab. Needs a sub-section that inventories every QLE customization, because all of these break in RCA (which has a completely different configuration UI).

#### 8. Twin Fields

CPQ has a concept called "twin fields" where values are automatically synced between related objects (e.g., a field on the Quote automatically twins to the Opportunity, or a field on the Quote Line twins to the Order Product). These relationships are often invisible — they're configured via a specific CPQ setting, not visible Apex or Flow.

**Why it matters:** Twin field relationships must be manually recreated in RCA using different mechanisms. Missing even one twin field can cause data inconsistencies post-migration.

**Where it should live:** Within the Products domain tab as a sub-section or within a general "Field Mapping" view. The scan should auto-detect twin field configurations.

#### 9. Contracted Pricing & Special Pricing

Customer-specific pricing agreements (contracted prices, special prices) are a major CPQ feature used by B2B enterprises. These have their own objects, their own override logic, and their own RCA equivalent (which works differently).

**Where it should live:** Within the Pricing domain tab as a dedicated sub-tab. The inventory should include: number of contracted price records, number of accounts with special pricing, expiration handling, and RCA mapping.

#### 10. Multi-Currency Details

If the org uses multi-currency (common in enterprises), this affects pricing, quote templates, reporting, and integrations. The assessment should document: which currencies are active, how exchange rates are managed, whether dated exchange rates are used, and how this maps to RCA's multi-currency approach.

**Where it should live:** Within the Pricing domain tab as a sub-tab or callout section.

#### 11. Subscription Management Details

The proposal mentions "Amendments & Renewals" but doesn't break down the subscription-specific complexities:

- **Co-termination logic** — how are new subscriptions aligned to existing contract end dates?
- **Proration rules** — how are partial periods calculated?
- **Evergreen vs. end-dated subscriptions** — which model does the org use?
- **MDQ (Multi-Dimensional Quoting)** — are products quoted across multiple time segments?
- **Subscription term handling** — how are terms calculated, defaulted, overridden?
- **Uplift/escalation** — automatic price increases on renewals

Each of these has a different RCA equivalent (or gap). MDQ in particular is a known partial-parity area that causes migration blockers.

**Where it should live:** More granular sub-tabs within the Amendments domain tab.

#### 12. Reports & Dashboards Impact

Every Salesforce org has reports and dashboards built on CPQ objects (SBQQ**Quote**c, SBQQ**QuoteLine**c, etc.). These all break when CPQ is decommissioned. A professional assessment inventories these and categorizes them.

**What's needed:** A sub-section (possibly within Data or as a standalone) that lists: report count referencing CPQ objects, dashboard count, report folders/ownership, which reports are actively used (last run date), and which need to be rebuilt on RCA objects.

**Why it's important:** This is often the surprise scope that blows timelines. Nobody remembers the 85 reports until they stop working.

#### 13. Security, Sharing & Permission Sets

CPQ objects often have custom sharing rules, permission sets, field-level security (FLS) configurations, and record type assignments. These must be mapped to RCA's object model.

**What's needed:** An inventory of permission sets that reference CPQ objects, sharing rules on CPQ objects, FLS configurations, and profile-level access. This feeds into the effort estimate for "security model migration."

**Where it should live:** Could be a sub-section of Code (it's configuration) or a dedicated "Org Config" domain tab.

#### 14. Package Dependencies

CPQ orgs often have other managed packages installed alongside CPQ: DocuSign, Conga, DealHub, LeanData, nCino, or industry-specific packages. Some of these packages interact with CPQ objects directly.

**What's needed:** An inventory of installed packages, whether they reference CPQ objects, and what happens to those references post-migration. This is a risk factor that's easy to detect via metadata scan.

**Where it should live:** Within the Integrations domain tab or as a separate sub-section.

#### 15. Experience Cloud / Partner Portal Impact

If CPQ is exposed through Salesforce Experience Cloud (formerly Community Cloud) for partner quoting or self-service, this is a separate migration workstream. The RCA configuration experience is different from CPQ's community-exposed components.

**What's needed:** Detection of whether CPQ components are used in any Experience Cloud site, and if so, inventory of exposed components, guest user access, and partner-specific pricing/product visibility rules.

**Where it should live:** Within the Integrations domain tab.

#### 16. Salesforce Billing / Order Management

If the org uses Salesforce Billing (the complement to CPQ for invoicing, revenue recognition, payment processing), the migration scope expands significantly. RCA has a different relationship with billing.

**What's needed:** Detection of Salesforce Billing objects, billing-specific customizations, and impact on the billing pipeline post-CPQ removal.

**Where it should live:** Could be its own domain tab or a major sub-section of Integrations. If Billing is present, it probably deserves its own tab because it doubles the migration complexity.

#### 17. Org Health / Governor Limits

**What the PDF has:** Current API consumption patterns, Apex execution time budget, storage usage, and whether the org is near any governor limits that could affect migration activities (bulk data operations, deployment limits).

**Where it should live:** Could be a section on the Overview tab or within the Data domain tab. The scan should capture current limits usage and flag if migration activities (data loads, deployments) might hit limits.

#### 18. License & Edition Considerations

**What the PDF has:** Current Salesforce edition, CPQ license count and type, whether the customer has the required RCA licenses (Industry Cloud licenses), and cost implications of license changes.

**Why it matters:** This is a go/no-go consideration. If the customer needs to purchase additional licenses for RCA, that's a cost that belongs in the assessment.

**Where it should live:** A section on the Overview tab, possibly within a "Prerequisites" or "Readiness Checklist" area.

#### 19. Performance Baseline

**What the PDF has:** Current CPQ performance metrics — page load times for QLE, calculation times for complex quotes, save times, and any known performance issues. This establishes a baseline that the RCA implementation should meet or exceed.

**Why it matters:** If CPQ already has performance problems, the migration is an opportunity to fix them. If CPQ is fast and RCA is slower (which is possible for certain operations), that's a risk.

**Where it should live:** Within the Data domain tab or Overview.

#### 20. Testing Strategy

**What the PDF has:** A testing approach section covering unit testing plan, integration testing plan, UAT (User Acceptance Testing) plan, regression testing scope, performance testing, and data validation testing. Often includes test case categories and estimated test effort.

**Where it should live:** Within the Migration Plan or as a sub-section of the effort estimation area.

#### 21. Change Management & Training

**What the PDF has:** User impact assessment, training plan (who needs training, on what, how much), communication plan, and change management recommendations.

**Why it matters:** RCA has a fundamentally different UI than CPQ. Sales reps need retraining. This effort is often underestimated.

**Where it should live:** Within the Migration Plan or as a consultant-authored section.

#### 22. Target State Architecture (To-Be)

**What the PDF has:** 8-12 pages of proposed RCA architecture — not just "what maps to what" (that's the gap matrix) but "how should we design the RCA implementation." This includes proposed product selling model structure, pricing procedure design patterns, document generation architecture, and integration architecture.

**What the proposal has:** The Translation Matrix shows feature-level mapping but doesn't design the target state.

**What's needed:** This is primarily consultant-authored, but the tool could provide a structured section where the consultant documents architectural decisions with templates: "Product Model Design," "Pricing Architecture," "Integration Approach." Even better: auto-generate a starting-point architecture recommendation based on the scan results.

---

## Revised Coverage Summary

| Coverage Level                         | Count    | Percentage |
| -------------------------------------- | -------- | ---------- |
| ✅ Well covered by proposal            | 13 areas | ~38%       |
| 🟡 Partially covered (needs deepening) | 5 areas  | ~15%       |
| 🔴 Not covered at all                  | 17 areas | ~47%       |

**However, the severity distribution is important:**

The 13 well-covered areas are the **highest-effort** parts of the manual assessment (technical inventory and scanning). They represent 60-70% of the consultant labor even though they're only 38% of the content areas. So by effort-reduction, the proposal is on target.

The 17 uncovered areas break down into:

**8 areas that your scanner should detect automatically** — these are metadata-scannable and should be added as sub-sections within existing domain tabs:

| Area                                 | Where It Should Live                         |
| ------------------------------------ | -------------------------------------------- |
| Guided Selling Flows                 | Products tab, sub-section                    |
| QLE Customizations                   | Products tab, sub-section                    |
| Twin Fields                          | Products tab, sub-section                    |
| Contracted Pricing                   | Pricing tab, sub-section                     |
| Multi-Currency Details               | Pricing tab, sub-section                     |
| Reports & Dashboards Impact          | Data tab, sub-section                        |
| Security / Permission Sets / Sharing | New "Org Config" tab or Code tab sub-section |
| Package Dependencies                 | Integrations tab, sub-section                |

**5 areas that are partially scannable** — the tool can detect the presence/volume but a consultant must interpret:

| Area                             | What Tool Can Do                                     | What Consultant Adds                        |
| -------------------------------- | ---------------------------------------------------- | ------------------------------------------- |
| Subscription Management Details  | Detect co-term settings, MDQ usage, proration config | Business process context, edge cases        |
| Experience Cloud / Portal Impact | Detect CPQ components in Experience sites            | User journey impact, partner workflow       |
| Salesforce Billing presence      | Detect Billing objects and customizations            | Billing workflow impact, scope decision     |
| Org Health / Governor Limits     | Read limits API, report current usage                | Risk assessment for migration activities    |
| Performance Baseline             | Potentially measure page load times                  | Acceptability thresholds, user expectations |

**4 areas that are purely consultant-authored** — the tool provides structure, not content:

| Area                         | How Tool Helps                                                  |
| ---------------------------- | --------------------------------------------------------------- |
| Target State Architecture    | Structured templates + auto-suggested starting point            |
| Testing Strategy             | Pre-populated test categories based on scan results             |
| Change Management & Training | User persona detection (who uses CPQ) + structured template     |
| License & Edition            | Auto-detect current edition and licenses, flag RCA requirements |

---

## What This Means for the Proposal

### The domain tab structure needs expansion

Your current 8 domain tabs are:

```
Products | Pricing | Rules | Code | Integrations | Amendments | Approvals | Data
```

Based on the gaps, I'd recommend either:

**Option A: Add sub-tabs to existing domains (less navigation, more depth per tab)**

```
Products
├── Product Catalog
├── Bundles & Options
├── Configuration Attributes
├── Guided Selling Flows        ← NEW
├── QLE Customizations          ← NEW
└── Twin Fields                 ← NEW

Pricing
├── Price Rules
├── Discount Schedules
├── Price Books
├── Calculator Plugins
├── Contracted Pricing          ← NEW (was mentioned but not designed)
└── Multi-Currency              ← NEW

Rules
├── Product Rules
├── Validation Rules
├── Summary Variables
└── Lookup Queries

Code
├── Apex Classes & Triggers
├── LWC / Aura Components
├── Flows & Process Builders
├── Security & Permissions      ← NEW
└── Package Dependencies        ← (or move to Integrations)

Integrations
├── External Systems
├── Data Flows
├── Middleware / iPaaS
├── Package Dependencies        ← NEW
├── Experience Cloud            ← NEW
└── Salesforce Billing          ← NEW (if detected)

Amendments & Renewals
├── Amendment Processes
├── Renewal Models
├── Subscription Management     ← EXPANDED
│   ├── Co-termination
│   ├── Proration
│   ├── MDQ
│   └── Evergreen vs End-Dated
└── Contract Lifecycle

Approvals
├── Approval Chains
├── Advanced Approvals
├── Smart Approvals
└── Custom Components

Data & Reporting               ← EXPANDED
├── Data Volumes
├── Data Quality
├── Historical Data Strategy
├── Reports & Dashboards       ← NEW
├── Org Health / Limits        ← NEW
└── Licenses & Edition         ← NEW

Documents                      ← NOW A FULL TAB
├── Quote Templates
├── Template Sections & Logic
├── Merge Fields
├── Output Formats
└── Multi-Language
```

**Option B: Add 2-3 new domain tabs**

```
Products | Pricing | Rules | Code | Integrations | Amendments | Approvals | Documents | Data | Org Health
```

Option A is cleaner for navigation but requires each tab to handle more sub-sections. Option B is more explicit but the tab bar gets crowded at 10+ tabs.

I'd recommend **Option A** with a good sub-tab design within each domain tab. The sub-tabs are already part of the proposal's design pattern.

### The Overview tab needs 3 additional sections

```
CURRENT OVERVIEW:
├── Migration Readiness (4 stat cards)
├── Complexity Heatmap
├── Top Risks + Blockers
└── Key Findings

ADDITIONS NEEDED:
├── Readiness Prerequisites          ← NEW
│   ├── License check (edition, RCA licenses)
│   ├── Org health check (limits, storage)
│   └── Billing detection (scope flag)
│
├── Migration Strategy section        ← NEW
│   ├── Recommended approach
│   ├── Phase breakdown (connected to Migration Plan tab)
│   └── Key assumptions
│
└── Assessment Completeness          ← NEW (my earlier recommendation)
    ├── Scan status per domain
    ├── Consultant sections filled/empty
    └── Triage progress
```

### The proposal needs a "Consultant Workspace" concept

The 4 purely consultant-authored areas (target state architecture, testing strategy, change management, business process documentation) collectively represent roughly 20-30 pages of the professional PDF. The proposal acknowledges these exist but provides no design for them.

**Recommendation:** Add a "Consultant Sections" area — either as sub-sections within relevant tabs or as a dedicated "Strategy" tab. Each section has:

- A structured template with prompts (not a blank text box)
- Pre-populated context from the scan results
- Rich text editing
- Inclusion toggle for PDF export

```
┌─ CONSULTANT SECTIONS ──────────────────────────────────────┐
│                                                             │
│  ┌─────────────────────────────┬──────────┬──────────────┐ │
│  │ Section                     │ Status   │ PDF Include  │ │
│  ├─────────────────────────────┼──────────┼──────────────┤ │
│  │ Business Process (As-Is)    │ ⬜ Empty  │ ☐           │ │
│  │ Target Architecture (To-Be) │ ⬜ Empty  │ ☐           │ │
│  │ Testing Strategy            │ ⬜ Empty  │ ☐           │ │
│  │ Change Management Plan      │ ⬜ Empty  │ ☐           │ │
│  │ Strategic Recommendations   │ ⬜ Empty  │ ☐           │ │
│  └─────────────────────────────┴──────────┴──────────────┘ │
│                                                             │
│  Click any section to open editor with template prompts.    │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## Final Verdict

| Dimension                     | Professional PDF (100 pages) | Current Proposal          | With Additions Above      |
| ----------------------------- | ---------------------------- | ------------------------- | ------------------------- |
| Technical inventory depth     | ████████████████████ 100%    | ████████████████░░░░ 80%  | ████████████████████ ~95% |
| Business process coverage     | ████████████████████ 100%    | ██░░░░░░░░░░░░░░░░░░ 10%  | ████████████░░░░░░░░ ~55% |
| Gap analysis completeness     | ████████████████████ 100%    | ████████████████░░░░ 80%  | ██████████████████░░ ~90% |
| Risk assessment depth         | ████████████████████ 100%    | ██████░░░░░░░░░░░░░░ 30%  | ████████████████░░░░ ~80% |
| Migration strategy & planning | ████████████████████ 100%    | ████░░░░░░░░░░░░░░░░ 20%  | ██████████████░░░░░░ ~70% |
| Effort estimation             | ████████████████████ 100%    | ░░░░░░░░░░░░░░░░░░░░ 0%   | ████████████░░░░░░░░ ~60% |
| Target state architecture     | ████████████████████ 100%    | ████░░░░░░░░░░░░░░░░ 20%  | ██████████░░░░░░░░░░ ~50% |
| Appendices & evidence         | ████████████████████ 100%    | ████████████████████ 100% | ████████████████████ 100% |

**With the additions, the tool would cover ~80-85% of the professional PDF content**, with the remaining 15-20% being genuinely human-judgment content that no tool should try to automate (strategic recommendations, organizational risk assessment, political considerations).

That 80-85% coverage at dramatically lower effort (hours instead of weeks) is the actual value proposition. The remaining consultant-authored sections are accommodated by the structured templates — the consultant still writes them, but they write them inside the tool with full context, not in a separate Google Doc.
