/**
 * Salesforce formula recursive-descent parser.
 *
 * Spec: §8.5.
 *
 * Parses Salesforce formula expressions into a minimal AST and
 * extracts the field references — that's all BB-3 needs; it does
 * not evaluate formulas.
 *
 * Grammar (simplified):
 *
 *   expr        := logical
 *   logical     := comparison ( ('&&' | '||') comparison )*
 *   comparison  := additive ( ('==' | '!=' | '<' | '<=' | '>' | '>=') additive )*
 *   additive    := multiplicative ( ('+' | '-' | '&') multiplicative )*
 *   multiplicative := unary ( ('*' | '/') unary )*
 *   unary       := ('!' | '-' | '+')* primary
 *   primary     := literal | identifier-or-call | '(' expr ')'
 *   literal     := number | string | 'TRUE' | 'FALSE' | 'NULL'
 *   identifier-or-call := dotted-ident ( '(' arg-list ')' )?
 *   dotted-ident := IDENT ( '.' IDENT )*
 *   arg-list    := expr ( ',' expr )*
 *
 * No wall-clock timeouts: termination is bounded by a strict
 * depth-and-node budget (`MAX_DEPTH`, `MAX_NODES`). Exceeding the
 * budget returns a `'partial'` parse with whatever refs were
 * collected up to that point.
 *
 * On hard parse failure: returns `parseStatus: 'unparseable'` with
 * empty `referencedFields` and `parseErrors` describing the spot.
 * No throws. BB-3 must never crash on a malformed formula.
 */

import { normalizeFieldRef } from '../graph/field-ref-normalize.ts';
import type { FieldRefIR, SchemaCatalog } from '@revbrain/migration-ir-contract';

/**
 * Minimal FormulaIR shape used by BB-3 stages and consumers. The
 * contract package's full `FormulaIR` type will be defined in PH4;
 * until then we own a compatible shape locally to avoid a cross-task
 * dependency.
 */
export interface FormulaParseResult {
  raw: string;
  referencedFields: FieldRefIR[];
  referencedObjects: string[];
  hasCrossObjectRef: boolean;
  hasGlobalVariableRef: boolean;
  complexity: 'simple' | 'moderate' | 'complex';
  parseStatus: 'parsed' | 'partial' | 'unparseable';
  parseErrors: string[];
}

export interface FormulaParseContext {
  rootObject?: string;
  catalog?: SchemaCatalog;
}

/** Deterministic parser budgets. */
const MAX_DEPTH = 128;
const MAX_NODES = 10_000;

interface Tok {
  kind: 'ident' | 'number' | 'string' | 'punct' | 'global' | 'end';
  value: string;
  pos: number;
}

/** Tokenize a formula string. Deliberately permissive — unknown chars become PUNCT. */
function tokenize(src: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    const ch = src[i]!;

    // Whitespace
    if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') {
      i++;
      continue;
    }

    // Global variable (`$User`, `$Profile`, etc.)
    if (ch === '$') {
      let j = i + 1;
      while (j < src.length && /[A-Za-z_]/.test(src[j]!)) j++;
      out.push({ kind: 'global', value: src.slice(i, j), pos: i });
      i = j;
      continue;
    }

    // Identifier (can start with letter or underscore)
    if (/[A-Za-z_]/.test(ch)) {
      let j = i + 1;
      while (j < src.length && /[A-Za-z0-9_]/.test(src[j]!)) j++;
      out.push({ kind: 'ident', value: src.slice(i, j), pos: i });
      i = j;
      continue;
    }

    // Number: digits, optional dot, more digits, optional exponent.
    if (/[0-9]/.test(ch)) {
      let j = i + 1;
      while (j < src.length && /[0-9]/.test(src[j]!)) j++;
      if (src[j] === '.') {
        j++;
        while (j < src.length && /[0-9]/.test(src[j]!)) j++;
      }
      if (src[j] === 'e' || src[j] === 'E') {
        j++;
        if (src[j] === '+' || src[j] === '-') j++;
        while (j < src.length && /[0-9]/.test(src[j]!)) j++;
      }
      out.push({ kind: 'number', value: src.slice(i, j), pos: i });
      i = j;
      continue;
    }

    // String literal: `"..."` or `'...'` with `\` escapes.
    if (ch === '"' || ch === "'") {
      const quote = ch;
      let j = i + 1;
      while (j < src.length && src[j] !== quote) {
        if (src[j] === '\\' && j + 1 < src.length) j += 2;
        else j++;
      }
      // Include closing quote if present; skip it cleanly.
      if (j < src.length) j++;
      out.push({ kind: 'string', value: src.slice(i, j), pos: i });
      i = j;
      continue;
    }

    // Punctuation — accept multi-char operators.
    const two = src.slice(i, i + 2);
    if (
      two === '==' ||
      two === '!=' ||
      two === '<=' ||
      two === '>=' ||
      two === '&&' ||
      two === '||'
    ) {
      out.push({ kind: 'punct', value: two, pos: i });
      i += 2;
      continue;
    }
    out.push({ kind: 'punct', value: ch, pos: i });
    i++;
  }
  out.push({ kind: 'end', value: '', pos: src.length });
  return out;
}

