# SI Partner Billing — Implementation Tasks

> **Date:** 2026-04-29
> **Status:** v3 — FINAL (all audit cycles resolved)
> **Source spec:** [SI-BILLING-SPEC.md](SI-BILLING-SPEC.md) (v5 — FINAL)
> **Audience:** Engineering, data, UI/UX, and QA reviewers. Every task in this document should be independently assessable for completeness, correctness, and testability.

---

## Ground Rules

This document transforms [SI-BILLING-SPEC.md](SI-BILLING-SPEC.md) into executable implementation tasks. It is designed for AI-assisted development where an agent processes tasks sequentially, writing code and tests, verifying quality, and committing.

### Execution model

1. **Tasks are executed in order within each phase.** Dependencies are explicit. A task may only begin after all listed dependencies have been merged.
2. **Each task is a single commit.** One task = one logical unit of work = one commit = one push.
3. **Before every push, the agent MUST run the validation pipeline:**
   - `pnpm format` (re-stage if changes)
   - `pnpm lint` (must pass)
   - `pnpm test` (must pass)
   - `pnpm build` (must pass)
4. **Tests are written first** (or alongside) the implementation, never after. Every task specifies its required test coverage.
5. **Commits follow conventional format:** `<type>(<scope>): <summary>` with `Task: <TASK-ID>` in the body and `Refs: SI-BILLING-SPEC.md §<section>`.
6. **At each phase boundary:** run `/wave-review` to check for drift, then `/sync-branches` to promote feature branch to staging and main.

### Key design decisions from audit

These decisions were made during the implementation plan audit and affect multiple tasks:

- **≤$500K migration lifecycle:** `proceed-migration` is a **compute-only** call for ≤$500K deals. It returns calculated terms without persisting anything. Value, SOW, and milestones are stored atomically only when the SI clicks "Accept Migration Terms." This avoids violating the `active_assessment` invariant (`declared_project_value IS NULL`). For >$500K, value + SOW are persisted on submission (status → `migration_pending_review`), then milestones generated on admin approval.
- **Acceptance + Stripe is atomic:** If Stripe invoice creation fails during acceptance, the entire operation rolls back. No "accepted but no invoice" state exists. The API returns an error and the SI retries.
- **`paid_via` field on milestones:** Added during implementation planning (not in original spec ERD). Required for amendment credit tracking and reconciliation. Documented as spec addition in P1.4.
- **Overdue + archive scheduling:** Both use admin-triggered cron endpoints for MVP. Automated scheduling deferred to post-launch.
- **SOW upload for ≤$500K:** `proceed-migration` uploads the SOW to Supabase Storage and returns a `sow_file_token` (file ID) but does NOT attach it to the agreement. The token is passed to `accept-migration` which links it atomically. This preserves the compute-only invariant while avoiding re-upload.
- **Overdue reminder deduplication:** Milestones store `overdue_reminder_sent_day1_at`, `overdue_reminder_sent_day7_at`, `overdue_reminder_sent_day14_at` timestamps. The overdue job skips reminders where the timestamp is already set. Running the job twice on the same day is idempotent.
- **State machine is pure (no I/O):** The agreement state machine (P2.2) validates transitions and returns state updates. All persistence, Stripe calls, and email triggers happen in route handlers. The state machine never reads from or writes to a database.

### Task card format

Every task has: **Goal**, **Depends on**, **Spec anchors**, **Effort** (S/M/L/XL), **Non-negotiables**, **Files**, **Implementation**, **Acceptance**, **Test coverage**, **Out of scope**.

### Reviewer guidance

Assess: completeness vs spec, dependency ordering, testability, self-contained context per task, appropriate sizing.

---

## Phase Overview

| Phase  | Objective               | Tasks | Deliverable                                                                                                      |
| ------ | ----------------------- | ----- | ---------------------------------------------------------------------------------------------------------------- |
| **P1** | Data foundation         | 7     | DB schema, contract types, Zod schemas, seed data, nav cleanup. `pnpm build` passes.                             |
| **P2** | Business logic          | 7     | Fee calc, state machines, repos (triple-adapter), tier service, reconciliation. Unit-testable without Stripe/DB. |
| **P3** | Admin API + UI          | 7     | Admin can create/amend agreements, manage partners, approve milestones. Mock mode.                               |
| **P4** | SI assessment flow      | 6     | SI accepts assessment, sees billing page, project billing tab, entitlement gates.                                |
| **P5** | SI migration flow       | 5     | SI proceeds to migration, declares value, accepts terms. Full two-phase lifecycle.                               |
| **P6** | Stripe integration      | 5     | Invoice creation (M1-M4), webhooks, cancellation voiding, customer portal. Real money flows.                     |
| **P7** | Email notifications     | 3     | All 19 billing email templates, lifecycle wiring, dormant marking.                                               |
| **P8** | Overdue + archive + E2E | 4     | Overdue reminders, archive countdown, banners, full Playwright suite.                                            |

**Total: 44 tasks across 8 phases.**

---

## P1 — Data Foundation

**Phase objective:** DB schema, shared types, Zod schemas, seed data. `pnpm build` passes.

---

### P1.1 — Add `org_type` and `billing_contact_email` to organizations

**Goal:** Extend organizations table for SI partner distinction.
**Depends on:** —
**Spec anchors:** §9 (organizations entity)
**Effort:** S

**Non-negotiables:**

- Default `org_type = 'si_partner'` for all existing orgs.
- `billing_contact_email` is nullable.
- Migration reversible.

**Files:**

- `packages/database/src/schema.ts`
- `packages/database/src/migrations/XXXX_add_org_type_billing_contact.ts`
- `packages/contract/src/index.ts` — `OrgType` enum
- `packages/contract/src/repositories/types.ts`
- `apps/server/src/repositories/mock/organization.repository.ts`
- `apps/server/src/repositories/drizzle/organization.repository.ts`
- `apps/server/src/repositories/postgrest/organization.repository.ts`

**Implementation:**

1. Add `orgType` enum column with default, `billingContactEmail` nullable text
2. Generate Drizzle migration
3. Update contract types
4. Update all three org repo implementations to handle new fields

**Acceptance:**

- [ ] Migration forward/backward works
- [ ] Existing orgs default to `si_partner`
- [ ] `pnpm build` passes
- [ ] Contract exports `OrgType`

**Test coverage:**

- **unit:** Zod validation for `OrgType` enum
- **smoke:** `pnpm build`

**Out of scope:** Billing logic. UI for billing_contact_email (P4.1b).

---

### P1.2 — Create `partner_profiles` table

**Goal:** SI partner tier tracking with override support.
**Depends on:** P1.1
**Spec anchors:** §9 (partner_profiles), §6 (tiers)
**Effort:** S

**Non-negotiables:**

- UNIQUE constraint on `organization_id`.
- `tier` enum: `standard | silver | gold | platinum`. Default: `standard`.
- Tier override columns: `tier_override` (nullable enum), `tier_override_reason`, `tier_override_set_by` FK, `tier_override_set_at`. Effective tier = `tier_override ?? tier`. **These columns are an implementation addition — not in spec §9 ERD. Required to persist override state through recalculation (P2.4 `recalculateAndPromote` respects override lock).**
- All amounts in cents (bigint).

**Files:**

- `packages/database/src/schema.ts` — `partnerProfiles` table
- `packages/database/src/migrations/XXXX_create_partner_profiles.ts`
- `packages/contract/src/index.ts` — `PartnerTier`, `PartnerProfileEntity`, Zod schemas
- `packages/contract/src/repositories/types.ts` — `PartnerProfileRepository` interface

**Implementation:**

1. Define table with all fields including override columns
2. FK to organizations with UNIQUE
3. Zod schemas: `partnerTierSchema`, `partnerProfileSchema`, CRUD inputs
4. Repository interface: `findByOrgId`, `findMany`, `create`, `update`, `updateCumulativeFees`, `count`

**Acceptance:**

- [ ] UNIQUE constraint enforced
- [ ] Override columns nullable, tier_override same enum as tier
- [ ] Zod validates tier enum, positive cents
- [ ] `pnpm build` passes

**Test coverage:**

- **unit:** Zod validation (valid + invalid)
- **smoke:** Build passes

**Out of scope:** Repo implementations (P2). Tier calculation (P2).

---

### P1.3 — Create `fee_agreements` table

**Goal:** Core billing entity for two-phase agreements.
**Depends on:** P1.1
**Spec anchors:** §9 (fee_agreements), §7 (lifecycle, invariants)
**Effort:** M

**Non-negotiables:**

- Status enum: 8 values (`draft | active_assessment | migration_pending_review | active_migration | complete | assessment_complete | cancelled | archived`).
- `payment_terms` enum, NOT integer.
- No `floor_amount` — `assessment_fee` IS the floor.
- DB constraint: `cap_amount IS NULL OR cap_amount >= assessment_fee`.
- DB constraint: `assessment_fee > 0`.
- DB constraint: `declared_project_value > 0 OR declared_project_value IS NULL`.
- DB constraint: `carried_credit_amount >= 0`.
- All amounts cents (bigint), currency defaults `usd`.

