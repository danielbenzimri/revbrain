# RevBrain System Admin Platform — Comprehensive Audit & Spec

> **Purpose:** Full audit of the `system_admin` administration platform — covering current state, broken items, and gaps to meet best-in-class enterprise RevOps SaaS standards. Written for external reviewers who need to understand the system without access to the codebase.
>
> **Product:** RevBrain — a multi-tenant SaaS platform for migrating enterprise customers from Salesforce CPQ (Configure, Price, Quote) to Revenue Cloud Advanced (RCA). Serves Revenue Operations teams at mid-to-enterprise companies.
>
> **Origin:** Forked from Geometrix (construction SaaS). All construction domain code removed. Platform envelope (auth, billing, multi-tenancy, roles) carried forward and adapted.
>
> **Control Plane Vision:** The system admin platform is the internal control plane for operating RevBrain safely at scale — across customer lifecycle, commercial operations, migration health, support, and compliance. It is distinct from the tenant-facing application and must enforce safety, auditability, least privilege, and domain visibility at every layer.
>
> **Date:** 2026-03-19 | **Auditor:** Claude (AI-assisted code review) | **Revision:** 3.1 final (post dual external review)

---

## Table of Contents

**Part A — Current State**

1. [Architecture Overview](#1-architecture-overview)
2. [System Admin Functional Inventory](#2-system-admin-functional-inventory)
3. [Platform Infrastructure Already Implemented](#3-platform-infrastructure-already-implemented)
4. [File Structure & Code Organization](#4-file-structure--code-organization)

**Part B — Broken Items** 5. [Critical Bugs in Client Code](#5-critical-bugs-in-client-code) 6. [Server-Side Security Findings](#6-server-side-security-findings) 7. [UI Quality Issues](#7-ui-quality-issues)

**Part C — Gaps for Best-in-Class** 8. [Readiness Assessment](#8-readiness-assessment) 9. [Tenant Isolation Verification](#9-tenant-isolation-verification) 10. [Admin Account Security (MFA / Step-Up Auth)](#10-admin-account-security) 11. [Authorization Model: Tenant Roles vs Internal Admin Permissions](#11-authorization-model) 12. [Tenant Impersonation with Governance](#12-tenant-impersonation-with-governance) 13. [Audit Trail Maturity](#13-audit-trail-maturity) 14. [Entitlements vs Plans](#14-entitlements-vs-plans) 15. [Billing Model Flexibility](#15-billing-model-flexibility) 16. [Mock Service Completeness](#16-mock-service-completeness) 17. [Admin Dashboard & Observability](#17-admin-dashboard--observability) 18. [Tenant Lifecycle Depth](#18-tenant-lifecycle-depth) 19. [Support Operations Maturity](#19-support-operations-maturity) 20. [Compliance & Data Governance](#20-compliance--data-governance) 21. [Plan Features Without Implementation (SSO, Custom Branding)](#21-plan-features-without-implementation) 22. [Job Queue Admin Visibility](#22-job-queue-admin-visibility) 23. [Integration & Migration Operations](#23-integration--migration-operations) 24. [Operational Notifications](#24-operational-notifications) 25. [Approval Workflows for Sensitive Actions](#25-approval-workflows) 26. [Environment & Sandbox Strategy](#26-environment--sandbox-strategy)

**Part D — Spec & Roadmap** 27. [Fix Spec — Broken Items](#27-fix-spec--broken-items) 28. [Build Spec — Phased](#28-build-spec--phased) 29. [Roadmap: MVP → Launch → Enterprise → Maturity](#29-roadmap)

**Part E — Reference** 30. [Non-Functional Requirements](#30-non-functional-requirements) 31. [Source of Truth Matrix](#31-source-of-truth-matrix) 32. [Sensitive Actions Matrix](#32-sensitive-actions-matrix) 33. [Internal Personas](#33-internal-personas) 34. [Idempotency & Concurrency Guidance](#34-idempotency--concurrency-guidance) 35. [API Conventions](#35-api-conventions) 36. [Schema Change Protocol](#36-schema-change-protocol) 37. [Accessibility Target](#37-accessibility-target) 38. [Competitive Capability Benchmark](#38-competitive-capability-benchmark)

**Appendices**

- [A: Complete File Inventory](#appendix-a-complete-file-inventory)
- [B: Auditor Feedback Triage](#appendix-b-auditor-feedback-triage)
- [C: Glossary](#appendix-c-glossary)

---

# PART A — CURRENT STATE

## 1. Architecture Overview

### 1.1 Tech stack

| Layer                | Technology                                          | Notes                                               |
| -------------------- | --------------------------------------------------- | --------------------------------------------------- |
| Client               | React 18 + TypeScript                               | Vite bundler, single-page application               |
| UI Components        | Tailwind CSS + shadcn/ui                            | Consistent design system, violet/purple palette     |
| State Management     | Zustand (client state) + React Query (server state) | Query caching with configurable stale times         |
| Internationalization | react-i18next                                       | Full English + Hebrew (RTL) localization            |
| Server               | Hono (TypeScript)                                   | Lightweight, fast HTTP framework                    |
| Validation           | Zod                                                 | Shared schemas in contract package                  |
| Database             | Supabase (PostgreSQL)                               | With Drizzle ORM for schema management              |
| Auth                 | Supabase Auth                                       | JWT-based, magic links, TOTP MFA supported natively |
| Payments             | Stripe                                              | Subscriptions, checkout, billing portal, webhooks   |
| Email                | Resend                                              | Async delivery via job queue                        |
| File Storage         | Supabase Storage                                    | Per-tenant scoping                                  |
| Testing              | Vitest (unit/integration) + Playwright (E2E)        | 65 test files, ~3,880 lines of test code            |

### 1.2 Monorepo structure

```
revbrain/
├── apps/
│   ├── client/                    # React SPA
│   │   └── src/
│   │       ├── features/admin/    # System admin pages + components + hooks
│   │       ├── features/billing/  # Self-service billing
│   │       ├── features/org/      # Self-service team management
│   │       ├── features/settings/ # User settings
│   │       ├── components/layout/ # Sidebar, layout, shared UI
│   │       ├── lib/services/      # API adapters (local + remote)
│   │       ├── locales/           # en/ + he/ translation files
│   │       └── stores/            # Zustand state stores
│   └── server/                    # Hono API server
│       └── src/
│           ├── v1/routes/admin/   # Admin API endpoints
│           ├── v1/routes/         # Self-service API endpoints
│           ├── middleware/        # Auth, RBAC, rate limiting, limits
│           ├── services/          # Business logic (billing, limits, jobs, etc.)
│           ├── repositories/      # Data access (mock + Drizzle)
│           └── mocks/             # Seed data for mock mode
├── packages/
│   └── contract/                  # Shared types, schemas, repository interfaces
└── e2e/                           # Playwright end-to-end tests
```

### 1.3 Dual-adapter architecture

RevBrain runs in two modes:

- **Mock mode** (`MOCK_MODE=true`): In-memory data stores, no database or Stripe. Used for local development and CI.
- **Production mode**: Supabase database, real Stripe, real email.

**Architectural decision (v3.1):** Two parallel mock systems exist (client-side `LocalAPIAdapter` and server-side mock repositories). **We will standardize on the server-side mock** as the primary development path. `LocalAPIAdapter` will be reduced to auth-only simulation. All realistic development and testing will use `dev:real` (client + mock server). This eliminates the behavior divergence risk between mock systems. See M2 build spec.

### 1.4 Role hierarchy

| Role           | Scope          | Purpose                                    | Can Invite                      |
| -------------- | -------------- | ------------------------------------------ | ------------------------------- |
| `system_admin` | Platform-wide  | Manages all tenants, users, plans, billing | All roles                       |
| `org_owner`    | Organization   | Owns the org, manages billing and team     | `admin`, `operator`, `reviewer` |
| `admin`        | Organization   | Manages org settings and team              | `operator`, `reviewer`          |
| `operator`     | Project-scoped | Executes migration work                    | Nobody                          |
| `reviewer`     | Project-scoped | Reviews and approves migration results     | Nobody                          |

Defined in `packages/contract/src/index.ts`. See Section 11 for the architectural decision to separate tenant roles from internal admin permissions.

### 1.5 Multi-tenant data isolation

Tenant isolation is **designed** to be enforced at multiple layers:

1. **Auth middleware** — extracts `organizationId` from JWT and attaches to request context
2. **Repository layer** — all repositories implement `findByOrganization(orgId)` and filter by `organizationId`
3. **Service layer** — business logic receives org context from middleware, scopes all queries
4. **Mock repositories** — support `organizationId` filtering in `ALLOWED_FILTERS`

The architecture uses shared tables with tenant ID filtering (not schema-per-tenant).

**Verification status:** The isolation design is implemented consistently across repositories, but **formal verification has not been completed**. The unscoped `findById(id)` method exists alongside scoped `findByOrganization(orgId)` — if any route handler uses `findById()` with a user-supplied ID without verifying org membership, cross-tenant data access is possible. This is the most common multi-tenant vulnerability pattern and **must be verified before the first customer**. See Section 9.

---

## 2. System Admin Functional Inventory

### 2.1 Admin Dashboard (`/admin`)

**Status:** Shell — hardcoded data, partially hidden. 4 static stat cards, "Onboard Tenant" CTA, two hidden sections with placeholder data.

### 2.2 Tenant Management (`/admin/tenants`)

**Status:** Functional. List with search, 3-step onboarding wizard, edit drawer (name, plan, seat limit, active toggle), soft-deactivation. Server: atomic org+user creation, paginated list, seat management with grace period.

### 2.3 User Management (`/admin/users`)

**Status:** Functional with bugs. List with search/filter, invite drawer (platform admin toggle + org member), detail drawer (view/edit/delete). **Bugs:** duplicate roles array, incomplete role selector. See Section 5.

### 2.4 Pricing Plans (`/admin/pricing`)

**Status:** Functional. Plan cards with edit, 3-section editor (basic info, limits, work modules), Stripe sync. Work modules already RevBrain-aligned (cpq_migration, data_validation, etc.).

### 2.5 Coupons & Promotions (`/admin/coupons`)

**Status:** Functional. Full coupon lifecycle: create (4-section editor), edit (frozen core terms), delete (soft), Stripe sync, usage tracking. No mock backend data.

### 2.6 Support Tickets (`/admin/support`)

**Status:** Functional. Stats cards, filtered list, ticket detail with replies, internal notes, assignment, status/priority management. No mock backend data.

### 2.7 Admin Billing (`/admin/billing`)

**Status:** Payment detail view and refund endpoint only (admin-side). Full billing pipeline exists in self-service routes.

---

## 3. Platform Infrastructure Already Implemented

### 3.1 Stripe billing pipeline (complete)

`billing.service.ts` (1,690 lines): customer creation, checkout sessions, subscription management (create/change/cancel/reactivate), billing portal, payment history, plan-to-Stripe sync, webhook handling (6 event types), idempotent processing with event dedup, proration. **This is a complete billing pipeline, not a stub.**

### 3.2 Feature gating (complete)

`limits.service.ts` + `limits.ts` middleware: `requireFeature()`, `requireUserCapacity()`, `requireProjectCapacity()`, `requireStorageCapacity()`, `requireActiveSubscription()`. Plan features are **enforced at the middleware level** — gating is real, not cosmetic.

### 3.3 Test coverage (65 test files, ~3,880 lines)

52 server unit/integration tests + 13 E2E Playwright tests. Notable: `billing-limits.spec.ts` (400 lines), `permissions.spec.ts` (390 lines), `coupon-management.spec.ts` (341 lines). **Coverage percentage has not been formally measured.** Whether the test suite includes cross-tenant isolation tests needs to be confirmed.

### 3.4 Async job queue (complete)

`job-queue.service.ts`: database-backed queue with email, webhook, report, cleanup job types. Distributed locking, configurable retries, priority processing, scheduled execution.

### 3.5 Self-service tenant administration (complete)

Org owners self-serve: invite team, subscribe, change/cancel plan, manage payment methods, view invoices, view usage, edit profile, change password, delete account. **RevBrain does not require system admin for routine tenant operations.**

### 3.6 Audit logging (partial)

`AuditLogRepository` with `AuditLogEntity`. Currently logged: 4 of ~20 admin actions. No before/after diffs. No admin viewer UI. No immutability guarantee. See Section 13.

### 3.7 Localization (complete)

Full English + Hebrew with RTL awareness. 400+ admin translation keys. 2 files have RTL bugs (Section 7).

---

## 4. File Structure & Code Organization

Admin UI: 22 files (~4,400 lines) | Server admin routes: 7 files (~1,800 lines) | Mock layer: 12 files (~1,100 lines) | Contract: 2 files (~660 lines). See Appendix A for full inventory.

---

# PART B — BROKEN ITEMS

## 5. Critical Bugs in Client Code

### 5.1 Duplicate ALL_ROLES array (Medium)

**Files:** `AdminUserListPage.tsx:18-30`, `UserDetailDrawer.tsx:34-46`
11-element array with duplicates instead of 5 correct roles. Import from `@revbrain/contract` instead.

### 5.2 CreateUserDrawer only offers org_owner (High)

**File:** `CreateUserDrawer.tsx:248-253`
Role selector shows only org_owner (twice). Missing: admin, operator, reviewer. All translation keys exist.

### 5.3 Missing CSS border class (Low)

~15 locations use `border-slate-200` without `border` base class.

## 6. Server-Side Security Findings

### 6.1 `canInviteRole()` not wired (High)

Role hierarchy function exported but never called in invitation flow.

### 6.2 Orphaned user hardcoded to admin role (High)

Legacy mock token handler auto-creates missing users with `role: 'admin'`. Should default to `reviewer` or reject.

### 6.3 Refund over-payment possible (High)

No validation that `amountCents <= refundableAmountCents` before Stripe API call.

### 6.4 Missing null checks (Medium)

`c.get('user')` used without guard in `tenants.ts:134`, `support.ts:310`.

### 6.5 Support filter values unvalidated (Medium)

Status, priority, category query params accepted as freeform strings.

### 6.6 Rate limiting gaps (Medium)

Missing `adminLimiter` on support/coupon/tenant mutation endpoints.

## 7. UI Quality Issues

7.1 RTL bugs in 2 files | 7.2 Duplicate shadow-sm (6 instances) | 7.3 Off-brand coupon styling (amber) | 7.4 Hidden dashboard sections

---

# PART C — GAPS FOR BEST-IN-CLASS

## 8. Readiness Assessment

| Layer                        | Completion | Notes                                                          |
| ---------------------------- | ---------- | -------------------------------------------------------------- |
| **UI admin shell**           | 75-80%     | Pages exist; bugs in roles and CSS                             |
| **Backend admin operations** | 65-70%     | CRUD complete; validation/error handling gaps                  |
| **Platform infrastructure**  | 70-75%     | Billing, feature gating, job queue, auth, tests solid          |
| **Enterprise control plane** | 30-40%     | Missing: impersonation, admin permissions, audit maturity, MFA |
| **RevOps-domain operations** | 20-30%     | Migration engine not yet built; admin has no domain visibility |
| **Compliance posture**       | 25-35%     | Audit logs exist but immature; no GDPR workflow                |

---

## 9. Tenant Isolation Verification

### 9.1 Current design

Isolation via `organizationId` scoping at middleware, repository, and service layers.

### 9.2 What's unverified

| Question                               | Status                                                                                |
| -------------------------------------- | ------------------------------------------------------------------------------------- |
| Can `findById(id)` bypass org scoping? | **Unverified** — repositories have unscoped `findById()`. Route handler audit needed. |
| Is Supabase RLS enabled?               | **Unknown** — if enabled, provides DB-level guarantee.                                |
| Cross-tenant boundary tests exist?     | **Unknown**                                                                           |
| File storage scoping enforced?         | **Unverified**                                                                        |
| Admin cross-tenant search governance?  | **Undefined**                                                                         |

### 9.3 Phased actions

**MVP (must ship before first customer):**

- Confirm RLS status on Supabase
- Audit all route handlers for unscoped `findById()` usage
- Add `tenant-isolation.spec.ts` — creates two tenants, verifies zero cross-visibility for projects, files, billing
- Verify file storage path enforcement
- Set INSERT-only DB permissions on audit log table (immutability at zero dev cost)

**Enterprise:**

- Enable RLS on all tenant-scoped tables as defense-in-depth
- Add query-scoping interceptor at ORM layer
- Add shared lookup table governance (prevent plan/coupon enumeration via `applicablePlanIds`)

---

## 10. Admin Account Security

### 10.1 What's needed

| Capability                                                                                    | Tier                                    |
| --------------------------------------------------------------------------------------------- | --------------------------------------- |
| **Mandatory MFA for system_admin**                                                            | MVP                                     |
| **Step-up auth for sensitive actions** (impersonation, refunds, deactivation, role elevation) | Launch (prerequisite for impersonation) |
| **Admin session timeout** (4h vs 24h for regular users)                                       | Launch                                  |
| **Session listing and forced logout**                                                         | Enterprise                              |
| **IP allowlisting for admin console**                                                         | Enterprise                              |
| **Break-glass account** (recovery if all admins locked out)                                   | Enterprise                              |

### 10.2 Implementation

**MVP:** MFA enrollment check middleware on admin routes. Block access without enrolled MFA.

**Launch:** `requireRecentAuth(maxAgeMinutes)` middleware for sensitive endpoints. MFA re-challenge if last auth exceeds threshold. **Must ship before impersonation.**

---

## 11. Authorization Model: Tenant Roles vs Internal Admin Permissions

### 11.1 Architectural decision

**Tenant roles and internal admin permissions must be separate models.** The current `ALL_ROLES` enum mixes tenant roles with the platform role. Internal admin permissions will be introduced as a separate system.

### 11.2 Recommended architecture

```
Tenant Roles (user's role inside their org):
  org_owner, admin, operator, reviewer

Internal Admin Permissions (employee's access in control plane):
  Stored as a permission set, NOT in the tenant role enum.
  Examples: users:read, users:write, tenants:read, tenants:write,
            billing:read, billing:refund, plans:write, support:read,
            support:reply, impersonate:read_only, impersonate:full,
            audit:read, audit:export
```

### 11.3 Permission model design

- Permissions are many-to-many: an admin can hold multiple permissions
- Assigned through **named internal roles** (super_admin, support_admin, etc.) — direct individual grants discouraged except break-glass
- **Deny overrides allow** if deny rules are ever introduced (future)
- Permissions evaluated **server-side only**; client visibility is advisory (show/hide UI elements, but enforcement is always on the server)
- **Targeted policy constraints** (not a full ABAC engine) will be added as needed: threshold checks for refunds, restricted-tenant flags for impersonation, time-bound access for temporary grants. A general-purpose policy engine is not needed for 1-3 years, but specific constraint hooks must exist.

### 11.4 Phased approach

**MVP:** Keep single `system_admin` role. Acceptable for 1-3 admins. A single super-admin model is acceptable during pre-launch or founder-led operations but should not be the long-term design baseline.

**Launch:** Introduce permission model in backend. Replace `requireRole('system_admin')` with `requireAdminPermission('users:write')`. Ship with one built-in set (super_admin = all). **Must ship before impersonation GA.**

**Enterprise:** Build admin role management UI. Named sets: `super_admin`, `support_admin`, `billing_admin`, `readonly_admin`. Sidebar show/hide based on permissions.

---

## 12. Tenant Impersonation with Governance

### 12.1 Why it's required

Table-stakes for multi-tenant SaaS. System admin cannot troubleshoot tenant-specific issues without it. Currently no impersonation exists.

### 12.2 Governance requirements

| Requirement                                                                       | Priority             |
| --------------------------------------------------------------------------------- | -------------------- |
| Reason capture (why accessing this tenant)                                        | Must have            |
| Time-bounded sessions (auto-expire, default 30 min)                               | Must have            |
| Dual identity display (real admin + impersonated user)                            | Must have            |
| Immutable audit trail (real admin ID logged on all actions)                       | Must have            |
| Cannot impersonate other system_admin users                                       | Must have            |
| End session button                                                                | Must have            |
| Step-up auth (MFA challenge before impersonation starts)                          | Must have            |
| **Read-only mode as initial release**                                             | Must have (see 12.4) |
| Action restrictions when in write mode (cannot deactivate tenant, change billing) | Should have          |
| Customer notification policy (configurable)                                       | Enterprise           |
| Tenant-level opt-out for regulated customers                                      | Enterprise           |

### 12.3 Implementation components

**Client:** `useImpersonationStore` (Zustand), reason dialog, `ImpersonationBanner` (persistent top bar), sidebar switching, admin route blocking during impersonation.

**Server:** `POST /v1/admin/impersonate` with reason field and mode (read_only/full_write), time-limited JWT with `realUserId` and `impersonationMode` claims, middleware detection, audit logging.

**Mock mode:** `LocalAuthAdapter.impersonate(userId, reason)` + `endImpersonation()`.

### 12.4 Scope decision: read-only first

**L3 (initial release) ships with read-only impersonation only.** The impersonation token includes `mode: 'read_only'` and server middleware blocks all mutation endpoints. This provides troubleshooting capability without the risk of modifying customer data.

**Full write-mode impersonation** defers to Enterprise (E1) when admin role decomposition and action restrictions are in place. This is explicitly accepted as a safer approach: full write access in a customer workspace with no restriction mechanism is an unacceptable risk for the initial release.

### 12.5 Multi-tab consideration

Impersonation state is stored in Zustand (per-tab). If an admin opens a second tab, it will not reflect impersonation state. **Mitigation:** Impersonation token is also stored in localStorage; a `storage` event listener syncs impersonation state across tabs. The impersonation JWT has a short TTL (5 minutes with auto-refresh) to limit the damage window if a session is not properly terminated.

---

## 13. Audit Trail Maturity

### 13.1 Current state

4 of ~20 admin actions logged. No diffs. No viewer. No export. No immutability.

### 13.2 Target state

| Capability                                             | MVP | Launch | Enterprise |
| ------------------------------------------------------ | --- | ------ | ---------- |
| All admin mutations logged                             | X   |        |            |
| **Audit log table INSERT-only** (DB-level)             | X   |        |            |
| Before/after diffs on changes                          |     | X      |            |
| Impersonation sessions logged (with reason + mode)     |     | X      |            |
| Admin viewer page with filters                         |     | X      |            |
| CSV/JSON export                                        |     | X      |            |
| Reads of sensitive data logged                         |     |        | X          |
| Retention policy enforcement                           |     |        | X          |
| Customer-visible audit of admin access (trust feature) |     |        | X          |

**Note on immutability:** Setting INSERT-only permissions on the audit log table for the application DB user is a database configuration, not an application feature. It costs zero development effort and should ship at MVP to prevent any possibility of log tampering from the first day.

### 13.3 Event taxonomy

User: `user.created`, `user.updated`, `user.deleted`, `user.role_changed`, `user.activated`, `user.deactivated` | Tenant: `tenant.onboarded`, `tenant.updated`, `tenant.deactivated`, `tenant.purged` | Plan: `plan.created`, `plan.updated`, `plan.deleted` | Coupon: `coupon.created`, `coupon.updated`, `coupon.deleted`, `coupon.synced` | Billing: `refund.issued`, `plan.changed` | Support: `ticket.status_changed`, `ticket.replied`, `ticket.assigned` | Impersonation: `impersonation.started`, `impersonation.ended` | Admin: `admin.permissions_changed`, `admin.override_granted`

### 13.4 Implementation

1. Standardize `buildAuditContext(c)` utility for consistent actor/IP/userAgent extraction
2. Add audit calls to all admin mutation handlers
3. Include before/after metadata: `{ before: { role: 'reviewer' }, after: { role: 'admin' } }`
4. Build `/admin/audit` page with filters: date range, actor, action type, entity, org
5. Add CSV/JSON export endpoint

---

## 14. Entitlements vs Plans

### 14.1 Why this distinction matters

Enterprise deals involve custom limits, temporary grants, grandfathered features, and beta access that don't map to public plans.

### 14.2 Recommended model

```
Plan (commercial package) → defaults → Entitlement (operational) ← overrides ← Admin Override (temporary with expiration + audit)
```

### 14.3 Override model details (for L5 build)

| Design Question                 | Decision                                                                                                                               |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Can overrides grant AND revoke? | Yes — grant adds features, revoke removes them (for misbehaving tenants, regulatory holds)                                             |
| Precedence on conflict          | Override wins over plan default. Most-specific wins.                                                                                   |
| Expiration handling             | Background job checks expired overrides daily. Feature revoked at next request after expiry. Audit event on expiration.                |
| Billing alignment               | Admin sees warning "This tenant has unpaid feature access" if override grants beyond plan. Billing reconciliation is manual initially. |
| Reason field                    | Mandatory on all overrides                                                                                                             |

### 14.4 Phased approach

**MVP:** Plan-only model. Feature gating works.
**Launch:** `tenant_overrides` table with admin UI. `limits.service.ts` checks overrides before plan defaults.
**Enterprise:** Contract-backed entitlements, automatic expiration, self-service visibility.

---

## 15. Billing Model Flexibility

### 15.1 Current state

Plan schema supports retainer only: `price` + `interval` (month/year) + `yearlyDiscountPercent`.

### 15.2 What's needed (pending business validation)

The commercial model must be validated with GTM before building. Possible extensions: `billingModel`, `projectFee`, `projectFeeInterval`, `includedProjects`.

### 15.3 Commercial metadata (Enterprise, regardless of billing model)

Even if retainer-only is the model, enterprise deals need metadata not in Stripe:

- Contract start/end dates, renewal date
- Billing contact(s), PO number
- Tax/VAT identifier
- Payment collection mode (card vs invoiced)
- Custom commercial terms notes

This is a lightweight metadata layer on `OrganizationEntity`, not a full invoicing system. Stripe remains source of truth for payment execution.

**Decision gate:** Do not build billing model extension until GTM validates. Commercial metadata layer can ship independently.

---

## 16. Mock Service Completeness

### 16.1 Gaps

Support tickets and coupons: no seed data, no mock repositories.

### 16.2 Architectural decision (v3.1)

**Standardize on server-side mocks.** M2 build creates server-side mock repos only. `LocalAPIAdapter` is reduced to auth-only simulation. All development uses `dev:real` (client + mock server). This eliminates the dual-mock divergence risk.

### 16.3 Fix

Create seed data + mock repositories for tickets and coupons. Wire into `createMockRepositories()`. Reduce `LocalAPIAdapter` to auth/session management only.

---

## 17. Admin Dashboard & Observability

### 17.1 Current state: Non-functional (hardcoded, hidden).

### 17.2 Required (MVP)

- `GET /v1/admin/stats` endpoint → live stats + loading skeletons
- Recent activity feed from audit log
- **Dependency health widget** — check Supabase, Stripe, Resend connectivity. Surface on dashboard.

### 17.3 Required (Launch)

- Alerts: over-limit tenants, high-priority tickets, failed payments
- Job queue health: pending, failed, dead counts (Section 22)
- **Maintenance mode toggle** — admin can put platform or specific tenant in read-only mode

---

## 18. Tenant Lifecycle Depth

### 18.1 Current: onboard → active → deactivated

### 18.2 Missing states

`trial` (Launch), `suspended` (Launch), `archived` (Enterprise), `offboarding` (Enterprise)

### 18.3 Missing operations

| Operation                                                                                  | Tier       |
| ------------------------------------------------------------------------------------------ | ---------- |
| Storage/seat usage on tenant list                                                          | MVP        |
| Seat usage warning in edit drawer                                                          | MVP        |
| **Basic activity indicators** (last login, active project count, days since last activity) | Launch     |
| Tenant detail page (health: projects, users, storage, billing)                             | Launch     |
| Trial extension                                                                            | Launch     |
| Data export for tenant                                                                     | Enterprise |
| Tenant purge (hard delete after retention period)                                          | Enterprise |

---

## 19–26: Remaining Gaps

_(Sections 19–26 unchanged from v3.0: Support Operations, Compliance, Plan Features, Job Queue Visibility, Integration Ops, Notifications, Approval Workflows, Environment Strategy. Key updates incorporated inline in the build spec.)_

---

# PART D — SPEC & ROADMAP

## 27. Fix Spec — Broken Items

Ship as one commit before any feature work.

| #   | Fix                                                  | Effort |
| --- | ---------------------------------------------------- | ------ |
| 1   | Import `ALL_ROLES` from contract (2 files)           | 1h     |
| 2   | Add all 4 org roles to CreateUserDrawer              | 1h     |
| 3   | Add `border` class (~15 locations)                   | 30m    |
| 4   | Fix RTL logical properties (2 files)                 | 30m    |
| 5   | Remove duplicate `shadow-sm` (6 instances)           | 15m    |
| 6   | Wire `canInviteRole()` into invitation flow          | 1h     |
| 7   | Fix orphaned user role to `reviewer`                 | 30m    |
| 8   | Add refund over-payment validation                   | 30m    |
| 9   | Add null checks + enum validation                    | 1h     |
| 10  | Add rate limiting to remaining mutations             | 30m    |
| 11  | Unhide/remove `content-offscreen` dashboard sections | 15m    |

**Total: ~7 hours including PR review**

---

## 28. Build Spec — Phased

### Tier definitions

| Tier           | When                                  | Goal                                                |
| -------------- | ------------------------------------- | --------------------------------------------------- |
| **MVP**        | Before first paying customer          | Safe, functional admin — no security embarrassments |
| **Launch**     | First 90 days with customers          | Admin that supports real operations with governance |
| **Enterprise** | When selling to F500 / regulated orgs | Passes procurement security questionnaires          |
| **Maturity**   | Ongoing                               | Scales internal ops, domain-native tooling          |

---

### MVP Builds

**M1: Bug Fixes** — All 11 fixes from Section 27. ~7 hours.

**M2: Mock Service Completion + Architecture Decision**

- Create server-side seed data + mock repos for support tickets and coupons
- Reduce `LocalAPIAdapter` to auth-only
- Update dev documentation to use `dev:real` as primary development mode
- Effort: 2-3 days

**M3: Tenant Isolation Verification**

- Confirm Supabase RLS status
- Audit all route handlers for unscoped `findById()` usage
- Add `tenant-isolation.spec.ts` test suite
- Verify file storage path enforcement
- Set INSERT-only DB permissions on audit log table
- Effort: 2-3 days

**M4: Audit Logging Expansion**

- Add audit calls to all ~20 admin mutation handlers
- Standardize `buildAuditContext(c)` utility
- Effort: 2-3 days

**M5: Admin MFA Enforcement**

- MFA enrollment check middleware on admin routes
- Block admin access without enrolled MFA
- Effort: 2-3 days

**M6: Admin Dashboard — Live Stats**

- `GET /v1/admin/stats` endpoint
- Replace hardcoded dashboard with real data + loading skeletons
- Recent activity feed from audit log
- Dependency health widget (Supabase, Stripe, Resend)
- Effort: 3-4 days

**M7: Tenant List Improvements**

- Show storage/seat usage on tenant list
- Seat usage warning in edit drawer
- Effort: 1 day

---

### Launch Builds

**L1: Admin Permission Foundation**

- Introduce `adminPermissions` on user entity (separate from tenant roles)
- Replace `requireRole('system_admin')` with `requireAdminPermission(permission)`
- Ship with single `super_admin` permission set
- Backend only — no UI yet
- Effort: 1 week

**L2: Step-Up Auth Foundation**

- `requireRecentAuth(maxAgeMinutes)` middleware
- MFA re-challenge on sensitive endpoints
- Admin session timeout (4h)
- **Must ship before L3**
- Effort: 3-4 days

**L3: Tenant Impersonation (Read-Only)**

- Read-only impersonation only (server blocks mutations)
- Reason dialog, time-limited JWT with `realUserId` + `mode: 'read_only'`, banner, sidebar switching
- Step-up auth before impersonation starts
- Audit logging (impersonation.started/ended)
- localStorage sync for multi-tab awareness
- Mock mode support
- **Prerequisites:** L1, L2, M4, M5
- Effort: 2-3 weeks

**L4: Audit Viewer + Export**

- Admin page for viewing/searching audit logs
- Before/after diffs in metadata
- CSV/JSON export
- Effort: 1 week

**L5: Tenant Override System**

- `tenant_overrides` table: `{ tenantId, feature, value, expiresAt, grantedBy, reason }`
- Grant and revoke overrides
- `limits.service.ts` checks overrides before plan defaults
- Expiration background job
- Admin UI to manage overrides
- Effort: 1-2 weeks

**L6: Tenant Lifecycle States**

- Add trial, suspended states
- Tenant detail page with health view
- Basic activity indicators (last login, project count, days since activity)
- Trial extension
- Effort: 1-2 weeks

**L7: Support Operations**

- Admin ticket creation
- SLA indicators (overdue highlighting)
- Wire Resend email to ticket reply notifications
- Effort: 1 week

**L8: Job Queue Visibility**

- Job stats on admin dashboard (pending, failed, dead)
- Dead job list with retry capability
- Effort: 3-4 days

**L9: Admin Notifications (Basic)**

- In-app notification bell with unread count
- Email alerts for critical events (high-priority tickets, failed payments, dead jobs)
- Effort: 1 week

---

### Enterprise Builds

**E1: Full-Write Impersonation + Admin Role Management UI**

- Named permission sets (super_admin, support_admin, billing_admin, readonly_admin)
- Admin role assignment UI
- Sidebar show/hide based on permissions
- Full-write impersonation mode (unlocked only for super_admin with action restrictions)
- Effort: 3-4 weeks

**E2: Billing Model Extension** (if GTM validates) + Commercial Metadata

- Flexible billing model fields on plan schema
- Commercial metadata layer on OrganizationEntity (contract dates, PO, billing contact)
- Effort: 2-3 weeks

**E3: Compliance Posture**

- Permission matrix documentation
- Data retention policy + enforcement
- Tenant data export endpoint
- Tenant purge workflow (soft-delete → 30-day grace → hard purge)
- Incident response runbook
- Effort: 1-2 weeks

**E4: Approval Workflows**

- Maker-checker for refunds above threshold, tenant deactivation, data export
- Pending actions queue, approval audit trail
- **Operational note:** Before E4 ships, sensitive actions require reason + strong audit + out-of-band dual review operationally
- Effort: 2 weeks

**E5: PII Masking & Data Access Governance**

- Role-based field masking (support_admin sees partial email)
- Reveal-on-demand with audit
- Redacted exports
- Effort: 1-2 weeks

**E6: Tenant Isolation Hardening**

- Enable RLS on all tenant-scoped tables
- Query-scoping interceptor at ORM layer
- Shared lookup table governance
- Effort: 1-2 weeks

**E7: SSO Implementation**

- **Scope:** SAML 2.0 + OIDC. SCIM is out of scope for initial release (documented separately).
- Per-tenant SSO configuration storage + admin UI
- JIT provisioning (auto-create users on first SSO login)
- IdP fallback to password auth
- **Minimum IdP compatibility:** Okta, Azure AD, Google Workspace
- Supabase Auth SSO integration (requires Supabase Pro plan — verify infrastructure cost)
- **Effort: 6-8 weeks** (realistic for production-grade multi-IdP implementation)

---

### Maturity Builds

**P1:** Integration Operations Console (when migration engine ships)
**P2:** Advanced Notifications (Slack/webhook, escalation routing)
**P3:** Bulk Operations (bulk user update, tenant tagging, filtered exports)
**P4:** Environment/Sandbox Support (tenant-level sandbox, environment badges)
**P5:** Admin Search & Saved Views (global search, advanced filters, custom columns)
**P6:** Full Entitlements Engine (contract-backed, automatic expiration, self-service visibility)
**P7:** Maintenance mode toggle (platform-level and per-tenant read-only mode)

---

## 29. Roadmap: MVP → Launch → Enterprise → Maturity

```
Phase 0: Fix Broken Items (M1)      ─── 1-2 days ───┐
                                                      │
Phase 1: MVP                         ─── 2-3 weeks ──┤ Before first customer
  M2 Mock completion + arch decision                  │
  M3 Tenant isolation verification                    │
  M4 Audit expansion                                  │
  M5 Admin MFA                                        │
  M6 Live dashboard                                   │
  M7 Tenant list improvements                         │
                                                      │
Phase 2: Launch                      ─── 8-10 weeks ─┤ First 90 days
  L1 Permission foundation (FIRST)                    │
  L2 Step-up auth foundation (SECOND)                 │
  L3 Impersonation read-only (after L1+L2)            │
  L4 Audit viewer + export                            │
  L5 Tenant overrides                                 │
  L6 Tenant lifecycle + activity indicators           │
  L7 Support operations                               │
  L8 Job queue visibility                             │
  L9 Basic notifications                              │
                                                      │
Phase 3: Enterprise                  ─── 12-16 weeks ┤ F500 readiness
  E1 Admin roles UI + full-write impersonation        │
  E2 Billing model + commercial metadata              │
  E3 Compliance posture                               │
  E4 Approval workflows                               │
  E5 PII masking                                      │
  E6 Tenant isolation hardening                       │
  E7 SSO implementation                               │
                                                      │
Phase 4: Maturity                    ─── ongoing ─────┘
  P1-P7 as needed
```

### Decision gates

| Gate                      | Question                                                               | If Yes   | If No                                      |
| ------------------------- | ---------------------------------------------------------------------- | -------- | ------------------------------------------ |
| Before L3                 | Are L1 (permissions), L2 (step-up auth), M4 (audit), M5 (MFA) shipped? | Proceed  | Block L3                                   |
| Before E2 billing model   | Has GTM validated commercial model?                                    | Build    | Defer model; ship commercial metadata only |
| Before E7 SSO             | Is there a signed enterprise deal requiring SSO?                       | Build    | Defer                                      |
| Before P1 integration ops | Is migration engine in alpha?                                          | Build    | Defer                                      |
| Before E1 admin roles UI  | Does internal ops team exceed 3-5 people?                              | Build UI | L1 backend is sufficient                   |

### Parallelization opportunities

Within Launch phase, these builds have no dependencies on each other and can run in parallel with separate engineers:

- L4 (audit viewer) + L7 (support ops) + L8 (job queue)
- L5 (overrides) + L6 (lifecycle)

### Effort assumptions

Estimates assume **1-2 engineers at ~50-60% allocation** to admin work (remainder on core product, support, sales engineering). With this allocation:

- MVP: 4-6 weeks elapsed
- Launch: 16-20 weeks elapsed
- Enterprise: 24-32 weeks elapsed

Estimates include coding + testing + review. Add 1.5x for design review, documentation, and deployment overhead on complex items (impersonation, SSO, approval workflows).

---

# PART E — REFERENCE

## 30. Non-Functional Requirements

| NFR                                  | Target                                         | Notes                                                    |
| ------------------------------------ | ---------------------------------------------- | -------------------------------------------------------- |
| Admin dashboard p95 load time        | < 2s (cached data)                             | Use React Query stale-while-revalidate                   |
| Audit event visible in UI            | Within 30s of action                           | Acceptable: page refresh or polling                      |
| Critical admin notification delivery | Within 1 minute                                | Email + in-app                                           |
| Impersonation session max duration   | 30 minutes (configurable)                      | Auto-expire with warning at 25 min                       |
| Admin session idle timeout           | 30-60 min idle, 4h absolute                    | Shorter than tenant sessions (24h)                       |
| Export jobs                          | Track progress, expire download link after 24h | Use job queue infrastructure                             |
| Dead jobs surfaced on dashboard      | Within 5 minutes                               | Dashboard polling interval                               |
| Audit log retention                  | Minimum 2 years                                | SOC 2 recommendation                                     |
| Admin page availability              | 99.9% (same as platform)                       | No separate SLA needed                                   |
| Pagination performance               | Cursor-based by Launch for >1K entities        | Replace offset pagination for users, tickets, audit logs |

---

## 31. Source of Truth Matrix

| Domain                                   | Source of Truth                         | Synced To                                        |
| ---------------------------------------- | --------------------------------------- | ------------------------------------------------ |
| Plan catalog (features, limits, pricing) | Internal DB                             | Stripe Products/Prices (synchronized projection) |
| Invoices and payment history             | **Stripe**                              | Displayed via Stripe API / billing portal        |
| Subscription status                      | **Stripe** (via webhooks)               | Internal DB (cached)                             |
| Tenant entitlements                      | Internal DB (plan defaults + overrides) | —                                                |
| User identity and sessions               | **Supabase Auth**                       | Internal user table (cached profile)             |
| Audit logs                               | Internal append-only table              | —                                                |
| Support tickets                          | Internal DB                             | —                                                |
| Coupon definitions                       | Internal DB                             | Stripe Coupons (synchronized)                    |
| File storage                             | **Supabase Storage**                    | —                                                |
| Email delivery status                    | **Resend** (via job queue)              | Job queue status table                           |

---

## 32. Sensitive Actions Matrix

| Action                     | Permission                       | Step-Up Auth | Reason Required | Approval (Enterprise)   | Audit Event              | Customer Notification      |
| -------------------------- | -------------------------------- | ------------ | --------------- | ----------------------- | ------------------------ | -------------------------- |
| Impersonate (read-only)    | `impersonate:read_only`          | Yes          | Yes             | No                      | `impersonation.started`  | Enterprise: configurable   |
| Impersonate (full write)   | `impersonate:full`               | Yes          | Yes             | No                      | `impersonation.started`  | Enterprise: configurable   |
| Issue refund               | `billing:refund`                 | Yes          | Yes             | Yes (above threshold)   | `refund.issued`          | No (Stripe sends receipt)  |
| Deactivate tenant          | `tenants:write`                  | Yes          | Yes             | Yes                     | `tenant.deactivated`     | No (manual communication)  |
| Purge tenant (hard delete) | `tenants:write`                  | Yes          | Yes             | Yes                     | `tenant.purged`          | Yes (data deletion notice) |
| Export tenant data         | `tenants:write` + `audit:export` | Yes          | Yes             | Yes                     | `tenant.data_exported`   | Enterprise: configurable   |
| Elevate user role          | `users:write`                    | No           | No              | No (yes if → org_owner) | `user.role_changed`      | No                         |
| Grant feature override     | `tenants:write`                  | No           | Yes             | No                      | `admin.override_granted` | No                         |
| Change pricing plan        | `plans:write`                    | No           | No              | No                      | `plan.updated`           | No                         |
| Delete user                | `users:write`                    | No           | No              | No                      | `user.deleted`           | No                         |

---

## 33. Internal Personas

| Persona                    | Top Jobs                                                    | Permissions Needed                                          | Sensitive Data Exposure                          |
| -------------------------- | ----------------------------------------------------------- | ----------------------------------------------------------- | ------------------------------------------------ |
| **Super Admin / Founder**  | Full platform control, break-glass access                   | All                                                         | Full                                             |
| **Support Engineer**       | Resolve tickets, investigate tenant issues                  | support:\*, impersonate:read_only, users:read, tenants:read | Ticket content, user names/emails                |
| **Billing / Finance Ops**  | Manage plans, issue refunds, review payments                | billing:_, plans:_, coupons:\*                              | Payment amounts, billing contacts                |
| **Compliance Auditor**     | Review audit logs, verify access patterns                   | audit:read, audit:export                                    | Audit event metadata (who did what)              |
| **Migration Ops** (future) | Monitor migration jobs, retry failures, inspect connections | integrations:\*, jobs:read, jobs:retry, tenants:read        | Integration credentials (masked), migration data |
| **Readonly Executive**     | View dashboard, stats, tenant health                        | \*.read (all read, no write)                                | Aggregate metrics only                           |

---

## 34. Idempotency & Concurrency Guidance

**Idempotency:** Admin actions with side effects (onboarding, refunds, Stripe sync, coupon sync, impersonation start) should be idempotent where possible:

- **Onboarding:** Check for existing org by slug before creating. Return existing if found.
- **Refunds:** Check if refund already processed for this payment before issuing. Stripe refund API is naturally idempotent with idempotency keys.
- **Plan sync to Stripe:** `syncPlanToStripe()` already uses upsert pattern (create or update).
- **Impersonation start:** Generating a new JWT is inherently idempotent (no side effect beyond the token itself).

**Concurrency:** For mutable records (tenant settings, user profiles, plan definitions):

- Use `updatedAt` timestamp for optimistic concurrency. Before saving, verify `updatedAt` matches the value loaded. If mismatched, return 409 Conflict.
- Client UI: show "This record was modified by another user" and offer to reload.

**Duplicate click protection:** Client-side mutation hooks should disable the submit button during `isPending` state (already implemented in most drawers).

---

## 35. API Conventions

All admin APIs follow these conventions:

| Convention         | Standard                                                                                                                                      |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Base path          | `/v1/admin/*`                                                                                                                                 |
| Versioning         | URL-based (`/v1/`). Additive changes preferred. Breaking changes gated to new version. Contract package is source of truth.                   |
| Pagination         | **MVP:** offset-based (`limit`/`offset`). **Launch:** migrate to cursor-based for users, tickets, audit logs (entities exceeding 1K records). |
| Filtering          | Query params: `?status=active&role=admin`. Validated against enum arrays server-side.                                                         |
| Sorting            | `?sort=createdAt&order=desc`                                                                                                                  |
| Error format       | `{ success: false, error: { code: string, message: string, details?: object } }`                                                              |
| Success format     | `{ success: true, data: T, meta?: { pagination } }`                                                                                           |
| Partial updates    | Use PUT (current convention). Note: PATCH is more semantically correct for partial updates — consider migration at next API version.          |
| Rate limit headers | Add `X-RateLimit-Remaining` and `Retry-After` on rate-limited endpoints.                                                                      |
| Correlation IDs    | Add `X-Request-Id` header for request tracing through middleware → service → repository.                                                      |

---

## 36. Schema Change Protocol

Every build that modifies the data model (M4, L1, L5, L6, E2) must follow:

1. **Drizzle migration file** — generated via `drizzle-kit generate`. Reviewed before deploy.
2. **Backward-compatible by default** — new columns must have defaults or be nullable. No NOT NULL without default on existing tables.
3. **Multi-step for breaking changes** — rename/type change: add new column → backfill → switch reads → drop old.
4. **Mock data synchronization** — every schema change must update both Drizzle schema definitions AND mock seed data. Part of the build's definition of done.
5. **Rollback plan** — document how to reverse the migration if it causes issues. For additive changes: drop column. For data migrations: keep backup.
6. **Test on mock mode** — verify mock repositories handle new fields before deploying.

---

## 37. Accessibility Target

**Target:** WCAG 2.1 AA compliance.

**Highest-risk components:** multi-step drawers (OnboardTenantDrawer, PlanEditorDrawer, CouponEditorDrawer), ticket conversation threads, module selection grids.

**Requirements:**

- Keyboard navigation for all workflows (onboard tenant, impersonate, respond to ticket — all without mouse)
- Screen reader compatibility (drawer headers announced, status badges readable, form errors associated with fields)
- Focus management (focus moves to drawer on open, returns to trigger on close)
- Color contrast verification (violet/amber against white must meet 4.5:1)
- ARIA labels on all icon-only buttons (edit, delete, action buttons)

**Plan:** Add `@axe-core/playwright` to E2E tests at Launch. Schedule formal WCAG audit before first enterprise deal requiring VPAT.

---

## 38. Competitive Capability Benchmark

"Best-in-class" measured against comparable RevOps / B2B SaaS admin platforms:

| Capability                    | Industry Standard             | RevBrain Target                           | Phase             |
| ----------------------------- | ----------------------------- | ----------------------------------------- | ----------------- |
| MFA for admins                | Required                      | Yes                                       | MVP               |
| Audit log viewer              | Required                      | Yes                                       | Launch            |
| Tenant impersonation          | Common                        | Yes (read-only initially)                 | Launch            |
| Role-based admin permissions  | Common                        | Yes (backend at Launch, UI at Enterprise) | Launch/Enterprise |
| Feature gating enforcement    | Common                        | **Already complete**                      | Done              |
| Stripe billing pipeline       | Required                      | **Already complete**                      | Done              |
| Self-service tenant admin     | Required                      | **Already complete**                      | Done              |
| SSO (SAML)                    | Required for enterprise deals | Yes                                       | Enterprise        |
| Approval workflows            | Advanced                      | Yes                                       | Enterprise        |
| SCIM provisioning             | Advanced                      | Out of scope (future)                     | —                 |
| Sandbox environments          | Advanced                      | Deferred                                  | Maturity          |
| Public admin API              | Advanced                      | Deferred                                  | Maturity          |
| Customer-visible access audit | Differentiator                | Planned                                   | Enterprise        |
| Real-time admin updates       | Nice-to-have                  | React Query polling sufficient            | —                 |

---

## Appendix A: Complete File Inventory

_(22 admin UI files ~4,400 lines, 9 server admin files ~1,800 lines, 12 mock layer files ~1,100 lines, 2 contract files ~660 lines, 6 platform infrastructure files. See v2.0 for full table.)_

---

## Appendix B: Auditor Feedback Triage

### Incorporated

| Feedback                                                     | Source    | Section                   |
| ------------------------------------------------------------ | --------- | ------------------------- |
| Tenant isolation verification must be MVP, not Enterprise    | Both      | 9, M3                     |
| Audit log immutability (INSERT-only) should be MVP           | Auditor 2 | 13, M3                    |
| MFA / step-up auth for admin accounts                        | Both      | 10, M5, L2                |
| Step-up auth must ship before impersonation                  | Auditor 1 | L2 → L3 dependency        |
| Separate tenant roles from internal admin permissions        | Auditor 1 | 11                        |
| Permission model design details needed                       | Auditor 1 | 11.3                      |
| Impersonation should ship read-only first                    | Auditor 2 | 12.4                      |
| Multi-tab impersonation risk                                 | Auditor 2 | 12.5                      |
| Entitlements override model needs design decisions           | Auditor 2 | 14.3                      |
| Audit trail should cover reads of sensitive data             | Auditor 1 | 13.2                      |
| SSO scope and estimate too aggressive                        | Auditor 2 | E7 (revised to 6-8 weeks) |
| Job queue has no admin visibility                            | Auditor 2 | 22, L8                    |
| No admin notification system                                 | Both      | 24, L9                    |
| Approval workflows need pre-Enterprise operational stance    | Auditor 1 | E4 operational note       |
| Basic activity indicators on tenant list                     | Auditor 2 | 18.3, L6                  |
| Maintenance mode toggle needed                               | Auditor 2 | 17.3, P7                  |
| Commercial metadata needed even without billing model change | Auditor 1 | 15.3                      |
| Mock service architectural decision must be made now         | Auditor 2 | 1.3, 16.2                 |
| Non-functional requirements section needed                   | Auditor 1 | Section 30                |
| Source of truth matrix needed                                | Auditor 1 | Section 31                |
| Sensitive actions matrix needed                              | Auditor 1 | Section 32                |
| Lightweight personas table needed                            | Auditor 1 | Section 33                |
| Idempotency/concurrency guidance needed                      | Auditor 1 | Section 34                |
| API conventions needed                                       | Auditor 2 | Section 35                |
| Schema change protocol needed                                | Auditor 2 | Section 36                |
| Accessibility target needed                                  | Auditor 2 | Section 37                |
| Competitive benchmark needed                                 | Auditor 2 | Section 38                |
| Customer-visible admin access audit as trust feature         | Auditor 1 | 13.2                      |
| Targeted policy constraints (not full ABAC)                  | Auditor 1 | 11.3                      |
| Effort estimates need allocation context                     | Auditor 2 | 29 assumptions            |
| Secrets management / credential governance reserved          | Auditor 1 | Future (migration engine) |

### Deferred (valid, not current priority)

| Feedback                               | Why Deferred                                                                                                                                                           |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Full ABAC/policy engine                | Targeted policy constraints included in permission model (11.3). Full engine when regulatory customers demand it.                                                      |
| Full observability stack (APM, Sentry) | Infrastructure concern. Separate engineering initiative.                                                                                                               |
| CI/CD pipeline specification           | Out of scope for admin audit.                                                                                                                                          |
| Real-time/WebSocket for admin          | React Query polling adequate. Real-time for tenant migration experience, not admin.                                                                                    |
| Feature flag system (LaunchDarkly)     | Tenant override system (L5) covers admin-visible subset.                                                                                                               |
| Admin API / automation surface         | Build when internal ops team needs scripting. **Architectural reservation:** all admin actions go through domain services, making future API exposure straightforward. |
| Full performance strategy              | Brief scaling notes in API conventions (35). Full strategy when data volume exceeds MVP thresholds.                                                                    |
| SCIM provisioning                      | Out of scope for SSO initial release. Separate scope when enterprise deals require it.                                                                                 |
| Tenant health scoring (ML-based)       | Basic activity indicators accepted at Launch. ML-based scoring when CSM team requests it.                                                                              |

### Rejected

| Feedback                                                | Why                                                                                                                                                                           |
| ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Full contract/invoice/PO/tax/multi-currency ops         | Stripe handles payment execution. Lightweight commercial metadata layer accepted (15.3). Full invoicing is overengineering.                                                   |
| Partner/SI operating model                              | No evidence of need. If RevBrain goes channel, scope then.                                                                                                                    |
| Full incident management / status page tooling          | Use external tools (PagerDuty, Statuspage.io). Maintenance mode toggle accepted (P7).                                                                                         |
| Customer communication tools (announcements, changelog) | Use external tools (Intercom, Beamer). **Integration seams** (user identity + tenant context for external tools) will be documented as part of tenant data export capability. |
| RevOps-native operating objects in admin                | Depends on migration engine. Reserved in roadmap (P1).                                                                                                                        |
| Full operational SLOs/KPIs                              | NFRs section (30) covers measurable targets. Track velocity separately.                                                                                                       |

---

## Appendix C: Glossary

| Term                       | Definition                                                                   |
| -------------------------- | ---------------------------------------------------------------------------- |
| **CPQ**                    | Configure, Price, Quote — Salesforce's legacy quoting product                |
| **RCA**                    | Revenue Cloud Advanced — Salesforce's next-generation revenue management     |
| **RevOps**                 | Revenue Operations — aligns sales, marketing, and CS around revenue          |
| **Impersonation**          | Admin views platform as specific tenant user for troubleshooting             |
| **Step-up auth**           | Additional authentication (MFA, password) before sensitive actions           |
| **Entitlement**            | What a tenant can actually use — may differ from plan via overrides          |
| **Feature gating**         | Enforcing plan-level access at the middleware level                          |
| **RLS**                    | Row-Level Security — DB-level tenant isolation enforcement                   |
| **Maker-checker**          | One person initiates, another approves an action                             |
| **Idempotency**            | Operation produces same result regardless of how many times called           |
| **Optimistic concurrency** | Check `updatedAt` before saving to detect conflicting edits                  |
| **TOTP**                   | Time-based One-Time Password — standard MFA protocol                         |
| **SOC 2**                  | Service Organization Control Type 2 — security compliance standard           |
| **GDPR**                   | General Data Protection Regulation — EU data privacy law                     |
| **WCAG**                   | Web Content Accessibility Guidelines — accessibility standard                |
| **VPAT**                   | Voluntary Product Accessibility Template — accessibility compliance document |
| **JIT provisioning**       | Just-In-Time user creation on first SSO login                                |
| **SCIM**                   | System for Cross-domain Identity Management — automatic user sync from IdP   |
