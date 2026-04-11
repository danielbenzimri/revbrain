---
name: wave-review
description: Self-reflective code review of recent BB-3 work. Checks architectural coherence, spec adherence, determinism invariants, test quality, and identifies refactor opportunities. Run every 5 tasks or at the end of each wave (Wave 1/2/3).
---

# wave-review — Self-reflective review of recent work

You are reviewing the last N BB-3 commits to catch drift before it compounds. This is NOT rubber-stamping — find real issues or explicitly say "nothing to fix".

## Step 1 — Scope the review

Default: last 5 commits on the current feature branch. If the user passed a different N or a commit range, use that.

1. `git log --oneline -10` — see recent history.
2. `git diff <base>..HEAD --stat` where `<base>` is the commit N back.
3. Read each commit's message and diff.

## Step 2 — Review dimensions (go through each, explicitly)

### A. Spec adherence

- Does every file created/modified match the TASKS.md card for its commit?
- Are all §X.Y spec anchors actually honored?
- For each non-negotiable on each card: satisfied in code? Check the card's acceptance checklist against the diff.

### B. BB-3 invariants (determinism + RCA neutrality)

Invoke `/bb3-doctor` and attach its output to the review. Also manually check:

- Any new `Date.now()` / `performance.now()` / `Math.random()` calls outside `runtimeStats`?
- Any new `JSON.stringify` calls in identity/hash paths?
- Any new RCA concept names (PricingProcedure, DecisionTable, CML, ContextDefinition, ConstraintModelLanguage)?
- Any new `string[]` reference fields where `NodeRef[]` is the spec contract?
- Any new wall-clock timeouts on parsers?
- Any new imports in `@revbrain/migration-ir-contract` beyond `zod`?

### C. Architectural coherence

- Are new normalizers consistent with existing ones (same file layout, same return shape, same error handling)?
- Are tests in the right location (unit vs integration vs golden)?
- Are there patterns emerging that should be extracted into a helper? Only if used 3+ times — never prematurely.
- Conversely, are there helpers created for single-use cases? Inline them.
- Is error handling consistent? Quarantine for data issues, `BB3InputError` for input shape, `BB3InternalError` for bugs.

### D. Test quality

- Do tests assert behavior, not implementation details?
- Is there a property test where the spec suggested one (identity hash, canonicalJson, field-ref normalization)?
- Do any tests rely on wall-clock, random numbers, or `Map`/`Set` insertion order? Those will flake.
- Is there a golden regression if the commit touches user-facing IR shapes?
- Are error paths covered, not just happy paths?

### E. Spec drift

- Did the implementation have to deviate from the spec? If yes, is the deviation in the commit message AND noted for a spec amendment?
- Did implementation reveal an under-specified area? File it as a follow-up.

### F. Code smells (standard)

- Dead code, unused exports
- Types that should be discriminated unions but are broad records
- `any` / `unknown` where a concrete type was possible
- Magic numbers that should be constants
- Comments explaining _what_ the code does (delete; code should be self-explanatory) — keep comments only for _why_
- Premature abstraction (one-use helpers, config knobs for no caller)

## Step 3 — Produce the review

Output format:

```
## Wave review — commits <SHA1>..<SHA2>

### [OK] Looks good
- <bullet>
- <bullet>

### [FIX] Must-fix issues
1. <file:line> — <description>
   Fix: <specific action>
2. ...

### [SUGGEST] Optional improvements
1. <description>

### [FOLLOWUP] Items to file
- <description>

### Verdict: GREEN | YELLOW | RED
- GREEN  = nothing to fix, proceed
- YELLOW = suggestions only, user can defer
- RED    = must-fix issues exist; do NOT proceed to next task until addressed
```

## Step 4 — Act on findings

- **RED**: stop and fix the issues, then re-run `/wave-review` once to confirm GREEN or YELLOW.
- **YELLOW**: print suggestions, ask the user whether to address now or defer.
- **GREEN**: ask whether to proceed with `/bb3-next` OR run `/sync-branches` if 5+ commits since last sync.

## Rules

- Be specific. "Consider refactoring X" is useless. "file.ts:42 repeats a switch that should be a lookup table; here's the change" is useful.
- Do NOT nitpick style issues that prettier handles.
- Do NOT invent problems. If the code is fine, say so.
- Favor "delete this" over "add this". Subtraction compounds.
- If the review finds a pattern across multiple commits (not just one), call it out as a systemic issue, not N separate issues.
