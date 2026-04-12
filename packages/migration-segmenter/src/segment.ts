/**
 * Top-level `segment()` entry point.
 *
 * Spec: docs/MIGRATION-SEGMENTER-DESIGN.md §5, §6.5.
 * Task: SEG-4.2.
 *
 * Wires all 5 phases into one deterministic pipeline:
 *   Phase 1: Strong-edge union-find
 *   Phase 2: Ordering-edge SCC merge
 *   Phase 3: Topological sort → wave assignment
 *   Phase 4: Materialize segments + metadata
 *   Phase 5: Articulation analysis (large segments only)
 *
 * Then runs invariant assertions and returns `SegmentResult`.
 */

import type {
  IRGraph,
  SegmentResult,
  SegmenterOptions,
  SegmentManifest,
  SegmentDiagnostic,
  Segment,
} from '@revbrain/migration-ir-contract';
import type { IRNodeBase } from '@revbrain/migration-ir-contract';
import { validateInput } from './validate-input.ts';
import { validateOptions } from './validate-options.ts';
import { buildSegments } from './segment-core.ts';
import { assignWaves } from './topo-sort.ts';
import { materializeSegments } from './materialize.ts';
import { wireDependencies } from './dependencies.ts';
import { analyzeWaves } from './wave-analysis.ts';
import { buildCoordinationHazards, detectProductBundleOrphans } from './hazards.ts';
import { buildVirtualSegments } from './virtual-segments.ts';
import { findArticulationHints } from './articulation.ts';
import { assertInvariants } from './invariants.ts';

interface PhaseDuration {
  phase: string;
  durationMs: number;
}

