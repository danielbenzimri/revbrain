# CPQ Extraction Service — Architecture, Status & Completion Guide

> **Purpose:** Complete guide for the engineering team + CEO briefing on the CPQ data extraction service — what it is, how it's built, what's done, what's missing, and the step-by-step path to completion.
>
> **Date:** 2026-03-26
> **Audience:** Daniel (CTO), Niv (Engineer), Rami (CEO)

---

## 1. What Is the CPQ Extraction Service?

RevBrain connects to a customer's Salesforce org and extracts their CPQ (Configure, Price, Quote) configuration to produce a migration assessment — a comprehensive report showing what they have, how complex it is, what maps to Revenue Cloud Advanced (RCA), and what risks they face.

```mermaid
graph LR
    A[Customer's Salesforce Org] -->|OAuth Connection| B[RevBrain Platform]
    B -->|Triggers Extraction| C[Extraction Worker<br/>Cloud Run Job]
    C -->|REST / Bulk / Tooling API| A
    C -->|Writes Results| D[(PostgreSQL<br/>Supabase)]
    D -->|Reads| E[Assessment Dashboard<br/>React UI]
    E -->|Reviews| F[Consultant]
    F -->|Publishes| G[Customer Report]
```

### The Three-Layer Architecture

```mermaid
graph TB
    subgraph "Layer 1: Data Extraction (Built)"
        W[Worker Container<br/>TypeScript / Cloud Run]
        W --> SF[Salesforce APIs]
        W --> DB[(assessment_findings<br/>assessment_summaries<br/>collector_metrics)]
    end

    subgraph "Layer 2: AI Analysis (Future v1.1)"
        PY[Python Analysis Engine]
        PY --> LLM[Claude / GPT-4]
        PY --> DB
    end

    subgraph "Layer 3: Human Review (Future v2)"
        CON[Consultant Workspace]
        CON --> DB
        CON --> REPORT[Published Assessment]
    end

    DB --> UI[Assessment Dashboard<br/>Already Built]
```

**Key insight:** Layer 1 (extraction) feeds Layer 2 (AI) which feeds Layer 3 (human). We're building Layer 1 now. The UI for showing results (the Assessment Dashboard) is already built with mock data.

---

## 2. How It Works End-to-End

```mermaid
sequenceDiagram
    participant User
    participant UI as React Dashboard
    participant API as Hono Server
    participant CR as Cloud Run Job
    participant SF as Salesforce
    participant DB as PostgreSQL

    User->>UI: Click "Run Assessment"
    UI->>API: POST /assessment/run
    API->>DB: Create assessment_runs (queued)
    API->>CR: Trigger Cloud Run Job
    API-->>UI: 202 Accepted + runId

    loop Every 5 seconds
        UI->>API: GET /runs/:runId/status
        API->>DB: Read progress JSONB
        API-->>UI: { status, progress, collectors }
    end

    CR->>DB: Claim lease (CAS)
    CR->>SF: Organization query (fingerprint)
    CR->>SF: Describe Global + batched Describes
    CR->>SF: Limits check + CPQ version

    loop For each collector (parallel by tier)
        CR->>SF: SOQL queries / Bulk API
        CR->>DB: Write findings + metrics
    end

    CR->>DB: Build relationships + summaries
    CR->>DB: Set status = completed
    CR-->>UI: Progress 100%

    UI->>API: GET /runs/:runId/summaries
    API->>DB: Read summaries
    API-->>UI: Assessment Dashboard data
```

### The Run State Machine

```mermaid
stateDiagram-v2
    [*] --> queued: User triggers
    queued --> dispatched: Cloud Run started
    queued --> cancelled: User cancels

    dispatched --> running: Worker claims lease
    dispatched --> stalled: Container timeout (5min)
    dispatched --> cancelled: User cancels

    running --> completed: All collectors done
    running --> completed_warnings: Tier1/2 partial
    running --> failed: Tier0 failure
    running --> stalled: Heartbeat timeout
    running --> cancel_requested: User cancels

    stalled --> queued: Retries remain
    stalled --> failed: Max retries exceeded
    stalled --> cancelled: User cancels

    cancel_requested --> cancelled: Worker stops

    completed --> [*]
    completed_warnings --> [*]
    failed --> [*]
    cancelled --> [*]
```