**Files:**

- `packages/database/src/schema.ts`
- `packages/database/src/migrations/XXXX_create_fee_agreements.ts`
- `packages/contract/src/index.ts` — enums, entity, Zod
- `packages/contract/src/repositories/types.ts` — `FeeAgreementRepository`

**Implementation:**

1. Define all columns per spec §9 ERD (carried_credit, both acceptance snapshots, assessment_close_reason enum)
2. FKs: project_id, supersedes_agreement_id (self-ref)
3. CHECK constraints (4 total)
4. Zod schemas with full validation
5. Repository interface: `findById`, `findByProjectId`, `findActiveByProjectId`, `findByOrgId`, `create`, `update`, `count`

**Acceptance:**

- [ ] All 4 CHECK constraints enforced
- [ ] All 8 status values valid
- [ ] Zod rejects invalid payment_terms
- [ ] `pnpm build` passes

**Test coverage:**

- **unit:** Zod validation (each CHECK boundary)
- **smoke:** Build

**Out of scope:** Fee calc (P2). State transitions (P2).

---

### P1.4 — Create `fee_agreement_tiers` and `fee_milestones` tables

**Goal:** Rate brackets and billing milestones.
**Depends on:** P1.3
**Spec anchors:** §9 (both entities), §2 (brackets), §4 (milestones)
**Effort:** M

**Non-negotiables:**

- `fee_agreement_tiers`: normalized (not JSONB). `bracket_ceiling` null = unlimited. `rate_bps` integer.
- `fee_milestones`: `phase` enum (`assessment | migration`). `trigger_type` enum (`automatic | admin_approved`). `status` 7 values. `sort_order` gap numbering (100, 200, 300).
- **`paid_via` enum (`stripe_invoice | carried_credit`).** This field is an implementation addition beyond the spec ERD, required for amendment credit tracking and reconciliation filtering. Default: `stripe_invoice`. When `paid_via = carried_credit`, `stripe_invoice_id` is null and the reconciliation job excludes it from cash sums.
- **Overdue reminder timestamps** on milestones: `overdue_reminder_sent_day1_at`, `overdue_reminder_sent_day7_at`, `overdue_reminder_sent_day14_at` (all nullable timestamps). Implementation addition for reminder deduplication — the overdue job (P8.1) skips sending if the timestamp is already set.

**Files:**

- `packages/database/src/schema.ts`
- `packages/database/src/migrations/XXXX_create_fee_tiers_milestones.ts`
- `packages/contract/src/index.ts` — enums, entities, Zod
- `packages/contract/src/repositories/types.ts` — both interfaces

**Implementation:**

1. Define `feeAgreementTiers` table
2. Define `feeMilestones` table with ALL fields including `paid_via`
3. FK cascade: deleting agreement deletes its tiers
4. Zod schemas
5. Repository interfaces

**Acceptance:**

- [ ] Both tables created with correct FKs
- [ ] `paid_via` defaults to `stripe_invoice`
- [ ] Milestone status 7 values
- [ ] Tier cascade on agreement delete
- [ ] `pnpm build` passes

**Test coverage:**

- **unit:** Zod for both (enum values, positive amounts)
- **smoke:** Build

**Out of scope:** Fee calc (P2). State transitions (P2).

---

### P1.5 — Seed data for SI billing

**Goal:** Seed data for mock mode and development.
**Depends on:** P1.4
**Spec anchors:** §2 (example), §4 (milestones), §6 (tiers)
**Effort:** M

**Non-negotiables:**

- In `packages/seed-data/` (not server mocks).
- 2 partner profiles (Gold $842K, Standard $15K), 4 agreements (draft, active_assessment, active_migration, assessment_complete), matching tiers and milestones.
- Amounts match computation rules ($3M → $145K → $130K remaining).
- Assessment-complete has M1 paid, no migration milestones.

**Files:**

- `packages/seed-data/src/partner-profiles.ts`, `fee-agreements.ts`, `fee-agreement-tiers.ts`, `fee-milestones.ts`
- `packages/seed-data/src/index.ts`
- `packages/database/src/seeder.ts`

**Acceptance:**

- [ ] `pnpm db:seed` populates without error
- [ ] Amounts internally consistent
- [ ] Assessment-complete has M1 paid, no M2-M4

**Test coverage:**

- **unit:** Seed data amount consistency check
- **smoke:** `pnpm db:seed` in mock mode

**Out of scope:** Mock repos (P2).

---

### P1.6 — Hide dormant billing pages from navigation

**Goal:** Remove Pricing/Coupons from admin sidebar, add dormant banner.
**Depends on:** —
**Spec anchors:** §12.1.4, §12.1.5
**Effort:** S

**Non-negotiables:**

- Code NOT deleted. Sidebar links removed. Dormant banner on direct URL. Both en + he.

**Files:**

- `apps/client/src/components/layout/sidebar.tsx`
- `apps/client/src/features/admin/pages/PricingPlansPage.tsx`
- `apps/client/src/features/admin/pages/CouponListPage.tsx`
- `apps/client/src/locales/en/admin.json`, `he/admin.json`

**Acceptance:**

- [ ] Sidebar: no Pricing/Coupons
- [ ] Direct URL shows dormant banner
- [ ] Both languages
- [ ] No deleted files

**Test coverage:**

- **unit:** Sidebar renders without old items
- **smoke:** Build

**Out of scope:** Partners nav (P3).

---

### P1.7 — Mark dormant subscription email templates

**Goal:** Add dormant header comments to subscription-era email templates.
**Depends on:** —
**Spec anchors:** §13 (dormant list)
**Effort:** S

**Non-negotiables:**

- Do NOT delete. Add `// DORMANT: For future end-client subscription model.` header.
- Templates: payment-receipt, payment-failed, subscription-changed, trial-ending, trial-ended.
- refund-confirmation stays active.

**Files:**

- `apps/server/src/emails/templates/payment-receipt.ts`
- `apps/server/src/emails/templates/payment-failed.ts`
- `apps/server/src/emails/templates/subscription-changed.ts`
- `apps/server/src/emails/templates/trial-ending.ts`
- `apps/server/src/emails/templates/trial-ended.ts`

**Acceptance:**

- [ ] 5 templates marked
- [ ] refund-confirmation untouched
- [ ] Build passes

**Test coverage:**

- **smoke:** Build

**Out of scope:** New email templates (P7).

---

## P2 — Business Logic

**Phase objective:** Core services: fee calc, state machines, repos (all three adapters), tier service, reconciliation. All unit-testable without Stripe.

---

### P2.1 — Fee calculation engine

**Goal:** Deterministic two-part fee computation as pure functions.
**Depends on:** P1.3, P1.4 (types only)
**Spec anchors:** §2 (both computation rule sets)
**Effort:** M

**Non-negotiables:**

- Integer cents + bps everywhere. No floating point.
- 8-step computation (spec §2 migration phase).
- `assessment_credit = COALESCE(M1.amount, carried_credit_amount, 0)`.
- Cap validation: `cap_amount >= assessment_credit`.
- Rounding UP. Last milestone absorbs remainder.
- remaining_fee == 0 → no milestones generated.

**Files:**

- `apps/server/src/services/fee-calculator.ts`
- `apps/server/src/services/fee-calculator.test.ts`

**Implementation:**

1. `calculateMigrationFee(input): MigrationFeeResult` — full 8-step
2. `validateCapAmount(cap, credit): boolean`
3. `generateDefaultBrackets(): Bracket[]`
4. `splitMilestones(remainingFee, ratios): MilestoneAmounts` — 35/35/30 with remainder absorption

**Acceptance:**

- [ ] $3M → $145K total, $130K remaining, milestones $45,500/$45,500/$39,000
- [ ] $100K → remaining $0, no milestones
- [ ] $500K → $40K total, $25K remaining
- [ ] Cap $100K on $3M → remaining $85K
- [ ] Cap < assessment → rejected
- [ ] No floating point anywhere

**Test coverage:**

- **unit:** 12+ cases (default brackets, custom, floor, cap, remaining==0, rounding, carried credit)
- **property:** fast-check: `total_fee >= assessment_credit AND milestones_sum == remaining_fee`. Additional boundary property: at each `bracket_ceiling` value, bracket math is exact (no cents leaked).

**Out of scope:** Stripe. DB. State transitions.

---

### P2.2 — Agreement state machine

**Goal:** Full lifecycle with transitions and invariant enforcement.
**Depends on:** P1.3 (types)
**Spec anchors:** §7 (lifecycle, invariants, amendments)
**Effort:** XL

**Non-negotiables:**

