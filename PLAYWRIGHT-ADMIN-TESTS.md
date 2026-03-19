# Playwright Admin Test Plan

> E2E tests for the system_admin platform.
> **Phase A**: mock mode (no Supabase) — **Phase B**: real Supabase test account.
> Tests are written once and run in both modes via environment config.

---

## Test Infrastructure

### Mock Mode (Phase A)

```env
AUTH_MODE=mock
USE_MOCK_DATA=true
```

- Auth token: `mock_token_{MOCK_IDS.USER_SYSTEM_ADMIN}`
- All data in-memory via mock repositories
- No Stripe, no Supabase — instant, deterministic

### Real Mode (Phase B)

```env
AUTH_MODE=jwt
USE_MOCK_DATA=false
SUPABASE_URL=<test-project>
SUPABASE_SERVICE_ROLE_KEY=<test-key>
```

- Real Supabase Auth login flow
- Real PostgreSQL via Supabase
- Stripe test mode for billing/coupon sync

### Shared Helpers

| Helper                 | Purpose                                                  |
| ---------------------- | -------------------------------------------------------- |
| `adminLogin()`         | Mock: set token in storage. Real: fill login form + wait |
| `apiAs(role)`          | Return authenticated API context for a given role        |
| `resetMockData()`      | POST to a test-only reset endpoint (mock mode)           |
| `seedFixtures()`       | Insert baseline data before suite (real mode)            |
| `waitForAudit(action)` | Poll audit list until expected action appears            |

---

## 1. Authentication & Authorization

### 1.1 Admin Login

| #   | Test                                          | Steps                                               | Assert                                                                        |
| --- | --------------------------------------------- | --------------------------------------------------- | ----------------------------------------------------------------------------- |
| 1   | System admin can log in and see admin sidebar | Login as `USER_SYSTEM_ADMIN`                        | Sidebar shows: Overview, Tenants, Users, Pricing, Coupons, Support, Audit Log |
| 2   | Non-admin cannot access admin routes          | Login as `USER_ACME_OPERATOR`, navigate to `/admin` | Redirected away or 403 shown                                                  |
| 3   | Unauthenticated user gets redirected          | Clear auth, navigate to `/admin`                    | Redirected to login page                                                      |

### 1.2 Role-Based Access (API level)

| #   | Test                                         | Steps                                       | Assert           |
| --- | -------------------------------------------- | ------------------------------------------- | ---------------- |
| 4   | Admin endpoints reject non-admin tokens      | GET `/v1/admin/stats` with operator token   | 403 Forbidden    |
| 5   | Admin endpoints reject expired/invalid token | GET `/v1/admin/stats` with `Bearer garbage` | 401 Unauthorized |
| 6   | Admin endpoints reject no auth header        | GET `/v1/admin/stats` without Authorization | 401 Unauthorized |

---

## 2. Dashboard (Platform Overview)

| #   | Test                                    | Steps                                  | Assert                                                 |
| --- | --------------------------------------- | -------------------------------------- | ------------------------------------------------------ |
| 7   | Dashboard loads with stats              | Navigate to `/admin`                   | Shows tenant count, active users, active projects, MRR |
| 8   | Recent activity timeline renders        | Navigate to `/admin`                   | Shows last audit log entries with action and timestamp |
| 9   | Stats handle partial failure gracefully | (API test) Mock one stat query to fail | Returns null for failed stat, others still present     |

---

## 3. Tenant Management

### 3.1 Tenant List

| #   | Test                               | Steps                                   | Assert                                                |
| --- | ---------------------------------- | --------------------------------------- | ----------------------------------------------------- |
| 10  | Tenant list loads                  | Navigate to `/admin/tenants`            | Shows ACME Corp, Beta Inc with name, plan, seat count |
| 11  | Tenant list shows storage usage    | Navigate to `/admin/tenants`            | Storage column visible with human-readable values     |
| 12  | Seat warning shown when near limit | Tenant with seatUsed close to seatLimit | Warning indicator visible                             |

### 3.2 Edit Tenant

| #   | Test                            | Steps                                               | Assert                      |
| --- | ------------------------------- | --------------------------------------------------- | --------------------------- |
| 13  | Edit tenant name                | Open ACME edit drawer, change name, save            | Name updated, success toast |
| 14  | Change tenant plan              | Open edit drawer, switch plan to Enterprise, save   | Plan updated in list        |
| 15  | Change seat limit               | Open edit drawer, set seatLimit to 50, save         | Seat limit updated          |
| 16  | Optimistic concurrency conflict | Open drawer, stale update via API, then save drawer | 409 conflict error shown    |

### 3.3 Deactivate Tenant

