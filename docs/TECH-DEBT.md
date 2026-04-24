# RevBrain — Tech Debt & Deferred Items

> **Purpose:** Track known tech debt, deferred infrastructure items, and future platform improvements. Updated as items are resolved or added.
>
> **Last updated:** 2026-04-11

---

## Infrastructure — Not Yet Set Up

| Item                          | Impact                                                | When Needed                       | Effort                                          |
| ----------------------------- | ----------------------------------------------------- | --------------------------------- | ----------------------------------------------- |
| **Stripe keys (test + live)** | Billing flows, checkout, subscriptions non-functional | Before first paying customer      | 15 min (create account, copy keys, set secrets) |
| **Sentry DSN**                | No error tracking in production — errors are silent   | Before real users                 | 15 min (create project, set DSN)                |
| **Slack webhook**             | No ops alerts to Slack channel                        | When ops team wants notifications | 10 min                                          |

---

## System Admin — Enterprise Phase (Phase 3)

These items are scoped in [SYSTEM-ADMIN-AUDIT.md](../SYSTEM-ADMIN-AUDIT.md) and deferred by design. Each requires a mini-spec before implementation.

| Item                                | What                                                                                            | Trigger                                             |
| ----------------------------------- | ----------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| **Admin role management UI (E1)**   | Named permission sets (super_admin, support_admin, billing_admin, readonly_admin) with admin UI | When internal ops team exceeds 3-5 people           |
| **Full-write impersonation (E1)**   | Write-mode impersonation with action restrictions                                               | After admin role UI ships                           |
| **Commercial metadata (E2)**        | Contract dates, PO numbers, billing contacts on tenant entity                                   | When sales team needs CRM-like fields               |
| **Billing model extension (E2)**    | Per-project/hybrid billing models in plan schema                                                | When GTM validates commercial model beyond retainer |
| **Compliance tooling (E3)**         | Data export, tenant purge workflow, retention policy, incident runbook                          | Before F500 enterprise sales                        |
| **Approval workflows (E4)**         | Maker-checker for refunds >$500, tenant deactivation, data exports                              | When ops team exceeds 3-5 people                    |
| **PII masking (E5)**                | Role-based field masking, reveal-on-demand with audit                                           | When admin roles are decomposed                     |
| **Tenant isolation hardening (E6)** | Supabase RLS policies per table (beyond service_role), ORM query interceptor                    | Before F500 sales / SOC 2 audit                     |
| **SSO implementation (E7)**         | SAML 2.0 + OIDC for enterprise tenants, per-tenant config, JIT provisioning                     | When first enterprise deal requires SSO             |

---

## System Admin — Maturity Phase (Phase 4)

Triggered by operational needs, not scheduled.

| Item                                  | Trigger                                         |
| ------------------------------------- | ----------------------------------------------- |
| **Integration operations console**    | Migration engine reaches alpha                  |
| **Advanced notifications**            | Ops team needs Slack/webhook destinations       |
| **Bulk operations**                   | >200 tenants or >2000 users                     |
| **Sandbox/environment support**       | Enterprise customers need UAT environments      |
| **Admin global search + saved views** | Admin spends >10 min/day searching              |
| **Full entitlements engine**          | >10 enterprise deals with custom contract terms |
| **Maintenance mode**                  | First planned maintenance window                |

---

## Architecture — Services Bypass Repository Layer

**9 services** access the database directly via `getDb()` instead of using the repository pattern (`c.var.repos`). This means they always use Drizzle, even on Edge Functions where PostgREST is the primary engine.

**Current workaround (Option B):** The repository middleware calls `initDB()` when PostgREST is selected, so both engines are ready. Services using `getDb()` work because the Drizzle connection is warmed up alongside PostgREST. One-line fix in `apps/server/src/repositories/middleware.ts`.

**Proper fix (Option A — deferred):** Refactor services to receive their database dependency through the request context (repos) instead of importing it globally. This is a significant effort (~100+ `getDb()` calls across 9 services) but would make the services runtime-agnostic and eliminate the dual-engine overhead on Edge.

| Service                    | `getDb()` calls | User-facing routes              | Priority                                   |
| -------------------------- | --------------- | ------------------------------- | ------------------------------------------ |
| `billing.service.ts`       | ~50             | `/billing/*`                    | Medium (guarded by `isStripeConfigured()`) |
| `coupon.service.ts`        | ~20             | `/billing/validate-coupon`      | Low                                        |
| `ticket.service.ts`        | ~15             | `/support/tickets/*`            | Medium                                     |
| `lead.service.ts`          | ~12             | `/leads/contact-sales` (public) | Medium                                     |
| `limits.service.ts`        | ~1              | `/billing/usage`                | Low                                        |
| `job-queue.service.ts`     | ~15             | `/admin/jobs/*` (admin only)    | Low                                        |
| `cron.service.ts`          | ~10             | Background only                 | Low                                        |
| `webhook-retry.service.ts` | ~12             | Webhook handler only            | Low                                        |
| `auth.service.ts`          | ~1              | Registration flow               | Low                                        |

