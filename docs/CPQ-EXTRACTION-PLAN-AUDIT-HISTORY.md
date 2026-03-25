# CPQ Extraction Worker — Audit Response History

> Full audit trail for the [Implementation Plan](CPQ-EXTRACTION-IMPLEMENTATION-PLAN.md). Covers 5 rounds of dual audit (10 auditor passes), v1.0 through v2.5.

## Audit Response Summary

Three rounds of dual audit (6 auditor passes). Below is the disposition of every critical and high finding.

### v2.1 Audit — Critical Findings (Round 3)

| # | Finding | Auditor | Disposition | Rationale |
|---|---------|---------|-------------|-----------|
| R3-A2-1 | Sweeper `failed → queued` transition blocked by state machine trigger — `failed` is terminal | 2 | **Accepted** | Introduce `stalled` state (non-terminal) for retriable infrastructure failures. Sweeper: `running` (expired lease) → `stalled`. If `retry_count < max_retries`: `stalled` → `queued`. If exhausted: `stalled` → `failed` (permanent). State machine updated. |
| R3-A2-2 | Re-trigger scheduler mentioned but never specified as a task — phantom dependency | 2 | **Accepted** | Added Task 9.3: scheduled function that picks up `queued` runs (with delay to avoid racing initial trigger) and dispatches them. |

### v2.1 Audit — High Findings (Round 3)

| # | Finding | Auditor | Disposition | Rationale |
|---|---------|---------|-------------|-----------|
| R3-A2-3 | No max retry count — infinite re-queue loop possible | 2 | **Accepted** | Added `retry_count` + `max_retries` (default: 2) to `assessment_runs`. Sweeper increments and checks before re-queueing. |
| R3-A2-4 | Token refresh UPDATE not row-scoped — compromised worker could overwrite any org's tokens | 2 | **Accepted** | Security definer function `update_connection_tokens(run_id, connection_id, ...)` validates run→connection relationship. Worker gets `EXECUTE` on function, no direct `UPDATE` on table. |
| R3-A2-5 | Task 1.6 stale text ("scoped token") | 2 | **Accepted** | Fixed. |
| R3-A2-6 | `INTERNAL_API_SECRET` missing from worker env vars | 2 | **Accepted** | Added to Task 0.6. |
| R3-A1-1 | Add worker health check task | 1 | **Accepted** | Worker startup validates: DB permissions, storage write access, SF connectivity, API version. Part of Task 1.3 (startup sequence). |
| R3-A1-3 | Document technical debt explicitly | 1 | **Accepted** | Added Section 2.7 (Technical Debt Register). |

### v2.1 Audit — Medium Findings (Round 3)

| # | Finding | Integration |
|---|---------|-------------|
| R3-A2-7 | `statement_timeout` description inconsistent | Fixed in Task 1.5: connection-level 60s + app-side AbortController |
| R3-A2-8 | REST API 50K row limit | Added to REST client: warning at 50K, automatic Bulk API fallback |
| R3-A2-9 | Schema migration deployment order | Added to Task 10.1: enforce migrations → server → worker in CI/CD |
| R3-A2-10 | `pLimit` singleton sharing | Specified: created in pipeline.ts, passed via `CollectorContext` |
| R3-A2-11 | Sub-task interaction with provenance writes | Note added: "development milestone, not independently deployable" |
| R3-A2-12 | Sweeper vs dispatched cold-start race | Added `dispatched_at` timestamp, sweeper respects 5-minute grace period |
| R3-A2-13 | `engines` field missing | Added to Task 0.1 acceptance criteria |
| R3-A2-14 | Timezone handling for 90-day calculations | Added to Task 4.3a: use `TimeZoneSidKey` from org fingerprint |
| R3-A2-16 | Task count inconsistency (48→54 vs 48→53) | Fixed |
| R3-A2-17 | Idempotency key storage mechanism | `idempotency_key` column on `assessment_runs` with unique index + TTL cleanup |
| R3-A2-18 Obs | Tier 1 threshold should be configurable | Changed to `Math.ceil(tier1Count * 0.5)` |
| R3-A2-18 Obs | `AbortController` propagation | Added to base collector spec: child AbortController, aborted on cancel/timeout |

