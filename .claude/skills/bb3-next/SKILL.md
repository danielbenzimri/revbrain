---
name: bb3-next
description: Start the next BB-3 implementation task. Reads MIGRATION-PLANNER-BB3-TASKS.md, picks the next unblocked task, loads only the referenced spec anchors (not the whole 2700-line design doc), states non-negotiables, presents a plan, and executes after user confirmation.
---

# bb3-next — Start the next BB-3 task

You are starting a new BB-3 implementation task. BB-3 is the IR Normalizer component of the Migration Planner. The authoritative spec is [docs/MIGRATION-PLANNER-BB3-DESIGN.md](../../docs/MIGRATION-PLANNER-BB3-DESIGN.md) (≈2700 lines) and the task cards live in [docs/MIGRATION-PLANNER-BB3-TASKS.md](../../docs/MIGRATION-PLANNER-BB3-TASKS.md).

## Step 1 — Pick the task

If the user passed an argument (a task ID), use that.

Otherwise, find the next unblocked task:

1. Read `docs/MIGRATION-PLANNER-BB3-TASKS.md` — look for the task graph / inventory section (usually §2 or §3).
2. Check `git log --oneline --all | grep -oE 'Task: [A-Z0-9-]+'` to see which task IDs are already committed.
3. Identify the lowest-numbered task whose dependencies are all merged AND which is not yet implemented.
4. If multiple candidates exist, prefer the one in the current wave.
5. Show the user the candidate and wait for confirmation before proceeding.

## Step 2 — Load task context (NARROWLY)

Once the task is chosen:

1. Read ONLY that task card from TASKS.md — use `grep -n "### <TASK-ID>"` to locate it, then `Read` with `offset`/`limit`.
2. Read ONLY the spec anchors the card cites (e.g. §5.2, §8.1) — NOT the whole design doc.
3. Read ONLY the files the card lists under "Files".
4. If the task touches existing code, read the existing files.

Do NOT speculatively read unrelated sections. Context is precious.

## Step 3 — Quote the non-negotiables

Print to the user:

- **Task ID + title**
- **Non-negotiables** (copy the 2–4 bullets from the card verbatim)
- **Files to touch** (list)
- **Test coverage required** (from the card's test taxonomy: unit / integration / golden / property / e2e / smoke / lint)
- **Effort estimate** (S / M / L / XL)

## Step 4 — Present the plan

Before writing any code:

1. For effort L or XL tasks: enter plan mode (shift+tab shift+tab) or use the `Plan` subagent.
2. Lay out the implementation as ordered steps.
3. Identify edge cases — cross-reference spec §9 (Edge Cases) for BB-3.
4. State which tests you will write FIRST (tests-first for every task).
5. Ask the user "proceed?" and WAIT for confirmation.

## Step 5 — Execute

After confirmation:

1. Write tests first where the taxonomy allows (unit, property).
2. Implement the code.
3. Run file-level tests as you go (`pnpm --filter <pkg> test <file>`).
4. Do NOT invoke `/ship-it` yourself unless the user has explicitly pre-authorized it. Default: announce completion and let the user trigger `/ship-it`.

## BB-3 invariants — must not violate

Copy these into every task execution context. Any violation is a blocker:

- **No RCA concept names** in `packages/bb3-normalizer/src/` — no `PricingProcedure`, `DecisionTable`, `CML`, `ContextDefinition`, `ConstraintModelLanguage`. Spec §2.4, test A14.
- **Determinism**: no `Date.now()`, `Math.random()`, `crypto.randomUUID()`, `performance.now()` in any code that affects `IRGraph`. Runtime telemetry lives ONLY in `NormalizeResult.runtimeStats`. Spec §6.2, §6.4.
- **canonicalJson, never JSON.stringify** for anything feeding an identity hash or determinism test. Spec §8.1.
- **NodeRef not string[]** for any node-to-node reference. Spec §5.1a.
- **No wall-clock timeouts** for parsers — byte/AST/depth budgets only. Spec §8.4.
- **No imports from `@revbrain/tpr`, `@revbrain/database`, or `tree-sitter`** in `@revbrain/migration-ir-contract`. Spec §6.3.
- **Every non-composite IR node** has `evidence.sourceFindingKeys.length >= 1`. Spec §5.4.

If you catch yourself about to violate any of these, STOP and re-read the cited section.

## Step 6 — Task is done when...

The task is NOT done until ALL of the following are true:

1. Every acceptance-criteria checkbox on the card is satisfied.
2. Every required test type is written and passing.
3. `/ship-it` has run green (invoked by the user, or by you with user permission).

Only then does `/bb3-next` pick the following task.

## What NOT to do

- Do NOT load the whole 2700-line design spec into context. Load only the cited sections.
- Do NOT write code before presenting the plan and getting confirmation.
- Do NOT skip writing tests "because the task is simple".
- Do NOT mark a task done without `/ship-it` green.
- Do NOT deviate from the spec silently. If you must deviate, document it in the commit message and note it for a follow-up spec amendment.