- Every transition validated. Invalid throws.
- `active_assessment` invariant: `declared_project_value IS NULL`, no migration milestones.
- For ≤$500K: `proceed-migration` is compute-only (no persistence). Milestones created atomically on `accept-migration`.
- For >$500K: value + SOW persist on submit → `migration_pending_review`. Milestones on admin approve.
- Amendments skip `draft`, start `active_assessment` with `carried_credit`.
- `cancel` requires reason. `complete` for zero-fee requires explicit admin action.

**Files:**

- `apps/server/src/services/agreement-state-machine.ts`
- `apps/server/src/services/agreement-state-machine.test.ts`

**Implementation:**

1. Define transitions: `ACCEPT_ASSESSMENT`, `VALIDATE_SUBMIT_VALUE` (validates preconditions — M1 paid, value > 0 — returns whether >$500K threshold is met; does NOT persist), `COMPUTE_MIGRATION_TERMS` (≤$500K, returns computed fee/milestones without persisting), `APPROVE_MIGRATION`, `REQUEST_REVISION`, `ACCEPT_MIGRATION`, `CLOSE_ASSESSMENT`, `COMPLETE`, `CANCEL`, `CREATE_AMENDMENT`
2. `transition(agreement, event, payload): AgreementUpdate | ComputedTerms` — returns state changes but never performs I/O. Route handlers are responsible for persistence + Stripe + email.
3. Pre-conditions per transition (M1 paid for submit, reason for close/cancel, etc.)
4. `validateInvariants(agreement)` — all 7 status invariants
5. `createAmendment(old)` — carried credit, version increment, M1 with `paid_via=carried_credit`

**Acceptance:**

- [ ] Every valid transition correct
- [ ] Every invalid transition throws
- [ ] ≤$500K compute returns terms without persisting
- [ ] > $500K validate returns threshold flag (route handler does persistence)
- [ ] Invariants enforced after each transition
- [ ] Amendment: carried credit, version, supersedes_id, M1 with paid_via=carried_credit

**Test coverage:**

- **unit:** Every valid path, every invalid path, each invariant, amendment flow
- **property:** Random valid transition sequences always produce valid state

**Out of scope:** DB persistence. Stripe. Milestone state (P2.3).

---

### P2.3 — Milestone state machine

**Goal:** Milestone lifecycle transitions per spec §4.
**Depends on:** P1.4 (types)
**Spec anchors:** §4 (lifecycle, auto-invoiced)
**Effort:** M

**Non-negotiables:**

- M1/M2: auto-invoiced (skip pending). M3/M4: pending → requested → completed → invoiced → paid.
- Reject: requested → pending with reason.
- `invoice.voided`: invoiced → voided.
- Cancellation: void all non-paid.

**Files:**

- `apps/server/src/services/milestone-state-machine.ts`
- `apps/server/src/services/milestone-state-machine.test.ts`

**Implementation:**

1. Transitions: `AUTO_INVOICE`, `REQUEST_COMPLETE`, `APPROVE`, `REJECT`, `GENERATE_INVOICE`, `MARK_PAID`, `MARK_OVERDUE`, `VOID`
2. `voidAllPending(milestones)` — for cancellation
3. `autoInvoiceCompleted(milestones)` — for completed-but-not-invoiced at cancellation

**Acceptance:**

- [ ] Auto-invoice: `→ invoiced` (M1, M2)
- [ ] Standard: `pending → requested → completed → invoiced → paid`
- [ ] Reject: `requested → pending`
- [ ] Void: `invoiced → voided`
- [ ] Cancel: mixed states handled correctly
- [ ] Invalid transitions throw

**Test coverage:**

- **unit:** Every transition (valid + invalid), cancellation, auto-invoice at cancel

**Out of scope:** Stripe (P6). Overdue (P8).

---

### P2.4 — Partner tier service

**Goal:** Tier calculation, ratchet, and manual override with persistence model.
**Depends on:** P1.2 (types)
**Spec anchors:** §6 (tiers, rules)
**Effort:** M

**Non-negotiables:**

- Tiers from `cumulative_fees_paid` (only `paid_via = 'stripe_invoice'`).
- Ratchet: never auto-demotes.
- Effective tier = `tier_override ?? computed_tier`. Override persists until explicitly removed.
- Manual override requires reason + admin ID.

**Files:**

- `apps/server/src/services/partner.service.ts`
- `apps/server/src/services/partner.service.test.ts`

**Implementation:**

1. `calculateTier(cents): PartnerTier` — pure
2. `getEffectiveTier(profile): PartnerTier` — checks override first
3. `shouldPromote(current, new): boolean` — ratchet
4. `recalculateAndPromote(partnerId)` — respects override lock
5. `setOverride(partnerId, tier, reason, adminId)` — sets override columns
6. `clearOverride(partnerId, adminId)` — clears, reverts to computed

**Acceptance:**

- [ ] Thresholds: $0→Standard, $250K→Silver, $750K→Gold, $2M→Platinum
- [ ] Ratchet works
- [ ] Override persists through recalculation
- [ ] clearOverride reverts to computed tier

**Test coverage:**

- **unit:** Each boundary, ratchet, override persist, override clear

**Out of scope:** DB persistence (uses repo interface). Webhook (P6).

---

### P2.5 — Repository implementations (mock)

**Goal:** Mock repos for all 4 new tables.
**Depends on:** P1.2-P1.5
**Spec anchors:** §9
**Effort:** M

**Non-negotiables:**

- Follow existing mock repo pattern.
- Seed data as initial state.
- `findActiveByProjectId`: latest non-terminal agreement.
- Row locking is a no-op in mock mode — documented in code comment. Concurrency tests must run against drizzle.

**Files:**

- `apps/server/src/repositories/mock/partner-profile.repository.ts`
- `apps/server/src/repositories/mock/fee-agreement.repository.ts`
- `apps/server/src/repositories/mock/fee-agreement-tier.repository.ts`
- `apps/server/src/repositories/mock/fee-milestone.repository.ts`
- `apps/server/src/repositories/mock/index.ts`

**Acceptance:**

- [ ] `pnpm mock` starts
- [ ] All methods return correct seed data
- [ ] `findActiveByProjectId` correct

**Test coverage:**

- **unit:** Each method (CRUD)
- **smoke:** Mock mode starts

**Out of scope:** Drizzle/PostgREST (P2.6).

---

### P2.6 — Repository implementations (drizzle + postgrest)

**Goal:** Real DB adapters for all 4 new tables.
**Depends on:** P2.5, P1.2-P1.4
**Spec anchors:** §9
**Effort:** L

**Non-negotiables:**

- Triple-adapter pattern.
- Org-scoping on tenant queries.
- Shared contract test suite: same test cases run against mock, drizzle, and postgrest adapters to catch subtle differences (null handling, enum serialization, ordering). Contract tests for drizzle/postgrest run against a local Postgres instance seeded with P1.5 data. Each test runs in a transaction rolled back on completion. Test harness must cover: pagination with stable ordering (`created_at DESC`, `id` tie-breaker), enum serialization round-trip, nullability handling.

**Files:**

- `apps/server/src/repositories/drizzle/partner-profile.repository.ts`
- `apps/server/src/repositories/drizzle/fee-agreement.repository.ts`
- `apps/server/src/repositories/drizzle/fee-agreement-tier.repository.ts`
- `apps/server/src/repositories/drizzle/fee-milestone.repository.ts`
- `apps/server/src/repositories/postgrest/partner-profile.repository.ts`
- `apps/server/src/repositories/postgrest/fee-agreement.repository.ts`
- `apps/server/src/repositories/postgrest/fee-agreement-tier.repository.ts`
- `apps/server/src/repositories/postgrest/fee-milestone.repository.ts`
- `apps/server/src/repositories/index.ts`
- `apps/server/src/repositories/__tests__/contract-tests.ts` — shared test harness

**Acceptance:**

- [ ] All three modes start (mock, dev, stg)
- [ ] Contract tests pass for all adapters
- [ ] Org-scoping prevents cross-tenant

**Test coverage:**

- **integration:** Shared contract test suite against all adapters
- **smoke:** Server starts in all modes

**Out of scope:** API routes (P3+).

---

### P2.7 — Reconciliation service

**Goal:** Nightly reconciliation with drift detection and threshold-based correction.
**Depends on:** P2.4, P2.5
**Spec anchors:** §9 (reconciliation)
**Effort:** M

**Non-negotiables:**

- Sums only `paid_via = 'stripe_invoice'` milestones.
- Drift ≤ $1 (100 cents): auto-correct + audit log.
- Drift > $1: do NOT correct. Alert admin email. Log drift.
- Also recomputes `completed_project_count`.

**Files:**

- `apps/server/src/services/reconciliation.service.ts`
- `apps/server/src/services/reconciliation.service.test.ts`

**Acceptance:**

- [ ] Correct sum (excludes carried_credit)
- [ ] ≤$1 auto-corrects
- [ ] > $1 alerts, no correction
- [ ] Zero-milestone partners handled

