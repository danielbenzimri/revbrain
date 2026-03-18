# RevBrain — Step 0: Platform Envelope

> **Purpose**: Define every change needed to make the platform skeleton production-ready for a revenue operations SaaS, _before_ building actual project/migration workflows.
>
> **Scope**: Auth, onboarding, org management, navigation, billing, admin, email, translations, database schema. Explicitly excludes: what a "project" looks like internally, Salesforce integration, migration workflows, reports.
>
> **Context**: RevBrain was forked from Geometrix, a civil-engineering construction management platform. The engineering calculation modules (22 modules, DXF parsing, 3D viewers) have already been removed. The role system has been overhauled from 11 construction roles to 5 RevBrain roles. Package names, branding, and storage keys have been renamed. This document covers what remains.

---

## 1. Remove Construction-Specific Features

### 1.1 Remove BOQ (Bill of Quantities)

**What it is**: A hierarchical pricing system for construction contracts — chapters, items with codes, units (m, m², m³, ton), quantities, and unit prices.

**Why remove**: BOQ is a construction-industry standard with no equivalent in revenue operations. Keeping it creates confusion and dead code. The concept of "line items in a deal" will be built fresh with RevBrain-specific semantics when we define project internals.

**Scope**:

- Client: `apps/client/src/features/boq/` (components, hooks, import sheet)
- Server: `apps/server/src/v1/routes/boq.ts`, `apps/server/src/services/boq.service.ts`
- Server: `apps/server/src/repositories/drizzle/boq.repository.ts`
- Database: `boq_items` table and relations
- Locale: `apps/client/src/locales/*/boq.json`
- Route: `/project/:id/boq` route + sidebar tab
- References: `ProjectDetailPage.tsx` BOQ tab, `use-prefetch.ts` BOQ prefetch

**Decision**: Full removal. If RevBrain needs product/service line items later, they will be designed from scratch with fields relevant to Salesforce CPQ objects (Product2, PricebookEntry, QuoteLineItem).

### 1.2 Remove Execution Bills

**What it is**: A contractor progress-payment system — bills tied to BOQ items, cumulative quantity tracking, dual signatures (contractor + inspector), measurement sheets, approval workflow.

**Why remove**: This is a construction billing workflow (progress payments for work done on site). RevBrain's billing is SaaS subscription billing via Stripe, which is already implemented separately. If RevBrain ever needs to show customer invoicing data, it will come from Salesforce, not from an internal billing system.

**Scope**:

- Client: `apps/client/src/features/execution/` (BillingView, BillDetailSheet, BillMeasurementModal, BillStatusTimeline, BillWorkflowCard, ClientBillingView, hooks, types)
- Server: `apps/server/src/v1/routes/execution-bills.ts`, `apps/server/src/services/execution-bill.service.ts`
- Server: `apps/server/src/repositories/drizzle/bill.repository.ts`, `bill-item.repository.ts`, `measurement.repository.ts`
- Database: `bills`, `bill_items`, `measurements` tables and relations
- Locale: `apps/client/src/locales/*/execution.json`
- Route: `/project/:id/execution` route + sidebar tab
- E2E: `e2e/execution-bills.spec.ts`

**Decision**: Full removal. The existing Stripe billing infrastructure (subscriptions, payments, invoices) covers RevBrain's own billing needs. Customer revenue data will be sourced from Salesforce.

### 1.3 Remove Work Logs

**What it is**: Daily construction site documentation — weather, manpower by trade (carpenter, electrician, plumber), equipment, work descriptions, contractor/supervisor signatures, approval workflow.

**Why remove**: This is physical site-based reporting with no relevance to a SaaS migration tool. RevBrain will have its own activity/audit logging tied to migration operations, designed when we define project internals.

**Scope**:

- Client: `apps/client/src/features/worklogs/` (WorkLogsView, WorkLogCard, WorkLogDetailSheet, WorkLogPrintModal, WorkLogSummaryCard, WorkLogResourceTable, CollapsibleSection, hooks)
- Server: `apps/server/src/v1/routes/work-logs.ts`, `apps/server/src/services/work-log.service.ts`
- Server: `apps/server/src/repositories/drizzle/work-log.repository.ts`
- Database: `work_logs` table and relations
- Locale: `apps/client/src/locales/*/workLogs.json`
- Route: `/project/:id/worklogs` route (currently hidden in sidebar but route exists)
- E2E: `e2e/work-logs.spec.ts`

**Decision**: Full removal. Migration activity logging will be purpose-built.

### 1.4 Remove Tasks Feature

