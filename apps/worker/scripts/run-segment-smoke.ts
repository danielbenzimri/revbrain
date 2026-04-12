#!/usr/bin/env npx tsx
/**
 * Segmenter smoke test — runs BB-3 normalize + segment on cached
 * staging findings and prints the manifest summary.
 *
 * Task: SEG-4.3.
 *
 * Usage:
 *   npx tsx apps/worker/scripts/run-segment-smoke.ts \
 *     [--input=apps/worker/output/assessment-results.json]
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AssessmentFindingInput } from '@revbrain/contract';
import { normalize } from '@revbrain/bb3-normalizer';
import { runSegment } from '../src/pipeline/run-segment.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function main() {
  const inputArg = process.argv.find((a) => a.startsWith('--input='));
  const inputPath = inputArg
    ? inputArg.split('=')[1]!
    : resolve(__dirname, '../output/assessment-results.json');

  console.log('=== Segmenter Smoke Test ===\n');
  console.log(`Input: ${inputPath}`);

  // Load findings
  const raw = JSON.parse(readFileSync(inputPath, 'utf-8'));
  const findings: AssessmentFindingInput[] = raw.findings ?? [];
  console.log(`Findings: ${findings.length}`);

  // Run BB-3 normalize
  console.log('\nRunning BB-3 normalize()...');
  const bb3Result = await normalize(findings, {
    extractedAt: '2026-04-12T00:00:00Z',
    maxInvalidRate: 1,
  });
  console.log(`  Nodes: ${bb3Result.graph.nodes.length}`);
  console.log(`  Edges: ${bb3Result.graph.edges.length}`);

  // Run segmenter
  console.log('\nRunning segment()...');
  const segResult = await runSegment(bb3Result.graph);

  // Save manifest
  const outputPath = resolve(__dirname, '../output/segment-manifest.json');
  writeFileSync(outputPath, JSON.stringify(segResult.manifest, null, 2));
  console.log(`\nManifest saved: ${outputPath}`);

  // Validation
  console.log('\n=== Validation ===');
  const m = segResult.manifest;
  const ok = (test: string, pass: boolean) => console.log(`  ${pass ? '[OK]' : '[FAIL]'} ${test}`);

  ok('segmentCount > 0', m.segmentCount > 0);
  ok('realSegmentCount > 0', m.realSegmentCount > 0);
  ok(
    'histogram sums to realSegmentCount',
    m.sizeHistogram.singleton +
      m.sizeHistogram.small +
      m.sizeHistogram.medium +
      m.sizeHistogram.large +
      m.sizeHistogram.xlarge ===
      m.realSegmentCount
  );
  ok('waveWeights.length === waveCount', m.waveWeights.length === m.waveCount);
  ok(
    'all nodes assigned',
    Object.keys(segResult.assignment.nodeToSegment).length === bb3Result.graph.nodes.length
  );
  ok(
    'no error diagnostics',
    segResult.diagnostics.filter((d) => d.severity === 'error').length === 0
  );
  ok('segment IDs unique', new Set(m.segments.map((s) => s.id)).size === m.segments.length);

  console.log('\nDone.');
}

main().catch((err) => {
  console.error('FATAL:', err);
  process.exit(1);
});