| #   | Test                                 | Steps                                 | Assert                                                  |
| --- | ------------------------------------ | ------------------------------------- | ------------------------------------------------------- |
| 17  | Deactivate tenant                    | Click deactivate on Beta Inc, confirm | Tenant marked inactive, audit log: `tenant.deactivated` |
| 18  | Deactivate shows confirmation dialog | Click deactivate                      | Confirmation prompt appears before action               |

### 3.4 Tenant Access Log

| #   | Test                   | Steps                                         | Assert                                     |
| --- | ---------------------- | --------------------------------------------- | ------------------------------------------ |
| 19  | View tenant access log | Open ACME tenant, view access log tab/section | Shows admin access entries for that tenant |

---

## 4. User Management

### 4.1 User List

| #   | Test                           | Steps                      | Assert                                          |
| --- | ------------------------------ | -------------------------- | ----------------------------------------------- |
| 20  | User list loads with all users | Navigate to `/admin/users` | Shows users with name, email, role, status, org |
| 21  | Pagination works               | Set limit to 2, click next | Second page shows remaining users               |

### 4.2 Invite User

| #   | Test                              | Steps                                                | Assert                                      |
| --- | --------------------------------- | ---------------------------------------------------- | ------------------------------------------- |
| 22  | Invite new user to org            | Click invite, fill email + name + role + org, submit | User appears in list, audit: `user.created` |
| 23  | Invite with duplicate email fails | Invite with existing email                           | Error: email already exists                 |
| 24  | Required fields validated         | Submit invite with empty email                       | Validation error shown                      |

### 4.3 Edit User

| #   | Test                                | Steps                                 | Assert                                                           |
| --- | ----------------------------------- | ------------------------------------- | ---------------------------------------------------------------- |
| 25  | Update user role                    | Edit user, change role to admin, save | Role updated, audit: `user.updated` with role change in metadata |
| 26  | Update user profile fields          | Edit name, jobTitle, phone, save      | Fields updated                                                   |
| 27  | Optimistic concurrency on user edit | Open edit, stale update via API, save | 409 conflict                                                     |

### 4.4 Delete User

| #   | Test                      | Steps                            | Assert                                        |
| --- | ------------------------- | -------------------------------- | --------------------------------------------- |
| 28  | Soft-delete user          | Delete a non-admin user, confirm | User removed from list, audit: `user.deleted` |
| 29  | Delete shows confirmation | Click delete                     | Confirmation dialog before action             |

---

## 5. Support Tickets

### 5.1 Ticket List & Filters

| #   | Test                          | Steps                                    | Assert                                               |
| --- | ----------------------------- | ---------------------------------------- | ---------------------------------------------------- |
| 30  | Ticket list loads             | Navigate to `/admin/support`             | Shows tickets with number, subject, status, priority |
| 31  | Filter by status              | Select status = "open"                   | Only open tickets shown                              |
| 32  | Filter by priority            | Select priority = "high"                 | Only high priority tickets shown                     |
| 33  | Search tickets                | Type search query                        | Results filtered by text match                       |
| 34  | SLA overdue indicator visible | Ticket open >4hrs with no first response | Overdue badge/indicator shown                        |

### 5.2 Ticket Stats

| #   | Test                      | Steps                        | Assert                                          |
| --- | ------------------------- | ---------------------------- | ----------------------------------------------- |
| 35  | Support stats cards shown | Navigate to `/admin/support` | Shows total, open, in-progress, resolved counts |

### 5.3 Ticket Detail & Actions

| #   | Test                                    | Steps                                          | Assert                                             |
| --- | --------------------------------------- | ---------------------------------------------- | -------------------------------------------------- |
| 36  | View ticket detail                      | Click on a ticket                              | Shows subject, description, messages, metadata     |
| 37  | Change ticket status                    | Open ticket, change status to "resolved"       | Status updated, audit: `ticket.status_changed`     |
| 38  | Assign ticket to admin                  | Open ticket, assign to self                    | AssignedTo updated, audit: `ticket.assigned`       |
| 39  | Unassign ticket                         | Open assigned ticket, clear assignment         | Assignment cleared                                 |
| 40  | Reply to ticket (customer-visible)      | Open ticket, write reply, send                 | Message appears in thread, audit: `ticket.replied` |
| 41  | Add internal note                       | Open ticket, toggle internal, write note, send | Note appears with "internal" badge                 |
| 42  | Optimistic concurrency on ticket update | Open ticket, stale update via API, save        | 409 conflict                                       |

### 5.4 Create Ticket on Behalf

| #   | Test                            | Steps                                                       | Assert                                            |
| --- | ------------------------------- | ----------------------------------------------------------- | ------------------------------------------------- |
| 43  | Create ticket on behalf of user | Click create, select user + org, fill subject + description | Ticket created, audit: `ticket.created_on_behalf` |
| 44  | Required fields validated       | Submit without subject                                      | Validation error                                  |