---

## 3. What's Already Built

### Fully Implemented & Tested (85 unit tests passing)

| Component                  | Files                                                 | What It Does                                                                                                     |
| -------------------------- | ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| **Worker scaffold**        | `apps/worker/` (package, Docker, tsconfig)            | TypeScript package in monorepo, multi-stage Docker build                                                         |
| **Structured logging**     | `src/lib/logger.ts`                                   | pino JSON + AsyncLocalStorage trace propagation                                                                  |
| **Database schema**        | `packages/database/` (7 tables)                       | assessment_runs, findings, relationships, metrics, summaries + state machine trigger + security definer function |
| **Lease manager**          | `src/lease.ts`                                        | CAS claim/renew/release, 30s heartbeat, self-termination on loss                                                 |
| **Progress + checkpoint**  | `src/progress.ts`, `src/checkpoint.ts`                | Per-collector tracking, resumable runs                                                                           |
| **SIGTERM + cancellation** | `src/lifecycle.ts`                                    | Graceful shutdown, health check, run attempts                                                                    |
| **Finding model**          | `packages/contract/src/assessment.ts`                 | Zod schemas for all types (11 domains, 7 risk levels, finding keys)                                              |
| **Batch writes**           | `src/db/writes.ts`                                    | Provenance-based transactional writes with retry                                                                 |
| **Snapshot storage**       | `src/storage/snapshots.ts`                            | Configurable gzip upload (none/errors_only/transactional/all)                                                    |
| **SF token management**    | `src/salesforce/auth.ts`                              | AES-256-GCM decrypt, refresh fallback, proactive refresh, ID normalization                                       |
| **SF HTTP client**         | `src/salesforce/client.ts`                            | Retry, throttle, per-API circuit breakers, budget enforcement                                                    |
| **SF REST + Composite**    | `src/salesforce/rest.ts`                              | query/queryAll, Describe, limits, Composite Batch, Tooling                                                       |
| **SF Bulk API**            | `src/salesforce/bulk.ts`                              | Create/poll/stream/abort, adaptive polling, failedResults                                                        |
| **SF SOAP**                | `src/salesforce/soap.ts`                              | Metadata API retrieve for approval processes, flows                                                              |
| **Query builder**          | `src/salesforce/query-builder.ts`                     | Dynamic SOQL from Describe, compound fields, injection prevention                                                |
| **Collector framework**    | `src/collectors/base.ts`, `registry.ts`               | BaseCollector with timeout/cancel/checkpoint, tier registry                                                      |
| **Pipeline orchestrator**  | `src/pipeline.ts`                                     | Tier 0 → gate → Tier 1/2, dependency validation, concurrency                                                     |
| **API routes**             | `apps/server/src/v1/routes/assessment.ts`             | POST /run, GET /status, POST /cancel (placeholder)                                                               |
| **Sweeper SQL**            | `packages/database/sql/create_assessment_sweeper.sql` | Lease expiry, retry gating, normalization timeout                                                                |

### The Assessment Dashboard (Already Built — Mock Data)

This is the key surprise: **the entire assessment UI is already built** with comprehensive mock data.

```
apps/client/src/features/projects/
├── pages/workspace/AssessmentPage.tsx    ← Main page with 9 domain tabs
├── components/assessment/
│   ├── OverviewTab.tsx                   ← Executive summary
│   ├── ExecutiveSummary.tsx              ← VP-level readiness card
│   ├── DomainTab.tsx                     ← Reusable domain template
│   ├── ItemDetailPanel.tsx               ← Slide-over with full details
│   ├── RiskRegister.tsx                  ← Risk inventory table
│   ├── EffortEstimation.tsx              ← Effort breakdown
│   ├── RiskBlockerCards.tsx              ← Top risks + blockers
│   ├── RunDelta.tsx                      ← Run comparison
│   └── visualizations/                   ← Treemap, Radar, Bubble charts
└── mocks/assessment-mock-data.ts         ← 694 items, 47 risks, full org data
```

**What the UI already displays:**

