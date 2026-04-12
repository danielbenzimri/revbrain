---
name: sync-branches
description: Synchronize the current feature branch with staging and main, watch CI/CD on both, and verify green. Handles the "every few commits keep main+staging aligned and validated" workflow. If CI/CD fails, analyzes the failure and returns the user to the feature branch to fix.
---

# sync-branches — Promote feat → staging → main, validate CI/CD on both

RevBrain keeps `main` and `staging` aligned, both with CI/CD pipelines. This skill promotes the current feature branch through both and watches the pipelines until green.

**Promotion order:** `feat → staging → main`. Staging is always "ahead or equal" to main; we validate in staging before touching main.

## Preconditions

Stop with a clear message if any of these fail:

1. Current branch is a feature branch (not `main`, not `staging`).
2. `git status --porcelain` is empty (working tree clean).
3. Feature branch is pushed to origin and up to date.
4. `gh` CLI is installed and authenticated — `gh auth status`.
5. The user has not indicated this is a "WIP" state that shouldn't be promoted.

## Step 1 — Pre-sync snapshot

1. `feat_branch=$(git branch --show-current)`
2. `feat_sha=$(git rev-parse HEAD)`
3. `git fetch --all --prune`
4. Show the user:
   - Current branch + HEAD
   - Commits about to promote: `git log origin/staging..HEAD --oneline`
5. Ask: "promote these N commits to staging and main?" Wait for confirmation.

## Step 2 — Promote to staging

1. `git checkout staging`
2. `git pull --ff-only origin staging`
3. `git merge --ff-only $feat_branch`
   - If NOT fast-forwardable: STOP. Report that staging has diverged. Do NOT force. Return the user to the feat branch so they can rebase or escalate.
4. `git push origin staging`
5. Watch CI on staging:
   - `run_id=$(gh run list --branch staging --limit 1 --json databaseId --jq '.[0].databaseId')`
   - `gh run watch $run_id --exit-status` — this blocks until the run completes and exits non-zero on failure.
6. If CI fails:
   - Pull the log: `gh run view $run_id --log-failed`
   - Analyze the root cause.
   - `git checkout $feat_branch`, fix, `/ship-it`, then re-run `/sync-branches`.
   - Do NOT proceed to main promotion.
7. If the repo's CD fires on push to staging, wait for it too:
   - Identify the deploy workflow name (likely `deploy-staging` or `cd-staging` — check `.github/workflows/`).
   - Same `gh run watch --exit-status` pattern.
   - On failure: analyze, report, return to feat branch for fix. Do NOT proceed to main.

## Step 3 — Promote to main

Only if staging CI AND CD are fully green.

1. `git checkout main`
2. `git pull --ff-only origin main`
3. `git merge --ff-only staging`
4. `git push origin main`
5. Watch main CI (and CD if on-push) — same `gh run watch --exit-status` pattern.
6. If anything fails: analyze, report, return to feat branch for fix. Main being red is a higher-severity alert than staging being red — flag it explicitly to the user.

## Step 4 — Return to feat

1. `git checkout $feat_branch`
2. Optionally bring main back into feat so it stays current: ask the user first. If yes:
   - `git pull --rebase origin main`
   - `git push --force-with-lease` (safe variant, fails if someone else pushed)
3. Re-run `/bb3-doctor` after the rebase to make sure nothing broke silently (covers both BB-3 C1–C8 and Segmenter C9 checks).

## Step 5 — Report

```
## sync-branches report

Promoted:    $feat_sha (N commits)
staging CI:  [OK] green | [FAIL] <url>
staging CD:  [OK] green | [FAIL] <url>
main CI:     [OK] green | [FAIL] <url>
main CD:     [OK] green | [FAIL] <url>
feat branch: rebased onto main | unchanged

Next suggested: /bb3-next | /wave-review | fix-red
```

## Rules and guardrails

- **NEVER** force-push to `main` or `staging`. Not with `--force`, not with `--force-with-lease`, not ever. `--force-with-lease` is allowed ONLY on the feature branch after a rebase.
- **NEVER** merge with conflicts into `main` or `staging`. If a merge isn't fast-forwardable, STOP and escalate.
- **NEVER** skip CI/CD. The whole point of this skill is validation.
- **NEVER** declare "probably green" — actually wait for `gh run watch --exit-status`.
- **NEVER** use `--no-verify`, `git reset --hard` on `main`/`staging`, or any destructive operation on shared branches.
- On any failure, leave the working copy on the feature branch. Don't strand the user on `main` or `staging`.
- If the user isn't responsive and a step fails, stop and surface the failure clearly. Don't retry mechanically.

## What NOT to do

- Do NOT bypass failing CI with "I'll fix it later".
- Do NOT proceed to main promotion if staging is red.
- Do NOT rewrite history on `main` or `staging`.
- Do NOT close or dismiss failing workflow runs via `gh` — investigate them.
- Do NOT promote a feature branch that wasn't shipped through `/ship-it` (i.e. that hasn't gone through format/lint/test/build locally).