---

## 6. Coupon Management

### 6.1 Coupon List

| #   | Test                    | Steps                        | Assert                                      |
| --- | ----------------------- | ---------------------------- | ------------------------------------------- |
| 45  | Coupon list loads       | Navigate to `/admin/coupons` | Shows coupons with code, discount, validity |
| 46  | Include inactive toggle | Toggle "show inactive"       | Expired/deactivated coupons appear          |

### 6.2 Create Coupon

| #   | Test                                 | Steps                                                   | Assert                                  |
| --- | ------------------------------------ | ------------------------------------------------------- | --------------------------------------- |
| 47  | Create percentage coupon             | Fill code, name, type=percent, value=20, validity, save | Coupon created, audit: `coupon.created` |
| 48  | Create fixed-amount coupon           | Fill code, name, type=fixed, value=500, currency, save  | Coupon created with cents amount        |
| 49  | Create coupon with plan restrictions | Add applicablePlanIds during creation                   | Coupon restricted to selected plans     |
| 50  | Create coupon with usage limits      | Set maxUses=100, maxUsesPerUser=1                       | Limits stored correctly                 |
| 51  | Duplicate coupon code fails          | Create with existing code                               | Error: code already exists              |

### 6.3 Edit Coupon

| #   | Test                                  | Steps                                    | Assert                                      |
| --- | ------------------------------------- | ---------------------------------------- | ------------------------------------------- |
| 52  | Edit coupon name and limits           | Open coupon, change name + maxUses, save | Updated, audit: `coupon.updated`            |
| 53  | Cannot change discount type/value     | Open coupon edit                         | Discount type and value fields are readonly |
| 54  | Optimistic concurrency on coupon edit | Open edit, stale update via API, save    | 409 conflict                                |

### 6.4 Deactivate & Sync

| #   | Test                        | Steps                     | Assert                                   |
| --- | --------------------------- | ------------------------- | ---------------------------------------- |
| 55  | Deactivate coupon           | Click deactivate, confirm | Coupon inactive, audit: `coupon.deleted` |
| 56  | Force sync coupon to Stripe | Click sync button         | Sync completes, audit: `coupon.synced`   |

### 6.5 Coupon Usage History

| #   | Test                      | Steps              | Assert                                    |
| --- | ------------------------- | ------------------ | ----------------------------------------- |
| 57  | View coupon usage history | Open coupon detail | Shows usages with org, user, amount, date |

---

## 7. Billing & Refunds

| #   | Test                           | Steps                                     | Assert                                                     |
| --- | ------------------------------ | ----------------------------------------- | ---------------------------------------------------------- |
| 58  | View payment details           | GET `/v1/admin/billing/payments/:id`      | Returns amount, status, refundable amount                  |
| 59  | Issue full refund              | POST refund without amountCents           | Full refund, audit: `refund.issued` with isFullRefund=true |
| 60  | Issue partial refund           | POST refund with amountCents < total      | Partial refund, remaining refundable updated               |
| 61  | Refund exceeding balance fails | POST refund with amountCents > refundable | 400 error: amount exceeds refundable balance               |
| 62  | Refund with reason             | POST refund with reason text              | Reason stored in audit metadata                            |

---

## 8. Audit Log

### 8.1 Audit Viewer

| #   | Test                   | Steps                          | Assert                                             |
| --- | ---------------------- | ------------------------------ | -------------------------------------------------- |
| 63  | Audit log page loads   | Navigate to `/admin/audit`     | Shows recent entries with action, actor, timestamp |
| 64  | Filter by action type  | Select action = "user.created" | Only user.created entries shown                    |
| 65  | Filter by actor        | Select specific admin user     | Only that admin's actions shown                    |
| 66  | Filter by organization | Select ACME Corp               | Only ACME-related entries shown                    |
| 67  | Filter by date range   | Set dateFrom and dateTo        | Entries within range only                          |
| 68  | Search audit logs      | Type search text               | Results filtered by text match                     |
| 69  | Combined filters       | Set action + org + date range  | Intersection of all filters                        |

### 8.2 CSV Export

| #   | Test                          | Steps                                      | Assert                                   |
| --- | ----------------------------- | ------------------------------------------ | ---------------------------------------- |
| 70  | Export all audit logs         | Click export                               | CSV file downloaded with correct headers |
| 71  | Export with filters applied   | Set filters, then export                   | CSV contains only filtered results       |
| 72  | Export respects 10k row limit | (API test) Request export on large dataset | Max 10,000 rows returned                 |

---

## 9. Job Queue

