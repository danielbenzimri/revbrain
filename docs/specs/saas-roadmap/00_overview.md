# SaaS Envelope Roadmap

## Vision

Build a production-ready, reusable SaaS foundation ("Golden Template") that includes everything a modern B2B SaaS needs **before** any domain-specific features. This envelope should be portable to any vertical (civil engineering, procurement, HR, etc.).

---

## Current State Audit

> **Last Updated:** 2026-02-17

### Phases Complete (✅)

| Phase         | Status      | Completed | Notes                                       |
| ------------- | ----------- | --------- | ------------------------------------------- |
| **Phase 0**   | ✅ COMPLETE | 2026-02   | User management, invites, password reset    |
| **Phase 1**   | ✅ COMPLETE | 2026-02   | Email infrastructure (Resend), 5+ templates |
| **Phase 2**   | ✅ COMPLETE | 2026-02   | Stripe billing, webhooks, subscriptions     |
| **Phase 3**   | ⚠️ PARTIAL  | -         | Support tickets ✅, Leads CRM partial       |
| **Phase 4-7** | 📅 PLANNED  | -         | See individual specs                        |

### What's Done (✅)

| Component                 | Status      | Notes                                     |
| ------------------------- | ----------- | ----------------------------------------- |
| Multi-tenant Architecture | ✅ Complete | Organizations, user membership, isolation |
| Authentication            | ✅ Complete | Supabase Auth integration                 |
| RBAC                      | ✅ Complete | Role hierarchy, permission checks         |
| Rate Limiting             | ✅ Complete | 8 rate limiters (IP/user/tenant based)    |
| RLS Policies              | ✅ Complete | Defense-in-depth at DB level              |
| Error Boundaries          | ✅ Complete | Crash isolation in React                  |
| React Query Caching       | ✅ Complete | Optimistic updates, cache invalidation    |
| Soft Delete               | ✅ Complete | Users and organizations                   |
| Plan Data Model           | ✅ Complete | Plans table with features/limits          |
| Platform Admin UI         | ✅ Complete | Tenants, users, plans, coupons, support   |
| Password Reset Flow       | ✅ Complete | Phase 0 - Feb 2026                        |
| Email Verification        | ✅ Complete | Phase 0 - Feb 2026                        |
| User Invitation System    | ✅ Complete | Phase 0 - Feb 2026                        |
| Email Service (Resend)    | ✅ Complete | Phase 1 - Feb 2026                        |
| Email Templates           | ✅ Complete | 5+ templates (welcome, invite, billing)   |
| Stripe Integration        | ✅ Complete | Phase 2 - Feb 2026                        |
| Checkout Flow             | ✅ Complete | Phase 2 - Feb 2026                        |
| Subscription Webhooks     | ✅ Complete | Phase 2 - with refund handling            |
| Customer Billing Portal   | ✅ Complete | Phase 2 - Feb 2026                        |
| Support Ticket System     | ✅ Complete | Phase 3 - Feb 2026                        |
| Job Queue System          | ✅ Complete | Database-backed with retry logic          |

### What's Remaining (❌)

| Component                    | Priority | Phase |
| ---------------------------- | -------- | ----- |
| Tenant Team Management UI    | High     | 3     |
| Tenant Settings Page         | High     | 3     |
| Leads CRM (Admin)            | High     | 3     |
| Revenue Dashboard            | High     | 4     |
| Subscription Health Monitor  | High     | 4     |
| User Impersonation (Support) | Medium   | 4     |
| In-App Notifications         | Medium   | 5     |
| Onboarding Flow              | Medium   | 5     |
| Help Center Integration      | Medium   | 5     |
| SSO/SAML                     | Low      | 6     |
| Custom Domains               | Low      | 6     |
| White-Labeling               | Low      | 6     |
| Feature Flags                | Low      | 7     |
| Search Infrastructure        | Low      | 7     |
| A/B Testing                  | Low      | 7     |

---

## Phase Overview

