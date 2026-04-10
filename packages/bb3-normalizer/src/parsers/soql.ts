/**
 * SOQL SELECT field-ref extractor.
 *
 * Spec: §8.4 visitor rules, §7.2 LookupQuery row.
 *
 * Extracts the SELECT list and FROM clause from a SOQL query string
 * and normalizes each field reference. Designed for two callers:
 *
 * 1. `SBQQ__LookupQuery__c.SBQQ__Query__c` — CPQ lookup queries
 *    stored as configuration.
 * 2. Apex inline SOQL — the Apex visitor hands the raw query string
 *    here after tree-sitter identifies it.
 *
 * Not a full SOQL parser. Supports:
 *
 * - `SELECT f1, f2, Account__r.Name FROM Obj`
 * - Basic subquery in the FROM position — ignored (can't recurse).
 * - WHERE clauses — scanned for additional field refs.
 * - Whitespace and newlines inside the query.
 *
 * Does NOT support:
 *
 * - Aggregate functions (`COUNT`, `SUM`, etc.) — returned as a
 *   literal "AGG(field)" ref with `hint`.
 * - Binding variables (`:accountId`) — filtered out.
 *
 * On parse failure: returns a result with `parseStatus: 'unparseable'`
 * and an empty `selectFields` array.
 */

import { normalizeFieldRef } from '../graph/field-ref-normalize.ts';
import type { FieldRefIR, SchemaCatalog } from '@revbrain/migration-ir-contract';

export interface SoqlExtractResult {
  /** The FROM-clause object name (e.g. `'SBQQ__Quote__c'`), or `null` if unparseable. */
  fromObject: string | null;
  /** Field refs extracted from the SELECT list. */
  selectFields: FieldRefIR[];
  /** Field refs extracted from the WHERE clause (if any). */
  whereFields: FieldRefIR[];
  parseStatus: 'parsed' | 'partial' | 'unparseable';
}

interface ExtractOptions {
  catalog?: SchemaCatalog;
}

const SELECT_RE = /\bSELECT\b([\s\S]*?)\bFROM\b/i;
const FROM_RE = /\bFROM\s+([A-Za-z_][\w]*)/i;
const WHERE_RE = /\bWHERE\b([\s\S]*?)(?:\bGROUP\b|\bORDER\b|\bLIMIT\b|\bOFFSET\b|$)/i;

/**
 * Split a SELECT list on commas, respecting nested parentheses
 * (so `COUNT(Id)` is one entry, not two).
 */
function splitSelectList(selectList: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = '';
  for (const ch of selectList) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) {
      parts.push(current.trim());
      current = '';
      continue;
    }
    current += ch;
  }
  if (current.trim().length > 0) parts.push(current.trim());
  return parts;
}

/**
 * Pull simple field-like tokens out of a WHERE clause. This is a
 * heuristic — it looks for identifiers that look like object.field
 * patterns and ignores literals, operators, and bind variables.
 */
function extractWhereTokens(whereClause: string): string[] {
  // Strip string literals so field-like substrings inside them don't leak.
  const noStrings = whereClause.replace(/'(?:\\'|[^'])*'/g, "''");
  // Strip bind variables `:foo`.
  const noBinds = noStrings.replace(/:\w+/g, '');
  // Split on non-identifier characters, keep only tokens that look
  // like field references.
  const candidates = noBinds.split(/[\s(),=<>!&|]+/).filter((t) => t.length > 0);
  return candidates.filter((t) => /^[A-Za-z][\w]*(?:\.[A-Za-z][\w]*)*$/.test(t));
}

/**
 * Extract field refs from a SOQL SELECT query.
 */
export function extractSoqlFieldRefs(
  rawSoql: string,
  options: ExtractOptions = {}
): SoqlExtractResult {
  // Normalize whitespace to collapse newlines / multiple spaces.
  const query = rawSoql.replace(/\s+/g, ' ').trim();

  const selectMatch = query.match(SELECT_RE);
  const fromMatch = query.match(FROM_RE);

  if (!selectMatch || !fromMatch) {
    return {
      fromObject: null,
      selectFields: [],
      whereFields: [],
      parseStatus: 'unparseable',
    };
  }

  const fromObject = fromMatch[1]!;
  const selectListRaw = selectMatch[1]!.trim();

  const selectFields: FieldRefIR[] = [];
  const selectParts = splitSelectList(selectListRaw);
  let partialSelect = false;

  for (const part of selectParts) {
    // Subquery: `(SELECT Id FROM Children)` — not recursed. Mark partial.
    if (part.startsWith('(')) {
      partialSelect = true;
      continue;
    }
    // Aggregate: `COUNT(Id)`, `SUM(Amount)` — extract the inner ref.
    const aggMatch = part.match(/^(\w+)\s*\(([^)]*)\)$/);
    if (aggMatch) {
      const inner = aggMatch[2]!.trim();
      if (inner && inner !== '*') {
        const ref = normalizeFieldRef(inner, {
          contextObject: fromObject,
          catalog: options.catalog,
        });
        ref.hint = `aggregate:${aggMatch[1]!.toLowerCase()}`;
        selectFields.push(ref);
      }
      continue;
    }
    // Plain field or path.
    selectFields.push(
      normalizeFieldRef(part, {
        contextObject: fromObject,
        catalog: options.catalog,
      })
    );
  }

  // WHERE clause: pull out field-like tokens.
  const whereFields: FieldRefIR[] = [];
  const whereMatch = query.match(WHERE_RE);
  if (whereMatch) {
    const tokens = extractWhereTokens(whereMatch[1]!);
    for (const token of tokens) {
      // Skip SOQL keywords / boolean literals.
      const lower = token.toLowerCase();
      if (
        lower === 'null' ||
        lower === 'true' ||
        lower === 'false' ||
        lower === 'and' ||
        lower === 'or' ||
        lower === 'not' ||
        lower === 'in' ||
        lower === 'like'
      ) {
        continue;
      }
      whereFields.push(
        normalizeFieldRef(token, {
          contextObject: fromObject,
          catalog: options.catalog,
        })
      );
    }
  }

  return {
    fromObject,
    selectFields,
    whereFields,
    parseStatus: partialSelect ? 'partial' : 'parsed',
  };
}
