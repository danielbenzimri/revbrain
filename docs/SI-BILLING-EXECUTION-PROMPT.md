# SI Billing — Execution Prompt

> Paste this into a new Claude Code session to begin implementation. Create the feature branch first: `git checkout -b feat/si-billing`

---

## The Prompt

```
You are implementing the SI Partner Billing feature for RevBrain. This is a multi-phase, 44-task implementation that will be executed sequentially using the existing task-card workflow.

## Source documents (read these BEFORE starting)

1. **Task doc (your primary guide):** `docs/SI-BILLING-TASKS.md` — 44 tasks across 8 phases. Every task has exact files, acceptance criteria, and test requirements.
2. **Spec (for context when task cards reference sections):** `docs/SI-BILLING-SPEC.md` — the billing spec (v5 FINAL). Only read sections cited by the current task card.
3. **Ground rules in the task doc header** — key design decisions that override any assumptions.

## How to work

Use the existing skill workflow defined in CLAUDE.md:

1. **Start each task with `/task-next`** — it will detect the SI Billing module from the `feat/si-billing` branch, read SI-BILLING-TASKS.md, find the next unblocked task, load only the relevant context, and present a plan.
2. **After implementing + tests passing, finalize with `/ship-it`** — it runs format, lint, test, build, commits with proper message format (`Task: P1.1`, `Refs: SI-BILLING-SPEC.md §9`), and pushes.
3. **Every 5 commits, run `/wave-review`** — it checks for spec drift, billing invariants (integer math, pure state machine, paid_via guards, i18n), test quality, and code smells.
4. **After wave-review, run `/sync-branches`** — it promotes feat/si-billing to staging, watches CI/CD, then promotes to main, watches CI/CD, and returns to the feature branch.
5. **At each phase boundary (P1 done, P2 done, etc.), always run `/wave-review` then `/sync-branches`** regardless of commit count.

## Critical invariants (memorize these)

- **Integer math only** — cents (bigint) + basis points (int). No floating point in fee calculations.
- **State machine is pure** — agreement + milestone state machines return updates, never do I/O.
- **Acceptance + Stripe is atomic** — if Stripe fails, rollback everything.
- **`paid_via` guard** — milestones with `paid_via = 'carried_credit'` never create Stripe invoices.
- **<=500K compute-only** — `proceed-migration` for small deals returns terms without persisting.
- **i18n everything** — en + he for all UI strings. `start-*`/`end-*` CSS only.

## If you encounter a problem

- If a task's acceptance criteria can't be met due to an issue in an earlier task, create a **correction task** following the same task card format (Goal, Files, Acceptance, Tests) and execute it before continuing. Name it `PX.Ya` (e.g., `P2.2a` for a fix after P2.2).
- If you find a spec ambiguity not covered by the task card or ground rules, ask the user before proceeding.
- If format/lint/test/build fails on `/ship-it`, fix the issue and re-run — do NOT skip validation.

## Start now

Run `/task-next` to begin with the first unblocked task (P1.1).
```

---

## Pre-flight checklist (do these before pasting the prompt)

1. [ ] Create and switch to feature branch: `git checkout -b feat/si-billing`
2. [ ] Verify clean working tree: `git status` shows clean
3. [ ] Verify build passes: `pnpm build`
4. [ ] Verify tests pass: `pnpm test`
5. [ ] Verify you're on the right branch: `git branch --show-current` = `feat/si-billing`

## What happens during execution

The agent will cycle through this loop automatically:

```
/task-next → read task card → present plan → [you confirm] → implement + test → /ship-it → commit + push
     ↓ (every 5 commits)
/wave-review → check invariants → fix if RED → /sync-branches → promote to staging → watch CI → promote to main → watch CI → return to feat branch
     ↓ (continue)
/task-next → next task...
```

## Expected timeline

| Phase | Tasks | Estimated commits | When to sync                                         |
| ----- | ----- | ----------------- | ---------------------------------------------------- |
| P1    | 7     | 7                 | After P1.7 (phase boundary)                          |
| P2    | 7     | 7                 | After P2.7 (phase boundary)                          |
| P3    | 7     | 7                 | After P3.3 (5 commits) + after P3.7 (phase boundary) |
| P4    | 6     | 6                 | After P4.5 (5 commits) + after P4.5 (phase boundary) |
| P5    | 5     | 5                 | After P5.4 (phase boundary)                          |
| P6    | 5     | 5                 | After P6.4 (phase boundary)                          |
| P7    | 3     | 3                 | After P7.2 (phase boundary)                          |
| P8    | 4     | 4                 | After P8.3 (phase boundary)                          |

Total: ~44 commits, ~8 sync cycles, ~8 wave reviews minimum.

## What to watch for

- **Phase P2.2 (agreement state machine) is XL** — the largest single task. Expect the agent to enter plan mode. Review the plan carefully before confirming.
- **Phase P6 (Stripe) requires API keys** — ensure `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` are set in `.env.staging` before P6 begins.
- **P4.4 (BillingPage swap) is HIGH RISK** — replaces the entire billing page. The agent should build all new components first, then do the atomic swap as the last step.
- **P8.3 (E2E suite) is XL** — 20+ Playwright tests. May take multiple attempts if selectors are flaky.
