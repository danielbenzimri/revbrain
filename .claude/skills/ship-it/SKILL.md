---
name: ship-it
description: Finalize a task — run format/lint/test/build, analyze any failures, commit with a descriptive message, and push to the current feature branch. Use after completing any implementation task. Invokes bb3-doctor automatically when BB-3 files are touched.
---

# ship-it — Finalize the current task

You are finalizing a unit of work. Your job is to prove the change is clean, commit it, and push it. Do NOT skip steps. Do NOT mark the task done if any step fails.

## Preconditions

1. Current branch is NOT `main` or `staging`. If it is, STOP and ask the user for the feature branch name.
2. There are staged or unstaged changes. If `git status --porcelain` is empty, STOP — nothing to ship.
3. The user has not explicitly asked you to skip validation.

## Validation pipeline (stop on failure)

Run these from the repo root, in order:

1. **pipeline-doctor** — invoke `/bb3-doctor` if ANY file under `packages/bb3-normalizer/`, `packages/migration-ir-contract/`, or `docs/MIGRATION-PLANNER-BB3*.md` is modified (catches BB-3 determinism + RCA-leakage). ALSO run the segmenter checks (C9 edge-classification coverage) if ANY file under `packages/migration-segmenter/` or `docs/MIGRATION-SEGMENTER*.md` is modified. Both sets run in under 5 seconds total.
2. **format** — `pnpm format`. If this makes changes, re-stage them; they'll be part of the commit.
3. **lint** — `pnpm lint`. Must pass clean.
4. **test** — `pnpm test`. Must pass clean.
5. **build** — `pnpm build`. Must pass clean.

If any step fails:

- Do NOT proceed to commit.
- Read the error output, identify the root cause, and fix it.
- Re-run from the failing step (not the whole pipeline).
- If you cannot fix it after 2 attempts, STOP and report the blocker to the user.

## Commit

Only after all validation is green:

1. Run `git status` and `git diff --stat` to see what's changing.
2. Run `git log -5 --oneline` to match the repo's commit-message style.
3. Stage ONLY the files relevant to the current task. NEVER use `git add -A` or `git add .`.
4. Compose a commit message:
   - First line: `<type>(<scope>): <summary under 70 chars>` (e.g. `feat(segmenter): SEG-1.3 — strong-edge grouping + SCC merge` or `feat(bb3): add identityHash`)
   - Body: 1–3 bullet points on the "why", not the "what"
   - If this implements a task card, include `Task: <TASK-ID>` and `Refs: <design-doc> §<section>` (e.g. `Task: SEG-1.3` / `Refs: docs/MIGRATION-SEGMENTER-DESIGN.md §5.1`)
   - Footer: `Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>`
5. Commit via HEREDOC (never inline `-m` for multi-line).

## Push

1. `git rev-parse --abbrev-ref @{upstream}` to check upstream tracking (ok if this fails — first push).
2. `git push -u origin HEAD` if no upstream, otherwise `git push`.
3. Verify: `git log origin/<branch>..HEAD` should be empty.

## Completion report

Print a concise summary:

- Files changed: `<count>`
- Commit SHA: `<first 7 chars>`
- Branch: `<name>`
- Push: ok / failed

Then suggest the next action:

- If 5+ commits on this feat branch since last sync → suggest `/sync-branches`
- If 5+ task commits since last review → suggest `/wave-review`
- Otherwise → suggest `/task-next`

## What NOT to do

- Do NOT skip format/lint/test/build.
- Do NOT use `--no-verify`, `--amend`, `--force`, or `--force-with-lease`.
- Do NOT commit directly to `main` or `staging`.
- Do NOT commit files you didn't touch (sibling garbage from `git add .`).
- Do NOT push to `main` or `staging` from this skill — that's `/sync-branches`.
- Do NOT include marketing text like "Generated with Claude Code" in commit messages. Use only the `Co-Authored-By` trailer.
