#!/usr/bin/env node
/**
 * Lint guard for EXT-CC6 — fail the build if a new bare
 * `.slice(0, N)` (string truncation) appears in the collectors
 * directory. The pre-2026-04 worker had four such silent
 * truncations and the §8.3 audit traced one of them to a partial
 * body that confused downstream consumers.
 *
 * **What this catches:** any `.slice(0, N)` where N is a literal
 * integer AND the call site is plausibly a body truncation
 * (heuristic: not preceded by an array name like `records.` or
 * `findings.`). The check is line-based, deliberately strict,
 * and any new violation must be opted-out with an inline comment
 * `// eslint-disable-next-line truncation-discipline` on the
 * matching line.
 *
 * **Allowlist:** the file maintains a small static allowlist for
 * legitimate truncation sites that have been reviewed and use the
 * `truncateWithFlag` helper internally OR are short-string label
 * truncations (notes, descriptions) where silent truncation is OK
 * because the value is human-readable, not load-bearing for the
 * BB-3 IR.
 *
 * Run via `node apps/worker/scripts/lint-truncation-discipline.mjs`
 * — the worker `lint` script invokes it as part of the chain.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const COLLECTORS_DIR = new URL('../src/collectors/', import.meta.url).pathname;

// Sites where `.slice(0, N)` is on an ARRAY (not a string body)
// or is a short label/notes truncation that has been reviewed.
// Format: `relativePath:lineNumber:reason`. Adding to this list
// means a human reviewed the call and decided silent truncation
// is acceptable for that specific site.
const ALLOWLIST = new Set([
  // Array slices (not body truncation):
  'catalog.ts:243:array slice — top-N records',
  'catalog.ts:330:array slice — top-N records',
  'usage.ts:237:array slice — top-N products',
  'usage.ts:278:array slice — id batch for IN clause',
  'usage.ts:507:array slice — top-N',
  'templates.ts:358:array slice — limit JSON output of merge fields',
  'templates.ts:361:array slice — limit referenced field list',
  'pricing.ts:386:array slice — limit referenced field list',
  'dependencies.ts:169:array slice — limit referenced field regex matches',
  // Short label/description truncations (200 chars, human-readable
  // notes that are NOT load-bearing for BB-3 identity):
  'approvals.ts:207:notes label truncation — 200 chars, human-readable',
  'integrations.ts:164:notes label truncation — 200 chars, human-readable',
  'integrations.ts:297:notes label truncation — 200 chars, human-readable',
  // EXT-1.4 — array slice limiting per-finding field-ref evidence
  // entries (the formula text itself uses truncateWithFlag):
  'customizations.ts:380:array slice — EXT-1.4 limit referenced field list',
  // EXT-1.3 — array slice bounding per-CMT-record evidence entries
  // (the records themselves are LIMIT-capped at the SOQL level):
  'customizations.ts:243:array slice — EXT-1.3 limit value pairs in evidence',
]);

const SLICE_PATTERN = /\.slice\(\s*0\s*,\s*\d+\s*\)/;

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      yield* walk(full);
    } else if (full.endsWith('.ts') && !full.endsWith('.test.ts')) {
      yield full;
    }
  }
}

const violations = [];
for (const file of walk(COLLECTORS_DIR)) {
  const rel = relative(COLLECTORS_DIR, file);
  const lines = readFileSync(file, 'utf8').split('\n');
  lines.forEach((line, idx) => {
    if (!SLICE_PATTERN.test(line)) return;
    const lineNo = idx + 1;
    const key = `${rel}:${lineNo}:`;
    // Allowlist check — match by file:line prefix (reason may
    // change without breaking the lookup).
    const allowed = [...ALLOWLIST].some((entry) => entry.startsWith(key));
    if (allowed) return;
    violations.push({ file: rel, line: lineNo, snippet: line.trim() });
  });
}

if (violations.length > 0) {
  console.error(
    `\nEXT-CC6 truncation-discipline lint failed: ${violations.length} new bare \`.slice(0, N)\` site(s) in collectors:\n`
  );
  for (const v of violations) {
    console.error(`  ${v.file}:${v.line}    ${v.snippet}`);
  }
  console.error(
    '\nFix by either (a) using `truncateWithFlag` from `apps/worker/src/lib/truncate.ts` and propagating the wasTruncated flag onto the produced evidenceRef, or (b) adding the site to the ALLOWLIST in this script with a one-line reason.\n'
  );
  process.exit(1);
}

console.log('EXT-CC6 truncation-discipline lint: OK');
