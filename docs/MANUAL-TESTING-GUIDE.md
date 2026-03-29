# RevBrain — Manual Testing Guide

> Comprehensive test plan covering every user-facing flow.
> Run against **staging** (`pnpm dev`) or **local-db** (`pnpm local:db`).

---

## Prerequisites

| Requirement              | How to verify                                          |
| ------------------------ | ------------------------------------------------------ |
| Staging DB seeded        | `pnpm db:seed` (users, orgs, plans exist)              |
| Server running           | `pnpm dev` or `pnpm local:db`                          |
| Client running           | Same command (Turbo runs both)                         |
| Salesforce Connected App | `.env.stg` or `.env.local-db` has real SF creds        |
| Email delivery           | Resend API key in env (or check console in local mode) |

---

## Flow 1: Platform Admin — Onboard New Customer

**Role:** `system_admin`
**Route:** `/admin/tenants/onboard`
**API:** `POST /v1/admin/onboard`

| #   | Step                                                              | Expected Result                                           | Pass? |
| --- | ----------------------------------------------------------------- | --------------------------------------------------------- | ----- |
| 1.1 | Login as system_admin at `/login`                                 | Dashboard loads, admin nav visible                        |       |
| 1.2 | Navigate to `/admin`                                              | Admin dashboard shows system stats (tenants, users, MRR)  |       |
| 1.3 | Navigate to `/admin/tenants`                                      | Tenant list loads with existing orgs                      |       |
| 1.4 | Click "Onboard Organization" → `/admin/tenants/onboard`           | Onboarding form renders                                   |       |
| 1.5 | Fill in: org name, slug, type, plan, first admin email, full name | All fields accept input                                   |       |
| 1.6 | Submit onboarding form                                            | Success toast, org created, admin user created (inactive) |       |
| 1.7 | Check email (Resend or console)                                   | Welcome/invitation email received with set-password link  |       |
| 1.8 | Navigate to `/admin/tenants`                                      | New org appears in list                                   |       |
| 1.9 | Click into tenant detail → `/admin/tenants/:id`                   | Shows org details, user count, plan info                  |       |

---

## Flow 2: Platform Admin — User Management

**Role:** `system_admin`
**Routes:** `/admin/users`, `/admin/users/invite`

| #   | Step                                               | Expected Result                                        | Pass? |
| --- | -------------------------------------------------- | ------------------------------------------------------ | ----- |
| 2.1 | Navigate to `/admin/users`                         | All users listed with org names, pagination works      |       |
| 2.2 | Search/filter users                                | Filters narrow list correctly                          |       |
| 2.3 | Click user row                                     | User detail shows (email, role, org, status, activity) |       |
| 2.4 | Edit user (change role or name)                    | `PATCH /v1/admin/users/:id` succeeds, change reflected |       |
| 2.5 | Invite user via admin: `/admin/users/invite`       | Form renders with org picker                           |       |
| 2.6 | Submit invite (new email, select org, select role) | User created (inactive), email sent                    |       |
| 2.7 | Delete a test user                                 | Confirmation dialog → user removed from list           |       |

---

## Flow 3: Platform Admin — Audit Log & Impersonation

**Role:** `system_admin`
**Routes:** `/admin/audit`, impersonation API

| #   | Step                                             | Expected Result                                                       | Pass? |
| --- | ------------------------------------------------ | --------------------------------------------------------------------- | ----- |
| 3.1 | Navigate to `/admin/audit`                       | Audit log entries load (paginated)                                    |       |
| 3.2 | Filter by action type (e.g., `user.created`)     | Entries filter correctly                                              |       |
| 3.3 | Filter by date range                             | Only matching entries shown                                           |       |
| 3.4 | Export audit log (CSV)                           | `GET /v1/admin/audit/export` returns CSV download                     |       |
| 3.5 | Start impersonation: select a tenant user        | `POST /v1/admin/impersonate` — read-only session starts, banner shown |       |
| 3.6 | Navigate tenant's dashboard as impersonated user | Data loads, write operations blocked                                  |       |
| 3.7 | End impersonation                                | Session returns to admin context                                      |       |
| 3.8 | Verify impersonation logged in audit             | `impersonate.started` + `impersonate.ended` entries visible           |       |