### v2.0 Audit — Critical Findings (Round 2)

| # | Finding | Auditor | Disposition | Rationale |
|---|---------|---------|-------------|-----------|
| R2-A2-1 | Cloud Run retry vs lease timing race: retry container can't claim lease (still held by crashed worker), exhausts maxRetries, run permanently fails | 2 | **Accepted** | Real race condition. Fix: `maxRetries: 0` on Cloud Run. Sweeper transitions expired-lease runs to `queued`, separate scheduler re-triggers. Single retry mechanism via sweeper. |
| R2-A2-2 | Token refresh delegation creates SPOF: if Hono server is down during 45-min extraction, refresh fails → Tier 0 failure | 2 | **Accepted** | Add fallback chain: (1) try delegated refresh via server, (2) if fails, direct refresh using refresh token. Worker DB role scoped to UPDATE `encrypted_access_token, encrypted_refresh_token, token_version, updated_at` on `salesforce_connection_secrets` for fallback only. |
| R2-A2-3 | Custom Postgres role can't authenticate through Supabase PgBouncer — only built-in roles work through pooler | 2 | **Accepted** | Use direct connections (not pooler) for v1. 6 connections per worker × max ~10 concurrent workers on Pro plan. Document limit in capacity planning. Long-term: custom JWT + SET LOCAL ROLE through session-mode pooling. |

### v2.0 Audit — High Findings (Round 2)

| # | Finding | Auditor | Disposition | Rationale |
|---|---------|---------|-------------|-----------|
| R2-A2-4 | Collector tasks (4.1/4.2/4.3) too large for single commits — Pricing alone is ~2000 LOC | 2 | **Accepted** | Split each Tier 0 collector into 2-3 sub-tasks. Adds 5 tasks (48→53). |
| R2-A2-5 | Task 2.1 (token management) depends on Task 9.2 (internal refresh endpoint) — undeclared cross-phase dependency | 2 | **Accepted** | Move internal refresh endpoint to Phase 2 as Task 2.7. |
| R2-A2-6 | Scoped storage JWT doesn't exist as a Supabase primitive | 2 | **Accepted** | Simplified: use `service_role` key with application-layer path prefix enforcement in `snapshots.ts`. Defense-in-depth via Supabase Storage bucket policy restricting to `assessment-runs/` prefix. Document as v1 pragmatic choice; custom JWT + RLS in v1.1. |
| R2-A2-7 | Node.js heap not configured — default ~1.5GB may OOM under large org | 2 | **Accepted** | Add `--max-old-space-size=1536` to Dockerfile CMD. Add heap usage logging every 60s. |
| R2-A2-8 | `statement_timeout` per-query not feasible with postgres.js | 2 | **Accepted** | Connection-level `statement_timeout: 60s` + application-side `AbortController` with `setTimeout` for finer granularity. |
| R2-A1-2.1 | DB permissions too broad — worker should be append-only, cleanup via stored procedure | 1 | **Rejected** | Stored procedures add DB-side business logic that must be versioned, tested, and deployed separately from application code. The scoped DB role already limits to extraction tables only. Provenance-based DELETE+INSERT within a transaction is a well-understood pattern. The marginal security gain doesn't justify the operational complexity. |
| R2-A1-2.2 | finding_key string concatenation is fragile | 1 | **Rejected** | Salesforce IDs are alphanumeric (A-Z, a-z, 0-9) — no special characters. String keys are readable in queries and logs. A hash column (MD5/SHA-256) adds opacity and makes debugging harder. If edge cases emerge, we can add a hash column later without breaking the existing key. |
| R2-A1-Security | Worker should not read secrets table directly — use internal endpoint for decrypted tokens | 1 | **Rejected** | Sending plaintext tokens over HTTP (even internal) is *less* secure than reading an encrypted blob and decrypting locally. The current model: worker reads encrypted bytea from DB → decrypts in-memory using key from Secret Manager → tokens never transit a network in plaintext. An internal endpoint would send plaintext tokens over HTTP, adding a new attack surface. |
| R2-A1-Resilience | Two DB pools is "ugly" | 1 | **Rejected** | Dedicated priority pools are a standard pattern in systems with background health checks (Kubernetes probes, lease heartbeats). The alternative — single pool with connection management — is more complex and harder to reason about under contention. |