**Test coverage:**

- **unit:** No drift, $0.50 drift (correct), $100 drift (alert), carried-credit excluded

**Out of scope:** Cron scheduling. Admin UI for alerts.

---

## P3 — Admin API + UI

**Phase objective:** Admin can create/amend agreements, manage partners, approve milestones. Mock mode.

---

### P3.1 — Admin partner API routes

**Goal:** Partner CRUD + tier override + reconciliation endpoints.
**Depends on:** P2.4, P2.5
**Spec anchors:** §14.3 (admin partner routes)
**Effort:** M

**Non-negotiables:**

- `requireAdminPermission` on all routes. Audit logged.
- Override uses `setOverride` / `clearOverride` from PartnerService.
- Reconcile triggers service.

**Files:**

- `apps/server/src/v1/routes/admin/partners.ts`
- `apps/server/src/v1/routes/admin/index.ts`

**Routes:**

- `GET /v1/admin/partners` — paginated list
- `GET /v1/admin/partners/:id` — detail + override history
- `PUT /v1/admin/partners/:id` — set/clear tier override (reason required)
- `POST /v1/admin/partners/reconcile` — trigger reconciliation

**Acceptance:**

- [ ] All require system_admin
- [ ] Override writes audit log
- [ ] Reconcile returns results

**Test coverage:**

- **unit:** Route handlers with mock repos
- **e2e:** GET returns seed data

**Out of scope:** Admin UI (P3.5). SI endpoints (P4).

---

### P3.2 — Admin fee agreement API routes

**Goal:** Agreement CRUD + lifecycle + amendment endpoints.
**Depends on:** P2.1, P2.2, P2.5
**Spec anchors:** §14.3 (admin agreement routes), §11 (workflows)
**Effort:** L

**Non-negotiables:**

- `POST` creates draft with assessment fee, default brackets, payment terms.
- `PUT` only on `draft`.
- `POST /:id/approve-migration` — `migration_pending_review` only. Generates milestones. Triggers **email #4** (migration terms ready — to SI).
- `POST /:id/request-value-revision` — `migration_pending_review → active_assessment`. Triggers **email #19** to SI.
- `GET /:id/sow-url` — returns short-lived signed URL for admin SOW download (admin-only, 15-minute expiry).
- `POST /:id/amend` — **atomic**: cancels old agreement + creates new version with carried credit + notifies SI. All in one transaction.
- `POST /:id/complete` — zero-fee only.
- `POST /:id/cancel` — follows cancellation policy (void pending, auto-invoice completed). Stripe wiring stubbed for P6.
- All mutations audit-logged.

**Files:**

- `apps/server/src/v1/routes/admin/fee-agreements.ts`
- `apps/server/src/v1/routes/admin/billing.ts` — **create this file** (initially empty, mounted in admin router; P8.1/P8.1b will add cron endpoints here)
- `apps/server/src/v1/routes/admin/index.ts` — mount both new route files

**Routes:**

- `POST /v1/admin/fee-agreements`
- `GET /v1/admin/fee-agreements/:id`
- `PUT /v1/admin/fee-agreements/:id`
- `POST /v1/admin/fee-agreements/:id/approve-migration`
- `POST /v1/admin/fee-agreements/:id/request-value-revision`
- `POST /v1/admin/fee-agreements/:id/amend`
- `POST /v1/admin/fee-agreements/:id/complete`
- `POST /v1/admin/fee-agreements/:id/cancel`
- `GET /v1/admin/fee-agreements/:id/sow-url`

**Acceptance:**

- [ ] Draft creation generates default tiers
- [ ] PUT rejected on non-draft
- [ ] approve-migration only on migration_pending_review
- [ ] request-value-revision transitions back to active_assessment
- [ ] amend is atomic (old cancelled + new created in one transaction)
- [ ] Cancel follows policy
- [ ] All produce audit entries

**Test coverage:**

- **unit:** Each endpoint (happy + error)
- **e2e:** Create → approve → amend → cancel flow

**Out of scope:** Stripe invoice creation (P6). SI endpoints (P4).

---

### P3.3 — Admin milestone API routes

**Goal:** Milestone approve/reject endpoints.
**Depends on:** P2.3, P3.2
**Spec anchors:** §14.3 (admin milestones), §4 (lifecycle)
**Effort:** S

**Non-negotiables:**

- Approve: `requested` or `completed` → invoiced. Stripe invoice creation stubbed (P6 wires it).
- Reject: `requested` → pending, requires reason.
- Audit logged.

**Files:**

- `apps/server/src/v1/routes/admin/fee-agreements.ts` (milestone sub-routes)

**Routes:**

- `POST /v1/admin/milestones/:id/approve`
- `POST /v1/admin/milestones/:id/reject`

**Acceptance:**

- [ ] Approve transitions correctly
- [ ] Reject requires reason
- [ ] Invalid states return 400

**Test coverage:**

- **unit:** Valid + invalid states

**Out of scope:** Stripe invoice creation (P6.3b).

---

### P3.4 — Admin Partners page (UI)

**Goal:** Partners list + detail drawer with override controls.
**Depends on:** P3.1, P1.6
**Spec anchors:** §12.1.1, §12.1.5
**Effort:** L

**Non-negotiables:**

- "Partners" in admin sidebar.
- Table: Name, Tier, Projects, Fees Paid, Status. Filterable.
- Detail drawer: tier progress, agreements, billing summary, override checkboxes (not "blank=default"), override history.
- Empty state.
- i18n en + he.

**Files:**

- `apps/client/src/features/admin/pages/PartnersPage.tsx`
- `apps/client/src/features/admin/components/PartnerDetailDrawer.tsx`
- `apps/client/src/features/admin/hooks/use-partners.ts`
- `apps/client/src/app/router.tsx`
- `apps/client/src/components/layout/sidebar.tsx`
- `apps/client/src/locales/en/admin.json`, `he/admin.json`

**Acceptance:**

- [ ] Page loads with seed data
- [ ] Override checkboxes reveal fields
- [ ] Override history visible
- [ ] Empty state works
- [ ] Sidebar shows "Partners"

**Test coverage:**

- **unit:** Component renders, empty state
- **playwright:** Navigate, verify table

**Out of scope:** Agreement creation (P3.5). Billing tab (P3.7).

---

### P3.5 — Fee agreement creation page (admin UI)

**Goal:** Dedicated page for creating draft agreements.
**Depends on:** P3.2
**Spec anchors:** §12.1.3
**Effort:** M

**Non-negotiables:**

- Assessment fee defaults $15K, admin-overridable. Payment terms dropdown. Rate brackets read-only display (default table). Cap optional.
- Bracket editing deferred to post-launch iteration (documented in code comment). For negotiated custom rates, admin uses DB or a future bracket editor.
- "Create as Draft" button.
- i18n en + he.

**Files:**

- `apps/client/src/features/admin/pages/FeeAgreementCreatePage.tsx`
- `apps/client/src/features/admin/hooks/use-fee-agreements.ts`
- `apps/client/src/app/router.tsx`
- `apps/client/src/locales/en/admin.json`, `he/admin.json`

**Acceptance:**

- [ ] Defaults render ($15K, Net 30, brackets)
- [ ] Cap validation >= assessment fee
- [ ] Create posts to API, redirects to billing tab

**Test coverage:**

- **unit:** Form validation
- **playwright:** Create draft, verify redirect

**Out of scope:** Billing tab (P3.7). SI acceptance (P4).

---

### P3.6 — Terms snapshot shared component + routes

**Goal:** Shared SnapshotView component used by both admin and SI views.
**Depends on:** P3.2 (API provides snapshot data)
**Spec anchors:** §12.1.2 (snapshot design), §8 (integrity)
**Effort:** S

**Non-negotiables:**

- One shared `SnapshotView` component. Two route wrappers (admin + SI).
- Formatted display (not raw JSON): brackets, amounts, milestones, terms.
- Acceptance metadata: who, when, IP.
- SHA-256 hash footer using `canonicalJson()` (locate via `grep -r 'canonicalJson' packages/` — exists in the contract or bb3-normalizer package).

**Files:**

- `apps/client/src/components/billing/SnapshotView.tsx` — shared
- `apps/client/src/features/admin/pages/TermsSnapshotPage.tsx` — admin wrapper
- `apps/client/src/features/billing/pages/TermsSnapshotPage.tsx` — SI wrapper
- `apps/client/src/app/router.tsx`

**Routes:**

- Admin: `/admin/projects/:projectId/billing/agreements/:agreementId/snapshot/:type`
- SI: `/billing/agreements/:id/snapshot/:type`

**Acceptance:**

- [ ] Both routes render same component
- [ ] Hash footer matches stored hash
- [ ] Read-only, no actions

**Test coverage:**

- **unit:** Renders for both snapshot types, hash verification

**Out of scope:** Snapshot creation (server-side, in acceptance handlers).

