/**
 * AutomationIR — discriminated union of the 5 automation variants.
 *
 * Spec: §5.3 (v1.2 rewrite, Auditor 3 P2 #10).
 *
 * v1.0/v1.1 had a single flat interface with Apex-specific fields
 * (`lineCount`, `calloutCount`, `hasTriggerControl`) that did not
 * apply to Flow / WorkflowRule / OutboundMessage nodes — which forced
 * dummy zero-values on declarative automation and muddied the
 * ontology. v1.2 splits the union so each variant carries only the
 * fields that actually make sense for its automation class.
 *
 * Consumers doing exhaustive `switch (node.sourceType)` get full
 * type narrowing; the Apex-specific fields disappear from the Flow
 * branch entirely.
 *
 * NOTE: `IRNodeBase` is defined in `./nodes.ts` and imported here to
 * avoid a circular dependency between nodes.ts and automation.ts.
 * `AutomationIRBase` is NOT exported — only the 5 variants and the
 * union are part of the public surface. This matches the spec's
 * "package-private base" convention.
 */

import type { IRNodeBase } from './nodes.ts';
import type { FieldRefIR } from './field-ref.ts';
import type { NodeRef } from './node-ref.ts';

/** Shared fields on every AutomationIR variant. */
interface AutomationIRBase extends IRNodeBase {
  nodeType: 'Automation';
  /**
   * Fields read from SBQQ / sbaa / blng managed objects — the
   * high-signal subset used by downstream consumers to decide
   * CPQ-coupling. Non-empty for every automation that touches CPQ
   * objects.
   */
  sbqqFieldRefs: FieldRefIR[];
  /** All fields written, regardless of namespace. */
  writtenFields: FieldRefIR[];
  /** Pricing rules and config constraints related to this automation. */
  relatedRules: NodeRef[];
}

/** Parse status shared by Apex class and Apex trigger variants. */
export type ApexParseStatus =
  | 'parsed'
  | 'partial'
  | 'unparseable'
  | 'size-limit-skipped'
  | 'budget-skipped';

/** Apex class (top-level class OR inner class in the extraction). */
export interface ApexClassAutomationIR extends AutomationIRBase {
  sourceType: 'ApexClass';
  lineCount: number;
  /** Heuristic count of HTTP callouts detected in the body. */
  calloutCount: number;
  /** Uses the SBQQ.TriggerControl pattern — known migration foot-gun. */
  hasTriggerControl: boolean;
  /** String-concatenated field refs — not statically resolvable. */
  hasDynamicFieldRef: boolean;
  /**
   * True iff `@isTest` annotation is present. Test classes are
   * preserved for G1 coverage but BB-5 dispositions them as
   * `no-migration-needed`.
   */
  isTestClass: boolean;
  parseStatus: ApexParseStatus;
  parseErrors: string[];
}

/** Apex trigger. Always bound to exactly one sObject. */
export interface ApexTriggerAutomationIR extends AutomationIRBase {
  sourceType: 'ApexTrigger';
  /** Required — a trigger always has a target. */
  triggerObject: string;
  triggerEvents: ('insert' | 'update' | 'delete' | 'undelete')[];
  lineCount: number;
  hasTriggerControl: boolean;
  hasDynamicFieldRef: boolean;
  parseStatus: ApexParseStatus;
  parseErrors: string[];
}

/**
 * Declarative Flow.
 *
 * NOTE: no `lineCount` / `calloutCount` / `hasTriggerControl` —
 * those are procedural concepts that do not apply to flows. The
 * correct Flow metrics are element counts, flow type, and
 * `activeVersionNumber`.
 */
export interface FlowAutomationIR extends AutomationIRBase {
  sourceType: 'Flow';
  flowType:
    | 'screen'
    | 'autolaunched'
    | 'record-triggered'
    | 'scheduled'
    | 'platform-event'
    | 'unknown';
  /** Non-null when the flow is active; null otherwise. */
  activeVersionNumber: number | null;
  /** Count of each element kind: `{decision: 3, assignment: 5, ...}`. */
  elementCounts: Record<string, number>;
  /** For record-triggered flows only — null otherwise. */
  triggerObject: string | null;
  /** For record-triggered flows only — null otherwise. */
  triggerEvents: ('create' | 'update' | 'create-or-update' | 'delete')[] | null;
  /**
   * Flows are captured as metadata XML, not textValue. v1 emits
   * Flow nodes with `parseStatus: 'metadata-only'` — no body-level
   * parsing.
   */
  parseStatus: 'metadata-only' | 'partial';
}

/** Legacy workflow rule — formula-based field update / email / task trigger. */
export interface WorkflowRuleAutomationIR extends AutomationIRBase {
  sourceType: 'WorkflowRule';
  targetObject: string;
  evaluationCriteria:
    | 'on-create'
    | 'on-create-or-update'
    | 'on-create-or-triggered-on-edit'
    | 'unknown';
  /** Raw criteria formula if non-trivial. */
  criteriaFormula: string | null;
  /** Field-update actions the rule performs. */
  fieldUpdates: Array<{ field: FieldRefIR; newValue: string | null }>;
  isActive: boolean;
}

/** Outbound message — fires an HTTP POST on a record change. */
export interface OutboundMessageAutomationIR extends AutomationIRBase {
  sourceType: 'OutboundMessage';
  /** Endpoint URL configured in the outbound message metadata. */
  endpointUrl: string;
  /** The sObject whose events fire this message. */
  targetObject: string;
  /** Fields included in the SOAP envelope. */
  fieldsSent: FieldRefIR[];
  /** True iff any WorkflowRule or Flow references this outbound message. */
  isActive: boolean;
}

/**
 * Discriminated union over `sourceType`. Exhaustive `switch`
 * statements against `sourceType` type-check without a default.
 */
export type AutomationIR =
  | ApexClassAutomationIR
  | ApexTriggerAutomationIR
  | FlowAutomationIR
  | WorkflowRuleAutomationIR
  | OutboundMessageAutomationIR;

/**
 * The `sourceType` discriminator values, as a closed union. Used by
 * the normalizer dispatcher (PH3.4) and the validator.
 */
export type AutomationSourceType = AutomationIR['sourceType'];
