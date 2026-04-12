---
name: task-next
description: Start the next implementation task for the active module (Segmenter, BB-3, or any future pipeline stage). Reads the module's task doc, picks the next unblocked card, loads only the referenced spec anchors, states non-negotiables, presents a plan, and executes after user confirmation.
---

# task-next — Start the next pipeline task

You are starting a new implementation task. This skill works for ANY pipeline module — it detects which module is active from the current branch name or user argument, then reads that module's task doc.

## Module detection

Determine the active module from (in priority order):

1. **User argument** — if the user passed a module name or task ID (e.g. `/task-next segmenter` or `/task-next SEG-1.3`), use that.
2. **Branch name** — if the branch contains `segmenter` → Segmenter. If `bb3` → BB-3 Normalizer.
3. **Ask** — if ambiguous, ask which module.

**Module registry:**

| Module              | Task doc                              | Design spec                            | Package paths                                                                          | Non-negotiables source                   |
| ------------------- | ------------------------------------- | -------------------------------------- | -------------------------------------------------------------------------------------- | ---------------------------------------- |
| **Segmenter**       | `docs/MIGRATION-SEGMENTER-TASKS.md`   | `docs/MIGRATION-SEGMENTER-DESIGN.md`   | `packages/migration-segmenter/`, `packages/migration-ir-contract/src/types/segment.ts` | Task doc "Non-negotiables" section       |
| **BB-3 Normalizer** | `docs/MIGRATION-PLANNER-BB3-TASKS.md` | `docs/MIGRATION-PLANNER-BB3-DESIGN.md` | `packages/bb3-normalizer/`, `packages/migration-ir-contract/`                          | CLAUDE.md "BB-3 non-negotiables" section |

Future modules: add a row to this table.

## Step 1 — Pick the task

If the user passed a task ID, use that.

Otherwise, find the next unblocked task:

1. Read the module's task doc — look for the phase/inventory section.
2. Check `git log --oneline --all | grep -oE 'Task: [A-Z0-9.-]+'` to see which task IDs are already committed.
3. Identify the lowest-numbered task whose dependencies are all merged AND which is not yet implemented.
4. If multiple candidates exist, prefer the one in the current phase.
5. Show the user the candidate and wait for confirmation before proceeding.

## Step 2 — Load task context (NARROWLY)

Once the task is chosen:

1. Read ONLY that task card from the task doc — use `grep -n "### <TASK-ID>"` to locate it, then `Read` with `offset`/`limit`.
2. Read ONLY the spec sections the card cites (e.g. §5.2, §8.1) — NOT the whole design spec.
3. Read ONLY the files the card lists under "Files".
4. If the task touches existing code, read the existing files.

Do NOT speculatively read unrelated sections. Context is precious.

## Step 3 — Quote the non-negotiables

Print to the user:

- **Module + Task ID + title**
- **Non-negotiables** (from the module's task doc or CLAUDE.md, verbatim)
- **Files to touch** (list)
- **Test coverage required** (from the card)
- **Effort estimate**

## Step 4 — Present the plan

Before writing any code:

1. For effort L or XL tasks: enter plan mode or use the `Plan` subagent.
2. Lay out the implementation as ordered steps.
3. Identify edge cases — cross-reference the design spec's edge-cases section.
4. State which tests you will write FIRST.
5. Ask the user "proceed?" and WAIT for confirmation.

## Step 5 — Execute

After confirmation:

1. Write tests first where the taxonomy allows.
2. Implement the code.
3. Run file-level tests as you go.
4. Do NOT invoke `/ship-it` yourself unless the user has explicitly pre-authorized it.

## Module-specific invariants

### Segmenter invariants (from MIGRATION-SEGMENTER-TASKS.md)

- **Determinism:** same graph + options → byte-identical assignment + manifest. All sorting uses strict `<`/`>`, never `localeCompare`. `runtimeStats` excluded.
- **No silent fall-through:** unknown edge types throw. Missing structural-edge targets throw.
- **Thin dependencies:** `@revbrain/migration-segmenter` depends on `@revbrain/migration-ir-contract` + `zod` only. No cross-package imports from `bb3-normalizer`.
- **All thresholds injectable** via `SegmenterOptions`, validated by Zod.
- **Content-addressable IDs:** length-prefixed streaming hash. `base64url`. Never truncate.

### BB-3 invariants (from CLAUDE.md)

- **RCA neutrality:** no CPQ-target concept names in normalizer sources.
- **Determinism:** no `Date.now()`, `Math.random()`, etc. in graph-affecting code.
- **canonicalJson only** in identity/hash paths.
- **NodeRef, not string[]** for node references.
- **No wall-clock timeouts** on parsers.
- **Contract package stays thin.**

## Step 6 — Task is done when...

1. Every acceptance checkbox on the card is satisfied.
2. Every required test type is written and passing.
3. `/ship-it` has run green.

## What NOT to do

- Do NOT load entire design specs into context. Load only cited sections.
- Do NOT write code before presenting the plan and getting confirmation.
- Do NOT skip tests.
- Do NOT mark a task done without `/ship-it` green.
- Do NOT deviate from the spec silently.
