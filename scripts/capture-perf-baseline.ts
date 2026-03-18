#!/usr/bin/env tsx
/**
 * Performance Baseline Capture & Comparison Script
 *
 * Runs the Playwright performance suite, parses [PERF] console output,
 * writes timestamped results to e2e/perf-baselines.json, and optionally
 * compares against the previous baseline.
 *
 * Usage:
 *   pnpm perf:baseline           # Capture new baseline
 *   pnpm perf:compare            # Capture + compare against previous
 *
 * @see docs/roadmap/speedup_tasks.md — Task 0.4
 */

import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

const BASELINE_FILE = path.resolve(__dirname, '../e2e/perf-baselines.json');
const COMPARE_MODE = process.argv.includes('--compare');

interface PerfMetric {
  value: string;
  numeric: number | null;
}

interface BaselineEntry {
  timestamp: string;
  gitRef: string;
  metrics: Record<string, PerfMetric>;
}

interface BaselineFile {
  latest: BaselineEntry;
  history: BaselineEntry[];
}

function getGitRef(): string {
  try {
    return execSync('git rev-parse --short HEAD', { encoding: 'utf-8' }).trim();
  } catch {
    return 'unknown';
  }
}

function parseNumericValue(value: string): number | null {
  // Extract numeric value from strings like "1234ms", "56.78KB", "42.5%"
  const match = value.match(/^([\d.]+)/);
  return match ? parseFloat(match[1]) : null;
}

function runPerfTests(): string {
  console.log('Running performance tests...\n');
  try {
    const output = execSync('pnpm exec playwright test --project=performance --reporter=list', {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 300_000, // 5 minute timeout
    });
    return output;
  } catch (error: unknown) {
    // Playwright may exit non-zero if tests fail, but we still want the output
    const execError = error as { stdout?: string; stderr?: string };
    const output = (execError.stdout || '') + '\n' + (execError.stderr || '');
    if (!output.includes('[PERF]')) {
      console.error('Performance tests failed with no metrics output.');
      console.error(execError.stderr || '');
      process.exit(1);
    }
    return output;
  }
}

function parsePerfMetrics(output: string): Record<string, PerfMetric> {
  const metrics: Record<string, PerfMetric> = {};
  const lines = output.split('\n');

  for (const line of lines) {
    const match = line.match(/\[PERF\]\s+(\S+?)=(.+)/);
    if (match) {
      const key = match[1];
      const value = match[2].trim();
      metrics[key] = {
        value,
        numeric: parseNumericValue(value),
      };
    }
  }

  return metrics;
}

function compareBaselines(current: BaselineEntry, previous: BaselineEntry): void {
  console.log('\n────────────────────────────────────────────────────');
  console.log('  PERFORMANCE COMPARISON');
  console.log(`  Previous: ${previous.gitRef} (${previous.timestamp})`);
  console.log(`  Current:  ${current.gitRef} (${current.timestamp})`);
  console.log('────────────────────────────────────────────────────\n');

  const allKeys = new Set([...Object.keys(previous.metrics), ...Object.keys(current.metrics)]);

  const rows: { key: string; prev: string; curr: string; delta: string }[] = [];

  for (const key of [...allKeys].sort()) {
    const prev = previous.metrics[key];
    const curr = current.metrics[key];

    if (!prev && curr) {
      rows.push({ key, prev: '—', curr: curr.value, delta: 'NEW' });
      continue;
    }
    if (prev && !curr) {
      rows.push({ key, prev: prev.value, curr: '—', delta: 'REMOVED' });
      continue;
    }
    if (!prev || !curr) continue;

    let delta = '';
    if (prev.numeric !== null && curr.numeric !== null && prev.numeric !== 0) {
      const pct = ((curr.numeric - prev.numeric) / prev.numeric) * 100;
      const sign = pct > 0 ? '+' : '';
      const indicator = pct > 5 ? ' ⬆️ SLOWER' : pct < -5 ? ' ⬇️ FASTER' : ' ↔️';
      delta = `${sign}${pct.toFixed(1)}%${indicator}`;
    }

    rows.push({ key, prev: prev.value, curr: curr.value, delta });
  }

  // Print table
  const keyWidth = Math.max(30, ...rows.map((r) => r.key.length));
  const prevWidth = Math.max(12, ...rows.map((r) => r.prev.length));
  const currWidth = Math.max(12, ...rows.map((r) => r.curr.length));

  console.log(
    `${'Metric'.padEnd(keyWidth)}  ${'Previous'.padEnd(prevWidth)}  ${'Current'.padEnd(currWidth)}  Delta`
  );
  console.log('─'.repeat(keyWidth + prevWidth + currWidth + 20));

  for (const row of rows) {
    console.log(
      `${row.key.padEnd(keyWidth)}  ${row.prev.padEnd(prevWidth)}  ${row.curr.padEnd(currWidth)}  ${row.delta}`
    );
  }

  console.log('');
}

// ── Main ──────────────────────────────────────────────

const output = runPerfTests();
const metrics = parsePerfMetrics(output);

if (Object.keys(metrics).length === 0) {
  console.error('No [PERF] metrics found in test output.');
  process.exit(1);
}

const entry: BaselineEntry = {
  timestamp: new Date().toISOString(),
  gitRef: getGitRef(),
  metrics,
};

// Load existing baselines
let baselineFile: BaselineFile;
if (fs.existsSync(BASELINE_FILE)) {
  baselineFile = JSON.parse(fs.readFileSync(BASELINE_FILE, 'utf-8'));
} else {
  baselineFile = { latest: entry, history: [] };
}

const previous = baselineFile.latest;

// Compare if requested and previous exists
if (COMPARE_MODE && previous && previous.gitRef !== 'unknown') {
  compareBaselines(entry, previous);
}

// Save — push previous latest to history, set new latest
if (baselineFile.latest.gitRef !== 'unknown') {
  baselineFile.history.push(baselineFile.latest);
  // Keep last 20 entries
  if (baselineFile.history.length > 20) {
    baselineFile.history = baselineFile.history.slice(-20);
  }
}
baselineFile.latest = entry;

fs.writeFileSync(BASELINE_FILE, JSON.stringify(baselineFile, null, 2) + '\n');

console.log(`\nBaseline saved to ${BASELINE_FILE}`);
console.log(`Captured ${Object.keys(metrics).length} metrics at ${entry.gitRef}`);

// Print metrics summary
console.log('\nMetrics:');
for (const [key, metric] of Object.entries(metrics).sort()) {
  console.log(`  ${key} = ${metric.value}`);
}
