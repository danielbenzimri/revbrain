/**
 * Per-ID Tooling-API `Metadata` fetch helper (EXT-1.4 + EXT-1.6).
 *
 * The Tooling API enforces a HARD ONE-ROW limit on any query
 * that selects the `Metadata` or `FullName` columns. The error
 * message caught by a real-staging run on 2026-04-11:
 *
 *   MALFORMED_QUERY: When retrieving results with Metadata or
 *   FullName fields, the query qualifications must specify no
 *   more than one row for retrieval. Result size: 10
 *
 * The pre-2026-04-11-wave-3 implementation used a chunk-of-10
 * pattern based on the v1.1 audit's "conservative 10-25"
 * guidance, which was WRONG: Salesforce's actual limit is 1
 * row per query — no retry, no batch, no exception. EXT-1.4
 * (validation rule formulas) and EXT-1.6 (flow XML) both failed
 * against real data until the chunk size was changed to 1.
 *
 * So we issue ONE query per ID. That means 25 SOQL calls for
 * 25 validation rules, 13 for 13 flows. These are small N so
 * the per-call overhead is acceptable (the API budget is
 * bounded by the input cardinality, not quadratic).
 *
 * **Why "chunk" is still in the name:** the internal loop
 * still groups by `chunkSize` so callers can bump the default
 * if SF ever relaxes the limit. Default MUST stay 1 until
 * Salesforce ships a change.
 *
 * **Why a shared helper:** EXT-1.4 (validation rule formulas)
 * and EXT-1.6 (flow XML bodies) both need this exact pattern,
 * just with different object names. Sharing the helper means:
 *   - one place to fix the limit if SF changes it
 *   - one place to handle retry / partial-failure semantics
 *   - one place to add metrics/logging
 *
 * **Why this lives in `salesforce/` not `lib/`:** the helper
 * binds to a `RestApi.toolingQuery` instance and the SF-specific
 * error semantics. It is not a generic chunking utility.
 *
 * Per-chunk failure mode: continue. The helper logs each chunk's
 * failure as a warning and returns the partial map. Callers can
 * inspect `result.failedIds` to see which records were missed.
 * Total failure (every chunk fails) is treated as a hard error
 * by re-throwing the LAST chunk's error so the collector's
 * try/catch surfaces a useful diagnostic.
 */

import type { Logger } from 'pino';

// Salesforce Tooling API HARD LIMIT for Metadata column queries.
// Enforced against real staging on 2026-04-11 — changing this to
// anything > 1 will cause `MALFORMED_QUERY` errors.
export const TOOLING_METADATA_CHUNK_SIZE = 1;

export interface ToolingMetadataFetchResult<TMetadata> {
  /** id → Metadata payload (typed by the caller via the generic). */
  byId: Map<string, TMetadata>;
  /** IDs whose chunk failed and were not fetched. */
  failedIds: Set<string>;
  /** Total chunks issued (debug/metric). */
  chunksIssued: number;
}

/**
 * Minimal interface the helper needs from the caller. We don't
 * import the concrete `RestApi` type to keep this module testable
 * without an SF mock.
 */
export interface ToolingQueryFn {
  <T>(soql: string, signal?: AbortSignal): Promise<{ records: T[] }>;
}

/**
 * Fetch the Tooling API `Metadata` column for a list of records
 * by issuing chunked `SELECT Id, Metadata FROM <Object> WHERE Id
 * IN (...)` queries. Returns a Map of id → Metadata plus the set
 * of IDs whose chunk failed.
 *
 * The caller passes `extraFields` to add columns to the SELECT
 * (e.g. `['ValidationName', 'EntityDefinitionId']`). The helper
 * returns the raw row records keyed by id, so the caller can
 * pluck both `Metadata` and the extras out of the same result.
 *
 * @param objectName the SF object name (`'ValidationRule'`, `'Flow'`, etc.)
 * @param ids list of record IDs to fetch
 * @param toolingQuery a function with the same signature as
 *   `RestApi.toolingQuery`
 * @param options optional logger + signal + chunkSize override
 */
export async function fetchToolingMetadata<TRecord = Record<string, unknown>>(
  objectName: string,
  ids: readonly string[],
  toolingQuery: ToolingQueryFn,
  options: {
    extraFields?: readonly string[];
    log?: Logger;
    signal?: AbortSignal;
    chunkSize?: number;
  } = {}
): Promise<ToolingMetadataFetchResult<TRecord>> {
  const chunkSize = options.chunkSize ?? TOOLING_METADATA_CHUNK_SIZE;
  const byId = new Map<string, TRecord>();
  const failedIds = new Set<string>();
  let chunksIssued = 0;

  if (ids.length === 0) {
    return { byId, failedIds, chunksIssued };
  }

  // Stable sort + dedupe so chunks are deterministic across runs.
  const sortedIds = [...new Set(ids)].sort();
  const fields = ['Id', 'Metadata', ...(options.extraFields ?? [])];
  const fieldList = fields.join(', ');

  // Track the last error so we can re-throw if EVERY chunk fails.
  let lastError: Error | null = null;
  let successfulChunks = 0;

  for (let i = 0; i < sortedIds.length; i += chunkSize) {
    const chunk = sortedIds.slice(i, i + chunkSize);
    const idList = chunk.map((id) => `'${id}'`).join(',');
    const soql = `SELECT ${fieldList} FROM ${objectName} WHERE Id IN (${idList})`;
    chunksIssued++;
    try {
      const result = await toolingQuery<TRecord & { Id: string }>(soql, options.signal);
      successfulChunks++;
      for (const row of result.records) {
        byId.set(row.Id, row);
      }
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      for (const id of chunk) failedIds.add(id);
      options.log?.warn(
        { object: objectName, chunkSize: chunk.length, error: lastError.message },
        'tooling_metadata_chunk_failed'
      );
    }
  }

  // If EVERY chunk failed, surface the last error so the caller's
  // try/catch can degrade or fail meaningfully. A partial failure
  // (some chunks succeeded) returns the partial map silently and
  // the caller inspects `failedIds`.
  if (successfulChunks === 0 && lastError !== null) {
    throw lastError;
  }

  return { byId, failedIds, chunksIssued };
}
