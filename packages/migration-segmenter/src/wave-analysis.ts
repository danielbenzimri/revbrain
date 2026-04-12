/**
 * Wave weighting + sub-wave hints + size histogram.
 *
 * Spec: docs/MIGRATION-SEGMENTER-DESIGN.md §5.4, §6.4.
 * Task: SEG-2.3.
 */

import type {
  Segment,
  SizeHistogram,
  WavePlanHint,
  SegmentDiagnostic,
} from '@revbrain/migration-ir-contract';
import { SIZE_HISTOGRAM_BUCKETS } from '@revbrain/migration-ir-contract';

const B = SIZE_HISTOGRAM_BUCKETS;

/**
 * Compute wave weights, sub-wave hints, and size histogram.
 */
export function analyzeWaves(
  segments: readonly Segment[],
  waveCount: number,
  heavyWaveThreshold: number
): {
  waveWeights: number[];
  subWaveHints: WavePlanHint[];
  sizeHistogram: SizeHistogram;
  diagnostics: SegmentDiagnostic[];
} {
  const diagnostics: SegmentDiagnostic[] = [];
  const realSegments = segments.filter((s) => !s.isVirtual);

  // Wave weights (only real segments)
  const waveWeights: number[] = new Array(waveCount).fill(0);
  for (const seg of realSegments) {
    if (seg.migrationOrder >= 0 && seg.migrationOrder < waveCount) {
      waveWeights[seg.migrationOrder] += seg.weight;
    }
  }

  // Sub-wave hints for heavy waves
  const subWaveHints: WavePlanHint[] = [];
  for (let wave = 0; wave < waveCount; wave++) {
    if (waveWeights[wave]! > heavyWaveThreshold) {
      const waveSegments = realSegments
        .filter((s) => s.migrationOrder === wave)
        .sort((a, b) => b.weight - a.weight);
      subWaveHints.push({
        wave,
        orderedSegmentIds: waveSegments.map((s) => s.id),
        totalWeight: waveWeights[wave]!,
      });
      diagnostics.push({
        code: 'SEG_W003',
        severity: 'warn',
        message: `Wave ${wave} weight ${waveWeights[wave]} exceeds threshold ${heavyWaveThreshold}`,
        context: { segmentIds: waveSegments.map((s) => s.id) },
      });
    }
  }

  // Size histogram (real segments only)
  const sizeHistogram: SizeHistogram = {
    singleton: 0,
    small: 0,
    medium: 0,
    large: 0,
    xlarge: 0,
  };
  for (const seg of realSegments) {
    const n = seg.nodeCount;
    if (n === B.SINGLETON) sizeHistogram.singleton++;
    else if (n >= B.SMALL_MIN && n <= B.SMALL_MAX) sizeHistogram.small++;
    else if (n >= B.MEDIUM_MIN && n <= B.MEDIUM_MAX) sizeHistogram.medium++;
    else if (n >= B.LARGE_MIN && n <= B.LARGE_MAX) sizeHistogram.large++;
    else if (n >= B.XLARGE_MIN) sizeHistogram.xlarge++;
  }

  // Diagnostic for large segments
  for (const seg of realSegments) {
    if (seg.nodeCount > 50) {
      diagnostics.push({
        code: 'SEG_I001',
        severity: 'info',
        message: `Segment '${seg.label}' has ${seg.nodeCount} nodes`,
        context: { segmentIds: [seg.id] },
      });
    }
  }

  return { waveWeights, subWaveHints, sizeHistogram, diagnostics };
}
