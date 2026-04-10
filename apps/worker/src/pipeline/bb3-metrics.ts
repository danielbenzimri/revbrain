/**
 * PH8.3 — Worker metrics sink for BB-3 `runtimeStats`.
 *
 * Spec: docs/MIGRATION-PLANNER-BB3-DESIGN.md §6.4 runtimeStats, §6.2 determinism.
 *
 * Emits wall-clock BB-3 timings + stage-level durations via the
 * existing pino-based worker logger. Stays strictly outside the
 * `IRGraph` — `runtimeStats` is sidecar telemetry, never on the graph.
 *
 * The actual log emission uses a minimal `Logger` interface so the
 * caller can pass either pino or a test stub. The helper does not
 * import pino directly; that keeps this module unit-testable
 * without mocking pino's transports.
 */

import type { NormalizeResult } from '@revbrain/bb3-normalizer';

/** Minimal logger contract compatible with pino and test doubles. */
export interface Logger {
  info: (payload: Record<string, unknown>, msg: string) => void;
  warn?: (payload: Record<string, unknown>, msg: string) => void;
  error?: (payload: Record<string, unknown>, msg: string) => void;
}

export interface BB3MetricsEvent {
  event: 'bb3_normalize_complete';
  bb3Version: string;
  durationMs: number;
  totalFindingsIn: number;
  totalNodesOut: number;
  quarantineCount: number;
  /** Per-stage durations in the canonical spec order. */
  stageDurations: Record<string, number>;
  /** Node counts by nodeType — useful for distribution dashboards. */
  nodeTypeCounts: Record<string, number>;
  /** Counts of error / warning / info diagnostics. */
  diagnosticCounts: { error: number; warning: number; info: number };
  /** Count of quarantine entries by reason. */
  quarantineByReason: Record<string, number>;
}

/**
 * Flatten a `NormalizeResult` into a structured metrics event.
 */
export function summarizeNormalizeResult(result: NormalizeResult): BB3MetricsEvent {
  const stageDurations: Record<string, number> = {};
  for (const sd of result.runtimeStats.stageDurations) {
    stageDurations[sd.stage] = (stageDurations[sd.stage] ?? 0) + sd.durationMs;
  }

  const nodeTypeCounts: Record<string, number> = {};
  for (const node of result.graph.nodes) {
    nodeTypeCounts[node.nodeType] = (nodeTypeCounts[node.nodeType] ?? 0) + 1;
  }

  const diagnosticCounts = { error: 0, warning: 0, info: 0 };
  for (const d of result.diagnostics) {
    diagnosticCounts[d.severity] = (diagnosticCounts[d.severity] ?? 0) + 1;
  }

  const quarantineByReason: Record<string, number> = {};
  for (const q of result.quarantine) {
    quarantineByReason[q.reason] = (quarantineByReason[q.reason] ?? 0) + 1;
  }

  return {
    event: 'bb3_normalize_complete',
    bb3Version: result.runtimeStats.bb3Version,
    durationMs: result.runtimeStats.durationMs,
    totalFindingsIn: result.runtimeStats.totalFindingsIn,
    totalNodesOut: result.runtimeStats.totalNodesOut,
    quarantineCount: result.runtimeStats.quarantineCount,
    stageDurations,
    nodeTypeCounts,
    diagnosticCounts,
    quarantineByReason,
  };
}

/**
 * Emit the summarized metrics event to the worker logger.
 */
export function emitBB3Metrics(result: NormalizeResult, logger: Logger): void {
  const event = summarizeNormalizeResult(result);
  logger.info(event as unknown as Record<string, unknown>, 'bb3_normalize_complete');
}