---

### P3.7 — Admin project billing tab

**Goal:** "Billing" tab on admin project detail page.
**Depends on:** P3.2, P3.3
**Spec anchors:** §12.1.2
**Effort:** L

**Non-negotiables:**

- Status-dependent rendering: assessment, pending review, migration.
- Phase-grouped milestones with admin actions: [Approve], [Reject], [Mark Assessment Only], [Create Amendment].
- Pending review state shows: [Approve Value], [Request Revision] with declared value + SOW link.
- Payment progress bar. Audit trail (expandable).
- Empty state.
- i18n en + he.

**Files:**

- `apps/client/src/features/admin/components/ProjectBillingTab.tsx`
- `apps/client/src/features/admin/components/MilestoneTable.tsx`
- `apps/client/src/features/admin/components/PaymentProgressBar.tsx`
- `apps/client/src/features/admin/components/AuditTrail.tsx`
- Existing project detail page — add tab
- `apps/client/src/locales/en/admin.json`, `he/admin.json`

**Acceptance:**

- [ ] Each status shows correct content
- [ ] Pending review shows approve/revision buttons
- [ ] Admin actions wire to API
- [ ] Audit trail renders
- [ ] Empty state works

**Test coverage:**

- **unit:** Renders per status, actions disabled for invalid states
- **playwright:** Navigate, verify table

**Out of scope:** SI billing tab (P4). Stripe actions (P6).

---

## P4 — SI Assessment Flow

**Phase objective:** SI can accept assessment, see billing page, project billing tab, entitlement gates. Draft → Active Assessment end-to-end.

---

### P4.1 — SI billing API routes (assessment + milestones)

**Goal:** SI-facing billing endpoints including milestone request.
**Depends on:** P2.2, P2.3, P2.5
**Spec anchors:** §14.3 (SI routes)
**Effort:** M

**Non-negotiables:**

- Org-scoped. `accept-assessment` stores user_id, IP, timestamp, terms_snapshot_hash (using `canonicalJson`).
- `reject` requires reason. `close-assessment` requires reason dropdown, blocked if value submitted.
- `milestones/:id/request-complete` validates milestone belongs to SI org, status is `pending`, stores request_reason + requested_by + requested_at.

**Files:**

- `apps/server/src/v1/routes/billing.ts` — replace subscription routes (move old to `billing-subscriptions.ts.dormant`)

**Routes:**

- `GET /v1/billing/partner-status`
- `GET /v1/billing/agreements`
- `GET /v1/billing/agreements/:id`
- `GET /v1/billing/invoices`
- `POST /v1/billing/agreements/:id/accept-assessment`
- `POST /v1/billing/agreements/:id/reject`
- `POST /v1/billing/agreements/:id/close-assessment`
- `POST /v1/billing/milestones/:id/request-complete`

**Acceptance:**

- [ ] Org-scoped (cross-tenant rejected)
- [ ] Accept stores IP, timestamp, hash
- [ ] Reject stores reason
- [ ] Close blocked when value submitted
- [ ] Milestone request validates ownership + pending status

**Test coverage:**

- **unit:** Each endpoint, org scoping, accept metadata, milestone ownership check
- **policy:** SOW access is enforced via Supabase Storage RLS policy on `sow-documents` bucket (admin role only). Verify policy is configured, not via API test. Admin downloads SOW via `GET /v1/admin/fee-agreements/:id/sow-url` (P3.2).

**Out of scope:** Migration endpoints (P5). Stripe (P6).

---

### P4.1b — Billing contact UI (SI settings)

**Goal:** Allow SI to set/update billing_contact_email from settings.
**Depends on:** P1.1
**Spec anchors:** §9 (billing_contact_email), §13 (emails reference SI billing contact)
**Effort:** S

**Non-negotiables:**

- SI settings page: read/write field for billing contact email.
- Admin partner detail: read-only view.
- Email validation.

**Files:**

- `apps/client/src/features/settings/` — add billing contact field to org settings
- `apps/server/src/v1/routes/organizations.ts` — ensure update handles billing_contact_email

**Acceptance:**

- [ ] SI can set/update billing contact from settings
- [ ] Admin sees it in partner detail (read-only)
- [ ] Email validation

**Test coverage:**

- **unit:** Form validates email
- **smoke:** Setting persists

**Out of scope:** Custom email routing logic.

---

### P4.2 — SI agreement review page (Variant A)

**Goal:** Assessment acceptance page.
**Depends on:** P4.1
**Spec anchors:** §12.2.3 (Variant A)
**Effort:** M

**Non-negotiables:**

- Route: `/billing/agreements/:id/review`. Variant A when `draft` (routing logic: status-based).
- Assessment fee, terms, inclusions, migration bracket preview, credit explanation.
- Attestation checkbox enables "Accept & Start Assessment".
- Decline modal with required reason.
- i18n en + he.

**Files:**

- `apps/client/src/features/billing/pages/AgreementReviewPage.tsx`
- `apps/client/src/features/billing/hooks/use-agreement-review.ts`
- `apps/client/src/app/router.tsx`
- `apps/client/src/locales/en/billing.json`, `he/billing.json`

**Acceptance:**

- [ ] Variant A for draft
- [ ] Accept disabled without checkbox
- [ ] Decline requires reason
- [ ] Both languages

**Test coverage:**

- **unit:** Renders, button state
- **playwright:** Full accept flow

**Out of scope:** Variant B (P5).

---

### P4.3 — SI project billing tab (assessment phase)

**Goal:** "Billing" tab on SI project page — assessment view.
**Depends on:** P4.1
**Spec anchors:** §12.2.2 (assessment phase)
**Effort:** M

**Non-negotiables:**

- Agreement summary + M1 milestone + "Next Step".
- "Waiting for payment" callout when M1 invoiced but not paid (Pay Now link deep-links to Stripe hosted page).
- "Proceed to Migration" visible when M1 paid AND status is `active_assessment`.
- "Close as Assessment Only" visible when M1 paid, status is `active_assessment`, and no value submitted.
- **`migration_pending_review` variant:** Hides "Proceed" and "Close" buttons. Shows: "Your migration value of $X is under admin review. We'll email you when terms are ready to accept." with a muted status badge.
- Empty state.
- i18n.

**Files:**

- `apps/client/src/features/billing/components/ProjectBillingTab.tsx`
- `apps/client/src/features/billing/components/WaitingForPaymentCallout.tsx`
- Project detail page — add tab
- Locales

**Acceptance:**

- [ ] Waiting callout when M1 invoiced
- [ ] Proceed visible when M1 paid + active_assessment
- [ ] Close Assessment visible when M1 paid + active_assessment + no value submitted
- [ ] migration_pending_review: buttons hidden, "under review" message shown
- [ ] Empty state

**Test coverage:**

- **unit:** Each sub-state, empty state
- **playwright:** Navigate, verify

**Out of scope:** Migration phase (P5). Stripe links (P6).

---

### P4.4 — SI billing page (replaces BillingPage)

**Goal:** Replace BillingPage with SI partner billing view.
**Depends on:** P4.1
**Spec anchors:** §12.2.1
**Effort:** L

**Non-negotiables:**

- Same route `/billing`, new content.
- Partner status card (tier progress), active projects (two variants: migration + assessment-in-progress), recent invoices, billing summary, overdue banner, "Manage Payment Methods" → Stripe portal.
- Empty state. Atomic swap.
- i18n en + he.

**Files:**

- `apps/client/src/features/billing/pages/BillingPage.tsx` — REPLACE
- New components: PartnerStatusCard, ActiveProjectsList, ProjectBillingCard, RecentInvoicesTable, BillingSummaryCard, OverdueBanner
- `apps/client/src/features/billing/hooks/use-partner-billing.ts`
- Remove/dormant: UsageDashboard, PlanUpgradeModal, UpgradePrompt, TrialCountdown, BillingIntervalToggle, use-usage
- Locales

**Acceptance:**

- [ ] Partner status renders
- [ ] Both card variants (migration + assessment-in-progress)
- [ ] Invoices table
- [ ] Empty state
- [ ] Overdue banner logic
- [ ] Old components removed/dormant

**Test coverage:**

- **unit:** Each component, empty states, overdue visibility
- **playwright:** Navigate /billing, verify sections

**Out of scope:** Stripe portal link (P6). Overdue detection (P8).

---

### P4.5 — Entitlement middleware

**Goal:** Phase-based access gates per spec §4 entitlement table.
**Depends on:** P2.5
**Spec anchors:** §4 (entitlement gates)
**Effort:** M

**Non-negotiables:**

- SI bypasses `requireActiveSubscription()`.
- `requireAssessmentAccess()`: M1 paid.
- `requireMigrationAccess()`: `active_migration` status.
- Error codes: `AGREEMENT_REQUIRED`, `PAYMENT_REQUIRED`, `MIGRATION_REQUIRED`.

