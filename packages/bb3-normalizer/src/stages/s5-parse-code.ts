/**
 * Stage 5 — Code parsing orchestrator.
 *
 * Spec: §6.1 Stage 5, §8.4, §8.5, §8.7.
 *
 * Drives the Apex, formula, and SOQL parsers for every draft node
 * that carries parseable source. This stage does NOT mutate nodes
 * in place — it returns a per-node result that Stage 6 / Stage 7
 * later weave back into the graph.
 *
 * The global Apex byte budget is tracked across every class the
 * orchestrator sees. Classes are processed in `developerName` order
 * so which classes get skipped under budget pressure is itself
 * deterministic (§8.4).
 *
 * QCP scripts (`CustomComputationIR`) are deliberately NOT parsed —
 * they are deferred to BB-3b. The orchestrator emits a
 * `'deferred-to-bb3b'` marker and moves on.
 */

import type { IRNodeBase } from '@revbrain/migration-ir-contract';
import {
  createGlobalBudgetState,
  DEFAULT_APEX_PARSE_BUDGET,
  parseApexClass,
  type ApexParseBudget,
  type ApexParseResult,
  type GlobalBudgetState,
} from '../parsers/apex.ts';
import { parseFormula, type FormulaParseResult } from '../parsers/formula.ts';
import { extractSoqlFieldRefs, type SoqlExtractResult } from '../parsers/soql.ts';
import type { CatalogContext } from './s2-5-schema-catalog.ts';

/**
 * Input contract: a draft node that carries parseable source and
 * some metadata telling Stage 5 which parser to invoke.
 *
 * Real per-type normalizers will surface these via type-specific
 * fields; PH3.6's orchestrator is schema-agnostic so that the
 * normalizers in PH4/PH5 can ship independently.
 */
export interface ParseableDraft {
  nodeId: string;
  /** Which parser to run. */
  kind: 'apex' | 'formula' | 'soql' | 'qcp';
  source: string;
  /** Used for deterministic ordering and as a fallback identity. */
  developerName: string;
  /** Optional root object for field-ref resolution. */
  rootObject?: string;
}

export interface ParseCodeOptions {
  budget?: ApexParseBudget;
  catalog: CatalogContext;
}

export type ParseOutcome =
  | { nodeId: string; kind: 'apex'; result: ApexParseResult }
  | { nodeId: string; kind: 'formula'; result: FormulaParseResult }
  | { nodeId: string; kind: 'soql'; result: SoqlExtractResult }
  | { nodeId: string; kind: 'qcp'; deferred: true; lineCount: number };

export interface ParseCodeResult {
  outcomes: ParseOutcome[];
  globalBudget: GlobalBudgetState;
}

/**
 * Stage 5 entry point. Processes drafts in `(kind, developerName)`
 * order so both the outcome list and the global-budget decisions
 * are reproducible.
 */
export async function parseCode(
  drafts: readonly ParseableDraft[],
  options: ParseCodeOptions
): Promise<ParseCodeResult> {
  const budget = options.budget ?? DEFAULT_APEX_PARSE_BUDGET;
  const globalBudget = createGlobalBudgetState();

  // Deterministic ordering: apex first (the only kind touched by the
  // global byte budget), then formulas, then soql, then qcp. Within
  // each kind, sort by developerName so skip decisions are stable.
  const kindOrder: ParseableDraft['kind'][] = ['apex', 'formula', 'soql', 'qcp'];
  const sorted = [...drafts].sort((a, b) => {
    const k = kindOrder.indexOf(a.kind) - kindOrder.indexOf(b.kind);
    if (k !== 0) return k;
    return a.developerName < b.developerName ? -1 : a.developerName > b.developerName ? 1 : 0;
  });

  const outcomes: ParseOutcome[] = [];

  for (const draft of sorted) {
    if (draft.kind === 'apex') {
      const result = await parseApexClass(draft.source, {
        budget,
        globalState: globalBudget,
        ...(options.catalog.catalog !== null && { catalog: options.catalog.catalog }),
        ...(draft.rootObject !== undefined && { rootObject: draft.rootObject }),
      });
      outcomes.push({ nodeId: draft.nodeId, kind: 'apex', result });
      continue;
    }

    if (draft.kind === 'formula') {
      const result = parseFormula(draft.source, {
        ...(draft.rootObject !== undefined && { rootObject: draft.rootObject }),
        ...(options.catalog.catalog !== null && { catalog: options.catalog.catalog }),
      });
      outcomes.push({ nodeId: draft.nodeId, kind: 'formula', result });
      continue;
    }

    if (draft.kind === 'soql') {
      const result = extractSoqlFieldRefs(draft.source, {
        ...(options.catalog.catalog !== null && { catalog: options.catalog.catalog }),
      });
      outcomes.push({ nodeId: draft.nodeId, kind: 'soql', result });
      continue;
    }

    // kind === 'qcp' — defer to BB-3b.
    let lineCount = 0;
    for (let i = 0; i < draft.source.length; i++) {
      if (draft.source.charCodeAt(i) === 10) lineCount++;
    }
    if (draft.source.length > 0) lineCount++;
    outcomes.push({
      nodeId: draft.nodeId,
      kind: 'qcp',
      deferred: true,
      lineCount,
    });
  }

  return { outcomes, globalBudget };
}

/**
 * Convenience: produce a `Map<nodeId, ParseOutcome>` for fast
 * attachment to draft nodes by downstream stages.
 */
export function indexOutcomes(result: ParseCodeResult): Map<string, ParseOutcome> {
  const idx = new Map<string, ParseOutcome>();
  for (const o of result.outcomes) idx.set(o.nodeId, o);
  return idx;
}

// Re-export for callers that want to thread their own budget through.
export { DEFAULT_APEX_PARSE_BUDGET } from '../parsers/apex.ts';
export type { IRNodeBase };
