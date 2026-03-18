# Rollback Procedure (Disaster Recovery)

## Trigger Condition

- Production Incident declared.
- "Severe Regression" flagged by User.

## Steps

1. [HALT] Lead Architect locks all files. Global Freeze.
2. [IDENTIFY] Locate the bad commit hash from `decisions.log`.
3. [REVERT] `git revert <hash>`.
4. [VERIFY] Test Runner runs full regression suite.
5. [AUDIT] Strict Auditor checks the revert state.
6. [SHIP] Push Revert.
7. [POST-MORTEM] Create new Ticket "Incident Analysis". Unfreeze.