- Executive summary with readiness level
- 9 domain tabs (Products, Pricing, Rules, Code, Integrations, Amendments, Approvals, Documents, Data)
- Per-domain item tables with complexity, migration status, RCA target
- Item detail panel with AI description, CPQ→RCA mapping, dependencies
- Risk register with severity heatmap
- Effort estimation by domain
- Run history with delta tracking
- Org health indicators
- Full EN + HE translations

**What the UI needs to work for real:**

- Replace mock data with real API calls
- Connect "Run Assessment" button to trigger endpoint
- Show live progress during extraction
- Load real summaries/findings after completion

---

## 4. What's Missing (The Gap)

```mermaid
graph TB
    subgraph "✅ Built"
        A[Worker Framework]
        B[SF API Client Stack]
        C[Database Schema]
        D[Assessment Dashboard UI]
        E[Mock Data Types]
    end

    subgraph "🔴 Missing: The Bridge"
        F[Collector Extraction Logic<br/>SOQL queries + metrics]
        G[Data Transformation<br/>findings → UI format]
        H[API Wiring<br/>endpoints → DB queries]
        I[Trigger Integration<br/>button → Cloud Run]
    end

    subgraph "⚪ Future"
        J[GCP Deployment]
        K[LLM Analysis Engine]
        L[Human Review Workflow]
    end

    A --> F
    B --> F
    C --> G
    D --> H
    E --> G
    F --> G --> H --> I --> J
```

### The 4 Missing Pieces

**1. Collector Extraction Logic** (the biggest piece)

- Each of the 12 collector stubs has `execute() → TODO`
- Need to fill in: SOQL wishlists, query execution, result parsing, derived metrics, finding creation
- This is ~70% of remaining effort

**2. Data Transformation Layer**

- Extraction worker writes `assessment_findings` (our schema)
- UI reads `AssessmentItem` (mock data schema)
- Need a mapping layer: findings → domain data → UI format
- The mock data types (`AssessmentItem`, `DomainData`, `AssessmentRisk`) are the target format

**3. API Wiring**

- Assessment routes return 501 (not implemented)
- Need: DB queries for runs/findings/summaries, response formatting
- Need: trigger endpoint to create run + start Cloud Run job

**4. Trigger Integration**

- React hooks are placeholders (`useStartAssessmentRun` returns empty)
- Need: wire to real API, show progress, load results
- The progress UI and domain tabs already exist — just need real data

---

## 5. How Extraction Data Maps to the UI

This is critical to understand. The extraction worker produces data in one format; the UI expects another. Here's the mapping:

```mermaid
graph LR
    subgraph "Extraction Worker Output"
        AF[assessment_findings<br/>domain, artifactType,<br/>riskLevel, complexity,<br/>rcaTargetConcept]
        AS[assessment_summaries<br/>7 types: org_context,<br/>domain_summary, risk_inventory,<br/>mapping_context, etc.]
        CM[collector_metrics<br/>per-domain counts,<br/>coverage percentages]
    end

    subgraph "UI Data Format"
        AI[AssessmentItem<br/>name, complexity,<br/>migrationStatus, rcaTarget,<br/>aiDescription]
        DD[DomainData<br/>stats, items, insights,<br/>subTabs]
        AR[AssessmentRisk<br/>severity, likelihood,<br/>impact, mitigation]
    end

    AF -->|Transform| AI
    AS -->|Transform| DD
    AS -->|Transform| AR
    CM -->|Transform| DD
```

### Key Mapping Rules

| Worker Field                      | UI Field               | Transformation                                                                |
| --------------------------------- | ---------------------- | ----------------------------------------------------------------------------- |
| `finding.riskLevel`               | `item.complexity`      | critical/high → high, medium → moderate, low/info → low                       |
| `finding.rcaTargetConcept`        | `item.rcaTarget`       | Direct (e.g., "PricingProcedure")                                             |
| `finding.rcaMappingComplexity`    | `item.migrationStatus` | direct → auto, transform → guided, redesign → manual, no-equivalent → blocked |
| `finding.textValue`               | `item.aiDescription`   | v1: use source text; v2: LLM generates description                            |
| `finding.evidenceRefs`            | `item.dependencies`    | Extract referenced object/field names                                         |
| `summary.risk_inventory`          | `AssessmentRisk[]`     | Map severity, add mitigation text                                             |
| `summary.domain_summary`          | `DomainData.stats`     | Aggregate counts by migration status                                          |
| `summary.domain_summary.insights` | `DomainData.insights`  | Key observations per domain                                                   |

