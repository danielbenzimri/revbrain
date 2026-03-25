# CPQ Extraction Job — Architecture & Infrastructure

> **Purpose:** Define the software architecture for the CPQ data extraction job — how it's triggered, where it runs, how it processes data, and how results flow back. This is the bridge between the Data Extraction Spec (what to pull) and the Implementation Plan (how to build it).
>
> **Date:** 2026-03-25
> **Version:** 1.2
> **Authors:** Daniel + Claude
> **Status:** Build-ready (Auditor 1: A-; Auditor 2: A- / 91/100)
>
> **Audit History:**
> - v1.0-draft (2026-03-25): Initial specification
> - v1.1 (2026-03-25): Incorporated all critical + significant findings from two audits
> - v1.2 (2026-03-25): Final precision fixes per v1.1 audit — IAM separation, lease CAS semantics, SIGTERM exit codes, RLS denormalization + UPDATE policies, state machine trigger, parameterized timeouts, AbortSignal propagation, collector-provenance writes, platform concurrency, preflight-only spec, local dev story
>
> **Related documents:**
> - [CPQ-DATA-EXTRACTION-SPEC.md](CPQ-DATA-EXTRACTION-SPEC.md) — What data to extract (v2.2, build-ready)
> - [SALESFORCE-CONNECTION-PLAN.md](SALESFORCE-CONNECTION-PLAN.md) — OAuth + token management (implemented)
> - [ARCHITECTURE.md](ARCHITECTURE.md) — RevBrain system architecture

---

## Table of Contents

