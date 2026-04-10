/**
 * Diagnostic — BB-3's telemetry surface to callers.
 *
 * Spec: §5.3 (Diagnostic), §10.4 (validator emits diagnostics).
 *
 * Every diagnostic carries a machine-readable `code` (e.g. `'BB3_Q001'`)
 * and a `stage` enum so downstream consumers can filter and aggregate.
 * The human-readable `message` is for logs and UI; the `code` is the
 * stable handle for programmatic handling.
 *
 * The diagnostic code registry lives with the validator (PH3.9); this
 * file only defines the shape.
 */

/**
 * Pipeline stage that produced a diagnostic. Matches the internal
 * pipeline stages (§6.1).
 */
export type DiagnosticStage =
  | 'input-gate'
  | 'group-index'
  | 'normalize'
  | 'resolve-refs'
  | 'parse-code'
  | 'detect-cycles'
  | 'build-index'
  | 'validate'
  | 'assemble';

export type DiagnosticSeverity = 'error' | 'warning' | 'info';

/**
 * One diagnostic entry. Either attached to a specific finding, a
 * specific node, or neither (graph-level).
 */
export interface Diagnostic {
  severity: DiagnosticSeverity;
  stage: DiagnosticStage;
  /** Stable machine-readable code, e.g. `'BB3_Q001'`. */
  code: string;
  message: string;
  /** Set when the diagnostic is tied to a specific input finding. */
  findingKey?: string;
  /** Set when the diagnostic is tied to a specific output node. */
  nodeId?: string;
}
