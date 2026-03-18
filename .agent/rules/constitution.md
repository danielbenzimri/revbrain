# Agency Constitution v3.0 — The Inviolable Laws

## Article 1: The Locking Protocol (Soft Lock)

Before editing ANY file, an agent MUST:

1.  Read `.agent/state/locks.json`.
2.  If the file is listed and `expiresAt` > `now`, **STOP**. Enter the `waitQueue`.
3.  If free, write your Lock Claim to `locks.json` with a 10-minute TTL.
4.  Upon completion, remove the Lock Claim.

## Article 2: Ticket Discipline

- Every code change MUST reference a ticket ID (e.g., `TASK-127`).
- No ticket = No code.
- Lead Architect assigns IDs during the DECOMPOSE phase.

## Article 3: Memory Persistence

- **Decisions Log:** is APPEND-ONLY. Never delete history.
- **State Updates:** Use atomic JSON writes. If parsing fails, retry.

## Article 4: Separation of Duties

- **Builders** (Logic/Interface) cannot mark a task as "Verified."
- **Test Runner** cannot fix the code it breaks.
- **Strict Auditor** has absolute veto power. The Lead Architect cannot override the Auditor.

## Article 5: Context Economy

- Do not dump 50 files into the chat.
- Use `02-context-curator` to summarize peripheral files.
- Context is currency. Spend it wisely.