1. [Problem Statement](#1-problem-statement)
2. [Architecture Constraint: Supabase Control Plane + Cloud Compute](#2-architecture-constraint)
3. [Run State Machine](#3-run-state-machine)
4. [Job Lifecycle](#4-job-lifecycle)
5. [Option Analysis: GCP vs AWS](#5-option-analysis-gcp-vs-aws)
6. [Recommended Architecture: GCP Cloud Run Jobs](#6-recommended-architecture-gcp-cloud-run-jobs)
7. [Alternative Architecture: AWS ECS Fargate](#7-alternative-architecture-aws-ecs-fargate)
8. [Job Runtime Design](#8-job-runtime-design)
9. [Data Flow & Storage](#9-data-flow--storage)
10. [Salesforce API Client Design](#10-salesforce-api-client-design)
11. [Parallelism & Collector Orchestration](#11-parallelism--collector-orchestration)
12. [Preparing Data for LLM Ingestion](#12-preparing-data-for-llm-ingestion)
13. [Security & IAM](#13-security--iam)
14. [Data Governance & Compliance](#14-data-governance--compliance)
15. [Cost Analysis](#15-cost-analysis)
16. [Observability & SLOs](#16-observability--slos)
17. [Failure Modes & Recovery](#17-failure-modes--recovery)
18. [Decision Matrix](#18-decision-matrix)
19. [Implementation Approach](#19-implementation-approach)
20. [Open Questions](#20-open-questions)

---

## 1. Problem Statement

RevBrain needs to extract CPQ configuration + usage data from a customer's Salesforce org, process it, and produce a structured assessment. The extraction spec defines 11 collectors that make 50-70 REST calls, 4-12 Bulk API 2.0 jobs, and 14-28 Tooling/Metadata API calls. Total runtime: 10-60 minutes depending on org size.

**Why this can't run on the existing infrastructure:**

| Concern | Supabase Edge Functions | Dedicated Cloud Job |
|---------|------------------------|---------------------|
| **Max execution time** | 150 seconds (hard limit) | Configurable (up to 24h on Cloud Run, practical limit ~2h) |
| **Memory** | 150MB | Configurable (2-8 GB) |
| **Concurrent connections** | Shared cold-start pool | Dedicated per job |
| **Bulk API polling** | Can't sustain async polling cycles | Natural fit for async poll loops |
| **CPU for data processing** | Throttled | Dedicated vCPUs |
| **Cost model** | Per-invocation (expensive for long jobs) | Per-second compute (cheap for batch) |
| **Checkpointing** | No persistent state | Write checkpoints to DB/storage |

**What we need:** A containerized job that runs for 10-60 minutes, makes hundreds of API calls, processes megabytes of CSV data, writes results to PostgreSQL, and then terminates.

---

## 2. Architecture Constraint

> **Design principle:** Supabase is the control plane. Cloud (GCP/AWS) is the compute plane. The job is a stateless worker that reads credentials from its platform's secret injection and writes results back to Supabase.

```
┌─────────────────────────────────────────────────────────────────┐
│                        SUPABASE (Control Plane)                  │
│                                                                  │
│  ┌──────────┐   ┌────────────┐   ┌─────────────────────────┐   │
│  │ Client   │   │ Edge Fn    │   │ PostgreSQL              │   │
│  │ (React)  │──▶│ (Hono API) │──▶│ · assessment_runs       │   │
│  │          │   │            │   │ · salesforce_connections │   │
│  │          │   │            │   │ · assessment_findings    │   │
│  │          │   │            │   │ · collector_metrics      │   │
│  └──────────┘   └─────┬──────┘   └───────────▲─────────────┘   │
│                        │ trigger               │ write results   │
│                        │                       │                 │
│  ┌─────────────────────▼───────────────────────┼─────────────┐  │
│  │                 Supabase Storage                           │  │
│  │  · Raw extraction snapshots (CSV/JSON, compressed)        │  │
│  │  · Generated PDFs                                         │  │
│  └───────────────────────────────────────────────────────────┘  │
└──────────────────────────┬─────────────────────▲────────────────┘
                           │                     │
                    trigger │              results│
                    (HTTP)  │              (DB)   │
                           │                     │
┌──────────────────────────▼─────────────────────┼────────────────┐
│                   CLOUD COMPUTE (GCP / AWS)                      │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  Extraction Job Container                                 │   │
│  │                                                           │   │
│  │  Secrets: from Secret Manager (DATABASE_URL, SF keys)     │   │
│  │                                                           │   │
│  │  1. Read job config from Supabase DB (via DATABASE_URL)   │   │
│  │  2. Claim run via lease (heartbeat begins)                │   │
│  │  3. Decrypt Salesforce tokens in-memory                   │   │
│  │  4. Run Discovery → 11 Collectors (parallel)              │   │
│  │  5. Normalize → Assessment Graph                          │   │
│  │  6. Prepare structured summaries for LLM                  │   │
│  │  7. Write results to Supabase DB + Storage                │   │
│  │  8. Release lease, mark complete                          │   │
│  │  9. Container terminates                                  │   │
│  │                                                           │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

**Key architectural decisions:**

1. **Job is triggered by Supabase, runs on cloud compute.** The Edge Function creates a run record, then triggers the cloud job via HTTP. The trigger body contains **only `{ jobId, runId }`** — no secrets, no database URLs.
2. **Secrets injected by cloud platform, not passed in requests.** `DATABASE_URL` and `SALESFORCE_TOKEN_ENCRYPTION_KEY` are injected from Secret Manager as environment variables at container startup. No shared static secrets — the cloud IAM identity of the container *is* the authentication.
3. **Worker claims run via lease.** On startup, the worker atomically claims the run record with a lease (worker ID + expiry). Heartbeats renew the lease. Only the lease owner can update run state. This prevents duplicate workers.
4. **Results write back to Supabase.** Structured findings go to PostgreSQL tables. Raw extraction snapshots go to Supabase Storage (S3-compatible), compressed (gzip).
5. **The job is resumable.** All state is in the database. If the container crashes, a new one resumes from the last checkpoint after the lease expires.
6. **Same TypeScript codebase.** The job runs the same Drizzle ORM, same `@revbrain/contract` types as the server. No language boundary.

---

## 3. Run State Machine

> **Audit fix (Auditor 1 #A, Auditor 2 #7):** Formalize all valid states and transitions. No implicit state changes.

```
                 ┌──────────────────────────────────────────┐
                 │                                          │
   User clicks   ▼                                          │
   "Run"    ┌─────────┐   Edge Fn       ┌─────────────┐   │
  ─────────▶│ queued   │───dispatches───▶│ dispatched   │   │
            └─────────┘                  └──────┬──────┘   │
                 │                               │          │
                 │ User cancels                  │ Worker   │
                 ▼                               │ claims   │
            ┌─────────────┐                      │ lease    │
            │ cancelled    │                      ▼          │
            └─────────────┘               ┌─────────┐      │
                 ▲                        │ running  │──────┘
                 │ User cancels           └────┬─────┘  heartbeat
                 │ or lease expired            │        timeout
                 │                    ┌────────┼────────┐
                 │                    │        │        │
                 │                    ▼        ▼        ▼
            ┌────┴────┐     ┌─────────┐ ┌──────────┐ ┌──────┐
            │cancel_   │     │completed│ │completed │ │failed│
            │requested │     │         │ │_warnings │ │      │
            └─────────┘     └─────────┘ └──────────┘ └──────┘
```

**Status definitions:**

| Status | Meaning | Who Sets It | Next States |
|--------|---------|-------------|-------------|
| `queued` | Run created, waiting for dispatch | Edge Function | `dispatched`, `cancelled` |
| `dispatched` | Cloud job triggered, container starting | Edge Function | `running`, `failed` (if container never starts) |
| `running` | Worker claimed lease, extraction in progress | Worker | `completed`, `completed_warnings`, `failed`, `cancel_requested` |
| `completed` | All collectors succeeded, full data available | Worker | (terminal) |
| `completed_warnings` | Completed but some collectors partial/failed (Tier 1/2 only) | Worker | (terminal) |
| `failed` | Fatal error or all retries exhausted | Worker or lease sweeper | (terminal) |
| `cancel_requested` | User requested cancellation, worker will stop at next checkpoint | User via Edge Function | `cancelled` |
| `cancelled` | Worker acknowledged cancellation and stopped | Worker or lease sweeper | (terminal) |

**Transition rules:**
- Only the lease owner (worker) can transition FROM `running` — all updates use `WHERE worker_id = $self` (compare-and-set)
- The lease sweeper can transition `running` → `failed` ONLY if `lease_expires_at < NOW()`
- The Edge Function can transition `queued`/`dispatched` → `cancelled` or `running` → `cancel_requested`
- Terminal states (`completed`, `completed_warnings`, `failed`, `cancelled`) cannot be changed — enforced by a DB trigger (see Section 9.2)
- All state transitions are logged in `run_attempts` for postmortem analysis

### 3.1 Lease Configuration

| Parameter | Value | Rationale |
|-----------|-------|-----------|
| **Lease duration** | 90 seconds | 3× heartbeat interval — tolerates 2 missed heartbeats |
| **Heartbeat interval** | 30 seconds | Renews `lease_expires_at` to `NOW() + 90s` each cycle |
| **Sweeper interval** | 2 minutes (pg_cron) | Checks for expired leases |
| **Worst-case detection** | ~3.5 minutes | Lease expiry (90s) + sweeper interval (120s) |

This meets the 5-minute SLO for hung job detection (Section 16.2).

### 3.2 Lease Compare-and-Set Semantics

All lease operations are conditional to prevent races:

```sql
-- Claim: only if unclaimed or expired
UPDATE assessment_runs
SET worker_id = $worker_id, lease_expires_at = NOW() + INTERVAL '90 seconds',
    status = 'running', started_at = NOW(), last_heartbeat_at = NOW()
WHERE id = $run_id
  AND status = 'dispatched'
  AND (worker_id IS NULL OR lease_expires_at < NOW());

-- Renew: only if still the owner
UPDATE assessment_runs
SET lease_expires_at = NOW() + INTERVAL '90 seconds', last_heartbeat_at = NOW(),
    progress = $progress
WHERE id = $run_id AND worker_id = $worker_id;

-- Release: only if still the owner
UPDATE assessment_runs
SET worker_id = NULL, lease_expires_at = NULL, status = $final_status,
    completed_at = NOW(), duration_ms = $duration
WHERE id = $run_id AND worker_id = $worker_id;

-- Sweeper: only expired leases
UPDATE assessment_runs
SET status = 'failed', status_reason = 'heartbeat_timeout', failed_at = NOW()
WHERE status = 'running' AND lease_expires_at < NOW();
```

---

## 4. Job Lifecycle

```
User clicks "Run Assessment"
        │
        ▼
┌─ Edge Function (Hono) ──────────────────────────────────────┐
│  1. Validate: project access, connection active              │
│  2. Check no active run (via unique partial index)           │
│  3. Create assessment_runs record (status: 'queued')         │
│  4. Trigger cloud job (HTTP POST to Cloud Run / ECS)         │
│     Body: { jobId, runId } — NO secrets in body              │
│  5. Update status: 'dispatched'                              │
│  6. Return runId to client (202 Accepted)                    │
└──────────────────────────────────────────────────────────────┘
        │
        ▼
┌─ Cloud Job Container ───────────────────────────────────────┐
│  7. Start: read DATABASE_URL from Secret Manager env var     │
│  8. Read job config from assessment_runs table               │
│  9. Claim run: set worker_id + lease_expires_at atomically   │
│     (fail if already claimed and lease not expired)          │
│ 10. Register SIGTERM handler for graceful shutdown           │
│ 11. Start heartbeat loop (every 30s, renew lease)           │
│ 12. Read Salesforce connection + decrypt tokens in-memory    │
│ 13. Run preflight checks (extraction spec Section 4)         │
│ 14. Run collectors (parallel, with per-collector timeouts)   │
│     - Check cancellation flag between collectors             │
│     - Each collector: extract → normalize → write (txn)      │
│     - Each collector writes checkpoint on completion          │
│     - Progress updates every 30s with heartbeat              │
│ 15. Post-extraction validation                               │
│ 16. Structured summary preparation (for downstream LLM)      │
│ 17. Determine final status (completed vs completed_warnings) │
│ 18. Release lease, update final status                       │
│ 19. Container exits (0)                                      │
└──────────────────────────────────────────────────────────────┘
        │
        ▼
┌─ Client (React) ────────────────────────────────────────────┐
│ 20. Polls /assessment/runs/:runId/status every 5 seconds     │
│ 21. Progress bar updates per-collector from progress JSONB   │
│ 22. On terminal status: load assessment dashboard from DB    │
└──────────────────────────────────────────────────────────────┘
```

**Progress reporting:** The worker updates `assessment_runs.progress` with each heartbeat:

```json
{
  "phase": "extraction",
  "collectors": {
    "discovery": { "status": "success", "duration_ms": 3200, "records": 42 },
    "catalog": { "status": "running", "records": 142, "substep": "products" },
    "pricing": { "status": "pending" },
    "templates": { "status": "pending" }
  },
  "api_calls_used": 47,
  "started_at": "2026-03-25T10:00:00Z"
}
```

---

## 5. Option Analysis: GCP vs AWS

### 5.1 Comparison Matrix

| Criteria | GCP Cloud Run Jobs | AWS ECS Fargate |
|----------|-------------------|-----------------|
| **Max runtime** | 24 hours | Unlimited (practical: hours) |
| **Startup time** | ~5-15 seconds | ~30-60 seconds |
| **Memory range** | 512 MB - 32 GB | 512 MB - 30 GB |
| **vCPU options** | 1, 2, 4, 8 | 0.25 - 16 |
| **Pricing** | Per-second (while running only) | Per-second (while running only) |
| **Container registry** | Artifact Registry (included) | ECR (~$0.10/GB/month) |
| **Trigger** | HTTP / Pub/Sub | RunTask API / EventBridge |
| **Setup complexity** | Low (YAML + gcloud) | Medium (cluster + task def + VPC + IAM) |
| **Auth from Edge Fn** | Workload Identity Federation or SA key | IAM credentials or assumed role |
| **Networking** | VPC Connector optional (add for static IP) | VPC + Security Groups required |
| **Secrets** | Secret Manager | Secrets Manager |
| **Logging** | Cloud Logging (auto) | CloudWatch (auto) |
| **IAM ergonomics** | Good (Workload Identity Federation) | Good (IAM roles for tasks) |

> **Note:** Verify current cloud quotas and platform limits before implementation. Stated values are approximate and subject to change.

### 5.2 Why Not Lambda / Step Functions

The extraction job is a single logical unit running 10-60 minutes. Lambda's 15-minute limit forces artificial splitting into chained invocations with state serialization — adding orchestration complexity without benefit. Cloud Run Jobs / ECS Fargate treat this as what it is: a single batch job.

### 5.3 Network Topology

Supabase runs on AWS. The job connects to:
1. **Supabase PostgreSQL** (AWS) — If job runs on AWS same region, intra-AWS (fast, free egress). If GCP, cross-cloud (+5-10ms latency per query, negligible for this workload).
2. **Salesforce APIs** — Internet regardless of cloud choice. Salesforce response time (200-2000ms) dominates.

### 5.4 IP Egress Consideration

> **Audit fix (Auditor 2 #9):** Cloud Run containers get ephemeral IPs. If a customer's Salesforce org has IP allowlisting, the job will be blocked.

**Mitigation:** For customers with IP restrictions, provision a Cloud NAT with a static IP and route the Cloud Run service through a VPC connector. Budget ~$30/month for Cloud NAT if needed. Add to customer onboarding checklist: "Does your Salesforce org have IP allowlisting enabled?"

---

## 6. Recommended Architecture: GCP Cloud Run Jobs

> **Recommendation:** Start with GCP Cloud Run Jobs for simplicity. The application code is portable (same Docker container runs on ECS); operational integration (IAM, triggers, logging, secrets) requires work to switch but is well-documented.

### 6.1 Infrastructure

```
┌─ GCP Project: revbrain-jobs ─────────────────────────────────┐
│                                                               │
│  ┌─ Artifact Registry ─┐   ┌─ Cloud Run Job ──────────────┐ │
│  │ revbrain/extractor   │   │ cpq-extraction               │ │
│  │ :v1.0.0-abc123       │──▶│ Memory: 2 GB                 │ │
│  │ (semver + git SHA)   │   │ vCPU: 2                      │ │
│  └──────────────────────┘   │ Timeout: 3600s (1 hour)      │ │
│                              │ Max retries: 1               │ │
│  ┌─ Secret Manager ────┐   │ Task count: 1                 │ │
│  │ supabase-db-url      │   │ Env: from Secret Manager     │ │
│  │ sf-encryption-key    │   └──────────────────────────────┘ │
│  └──────────────────────┘                                     │
│                              ┌─ Cloud Logging ──────────────┐ │
│  ┌─ IAM ────────────────┐   │ Structured JSON logs          │ │
│  │ SA: extractor@...    │   │ Auto-captured from stdout     │ │
│  │ Role: run.developer  │   └──────────────────────────────┘ │
│  │ + secretmanager.     │                                     │
│  │   secretAccessor     │   ┌─ VPC Connector (optional) ───┐ │
│  └──────────────────────┘   │ For static IP egress          │ │
│                              │ (only if SF IP allowlisting)  │ │
│                              └──────────────────────────────┘ │
└───────────────────────────────────────────────────────────────┘
```

### 6.2 Job Trigger

> **Audit fix (Auditor 1 #1, Auditor 2 #1):** Remove all secrets from trigger body. Use Workload Identity Federation or short-lived tokens instead of static SA keys where possible.

The Edge Function triggers the job via the Cloud Run Jobs API:

```typescript
async function triggerExtractionJob(runId: string, jobId: string) {
  // Obtain short-lived access token
  // Preferred: Workload Identity Federation (no static key)
  // Fallback: Service account key stored in Supabase secrets
  const token = await getGCPAccessToken();

  const response = await fetch(
    `https://${REGION}-run.googleapis.com/apis/run.googleapis.com/v1/namespaces/${PROJECT_ID}/jobs/${JOB_NAME}:run`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        overrides: {
          containerOverrides: [{
            env: [
              { name: 'JOB_ID', value: jobId },
              { name: 'RUN_ID', value: runId },
              // NO DATABASE_URL, NO secrets — injected via Secret Manager
            ],
          }],
        },
      }),
    }
  );

  // Capture provider execution ID for traceability
  const executionId = response.headers.get('x-goog-execution-id');
  await db.update(assessmentRuns)
    .set({ providerExecutionId: executionId, status: 'dispatched' })
    .where(eq(assessmentRuns.id, runId));
}
```

**IAM requirements — two separate principals:**

> **Audit fix (v1.2, Auditor 1 #1):** Separate trigger caller identity from runtime identity.

| Principal | Identity | Roles | Purpose |
|-----------|----------|-------|---------|
| **Trigger caller** | SA used by Edge Function (or Workload Identity Federation) | Custom role with `run.jobs.run` + `run.executions.get` | Only needs to *start* job executions and check status |
| **Runtime SA** | `extractor@revbrain-jobs.iam.gserviceaccount.com` (attached to Cloud Run Job) | `roles/secretmanager.secretAccessor` | Only needs to read secrets at startup. No job-management permissions. |

The runtime SA does NOT have `roles/run.developer` — it doesn't need to manage jobs, only run inside one.

### 6.3 Container Specification

> **Audit fix (Auditor 1 #15, Auditor 2 #11):** Multi-stage build, non-root user, layer caching, pinned versions.

```dockerfile
# Build stage
FROM node:20.11-slim AS builder
WORKDIR /app

# Copy dependency manifests first (layer caching)
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/contract/package.json packages/contract/
COPY packages/database/package.json packages/database/
COPY apps/worker/package.json apps/worker/

RUN corepack enable && pnpm install --frozen-lockfile

# Copy source and build
COPY packages/contract/ packages/contract/
COPY packages/database/ packages/database/
COPY apps/worker/ apps/worker/
RUN pnpm --filter @revbrain/worker build

# Prune dev dependencies
RUN pnpm --filter @revbrain/worker deploy --prod /app/pruned

# Runtime stage
FROM node:20.11-slim AS runtime

RUN addgroup --system appgroup && adduser --system --ingroup appgroup appuser

WORKDIR /app
COPY --from=builder /app/pruned/dist ./dist
COPY --from=builder /app/pruned/node_modules ./node_modules

USER appuser

CMD ["node", "dist/main.js"]
```

### 6.4 Cloud Run Job Definition

```yaml
apiVersion: run.googleapis.com/v1
kind: Job
metadata:
  name: cpq-extraction
spec:
  template:
    spec:
      taskCount: 1
      template:
        spec:
          serviceAccountName: extractor@revbrain-jobs.iam.gserviceaccount.com
          containers:
            - image: us-docker.pkg.dev/revbrain-jobs/revbrain/extractor:v1.0.0-abc123
              resources:
                limits:
                  memory: 2Gi
                  cpu: "2"
              env:
                - name: DATABASE_URL
                  valueFrom:
                    secretKeyRef:
                      name: supabase-db-url
                      key: latest
                - name: SALESFORCE_TOKEN_ENCRYPTION_KEY
                  valueFrom:
                    secretKeyRef:
                      name: sf-encryption-key
                      key: latest
                - name: SUPABASE_STORAGE_URL
                  valueFrom:
                    secretKeyRef:
                      name: supabase-storage-url
                      key: latest
          timeoutSeconds: 3600
          maxRetries: 1
```

> **Note:** Never use `:latest` in production. Use `semver-gitSHA` tags (e.g., `v1.0.0-abc123`). Rollback = update job to previous image tag.

---

## 7. Alternative Architecture: AWS ECS Fargate

If AWS is preferred (co-located with Supabase infrastructure):

**Additional setup vs Cloud Run:**
- ECS Cluster (even if empty — Fargate is serverless within it)
- Task Definition (container spec)
- VPC + Subnet + Security Group (for outbound internet to Salesforce)
- IAM Role for task execution + task role
- ECR repository for container images

**Trigger:**

```typescript
import { ECSClient, RunTaskCommand } from '@aws-sdk/client-ecs';

async function triggerExtractionJob(runId: string, jobId: string) {
  const ecs = new ECSClient({ region: REGION });
  await ecs.send(new RunTaskCommand({
    cluster: 'revbrain-jobs',
    taskDefinition: 'cpq-extraction',
    launchType: 'FARGATE',
    networkConfiguration: {
      awsvpcConfiguration: {
        subnets: [SUBNET_ID],
        assignPublicIp: 'ENABLED',
      },
    },
    overrides: {
      containerOverrides: [{
        name: 'extractor',
        environment: [
          { name: 'JOB_ID', value: jobId },
          { name: 'RUN_ID', value: runId },
        ],
      }],
    },
  }));
}
```

More setup than Cloud Run but well-documented and one-time.

---

## 8. Job Runtime Design

### 8.1 Package Structure

```
apps/worker/
├── src/
│   ├── main.ts                    # Entry point: config, lease, SIGTERM, pipeline
│   ├── pipeline.ts                # Orchestrator: discovery → collectors → normalize
│   ├── config.ts                  # Job configuration from env + DB
│   │
│   ├── salesforce/
│   │   ├── client.ts              # Unified SF REST/Bulk/Tooling/Metadata client
│   │   ├── auth.ts                # Token decryption + single-flight refresh
│   │   ├── bulk-query.ts          # Bulk API 2.0 lifecycle management
│   │   ├── composite-batch.ts     # Composite Batch API wrapper
│   │   ├── query-builder.ts       # Dynamic SOQL construction
│   │   ├── throttle.ts            # Adaptive rate limiter with jitter
│   │   └── circuit-breaker.ts     # Circuit breaker for SF endpoints
│   │
│   ├── collectors/
│   │   ├── base.ts                # Base collector: timeout, cancellation, checkpoint
│   │   ├── discovery.ts           # Org fingerprint, describes, limits
│   │   ├── catalog.ts             # Products, bundles, options, rules
│   │   ├── pricing.ts             # Price rules, discounts, QCP, lookups
│   │   ├── templates.ts           # Quote templates, merge fields
│   │   ├── approvals.ts           # Approval processes, sbaa__
│   │   ├── customizations.ts      # Custom fields, __mdt, validation rules
│   │   ├── dependencies.ts        # Apex, flows, triggers
│   │   ├── integrations.ts        # Named creds, platform events
│   │   ├── usage.ts               # 90-day quotes, lines, trends
│   │   ├── order-lifecycle.ts     # Orders, contracts, assets
│   │   ├── localization.ts        # Translations, custom labels
│   │   └── settings.ts            # CPQ package settings
│   │
│   ├── normalize/
│   │   ├── assessment-graph.ts    # Build findings + relationships
│   │   ├── metrics.ts             # Derived metrics per collector
│   │   ├── validation.ts          # Post-extraction integrity checks
│   │   └── context-blueprint.ts   # Context Definition field inventory
│   │
│   ├── llm-prep/
│   │   ├── summarizer.ts          # Structured JSON summaries from findings
│   │   └── schemas.ts             # Output schemas
│   │
│   ├── lease.ts                   # Lease claim + heartbeat + renewal
│   ├── progress.ts                # Progress reporter
│   └── checkpoint.ts              # Checkpoint read/write for resume
│
├── Dockerfile
├── .dockerignore
├── package.json
├── tsconfig.json
└── vitest.config.ts
```

### 8.2 Entry Point with SIGTERM Handling

> **Audit fix (Auditor 2 #4):** Cloud Run sends SIGTERM 10s before kill. Must handle gracefully.

```typescript
// apps/worker/src/main.ts
import { initDB } from '@revbrain/database';
import { loadJobConfig } from './config.ts';
import { runPipeline } from './pipeline.ts';
import { LeaseManager } from './lease.ts';
import { ProgressReporter } from './progress.ts';

let shuttingDown = false;

async function main() {
  const jobId = process.env.JOB_ID!;
  const runId = process.env.RUN_ID!;
  if (!jobId || !runId) {
    console.error('JOB_ID and RUN_ID environment variables required');
    process.exit(1);
  }

  const db = initDB({
    max: 5,                 // Limited pool for worker
    idle_timeout: 20,
    connect_timeout: 10,
  });

  const lease = new LeaseManager(db, runId);
  const progress = new ProgressReporter(db, runId);

  // Graceful shutdown on SIGTERM
  // Cloud Run sends SIGTERM 10s before hard kill. ECS gives 30s.
  process.on('SIGTERM', async () => {
    logger.info('SIGTERM received, initiating graceful shutdown');
    shuttingDown = true;
    // Best-effort: flush current checkpoint so retry can resume
    try {
      await checkpoint.flush();
      // Don't release lease — let sweeper handle terminal state
      // if the DB write below fails, the lease expiry is the safety net
      await progress.markFailed(new Error('Container terminated by infrastructure (SIGTERM)'));
    } catch (e) {
      logger.error({ error: e.message }, 'Failed to persist shutdown state');
    }
    // Exit non-zero: tells Cloud Run this was not a clean completion
    // Cloud Run may auto-retry based on maxRetries setting
    process.exit(1);
  });

  try {
    // Claim lease (fails if another worker holds it)
    await lease.claim();

    const config = await loadJobConfig(db, jobId, runId);
    await progress.markRunning();

    // Start heartbeat loop (every 30s)
    lease.startHeartbeat(async () => {
      await progress.flush();
    });

    // Export shuttingDown check for collectors
    await runPipeline(config, db, progress, () => shuttingDown);

    const finalStatus = progress.hasWarnings() ? 'completed_warnings' : 'completed';
    await progress.markStatus(finalStatus);
    await lease.release();
    process.exit(0);
  } catch (error) {
    await progress.markFailed(error);
    await lease.release();
    process.exit(1);
  }
}

main();
```

### 8.3 DB Connection Strategy

> **Audit fix (Auditor 1 #D):** Worker needs connection discipline to not harm the primary DB.

| Setting | Value | Why |
|---------|-------|-----|
| `max` connections | 5 | Worker doesn't need many; leave pool room for other services |
| `idle_timeout` | 20s | Free connections quickly between collector phases |
| `connect_timeout` | 10s | Fail fast if DB unreachable |
| SSL | Required | Always encrypt transit |
| Retry on transient error | 3 attempts, 1s backoff | Handle momentary connectivity blips |

Use Supabase's connection pooler URL (transaction mode) — same as the Hono server uses.

**Transaction boundaries:** Each collector writes its findings, relationships, and metrics in a single transaction. If the write fails, the entire collector's output is rolled back cleanly.

### 8.4 Heartbeat Resilience

> **Audit fix (Auditor 2 #4):** A transient DB blip shouldn't kill a healthy extraction.

```typescript
async renewLease(): Promise<boolean> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const result = await this.db.update(assessmentRuns)
        .set({
          leaseExpiresAt: new Date(Date.now() + LEASE_DURATION_MS),
          lastHeartbeatAt: new Date(),
          progress: this.currentProgress,
        })
        .where(and(
          eq(assessmentRuns.id, this.runId),
          eq(assessmentRuns.workerId, this.workerId)  // CAS: only if still owner
        ))
        .returning({ workerId: assessmentRuns.workerId });

      if (result.length === 0) {
        // Lease was taken by another worker or sweeper already failed us
        logger.error('Lease lost — another worker or sweeper took ownership');
        return false;  // Caller should abort gracefully
      }
      return true;
    } catch (e) {
      logger.warn({ attempt, error: e.message }, 'heartbeat_retry');
      await sleep(2000 * (attempt + 1));
    }
  }
  logger.error('heartbeat_failed_all_retries — DB unreachable for ~10s');
  return false;  // Caller decides: continue optimistically or abort
}
```

If the heartbeat returns `false` (lease lost), the worker stops accepting new collector work and exits gracefully.

### 8.5 Local Development

> **Audit fix (Auditor 2 #8):** Developers need to run and test the worker locally without Cloud Run.

```bash
# Run worker locally against a dev Supabase + Salesforce sandbox
cd apps/worker
cp .env.example .env.local   # Fill in DATABASE_URL, SF keys, etc.

# Run directly (creates a test run record first)
JOB_ID=local-test RUN_ID=<uuid> pnpm dev

# Run in Docker (validates container build)
docker build -f Dockerfile -t revbrain-worker ../../
docker run --env-file .env.local -e JOB_ID=local-test -e RUN_ID=<uuid> revbrain-worker

# Unit tests (no external deps)
pnpm test

# Integration tests (requires DB + SF sandbox credentials)
pnpm test:integration
```

The worker package includes a `.env.example` with all required variables documented.

---

## 9. Data Flow & Storage

### 9.1 Where Data Lives

| Data Type | Storage | Retention |
|-----------|---------|-----------|
| **Assessment run records** | PostgreSQL (`assessment_runs`) | Permanent |
| **Collector checkpoints** | PostgreSQL (`collector_checkpoints`) | Deleted after run completes successfully |
| **Assessment findings** | PostgreSQL (`assessment_findings`) | Permanent (per run) |
| **Assessment relationships** | PostgreSQL (`assessment_relationships`) | Permanent (per run) |
| **Collector metrics** | PostgreSQL (`collector_metrics`) | Permanent (per run) |
| **Structured summaries** | PostgreSQL (`assessment_summaries`) | Permanent (per run) |
| **Raw extraction snapshots** | Supabase Storage (gzipped) | Configurable (default 60 days, enforced by cleanup job) |
| **Run execution history** | PostgreSQL (`run_attempts`) | Permanent (for support/debugging) |

### 9.2 Database Schema

> **Audit fixes applied:** Lease/heartbeat fields, versioning/provenance, RLS policies, concurrency guard, stronger checkpoint model, idempotency constraints, missing indexes, attempt tracking.

```sql
-- ============================================================
-- Assessment run tracking (with lease/heartbeat model)
-- ============================================================
CREATE TABLE assessment_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  connection_id UUID NOT NULL REFERENCES salesforce_connections(id),

  -- State machine (Section 3)
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued','dispatched','running','completed',
                      'completed_warnings','failed','cancel_requested','cancelled')),
  status_reason TEXT,                   -- Human-readable reason for current status

  -- Scope & config
  scope JSONB,                          -- Which collectors, custom objects, date range
  scope_hash TEXT,                      -- SHA256 of scope for dedup
  mode TEXT NOT NULL DEFAULT 'full'     -- 'full' | 'preflight_only'
    CHECK (mode IN ('full', 'preflight_only')),

  -- Progress (updated with heartbeat)
  progress JSONB DEFAULT '{}',
  org_fingerprint JSONB,

  -- Lease model (Audit fix: Auditor 1 #4)
  worker_id TEXT,                       -- Unique ID of claiming worker
  lease_expires_at TIMESTAMPTZ,         -- Lease expiry (renewed by heartbeat)
  last_heartbeat_at TIMESTAMPTZ,        -- Last heartbeat timestamp

  -- Provider tracking
  provider_execution_id TEXT,           -- Cloud Run execution ID / ECS task ARN

  -- Versioning / provenance (Audit fix: Auditor 1 #B)
  spec_version TEXT,                    -- Extraction spec version used
  worker_version TEXT,                  -- Worker container image tag / git SHA

  -- Lifecycle timestamps
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  cancel_requested_at TIMESTAMPTZ,

  -- Metrics
  duration_ms INTEGER,
  api_calls_used INTEGER DEFAULT 0,
  records_extracted INTEGER DEFAULT 0,
  completeness_pct INTEGER DEFAULT 0,   -- 0-100

  -- Audit
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),

  error TEXT
);

-- Prevent concurrent runs for same project (Audit fix: Auditor 2 #7)
CREATE UNIQUE INDEX idx_one_active_run_per_project
  ON assessment_runs (project_id)
  WHERE status IN ('queued', 'dispatched', 'running', 'cancel_requested');

-- For lease sweeper
CREATE INDEX idx_runs_lease ON assessment_runs (status, lease_expires_at)
  WHERE status = 'running';

-- For progress polling
CREATE INDEX idx_runs_project ON assessment_runs (project_id, created_at DESC);

-- ============================================================
-- Run attempts / execution history (Audit fix: Auditor 1 #C)
-- ============================================================
CREATE TABLE run_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES assessment_runs(id) ON DELETE CASCADE,
  attempt_no INTEGER NOT NULL DEFAULT 1,
  worker_id TEXT,
  provider_execution_id TEXT,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  exit_code INTEGER,
  exit_reason TEXT,                      -- 'success' | 'error' | 'timeout' | 'sigterm' | 'oom'
  infra_details JSONB,                   -- Cloud provider metadata
  UNIQUE(run_id, attempt_no)
);

-- ============================================================
-- Collector checkpoints (strengthened for substep resume)
-- ============================================================
CREATE TABLE collector_checkpoints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES assessment_runs(id) ON DELETE CASCADE,
  collector_name TEXT NOT NULL,
  criticality TEXT NOT NULL DEFAULT 'tier1'
    CHECK (criticality IN ('tier0', 'tier1', 'tier2')),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','running','success','partial','failed','skipped')),
  attempt_no INTEGER NOT NULL DEFAULT 1,
  -- Substep-level resume fields (Audit fix: Auditor 1 #2)
  phase TEXT,                           -- Current phase within collector
  substep TEXT,                         -- Current substep (e.g., 'products', 'features')
  cursor_json JSONB,                    -- Pagination cursor / next_records_url / bulk job state
  bulk_job_ids JSONB DEFAULT '[]',      -- Track SF Bulk API jobs for cleanup (Audit fix: Auditor 2 #10)
  -- Metrics
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  records_extracted INTEGER DEFAULT 0,
  warnings JSONB DEFAULT '[]',
  error TEXT,
  retry_count INTEGER DEFAULT 0,
  UNIQUE(run_id, collector_name)
);

-- ============================================================
-- Assessment findings (with idempotency constraint)
-- ============================================================
CREATE TABLE assessment_findings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES assessment_runs(id) ON DELETE CASCADE,
  domain TEXT NOT NULL,
  collector_name TEXT NOT NULL,          -- Which collector produced this (for provenance-based deletes)
  artifact_type TEXT NOT NULL,
  artifact_name TEXT NOT NULL,
  artifact_id TEXT,                     -- Salesforce record ID
  finding_key TEXT NOT NULL,            -- Deterministic business key for dedup (Audit fix v1.2: Auditor 1 #7)
  source_type TEXT NOT NULL,
  source_ref TEXT,
  detected BOOLEAN DEFAULT true,
  count_value INTEGER,
  text_value TEXT,
  usage_level TEXT,
  risk_level TEXT,
  complexity_level TEXT,
  migration_relevance TEXT,
  rca_target_concept TEXT,
  rca_mapping_complexity TEXT,
  evidence_refs JSONB DEFAULT '[]',
  notes TEXT,
  organization_id UUID NOT NULL,        -- Denormalized for RLS performance (Audit fix v1.2: Auditor 2 #1)
  schema_version TEXT DEFAULT '1.0',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_findings_run ON assessment_findings(run_id);
CREATE INDEX idx_findings_domain ON assessment_findings(run_id, domain);
CREATE INDEX idx_findings_collector ON assessment_findings(run_id, collector_name);
-- Idempotency via deterministic finding key (Audit fix v1.2: Auditor 1 #7)
-- finding_key examples: "pricing:price_rule:01q...:has_apex_dep", "catalog:product:01t...:bundle_depth"
CREATE UNIQUE INDEX idx_findings_dedup
  ON assessment_findings(run_id, finding_key)
  WHERE detected = true;

-- ============================================================
-- Dependency graph edges
-- ============================================================
CREATE TABLE assessment_relationships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES assessment_runs(id) ON DELETE CASCADE,
  source_finding_id UUID NOT NULL REFERENCES assessment_findings(id) ON DELETE CASCADE,
  target_finding_id UUID NOT NULL REFERENCES assessment_findings(id) ON DELETE CASCADE,
  relationship_type TEXT NOT NULL,
  description TEXT
);

-- Indexes for graph traversal (Audit fix: Auditor 2 #21)
CREATE INDEX idx_rel_source ON assessment_relationships(source_finding_id);
CREATE INDEX idx_rel_target ON assessment_relationships(target_finding_id);
CREATE INDEX idx_rel_run ON assessment_relationships(run_id);

-- ============================================================
-- Per-collector metrics
-- ============================================================
CREATE TABLE collector_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES assessment_runs(id) ON DELETE CASCADE,
  collector_name TEXT NOT NULL,
  domain TEXT NOT NULL,
  metrics JSONB NOT NULL DEFAULT '{}',
  warnings JSONB DEFAULT '[]',
  coverage INTEGER DEFAULT 0,
  collected_at TIMESTAMPTZ DEFAULT NOW(),
  duration_ms INTEGER,
  schema_version TEXT DEFAULT '1.0',
  UNIQUE(run_id, collector_name)
);

-- ============================================================
-- Structured summaries (canonical, reproducible from findings)
-- ============================================================
CREATE TABLE assessment_summaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES assessment_runs(id) ON DELETE CASCADE,
  summary_type TEXT NOT NULL,           -- 'domain_summary' | 'risk_inventory' | 'mapping_context' | 'org_context'
  domain TEXT,
  content JSONB NOT NULL,               -- Structured JSON (not free text)
  schema_version TEXT DEFAULT '1.0',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(run_id, summary_type, COALESCE(domain, '_global'))
);

CREATE INDEX idx_summaries_run ON assessment_summaries(run_id, summary_type);

-- ============================================================
-- Row-Level Security (Audit fix: Auditor 2 #6)
-- ============================================================
ALTER TABLE assessment_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE run_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE collector_checkpoints ENABLE ROW LEVEL SECURITY;
ALTER TABLE assessment_findings ENABLE ROW LEVEL SECURITY;
ALTER TABLE assessment_relationships ENABLE ROW LEVEL SECURITY;
ALTER TABLE collector_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE assessment_summaries ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- State machine enforcement trigger (Audit fix v1.2: Auditor 2 #5)
-- ============================================================
CREATE OR REPLACE FUNCTION enforce_run_state_machine()
RETURNS TRIGGER AS $$
DECLARE
  valid_transitions JSONB := '{
    "queued": ["dispatched", "cancelled"],
    "dispatched": ["running", "failed"],
    "running": ["completed", "completed_warnings", "failed", "cancel_requested"],
    "cancel_requested": ["cancelled", "failed"]
  }'::jsonb;
BEGIN
  IF OLD.status = NEW.status THEN RETURN NEW; END IF;
  IF OLD.status IN ('completed', 'completed_warnings', 'failed', 'cancelled') THEN
    RAISE EXCEPTION 'Cannot transition from terminal state %', OLD.status;
  END IF;
  IF NOT (valid_transitions -> OLD.status) ? NEW.status THEN
    RAISE EXCEPTION 'Invalid state transition: % → %', OLD.status, NEW.status;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_run_state_machine
BEFORE UPDATE OF status ON assessment_runs
FOR EACH ROW EXECUTE FUNCTION enforce_run_state_machine();

-- ============================================================
-- Row-Level Security (Audit fix v1.1 + v1.2)
-- ============================================================
ALTER TABLE assessment_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE run_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE collector_checkpoints ENABLE ROW LEVEL SECURITY;
ALTER TABLE assessment_findings ENABLE ROW LEVEL SECURITY;
ALTER TABLE assessment_relationships ENABLE ROW LEVEL SECURITY;
ALTER TABLE collector_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE assessment_summaries ENABLE ROW LEVEL SECURITY;

-- SELECT: users see only their org's data
CREATE POLICY "org_read" ON assessment_runs
  FOR SELECT USING (organization_id = (auth.jwt() ->> 'organization_id')::uuid);

-- UPDATE: users can only cancel runs in their org (Audit fix v1.2: Auditor 2 #2)
CREATE POLICY "org_cancel" ON assessment_runs
  FOR UPDATE USING (organization_id = (auth.jwt() ->> 'organization_id')::uuid)
  WITH CHECK (status = 'cancel_requested');

-- Findings: denormalized organization_id for direct RLS (Audit fix v1.2: Auditor 2 #1)
-- No correlated subquery — simple equality check, fast at any scale
CREATE POLICY "org_read" ON assessment_findings
  FOR SELECT USING (organization_id = (auth.jwt() ->> 'organization_id')::uuid);

-- Infrequently-queried child tables: subquery through parent is acceptable
CREATE POLICY "org_read" ON run_attempts
  FOR SELECT USING (run_id IN (
    SELECT id FROM assessment_runs
    WHERE organization_id = (auth.jwt() ->> 'organization_id')::uuid));

CREATE POLICY "org_read" ON collector_checkpoints
  FOR SELECT USING (run_id IN (
    SELECT id FROM assessment_runs
    WHERE organization_id = (auth.jwt() ->> 'organization_id')::uuid));

CREATE POLICY "org_read" ON assessment_relationships
  FOR SELECT USING (run_id IN (
    SELECT id FROM assessment_runs
    WHERE organization_id = (auth.jwt() ->> 'organization_id')::uuid));

CREATE POLICY "org_read" ON collector_metrics
  FOR SELECT USING (run_id IN (
    SELECT id FROM assessment_runs
    WHERE organization_id = (auth.jwt() ->> 'organization_id')::uuid));

CREATE POLICY "org_read" ON assessment_summaries
  FOR SELECT USING (run_id IN (
    SELECT id FROM assessment_runs
    WHERE organization_id = (auth.jwt() ->> 'organization_id')::uuid));

-- Worker uses service_role which bypasses RLS.
-- v1 risk acceptance: shared service_role for worker writes.
-- Required before GA: dedicated least-privilege DB role for worker.
```

### 9.3 Raw Snapshot Storage

Raw Salesforce API responses stored in Supabase Storage for evidence and debugging:

```
storage/
  assessment-runs/
    {runId}/
      manifest.json                 # File inventory with checksums
      raw/
        discovery/
          org-fingerprint.json
          describe-global.json.gz
          describes/
            Product2.json.gz
            SBQQ__Quote__c.json.gz
        catalog/
          Product2.csv.gz
          SBQQ__ProductOption__c.json.gz
        usage/
          SBQQ__Quote__c.csv.gz
          SBQQ__QuoteLine__c.csv.gz
```

> **Audit fix (Auditor 1 #10):** Compress large files (gzip). Write a manifest with checksums.

**Manifest format:**

```json
{
  "run_id": "...",
  "created_at": "2026-03-25T10:30:00Z",
  "worker_version": "v1.0.0-abc123",
  "files": [
    {
      "path": "raw/usage/SBQQ__Quote__c.csv.gz",
      "collector": "usage",
      "source_api": "bulk_v2",
      "row_count": 3421,
      "byte_size": 245000,
      "sha256": "abc123...",
      "content_type": "text/csv",
      "compressed": true
    }
  ]
}
```

### 9.4 Schema Migration Strategy

> **Audit fix (Auditor 2 #16):** New tables deployed via Drizzle migrations (same as existing schema). Run `pnpm db:generate` → `pnpm db:migrate` in CI/CD before deploying new worker versions.

**Migration strategy:**
- **Forward-only migrations preferred.** Destructive rollbacks are unsafe if data has been written in the new schema.
- **Rollback plan is migration-specific** — each migration must document whether it's safely reversible. Additive changes (new tables, new columns with defaults) are generally safe to leave in place while rolling back the worker image.
- **Worker must tolerate the previous schema version** during rollout windows (schema compatibility window). Deploy migration first, then new worker.
- **Worker image rollback** = update Cloud Run job to previous image tag. The old worker ignores new columns it doesn't know about.

### 9.5 Run Attempts Lifecycle

> **Audit fix (v1.2, Auditor 2 #9):** Clarify when attempt rows are created and updated.

1. **Worker creates `run_attempts` row** on startup, after reading config but before claiming lease. Sets `worker_id`, `started_at`, `attempt_no` (derived from `SELECT COUNT(*) + 1 FROM run_attempts WHERE run_id = $1`).
2. **Worker updates `ended_at`, `exit_code`, `exit_reason`** during graceful shutdown — both on success (`exit_reason = 'success'`, `exit_code = 0`) and on SIGTERM (`exit_reason = 'sigterm'`, `exit_code = 1`).
3. **If container is hard-killed** (OOM, hard timeout), the attempt row has `started_at` but no `ended_at`. The lease sweeper, when marking the run as failed, also closes the dangling attempt: `UPDATE run_attempts SET ended_at = NOW(), exit_reason = 'infrastructure_kill' WHERE run_id = $1 AND ended_at IS NULL`.

---

## 10. Salesforce API Client Design

### 10.1 Unified Client

```typescript
class SalesforceClient {
  private accessToken: string;
  private instanceUrl: string;
  private apiVersion: string;
  private throttle: AdaptiveThrottle;
  private circuitBreaker: CircuitBreaker;
  private refreshLock: Mutex;           // Single-flight token refresh

  // REST API
  async query(soql: string): Promise<QueryResult>;
  async queryAll(soql: string): Promise<Record[]>;     // auto-pagination
  async describe(objectName: string): Promise<DescribeResult>;
  async describeGlobal(): Promise<DescribeGlobalResult>;
  async limits(): Promise<LimitsResult>;

  // Composite Batch API
  async compositeBatch(requests: BatchRequest[]): Promise<BatchResponse[]>;
  async describeMultiple(objectNames: string[]): Promise<Map<string, DescribeResult>>;

  // Bulk API 2.0
  async createBulkQuery(soql: string): Promise<BulkJob>;
  async pollBulkJob(jobId: string, signal?: AbortSignal): Promise<BulkJobStatus>;
  async getBulkResults(jobId: string): Promise<AsyncIterable<Record[]>>;
  async abortBulkJob(jobId: string): Promise<void>;    // For cleanup

  // Tooling API
  async toolingQuery(soql: string): Promise<QueryResult>;

  // Token management (single-flight)
  private async refreshToken(): Promise<void>;
}

**API version policy:** Pin to a specific version (e.g., `v62.0`). Store as a constant in worker config, not per-customer. The Discovery collector validates the target org supports this version; if not, fail with a clear error. Do not auto-detect or auto-upgrade — version changes should be deliberate and tested. Salesforce retires versions ~3 years after release.
```

### 10.2 Adaptive Throttle with Jitter

> **Audit fix (Auditor 2 #12):** Add jitter to prevent thundering herd.

```typescript
class AdaptiveThrottle {
  private delayMs = 0;
  private consecutiveSuccesses = 0;

  async throttle(): Promise<void> {
    if (this.delayMs > 0) await sleep(this.delayMs);
  }

  onSuccess(responseTimeMs: number): void {
    this.consecutiveSuccesses++;
    if (responseTimeMs < 1000 && this.consecutiveSuccesses > 5) {
      this.delayMs = Math.max(0, this.delayMs - 50);
    }
  }

  onRateLimit(): void {
    this.consecutiveSuccesses = 0;
    const base = Math.max(1000, this.delayMs * 2);
    const jitter = Math.random() * base * 0.3;  // ±30% jitter
    this.delayMs = Math.min(16000, base + jitter);
  }

  onSlowResponse(responseTimeMs: number): void {
    if (responseTimeMs > 2000) {
      this.delayMs = Math.min(2000, this.delayMs + 100);
    }
  }
}
```

### 10.3 Circuit Breaker

> **Audit fix (Auditor 2 #17):** If Salesforce returns consistent 500s, stop retrying.

```typescript
class CircuitBreaker {
  private failures = 0;
  private state: 'closed' | 'open' | 'half-open' = 'closed';
  private openedAt?: number;
  private readonly threshold = 5;           // 5 consecutive failures → open
  private readonly resetTimeout = 60_000;   // 60s before half-open

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'open') {
      if (Date.now() - this.openedAt! > this.resetTimeout) {
        this.state = 'half-open';
      } else {
        throw new CircuitOpenError('Salesforce circuit breaker open');
      }
    }
    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (e) {
      this.onFailure();
      throw e;
    }
  }

  private onSuccess(): void {
    this.failures = 0;
    this.state = 'closed';
  }

  private onFailure(): void {
    this.failures++;
    if (this.failures >= this.threshold) {
      this.state = 'open';
      this.openedAt = Date.now();
    }
  }
}
```

### 10.4 Bulk API 2.0 Lifecycle Management

> **Audit fix (Auditor 1 #14):** Specify polling, cleanup, error handling.

| Aspect | Policy |
|--------|--------|
| **Polling cadence** | 5s initial, increase to 15s after 30s, max 30s intervals. Add ±20% jitter. |
| **Max wait** | Size-aware: 10 min (small, <5K rows), 20 min (medium, 5K-50K), 45 min (large, 50K+). Estimated from preflight record counts. If exceeded, abort and fall back to REST pagination only for small/medium jobs. Large jobs that timeout should fail the collector. |
| **Cancellation** | On container shutdown/cancel, abort in-flight bulk jobs via `PATCH /jobs/query/{id}` with `state: 'Aborted'`. |
| **Retry** | Retry `Failed` state once. If second failure, mark collector as partial. |
| **CSV parsing** | Stream parse (don't load entire CSV). Handle: escaped commas, newlines in fields, UTF-8 BOM. |
| **Result pagination** | Follow `Sforce-Locator` header. Process each chunk before requesting next. |
| **Orphan cleanup** | On job startup (including retries), read `bulk_job_ids` from checkpoint and abort any still-running orphaned jobs. |

---

## 11. Parallelism & Collector Orchestration

### 11.1 Collector Criticality Tiers

> **Audit fix (Auditor 1 #8):** Not all collectors are equally optional. Define which failures are fatal vs. warning-only.

| Tier | Collectors | Failure Policy |
|------|-----------|---------------|
| **Tier 0 (mandatory)** | Discovery, Catalog, Pricing, Usage | If any fails → entire run fails. Assessment quality critically degraded without these. |
| **Tier 1 (important)** | Dependencies, Customizations, Settings, Order Lifecycle | If fails → run completes with `completed_warnings`. Coverage gap noted. |
| **Tier 2 (optional)** | Templates, Approvals, Integrations, Localization | If fails → run completes with `completed_warnings`. Minor coverage gap. |

### 11.2 Parameterized Collector Timeouts

> **Audit fix (v1.2, Auditor 1 #13):** A flat 10-minute timeout is too rigid. Usage and pricing collectors in large orgs can legitimately take 20-45 minutes.

| Collector | Default Timeout | Rationale |
|-----------|----------------|-----------|
| discovery | 5 min | Small queries only |
| catalog | 15 min | Large orgs may have 2000+ products |
| pricing | 20 min | Complex rule chains + contracted prices (may use Bulk API) |
| usage | 45 min | Bulk API for quotes + lines — SF processing time dominates |
| dependencies | 15 min | Apex body scan can be large |
| customizations | 10 min | Describe-based, usually fast |
| settings | 5 min | Small Custom Settings queries |
| order-lifecycle | 20 min | May use Bulk API for large orgs |
| templates | 10 min | Usually few templates |
| approvals | 10 min | Small record sets |
| integrations | 10 min | Small record sets |
| localization | 10 min | May use Bulk API if >2K translations |

Timeouts are configurable per-run via `scope.collectorTimeouts` override.

### 11.3 Execution with AbortSignal Propagation

> **Audit fix (v1.2, Auditor 1 #14):** The AbortSignal must be wired through to SF client calls and polling loops, not just wrapping the outer function.

```typescript
async function runPipeline(
  config: JobConfig, db: DB, progress: Progress,
  isShuttingDown: () => boolean
) {
  const sf = new SalesforceClient(config.connection);

  // Phase 1: Discovery (mandatory, sequential)
  const discovery = await runCollectorWithTimeout('discovery',
    () => runDiscovery(sf, db, config, progress));

  // Check cancellation between phases
  if (isShuttingDown() || await isCancelRequested(db, config.runId)) return;

  // Phases 2-4: Parallel extraction (allSettled — don't fail-fast)
  const results = await Promise.allSettled([
    ...['catalog','pricing','templates','approvals',
        'customizations','localization','settings',
        'dependencies','integrations',
        'usage','order-lifecycle'].map(name =>
      runCollectorWithTimeout(name,
        (signal) => runCollector(name, sf, db, discovery, progress, signal))
    ),
  ]);

  // Evaluate results by tier
  evaluateCollectorResults(results, progress);

  // Phase 5: Post-processing
  await runPostProcessing(db, config.runId, discovery, progress);

  // Phase 6: Structured summaries
  await buildStructuredSummaries(db, config.runId, progress);
}

async function runCollectorWithTimeout(
  name: string,
  fn: (signal: AbortSignal) => Promise<void>
) {
  const tier = getCollectorTier(name);
  const timeoutMs = getCollectorTimeout(name);  // From parameterized table above
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    // Signal is passed INTO the collector → into SF client calls → into fetch() → into poll loops
    await fn(controller.signal);
  } catch (e) {
    if (controller.signal.aborted) {
      logger.warn({ collector: name, timeoutMs }, 'Collector timed out');
    }
    if (tier === 'tier0') throw e;  // Tier 0 failures propagate → run fails
    logger.warn({ collector: name, error: e.message }, 'Collector failed (non-fatal)');
    // Tier 1/2: swallow, run continues with warnings
  } finally {
    clearTimeout(timer);
  }
}
```

The `AbortSignal` propagates to:
- `fetch()` calls in the Salesforce client (native support)
- Bulk API polling loops (check `signal.aborted` each poll cycle)
- CSV stream parsing (check between chunks)
- Cancellation checks (combined with `isShuttingDown()`)

### 11.4 Idempotent Collector Writes (Provenance-Based)

> **Audit fix (v1.2, Auditor 1 #6):** Delete by `collector_name`, not by `domain`. A domain may span multiple collectors, and relationships may cross domains. Provenance-based cleanup is precise.

Each collector, before writing its findings:

```typescript
async function writeCollectorFindings(
  db: DB, runId: string, collectorName: string,
  orgId: string, findings: Finding[], relationships: Relationship[]
) {
  await db.transaction(async (tx) => {
    // 1. Clear any partial data from THIS COLLECTOR's previous attempt
    //    (not domain-wide — other collectors' findings for the same domain are safe)
    const oldFindingIds = await tx.select({ id: assessmentFindings.id })
      .from(assessmentFindings)
      .where(and(
        eq(assessmentFindings.runId, runId),
        eq(assessmentFindings.collectorName, collectorName)
      ));

    if (oldFindingIds.length > 0) {
      const ids = oldFindingIds.map(f => f.id);
      // Delete relationships that reference this collector's findings
      await tx.delete(assessmentRelationships)
        .where(and(
          eq(assessmentRelationships.runId, runId),
          or(
            inArray(assessmentRelationships.sourceFindingId, ids),
            inArray(assessmentRelationships.targetFindingId, ids)
          )
        ));
      // Delete the findings themselves
      await tx.delete(assessmentFindings)
        .where(and(
          eq(assessmentFindings.runId, runId),
          eq(assessmentFindings.collectorName, collectorName)
        ));
    }

    // 2. Write fresh findings (with organization_id for RLS)
    if (findings.length > 0) {
      const findingsWithOrg = findings.map(f => ({ ...f, organizationId: orgId }));
      // Batch inserts of 500 rows to avoid large single statements
      for (let i = 0; i < findingsWithOrg.length; i += 500) {
        await tx.insert(assessmentFindings).values(findingsWithOrg.slice(i, i + 500));
      }
    }

    // 3. Write relationships (created during normalization, not cross-collector)
    if (relationships.length > 0) {
      await tx.insert(assessmentRelationships).values(relationships);
    }

    // 4. Upsert collector metrics
    await tx.insert(collectorMetrics).values(metrics)
      .onConflictDoUpdate({ target: [collectorMetrics.runId, collectorMetrics.collectorName] });
  });
}
```

**Note:** Cross-domain relationships (e.g., "PriceRule depends on SummaryVariable") are created during the normalization phase (Phase 5), AFTER all collectors have written their findings. This avoids the problem of collector A's retry deleting relationships that reference collector B's findings.

### 11.4 Concurrency Limits

| Resource | Limit | Implementation |
|----------|-------|----------------|
| Concurrent SF API calls | Max 10 | `pLimit(10)` semaphore |
| Concurrent Bulk API jobs | Max 3 | `pLimit(3)` semaphore |
| DB write batch size | 500 rows per INSERT | Batch large finding sets |
| DB connections | Max 5 | Pool configuration |

### 11.5 Machine Sizing

| Org Complexity | Products | Quotes (90d) | Est. Runtime | Recommended Machine |
|---------------|----------|--------------|-------------|-------------------|
| Simple | <100 | <1,000 | 5-10 min | 1 vCPU, 1 GB RAM |
| Moderate | 100-500 | 1K-10K | 10-25 min | 2 vCPU, 2 GB RAM |
| Complex | 500-2000 | 10K-50K | 25-45 min | 2 vCPU, 4 GB RAM |
| Enterprise | 2000+ | 50K+ | 45-90 min | 4 vCPU, 8 GB RAM |

> **Audit note (Auditor 2 #14):** Memory estimates are optimistic. V8 heap overhead is ~2-3x raw data size. For 50K quote lines, peak memory is ~400-600 MB (not 125 MB). The 2 GB default provides sufficient headroom. Stream-parse large CSVs — never load entire Bulk API result into memory at once.

**Default: 2 vCPU, 2 GB RAM.** These are provisional — add benchmark plan and auto-sizing from discovery record counts.

---

## 12. Preparing Data for LLM Ingestion

### 12.1 Approach: Structured Summaries, Not Text Chunks

> **Audit fix (Auditor 1 #7):** Separate canonical structured outputs from AI/text outputs. Store structured JSON as source of truth; generate text as derivable cache.

The extraction job produces **structured JSON summaries** (stored in `assessment_summaries`), not free-text chunks. This is the canonical output. Downstream LLM prompt construction can derive text from these structured objects on demand.

| Summary Type | Content (JSON) | Count |
|-------------|----------------|-------|
| `org_context` | Org fingerprint, edition, CPQ version, packages, limits | 1 |
| `domain_summary` | Per-domain: metrics map, top findings, RCA mapping status counts | 11 |
| `risk_inventory` | Array of { risk, severity, affected items, evidence } | 1 |
| `mapping_context` | CPQ→RCA mapping table with per-domain item counts and gap status | 1 |
| `cleanup_candidates` | Dormant products, unused templates, stale quotes, orphans | 1 |
| `code_analysis` | QCP summaries, Apex dependency list, field references | 1 |
| `context_blueprint` | Fields participating in pricing logic (for RCA Context Definition) | 1 |

### 12.2 Why Structured JSON, Not Text

1. **Reproducible:** Re-generate text from JSON without re-extracting
2. **Model-agnostic:** Works with any LLM (Claude, GPT-4, etc.)
3. **No prompt assumptions baked into extraction** — prompt engineering happens downstream
4. **Smaller storage footprint** than duplicative text
5. **Redaction-friendly** — can filter sensitive fields before LLM consumption

### 12.3 LLM Processing (Separate Step)

The actual LLM calls happen **after extraction completes**, in a separate process. This keeps extraction deterministic and LLM retriable independently.

---

## 13. Security & IAM

### 13.1 Credential Flow

```
┌─ Cloud Secret Manager ──────────────┐
│  DATABASE_URL (connection string)    │─── injected as env var ──┐
│  SF_TOKEN_ENCRYPTION_KEY (AES key)   │                          │
└──────────────────────────────────────┘                          │
                                                                  │
┌─ Supabase PostgreSQL ────────────────┐                          │
│  salesforce_connection_secrets       │                          │
│  ├── encrypted_access_token          │◀── read via DB ──────────┤
│  └── encrypted_refresh_token         │                          │
└──────────────────────────────────────┘                          │
                                                                  │
┌─ Cloud Job Container ────────────────────────────────────────────┤
│  1. Read DATABASE_URL from env (injected by Secret Manager)      │
│  2. Connect to Supabase DB                                       │
│  3. Read encrypted tokens from salesforce_connection_secrets     │
│  4. Decrypt using SF_TOKEN_ENCRYPTION_KEY (from env)             │
│  5. Tokens exist only in process memory                          │
│  6. On exit: memory freed, tokens gone                           │
└──────────────────────────────────────────────────────────────────┘
```

### 13.2 Security Controls

| Control | Implementation |
|---------|---------------|
| **No secrets in HTTP requests** | Trigger body contains only `{ jobId, runId }`. All secrets from Secret Manager. |
| **Encryption at rest** | SF tokens: AES-256-GCM in PostgreSQL. Raw snapshots: Supabase Storage encryption. |
| **Encryption in transit** | SSL/TLS for DB, Salesforce API, and Storage. |
| **Secret injection** | Cloud Secret Manager (not env files, not HTTP body). |
| **IAM least privilege** | Worker SA: `run.developer` + `secretmanager.secretAccessor` only. |
| **DB least privilege** | Worker uses connection pooler with limited pool (5 connections). Consider dedicated DB role in v1.1. |
| **No static shared secrets** | Cloud IAM identity is the auth mechanism. No `WORKER_SECRET`. If multi-worker needed in future, use signed per-run JWT claims. |
| **Non-root container** | `USER appuser` in Dockerfile. |
| **No inbound ports** | Container has outbound-only internet access. |
| **Tenant isolation** | All queries filter by `organization_id`. RLS policies on all tables. |
| **Image security** | Pin image versions. Scan for vulnerabilities in CI. |
| **Audit trail** | All runs logged with run ID, user, worker version, API calls. |
| **Log redaction** | Never log access tokens, SOQL with sensitive field values, or raw record data. Log IDs and counts only. |

### 13.3 Key Management

- **SF_TOKEN_ENCRYPTION_KEY:** Generated as 32-byte random, stored in Secret Manager. Key version tracked on each connection record.
- **Rotation:** Create new key version in Secret Manager. Re-encrypt existing tokens. Deploy worker with new key version. This is a manual process for v1; automated rotation in v1.1.

---

## 13.4 Platform Concurrency Limits

> **Audit fix (v1.2, Auditor 2 #6):** Address concurrent runs across the entire platform, not just per-project.

| Resource | Limit | Mitigation |
|----------|-------|------------|
| Concurrent Cloud Run executions | 100 (default GCP quota) | Sufficient for foreseeable scale. Request increase if needed. |
| DB connections per worker | 5 | 20 concurrent workers = 100 connections. Supabase Pro has ~200 direct + pooler. Use pooler URL. |
| Salesforce API budget per org | Shared with customer's production usage | Preflight checks remaining API budget. Worker respects org limits. |

**v1 platform capacity:** Supports up to ~30 concurrent assessment jobs. If growth demands more, increase Cloud Run quotas and verify DB connection pool sizing.

## 13.5 Preflight-Only Mode

> **Audit fix (v1.2, Auditor 2 #7):** Fully specify what runs in preflight mode.

When `assessment_runs.mode = 'preflight_only'`:

- **Runs:** Only the Discovery collector (Phase 1) — validates OAuth tokens, checks API limits, describes key CPQ objects, verifies package version
- **Runtime:** 30-60 seconds
- **Output:** `org_fingerprint` populated on `assessment_runs`, discovery checkpoint with status, one `org_context` summary
- **No findings, relationships, or domain summaries** are produced
- **Terminal status:** `completed` (if all checks pass) or `failed` (if OAuth/access issues)
- **UI:** Shows "Connection verified" with org details (edition, CPQ version, API budget, detected packages)
- **Use case:** Customer onboarding — validate the pipeline works before committing to a full extraction

---

## 14. Data Governance & Compliance

> **Audit fix (Auditor 1 #6, Auditor 2 #15):** Define data classification, retention enforcement, and deletion.

### 14.1 Data Classification

| Classification | Examples | Handling |
|---------------|----------|---------|
| **Secrets** | SF access/refresh tokens | Encrypted at rest + in transit. In-memory only. Never logged. |
| **Customer Confidential** | Pricing rules, product catalog, contracted prices, QCP code | Encrypted at rest. Access via RLS. Retained per policy. |
| **Operational Metadata** | Run status, collector metrics, API call counts | Retained permanently. No PII. |
| **Potentially Personal** | Account names (in contracted prices), Sales Rep IDs (in usage data) | Minimize extraction. Redact from summaries where possible. |

### 14.2 Retention Enforcement

| Data Type | Default Retention | Enforcement |
|-----------|-------------------|-------------|
| Raw snapshots | 60 days | pg_cron weekly cleanup of expired Storage objects |
| Assessment findings | Until run deleted | CASCADE delete when run is deleted |
| Structured summaries | Until run deleted | CASCADE delete |
| Run records | Permanent (metadata only) | Manual delete on customer request |

**Cleanup mechanism:**

> **Audit fix (v1.2, Auditor 1 #10):** pg_cron runs SQL in Postgres but can't directly call Supabase Storage APIs. Use a scheduled Edge Function instead.

- **Weekly scheduled Edge Function** (triggered by Supabase cron or external scheduler):
  1. Query `assessment_runs` for runs older than retention period
  2. For each expired run: call Supabase Storage API to delete `assessment-runs/{runId}/` prefix
  3. Update run metadata to mark snapshots as purged
- **DB cascade handles structured data:** Deleting `assessment_runs` rows cascades to findings, relationships, metrics, summaries, and attempts
- **Run metadata is kept permanently** (only raw snapshots are purged by retention)

### 14.3 Right to Delete

On customer churn or data deletion request:
1. Delete all `assessment_runs` for the organization (cascades to findings, relationships, metrics, summaries, attempts)
2. Delete Storage objects under `assessment-runs/{runIds}/`
3. Log deletion in audit trail

### 14.4 Configurable Policies

Per-organization settings (stored in org config):
- `raw_snapshot_retention_days`: 30 / 60 / 90 (default: 60)
- `raw_snapshot_enabled`: true / false (default: true)
- `code_extraction_enabled`: true / false (default: true — can disable for security-sensitive customers)

---

## 15. Cost Analysis

### 15.1 Per-Assessment Cost

> **Audit fix (Auditor 2 #2):** Corrected multiplication for 2 vCPUs and 2 GB.

**GCP Cloud Run Jobs (2 vCPU, 2 GB):**

| Resource | Moderate (20 min) | Complex (45 min) | Enterprise (90 min) |
|----------|------------------|-------------------|---------------------|
| vCPU | $0.0000240/vCPU-s × 2 × 1200s = **$0.058** | × 2700s = **$0.130** | × 5400s = **$0.259** |
| Memory | $0.0000025/GiB-s × 2 × 1200s = **$0.006** | × 2700s = **$0.014** | × 5400s = **$0.027** |
| Network | ~$0.01 | ~$0.02 | ~$0.05 |
| **Total** | **~$0.07** | **~$0.17** | **~$0.33** |

**AWS ECS Fargate (2 vCPU, 2 GB):**

| Resource | Moderate (20 min) | Complex (45 min) | Enterprise (90 min) |
|----------|------------------|-------------------|---------------------|
| vCPU | $0.04048/vCPU-hr × 2 × 0.33hr = **$0.027** | × 0.75hr = **$0.061** | × 1.5hr = **$0.121** |
| Memory | $0.004445/GB-hr × 2 × 0.33hr = **$0.003** | × 0.75hr = **$0.007** | × 1.5hr = **$0.013** |
| **Total** | **~$0.03** | **~$0.07** | **~$0.14** |

**At 100 assessments/month:** $7-33/month (GCP) or $3-14/month (AWS). Trivial.

### 15.2 All-In Monthly Cost (Including Fixed + Storage)

| Component | GCP | AWS |
|-----------|-----|-----|
| Compute (100 runs/mo) | $7-33 | $3-14 |
| Container registry | ~$0.10/GB | ~$0.10/GB |
| Secret Manager | ~$0.20 (3 secrets) | ~$1.20 (3 secrets) |
| Storage (raw snapshots, 60d retention) | ~$2-10 | ~$2-10 |
| Logging | Free tier | Free tier |
| Cloud NAT (if needed) | ~$30 | ~$30 |
| **Monthly total** | **$10-75** | **$6-55** |

---

## 16. Observability & SLOs

### 16.1 Structured Logging

```typescript
const logger = pino({
  level: 'info',
  base: { runId, jobId, projectId, workerId, attemptNo },
  redact: ['accessToken', 'refreshToken', '*.password', '*.secret'],
});

logger.info({ collector: 'pricing', records: 243, duration: 12400 }, 'collector_complete');
logger.warn({ field: 'SBQQ__TermDiscountLevel__c', object: 'Product2' }, 'field_skipped_fls');
logger.error({ error: err.message, collector: 'usage' }, 'collector_failed');
```

### 16.2 SLOs

> **Audit fix (Auditor 2 #19):** Define acceptable performance targets.

| SLO | Target | Measurement |
|-----|--------|-------------|
| P95 runtime, moderate org | < 25 minutes | `assessment_runs.duration_ms` |
| P95 runtime, enterprise org | < 90 minutes | `assessment_runs.duration_ms` |
| Job success rate | > 95% | completed / (completed + failed) |
| Hung job detection time | < 5 minutes | Heartbeat interval (30s) × threshold (10 missed) |
| Progress update freshness | < 30 seconds | Heartbeat-aligned progress writes |

### 16.3 Key Metrics

| Metric | Source | Purpose |
|--------|--------|---------|
| Job duration (p50/p95) | `assessment_runs.duration_ms` | Performance tracking |
| API calls per run | `assessment_runs.api_calls_used` | Budget monitoring |
| Success/failure rate | Run status distribution | Reliability |
| Per-collector duration | `collector_metrics.duration_ms` | Bottleneck identification |
| Per-collector coverage | `collector_metrics.coverage` | Data completeness |
| Retries per run | `run_attempts` count | Infrastructure reliability |
| SF response latency | In-app metrics (logged) | Salesforce health |

### 16.4 Alerts

| Condition | Action |
|-----------|--------|
| Job stuck queued > 10 minutes | Alert: dispatch may have failed |
| Job running, no heartbeat > 5 minutes | Mark as failed (lease sweeper) |
| Failure rate > 20% over 24h | Alert: systemic issue |
| Repeated auth refresh failures for same connection | Alert: customer may need to re-authenticate |

---

## 17. Failure Modes & Recovery

### 17.1 Failure Matrix

| Failure | Detection | Recovery |
|---------|-----------|----------|
| **Container OOM** | Exit code 137 | Auto-retry (max 1). Resume from checkpoint. Consider larger memory. |
| **Container hang** | Heartbeat timeout (5 min) | Lease sweeper marks run as failed. User can retry. |
| **SIGTERM** (timeout/scale) | Signal handler | Graceful shutdown: flush checkpoint, mark failed, exit 0. |
| **SF token expired** | HTTP 401 | Single-flight refresh. If refresh fails, mark run failed with "re-authenticate" message. |
| **SF rate limit** | HTTP 429 | Adaptive throttle with jitter. If persistent >2min, circuit breaker opens. |
| **SF outage** | HTTP 503 | Circuit breaker. If open >5min, fail collector. |
| **Single collector failure** | try/catch per collector | Tier 0: fail run. Tier 1/2: mark collector failed, continue. |
| **DB connection lost** | Connection error | Retry 3x with 1s backoff. If persistent, fail run. |
| **Job timeout (1 hour)** | Cloud Run kills container | SIGTERM handler runs. Retry with same/larger timeout. |
| **User cancels** | `cancel_requested` status in DB | Worker checks between collectors and during bulk polling. Exits gracefully. |
| **Orphaned Bulk API jobs** | Checkpoint has `bulk_job_ids` | On retry startup, abort orphaned SF bulk jobs. |
| **Duplicate trigger** | Unique index on active runs | INSERT fails with constraint violation → return 409 Conflict. |

### 17.2 Lease Sweeper

A Supabase pg_cron job (or Edge Function on schedule) runs every 2 minutes:

```sql
-- Mark runs as failed if heartbeat expired
UPDATE assessment_runs
SET status = 'failed',
    status_reason = 'heartbeat_timeout',
    failed_at = NOW()
WHERE status = 'running'
  AND lease_expires_at < NOW() - INTERVAL '30 seconds';
```

### 17.3 Cancellation Checkpoints

The worker checks for cancellation:
- Before each collector starts
- During bulk API polling loops (every poll cycle)
- Every 100 records during large data processing
- Before any major DB write batch

On cancel: flush partial data, mark run as `cancelled`, exit 0.

---

## 18. Decision Matrix

| Factor | GCP Cloud Run Jobs | AWS ECS Fargate |
|--------|-------------------|-----------------|
| Setup complexity | Low (YAML + gcloud) | Medium (cluster + task def + VPC + IAM) |
| Per-run cost | ~$0.07-0.33 | ~$0.03-0.14 |
| Monthly all-in cost | ~$10-75 | ~$6-55 |
| DB latency (Supabase on AWS) | +5-10ms (cross-cloud) | <1ms (same cloud) |
| Startup time | ~5-15s | ~30-60s |
| IAM ergonomics | Good (Workload Identity Federation) | Good (task roles) |
| Trigger from Edge Fn | HTTP POST (simple) | AWS SDK RunTask (needs IAM creds in Edge Fn) |
| Team familiarity | Depends | Depends |
| Application portability | Same Docker container | Same Docker container |

**Recommendation:** GCP for simplicity unless AWS infrastructure already exists or DB latency proves to be an issue (unlikely for this workload).

---

## 19. Implementation Approach

### Phase 0: Foundation (Week 1)

| Task | Description |
|------|-------------|
| 0.1 | Database migration: all new tables (assessment_runs, findings, relationships, metrics, summaries, checkpoints, attempts) |
| 0.2 | RLS policies for all new tables |
| 0.3 | Create `apps/worker/` package: TypeScript config, dependencies, hardened Dockerfile |
| 0.4 | Lease manager: claim, heartbeat, release, sweeper |
| 0.5 | Progress reporter: status transitions, progress JSONB updates |
| 0.6 | Checkpoint manager: read/write/resume logic |
| 0.7 | SIGTERM handler + cancellation checking |

### Phase 1: Salesforce Client (Week 1-2)

| Task | Description |
|------|-------------|
| 1.1 | Unified Salesforce client: REST query, auto-pagination, token refresh (single-flight) |
| 1.2 | Composite Batch API wrapper |
| 1.3 | Bulk API 2.0 client: create, poll (with jitter), stream CSV, abort, orphan cleanup |
| 1.4 | Dynamic query builder (Section 18 of extraction spec) |
| 1.5 | Adaptive throttle with jitter + circuit breaker |
| 1.6 | Concurrency control: semaphore-based API call + bulk job limiting |

### Phase 2: Collectors (Weeks 2-3)

| Task | Description |
|------|-------------|
| 2.1 | Discovery collector (Tier 0): org fingerprint, describes, limits, package version |
| 2.2 | Catalog collector (Tier 0): products, features, options, constraints, rules, attributes |
| 2.3 | Pricing collector (Tier 0): price rules/conditions/actions, discounts, QCP, lookups, consumption |
| 2.4 | Usage collector (Tier 0): 90-day quotes/lines (Bulk API), 12-month trends, opportunity sync |
| 2.5 | Dependencies collector (Tier 1): Apex, flows, triggers, workflow rules |
| 2.6 | Customizations collector (Tier 1): custom fields, __mdt, validation rules, sharing |
| 2.7 | Settings collector (Tier 1): CPQ custom settings discovery + extraction |
| 2.8 | Order lifecycle collector (Tier 1): orders, contracts, assets |
| 2.9 | Templates collector (Tier 2): templates, sections, content, merge fields |
| 2.10 | Approvals collector (Tier 2): custom actions, ProcessDefinition, sbaa__ |
| 2.11 | Integrations collector (Tier 2): named creds, platform events, e-signature |
| 2.12 | Localization collector (Tier 2): translations, custom labels |

### Phase 3: Post-Processing (Week 3)

| Task | Description |
|------|-------------|
| 3.1 | Pipeline orchestrator: phase-based parallel execution with `allSettled` + criticality evaluation |
| 3.2 | Twin Fields analysis |
| 3.3 | Post-extraction validation (referential integrity, data quality) |
| 3.4 | Assessment graph normalization (findings + relationships) |
| 3.5 | Derived metrics computation |
| 3.6 | Structured JSON summary builder |

### Phase 4: Infrastructure & Integration (Week 4)

| Task | Description |
|------|-------------|
| 4.1 | GCP project setup: Artifact Registry, Secret Manager, Cloud Run Job, IAM |
| 4.2 | CI/CD: GitHub Actions → build → scan → push Docker image on merge |
| 4.3 | Supabase API routes: `POST /assessment/run` (trigger), `GET /assessment/runs/:id/status` (poll) |
| 4.4 | Edge Function: Cloud Run trigger with execution ID capture |
| 4.5 | Lease sweeper: pg_cron job for zombie detection |
| 4.6 | Storage retention: pg_cron job for snapshot cleanup |
| 4.7 | Client: "Run Assessment" button, progress polling, completion handling |
| 4.8 | Preflight-only mode: validate without extracting |

### Phase 5: Hardening (Week 5)

| Task | Description |
|------|-------------|
| 5.1 | Golden dataset tests: static fixtures → pipeline → verify output |
| 5.2 | Failure recovery tests: simulate crashes, verify checkpoint resume |
| 5.3 | Idempotency tests: trigger twice, verify no duplicates |
| 5.4 | Cancellation tests: cancel mid-run, verify graceful stop |
| 5.5 | Rate limit tests: simulate 429s, verify throttle + circuit breaker |
| 5.6 | Large org test: 2000+ products, 50K+ quote lines |
| 5.7 | Bulk API lifecycle tests: orphan cleanup, abort, timeout |
| 5.8 | Security review: credential flow, RLS, tenant isolation, image scan |
| 5.9 | Cost validation: verify per-run costs match estimates |
| 5.10 | Operational runbook: stuck jobs, token failures, SF outage, emergency rotation, customer delete |

---

## 20. Open Questions

| # | Question | Options | Recommendation | Status |
|---|----------|---------|----------------|--------|
| 1 | **GCP vs AWS?** | Cloud Run Jobs vs ECS Fargate | GCP for simplicity. Decision needed before Phase 4. | **Open — needs decision** |
| 2 | **LLM processing: same job or separate?** | Combined vs separate step | Separate — extraction deterministic, LLM retriable independently. | Decided: separate |
| 3 | **Raw snapshot retention default?** | 30 / 60 / 90 days | 60 days, configurable per org. | Decided: 60 days |
| 4 | **Supabase Realtime vs polling?** | Realtime subscription vs 5s polling | Polling for v1. | Decided: polling |
| 5 | **Dedicated DB role for worker?** | Shared service_role vs dedicated | Shared for v1, **required before GA/enterprise rollout**. | Deferred to GA |
| 6 | **SF IP allowlisting?** | Do target customers use it? | Survey during onboarding. Budget Cloud NAT (~$30/mo) if needed. | **Open — survey needed** |

---

## Revision History

| Version | Date | Changes |
|---------|------|---------|
| 1.0-draft | 2026-03-25 | Initial specification |
| 1.1 | 2026-03-25 | Dual audit revision. Critical fixes: DATABASE_URL removed from trigger body, cost calculations corrected, state machine, lease/heartbeat, SIGTERM handler, finding dedup, RLS, concurrent-run guard, Dockerfile hardening, throttle jitter, Cloud Run IAM. Significant additions: criticality tiers, circuit breaker, Bulk API lifecycle, per-collector timeouts, cancellation checkpoints, run attempts, substep checkpoints, structured JSON summaries, data governance, SLOs, lease sweeper, orphan cleanup, storage manifest, connection pooling, transaction boundaries, graph indexes, preflight mode, versioned deployments, runbook task. |
| 1.2 | 2026-03-25 | Final precision fixes. **IAM:** Separated trigger caller principal (custom role with `run.jobs.run`) from runtime SA (`secretAccessor` only). **Lease:** Added explicit CAS semantics (all operations conditional on `worker_id`), specified lease duration (90s), heartbeat retry with 3 attempts, lease-lost detection. **SIGTERM:** Fixed exit code to non-zero (1), removed eager lease release, best-effort checkpoint flush. **Schema:** Added `collector_name` + `finding_key` + `organization_id` to findings for provenance-based writes and RLS performance. Added state machine enforcement trigger. **RLS:** Denormalized `organization_id` on findings for O(1) policy checks. Added UPDATE policy for cancel. **Collectors:** Provenance-based delete/rewrite by `collector_name` (not domain). Parameterized per-collector timeouts (5-45 min by type). AbortSignal propagated through to fetch/polling/parsing. **Bulk API:** Size-aware max wait (10/20/45 min). **New sections:** Platform concurrency limits, preflight-only mode spec, run_attempts lifecycle, local development story, heartbeat resilience. **Fixed:** Migration rollback claim (forward-only preferred), storage cleanup mechanism (Edge Function, not pg_cron), removed WORKER_SECRET (cloud IAM is the trust mechanism), SF API version pinning policy. **Deferred to GA:** Dedicated DB role for worker, Workload Identity Federation, KMS envelope encryption, OpenTelemetry tracing. |