Also: `routes/admin/notifications.ts`, `routes/health.ts`, `routes/project-files.ts` use `getDb()` directly in route handlers.

---

## Code Quality — Known Issues

| Item                                    | Location                                                     | Impact                                                                                                                                                                                                                                                                   | Priority                                                              |
| --------------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------- |
| **Edge Function cold start (~2.7s)**    | Supabase Edge Runtime baseline startup                       | Fully optimized with Procure pattern: schema-only DB exports, PostgREST repos, dynamic postgres.js import. Cold start: 3.5s→2.7s. Warm requests: 3.6s→1.2s (67% faster). Remaining 2.7s is the Supabase Edge Runtime baseline — cannot be reduced from application code. | Low — acceptable for production, warm requests are fast               |
| **In-app notifications (2.17-2.18)**    | Not yet built                                                | Admins discover issues only by checking dashboard                                                                                                                                                                                                                        | Low — slippable, build when needed                                    |
| **File download/move in DocumentsView** | `apps/client/src/features/docs/components/DocumentsView.tsx` | Download and move-to-folder buttons are wired but have no implementation                                                                                                                                                                                                 | Core product — implement with file management feature                 |
| **Lead → Tenant conversion**            | `apps/server/src/services/lead.service.ts:402`               | Won leads are marked as won but don't auto-create a tenant org                                                                                                                                                                                                           | Core product — wire OnboardingService when lead pipeline is built     |
| **Client-side Sentry**                  | `apps/client/src/components/error-boundary.tsx`              | Error boundary catches errors but doesn't report to Sentry                                                                                                                                                                                                               | Blocked on Sentry setup                                               |
| **Remote storage/DB adapters**          | `apps/client/src/lib/adapters/remote/storage.ts`, `db.ts`    | Stub adapters that throw — data goes through API, not direct client access                                                                                                                                                                                               | May never be needed — API-first architecture                          |
| **TanStack Virtual warning**            | `use-virtual-list.ts` — incompatible-library ESLint warning  | 1 ESLint warning, not an error                                                                                                                                                                                                                                           | Low — third-party library issue                                       |
| **Step-up auth mechanism**              | Uses JWT `iat` claim as proxy for last MFA time              | Works but not a true MFA re-challenge — requires session refresh                                                                                                                                                                                                         | Acceptable for now; upgrade when MFA is enforced                      |
| **SPA chunk 404 across deploys**        | Vercel SPA deployments — lazy-loaded chunks                  | When a new deployment changes Vite chunk hashes, users mid-session get 404s on lazy imports because the old chunk names no longer exist. Needs an error boundary that detects chunk load failures and triggers a full page reload.                                       | Before production launch — affects any user mid-session during deploy |
| **Test coverage %**                     | Unknown — not formally measured                              | Cannot assert coverage targets                                                                                                                                                                                                                                           | Low — 889+ tests exist, critical paths covered                        |

---

## BB-3 (Migration Planner IR Normalizer) — Deferred Items

BB-3 Wave 1 is **shipped end-to-end** (PH0–PH9 complete; see [docs/BB3-COMPLETION-STATUS.md](BB3-COMPLETION-STATUS.md)). The remaining items below are intentional deferrals — none of them block Wave 1 sign-off.