---

## 6. Step-by-Step Completion Guide

### Step 1: Get a Salesforce Sandbox Ready

**Who:** Daniel or Niv
**Time:** 1-2 hours
**Purpose:** Every collector needs a real Salesforce org to extract from

**What to do:**

1. Use the existing sandbox from Salesforce E2E tests (if CPQ is installed)
2. OR create a Salesforce Developer Org + install CPQ trial package
3. Ensure it has: 50+ products, some bundles, price rules, quotes from last 90 days
4. Verify the OAuth connection works via the existing "Connect Salesforce" flow in the UI

**How to verify:**

- Connect to the sandbox via the project workspace Overview page
- Run `pnpm test` in `e2e/` — the Salesforce connection E2E test should pass

---

### Step 2: Implement the Discovery Collector

**Who:** Developer (Daniel or Niv)
**Time:** 4-6 hours
**Purpose:** Discovery is the foundation — every other collector depends on its Describe cache

**What to do:**

1. Open `apps/worker/src/collectors/discovery.ts`
2. Implement the `execute()` method following the TODOs and Spec Section 4:
   - Query `Organization` object → store in `org_fingerprint`
   - Call `describeGlobal()` → detect SBQQ**, sbaa** namespaces
   - Validate required objects (~35 CPQ objects)
   - Batch Describes via Composite API (groups of 25)
   - Call `/limits/` → check thresholds
   - Detect CPQ version (3-step fallback)
   - COUNT() queries for data size estimation
3. Use `buildSafeQuery()` from the query builder for all SOQL
4. Create findings via `createFinding()` from the factory
5. Store Describe results in `ctx.describeCache` for downstream collectors

**How to test manually:**

```bash
# Start local DB
cd apps/worker && docker-compose up -d

# Create a test run record (use psql or any SQL client)
# INSERT INTO assessment_runs (id, project_id, org_id, connection_id, status)
# VALUES (uuid, ..., ..., ..., 'dispatched')

# Set up .env.local with real credentials
cp .env.example .env.local
# Fill in DATABASE_URL, SALESFORCE_TOKEN_ENCRYPTION_KEY, etc.

# Run the worker
JOB_ID=test RUN_ID=<uuid> pnpm worker:dev
```

**How to verify:**

- Worker logs show org fingerprint, object counts, CPQ version
- `assessment_runs.org_fingerprint` is populated in DB
- `assessment_runs.progress` shows discovery as "success"
- `collector_checkpoints` has a discovery row with status "success"

---

### Step 3: Implement Catalog + Pricing Collectors

**Who:** Can be parallelized (Niv does Catalog, Daniel does Pricing, or vice versa)
**Time:** 6-8 hours each
**Purpose:** These are Tier 0 — the core assessment value

**Catalog (`src/collectors/catalog.ts`):**

- Products query: all fields from spec Section 5.1 wishlist
- Features, Options, Constraints, Rules, Attributes
- Nested bundle depth detection
- All 15 derived metrics
- PSM candidate computation

**Pricing (`src/collectors/pricing.ts`):**

- Price Rules + Conditions + Actions chain
- Discount Schedules + Tiers
- Contracted Prices (Bulk API if >2000)
- QCP code extraction + regex analysis
- Lookup Queries + Data
- Context Definition Blueprint

**How to test:**

- Run worker against sandbox
- Check findings count per domain in DB
- Verify derived metrics in collector_metrics table
- Look at `text_value` for QCP scripts (should contain JavaScript source)

---

### Step 4: Implement Usage Collector

**Who:** Developer
**Time:** 6-8 hours
**Purpose:** Usage data (quotes, lines, trends) is the largest dataset and tests Bulk API

**What to do:**

- 90-day quotes via Bulk API 2.0
- 12-month aggregate trends via REST
- Quote Lines with full pricing waterfall
- Opportunity sync health check
- All 26 derived metrics

