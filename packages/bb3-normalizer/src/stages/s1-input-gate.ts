/**
 * Stage 1 — Input gate.
 *
 * Spec: §6.1 Stage 1, §10.1 (hard-fail policy).
 *
 * Per-finding safe-parse with Zod. Malformed findings end up in
 * quarantine with a structured reason; the pipeline continues. The
 * only hard-fail conditions are:
 *
 * - The top-level input is not an array → `BB3InputError`.
 * - The malformed-finding rate exceeds `options.maxInvalidRate`
 *   (default 10 %) → `BB3InputError` summarizing the sample.
 *
 * Both conditions match spec §10.1's v1.1 bounded hard-fail list.
 */

import { AssessmentFindingSchema, type AssessmentFindingInput } from '@revbrain/contract';
import {
  BB3InputError,
  type Diagnostic,
  type QuarantineEntry,
} from '@revbrain/migration-ir-contract';

export interface InputGateOptions {
  /** Fraction of findings that may fail Zod safe-parse before hard-fail fires. */
  maxInvalidRate: number;
  /** When true, elevate quarantine entries to a hard fail. */
  strict: boolean;
}

export interface InputGateResult {
  validFindings: AssessmentFindingInput[];
  quarantine: QuarantineEntry[];
  diagnostics: Diagnostic[];
}

export const DEFAULT_INPUT_GATE_OPTIONS: InputGateOptions = {
  maxInvalidRate: 0.1,
  strict: false,
};

/**
 * Safe-parse every input finding. Non-array inputs are rejected.
 */
export function inputGate(
  findings: unknown,
  options: InputGateOptions = DEFAULT_INPUT_GATE_OPTIONS
): InputGateResult {
  if (!Array.isArray(findings)) {
    throw new BB3InputError('BB-3 input is not an array', {
      code: 'BB3_IG001',
      actualType: typeof findings,
    });
  }

  const validFindings: AssessmentFindingInput[] = [];
  const quarantine: QuarantineEntry[] = [];
  const diagnostics: Diagnostic[] = [];

  for (const raw of findings) {
    const parsed = AssessmentFindingSchema.safeParse(raw);
    if (parsed.success) {
      validFindings.push(parsed.data);
      continue;
    }

    // Figure out why the finding failed. If the missing field is
    // `findingKey`, flag as 'missing-required-field'; otherwise
    // 'malformed-shape'.
    const issues = parsed.error.issues;
    const missingFindingKey = issues.some(
      (i) =>
        i.path.length === 1 &&
        i.path[0] === 'findingKey' &&
        (i.code === 'invalid_type' || i.code === 'too_small')
    );

    const findingKey =
      typeof raw === 'object' && raw !== null && 'findingKey' in raw
        ? String((raw as { findingKey: unknown }).findingKey)
        : '<unknown>';
    const artifactType =
      typeof raw === 'object' && raw !== null && 'artifactType' in raw
        ? String((raw as { artifactType: unknown }).artifactType)
        : '<unknown>';

    quarantine.push({
      findingKey,
      artifactType,
      reason: missingFindingKey ? 'missing-required-field' : 'malformed-shape',
      detail: issues.map((i) => `${i.path.join('.') || '<root>'}: ${i.message}`).join('; '),
      raw,
    });

    diagnostics.push({
      severity: 'warning',
      stage: 'input-gate',
      code: missingFindingKey ? 'BB3_Q001' : 'BB3_Q002',
      message: `finding quarantined: ${missingFindingKey ? 'missing-required-field' : 'malformed-shape'}`,
      findingKey,
    });
  }

  // Invalid-rate gate.
  const totalInputs = findings.length;
  if (totalInputs > 0) {
    const invalidRate = quarantine.length / totalInputs;
    if (invalidRate > options.maxInvalidRate) {
      throw new BB3InputError(
        `input invalid rate ${(invalidRate * 100).toFixed(1)}% exceeds max ${(options.maxInvalidRate * 100).toFixed(1)}%`,
        {
          code: 'BB3_IG002',
          totalInputs,
          invalidCount: quarantine.length,
          invalidRate,
          sampleReasons: quarantine.slice(0, 5).map((q) => q.reason),
        }
      );
    }
  }

  if (options.strict && quarantine.length > 0) {
    throw new BB3InputError(`strict mode: ${quarantine.length} finding(s) failed safe-parse`, {
      code: 'BB3_IG003',
      quarantine,
    });
  }

  return { validFindings, quarantine, diagnostics };
}
