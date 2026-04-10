/**
 * EvidenceBlock — the provenance contract carried on every IR node.
 *
 * Spec: §5.4.
 *
 * This is how BB-3 answers "why does this node exist and why did
 * you classify it this way?" — essential for debugging, for
 * explaining decisions to SIs, and for unit-testing normalizers.
 *
 * Invariants (enforced by the validator, §10.4):
 *
 * - `sourceFindingKeys.length ≥ 1` for every non-composite node.
 * - A `CyclicDependencyIR` node's `sourceFindingKeys` is the union
 *   of its members'.
 * - Every `FieldRefIR` in `cpqFieldsRead` / `cpqFieldsWritten`
 *   appears somewhere in the `ReferenceIndex`.
 */

import type { FieldRefIR } from './field-ref.ts';

/**
 * One classification decision the normalizer made, with the
 * reasoning preserved so SIs and unit tests can verify it.
 */
export interface ClassificationReason {
  /** Which decision this explains, e.g. `'evaluationPhase'`. */
  decision: string;
  /** Value the normalizer chose, e.g. `'on-calc'`. */
  chosenValue: string;
  /** Human-readable reason, e.g. `'SBQQ__EvaluationEvent__c = "On Calculate" -> on-calc'`. */
  reason: string;
  /** How confident the normalizer is in this classification. */
  confidence: 'high' | 'medium' | 'low';
}

/**
 * Provenance record for one IR node.
 */
export interface EvidenceBlock {
  /** `findingKey` values of every source AssessmentFinding that contributed to this node. */
  sourceFindingKeys: string[];

  /** Human-readable explanations of each classification decision this node encodes. */
  classificationReasons: ClassificationReason[];

  /** Every CPQ field this node reads from. */
  cpqFieldsRead: FieldRefIR[];

  /** Every CPQ field this node writes to. */
  cpqFieldsWritten: FieldRefIR[];

  /**
   * Source artifact IDs where applicable (Salesforce record IDs —
   * stored for traceability only, NEVER used for identity).
   */
  sourceSalesforceRecordIds: string[];

  /** Which collector(s) produced the source findings. */
  sourceCollectors: string[];
}