/** Parser state — shared across the descent. */
interface State {
  tokens: Tok[];
  pos: number;
  depth: number;
  nodeCount: number;
  budgetExhausted: boolean;
  errors: string[];
  refs: FieldRefIR[];
  objects: Set<string>;
  hasGlobal: boolean;
  hasCrossObject: boolean;
  ctx: FormulaParseContext;
}

function peek(s: State): Tok {
  return s.tokens[s.pos]!;
}
function eat(s: State): Tok {
  const t = s.tokens[s.pos]!;
  s.pos++;
  return t;
}
function expectPunct(s: State, value: string): boolean {
  const t = peek(s);
  if (t.kind === 'punct' && t.value === value) {
    eat(s);
    return true;
  }
  s.errors.push(`expected '${value}' at position ${t.pos}, got '${t.value}' (${t.kind})`);
  return false;
}
function bump(s: State): boolean {
  s.nodeCount++;
  if (s.nodeCount > MAX_NODES) {
    s.budgetExhausted = true;
    return false;
  }
  return true;
}
function enter(s: State): boolean {
  s.depth++;
  if (s.depth > MAX_DEPTH) {
    s.budgetExhausted = true;
    return false;
  }
  return true;
}
function exit(s: State): void {
  s.depth--;
}

/** Parse the top-level expression. */
function parseExpr(s: State): void {
  if (!enter(s) || !bump(s)) return;
  parseLogical(s);
  exit(s);
}

function parseLogical(s: State): void {
  parseComparison(s);
  while (!s.budgetExhausted) {
    const t = peek(s);
    if (t.kind === 'punct' && (t.value === '&&' || t.value === '||')) {
      eat(s);
      parseComparison(s);
    } else {
      break;
    }
  }
}

function parseComparison(s: State): void {
  parseAdditive(s);
  while (!s.budgetExhausted) {
    const t = peek(s);
    if (
      t.kind === 'punct' &&
      (t.value === '==' ||
        t.value === '!=' ||
        t.value === '<' ||
        t.value === '<=' ||
        t.value === '>' ||
        t.value === '>=' ||
        t.value === '=')
    ) {
      eat(s);
      parseAdditive(s);
    } else {
      break;
    }
  }
}

function parseAdditive(s: State): void {
  parseMultiplicative(s);
  while (!s.budgetExhausted) {
    const t = peek(s);
    if (t.kind === 'punct' && (t.value === '+' || t.value === '-' || t.value === '&')) {
      eat(s);
      parseMultiplicative(s);
    } else {
      break;
    }
  }
}

function parseMultiplicative(s: State): void {
  parseUnary(s);
  while (!s.budgetExhausted) {
    const t = peek(s);
    if (t.kind === 'punct' && (t.value === '*' || t.value === '/' || t.value === '^')) {
      eat(s);
      parseUnary(s);
    } else {
      break;
    }
  }
}

function parseUnary(s: State): void {
  const t = peek(s);
  if (t.kind === 'punct' && (t.value === '!' || t.value === '-' || t.value === '+')) {
    eat(s);
    parseUnary(s);
    return;
  }
  parsePrimary(s);
}