function now(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

/**
 * Partition an IRGraph into migration segments.
 *
 * Pure function: same graph + same options → deterministic output
 * (excluding runtimeStats).
 */
export async function segment(graph: IRGraph, options?: SegmenterOptions): Promise<SegmentResult> {
  const startTime = now();
  const durations: PhaseDuration[] = [];
  const diagnostics: SegmentDiagnostic[] = [];
  const opts = validateOptions(options);

  // Default thresholds
  const largeSegThreshold = opts.thresholds?.largeSegment ?? 200;
  const heavyWaveThreshold = opts.thresholds?.heavyWave ?? 500;
  const maxArticulationHints = opts.thresholds?.maxArticulationHints ?? 20;

  // ---- Input validation ----
  let t = now();
  const { resolvedEdges, externalEdges, nodeIndex } = validateInput(graph);
  durations.push({ phase: 'validate', durationMs: now() - t });

  // Zero-edges diagnostic
  if (resolvedEdges.length === 0 && graph.nodes.length > 0) {
    diagnostics.push({
      code: 'SEG_W001',
      severity: 'warn',
      message: 'Zero edges in input graph — all segments will be singletons',
    });
  }

  // ---- Phase 1 + 2: Core segmentation ----
  t = now();
  const coreResult = buildSegments(graph.nodes, resolvedEdges);
  durations.push({ phase: 'core', durationMs: now() - t });

  if (coreResult.crossSegmentCycleMergeCount > 0) {
    diagnostics.push({
      code: 'SEG_W002',
      severity: 'warn',
      message: `${coreResult.crossSegmentCycleMergeCount} cross-segment ordering cycle(s) detected and merged`,
    });
  }

  // ---- Phase 3: Topological sort ----
  t = now();
  const waveAssignment = assignWaves(coreResult.segDepGraph);
  durations.push({ phase: 'topo-sort', durationMs: now() - t });

  // ---- Phase 4: Materialize ----
  t = now();
  const { segments, nodeToSegment } = materializeSegments(
    coreResult.uf,
    graph.nodes,
    resolvedEdges,
    waveAssignment,
    opts
  );

  // Build node lookup for dependency wiring
  const nodeById = new Map<string, IRNodeBase>();
  for (const n of graph.nodes) nodeById.set(n.id, n);

  // Wire dependencies
  const dependencies = wireDependencies(segments, nodeToSegment, coreResult, nodeById);

  // Wave analysis
  const realSegmentCount = segments.filter((s) => !s.isVirtual).length;
  const waveCount =
    realSegmentCount > 0
      ? Math.max(...segments.filter((s) => !s.isVirtual).map((s) => s.migrationOrder)) + 1
      : 0;
  const waveResult = analyzeWaves(segments, waveCount, heavyWaveThreshold);
  diagnostics.push(...waveResult.diagnostics);

  // Hazards
  const coordinationHazards = buildCoordinationHazards(coreResult.hazardEdges, nodeToSegment);

  // Heuristic diagnostics (opt-in)
  if (opts.enableHeuristics) {
    diagnostics.push(...detectProductBundleOrphans(graph.nodes, nodeToSegment));
  }

  durations.push({ phase: 'materialize', durationMs: now() - t });

  // ---- Phase 5: Articulation analysis ----
  t = now();
  for (const seg of segments) {
    if (seg.isVirtual || seg.nodeCount <= largeSegThreshold) continue;
    const memberNodes = new Map<string, IRNodeBase>();
    for (const id of seg.memberNodeIds) {
      const n = nodeById.get(id);
      if (n) memberNodes.set(id, n);
    }
    seg.internalOrderingHints = findArticulationHints(
      seg.memberNodeIds,
      memberNodes,
      resolvedEdges,
      maxArticulationHints
    );
    diagnostics.push({
      code: 'SEG_I002',
      severity: 'info',
      message: `Articulation analysis ran on segment '${seg.label}' (${seg.nodeCount} nodes, ${seg.internalOrderingHints.length} hints)`,
      context: { segmentIds: [seg.id] },
    });
  }
  durations.push({ phase: 'articulation', durationMs: now() - t });

  // ---- Virtual segments ----
  t = now();
  const virtualResult = buildVirtualSegments(externalEdges, nodeToSegment);
  // Merge virtual segments into manifest
  const allSegments: Segment[] = [...virtualResult.virtualSegments, ...segments];
  // Re-sort: virtual (order -1) first, then real segments
  allSegments.sort((a, b) => {
    if (a.migrationOrder !== b.migrationOrder) return a.migrationOrder - b.migrationOrder;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
  // Apply virtual constraints to real segments
  for (const [segId, constraints] of virtualResult.constraintsPerSegment) {
    const seg = segments.find((s) => s.id === segId);
    if (seg) {
      for (const c of constraints) {
        if (
          !seg.validationConstraints.some((x) => x.nodeId === c.nodeId && x.edgeType === c.edgeType)
        ) {
          seg.validationConstraints.push(c);
        }
      }
      // Add virtual segment to dependsOn
      for (const vs of virtualResult.virtualSegments) {
        if (vs.dependedOnBy.includes(segId) && !seg.dependsOn.includes(vs.id)) {
          seg.dependsOn.push(vs.id);
          seg.isIsland = false;
        }
      }
    }
  }
  diagnostics.push(...virtualResult.diagnostics);
  durations.push({ phase: 'virtual-segments', durationMs: now() - t });

  // ---- Build manifest ----
  const islandCount = allSegments.filter((s) => s.isIsland).length;
  const manifest: SegmentManifest = {
    segments: allSegments,
    dependencies,
    coordinationHazards,
    segmentCount: allSegments.length,
    realSegmentCount,
    virtualSegmentCount: virtualResult.virtualSegments.length,
    waveCount,
    islandCount,
    crossSegmentCycleMergeCount: coreResult.crossSegmentCycleMergeCount,
    crossSegmentDependencyCount: dependencies.length,
    waveWeights: waveResult.waveWeights,
    subWaveHints: waveResult.subWaveHints,
    sizeHistogram: waveResult.sizeHistogram,
  };

  // ---- Invariant checks ----
  t = now();
  assertInvariants(graph, { nodeToSegment }, manifest, resolvedEdges);
  durations.push({ phase: 'invariants', durationMs: now() - t });

  // ---- Sort diagnostics ----
  const severityRank = { error: 0, warn: 1, info: 2 };
  diagnostics.sort((a, b) => {
    const sr = severityRank[a.severity] - severityRank[b.severity];
    if (sr !== 0) return sr;
    if (a.code !== b.code) return a.code < b.code ? -1 : 1;
    return a.message < b.message ? -1 : a.message > b.message ? 1 : 0;
  });

  return {
    assignment: { nodeToSegment },
    manifest,
    runtimeStats: {
      durationMs: now() - startTime,
      phaseDurations: durations,
    },
    diagnostics,
  };
}
