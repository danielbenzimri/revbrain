/**
 * structuralSignature — the `developerName` workaround for CPQ
 * record-based artifacts that lack a reliable stable API name.
 *
 * Spec: §5.2 (structural content signature), §8.1.
 *
 * **v1.2 OPERATOR REMOVAL (Auditor 3 P0 #2):** the signature
 * intentionally does NOT include condition operators. Changing an
 * operator (`gt` → `gte`) is a VALUE-LEVEL edit and MUST NOT change
 * the node `id`, per acceptance test A13. The signature captures
 * the set of condition FIELDS (by name), the shape of actions, and
 * the evaluation context — the structural shape that survives
 * value-level admin tweaks.
 *
 * The signature SURVIVES (i.e. `id` is stable):
 *   ✓ rename (name is not in the signature)
 *   ✓ editing a condition's value
 *   ✓ editing a condition's operator (v1.2)
 *   ✓ reordering conditions (the field set is sorted + deduped)
 *   ✓ editing an action's value
 *
 * The signature CHANGES (i.e. the node is treated as new):
 *   ✗ adding / removing a condition (conditionCount changes)
 *   ✗ changing which field a condition compares
 *   ✗ adding / removing an action
 *   ✗ changing an action's `actionType` or `targetField`
 *   ✗ changing evaluation scope / order / context scope
 *   ✗ changing `conditionLogic`
 */

import { createHash } from 'node:crypto';
import { canonicalJson } from './canonical-json.ts';

/**
 * Minimal condition shape used for signature computation. The real
 * IR type (`PriceConditionIR`) is richer; this interface is the
 * narrow contract `structuralSignature` consumes so the helper can
 * be called from any normalizer without taking a concrete node
 * dependency.
 */
export interface StructuralSignatureCondition {
  /** Field API name the condition compares against. */
  field: string;
  /**
   * The condition's operator is INTENTIONALLY NOT part of the
   * signature. Callers MAY still pass it on the draft for
   * normalizer-internal use — the signature function ignores it.
   */
}

/** Minimal action shape used for signature computation. */
export interface StructuralSignatureAction {
  /** e.g. `'set-discount-pct'`, `'set-price'`. */
  actionType: string;
  /** Target field API name. */
  targetField: string;
}

/** Minimal rule draft shape — the union of `PricingRuleIR` fields the signature needs. */
export interface StructuralSignatureRuleDraft {
  parentObject: string;
  evaluationScope: string;
  evaluationOrder: number | null;
  conditionLogic: string;
  contextScope: string;
  conditions: StructuralSignatureCondition[];
  actions: StructuralSignatureAction[];
}

/**
 * Compute the structural signature of a CPQ record-based rule-like
 * draft. Returns a 16-character hex string (first 64 bits of a
 * SHA-256 of the canonical fingerprint).
 */
export function structuralSignature(rule: StructuralSignatureRuleDraft): string {
  // Sort + dedupe condition field names so reordering conditions
  // doesn't change the signature.
  const conditionFields = [...new Set(rule.conditions.map((c) => c.field))].sort();

  // Action shape: `${actionType}|${targetField}`, sorted.
  const actionShape = rule.actions
    .map((a) => `${a.actionType}|${a.targetField}`)
    .sort()
    .join(';');

  const fingerprint = canonicalJson({
    parentObject: rule.parentObject,
    evaluationScope: rule.evaluationScope,
    evaluationOrder: rule.evaluationOrder,
    conditionLogic: rule.conditionLogic,
    contextScope: rule.contextScope,
    conditionFields,
    conditionCount: rule.conditions.length,
    actionShape,
  });

  const digest = createHash('sha256').update(fingerprint, 'utf8').digest('hex');
  return digest.slice(0, 16);
}