```
Phase 0: User Management Foundation ✅ COMPLETE (Feb 2026)
├── ✅ Password reset flow
├── ✅ Email verification
├── ✅ User invitation system
├── ✅ Session management
└── ✅ Account deletion (GDPR)

Phase 1: Email Infrastructure ✅ COMPLETE (Feb 2026)
├── ✅ Email service setup (Resend)
├── ✅ Email templates system
├── ✅ Welcome email
├── ✅ Invite email
├── ✅ Password reset email
└── ✅ Billing notification emails

Phase 2: Billing & Subscriptions (Stripe) ✅ COMPLETE (Feb 2026)
├── ✅ Stripe account setup
├── ✅ Plan sync (DB ↔ Stripe)
├── ✅ Checkout flow
├── ✅ Webhook handlers (incl. refunds)
├── ✅ Customer portal integration
├── ✅ Trial periods
└── ✅ Subscription lifecycle

Phase 3: Tenant Admin Experience ⚠️ PARTIAL
├── ⚠️ Team management page (basic)
├── ✅ Invite/remove members
├── ✅ Role assignment
├── ✅ Billing portal access
├── ⚠️ Organization settings (basic)
├── ✅ Usage dashboard
├── ✅ Support ticket system
└── ⚠️ Audit log viewer (admin only)

Phase 4: Platform Admin Tools
├── Revenue dashboard
├── Subscription health monitor
├── Manual subscription overrides
├── User impersonation
├── Webhook event logs
└── System health dashboard

Phase 5: User Experience Polish
├── In-app notification system
├── Notification preferences
├── Onboarding wizard
├── Activity feed
├── Help center integration
└── Feedback collection

Phase 6: Enterprise Features
├── SSO/SAML integration
├── Custom domains
├── White-label theming
├── Advanced audit logs
├── Data export (GDPR)
└── SLA monitoring

Phase 7: Infrastructure Extras
├── Background job system
├── File storage abstraction
├── Search infrastructure
├── Feature flags
├── Analytics pipeline
└── A/B testing
```

---

## Dependency Graph

```
Phase 0 ──→ Phase 1 ──→ Phase 2 ──→ Phase 3
   │            │           │           │
   │            │           │           ▼
   │            │           │       Phase 4
   │            │           │           │
   │            │           ▼           │
   │            └──────→ Phase 5 ◄──────┘
   │                        │
   │                        ▼
   └──────────────────→ Phase 6
                           │
                           ▼
                       Phase 7
```

**Critical Path**: 0 → 1 → 2 (Must complete before you can charge money)

---

## Success Criteria

When complete, the SaaS envelope should support:

1. **Self-service signup** → User signs up, verifies email, creates org
2. **Team growth** → Org admin invites team members via email
3. **Monetization** → User selects plan, pays via Stripe checkout
4. **Subscription management** → User upgrades/downgrades, updates payment method
5. **Platform operations** → Admin monitors revenue, handles support cases
6. **Enterprise sales** → SSO, custom domains, white-label for big clients

---

## Estimated Effort

| Phase   | Complexity | Estimated Time |
| ------- | ---------- | -------------- |
| Phase 0 | Medium     | 2-3 days       |
| Phase 1 | Medium     | 2-3 days       |
| Phase 2 | High       | 5-7 days       |
| Phase 3 | Medium     | 3-4 days       |
| Phase 4 | Medium     | 3-4 days       |
| Phase 5 | Medium     | 3-4 days       |
| Phase 6 | High       | 5-7 days       |
| Phase 7 | Medium     | 3-5 days       |

**Total**: ~4-6 weeks for complete envelope

---

## File Structure

```
specs/saas_roadmap/
├── 00_overview.md          (this file)
├── 01_phase0_user_management.md
├── 02_phase1_email_infrastructure.md
├── 03_phase2_billing_stripe.md
├── 04_phase3_tenant_admin.md
├── 05_phase4_platform_admin.md
├── 06_phase5_user_experience.md
├── 07_phase6_enterprise.md
└── 08_phase7_infrastructure.md
```

---

## Next Steps

**Phases 0-2 are COMPLETE.** Current focus:

1. Complete Phase 3 - Tenant Admin (Leads CRM, Team UI polish)
2. Begin Phase 4 - Platform Admin (Revenue dashboard, health monitor)
3. Plan Phase 5 - UX Polish (In-app notifications, onboarding)

See `audits/zero-trust-audit-2026-02-17.md` for current technical priorities.