### v2.0 Audit — Medium Findings Accepted (Round 2)

| # | Finding | Integration |
|---|---------|-------------|
| R2-A2-9 | SF API version auto-detection | Added to Discovery collector (Task 3.1): call `/services/data/`, select latest, store in run metadata |
| R2-A2-11 | Zod contract tests for shared JSONB | Added: `progress`, `org_fingerprint`, and summary JSONB schemas in `packages/contract/` |
| R2-A2-12 | SF ID normalization (15→18 char) | Added `normalizeSalesforceId()` utility in `salesforce/client.ts`, used by all collectors |
| R2-A2-13 | `UNABLE_TO_LOCK_ROW` not in retryable errors | Added alongside `QUERY_TIMEOUT` as retryable 400-level errors (3 retries with backoff) |
| R2-A2-14 | No multi-org concurrent integration test | Added to Task 12.3: 3 workers for different orgs simultaneously |
| R2-A2-16 | Proactive token refresh (before expiry) | Added to auth module: refresh at 75% of TTL based on `issued_at` timestamp |
| R2-A2-17 | Idempotency key on run trigger | Added `Idempotency-Key` header to POST /assessment/run |
| R2-A1-Observability | AsyncLocalStorage for trace context | Added: `AsyncLocalStorage` propagates traceId through all async operations |
| R2-A1-Cost | API budget enforcement | Added: configurable `maxApiCalls` per run, hard stop if exceeded |
| R2-A1-Data | Schema versioning on snapshots/summaries | Already in architecture spec; called out explicitly in Task 1.4 and 7.3 |

### v1.0 Audit — Critical Findings (Round 1)

| # | Finding | Auditor | Disposition | Rationale |
|---|---------|---------|-------------|-----------|
| A1-1.1 | Direct DB access from worker is high-risk | 1 | **Partially accepted** | A dedicated DB role scoped to extraction tables is the right v1 approach. A separate Extraction Service (mTLS/VPC) adds an entire service + deployment + monitoring — over-engineering for v1 when a scoped Postgres role achieves least-privilege. Added as Task 0.5. |
| A1-1.2 | Token decryption + refresh in worker | 1 | **Accepted** | Token refresh delegated to TypeScript server via internal API. Worker only decrypts (read-only on secrets table). See Task 2.1. |
| A1-1.3 | Missing data privacy & compliance | 1 | **Accepted** | Added PII awareness to collectors and a data classification section. See Phase 0 scope. |
| A2-1.1 | Provenance writes (8.2) needed before Phase 4 | 2 | **Accepted** | Moved to Phase 1 as Task 1.5. |
| A2-1.2 | Snapshot upload (8.3) needed before Phase 4 | 2 | **Accepted** | Moved to Phase 1 as Task 1.6. |
| A2-1.3 | Findings builder needed before Phase 4 | 2 | **Accepted** | Split: Finding model/factory in Phase 1 (Task 1.4), twin fields analysis stays in Phase 7. |
| A2-1.4 | Infrastructure blocks integration testing | 2 | **Partially accepted** | GCP project setup moved to Phase 0 (Task 0.7). Full Cloud Run config stays in Phase 10. |
| A2-2.1 | Worker bypasses RLS | 2 | **Accepted** | Dedicated `extractor_worker` Postgres role with INSERT/UPDATE/SELECT only on extraction tables. See Task 0.5. |
| A2-2.2 | Worker writes to connection_secrets | 2 | **Accepted** | Token refresh delegated to server. Worker DB role has no write access to `salesforce_connection_secrets`. |
| A2-2.3 | Service role key overpowered | 2 | **Accepted** | Replaced with scoped storage token. Worker only needs write to `assessment-runs/` bucket prefix. See Task 0.6. |
| A2-2.5 | No audit trail for token decryption | 2 | **Accepted** | Structured log event on every decrypt. |

