/**
 * Apex tree-sitter wrapper with deterministic byte/node/depth budgets.
 *
 * Spec: §8.4.
 *
 * v1.0 used wall-clock timeouts, which is a determinism bug: run A
 * parses a class in 1.8s and succeeds; run B (under load) takes 2.1s
 * and marks it unparseable — two runs produce different graphs. v1.1
 * replaces the timeout with byte / AST-node / depth budgets that are
 * functions of the input itself. Same input → same parse/skip
 * decision on every run.
 *
 * No `Date.now()`, no `setTimeout`, no `performance.now()` anywhere
 * near the parse path.
 *
 * Budget parameters and their defaults (from spec §8.4):
 *
 * - `maxBytesPerClass`   (default 200_000)    — checked before
 *                                                tree-sitter is invoked
 * - `maxNodesPerClass`   (default 50_000)     — checked during the
 *                                                visitor walk
 * - `maxDepthPerClass`   (default 50)         — checked during the
 *                                                visitor walk
 * - `globalMaxBytes`     (default 20_000_000) — running total across
 *                                                all classes in one
 *                                                normalize() call
 *
 * Failure modes are reported in the return value's `parseStatus`:
 *
 * - `'parsed'`             — clean parse + visitor completed
 * - `'partial'`            — AST or depth budget hit mid-walk
 * - `'size-limit-skipped'` — byte budget exceeded; parser never invoked
 * - `'budget-skipped'`     — global byte budget exhausted; class never attempted
 * - `'unparseable'`        — tree-sitter returned a syntax-error tree
 *
 * tree-sitter loading is lazy: the native addon is only imported
 * when a caller actually invokes `parseApexClass`. This keeps
 * importing this file cheap (important for Stage 5 skips when the
 * global budget is exhausted).
 */

import { normalizeFieldRef } from '../graph/field-ref-normalize.ts';
import type { FieldRefIR, SchemaCatalog } from '@revbrain/migration-ir-contract';

/** Per-class budget parameters. Defaults match spec §8.4. */
export interface ApexParseBudget {
  maxBytesPerClass: number;
  maxNodesPerClass: number;
  maxDepthPerClass: number;
  globalMaxBytes: number;
}

export const DEFAULT_APEX_PARSE_BUDGET: ApexParseBudget = {
  maxBytesPerClass: 200_000,
  maxNodesPerClass: 50_000,
  maxDepthPerClass: 50,
  globalMaxBytes: 20_000_000,
};

/** Mutable counter shared across a single `normalize()` run. */
export interface GlobalBudgetState {
  /** Running byte total across every class the parser has seen. */
  bytesConsumed: number;
}

export function createGlobalBudgetState(): GlobalBudgetState {
  return { bytesConsumed: 0 };
}

/** Per-class parse outcome. */
export interface ApexParseResult {
  parseStatus: 'parsed' | 'partial' | 'size-limit-skipped' | 'budget-skipped' | 'unparseable';
  /** Field refs observed during the walk. */
  fieldRefs: FieldRefIR[];
  /** Fields DML-written (for `writtenFields` on AutomationIR variants). */
  writtenFields: FieldRefIR[];
  /** True iff any dynamic ref (record.get(variable), string concat) was seen. */
  hasDynamicFieldRef: boolean;
  /** True iff the SBQQ TriggerControl pattern was detected. */
  hasTriggerControl: boolean;
  /** Count of HTTP callouts (`Http.send`, `HttpRequest.setEndpoint`, etc.). */
  calloutCount: number;
  /** Line count of the input (after split on `\n`). */
  lineCount: number;
  /** True iff `@isTest` annotation is present at class level. */
  isTestClass: boolean;
  /** Human-readable parse errors collected along the way. */
  parseErrors: string[];
}

export interface ParseApexClassOptions {
  budget?: ApexParseBudget;
  globalState: GlobalBudgetState;
  catalog?: SchemaCatalog;
  /** Target object for SBQQ rules — used when field refs omit the object. */
  rootObject?: string;
}

