# Tenant Isolation Audit

> Date: 2026-03-19 | Auditor: Claude (AI-assisted) | Scope: All route files in `apps/server/src/v1/routes/`

## Summary

**NO VULNERABILITIES FOUND.** Every tenant-facing `findById` / `queryOne` lookup is properly scoped by `organizationId` before returning data. Admin routes are correctly gated by `requireRole('system_admin')` and intentionally operate at platform level.

19 route files analyzed. 17 findById patterns audited.

## Audit Table

| File             | Handler                    | Auth                        | Lookup                                            | Org Check                                            | Status         |
| ---------------- | -------------------------- | --------------------------- | ------------------------------------------------- | ---------------------------------------------------- | -------------- |
| projects.ts      | GET /:id                   | authMiddleware              | repos.projects.findById(id)                       | `project.organizationId !== user.organizationId`     | **SAFE**       |
| projects.ts      | PUT /:id                   | authMiddleware              | repos.projects.findById(id)                       | `existing.organizationId !== user.organizationId`    | **SAFE**       |
| projects.ts      | DELETE /:id                | authMiddleware              | repos.projects.findById(id)                       | `existing.organizationId !== user.organizationId`    | **SAFE**       |
| project-files.ts | GET /:fileId/download      | authMiddleware              | db.query.projectFiles.findFirst()                 | `file.organizationId !== user.organizationId`        | **SAFE**       |
| project-files.ts | PUT /:fileId               | authMiddleware              | db.query.projectFiles.findFirst()                 | `existing.organizationId !== user.organizationId`    | **SAFE**       |
| project-files.ts | DELETE /:fileId            | authMiddleware              | db.query.projectFiles.findFirst()                 | `file.organizationId !== user.organizationId`        | **SAFE**       |
| project-files.ts | POST /                     | authMiddleware              | repos.projects.findById(projectId)                | `project.organizationId !== user.organizationId`     | **SAFE**       |
| support.ts       | GET /tickets/:id           | authMiddleware              | ticketService.getTicketById(id)                   | `ticket.organizationId !== user.organizationId`      | **SAFE**       |
| support.ts       | POST /tickets/:id/messages | authMiddleware              | ticketService.getTicketById(id)                   | `ticket.userId !== user.id`                          | **SAFE**       |
| support.ts       | PUT /tickets/:id/close     | authMiddleware              | ticketService.getTicketById(id)                   | `ticket.userId !== user.id`                          | **SAFE**       |
| auth.ts          | GET /me                    | authMiddleware              | repos.organizations.findById(user.organizationId) | Implicit (user's own org from JWT)                   | **SAFE**       |
| billing.ts       | POST /checkout             | authMiddleware              | db.query.organizations.findFirst()                | Explicit `eq(organizations.id, user.organizationId)` | **SAFE**       |
| org.ts           | POST /invite               | authMiddleware + role       | repos.organizations.findById(targetOrgId)         | Implicit (actor's own org unless system_admin)       | **SAFE**       |
| admin/billing.ts | GET /payments/:id          | requireRole('system_admin') | billingService.getPaymentById(id)                 | N/A                                                  | **SAFE/ADMIN** |
| admin/coupons.ts | GET /:id                   | requireRole('system_admin') | couponService.getCouponById(id)                   | N/A                                                  | **SAFE/ADMIN** |
| admin/support.ts | GET /tickets/:id           | requireRole('system_admin') | ticketService.getTicketById(id)                   | N/A                                                  | **SAFE/ADMIN** |
| admin/users.ts   | PUT /:id                   | requireRole('system_admin') | repos.users.findById(id)                          | N/A                                                  | **SAFE/ADMIN** |

## Decision Framework Applied

- **Route with `requireRole('system_admin')`**: Cross-tenant access is intentional → marked SAFE/ADMIN
- **Route with `requireAuth()` only**: findById result MUST be checked against user's organizationId → verified for all routes
- **Public routes**: No ID-based lookups found that expose tenant data

## Security Patterns Observed

1. **Consistent 3-step pattern**: Authenticate → Fetch by ID → Verify org ownership → Return
2. **Compound lookups**: File routes use both projectId AND fileId in queries
3. **Service layer delegation**: Many routes use services (TicketService, BillingService) which add another layer of scoping
4. **Admin isolation**: Clear middleware separation between admin and tenant routes

## Supabase RLS Status

**VERIFIED: 2026-03-21 — RLS ENABLED on all 19 tables.**

Supabase enables RLS by default on all tables. Confirmed via `pg_tables.rowsecurity`:

| Table           | RLS     |
| --------------- | ------- |
| audit_logs      | ENABLED |
| billing_events  | ENABLED |
| chat_groups     | ENABLED |
| chat_messages   | ENABLED |
| coupon_usages   | ENABLED |
| coupons         | ENABLED |
| job_queue       | ENABLED |
| lead_activities | ENABLED |
| leads           | ENABLED |
| organizations   | ENABLED |
| payment_history | ENABLED |
| plans           | ENABLED |
| project_files   | ENABLED |
| project_members | ENABLED |
| projects        | ENABLED |
| subscriptions   | ENABLED |
| support_tickets | ENABLED |
| ticket_messages | ENABLED |
| users           | ENABLED |

### Audit Log Immutability

RLS policies on `audit_logs` table:

- `audit_logs_insert_only` — INSERT for service_role only
- `audit_logs_select` — SELECT for service_role only
- **No UPDATE or DELETE policies** — audit logs are immutable via RLS

The app server uses `service_role` for audit writes. No application-level code path can UPDATE or DELETE audit log entries through RLS-enforced connections.

### Note for Production

The same RLS status and audit log policies must be verified and applied on the production Supabase project (revbrain-prd) when it is configured.

## Recommendations

1. ~~Enable RLS on all tenant-scoped tables~~ **DONE** — RLS enabled on all 19 tables by default
2. **Add `tenant-isolation.spec.ts`** integration test against real DB (can now proceed with Supabase connected)
3. Consider a **query-scoping interceptor** at the ORM layer to make org-scoping automatic rather than per-handler (Enterprise phase)
4. **Add tenant-specific RLS policies** defining which roles can access which tables (Enterprise phase E6)
