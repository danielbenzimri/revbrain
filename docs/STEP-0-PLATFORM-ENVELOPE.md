# RevBrain — Step 0: Platform Envelope

> **Status**: COMPLETED
>
> **Purpose**: Make the platform skeleton production-ready for a revenue operations SaaS, _before_ building actual project/migration workflows.
>
> **Context**: RevBrain was forked from Geometrix, a civil-engineering construction management platform. This document tracks what was removed, what was kept, and what the platform looks like now.

---

## Completed Work

### 1. Construction Features Removed

| Feature                 | What it was                                                          | Scope removed                                                                                                                               |
| ----------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| **BOQ**                 | Bill of Quantities — hierarchical pricing for construction contracts | Client feature, server route/service/repository, DB table, locale, e2e test                                                                 |
| **Execution Bills**     | Contractor progress-payment system with dual signatures              | Client feature, server route/service/repository, DB tables (bills, bill_items, measurements), locale, e2e test                              |
| **Work Logs**           | Daily construction site documentation (weather, manpower, equipment) | Client feature, server route/service/repository, DB table, locale, e2e test                                                                 |
| **Tasks**               | Generic Kanban board coupled to construction data model              | Client feature, server route/service/repository, DB tables (tasks, task_audit_log), locale, e2e test                                        |
| **Calculation Modules** | 22 engineering calculation modules (walls, drainage, paving, etc.)   | Client legacy modules, DXF parser app, 3D viewers, server routes/services/repos, DB tables (5), heavy deps (Three.js, Konva, Leaflet, etc.) |

### 2. Project Model Cleaned

Removed 10 construction-specific columns from the projects table:

`contractNumber`, `contractDate`, `contractorName`, `contractorId`, `clientName`, `clientId`, `contractValueCents`, `globalDiscountPercent`, `chapterDiscounts`, `location`

**Kept**: `id`, `name`, `description`, `ownerId`, `organizationId`, `startDate`, `endDate`, `status`, `notes`, `metadata`, `createdAt`, `updatedAt`, `completedAt`, `cancelledAt`

Updated: Drizzle schema, contract types (ProjectEntity, CreateProjectInput, UpdateProjectInput), server route Zod schemas, repository, ProjectFormSheet, ProjectDetailPage, ProjectSettingsPage, OverviewPage, ProjectsPage list view, projectStorage utility.

### 3. Role System Overhauled

| Old (11 roles)                                                   | New (5 roles)                                         |
| ---------------------------------------------------------------- | ----------------------------------------------------- |
| `system_admin`                                                   | `system_admin` — Platform super admin                 |
| `contractor_ceo`, `client_owner`                                 | `org_owner` — Tenant owner, billing, full access      |
| `contractor_pm`, `client_pm`                                     | `admin` — Full operational access, all projects       |
| `execution_engineer`, `quantity_surveyor`, `inspector`           | `operator` — Migration work on assigned projects      |
| `quality_controller`, `quality_assurance`, `accounts_controller` | `reviewer` — View-only + remarks on assigned projects |

Removed `OrganizationType` (`contractor` / `client`) distinction. Removed `UserGroup`. Simplified RBAC, invite flow, onboarding.

### 4. Branding & Naming

- Package names: `@geometrix/*` → `@revbrain/*`
- UI text: `GEOMETRIX` → `REVBRAIN`
- Storage keys: `geometrix_*` → `revbrain_*`
- Domains: `geometrixlabs.com` → `revbrain.com`
- Subtitle: "Calculation System" → "Revenue Operations Platform"
- Zero remaining references to "geometrix" or construction terminology

### 5. Plan Modules Updated

Replaced 15 construction modules with 7 RevOps feature flags:

| Module               | Description                           |
| -------------------- | ------------------------------------- |
| `cpq_migration`      | CPQ to RCA migration tooling          |
| `data_validation`    | Pre/post migration data validation    |
| `advanced_reporting` | Custom reports and dashboards         |
| `api_access`         | REST API access for automation        |
| `bulk_operations`    | Batch processing for large migrations |
| `audit_trail`        | Detailed operation audit logging      |
| `webhook_support`    | Outbound webhooks for integrations    |

### 6. Translations Cleaned

- **Removed**: `boq.json`, `execution.json`, `workLogs.json`, `tasks.json` (EN + HE)
- **Updated**: `projects.json` (removed contract/contractor/client fields), `admin.json` (plan modules, org types, labels), `common.json` (subtitle), `docs.json` (folder names)

### 7. Project Sidebar Reduced

After cleanup: **Overview, Docs, Users, Settings** — a clean shell ready for RevBrain-specific tabs.

### 8. Database Schema — `project_members` Table Added

New table for project-scoped role assignments:

```sql
CREATE TABLE project_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role VARCHAR(20) NOT NULL, -- 'operator' | 'reviewer'
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

---

## Current Platform State

### What Exists (Ready to Use)

| System                | Status           | Notes                                                     |
| --------------------- | ---------------- | --------------------------------------------------------- |
| **Auth (Supabase)**   | Production-ready | Sessions, password reset, magic links, email verification |
| **RBAC**              | Updated          | 5-role system with project-scoped support                 |
| **Stripe Billing**    | Production-ready | Subscriptions, payments, trials, coupons, webhooks        |
| **Onboarding**        | Updated          | Tenant creation with plan assignment and admin invite     |
| **Support Tickets**   | Production-ready | Full lifecycle with conversations and admin panel         |
| **Leads**             | Production-ready | Public contact form with UTM tracking                     |
| **File Storage**      | Production-ready | Per-project file management via Supabase Storage          |
| **Email**             | Production-ready | 8 templates via Resend (welcome, payment, trial, etc.)    |
| **Rate Limiting**     | Production-ready | Per-IP and per-user with alerting                         |
| **Alerting**          | Production-ready | Multi-channel (Sentry, Slack, email, console)             |
| **Projects**          | Shell ready      | CRUD with name, description, dates, status, notes         |
| **Project Workspace** | Shell ready      | Overview, Docs, Users, Settings tabs                      |
| **Dashboard**         | Minimal          | 4 cards (total/active/completed/attention projects)       |
| **Admin Panel**       | Production-ready | Tenants, users, pricing, coupons, support                 |

### Database Tables

**Active (17 tables)**:
`plans`, `organizations`, `users`, `audit_logs`, `projects`, `project_members`, `subscriptions`, `payment_history`, `billing_events`, `coupons`, `coupon_usages`, `leads`, `lead_activities`, `support_tickets`, `ticket_messages`, `chat_groups`, `chat_messages`, `project_files`, `job_queue`

**Removed from schema (pending DB migration)**:
`boq_items`, `bills`, `bill_items`, `measurements`, `work_logs`, `tasks`, `task_audit_log`, `walls`, `paving_areas`, `earthwork_calculations`, `calculation_results`, `module_spreadsheets`

### Test Coverage

| Suite             | Tests   | Status          |
| ----------------- | ------- | --------------- |
| Server unit tests | 364     | All passing     |
| Client unit tests | 159     | All passing     |
| **Total**         | **523** | **All passing** |

Lint: 0 errors | Format: clean | Pre-commit hooks: passing

---

## What Step 0 Does NOT Cover

These items are intentionally deferred:

- **Project internals**: What a RevBrain migration project contains (steps, validations, mappings)
- **Salesforce integration**: OAuth, API connections, metadata reading
- **CPQ/RCA data models**: Product2, PricebookEntry, QuoteLineItem, SBQQ objects
- **Migration engine**: The actual migration logic and orchestration
- **Reports and dashboards**: Migration progress, data quality, comparison views
- **Dashboard redesign**: Will evolve once project internals exist

---

## Pending Database Migrations

When connecting to Supabase, the following SQL migrations are needed:

```sql
-- 1. Drop removed tables
DROP TABLE IF EXISTS module_spreadsheets CASCADE;
DROP TABLE IF EXISTS calculation_results CASCADE;
DROP TABLE IF EXISTS earthwork_calculations CASCADE;
DROP TABLE IF EXISTS paving_areas CASCADE;
DROP TABLE IF EXISTS walls CASCADE;
DROP TABLE IF EXISTS task_audit_log CASCADE;
DROP TABLE IF EXISTS tasks CASCADE;
DROP TABLE IF EXISTS work_logs CASCADE;
DROP TABLE IF EXISTS measurements CASCADE;
DROP TABLE IF EXISTS bill_items CASCADE;
DROP TABLE IF EXISTS bills CASCADE;
DROP TABLE IF EXISTS boq_items CASCADE;

-- 2. Remove construction columns from projects
ALTER TABLE projects DROP COLUMN IF EXISTS contract_number;
ALTER TABLE projects DROP COLUMN IF EXISTS contract_date;
ALTER TABLE projects DROP COLUMN IF EXISTS contractor_name;
ALTER TABLE projects DROP COLUMN IF EXISTS contractor_id;
ALTER TABLE projects DROP COLUMN IF EXISTS client_name;
ALTER TABLE projects DROP COLUMN IF EXISTS client_id;
ALTER TABLE projects DROP COLUMN IF EXISTS contract_value_cents;
ALTER TABLE projects DROP COLUMN IF EXISTS global_discount_percent;
ALTER TABLE projects DROP COLUMN IF EXISTS chapter_discounts;
ALTER TABLE projects DROP COLUMN IF EXISTS location;

-- 3. Update user roles
UPDATE users SET role = 'org_owner' WHERE role IN ('contractor_ceo', 'client_owner');
UPDATE users SET role = 'admin' WHERE role IN ('contractor_pm', 'client_pm');
UPDATE users SET role = 'operator' WHERE role IN ('execution_engineer', 'quantity_surveyor', 'inspector');
UPDATE users SET role = 'reviewer' WHERE role IN ('quality_controller', 'quality_assurance', 'accounts_controller');

-- 4. Create project_members table
CREATE TABLE project_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role VARCHAR(20) NOT NULL CHECK (role IN ('operator', 'reviewer')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(project_id, user_id)
);
```