/**
 * Load the tree-sitter parser lazily. Returns `null` if the native
 * addon cannot be loaded (e.g. in a Deno edge function — though the
 * bb3-normalizer package isn't supposed to be imported from edge
 * code at all; this guard is belt-and-braces).
 */
interface TreeSitterModule {
  Parser: new () => TreeSitterParserInstance;
  sfapexApex: unknown;
}

interface TreeSitterParserInstance {
  setLanguage(lang: unknown): void;
  parse(source: string): TreeSitterTree;
}

interface TreeSitterTree {
  rootNode: TreeSitterNode;
}

interface TreeSitterNode {
  type: string;
  text: string;
  childCount: number;
  child(index: number): TreeSitterNode | null;
  /** tree-sitter 0.22+: `hasError` is a boolean property, not a method. */
  hasError: boolean;
}

let cachedTreeSitter: TreeSitterModule | null = null;
let treeSitterLoadFailed = false;

async function loadTreeSitter(): Promise<TreeSitterModule | null> {
  if (cachedTreeSitter) return cachedTreeSitter;
  if (treeSitterLoadFailed) return null;
  try {
    // Dynamic imports so the native addon is not loaded at module
    // init — callers that skip the parse path (budget exhausted)
    // never pay the cost.
    const [tsMod, apexMod] = await Promise.all([
      import('tree-sitter'),
      import('tree-sitter-sfapex'),
    ]);
    // `tree-sitter-sfapex` exports `{ apex, soql, sosl }`.
    const apex =
      (apexMod as { apex?: unknown; default?: { apex?: unknown } }).apex ??
      (apexMod as { default?: { apex?: unknown } }).default?.apex;
    if (!apex) {
      treeSitterLoadFailed = true;
      return null;
    }
    const Parser = (tsMod as { default?: unknown }).default ?? tsMod;
    cachedTreeSitter = {
      Parser: Parser as unknown as new () => TreeSitterParserInstance,
      sfapexApex: apex,
    };
    return cachedTreeSitter;
  } catch {
    treeSitterLoadFailed = true;
    return null;
  }
}

/**
 * Count lines deterministically — splitting on `\n` is portable and
 * matches Salesforce's own line counter.
 */
function countLines(source: string): number {
  if (source.length === 0) return 0;
  let count = 1;
  for (let i = 0; i < source.length; i++) {
    if (source.charCodeAt(i) === 10 /* \n */) count++;
  }
  return count;
}

/**
 * Cheap pre-parse heuristics. We run these regardless of whether
 * tree-sitter loads, so the return value is always useful.
 */