**What it is**: A Kanban-style task board within each project — columns for status, assignees, due dates, audit log, drag-and-drop.

**Why remove now**: While task management _could_ be useful in a migration project, the current implementation is tightly coupled to the construction data model (task types reference construction roles, BOQ items). More importantly, RevBrain's "tasks" will be migration steps with specific states, validations, and Salesforce API interactions — fundamentally different from generic kanban cards.

**Scope**:

- Client: `apps/client/src/features/tasks/` (TasksView, TaskCard, TaskFormSheet, TaskListView, TaskDeleteDialog, TaskAuditLogSheet, hooks)
- Server: `apps/server/src/v1/routes/tasks.ts`, `apps/server/src/services/task.service.ts`
- Server: `apps/server/src/repositories/drizzle/task.repository.ts`, `task-audit-log.repository.ts`
- Database: `tasks`, `task_audit_log` tables and relations
- Locale: `apps/client/src/locales/*/tasks.json`
- Route: `/project/:id/tasks` route + sidebar tab
- E2E: `e2e/tasks-kanban.spec.ts`

**Decision**: Full removal. Migration task management will be built as a core feature with Salesforce-aware states, dependency tracking, and automated validation — not a generic kanban board.

---

## 2. Clean Up Project Model

### 2.1 Database Schema — `projects` Table

The current `projects` table has construction-specific columns that need removal:

| Column                    | Purpose                    | Action                                     |
| ------------------------- | -------------------------- | ------------------------------------------ |
| `contract_number`         | Construction contract ID   | **Remove**                                 |
| `contract_date`           | Date contract was signed   | **Remove**                                 |
| `contractor_name`         | Construction company name  | **Remove**                                 |
| `contractor_id`           | Contractor tax/business ID | **Remove**                                 |
| `client_name`             | Project owner company      | **Remove**                                 |
| `client_id`               | Client tax/business ID     | **Remove**                                 |
| `contract_value_cents`    | Total contract value       | **Remove**                                 |
| `global_discount_percent` | Discount on BOQ items      | **Remove**                                 |
| `chapter_discounts`       | Per-category discount JSON | **Remove**                                 |
| `location`                | Physical site address      | **Remove**                                 |
| `completed_at`            | When construction finished | **Keep** (useful for migration completion) |
| `cancelled_at`            | When project was cancelled | **Keep**                                   |

**Columns to keep** (generic and useful):

- `id`, `organization_id`, `name`, `description`, `notes`
- `status` (will redefine values for migration states)
- `start_date`, `end_date`
- `created_at`, `updated_at`, `completed_at`, `cancelled_at`
- `created_by`

**Decision**: Strip construction columns from the Drizzle schema now. New RevBrain-specific columns (e.g., `salesforce_org_id`, `source_environment`, `target_environment`) will be added when we define project internals — that is explicitly out of scope for Step 0.

### 2.2 Project Sidebar Navigation

Current tabs within a project workspace:

| Tab               | Status               | Action                                              |
| ----------------- | -------------------- | --------------------------------------------------- |
| Overview          | Generic              | **Keep** — will be repurposed for project dashboard |
| Tasks             | Construction-coupled | **Remove** (see 1.4)                                |
| Execution (Bills) | Construction         | **Remove** (see 1.2)                                |
| Docs              | Generic file storage | **Keep** — useful for storing migration artifacts   |
| Users             | Project team members | **Keep** — essential for project-scoped roles       |
| Settings          | Project config       | **Keep**                                            |

After cleanup, project sidebar will have: **Overview, Docs, Users, Settings** — a clean shell ready for RevBrain-specific tabs to be added later.

---

## 3. Update Plan/Pricing Module System

### 3.1 Remove Construction Modules from Plans

The admin plan editor currently lists 15 construction work modules (Earthworks, Concrete Works, Waterproofing, etc.) that determine which features a tenant can access.

**Decision**: Replace with RevBrain-relevant feature flags. Suggested initial set:

| Module Key           | Description                           |
| -------------------- | ------------------------------------- |
| `cpq_migration`      | CPQ to RCA migration tooling          |
| `data_validation`    | Pre/post migration data validation    |
| `advanced_reporting` | Custom reports and dashboards         |
| `api_access`         | REST API access for automation        |
| `bulk_operations`    | Batch processing for large migrations |
| `audit_trail`        | Detailed operation audit logging      |
| `webhook_support`    | Outbound webhooks for integrations    |

**Scope**: Update locale `admin.json` plan editor module list, and the `PlanEditorDrawer.tsx` component.

### 3.2 Plan Description Updates

