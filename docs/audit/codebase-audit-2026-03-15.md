# RevBrain Codebase Audit — 2026-03-15

> Comprehensive assessment of the RevBrain engineering SaaS platform.
> Previous audit: 2026-02-17 (zero-trust, scored 6.4/10).

---

## Executive Summary

| Category           | Score      | Trend | Notes                                                       |
| ------------------ | ---------- | ----- | ----------------------------------------------------------- |
| **Security**       | 7.5/10     | →     | Solid auth/RBAC, rate limiting in-memory only               |
| **Code Quality**   | 5.5/10     | ↑     | 310 TS bypasses (down from 237+), legacy cleanup underway   |
| **Performance**    | 5.5/10     | →     | 8GB heap required for builds, large legacy components       |
| **Infrastructure** | 7.0/10     | →     | Supabase + Vercel, no IaC or disaster recovery              |
| **Testing**        | 8.0/10     | ↑     | 21 E2E + 36 unit test files, CI coverage gates              |
| **DevOps**         | 6.0/10     | ↑     | CI/CD pipeline complete, no blue-green deploys              |
| **Architecture**   | 7.5/10     | ↑     | Clean feature-based structure, service layer, Zod contracts |
| **Overall**        | **6.7/10** | ↑     | Up from 6.4 — legacy client deleted, bugs fixed             |

---

## 1. Project Overview

**Product:** Multi-tenant SaaS for civil engineering calculations and project management.

**Monorepo structure:**

| App/Package         | Purpose        | Files      | Key Tech                                           |
| ------------------- | -------------- | ---------- | -------------------------------------------------- |
| `apps/client`       | React SPA      | 583 TS/TSX | React 19, Vite 7, Tailwind 4, Zustand, React Query |
| `apps/server`       | API server     | 137 TS     | Hono 4, Drizzle ORM, Stripe, Supabase              |
| `apps/dxf-parser`   | DXF parsing    | Python     | Vercel serverless                                  |
| `packages/contract` | Shared schemas | Zod v4     | Validation contracts                               |
| `packages/database` | DB schema      | Drizzle    | Type-safe queries                                  |

**Hosting:** Supabase (Postgres, Auth, Storage, Edge Functions) + Vercel (frontend + DXF parser)

---

## 2. Tech Stack Versions

| Component           | Version | Status                                |
| ------------------- | ------- | ------------------------------------- |
| React               | 19.2.0  | Current                               |
| Vite                | 7.2.4   | Current                               |
| TypeScript (client) | 5.9.3   | Current                               |
| TypeScript (server) | 5.3.3   | **Outdated** — should match client    |
| Hono                | 4.1.1   | Current                               |
| Zod                 | 4.3.6   | Current (unified across all packages) |
| Drizzle ORM         | 0.29.1  | Pinned                                |
| Stripe SDK          | 20.3.0  | Current                               |
| Playwright          | 1.58.1  | Current                               |
| Tailwind CSS        | 4.1.18  | Current                               |
| Node.js             | ≥18.0.0 | Current                               |
| pnpm                | 8.15.0  | Current                               |

---

## 3. Database

- **Engine:** PostgreSQL via Supabase
- **Migrations:** 41 sequential files (0000–0040)
- **Tables:** 33
- **Indexes:** 157

### Key Tables

| Domain       | Tables                                                 |
| ------------ | ------------------------------------------------------ |
| Auth & Users | profiles, users, organizations                         |
| Projects     | projects, project_files, calculation_results           |
| Engineering  | walls, boq_items                                       |
| Billing      | subscriptions, payment_history, coupons, coupon_usages |
| Operations   | tasks, work_logs, bills, bill_items, execution_bills   |
| Support      | support_tickets, ticket_messages                       |
| CRM          | leads, lead_activities                                 |
| System       | audit_logs, job_queue                                  |
| Chat         | chat_groups, chat_messages                             |

---

## 4. API Surface

- **Total route files:** 29
- **Total services:** 32
- **Middleware layers:** 10 (auth, RBAC, rate-limit, security headers, body-limit, cache, logger, timeout, limits, UUID validation)

### Rate Limiting (8 limiters, in-memory)

| Limiter        | Limit    | Window | Key  |
| -------------- | -------- | ------ | ---- |
| Auth           | 10/min   | 60s    | IP   |
| API            | 1000/min | 60s    | User |
| Invites        | 30/15min | 900s   | User |
| List           | 100/min  | 60s    | User |
| Admin          | 10/hour  | 3600s  | User |
| Tenant API     | 5000/min | 60s    | Org  |
| Tenant Billing | 20/hour  | 3600s  | Org  |
| Tenant Export  | 10/hour  | 3600s  | Org  |

### Audit Logging (23 actions)

User: invited, activated, deleted, profile_updated, password_changed, login, deactivated · Invite: resent · Org: created · Tenant: updated, deactivated · Subscription: created, updated, canceled, plan_changed, reactivated · Payment: succeeded, failed · Coupon: created, updated, deleted · Lead: submitted, updated, converted

---

## 5. Client Architecture

### Feature Modules (15)

admin, auth, billing, boq, dashboard, docs, execution, help, modules, org, projects, settings, tasks, users, worklogs