---

## Flow 4: Platform Admin — Plans & Coupons

**Role:** `system_admin`
**Routes:** `/admin/pricing`, `/admin/coupons`

| #   | Step                                              | Expected Result                   | Pass? |
| --- | ------------------------------------------------- | --------------------------------- | ----- |
| 4.1 | Navigate to `/admin/pricing`                      | Plans list loads                  |       |
| 4.2 | Create a new plan (name, price, features, limits) | Plan saved via `POST /v1/plans/`  |       |
| 4.3 | Edit existing plan                                | `PATCH /v1/plans/:id` succeeds    |       |
| 4.4 | Navigate to `/admin/coupons`                      | Coupon list loads                 |       |
| 4.5 | Create coupon (% discount, validity period)       | `POST /v1/admin/coupons` succeeds |       |
| 4.6 | Edit coupon                                       | Changes saved                     |       |
| 4.7 | Delete coupon                                     | Confirmation → coupon removed     |       |

---

## Flow 5: New User — Set Password & Activate

**Role:** Invited user (inactive)
**Routes:** `/set-password`, `/login`

| #   | Step                                               | Expected Result                      | Pass? |
| --- | -------------------------------------------------- | ------------------------------------ | ----- |
| 5.1 | Open set-password link from invitation email       | Set password page loads              |       |
| 5.2 | Enter new password (meets complexity requirements) | Password accepted                    |       |
| 5.3 | Submit                                             | Account activated, redirect to login |       |
| 5.4 | Login with new credentials                         | Dashboard loads, user is active      |       |
| 5.5 | Check `GET /v1/auth/me`                            | Returns user with `isActive: true`   |       |

---

## Flow 6: Password Reset

**Routes:** `/forgot-password`, `/reset-password`

| #   | Step                                           | Expected Result                      | Pass? |
| --- | ---------------------------------------------- | ------------------------------------ | ----- |
| 6.1 | Navigate to `/login` → click "Forgot Password" | Redirects to `/forgot-password`      |       |
| 6.2 | Enter registered email, submit                 | Success message ("check your email") |       |
| 6.3 | Check email                                    | Reset link received                  |       |
| 6.4 | Click reset link → `/reset-password`           | Reset form loads                     |       |
| 6.5 | Enter new password, submit                     | Success, redirect to login           |       |
| 6.6 | Login with new password                        | Dashboard loads                      |       |
| 6.7 | Verify old password no longer works            | Login fails                          |       |

---

## Flow 7: Org Admin — Invite Team Members

**Role:** `org_owner` or org admin
**Route:** `/users/invite`

| #   | Step                                                   | Expected Result                                  | Pass? |
| --- | ------------------------------------------------------ | ------------------------------------------------ | ----- |
| 7.1 | Navigate to `/users`                                   | Team list shows current org members              |       |
| 7.2 | Click "Invite User" → `/users/invite`                  | Invite form renders                              |       |
| 7.3 | Enter email, select role (reviewer/operator), submit   | `POST /v1/org/invite` → user created, email sent |       |
| 7.4 | Verify new user appears in team list (status: invited) | User visible with pending status                 |       |
| 7.5 | Resend invitation                                      | `POST /v1/org/invite/resend` → new email sent    |       |
| 7.6 | New user follows set-password flow (Flow 5)            | User becomes active, appears in team list        |       |

---

## Flow 8: Project Management — CRUD

**Route:** `/projects`, `/project/:id/settings`

| #   | Step                                          | Expected Result                                         | Pass? |
| --- | --------------------------------------------- | ------------------------------------------------------- | ----- |
| 8.1 | Navigate to `/projects`                       | Projects list loads                                     |       |
| 8.2 | Create new project (name, description, dates) | `POST /v1/projects/` → project created, appears in list |       |
| 8.3 | Click project → `/project/:id`                | Overview page loads                                     |       |
| 8.4 | Navigate to `/project/:id/settings`           | Settings form shows project details                     |       |
| 8.5 | Edit project (name, description, status)      | `PATCH /v1/projects/:id` → changes saved                |       |
| 8.6 | Delete project                                | Confirmation → project removed from list                |       |

---

## Flow 9: Salesforce Connection — OAuth

**Route:** `/project/:id` (Overview page)

