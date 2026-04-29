# Billing Model — Big Picture

> **Date:** 2026-04-28
> **Status:** Brainstorm / Future Direction
> **Active spec:** [SI-BILLING-SPEC.md](SI-BILLING-SPEC.md) — the current scope

---

## Two-Phase Business Model

RevBrain has two distinct customer types, two revenue streams, and a clear ownership handoff between them.

### Phase 1: SI as Tool User (Current Focus)

```
┌──────────┐    sells migration    ┌──────────────┐
│  SI firm │ ──────────────────── >│  End-client   │
│ (partner)│    engagement to      │  (enterprise) │
└────┬─────┘                       └──────────────┘
     │ uses RevBrain
     │ to execute migration
     ▼
┌──────────────┐
│   RevBrain   │  ◄── SI pays X% of project value
│   (tool)     │
└──────────────┘
```

- **Customer:** SI partner
- **Revenue:** % of migration project value (one-time, milestone-billed)
- **Ownership:** SI owns the end-client
- **Spec:** [SI-BILLING-SPEC.md](SI-BILLING-SPEC.md)

### Phase 2: SI as Distribution Channel (Future)

```
┌──────────┐    "you should keep    ┌──────────────┐
│  SI firm │ ── using RevBrain" ── >│  End-client   │
│ (channel)│    recommends tool     │  (enterprise) │
└────┬─────┘                        └──────┬───────┘
     │ earns commission                    │ pays subscription
     │ on referral                         │ directly to RevBrain
     ▼                                     ▼
┌──────────────────────────────────────────────┐
│                  RevBrain                    │
│              (platform owner)                │
└──────────────────────────────────────────────┘
```

- **Customer:** End-client (enterprise)
- **Revenue:** Recurring subscription (monthly/annual)
- **SI role:** Distribution channel, earns commission on referral
- **Ownership:** RevBrain owns the end-client
- **Requires:** Separate end-client app/experience, subscription billing, referral/commission system

---

## Future: End-Client Subscription Model

When RevBrain builds an end-client-facing product (knowledge base, RCA actions, monitoring), the subscription model would be:

- **Per-org platform fee** (not per-seat — RevOps teams need full access)
- **Tiered:** Essentials / Professional / Enterprise
- **Value prop:** Ongoing access to extracted intelligence, RCA actions, monitoring, compliance
- **Pricing page:** Separate audience tab ("For SI Partners" / "For Enterprises")

## Future: SI Commission / Channel Program

When SIs convert their end-clients into RevBrain subscribers:

- **Time-bound rev share:** ~15% of subscription revenue for 24 months, declining thereafter
- **Attribution:** Tracked via project → subscription conversion in-app
- **Payouts:** Manual initially, Stripe Connect when scale demands it

## Future: Separate Applications

The SI and end-client experiences are different enough to warrant separate apps:

- **SI app:** Migration execution tool (extract, normalize, segment, plan) — project-scoped
- **End-client app:** Knowledge platform (browse, monitor, act on RCA) — subscription-scoped
- **Shared backend:** Same API, same data, different auth/access/UI layers

---

## Market Context (from research)

- 43–61% of SaaS companies now use hybrid pricing; those see 38% higher revenue growth
- Per-seat pricing declining (21% → 15% in 12 months) as AI changes the value equation
- Implementation fees represent 30–60% of first-year costs for complex platforms
- Best land-and-expand companies achieve >120% net revenue retention
- Percentage-of-value pricing works best with clear, pre-agreed success metrics and 5–6x ROI for the customer
