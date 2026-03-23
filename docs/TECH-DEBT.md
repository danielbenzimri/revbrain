# RevBrain — Tech Debt & Deferred Items

> **Purpose:** Track known tech debt, deferred infrastructure items, and future platform improvements. Updated as items are resolved or added.
>
> **Last updated:** 2026-03-23

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

## Code Quality — Known Issues

| Item                                 | Location                                                              | Impact                                                            | Priority                                         |
| ------------------------------------ | --------------------------------------------------------------------- | ----------------------------------------------------------------- | ------------------------------------------------ |
| **In-app notifications (2.17-2.18)** | Not yet built                                                         | Admins discover issues only by checking dashboard                 | Low — slippable, build when needed               |
| **Geometrix CSS warning**            | `use-virtual-list.ts` — TanStack Virtual incompatible-library warning | ESLint warning (1), not an error                                  | Low — third-party library issue                  |
| **Dual mock system**                 | `LocalAPIAdapter` (client) vs mock server (server)                    | LocalAPIAdapter reduced to auth-only stub; mock server is primary | Resolved — documented in code                    |
| **Step-up auth mechanism**           | Uses JWT `iat` claim as proxy for last MFA time                       | Works but not a true MFA re-challenge — requires session refresh  | Acceptable for now; upgrade when MFA is enforced |
| **Test coverage %**                  | Unknown — not formally measured                                       | Cannot assert coverage targets                                    | Low — 889+ tests exist, critical paths covered   |

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

| Item                                   | Resolution                                                                | Date       |
| -------------------------------------- | ------------------------------------------------------------------------- | ---------- |
| Phase 0: 11 bug fixes + security fixes | All shipped                                                               | 2026-03-19 |
| Phase 1: MVP (14 tasks)                | All shipped including MFA, isolation audit, live dashboard                | 2026-03-20 |
| Phase 2: Launch (23 tasks)             | All shipped including impersonation, permissions, audit viewer, overrides | 2026-03-21 |
| Database seeder (17 tasks)             | Full implementation with auth reconciliation and RLS verification         | 2026-03-21 |
| Supabase setup (STG + PRD)             | Schema, RLS, storage, edge functions, auth config                         | 2026-03-22 |
| Vercel setup (STG + PRD)               | Domains live, env vars, auto-deploy disabled                              | 2026-03-22 |
| Resend setup                           | API key, domain verified, test email sent                                 | 2026-03-22 |
| GitHub CI/CD                           | CI gates CD, all green                                                    | 2026-03-22 |
| Domain rename (.com → .ai)             | All references updated                                                    | 2026-03-22 |
| Env file restructure                   | .env.local / .env.stg / .env.prod                                         | 2026-03-22 |