| #   | Step                                        | Expected Result                                                   | Pass? |
| --- | ------------------------------------------- | ----------------------------------------------------------------- | ----- |
| 9.1 | Navigate to project overview                | Connection cards show "Connect Source Org" / "Connect Target Org" |       |
| 9.2 | Click "Connect Source Org" card (or button) | OAuth popup opens Salesforce login                                |       |
| 9.3 | Login to Salesforce, grant access           | Popup closes, card updates to "Connected"                         |       |
| 9.4 | Health strip updates                        | Source shows green "Connected" status                             |       |
| 9.5 | Click "Test" on connected card              | `POST /salesforce/test` → health check passes                     |       |
| 9.6 | Repeat for target org (optional)            | Target card shows connected                                       |       |
| 9.7 | Disconnect source org                       | `POST /salesforce/disconnect` → card resets to empty state        |       |
| 9.8 | Reconnect (verify error state clears)       | Button resets, no stale error message                             |       |
| 9.9 | Block popup and retry                       | Error message shows "Popup blocked", clears on retry              |       |

---

## Flow 10: Assessment — Run Extraction

**Route:** `/project/:id/assessment`

| #    | Step                                                   | Expected Result                                      | Pass? |
| ---- | ------------------------------------------------------ | ---------------------------------------------------- | ----- |
| 10.1 | Navigate to `/project/:id/assessment` (no prior run)   | Empty state with "Run Assessment" CTA                |       |
| 10.2 | Click "Run Assessment" (no SF connection)              | Error: "No active source Salesforce connection"      |       |
| 10.3 | Connect SF first (Flow 9), then click "Run Assessment" | `POST /assessment/run` → 202, worker spawns locally  |       |
| 10.4 | Observe polling                                        | Status updates: queued → dispatched → running        |       |
| 10.5 | Progress indicator shows                               | Extraction X%... with spinner                        |       |
| 10.6 | Wait for completion                                    | Status: completed, findings count shown              |       |
| 10.7 | Assessment dashboard loads automatically               | Overview tab with Executive Summary, readiness cards |       |

---

## Flow 11: Assessment — Dashboard Exploration

**Route:** `/project/:id/assessment`

| #     | Step                                  | Expected Result                                                              | Pass? |
| ----- | ------------------------------------- | ---------------------------------------------------------------------------- | ----- |
| 11.1  | Overview tab loads                    | Executive Summary (dark card), Migration Readiness bar + cards, Key Findings |       |
| 11.2  | Risk & Blocker cards visible          | Risk count + top risks, blocker count                                        |       |
| 11.3  | Click "View all risks"                | Risk Register expands (table with severity, category, mitigation)            |       |
| 11.4  | Back button returns to overview       | Overview re-renders                                                          |       |
| 11.5  | Domain heatmap shows 9 rows           | Each domain clickable, complexity badge, bar chart                           |       |
| 11.6  | Click a domain row                    | Tab switches to that domain                                                  |       |
| 11.7  | Treemap visualization renders         | Proportional boxes by domain size                                            |       |
| 11.8  | Radar + Risk Scatter charts render    | SVG charts with data points                                                  |       |
| 11.9  | CPQ Intelligence section visible      | Settings, Plugins, Hotspots, Data Quality cards (if data exists)             |       |
| 11.10 | Top Products + Conversion tables      | Tables populated with extracted data                                         |       |
| 11.11 | User Behavior + Discount Distribution | Cards render with roles and distribution bars                                |       |
| 11.12 | Status & Progress section             | Delta summary + Org Health gauges                                            |       |
| 11.13 | Completeness checklist                | Shows assessment progress checkmarks                                         |       |

---

## Flow 12: Assessment — Domain Tabs

**Route:** `/project/:id/assessment?tab=products` (etc.)