**This is the performance-critical collector** — verify:

- Bulk API polling works (5s → 15s → 30s cadence)
- CSV streaming doesn't OOM (monitor heap usage in logs)
- 50K+ records handled correctly

---

### Step 5: Wire the Pipeline End-to-End

**Who:** Developer
**Time:** 4-6 hours
**Purpose:** Run all collectors in sequence with tier gating

**What to do:**

1. Update `src/pipeline.ts` to instantiate real collectors (not just stubs)
2. Wire the `CollectorContext` with real Salesforce client instances
3. Test: Discovery → Catalog + Pricing + Usage (Tier 0 parallel) → gate → Tier 1/2
4. Verify: `assessment_runs.status` transitions correctly
5. Verify: summaries are written after normalization

---

### Step 6: Build the Data Transformation Layer

**Who:** Developer
**Time:** 4-6 hours
**Purpose:** Convert extraction findings into the UI's expected format

**What to do:**

1. Create `apps/server/src/services/assessment.service.ts`
2. Implement queries:
   - `getRunStatus(runId)` → run status + progress
   - `getRunSummaries(runId)` → 7 summary types
   - `getRunFindings(runId, domain)` → findings for a domain
   - `getRunRisks(runId)` → risk inventory
3. Implement transformation:
   - `findings → AssessmentItem[]` (map complexity, migrationStatus, rcaTarget)
   - `summaries → DomainData` (aggregate stats, insights)
   - `summaries → AssessmentRisk[]` (risk inventory)
4. Wire into the assessment API routes (replace 501 placeholders)

**This is the bridge between extraction and UI.** The mock data types in `assessment-mock-data.ts` are the contract — the service must produce data in exactly that shape.

---

### Step 7: Connect the UI to Real Data

**Who:** Developer (preferably someone familiar with the React codebase)
**Time:** 4-6 hours
**Purpose:** Replace mock data with real API calls

**What to do:**

1. Implement `use-assessment-run.ts` hooks (replace placeholders):
   - `useAssessmentRuns` → GET /assessment/runs
   - `useAssessmentRunStatus` → GET /assessment/runs/:id/status (5s poll)
   - `useStartAssessmentRun` → POST /assessment/run
2. Update `AssessmentPage.tsx` to use real hooks instead of mock data
3. Add "Run Assessment" trigger to the workspace (button + confirmation dialog)
4. Show real progress during extraction

**How to verify:**

- Open the project workspace in the browser
- Click "Run Assessment"
- Watch progress bar advance as collectors complete
- After completion, domain tabs show real data from the customer's Salesforce org

---

### Step 8: Deploy to Cloud Run

**Who:** Daniel (infrastructure)
**Time:** 2-4 hours
**Purpose:** Production deployment

**What to do:**

1. Create GCP project `revbrain-jobs`
2. Create Artifact Registry repository
3. Store secrets in Secret Manager (DATABASE_URL, SF encryption key, etc.)
4. Create Cloud Run Job definition
5. Wire the trigger service (Hono server → Cloud Run API)
6. Deploy the server with the assessment routes
7. Test end-to-end: UI → Server → Cloud Run → Salesforce → DB → UI

---

## 7. The Human-in-the-Loop Model

```mermaid
graph TB
    subgraph "Automated (Extraction Worker)"
        EX[Extract CPQ Data]
        MET[Compute Metrics]
        SUM[Generate Summaries]
        FIND[Create Findings]
    end

    subgraph "AI-Assisted (Future Analysis Engine)"
        DESC[Generate Descriptions]
        STRAT[Suggest Strategy]
        EST[Estimate Effort]
        RISK[Identify Risks]
    end

    subgraph "Human Review (Consultant)"
        REV[Review Findings]
        EDIT[Edit/Override]
        NOTE[Add Notes]
        APPROVE[Approve]
    end

    subgraph "Customer Deliverable"
        PUB[Published Report]
    end

    EX --> MET --> SUM --> FIND
    FIND --> DESC --> STRAT --> EST --> RISK
    RISK --> REV --> EDIT --> NOTE --> APPROVE --> PUB

    style EX fill:#4ade80
    style MET fill:#4ade80
    style SUM fill:#4ade80
    style FIND fill:#4ade80
    style DESC fill:#fbbf24
    style STRAT fill:#fbbf24
    style EST fill:#fbbf24
    style RISK fill:#fbbf24
    style REV fill:#60a5fa
    style EDIT fill:#60a5fa
    style NOTE fill:#60a5fa
    style APPROVE fill:#60a5fa
```

