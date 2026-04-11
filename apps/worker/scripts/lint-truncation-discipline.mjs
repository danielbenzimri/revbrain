#!/usr/bin/env node
/**
 * Lint guard for EXT-CC6 — fail the build if a new bare
 * `.slice(0, N)` (string truncation) appears in the collectors
 * directory. The pre-2026-04 worker had four such silent
 * truncations and the §8.3 audit traced one of them to a partial
 * body that confused downstream consumers.
 *
 * **What this catches:** any `.slice(0, N)` where N is a literal
 * integer, UNLESS the line carries an inline sentinel comment
 * `allow-slice:` with a short reason. The sentinel pattern
 * replaces the pre-2026-04-11 line-number allowlist which rot
 * constantly as prettier/eslint-fix reformatted the collectors.
 *
 * **How to opt out a legitimate site:**
 *
 *   const topN = records.slice(0, 5); // allow-slice: top-N array bound
 *
 * The reason is free-text after `allow-slice:`. Any non-empty
 * reason passes the lint; empty reasons fail. This keeps the
 * opt-out visible at the call site instead of in a separate
 * registry.
 *
 * Run via `node apps/worker/scripts/lint-truncation-discipline.mjs`
 * — the worker `lint` script invokes it as part of the chain.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const COLLECTORS_DIR = new URL('../src/collectors/', import.meta.url).pathname;

const SLICE_PATTERN = /\.slice\(\s*0\s*,\s*\d+\s*\)/;
const ALLOW_MARKER = /\/\/\s*allow-slice:\s*\S+/;

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
    // The pattern may match on a single line (literal slice) OR
    // across multiple lines (e.g. method chain). The sentinel can
    // appear on the same line OR on the line immediately above,
    // which supports both inline and "comment-above" opt-outs.
    if (ALLOW_MARKER.test(line)) return;
    const prev = idx > 0 ? lines[idx - 1] : '';
    if (ALLOW_MARKER.test(prev)) return;
    violations.push({ file: rel, line: idx + 1, snippet: line.trim() });
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
    '\nFix by either:\n' +
      '  (a) use `truncateWithFlag` from `apps/worker/src/lib/truncate.ts` and propagate\n' +
      '      the wasTruncated flag onto the produced evidenceRef, or\n' +
      '  (b) add an inline sentinel `// allow-slice: <reason>` on the matching line\n' +
      '      (or the line immediately above) documenting why it is safe. The reason\n' +
      '      text is free-form but must be non-empty.\n'
  );
  process.exit(1);
}

console.log('EXT-CC6 truncation-discipline lint: OK');