function preParseSignals(source: string): {
  hasTriggerControl: boolean;
  isTestClass: boolean;
  calloutCount: number;
} {
  // `SBQQ.TriggerControl` — CPQ's native trigger bypass pattern.
  const hasTriggerControl = /\bSBQQ\.TriggerControl\b/.test(source);
  // `@isTest` at class level. We don't differentiate class-level vs
  // method-level here — BB-5 only needs the boolean.
  const isTestClass = /@isTest\b/i.test(source);
  // HTTP callout marker — any of `Http.send`, `HttpRequest`, or `HttpResponse`.
  const calloutRe = /\bHttp(?:Request|Response)?\s*[.\(]/g;
  let calloutCount = 0;
  let m: RegExpExecArray | null;
  while ((m = calloutRe.exec(source)) !== null) {
    void m;
    calloutCount++;
  }
  return { hasTriggerControl, isTestClass, calloutCount };
}

/**
 * Static field-ref extraction from raw Apex source via regex. Used
 * as a fallback when tree-sitter fails to load (pure-JS environments,
 * CI boxes without node-gyp) — better than emitting nothing, while
 * still being deterministic.
 *
 * Patterns:
 *
 * - `Obj.Field__c`          — direct field ref
 * - `Obj.Rel__r.Path.Field` — path ref
 * - `record.get('Field__c')` with a string literal — resolved
 * - `record.get(variable)`  — dynamic, flagged
 */
function extractFieldRefsViaRegex(
  source: string,
  context: { catalog?: SchemaCatalog; rootObject?: string }
): { refs: FieldRefIR[]; writtenFields: FieldRefIR[]; hasDynamic: boolean } {
  const refs: FieldRefIR[] = [];
  const writtenFields: FieldRefIR[] = [];
  let hasDynamic = false;

  // `Ident.Ident` chains with `__c` or `__r` markers.
  const fieldChainRe =
    /\b([A-Za-z_][A-Za-z0-9_]*(?:__[cr])?)\.([A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*(?:__[cr])?)/g;
  const seen = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = fieldChainRe.exec(source)) !== null) {
    const whole = `${m[1]!}.${m[2]!}`;
    if (seen.has(whole)) continue;
    seen.add(whole);
    // Skip common Apex system types — they're not schema fields.
    if (
      /^(System|Database|Trigger|Limits|DateTime|Http|SObject|Apex|Set|Map|List|Integer|Decimal|String|Boolean|Blob|Id|Schema|UserInfo|Test)\./.test(
        whole
      )
    ) {
      continue;
    }
    const ref = normalizeFieldRef(whole, {
      ...(context.catalog !== undefined && { catalog: context.catalog }),
      ...(context.rootObject !== undefined && { contextObject: context.rootObject }),
    });
    refs.push(ref);
  }

  // `record.get('Field__c')` — resolved case.
  const getStringRe = /\.\s*get\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  while ((m = getStringRe.exec(source)) !== null) {
    const field = m[1]!;
    refs.push(
      normalizeFieldRef(field, {
        ...(context.catalog !== undefined && { catalog: context.catalog }),
        ...(context.rootObject !== undefined && { contextObject: context.rootObject }),
      })
    );
  }

  // `record.get(variable)` — dynamic case.
  const getVarRe = /\.\s*get\s*\(\s*([A-Za-z_][A-Za-z0-9_]*)\s*\)/g;
  while ((m = getVarRe.exec(source)) !== null) {
    hasDynamic = true;
    const hint = m[1]!;
    refs.push(
      normalizeFieldRef('<dynamic>', {
        ...(context.rootObject !== undefined && { contextObject: context.rootObject }),
      })
    );
    void hint;
  }

  // `.put('Field__c', value)` — written field (DML-adjacent).
  const putRe = /\.\s*put\s*\(\s*['"]([^'"]+)['"]\s*,/g;
  while ((m = putRe.exec(source)) !== null) {
    writtenFields.push(
      normalizeFieldRef(m[1]!, {
        ...(context.catalog !== undefined && { catalog: context.catalog }),
        ...(context.rootObject !== undefined && { contextObject: context.rootObject }),
      })
    );
  }

  return { refs, writtenFields, hasDynamic };
}

/**
 * Walk a tree-sitter AST with node/depth budgets. Only used when
 * tree-sitter loaded successfully. Returns whether the walk completed.
 */
function walkAst(
  root: TreeSitterNode,
  budget: Pick<ApexParseBudget, 'maxNodesPerClass' | 'maxDepthPerClass'>,
  visit: (node: TreeSitterNode, depth: number) => void
): { complete: boolean; nodesVisited: number } {
  interface Frame {
    node: TreeSitterNode;
    depth: number;
    childIdx: number;
  }
  const stack: Frame[] = [{ node: root, depth: 0, childIdx: 0 }];
  let nodesVisited = 0;

  while (stack.length > 0) {
    const frame = stack[stack.length - 1]!;
    if (frame.childIdx === 0) {
      // First time visiting this node.
      nodesVisited++;
      if (nodesVisited > budget.maxNodesPerClass) return { complete: false, nodesVisited };
      if (frame.depth > budget.maxDepthPerClass) {
        stack.pop();
        continue;
      }
      visit(frame.node, frame.depth);
    }
    if (frame.childIdx < frame.node.childCount) {
      const child = frame.node.child(frame.childIdx);
      frame.childIdx++;
      if (child) {
        stack.push({ node: child, depth: frame.depth + 1, childIdx: 0 });
      }
    } else {
      stack.pop();
    }
  }
  return { complete: true, nodesVisited };
}

/**
 * Parse one Apex class body and extract field refs, dynamic-ref
 * flags, callout counts, and test-class markers. Never throws.
 */
export async function parseApexClass(
  source: string,
  options: ParseApexClassOptions
): Promise<ApexParseResult> {
  const budget = options.budget ?? DEFAULT_APEX_PARSE_BUDGET;
  const { globalState } = options;

  const lineCount = countLines(source);
  const signals = preParseSignals(source);

  const base: ApexParseResult = {
    parseStatus: 'parsed',
    fieldRefs: [],
    writtenFields: [],
    hasDynamicFieldRef: false,
    hasTriggerControl: signals.hasTriggerControl,
    calloutCount: signals.calloutCount,
    lineCount,
    isTestClass: signals.isTestClass,
    parseErrors: [],
  };

  // Budget gate: global cap.
  if (globalState.bytesConsumed >= budget.globalMaxBytes) {
    base.parseStatus = 'budget-skipped';
    return base;
  }
  // Budget gate: per-class size cap.
  if (source.length > budget.maxBytesPerClass) {
    base.parseStatus = 'size-limit-skipped';
    globalState.bytesConsumed += source.length;
    return base;
  }

  // Record the byte cost before attempting to parse — it's the same
  // either way.
  globalState.bytesConsumed += source.length;

  // Always run the cheap regex extraction. It's cheap, deterministic,
  // and produces useful data even when tree-sitter is unavailable.
  const regexRefs = extractFieldRefsViaRegex(source, {
    ...(options.catalog !== undefined && { catalog: options.catalog }),
    ...(options.rootObject !== undefined && { rootObject: options.rootObject }),
  });
  base.fieldRefs.push(...regexRefs.refs);
  base.writtenFields.push(...regexRefs.writtenFields);
  if (regexRefs.hasDynamic) base.hasDynamicFieldRef = true;

  // Try the tree-sitter path for a richer walk. If the addon is not
  // available, we fall back to the regex results above and mark the
  // result as `partial` since we don't have a full AST view.
  const ts = await loadTreeSitter();
  if (!ts) {
    base.parseStatus = 'partial';
    base.parseErrors.push('tree-sitter-sfapex unavailable; using regex fallback');
    return base;
  }

  try {
    const parser = new ts.Parser();
    parser.setLanguage(ts.sfapexApex);
    const tree = parser.parse(source);

    if (tree.rootNode.hasError) {
      base.parseStatus = 'unparseable';
      base.parseErrors.push('tree-sitter parse tree has error nodes');
      return base;
    }

    // Walk the AST under the budgets. We don't do a full visitor
    // extraction here — the regex pass already captured the bulk of
    // what BB-3 needs. The walk's job for PH2.5 is to exercise the
    // deterministic budget and prove the AST is well-formed.
    const walk = walkAst(tree.rootNode, budget, () => {
      // No-op visitor in PH2.5 — per-node extraction is a PH5.1
      // concern where the AutomationIR dispatcher lives.
    });

    if (!walk.complete) {
      base.parseStatus = 'partial';
      base.parseErrors.push(
        `AST budget exhausted after ${walk.nodesVisited} nodes (max ${budget.maxNodesPerClass})`
      );
    }
  } catch (e) {
    base.parseStatus = 'unparseable';
    base.parseErrors.push(`tree-sitter threw: ${String(e)}`);
  }

  return base;
}