### High Findings

| # | Finding | Auditor | Disposition | Rationale |
|---|---------|---------|-------------|-----------|
| A1-2.1 | Python in TS monorepo | 1 | **Accepted** | Switched to TypeScript. Reuses encryption, Drizzle, contract types, test infrastructure. Python reserved for future analysis engine. |
| A1-2.2 | 66 tasks too granular | 1 | **Partially accepted** | Consolidated collectors into domain-level tasks (e.g., "Catalog Collector" = all of Sections 5.1-5.9). Reduced to 48 tasks. Kept granularity for infrastructure/core runtime where each task is genuinely independent. |
| A1-2.3 | Missing resilience patterns | 1 | **Partially accepted** | Per-API-type circuit breakers: accepted. Bulk job orphan cleanup was already in v1 (Task 1.4 checkpoint, Task 2.7 bulk). Worker self-termination on lease loss: accepted. Lease duration 90s: kept — architecture spec math shows 90s + 30s heartbeat + 2min sweeper = 3.5min detection, within 5min SLO. |
| A2-3.1 | No complete DDL | 2 | **Accepted** | Task 0.4 references architecture spec Section 9.2 as canonical DDL. Complete column listing in one place. |
| A2-3.2 | finding_key undefined | 2 | **Accepted** | Defined algorithm: `{collector}:{artifactType}:{sfRecordId}` for record-based, `{collector}:{metricName}:{scope}` for aggregate findings. See Task 1.4. |
| A2-3.3 | FK cascade undefined | 2 | **Accepted** | All child tables use `ON DELETE CASCADE` from `assessment_runs`. Already specified in architecture spec SQL. |
| A2-3.4 | Progress JSONB TOAST churn | 2 | **Accepted as trade-off** | 2-5KB rewritten every 30s for 30-60min = ~60-120 writes. Negligible for PostgreSQL. Documenting trade-off is sufficient. Moving to a separate table adds complexity for marginal benefit. |
| A2-3.6 | Inconsistent state between findings and relationships | 2 | **Accepted** | Intra-collector relationships written in same transaction as findings. Cross-collector relationships written in post-processing with `normalization_status` field on `assessment_runs`. |
| A2-3.7 | Compound fields not handled | 2 | **Accepted** | Added to query builder: detect compound fields in Describe, expand to component fields. |
| A2-4.1 | Heartbeat starvation from pool exhaustion | 2 | **Accepted** | Separate single-connection pool for heartbeat. Main pool (5 connections) for collectors. |
| A2-4.2 | No DB retry | 2 | **Accepted** | 3 retries with 1s backoff for connection errors. Transaction-level retry for serialization failures. |
| A2-4.3 | Circuit breaker scope ambiguous | 2 | **Accepted** | Per-API-type: REST, Bulk, Tooling, SOAP — independent state machines. |
| A2-4.4 | No Bulk API partial failures handling | 2 | **Accepted** | Check `failedResults` endpoint after job completion. Log warnings, include in checkpoint. |
| A2-4.5 | No DB operation timeout | 2 | **Accepted** | `statement_timeout` on connection + per-operation timeouts. |
| A2-4.6 | SIGTERM race condition | 2 | **Accepted** | Node.js handles this better than Python — `process.on('SIGTERM')` is async-safe. Still, handler only sets flag + schedules graceful shutdown via `setImmediate`. No direct DB writes in handler. |
| A2-5.1 | No distributed tracing | 2 | **Accepted** | Trace ID generated at trigger, passed as env var, bound in structured logs. OpenTelemetry deferred to v1.1 (GCP Cloud Trace integration). |
| A2-5.2 | No metrics beyond logs | 2 | **Accepted** | Summary metrics log line at run completion + per-collector metrics in `collector_metrics` table. Full Prometheus/CloudWatch deferred to v1.1. |
| A2-5.4 | No local dev environment | 2 | **Accepted** | Added Task 0.7. |
| A2-7.1 | Tier 0/1/2 parallel is wasteful | 2 | **Accepted** | Two-phase: run Tier 0 first, then Tier 1/2 if all Tier 0 succeed. |
| A2-7.2 | No collector dependency graph | 2 | **Accepted** | `requires: string[]` on each collector. Pipeline validates before execution. |
| A2-7.4 | No error budget for completed_warnings | 2 | **Accepted** | Minimum 2 of 4 Tier 1 collectors must succeed, otherwise → `failed`. |