| #   | Test                              | Steps                                   | Assert                                                      |
| --- | --------------------------------- | --------------------------------------- | ----------------------------------------------------------- |
| 73  | Job stats load                    | GET `/v1/admin/jobs/stats`              | Returns pending, processing, completed, failed, dead counts |
| 74  | Dead jobs list                    | GET `/v1/admin/jobs/dead`               | Returns failed jobs with error details                      |
| 75  | Retry idempotent job (email)      | POST `/v1/admin/jobs/:id/retry` (email) | Job reset to pending, audit: `job.retried`                  |
| 76  | Retry non-idempotent job rejected | POST retry on non-email/webhook job     | 400 error: not safe to retry                                |

---

## 10. Onboarding

| #   | Test                              | Steps                                                      | Assert                                         |
| --- | --------------------------------- | ---------------------------------------------------------- | ---------------------------------------------- |
| 77  | Onboard new organization          | POST with orgName, slug, adminEmail, adminFullName, planId | Org + admin created, audit: `tenant.onboarded` |
| 78  | Onboard with duplicate slug fails | POST with existing org slug                                | Error: slug already taken                      |
| 79  | Onboard validates required fields | POST with missing adminEmail                               | 400 validation error                           |

---

## 11. Feature Overrides

| #   | Test                                | Steps                                          | Assert                                            |
| --- | ----------------------------------- | ---------------------------------------------- | ------------------------------------------------- |
| 80  | Grant feature override              | POST override: feature, value, reason          | Override active, audit: `admin.override_granted`  |
| 81  | Grant override with expiration      | POST override with expiresAt in future         | Override active, has expiration date              |
| 82  | List tenant overrides               | GET `/v1/admin/tenants/:orgId/overrides`       | Returns active, non-expired overrides only        |
| 83  | Revoke override                     | DELETE `/v1/admin/overrides/:id`               | Override revoked, audit: `admin.override_revoked` |
| 84  | Expired override excluded from list | Create override with past expiresAt, then list | Expired override not in results                   |

---

## 12. Cross-Cutting Concerns

### 12.1 Optimistic Concurrency (all editable entities)

| #   | Test                  | Steps                          | Assert       |
| --- | --------------------- | ------------------------------ | ------------ |
| 85  | Stale update rejected | PUT with old `updatedAt` value | 409 Conflict |
| 86  | Fresh update succeeds | PUT with current `updatedAt`   | 200 OK       |

### 12.2 Correlation ID

| #   | Test                              | Steps                                   | Assert                                   |
| --- | --------------------------------- | --------------------------------------- | ---------------------------------------- |
| 87  | X-Request-Id echoed in response   | Send request with `X-Request-Id` header | Same ID in response header               |
| 88  | X-Request-Id generated if missing | Send request without header             | Response contains a generated request ID |

### 12.3 Rate Limiting

| #   | Test                         | Steps                        | Assert              |
| --- | ---------------------------- | ---------------------------- | ------------------- |
| 89  | Admin endpoints rate limited | Send rapid burst of requests | 429 after threshold |

### 12.4 Pagination

| #   | Test                            | Steps                                         | Assert                     |
| --- | ------------------------------- | --------------------------------------------- | -------------------------- |
| 90  | Offset pagination works         | GET list with limit=2&offset=0, then offset=2 | Two pages, no overlap      |
| 91  | Cursor pagination works (users) | GET users with cursor from previous response  | Next page with no overlap  |
| 92  | Limit clamped to 1-100          | GET with limit=0 and limit=999                | Defaults applied, no error |

---

## 13. Full Admin Workflow (Smoke Test)

| #   | Test                                                                | Steps                                               |
| --- | ------------------------------------------------------------------- | --------------------------------------------------- |
| 93  | **End-to-end: onboard tenant, invite user, create ticket, resolve** | 1. Login as system_admin                            |
|     |                                                                     | 2. Onboard new org "Test Corp" with admin user      |
|     |                                                                     | 3. Navigate to Users, verify new admin appears      |
|     |                                                                     | 4. Navigate to Tenants, verify "Test Corp" listed   |
|     |                                                                     | 5. Create support ticket on behalf of new user      |
|     |                                                                     | 6. Assign ticket to self, reply, resolve            |
|     |                                                                     | 7. Navigate to Audit Log, verify all actions logged |
|     |                                                                     | 8. Export CSV, verify entries present               |

---

## Test Count Summary

| Category          | Tests  |
| ----------------- | ------ |
| Auth & RBAC       | 6      |
| Dashboard         | 3      |
| Tenants           | 10     |
| Users             | 10     |
| Support Tickets   | 15     |
| Coupons           | 13     |
| Billing & Refunds | 5      |
| Audit Log         | 10     |
| Job Queue         | 4      |
| Onboarding        | 3      |
| Feature Overrides | 5      |
| Cross-Cutting     | 8      |
| Smoke Test        | 1      |
| **Total**         | **93** |