| Item                                               | Spec ref                              | Why deferred — honestly                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Trigger to fix                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| -------------------------------------------------- | ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`ir_graph` column encryption at rest (§17)**     | `assessment_runs.ir_graph`            | **Not actually a real gap today**, despite what the spec literally says. The upstream `assessment_findings.text_value` column ([migration 0042](../supabase/migrations/0042_assessment_extraction_tables.sql) line 205) holds the same Apex / QCP / formula source in plaintext `TEXT` — explicitly comment-marked "Verbatim source for LLM (QCP, Apex, formulas, etc.)". Encrypting `ir_graph` in isolation while leaving the upstream source plaintext would be theater: anyone with the read access to one has read access to the other. The realistic threat today is "someone with the service-role key", and pgcrypto wouldn't defend against that anyway. The realistic defense in place today is Supabase RLS on `assessment_runs` + service-role-key gating + no client-side direct access (everything goes through the edge function with auth). That's the appropriate control level for the current threat model. | First paying tenant whose contract or compliance posture (SOC 2 / ISO 27001 / a customer security questionnaire) requires field-level encryption of customer source code. **What lands then:** a single PR encrypting the **whole data path** at once — `assessment_findings.text_value`, `ir_graph`, any LLM enrichment summaries, plus storage-bucket files. Mechanism choice (pgcrypto vs KMS-envelope) deferred to that day because it depends on the customer's compliance bar. Estimate at that point: ~1 week of focused work, not the 1-day shortcut of just wrapping `ir_graph`. |
| **Synthetic parent `NodeRef` resolution pass**     | Stage 4                               | Wave 1–3 normalizers build synthetic `{id: 'bundle:${code}', resolved: true}` for some parent pointers. PH9.3 ([parent-lookup.ts](../packages/bb3-normalizer/src/stages/parent-lookup.ts)) resolves the most common ones (BundleOption / BundleFeature → BundleStructure, PriceCondition → PricingRule, etc.). A handful of less-common edges remain unresolved — they don't break anything because the validator's V5 rule only enforces `CyclicDependencyIR.members` resolution.                                                                                                                                                                                                                                                                                                                                                                                                                                            | When BB-4 / BB-17 start traversing those specific edges and hit an unresolved synthetic id. Each new edge type is a one-line `PARENT_WIRING_RULES` entry plus a unit test.                                                                                                                                                                                                                                                                                                                                                                                                                |
| **PDF report → IR graph (single source of truth)** | `apps/worker/src/report/assembler.ts` | The PDF assembler currently reads directly from the flat `AssessmentFinding[]` array via `get('ApexClass')` / `get('Flow')` / etc. Adding N new findings to the extractor can silently change the PDF output — discovered 2026-04-11 when EXT-CC4 added 1565 third-party Apex findings and the PDF grew from 36 to 111 pages with no source-code change to the report layer. Not a correctness issue on well-known flows, but a class of bug the current architecture cannot prevent. Deferred per CTO decision to fix what's broken now and plan the architectural move separately. **Migration approach: dual-path.** When the graph-sourced PDF lands, run it side-by-side with the current findings-sourced PDF, only delete the old path once both produce byte-identical output across 3+ real staging runs. See [docs/PDF-AND-GRAPH-DECISIONS.md](PDF-AND-GRAPH-DECISIONS.md#decision-1) for the decision log.         | Before BB-4 / BB-5 / BB-6 start consuming the graph in production, OR when a second extraction-side change causes another silent PDF shift. Effort ~5-7 eng-days for the `ReportInputGraph` adapter + per-section migration + parity testing.                                                                                                                                                                                                                                                                                                                                             |

---

## Database — Known Items

| Item                        | Status                                          | Notes                                                                                                                                                               |
| --------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **RLS policies**            | Service_role full access on all tables          | Authenticated-user policies only on `plans` (read) and `organizations` (own-org read). More granular policies needed if direct Supabase client access is ever used. |
| **Audit log immutability**  | INSERT + SELECT only for service_role           | Application-level guard. DB-level immutability (no UPDATE/DELETE for any role) confirmed via RLS.                                                                   |
| **`_seed_runs` table**      | Exists on STG only                              | Operational tracking for seeder. Not in Drizzle schema (managed by seeder).                                                                                         |
| **Storage bucket policies** | `project-files` bucket created, no RLS policies | Bucket is private. Access goes through edge function (service_role). Add storage policies if direct client uploads are needed.                                      |

---

## Resolved Items (for reference)

| Item                                   | Resolution                                                                                              | Date       |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------- | ---------- |
| Phase 0: 11 bug fixes + security fixes | All shipped                                                                                             | 2026-03-19 |
| Phase 1: MVP (14 tasks)                | All shipped including MFA, isolation audit, live dashboard                                              | 2026-03-20 |
| Phase 2: Launch (23 tasks)             | All shipped including impersonation, permissions, audit viewer, overrides                               | 2026-03-21 |
| Database seeder (17 tasks)             | Full implementation with auth reconciliation and RLS verification                                       | 2026-03-21 |
| Supabase setup (STG + PRD)             | Schema, RLS, storage, edge functions, auth config                                                       | 2026-03-22 |
| Vercel setup (STG + PRD)               | Domains live, env vars, auto-deploy disabled                                                            | 2026-03-22 |
| Resend setup                           | API key, domain verified, test email sent                                                               | 2026-03-22 |
| GitHub CI/CD                           | CI gates CD, all green                                                                                  | 2026-03-22 |
| Domain rename (.com → .ai)             | All references updated                                                                                  | 2026-03-22 |
| Env file restructure                   | .env.local / .env.stg / .env.prod                                                                       | 2026-03-22 |
| PostgREST repository stubs             | Replaced all 5 stubs with real implementations (SF connections, secrets, OAuth flows, logs, assessment) | 2026-04-01 |
| Edge Function 500s on staging          | Fixed: PostgREST stubs, billing guard, `initDB()` warmup in middleware                                  | 2026-04-01 |
| Staging E2E test suite                 | Comprehensive Playwright tests for all roles against real staging                                       | 2026-04-01 |