| #    | Step                                                                   | Expected Result                            | Pass? |
| ---- | ---------------------------------------------------------------------- | ------------------------------------------ | ----- |
| 12.1 | Click "Products" tab                                                   | Products domain loads with inventory table |       |
| 12.2 | Search items                                                           | Filter works, count updates                |       |
| 12.3 | Filter by complexity (Low/Moderate/High)                               | Table filters correctly                    |       |
| 12.4 | Filter by migration status (Auto/Guided/Manual/Blocked)                | Table filters correctly                    |       |
| 12.5 | Click an item row                                                      | Detail slide-over panel opens              |       |
| 12.6 | Detail panel shows: description, complexity, RCA mapping, dependencies | All sections populated                     |       |
| 12.7 | Close detail panel                                                     | Returns to table view                      |       |
| 12.8 | Switch through all tabs (Pricing, Rules, Code, etc.)                   | Each tab loads with domain-specific data   |       |
| 12.9 | Tabs with blockers show red dot indicator                              | Red dot on tabs that have blocked items    |       |

---

## Flow 13: Assessment — Re-Extract & Report

**Route:** `/project/:id/assessment`

| #    | Step                                    | Expected Result                          | Pass? |
| ---- | --------------------------------------- | ---------------------------------------- | ----- |
| 13.1 | Click "Re-Extract" button               | New run triggered, status polling starts |       |
| 13.2 | Rate limit: click again within 5 min    | Error: "Please wait at least 5 minutes"  |       |
| 13.3 | Click "Export" / Generate Report button | Spinner shows, report generation starts  |       |
| 13.4 | Report completes                        | Button changes to "Report Ready"         |       |
| 13.5 | Report error                            | Error message appears below button       |       |

---

## Flow 14: Project Files / Artifacts

**Route:** `/project/:id/artifacts`

| #    | Step                                 | Expected Result                                      | Pass? |
| ---- | ------------------------------------ | ---------------------------------------------------- | ----- |
| 14.1 | Navigate to `/project/:id/artifacts` | File list loads (or empty state)                     |       |
| 14.2 | Upload a file (< 50MB)               | `POST /v1/projects/:id/files` → file appears in list |       |
| 14.3 | Download file                        | `GET /files/:fileId/download` → file downloads       |       |
| 14.4 | Delete file                          | Confirmation → file removed                          |       |
| 14.5 | Upload large file (> 50MB)           | Error: file too large                                |       |

---

## Flow 15: User Profile & Settings

**Routes:** `/settings/profile`, `/settings/security`, `/settings/account`

| #    | Step                               | Expected Result                                          | Pass? |
| ---- | ---------------------------------- | -------------------------------------------------------- | ----- |
| 15.1 | Navigate to `/settings/profile`    | Profile form loads with current data                     |       |
| 15.2 | Update full name, job title, phone | `PATCH /v1/users/me` → changes saved                     |       |
| 15.3 | Navigate to `/settings/security`   | Security page loads                                      |       |
| 15.4 | Change password (old + new)        | `POST /v1/users/me/change-password` → success            |       |
| 15.5 | Navigate to `/settings/account`    | Account page loads                                       |       |
| 15.6 | Delete account (danger zone)       | Confirmation dialog → `DELETE /v1/users/me` → logged out |       |

---

## Flow 16: Billing

**Route:** `/billing`
**Note:** Stripe not yet configured — verify graceful handling.

| #    | Step                                  | Expected Result                                        | Pass? |
| ---- | ------------------------------------- | ------------------------------------------------------ | ----- |
| 16.1 | Navigate to `/billing`                | Billing page loads (shows current plan or placeholder) |       |
| 16.2 | View available plans                  | `GET /v1/plans/` → plans listed                        |       |
| 16.3 | Click upgrade (Stripe configured)     | Redirects to Stripe checkout                           |       |
| 16.4 | Click upgrade (Stripe NOT configured) | Graceful error or contact-sales fallback               |       |
| 16.5 | View billing history                  | `GET /v1/billing/history` → payment list or empty      |       |

---

## Flow 17: Support Tickets

**Route:** via help page or project

| #    | Step                                        | Expected Result                                       | Pass? |
| ---- | ------------------------------------------- | ----------------------------------------------------- | ----- |
| 17.1 | Navigate to `/help`                         | Help page loads with support options                  |       |
| 17.2 | Create support ticket                       | `POST /v1/support/tickets` → ticket created           |       |
| 17.3 | View own tickets                            | `GET /v1/support/tickets` → list loads                |       |
| 17.4 | Add reply to ticket                         | `POST /v1/support/tickets/:id/replies` → reply added  |       |
| 17.5 | Admin views all tickets at `/admin/support` | Full ticket list with filters                         |       |
| 17.6 | Admin assigns ticket, changes priority      | `PATCH /v1/admin/support/tickets/:id` → changes saved |       |
| 17.7 | Admin closes ticket                         | `POST /tickets/:id/close` → status: closed            |       |

