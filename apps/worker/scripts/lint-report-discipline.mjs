#!/usr/bin/env node
/**
 * Lint guard for the PDF report path — added 2026-04-11 after the
 * `enrich-and-generate.ts` shim incident, where a quarantined
 * script fabricated ~20 findings via `Math.random()` and pushed
 * them into the flat findings array before calling `renderPdf`.
 * The resulting v2.1 PDF shipped to the customer.
 *
 * This guard is the "never again" wire for that class of defect.
 * It enforces three rules:
 *
 *  R1. No `Math.random` in `apps/worker/src/report/**` or in any
 *      script under `apps/worker/scripts/` whose filename matches
 *      `*report*.ts`. The report path is deterministic —
 *      randomness in the pipeline that produces customer-facing
 *      PDFs is always a bug.
 *
 *  R2. No `findings.push(` in any `apps/worker/scripts/*report*.ts`
 *      file. Report scripts CONSUME findings; they must never
 *      SYNTHESIZE them. (The shim violated this directly.)
 *
 *  R3. `renderPdf` may only be imported from
 *      `apps/worker/scripts/generate-report.ts`. A new script
 *      calling `renderPdf` is a yellow flag — it means someone
 *      built a parallel PDF pipeline outside the audited one.
 *      Allowlist via `// allow-renderpdf: <reason>` sentinel if
 *      there is a legitimate new entry point.
 *
 * Run via `node apps/worker/scripts/lint-report-discipline.mjs`.
 * Invoked from the worker `lint` script.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, join, relative } from 'node:path';

const WORKER_ROOT = new URL('../', import.meta.url).pathname;
const REPORT_SRC = join(WORKER_ROOT, 'src/report/');
const SCRIPTS_DIR = join(WORKER_ROOT, 'scripts/');

const MATH_RANDOM = /Math\.random\s*\(/;
const FINDINGS_PUSH = /\bfindings\.push\s*\(/;
const RENDER_PDF_IMPORT = /\bimport\b[^;]*\brenderPdf\b/;
const ALLOW_RENDERPDF = /\/\/\s*allow-renderpdf:\s*\S+/;

const RENDERPDF_ALLOWLIST = new Set(['generate-report.ts']);

function* walk(dir, filter) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      yield* walk(full, filter);
    } else if (filter(full)) {
      yield full;
    }
  }
}

const violations = [];

function scan(file, rules) {
  const rel = relative(WORKER_ROOT, file);
  const lines = readFileSync(file, 'utf8').split('\n');
  lines.forEach((line, idx) => {
    for (const rule of rules) {
      if (!rule.pattern.test(line)) continue;
      if (rule.allow && rule.allow(line, idx, lines, file)) continue;
      violations.push({
        file: rel,
        line: idx + 1,
        rule: rule.id,
        snippet: line.trim(),
      });
    }
  });
}

// R1 + report src path — Math.random forbidden everywhere under src/report/
for (const file of walk(REPORT_SRC, (f) => f.endsWith('.ts') && !f.endsWith('.test.ts'))) {
  scan(file, [{ id: 'R1', pattern: MATH_RANDOM }]);
}

// R1 + report scripts + R2 + R3 — scan all *report*.ts scripts under apps/worker/scripts/
for (const file of walk(SCRIPTS_DIR, (f) => f.endsWith('.ts') && /report/i.test(basename(f)))) {
  scan(file, [
    { id: 'R1', pattern: MATH_RANDOM },
    { id: 'R2', pattern: FINDINGS_PUSH },
  ]);
}

// R3 — `renderPdf` imports restricted to allowlisted scripts under apps/worker/scripts/.
// The renderer module (`src/report/renderer.ts`) defines it; the barrel
// (`src/report/index.ts`) re-exports it. Those are legitimate producers
// and are intentionally not scanned — R3 targets new *consumer* scripts
// that could bypass the audited `generate-report.ts` entry point.
for (const file of walk(SCRIPTS_DIR, (f) => f.endsWith('.ts'))) {
  const name = basename(file);
  const rel = relative(WORKER_ROOT, file);
  const lines = readFileSync(file, 'utf8').split('\n');
  lines.forEach((line, idx) => {
    if (!RENDER_PDF_IMPORT.test(line)) return;
    if (RENDERPDF_ALLOWLIST.has(name)) return;
    const prev = idx > 0 ? lines[idx - 1] : '';
    if (ALLOW_RENDERPDF.test(line) || ALLOW_RENDERPDF.test(prev)) return;
    violations.push({
      file: rel,
      line: idx + 1,
      rule: 'R3',
      snippet: line.trim(),
    });
  });
}

if (violations.length > 0) {
  console.error(
    `\nreport-discipline lint failed: ${violations.length} violation(s) in the PDF report path:\n`
  );
  for (const v of violations) {
    console.error(`  [${v.rule}] ${v.file}:${v.line}    ${v.snippet}`);
  }
  console.error(
    '\nRules:\n' +
      '  R1  No Math.random in apps/worker/src/report/ or scripts/*report*.ts.\n' +
      '      The report path must be deterministic.\n' +
      '  R2  No findings.push() in scripts/*report*.ts. Report scripts consume\n' +
      '      findings, they must never synthesize them. (See the 2026-04-11\n' +
      '      enrich-and-generate.ts shim incident.)\n' +
      '  R3  renderPdf may only be imported from generate-report.ts.\n' +
      '      Opt out with `// allow-renderpdf: <reason>` if a new legitimate\n' +
      '      entry point is genuinely required.\n'
  );
  process.exit(1);
}

console.log('report-discipline lint: OK');
