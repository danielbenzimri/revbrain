/**
 * Worker-level segmenter wrapper.
 *
 * Spec: docs/MIGRATION-SEGMENTER-DESIGN.md §10.
 * Task: SEG-4.3.
 *
 * Thin wrapper around `segment()` that logs a summary.
 * The worker decides whether/where to persist the result.
 */

import type { IRGraph, SegmentResult, SegmenterOptions } from '@revbrain/migration-ir-contract';
import { segment } from '@revbrain/migration-segmenter';

/**
 * Run the segmenter on an IRGraph and log a summary.
 */
export async function runSegment(
  graph: IRGraph,
  options?: SegmenterOptions
): Promise<SegmentResult> {
  const result = await segment(graph, options);
  const m = result.manifest;

  console.log(`\n=== Segmenter Summary ===`);
  console.log(
    `  Segments:       ${m.realSegmentCount} real + ${m.virtualSegmentCount} virtual = ${m.segmentCount} total`
  );
  console.log(`  Waves:          ${m.waveCount}`);
  console.log(`  Islands:        ${m.islandCount}`);
  console.log(`  Dependencies:   ${m.crossSegmentDependencyCount}`);
  console.log(`  Cycle merges:   ${m.crossSegmentCycleMergeCount}`);
  console.log(`  Hazards:        ${m.coordinationHazards.length}`);
  console.log(
    `  Histogram:      ${m.sizeHistogram.singleton} singleton, ${m.sizeHistogram.small} small, ${m.sizeHistogram.medium} medium, ${m.sizeHistogram.large} large, ${m.sizeHistogram.xlarge} xlarge`
  );
  console.log(`  Duration:       ${result.runtimeStats.durationMs.toFixed(1)} ms`);

  if (result.diagnostics.length > 0) {
    console.log(`\n  Diagnostics (${result.diagnostics.length}):`);
    for (const d of result.diagnostics.slice(0, 20)) {
      console.log(`    [${d.severity.toUpperCase()}] ${d.code}: ${d.message}`);
    }
    if (result.diagnostics.length > 20) {
      console.log(`    ... and ${result.diagnostics.length - 20} more`);
    }
  }

  // Show first 10 non-singleton segments
  const notable = m.segments.filter((s) => !s.isVirtual && s.nodeCount > 1).slice(0, 10);
  if (notable.length > 0) {
    console.log(`\n  Top segments (by size):`);
    for (const s of notable) {
      console.log(
        `    wave ${s.migrationOrder} | ${String(s.nodeCount).padStart(4)} nodes | ${s.label}`
      );
    }
  }

  return result;
}