**Files (middleware + route application):**

- `apps/server/src/middleware/limits.ts` — org_type bypass
- `apps/server/src/middleware/agreement-gates.ts` — new
- `packages/contract/src/index.ts` — error codes
- **Route files receiving new middleware:**
  - `apps/server/src/v1/routes/extraction.ts` — `requireAssessmentAccess()`
  - `apps/server/src/v1/routes/normalization.ts` — `requireAssessmentAccess()`
  - `apps/server/src/v1/routes/analysis.ts` — `requireAssessmentAccess()`
  - `apps/server/src/v1/routes/segmentation.ts` — `requireMigrationAccess()`
  - `apps/server/src/v1/routes/disposition.ts` — `requireMigrationAccess()`

**Acceptance:**

- [ ] No agreement → extraction blocked
- [ ] Draft → blocked
- [ ] active_assessment + M1 paid → extraction yes, segmentation no
- [ ] active_migration → all allowed
- [ ] Subscription middleware still works for non-SI

**Test coverage:**

- **unit:** Each gate scenario
- **e2e:** Extraction blocked without agreement

**Out of scope:** Overdue project blocking (P8).

---

## P5 — SI Migration Flow

**Phase objective:** SI proceeds to migration, declares value, accepts terms. Full lifecycle without Stripe.

---

### P5.1 — Proceed-to-migration + accept-migration API

**Goal:** SI-initiated migration transition endpoints.
**Depends on:** P2.1, P2.2, P4.1
**Spec anchors:** §4 (transition), §3 (verification), §2 (computation)
**Effort:** M

**Non-negotiables:**

- `proceed-migration` requires M1 paid. **For ≤$500K:** uploads SOW to Supabase Storage and returns a `sow_file_token` (file ID) + computed terms. The token is NOT attached to the agreement yet. Nothing else persists. **For >$500K:** persists value + SOW (links `sow_file_id` to agreement), transitions to `migration_pending_review`. **Triggers email #18** (migration pending review — to admin).
- `accept-migration` persists everything atomically: value (for ≤$500K), links `sow_file_token` → `sow_file_id`, generates milestones, stores acceptance metadata. Transitions to `active_migration`.
- SOW stored in Supabase Storage bucket (`storage.sow-documents`, encrypted, admin-only RLS policy).
- Zero-fee: no milestones, status still transitions.

**Files:**

- `apps/server/src/v1/routes/billing.ts` — add both endpoints

**Routes:**

- `POST /v1/billing/agreements/:id/proceed-migration`
- `POST /v1/billing/agreements/:id/accept-migration`

**Acceptance:**

- [ ] M1 not paid → 402
- [ ] ≤$500K → SOW uploaded, token returned, computed terms returned, agreement unchanged
- [ ] > $500K → SOW linked, value persisted, `migration_pending_review`, email #18 to admin
- [ ] accept-migration stores all metadata + links SOW atomically
- [ ] Zero-fee: no milestones, status transitions

**Test coverage:**

- **unit:** Each path (≤$500K, >$500K, zero-fee), M1 precondition, SOW token flow
- **e2e:** Full proceed → accept

**Out of scope:** Stripe invoicing on accept (P6).

---

### P5.1b — Proceed-to-migration UI form (SI)

**Goal:** UI where SI enters project value and uploads SOW.
**Depends on:** P5.1, P4.3
**Spec anchors:** §4 (transition steps), §12.2.2 (billing tab buttons)
**Effort:** M

**Non-negotiables:**

- Triggered from "Proceed to Migration" button on SI project billing tab.
- Form: declared project value (currency input), SOW upload (drop zone, PDF/DOCX/image, max 25MB).
- On submit: calls `proceed-migration` (uploads SOW as part of the request). If ≤$500K, receives `sow_file_token` + computed terms, navigates to Variant B review (passes token). If >$500K, shows "Under admin review" state.

**Files:**

- `apps/client/src/features/billing/components/ProceedToMigrationDialog.tsx`
- `apps/client/src/features/billing/hooks/use-proceed-migration.ts`

**Acceptance:**

- [ ] Form collects value + SOW
- [ ] SOW upload validates file type/size
- [ ] ≤$500K → Variant B review page
- [ ] > $500K → "under review" state
- [ ] i18n

**Test coverage:**

- **unit:** Form validation
- **playwright:** Submit value, verify navigation

**Out of scope:** Variant B acceptance (P5.2).

---

### P5.2 — SI agreement review page (Variant B)

**Goal:** Migration acceptance page with fee breakdown.
**Depends on:** P5.1, P4.2
**Spec anchors:** §12.2.3 (Variant B)
**Effort:** M

**Non-negotiables:**

- Same route, status-based rendering.
- Fee breakdown: bracket math, total, credit, remaining, milestone schedule.
- SOW display: for ≤$500K, SOW was uploaded during proceed-migration (token held client-side) — show "SOW on file" with filename. For >$500K, SOW was uploaded at submission — show "SOW already on file [View]" with option to replace.
- Attestation. Zero-fee: hide milestones, show "No additional invoices."
- i18n.

**Files:**

- `apps/client/src/features/billing/pages/AgreementReviewPage.tsx` — extend

**Acceptance:**

- [ ] Variant B for migration-ready agreements
- [ ] Bracket math correct
- [ ] Zero-fee handled
- [ ] SOW required before accept

**Test coverage:**

- **unit:** Normal + zero-fee rendering
- **playwright:** Full migration accept

**Out of scope:** Stripe invoice on accept (P6).

---

### P5.3 — SI project billing tab (migration phase)

**Goal:** Two-phase milestone display with request completion.
**Depends on:** P4.3, P5.1
**Spec anchors:** §12.2.2 (migration phase)
**Effort:** M

**Non-negotiables:**

- Phase 1 + Phase 2 milestones. Progress bar. "Request Completion" with note. "Pay Now" / "View Invoice" links.

**Files:**

- `apps/client/src/features/billing/components/ProjectBillingTab.tsx` — extend
- `apps/client/src/features/billing/components/MilestoneTimeline.tsx`
- `apps/client/src/features/billing/hooks/use-milestones.ts`

**Acceptance:**

- [ ] Two-phase display
- [ ] Progress bar correct
- [ ] Request completion works

**Test coverage:**

- **unit:** Each milestone state
- **playwright:** Request completion

**Out of scope:** Invoice links (P6). Overdue (P8).

---

### P5.4 — Assessment-only closure UI

**Goal:** SI closes project as assessment-only.
**Depends on:** P4.1, P4.3
**Spec anchors:** §4, §5
**Effort:** S

**Non-negotiables:**

- Reason dropdown (5 options) + optional notes. Button hidden when value submitted.

**Files:**

- `apps/client/src/features/billing/components/AssessmentCloseDialog.tsx`

**Acceptance:**

- [ ] 5 reasons
- [ ] Required selection
- [ ] Hidden when value submitted

**Test coverage:**

- **unit:** Validation
- **playwright:** Close, verify state

---

## P6 — Stripe Integration

**Phase objective:** Real money flows. Invoices, webhooks, cancellation voiding, portal.

---

### P6.1 — Invoice creation service

**Goal:** Stripe invoice creation for milestones.
**Depends on:** P2.3
**Spec anchors:** §10
**Effort:** L

**Non-negotiables:**

- `InvoiceItem` + `Invoice` (not Checkout). `send_invoice`, `auto_advance: true`.
- Idempotency: `revbrain_milestone_{id}_{action}`.
- Metadata: all 8 fields per spec §10.
- `paid_via = carried_credit` → skip Stripe.
- **Stripe customer lifecycle:** `getOrCreateCustomer` ensures customer exists (uses `stripe_customer_id` on org, creates if missing, sets `billing_contact_email`, persists ID).
- `isStripeConfigured()` graceful handling for mock mode.

**Files:**

- `apps/server/src/services/project-billing.service.ts`
- `apps/server/src/services/project-billing.service.test.ts`

**Acceptance:**

- [ ] Invoice in Stripe test mode with correct metadata
- [ ] Idempotency prevents duplicates
- [ ] Carried-credit skipped
- [ ] Customer created on first invoice, reused after
- [ ] Missing Stripe key → warning, no crash

**Test coverage:**

- **unit:** Creation (mock Stripe), idempotency key, carried-credit guard, customer creation/reuse
- **unit:** Metadata present on Invoice object (not just InvoiceItem)
- **integration:** (Stripe test key) Real invoice

**Out of scope:** Webhooks (P6.2). Portal (P6.4).

---

### P6.2 — Webhook handler for billing events

**Goal:** Route milestone webhooks: `invoice.paid`, `invoice.payment_failed`, `invoice.voided`.
**Depends on:** P6.1, P2.4
**Spec anchors:** §10 (routing, concurrency, idempotency)
**Effort:** L

**Non-negotiables:**