### Engineering Calculation Modules (Legacy)

Drainage Channels, Reinforced Walls, MSE Walls, Paving, Earthworks, and 15+ more — wrapped in `LegacyModuleWrapper` with API auto-save (60s debounce).

### State Management

- **Zustand:** 3 stores (auth, service-config, sidebar)
- **React Query:** API data caching
- **Context API:** i18n (Hebrew/English)

---

## 6. Testing

| Type          | Files | Coverage                      | CI Stage    |
| ------------- | ----- | ----------------------------- | ----------- |
| Unit (server) | ~20   | 50%+ threshold                | `test` job  |
| Unit (client) | ~16   | Stores/hooks/lib              | `test` job  |
| E2E smoke     | 1     | Critical paths                | Every PR    |
| E2E full      | 21    | Auth, billing, admin, modules | Main branch |
| Accessibility | 1     | WCAG 2.1 AA (axe-core)        | Full suite  |

### CI Pipeline (4 jobs)

1. **quality** — lint, format, typecheck
2. **test** — unit tests with coverage
3. **e2e-smoke** — smoke tests on every PR
4. **e2e-full** — full suite on main (requires GitHub secrets)

---

## 7. Security Assessment

### Strengths

- JWT auth via Supabase with token refresh
- RBAC middleware on all protected routes
- Zod validation on all API inputs
- Security headers (HSTS, X-Frame-Options, CSP, CORP)
- Stripe webhook signature verification
- Request body size limits
- 23-action audit trail
- npm audit in CI (blocks on high-severity)

### Weaknesses

- Rate limiting is **memory-only** (resets on server restart, no Redis)
- No timing-safe comparison for webhook secrets
- No API key management for machine-to-machine
- No soft-delete pattern (hard deletes only)

---

## 8. Critical Issues

### Blockers (must fix before scaling)

| #   | Issue                                            | Severity | Category       |
| --- | ------------------------------------------------ | -------- | -------------- |
| 1   | 310 TypeScript bypasses (@ts-ignore/@ts-nocheck) | High     | Code Quality   |
| 2   | Server TypeScript 5.3.3 vs client 5.9.3          | Medium   | Dependencies   |
| 3   | Memory-only rate limiting (needs Redis)          | High     | Security       |
| 4   | No disaster recovery plan or runbook             | High     | Infrastructure |
| 5   | No Infrastructure as Code (Terraform)            | Medium   | Infrastructure |
| 6   | 8GB heap needed for builds (memory pressure)     | Medium   | Performance    |
| 7   | Large legacy components (monolithic views)       | Medium   | Performance    |
| 8   | OpenAPI coverage ~15% (most routes undocumented) | Medium   | DevOps         |

### Recently Fixed (since Feb 17 audit)

- Zod v3/v4 version split → **unified on v4** across all packages
- `apps/client-legacy/` dead code (380 files, 1.5M lines) → **deleted**
- Infinite `useEffect` loop in WallContext.tsx → **fixed** (cloudFileUpload ref)
- Auto-save debounce adjusted from 2s to 60s (intentional)
- E2E test for drainage channels file upload → **passing reliably**

---

## 9. Dependency Summary

| Package | Prod Deps | Dev Deps |
| ------- | --------- | -------- |
| Client  | 49        | 24       |
| Server  | 15        | 9        |
| Root    | —         | 12       |

Notable: Three.js, Leaflet, Konva, Fortune Sheet (spreadsheet) for engineering visualization.

---

## 10. Deployment Architecture

```
GitHub (develop/main)
  ├── CI: quality → test → e2e-smoke (PRs)
  ├── CI: quality → test → e2e-smoke → e2e-full (main)
  └── Deploy:
      ├── Supabase: migrations + edge functions (develop→dev, main→prod)
      ├── Vercel: client SPA
      └── Vercel: DXF parser (Python)
```

No blue-green deploys. No rollback procedures. No feature flags.

---

## 11. Recommendations (Priority Order)

1. **Align server TypeScript** to 5.9.3 (matches client, enables latest features)
2. **Reduce TS bypasses** — target <100 by next audit
3. **Add Redis** for rate limiting (or Upstash for serverless)
4. **Write disaster recovery runbook** (backup strategy, restore procedure)
5. **Break up large components** (WallDataLoader.tsx is 3500+ lines)
6. **Expand OpenAPI** coverage to at least 50%
7. **Add feature flags** for safe rollouts
8. **Infrastructure as Code** (Terraform for Supabase + Vercel)

---

## 12. Score Comparison

| Category       | Feb 17  | Mar 15  | Change                   |
| -------------- | ------- | ------- | ------------------------ |
| Security       | 7.8     | 7.5     | ↓ (stricter criteria)    |
| Code Quality   | 5.2     | 5.5     | ↑ (legacy deleted)       |
| Performance    | 5.8     | 5.5     | ↓ (no progress)          |
| Infrastructure | 7.2     | 7.0     | →                        |
| Testing        | 8.0     | 8.0     | →                        |
| DevOps         | 5.0     | 6.0     | ↑ (CI pipeline improved) |
| **Overall**    | **6.4** | **6.7** | **↑ 0.3**                |

---

_Next audit scheduled: 2026-04-15_