function parsePrimary(s: State): void {
  if (!enter(s) || !bump(s)) return;
  const t = peek(s);

  // Literals
  if (t.kind === 'number' || t.kind === 'string') {
    eat(s);
    exit(s);
    return;
  }

  // Parenthesized expr
  if (t.kind === 'punct' && t.value === '(') {
    eat(s);
    parseExpr(s);
    expectPunct(s, ')');
    exit(s);
    return;
  }

  // Global: $User.Id, $Profile.Name, etc.
  if (t.kind === 'global') {
    eat(s);
    s.hasGlobal = true;
    // Consume the trailing dotted path but don't record it as a field ref —
    // globals aren't schema fields.
    while (peek(s).kind === 'punct' && peek(s).value === '.') {
      eat(s);
      const next = peek(s);
      if (next.kind === 'ident') eat(s);
      else break;
    }
    exit(s);
    return;
  }

  // Identifier — could be a keyword, a function call, or a field ref.
  if (t.kind === 'ident') {
    const first = eat(s);
    const upper = first.value.toUpperCase();

    // Boolean/null literals
    if (upper === 'TRUE' || upper === 'FALSE' || upper === 'NULL') {
      exit(s);
      return;
    }

    // Collect a dotted chain.
    const chain: string[] = [first.value];
    while (peek(s).kind === 'punct' && peek(s).value === '.') {
      eat(s);
      const next = peek(s);
      if (next.kind === 'ident') {
        chain.push(next.value);
        eat(s);
      } else {
        s.errors.push(`expected identifier after '.' at position ${next.pos}`);
        break;
      }
    }

    // Function call?
    if (peek(s).kind === 'punct' && peek(s).value === '(') {
      eat(s);
      // Parse args until ')'.
      while (!s.budgetExhausted && peek(s).kind !== 'end') {
        const nt = peek(s);
        if (nt.kind === 'punct' && nt.value === ')') {
          eat(s);
          exit(s);
          return;
        }
        parseExpr(s);
        if (peek(s).kind === 'punct' && peek(s).value === ',') {
          eat(s);
        }
      }
      s.errors.push('unterminated function call');
      exit(s);
      return;
    }

    // Not a call — it's a field reference. Emit a normalized FieldRefIR.
    const joined = chain.join('.');
    const ref = normalizeFieldRef(joined, {
      contextObject: s.ctx.rootObject,
      ...(s.ctx.catalog !== undefined && { catalog: s.ctx.catalog }),
    });
    s.refs.push(ref);
    if (ref.kind === 'path') {
      s.hasCrossObject = true;
      s.objects.add(ref.rootObject);
    } else {
      s.objects.add(ref.object);
    }
    exit(s);
    return;
  }

  // Unknown token — consume to make progress and record an error.
  s.errors.push(`unexpected token '${t.value}' (${t.kind}) at position ${t.pos}`);
  if (t.kind !== 'end') eat(s);
  exit(s);
}

/**
 * Classify formula complexity by AST node count. These thresholds
 * are intentionally loose — BB-5 uses them as a heuristic only.
 */
function classifyComplexity(nodeCount: number): 'simple' | 'moderate' | 'complex' {
  if (nodeCount <= 5) return 'simple';
  if (nodeCount <= 25) return 'moderate';
  return 'complex';
}

/**
 * Parse a Salesforce formula expression. Never throws.
 */
export function parseFormula(raw: string, context: FormulaParseContext = {}): FormulaParseResult {
  if (typeof raw !== 'string' || raw.trim() === '') {
    return {
      raw: raw ?? '',
      referencedFields: [],
      referencedObjects: [],
      hasCrossObjectRef: false,
      hasGlobalVariableRef: false,
      complexity: 'simple',
      parseStatus: 'unparseable',
      parseErrors: ['empty or non-string input'],
    };
  }

  const state: State = {
    tokens: tokenize(raw),
    pos: 0,
    depth: 0,
    nodeCount: 0,
    budgetExhausted: false,
    errors: [],
    refs: [],
    objects: new Set(),
    hasGlobal: false,
    hasCrossObject: false,
    ctx: context,
  };

  try {
    parseExpr(state);
  } catch (e) {
    // Should be unreachable — all failure modes append to state.errors.
    state.errors.push(`internal: ${String(e)}`);
  }

  // Unconsumed tokens (other than end) suggest malformed input.
  const remaining = state.tokens.length - 1 - state.pos;
  if (remaining > 0 && peek(state).kind !== 'end') {
    state.errors.push(`${remaining} trailing token(s) after top-level expression`);
  }

  const cleanFailure = state.refs.length === 0 && state.errors.length > 0 && !state.budgetExhausted;

  let parseStatus: FormulaParseResult['parseStatus'];
  if (state.budgetExhausted) parseStatus = 'partial';
  else if (cleanFailure) parseStatus = 'unparseable';
  else if (state.errors.length > 0) parseStatus = 'partial';
  else parseStatus = 'parsed';

  return {
    raw,
    referencedFields: state.refs,
    referencedObjects: [...state.objects].sort(),
    hasCrossObjectRef: state.hasCrossObject,
    hasGlobalVariableRef: state.hasGlobal,
    complexity: classifyComplexity(state.nodeCount),
    parseStatus,
    parseErrors: state.errors,
  };
}