- Route by `metadata.revbrain_type`. Dedupe by `event.id`.
- `invoice.paid`: milestone → paid, cumulative update (row lock), tier check.
- `invoice.voided`: milestone → voided.
- `invoice.payment_failed`: log + notify admin.
- All within DB transaction + `SELECT FOR UPDATE` on partner_profiles.

**Files:**

- `apps/server/src/services/billing.service.ts` — extend
- `apps/server/src/services/project-billing.service.ts` — handlers

**Acceptance:**

- [ ] paid → milestone paid, cumulative updated, tier checked
- [ ] voided → milestone voided
- [ ] Duplicate event → 200 OK
- [ ] Row lock serializes concurrent handlers

**Test coverage:**

- **unit:** Each event type, dedupe, tier promotion
- **unit:** Metadata routing: webhook with/without revbrain_type
- **integration:** End-to-end webhook

**Out of scope:** Overdue (P8). Emails (P7).

---

### P6.3a — Wire Stripe into assessment + migration acceptance

**Goal:** M1 invoiced on assessment accept, M2 on migration accept.
**Depends on:** P6.1, P4.1, P5.1
**Spec anchors:** §7 (acceptance flows), §10
**Effort:** M

**Non-negotiables:**

- **Atomic with acceptance.** If Stripe fails, rollback entire acceptance. No "accepted but no invoice."
- Assessment: M1 via Stripe.
- Migration: M2 if remaining_fee > 0.
- Amendment: M1 carried_credit → no Stripe.
- Zero-fee: no Stripe.

**Files:**

- `apps/server/src/v1/routes/billing.ts` — wire into accept-assessment, accept-migration

**Acceptance:**

- [ ] Assessment accept → Stripe M1 invoice
- [ ] Migration accept → Stripe M2 (when remaining > 0)
- [ ] Zero-fee → no invoice
- [ ] Amendment M1 → no invoice
- [ ] Stripe failure → acceptance rolls back, error returned

**Test coverage:**

- **unit:** Mock Stripe, each path
- **unit:** Atomic rollback: simulate Stripe failure after DB writes begin → verify agreement status unchanged, milestone not invoiced, no stripe_invoice_id stored
- **integration:** Full accept → Stripe invoice

---

### P6.3b — Wire Stripe into admin milestone approval + cancellation

**Goal:** M3/M4 invoiced on admin approval. Cancellation voids open invoices and auto-invoices completed milestones.
**Depends on:** P6.1, P3.3
**Spec anchors:** §10 (milestone invoices), §5 (cancellation policy)
**Effort:** M

**Non-negotiables:**

- Admin approves M3/M4 → `createMilestoneInvoice()` called.
- Cancel agreement → `Stripe.Invoice.voidInvoice()` for all `status=invoiced` milestones.
- Cancel → `createMilestoneInvoice()` for `status=completed` (not yet invoiced) milestones.
- Idempotent: cancel checks `stripe_invoice_id` before creating (no duplicates), checks milestone status before voiding (no double-void errors).
- **Auto-invoice failure during cancellation:** If `createMilestoneInvoice` fails for a completed milestone during cancel, the cancellation still commits (agreement → cancelled, milestones → voided). Failed auto-invoices are logged to audit trail with `invoice_failed` note. Admin notification sent. Manual invoice via Stripe dashboard.

**Files:**

- `apps/server/src/v1/routes/admin/fee-agreements.ts` — wire approve + cancel to Stripe

**Acceptance:**

- [ ] M3 approve → Stripe invoice
- [ ] Cancel → open invoices voided in Stripe
- [ ] Cancel → completed milestones auto-invoiced
- [ ] Cancel with Stripe failure → cancellation still commits, failure logged
- [ ] Idempotent: second cancel is a no-op (no duplicate invoices or void errors)

**Test coverage:**

- **unit:** Mock Stripe for void + create at cancel
- **integration:** Cancel with mixed milestone states

---

### P6.4 — Stripe Customer Portal

**Goal:** Portal for SI payment method management.
**Depends on:** P4.4
**Spec anchors:** §8 (portal)
**Effort:** S

**Non-negotiables:**

- Invoice + payment-method only. Subscription features disabled.
- `POST /v1/billing/portal` returns URL.

**Files:**

- `apps/server/src/v1/routes/billing.ts`

**Acceptance:**

- [ ] Portal session with correct config
- [ ] No subscription features

**Test coverage:**

- **unit:** Config validated
- **integration:** Session creates

---

## P7 — Email Notifications

**Phase objective:** All 19 templates, lifecycle wiring.

---

### P7.1a — Assessment + migration email templates (#1-#10)

**Goal:** First 10 templates: agreement lifecycle + milestones.
**Depends on:** —
**Spec anchors:** §13
**Effort:** L

**Non-negotiables:**

- en + he variants. Follow existing template pattern. Dynamic content.

**Files:**

- Templates #1-#10 (assessment-created through milestone-rejected)

**Acceptance:**

- [ ] All 10 render with sample data
- [ ] Both languages

**Test coverage:**

- **unit:** Each renders without crash

---

### P7.1b — Overdue + admin + tier + archive email templates (#11-#19)

**Goal:** Remaining 9 templates.
**Depends on:** —
**Spec anchors:** §13
**Effort:** M

**Files:**

- Templates #11-#19

**Acceptance:**

- [ ] All 9 render
- [ ] Both languages

**Test coverage:**

- **unit:** Each renders

---

### P7.2 — Wire emails to lifecycle events

**Goal:** Trigger correct email at each lifecycle event.
**Depends on:** P7.1a, P7.1b, P4.1, P5.1, P6.2
**Spec anchors:** §13 (trigger column)
**Effort:** M

**Non-negotiables:**

- Non-blocking (try/catch, log on failure).
- Uses `billing_contact_email` for SI. System admin addresses from existing `getAdminEmails()` utility (check `apps/server/src/services/` for existing pattern).
- Email #19 wired to `request-value-revision` endpoint.

**Files:**

- `apps/server/src/v1/routes/billing.ts`
- `apps/server/src/v1/routes/admin/fee-agreements.ts`
- `apps/server/src/services/project-billing.service.ts`

**Acceptance:**

- [ ] Each lifecycle event → correct email
- [ ] #19 fires on value revision request
- [ ] Failures don't break operations

**Test coverage:**

- **unit:** Mock email service, verify correct calls
- **e2e:** Lifecycle → email called

---

## P8 — Overdue + Archive + E2E

**Phase objective:** Overdue handling, archive countdown, full E2E. Ready for first live transaction.

---

### P8.1 — Overdue detection and reminders

**Goal:** Overdue detection + reminder emails.
**Depends on:** P6.2, P7.1b
**Spec anchors:** §4.1
**Effort:** M

**Non-negotiables:**

- Milestone → `overdue` when past due. Due date: `due_at = invoiced_at + payment_terms_days` (due_on_receipt = 0 days). A milestone is overdue when `NOW() > due_at`. Day N = `FLOOR((NOW() - due_at) / 1 day)`. Day 0 = due date, Day 1 = first overdue day.
- Reminder thresholds: Day ≥1, Day ≥7, Day ≥14, Day ≥30.
- **Deduplication:** Uses `overdue_reminder_sent_day1_at`, `_day7_at`, `_day14_at` timestamps on milestone (added in P1.4). Job skips if timestamp already set. Running the job twice on the same day sends each reminder at most once.
- Day 30: block new project creation.
- Admin-triggered via cron endpoint for MVP: `POST /v1/admin/billing/check-overdue`. Automated cron deferred to post-launch.

**Files:**

- `apps/server/src/services/overdue.service.ts`
- `apps/server/src/services/overdue.service.test.ts`
- `apps/server/src/v1/routes/admin/billing.ts` — cron endpoint

**Acceptance:**

- [ ] Past-due → overdue status
- [ ] Correct email at each threshold
- [ ] Day 30 blocks new projects
- [ ] Cron endpoint works

**Test coverage:**

- **unit:** Each day threshold, email logic, project blocking
- **unit:** Dedupe: running job twice on day 7 sends reminder only once (second run is no-op)
- **unit:** Due date computation for each payment_terms value

---

### P8.1b — Archive countdown service