Current plan descriptions reference "contractors" and "construction teams". Update to generic SaaS language:

- Starter → "For small teams getting started with RevBrain"
- Pro → "For growing teams with complex migration needs"
- Enterprise → "For large organizations requiring scale and compliance"

---

## 4. Update Translations

### 4.1 Files to Remove Entirely

- `boq.json` — Bill of Quantities terminology
- `execution.json` — Construction billing terminology
- `workLogs.json` — Site reporting terminology
- `tasks.json` — Task management (will be rebuilt)

### 4.2 Files to Update

- `projects.json` — Remove construction fields (contractor, client, contract number, BOQ references). Keep generic project fields (name, description, dates, status).
- `common.json` — Contains "Calculation System" subtitle reference → update to RevBrain tagline.
- `admin.json` — Update plan module names from construction to RevOps (see 3.1). Update onboarding labels.
- `dashboard.json` — Currently generic ("Total Projects", "Active Projects"). Keep as-is for now; will evolve when project internals are defined.
- `nav.json` — Review for any construction-specific labels.

### 4.3 Hebrew Translations

All Hebrew locale files (`apps/client/src/locales/he/`) mirror the English structure. Every change in 4.1 and 4.2 must be applied to both `en/` and `he/` directories simultaneously. The Hebrew translations contain construction-specific terminology (כמאי, חשבונות ביצוע, יומן עבודה) that must be removed or updated.

---

## 5. Update Email Templates

### 5.1 Content Review

All 8 email templates are generic SaaS templates and do not contain construction content:

- `welcome.ts` — Account activation
- `payment-receipt.ts` — Payment confirmation
- `payment-failed.ts` — Payment failure
- `trial-ending.ts` — Trial expiring soon
- `trial-ended.ts` — Trial expired
- `subscription-changed.ts` — Plan change notification
- `refund-confirmation.ts` — Refund processed
- `lead-notification.ts` — Enterprise lead alert

**Decision**: Keep all templates as-is. They are well-written and appropriate for any SaaS platform. No changes needed for Step 0.

### 5.2 Supabase Auth Templates

Three auth email templates exist in `supabase/templates/`:

- `invite.html` — User invitation email
- `recovery.html` — Password reset
- `magic-link.html` — Magic link login

These have already been rebranded to RevBrain. No further changes needed.

---

## 6. Clean Up Navigation

### 6.1 Main Sidebar

Current structure is appropriate for RevBrain:

- Dashboard → **Keep**
- Projects → **Keep** (will be the migration projects list)
- Billing → **Keep** (subscription management)
- Settings → **Keep**
- Help → **Keep**

No changes needed for Step 0.

### 6.2 Admin Sidebar

Current admin structure:

- Platform Overview → **Keep**
- Tenants → **Keep**
- Users → **Keep**
- Pricing → **Keep** (update module list per section 3)
- Coupons → **Keep**
- Support → **Keep**

No changes needed for Step 0.

---

## 7. Database Schema Cleanup Summary

### 7.1 Tables to Remove (Drizzle schema + pending SQL migration)

| Table                    | Reason                           |
| ------------------------ | -------------------------------- |
| `boq_items`              | Construction BOQ system          |
| `bills`                  | Construction progress payments   |
| `bill_items`             | Line items in construction bills |
| `measurements`           | Construction measurement sheets  |
| `work_logs`              | Daily site reports               |
| `tasks`                  | Generic kanban (will rebuild)    |
| `task_audit_log`         | Audit trail for removed tasks    |
| `walls`                  | Already removed from schema      |
| `paving_areas`           | Already removed from schema      |
| `earthwork_calculations` | Already removed from schema      |
| `calculation_results`    | Already removed from schema      |
| `module_spreadsheets`    | Already removed from schema      |

### 7.2 Tables to Modify

| Table           | Change                                                                 |
| --------------- | ---------------------------------------------------------------------- |
| `projects`      | Remove construction-specific columns (see 2.1)                         |
| `organizations` | Remove `type` column (contractor/client distinction gone)              |
| `users`         | Consider removing `is_org_admin` (derivable from `role = 'org_owner'`) |

### 7.3 Tables to Keep As-Is