### Rejected / Deferred Findings

| # | Finding | Auditor | Disposition | Rationale |
|---|---------|---------|-------------|-----------|
| A1-1.1 | Full Extraction Service (mTLS) | 1 | **Deferred to GA** | Scoped DB role achieves least-privilege for v1. Internal service adds deployment complexity without proportional security gain when the worker is already in a private VPC. |
| A1-3 (OpenTelemetry) | Full distributed tracing | 1 | **Deferred to v1.1** | Trace ID correlation via structured logs is sufficient for v1. Full OpenTelemetry integration (Cloud Trace, spans) adds significant implementation overhead. |
| A1-3 (Extraction profiles) | Minimal/Standard/Deep modes | 1 | **Deferred to v1.1** | Full extraction is the only mode needed for v1 (plus preflight). Profiles add configuration complexity. |
| A1-4.4 (QCP JS parsing) | Use esprima/babel AST | 1 | **Rejected** | Regex is practical for v1 — we're detecting field references and callout patterns, not executing the code. AST parsing adds a build dependency and complexity for marginal accuracy improvement. Can upgrade later if regex proves insufficient. |
| A2-3.5 | Table partitioning | 2 | **Deferred** | Document threshold: consider partitioning when `assessment_findings` exceeds 10M rows. For v1 (hundreds of runs), not needed. |
| A2-5.3 | Alerting definitions | 2 | **Deferred to Phase 10** | Alerts defined as part of operational setup, not application code. Added to runbook task. |
| A2-5.5 | Capacity planning doc | 2 | **Deferred to Phase 10** | Added to infrastructure phase. |
| A2-8.2 | Webhook/SSE for completion | 2 | **Deferred** | Polling for v1 per architecture spec decision. Supabase Realtime is the v1.1 path. |
| A2-10.4 | Salesforce Shield detection | 2 | **Accepted as observation** | Added Shield detection to Discovery collector as a warning. No special handling needed — masked values still show configuration structure. |
| Spec §16.1-16.2 | User-configurable custom objects for extraction | Spec | **Deferred to v1.1** | Requires scope configuration UI page. Auto-detection heuristic (§16.3) included in Customizations collector (Task 5.2). User-specified objects deferred. |
| Spec §23.9 (IP allowlisting) | Customer onboarding checklist + Cloud NAT | Arch §5.4 | **Deferred** | Operational concern, not application code. Added to runbook. Survey during onboarding. |

### Architecture Spec Updates Needed

> The following architecture spec sections contain stale text superseded by audited implementation plan decisions. These should be updated to match before or during Phase 0 implementation:

| Section | Stale Text | Correct Per Implementation Plan |
|---------|-----------|-------------------------------|
| §6.4 YAML | `maxRetries: 1` | `maxRetries: 0` (sweeper handles retry) |
| §8.3 | "Use Supabase's connection pooler URL" | Direct connections (custom role can't auth through PgBouncer) |
| §9.2 (end) | "Worker uses service_role which bypasses RLS" | Dedicated `extractor_worker` role via direct connections |
| §17.2 | Sweeper sets `status = 'failed'` | Sweeper sets `status = 'stalled'` (non-terminal), then `stalled → queued` or `stalled → failed` |
| §10.1 | "Pin to a specific version... Do not auto-detect" | Pin v62.0 + validate during Discovery (consistent with plan) |