---

## Flow 18: Language Switching (i18n)

| #    | Step                                              | Expected Result                                              | Pass? |
| ---- | ------------------------------------------------- | ------------------------------------------------------------ | ----- |
| 18.1 | Switch language to Hebrew                         | UI flips to RTL, all text in Hebrew                          |       |
| 18.2 | Navigate through Assessment tab                   | All assessment labels in Hebrew                              |       |
| 18.3 | Check CPQ Intelligence cards                      | Hebrew labels (הגדרות CPQ, תוספים, etc.)                     |       |
| 18.4 | Check Executive Summary                           | Hebrew narrative and metric labels                           |       |
| 18.5 | Switch back to English                            | UI returns to LTR, English text                              |       |
| 18.6 | Check no missing translation keys (shows raw key) | All `t()` calls resolve to text, no `assessment.xxx` visible |       |

---

## Flow 19: Dashboard

**Route:** `/`

| #    | Step                       | Expected Result                 | Pass? |
| ---- | -------------------------- | ------------------------------- | ----- |
| 19.1 | Login as org user          | Dashboard page loads            |       |
| 19.2 | Project cards/list visible | Shows org's projects            |       |
| 19.3 | Quick links work           | Click project → workspace loads |       |
| 19.4 | Activity feed loads        | Recent activity entries shown   |       |

---

## Flow 20: Edge Cases & Error Handling

| #    | Step                                     | Expected Result                                    | Pass? |
| ---- | ---------------------------------------- | -------------------------------------------------- | ----- |
| 20.1 | Access project from another org          | 404 — "Project not found"                          |       |
| 20.2 | Expired JWT                              | Redirect to login                                  |       |
| 20.3 | Invalid URL (e.g., `/project/fake-uuid`) | 404 page                                           |       |
| 20.4 | API server down                          | Client shows error boundary / offline message      |       |
| 20.5 | Concurrent assessment runs (same org)    | Second request returns 409 "already in progress"   |       |
| 20.6 | Cancel running assessment                | Status transitions to cancel_requested → cancelled |       |
| 20.7 | SF token expired during extraction       | Worker refreshes token via internal API            |       |
| 20.8 | Double-click connect button              | Only one OAuth popup opens                         |       |

---

## Environment-Specific Notes

### `pnpm local` (Full Mock)

- All data is mock — no DB, no Salesforce, no emails
- Auth: auto-login as David Levy (Acme org owner)
- Assessment shows hardcoded mock data
- Good for: UI layout testing, component development

### `pnpm local:db` (Mock Auth + Real DB)

- Real staging DB, real Salesforce, mock auth
- Auto-login as David Levy (from staging DB)
- Assessment reads real findings from DB
- Worker spawns locally on "Run Assessment"
- Good for: end-to-end pipeline testing without cloud

### `pnpm dev` (Full Staging)

- Real Supabase Auth + DB + Salesforce
- Login with real credentials (JWT)
- Emails sent via Resend
- Good for: pre-production validation

---

## Test Completion Tracker

| Flow | Description               | Status |
| ---- | ------------------------- | ------ |
| 1    | Admin Onboarding          |        |
| 2    | Admin User Management     |        |
| 3    | Audit Log & Impersonation |        |
| 4    | Plans & Coupons           |        |
| 5    | Set Password & Activate   |        |
| 6    | Password Reset            |        |
| 7    | Invite Team Members       |        |
| 8    | Project CRUD              |        |
| 9    | Salesforce OAuth          |        |
| 10   | Assessment Extraction     |        |
| 11   | Assessment Dashboard      |        |
| 12   | Assessment Domain Tabs    |        |
| 13   | Re-Extract & Report       |        |
| 14   | Project Files             |        |
| 15   | User Settings             |        |
| 16   | Billing                   |        |
| 17   | Support Tickets           |        |
| 18   | Language Switching        |        |
| 19   | Dashboard                 |        |
| 20   | Edge Cases                |        |
