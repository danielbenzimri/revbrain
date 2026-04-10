/**
 * Lint guard: prevents independent counting of metrics covered by ReportCounts.
 *
 * The assembler must use `counts.X` for all metrics in ReportCounts.
 * This test scans assembler.ts source for forbidden patterns that would
 * independently re-count findings for metrics already in ReportCounts.
 *
 * See: docs/CPQ-REPORT-V4-MITIGATION-PLAN.md — Task V3
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const ASSEMBLER_PATH = resolve(__dirname, '../../src/report/assembler.ts');

describe('ReportCounts lint guard', () => {
  const source = readFileSync(ASSEMBLER_PATH, 'utf-8');

  // Strip the lines that define ReportCounts computation (between the two markers)
  // We only want to flag USAGE of independent counting AFTER counts are built
  const countsEndMarker = 'const reportCounts: ReportCounts = {';
  const countsEndIdx = source.indexOf(countsEndMarker);

  // Get only lines after reportCounts is defined (the consumer code)
  const consumerCode = countsEndIdx > 0 ? source.slice(countsEndIdx) : '';

  // Forbidden patterns: independently counting metrics covered by ReportCounts
  // These patterns match `findings.filter(f => f.artifactType === 'X').length`
  // for artifact types whose counts belong in ReportCounts.
  const FORBIDDEN_PATTERNS: Array<{ pattern: RegExp; metric: string }> = [
    {
      pattern: /findings\.filter\([^)]*artifactType\s*===\s*['"]Product2['"][^)]*\)\.length/g,
      metric: 'totalProducts / activeProducts (use counts.totalProducts or counts.activeProducts)',
    },
    {
      pattern:
        /findings\.filter\([^)]*artifactType\s*===\s*['"]UserAdoption['"][^)]*\)\??\.\w+Value/g,
      metric: 'activeUsers (use counts.activeUsers)',
    },
  ];

  for (const { pattern, metric } of FORBIDDEN_PATTERNS) {
    it(`does not independently count ${metric} in consumer code`, () => {
      const matches = consumerCode.match(pattern);
      expect(
        matches,
        `Found forbidden pattern for ${metric} in assembler.ts consumer code. ` +
          `Use counts.X instead of independently counting findings.\n` +
          `Matches: ${matches?.join('\n') ?? 'none'}`
      ).toBeNull();
    });
  }

  it('exports ReportCounts interface with required fields', () => {
    expect(source).toContain('export interface ReportCounts');
    expect(source).toContain('totalProducts: number');
    expect(source).toContain('activeProducts: number');
    expect(source).toContain('activeProductSource:');
    expect(source).toContain('bundleProducts: number');
    expect(source).toContain('productOptions: number');
    expect(source).toContain('productFamilies: number');
    expect(source).toContain('activeUsers: number');
    expect(source).toContain('activeUsersSource:');
    expect(source).toContain('sbaaInstalled: boolean');
    expect(source).toContain('approvalRuleCount: number');
    expect(source).toContain('flowCountActive: number');
    expect(source).toContain('validationRuleCount: number');
    expect(source).toContain('apexClassCount: number');
    expect(source).toContain('triggerCount: number');
  });

  it('adds counts to ReportData interface', () => {
    expect(source).toContain('counts: ReportCounts');
  });
});
