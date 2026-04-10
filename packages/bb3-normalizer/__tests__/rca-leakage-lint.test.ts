/**
 * PH7.14 — RCA-leakage lint test.
 *
 * Spec: §3.3 A14, §12.7.
 *
 * Fails the build if any BB-3 source file contains an RCA concept
 * name (PricingProcedure, DecisionTable, CML, ContextDefinition,
 * ConstraintModelLanguage). Test files and comments are excluded
 * so the forbidden tokens can be mentioned in documentation /
 * forbidden-list assertions without tripping the lint.
 */

import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const SRC_ROOT = join(__dirname, '..', 'src');
const CONTRACT_SRC = join(__dirname, '..', '..', 'migration-ir-contract', 'src');

const FORBIDDEN_TOKENS = [
  'PricingProcedure',
  'DecisionTable',
  'ContextDefinition',
  'ConstraintModelLanguage',
] as const;

// CML is a 3-letter acronym that can overlap with unrelated code; only
// fire on word-boundary matches.
const CML_PATTERN = /\bCML\b/;

/** Recursively collect every *.ts file under `root`, excluding test files. */
function collectSourceFiles(root: string, out: string[] = []): string[] {
  let entries: string[];
  try {
    entries = readdirSync(root);
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = join(root, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (entry === 'node_modules' || entry === 'dist' || entry === '__tests__') continue;
      collectSourceFiles(full, out);
      continue;
    }
    if (!entry.endsWith('.ts')) continue;
    if (entry.endsWith('.test.ts')) continue;
    if (entry.endsWith('.property.test.ts')) continue;
    out.push(full);
  }
  return out;
}

/** Strip single-line `//` and block `/* ... *\/` comments from a source file. */
function stripComments(source: string): string {
  // Order matters: strip block comments first (they can contain `//`).
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
}

describe('PH7.14 — RCA leakage lint (A14)', () => {
  const files = [...collectSourceFiles(SRC_ROOT), ...collectSourceFiles(CONTRACT_SRC)];

  it('collected at least one source file', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  for (const token of FORBIDDEN_TOKENS) {
    it(`no source file mentions '${token}' outside of comments`, () => {
      const offenders: string[] = [];
      for (const file of files) {
        const source = readFileSync(file, 'utf8');
        const stripped = stripComments(source);
        if (stripped.includes(token)) {
          offenders.push(relative(process.cwd(), file));
        }
      }
      expect(offenders, `token '${token}' leaked into: ${offenders.join(', ')}`).toEqual([]);
    });
  }

  it("no source file mentions 'CML' as an identifier outside of comments", () => {
    const offenders: string[] = [];
    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      const stripped = stripComments(source);
      if (CML_PATTERN.test(stripped)) {
        offenders.push(relative(process.cwd(), file));
      }
    }
    expect(offenders, `CML leaked into: ${offenders.join(', ')}`).toEqual([]);
  });
});