**Goal:** Archive countdown for completed/assessment-complete agreements.
**Depends on:** P7.1b
**Spec anchors:** §8 (archive), §13 (#16, #17)
**Effort:** S

**Non-negotiables:**

- 60+ days after `completed_at`: email #16 (30-day warning).
- 83+ days: email #17 (7-day warning).
- 90+ days: transition to `archived`.
- Admin-triggered via cron endpoint: `POST /v1/admin/billing/check-archive`.

**Files:**

- `apps/server/src/services/archive.service.ts`
- `apps/server/src/services/archive.service.test.ts`
- `apps/server/src/v1/routes/admin/billing.ts` — cron endpoint

**Acceptance:**

- [ ] 30-day warning sent
- [ ] 7-day warning sent
- [ ] 90-day → archived
- [ ] Cron endpoint works

**Test coverage:**

- **unit:** Each countdown milestone

---

### P8.2 — Overdue UI (banners + project blocking)

**Goal:** Overdue banner + new project blocking.
**Depends on:** P8.1
**Spec anchors:** §4.1, §12.2.1
**Effort:** S

**Files:**

- `apps/client/src/features/billing/components/OverdueBanner.tsx`
- `apps/server/src/middleware/agreement-gates.ts`

**Acceptance:**

- [ ] Banner visible with data
- [ ] Project creation blocked at 30+ days
- [ ] UI disables with explanation

**Test coverage:**

- **unit:** Banner, middleware
- **playwright:** Banner appears

---

### P8.3 — Full E2E test suite

**Goal:** Comprehensive Playwright E2E covering full lifecycle.
**Depends on:** All previous phases
**Spec anchors:** Entire spec
**Effort:** XL

**Non-negotiables:**

- Mock mode.
- **All Playwright selectors use `data-testid` attributes.** Add `data-testid` to interactive billing components during this task if not already present from earlier tasks.
- Happy path: draft → assessment accept → M1 → proceed migration → accept migration → milestones → complete.
- Edge cases: decline, assessment-only closure, zero-fee migration, overdue banner, migration_pending_review SI tab state.
- **Zero-fee E2E must verify:** (a) no Stripe invoice created for M2, (b) migration tools accessible on `active_migration` status alone, (c) `POST /admin/fee-agreements/:id/complete` transitions to complete, (d) billing page shows "assessment only" card variant before migration, then migration card after.
- Both admin + SI perspectives.

**Files:**

- `e2e/si-billing-assessment.spec.ts`
- `e2e/si-billing-migration.spec.ts`
- `e2e/si-billing-admin.spec.ts`
- `e2e/si-billing-edge-cases.spec.ts`

**Acceptance:**

- [ ] All 4 specs pass in CI
- [ ] Happy path end-to-end
- [ ] Zero-fee: no invoice, tool access on status, admin complete
- [ ] Stable selectors

**Test coverage:**

- **playwright:** 4 files, 20+ test cases

---

## Appendix A: Spec → Task Matrix

| Spec Section         | Tasks                                        |
| -------------------- | -------------------------------------------- |
| §1 Context           | Background, no code                          |
| §2 Pricing           | P2.1                                         |
| §3 Project Value     | P5.1, P4.1                                   |
| §4 Billing Mechanics | P2.2, P2.3, P4.5, P5.1, P8.1, P8.2           |
| §4.1 Overdue         | P8.1, P8.1b, P8.2                            |
| §5 Cancellation      | P2.2, P3.2, P6.3b                            |
| §6 Partner Tiers     | P2.4, P3.1                                   |
| §7 Lifecycle         | P2.2, P3.2, P5.1                             |
| §8 Platform Access   | P4.5, P6.4, P8.1b                            |
| §9 Data Model        | P1.1-P1.5, P2.5-P2.7                         |
| §10 Stripe           | P6.1-P6.4                                    |
| §11 Admin Workflows  | P3.1-P3.7                                    |
| §12 UI               | P1.6, P3.4-P3.7, P4.2-P4.4, P5.1b-P5.4, P8.2 |
| §13 Email            | P1.7, P7.1a-P7.2                             |
| §14 Migration Path   | All tasks                                    |

## Appendix B: Parallel Groups

| Group  | Tasks                  | Notes                                   |
| ------ | ---------------------- | --------------------------------------- |
| P1-par | P1.1, P1.6, P1.7       | Independent schema + nav + dormant      |
| P2-par | P2.1, P2.2, P2.3, P2.4 | Pure logic, no cross-dependency         |
| P3-par | P3.4, P3.5, P3.6       | UI pages (all depend on P3.1-P3.2 APIs) |
| P7-par | P7.1a, P7.1b           | Template sets (independent)             |

## Appendix C: Audit Resolution Log

| #   | Source   | Issue                                             | Resolution                                                                        |
| --- | -------- | ------------------------------------------------- | --------------------------------------------------------------------------------- |
| 1   | A1-A     | ≤$500K lifecycle breaks invariants                | proceed-migration is compute-only. Persist only on accept-migration.              |
| 2   | A1-B     | Missing SI proceed-migration UI form              | Added P5.1b                                                                       |
| 3   | A1-C     | Missing SI milestone request endpoint             | Added to P4.1                                                                     |
| 4   | A1-D     | Tier override persistence undefined               | Added override columns to P1.2, logic to P2.4                                     |
| 5   | A1-E1    | Stripe customer creation missing                  | Added to P6.1 explicitly                                                          |
| 6   | A1-E2    | Acceptance + invoice not atomic                   | Made atomic. Stripe fail = rollback.                                              |
| 7   | A1-F     | Cancellation Stripe wiring missing                | Added P6.3b                                                                       |
| 8   | A2-1     | No request-value-revision endpoint                | Added to P3.2                                                                     |
| 9   | A2-2     | M3/M4 Stripe wiring orphaned                      | P6.3b explicitly owns this                                                        |
| 10  | A2-3     | Amendment not atomic                              | Added `POST /amend` as atomic in P3.2                                             |
| 11  | A2-4     | paid_via undocumented                             | Documented in P1.4 as spec addition                                               |
| 12  | A2-5     | billing_contact_email no UI                       | Added P4.1b                                                                       |
| 13  | A2-6     | No archive job                                    | Added P8.1b                                                                       |
| 14  | A2-7     | No overdue scheduler                              | Admin-triggered cron endpoint for MVP                                             |
| 15  | A2-8     | P4.5 route files unspecified                      | Listed specific route files                                                       |
| 16  | A2-9     | SOW storage unspecified                           | Referenced Supabase Storage bucket in P5.1                                        |
| 17  | A2-10    | SnapshotPage built twice                          | Shared SnapshotView, two route wrappers (P3.6)                                    |
| 18  | A2-11    | Bracket editing no plan                           | Deferred post-launch, documented in P3.5                                          |
| 19  | A2-12    | Mock row lock no-op                               | Documented in P2.5                                                                |
| 20  | A2-13    | Property test boundaries                          | Added boundary property to P2.1                                                   |
| 21  | A2-14    | Admin email addresses                             | Referenced existing utility in P7.2                                               |
| 22  | A2-15    | Zero-fee E2E steps                                | Expanded in P8.3                                                                  |
| 23  | A2-size  | P2.2 underestimated                               | Upgraded to XL                                                                    |
| 24  | A2-size  | P7.1 should split                                 | Split into P7.1a + P7.1b                                                          |
| 25  | A1       | canonicalJson utility                             | Already exists (spec §8). Referenced in P4.1 and P3.6.                            |
| 26  | v2-A2-1  | Email #18 wired to wrong event                    | #18 fires on SI submit (P5.1), #4 fires on admin approve (P3.2)                   |
| 27  | v2-A2-2  | State machine persists data (I/O in pure fn)      | Renamed to VALIDATE_SUBMIT_VALUE. Route handler does persistence.                 |
| 28  | v2-A2-3  | SOW access test references non-existent endpoint  | Replaced with Supabase Storage policy note. Added admin sow-url endpoint to P3.2. |
| 29  | v2-A2-4  | migration_pending_review not in SI billing tab    | Added rendering variant to P4.3                                                   |
| 30  | v2-A2-5  | admin/billing.ts created in P8 without prior task | File created in P3.2 (initially empty, mounted)                                   |
| 31  | v2-A1    | SOW for ≤$500K has nowhere to go                  | Ephemeral sow_file_token: uploaded but not linked until accept-migration          |
| 32  | v2-A1    | Overdue reminders will spam                       | Dedupe via per-milestone reminder timestamps (added to P1.4, P8.1)                |
| 33  | v2-A1    | Missing admin SOW retrieval endpoint              | Added GET sow-url to P3.2                                                         |
| 34  | v2-A1    | Atomic rollback not proven                        | Added rollback test to P6.3a                                                      |
| 35  | v2-A2-6  | tier_override undocumented as spec addition       | Added note to P1.2                                                                |
| 36  | v2-A2-7  | P5.2 SOW parenthetical misleading                 | Fixed to describe ≤$500K vs >$500K correctly                                      |
| 37  | v2-A2-8  | canonicalJson lacks file path                     | Added grep instruction                                                            |
| 38  | v2-A2-9  | Contract test DB setup unspecified                | Added setup/teardown description to P2.6                                          |
| 39  | v2-A2-10 | Overdue day boundary ambiguous                    | Added explicit formula (Day N = floor) to P8.1                                    |
| 40  | v2-A2-11 | Cancellation auto-invoice failure unhandled       | Cancel commits regardless; failed invoices logged + admin alerted                 |
| 41  | v2-A2-12 | Playwright selector strategy undefined            | data-testid non-negotiable added to P8.3                                          |