| Table             | Purpose                                 |
| ----------------- | --------------------------------------- |
| `plans`           | Subscription plan definitions           |
| `organizations`   | Multi-tenant orgs (minus `type` column) |
| `users`           | User accounts                           |
| `subscriptions`   | Stripe subscription tracking            |
| `payment_history` | Payment records                         |
| `billing_events`  | Webhook event tracking                  |
| `coupons`         | Discount codes                          |
| `coupon_usages`   | Coupon redemption tracking              |
| `leads`           | Enterprise sales leads                  |
| `lead_activities` | Lead interaction history                |
| `support_tickets` | Customer support                        |
| `ticket_messages` | Support conversations                   |
| `audit_logs`      | System audit trail                      |
| `job_queue`       | Background job processing               |
| `chat_groups`     | Team communication                      |
| `chat_messages`   | Chat messages                           |
| `project_files`   | File storage per project                |

### 7.4 Tables to Add (pending, for project-scoped roles)

| Table             | Purpose                                                    |
| ----------------- | ---------------------------------------------------------- |
| `project_members` | Maps users to projects with role (`operator` / `reviewer`) |

---

## 8. Existing Infrastructure to Preserve

These systems are well-built, generic, and directly usable for RevBrain. They should NOT be modified in Step 0:

| System                             | Why Keep                                                                                                                |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| **Stripe billing**                 | Complete subscription lifecycle — checkout, webhooks, plan changes, payment history, trials, coupons. Production-ready. |
| **Auth (Supabase)**                | Session management, password reset, magic links, email verification. Battle-tested.                                     |
| **RBAC middleware**                | Role-based access control — already updated for new 5-role system.                                                      |
| **Rate limiting**                  | Per-IP and per-user rate limits with alerting. Essential for any SaaS.                                                  |
| **Alerting system**                | Multi-channel (Sentry, Slack, email, console) with severity levels.                                                     |
| **Support tickets**                | Full ticket lifecycle with conversations, priorities, and admin panel.                                                  |
| **Leads system**                   | Public contact form with UTM tracking and sales notifications.                                                          |
| **File storage**                   | Per-project file management via Supabase Storage with metadata.                                                         |
| **Email system**                   | Queued email delivery via Resend with HTML templates.                                                                   |
| **Body limits / Security headers** | Request size limits, CSP, CORS, HSTS.                                                                                   |
| **Onboarding flow**                | Tenant creation with plan assignment and admin invite.                                                                  |

---

## 9. Execution Order

The recommended execution order minimizes broken states and ensures each step results in a working (if reduced) application:

| Step | Action                                                              | Risk                                          | Dependencies    |
| ---- | ------------------------------------------------------------------- | --------------------------------------------- | --------------- |
| 9.1  | Remove Work Logs (feature + DB schema + routes + locale)            | Low — isolated feature                        | None            |
| 9.2  | Remove Tasks (feature + DB schema + routes + locale)                | Low — isolated feature                        | None            |
| 9.3  | Remove Execution Bills (feature + DB schema + routes + locale)      | Low — isolated feature                        | None            |
| 9.4  | Remove BOQ (feature + DB schema + routes + locale)                  | Medium — BOQ is referenced by execution bills | After 9.3       |
| 9.5  | Clean up project model (remove construction columns from schema)    | Low — code only                               | After 9.1–9.4   |
| 9.6  | Update project sidebar (remove tabs for deleted features)           | Low                                           | After 9.1–9.4   |
| 9.7  | Update plan module list (construction → RevOps modules)             | Low                                           | None            |
| 9.8  | Update translations (remove deleted locale files, update remaining) | Low                                           | After 9.1–9.4   |
| 9.9  | Run all tests, fix broken references                                | Medium                                        | After all above |
| 9.10 | Add `project_members` table for project-scoped roles                | Low                                           | None            |

---

## 10. What Step 0 Does NOT Cover

These items are intentionally deferred to later steps:

- **Project internals**: What a RevBrain migration project contains (steps, validations, mappings)
- **Salesforce integration**: OAuth, API connections, metadata reading
- **CPQ/RCA data models**: Product2, PricebookEntry, QuoteLineItem, SBQQ objects
- **Migration engine**: The actual migration logic and orchestration
- **Reports and dashboards**: Migration progress, data quality, comparison views
- **Customer/Account model**: How RevBrain represents the end-customer whose Salesforce org is being migrated
- **Dashboard redesign**: Will evolve naturally once project internals exist

---

## Appendix: Current Test Coverage

As of this document, all existing tests pass:

| Suite             | Tests   | Status          |
| ----------------- | ------- | --------------- |
| Server unit tests | 435     | All passing     |
| Client unit tests | 189     | All passing     |
| **Total**         | **624** | **All passing** |

After Step 0 execution, removed features will reduce the test count. New tests should be written for any new functionality (e.g., `project_members` table operations). The goal is to maintain 100% pass rate throughout.