### What Each Layer Does

**Green (Automated — what we're building now):**

- Extracts raw data from Salesforce
- Computes deterministic metrics (counts, distributions, depths)
- Classifies items by complexity and migration path
- Detects structural risks (QCP, bundle nesting, field coupling)
- Produces structured findings with evidence

**Yellow (AI-Assisted — v1.1):**

- Reads structured findings + source code
- Generates human-readable descriptions ("This QCP implements tiered volume discounting")
- Suggests migration strategies per domain
- Estimates effort ranges
- Identifies hidden risks from cross-domain analysis

**Blue (Human Review — v2):**

- Consultant reviews AI-generated insights
- Edits risk levels, complexity assessments
- Adds customer-specific context
- Makes final migration recommendations
- Publishes the assessment for the customer

### Why This Model Works for Enterprise Sales

1. **Speed:** Automated extraction takes 10-60 minutes vs. days of manual analysis
2. **Consistency:** Every assessment follows the same methodology
3. **Depth:** Extracts data that manual analysis would miss (field coupling, code dependencies)
4. **Trust:** Human review ensures quality before customer sees it
5. **Scalability:** One consultant can review 5x more assessments when AI does the heavy lifting

### What the CEO Should Know

The assessment is NOT "AI does everything." It's:

- **Machine extracts** (fast, thorough, no human error)
- **AI interprets** (finds patterns, suggests strategies)
- **Human decides** (validates, adds context, takes responsibility)

This positions RevBrain as an **AI-augmented consulting tool**, not a black box. Customers trust it because a human expert reviews everything before they see it.

---

## 8. Timeline Estimate

| Phase                         | Effort   | Who        | Elapsed              |
| ----------------------------- | -------- | ---------- | -------------------- |
| Salesforce sandbox setup      | 2h       | Daniel     | Day 1                |
| Discovery collector           | 6h       | Niv        | Day 1-2              |
| Catalog collector             | 8h       | Niv        | Day 2-3              |
| Pricing collector             | 8h       | Daniel     | Day 2-3              |
| Usage collector               | 8h       | Niv        | Day 3-4              |
| Remaining Tier 1/2 collectors | 16h      | Both       | Day 4-6              |
| Pipeline wiring               | 6h       | Daniel     | Day 6-7              |
| Data transformation           | 6h       | Niv        | Day 7-8              |
| UI connection                 | 6h       | Daniel     | Day 8-9              |
| Cloud Run deployment          | 4h       | Daniel     | Day 9-10             |
| **Total**                     | **~70h** | **2 devs** | **~10 working days** |

This gets us to: **customer connects Salesforce → clicks Run → sees real assessment data in the dashboard.**

LLM analysis (v1.1) and human review workflow (v2) are separate initiatives that build on this foundation.

---

## 9. Reference Documents

| Document                                                                       | Purpose                                                                           |
| ------------------------------------------------------------------------------ | --------------------------------------------------------------------------------- |
| [CPQ-DATA-EXTRACTION-SPEC.md](CPQ-DATA-EXTRACTION-SPEC.md)                     | What to extract from Salesforce (field wishlists, derived metrics, SOQL patterns) |
| [CPQ-EXTRACTION-JOB-ARCHITECTURE.md](CPQ-EXTRACTION-JOB-ARCHITECTURE.md)       | How the job runs (Cloud Run, lease model, state machine, security)                |
| [CPQ-EXTRACTION-IMPLEMENTATION-PLAN.md](CPQ-EXTRACTION-IMPLEMENTATION-PLAN.md) | Task-by-task plan (54 tasks, track record, audit history)                         |
| [CPQ-EXTRACTION-PLAN-AUDIT-HISTORY.md](CPQ-EXTRACTION-PLAN-AUDIT-HISTORY.md)   | Full audit trail from 5 review rounds                                             |
