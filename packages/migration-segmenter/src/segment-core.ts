/**
 * Core segmentation — Phase 1 (strong-edge grouping) + Phase 2
 * (ordering-edge SCC merge).
 *
 * Spec: docs/MIGRATION-SEGMENTER-DESIGN.md §5.1, §5.2.
 * Task: SEG-1.3.
 */

import type { IREdge, IRNodeBase } from '@revbrain/migration-ir-contract';
import { UnionFind } from './union-find.ts';
import {
  STRONG_EDGE_TYPES,
  ORDERING_EDGE_TYPES,
  getOrderingDirection,
} from './edge-classification.ts';
import { tarjanSCC, type DirectedGraph } from './scc.ts';
import { SegmenterInvariantError } from './errors.ts';

/** Maximum SCC merge iterations (circuit breaker). */
const MAX_SCC_MERGE_PASSES = 100;

export interface SegmentCoreResult {
  /** Union-find with final segment membership. */
  uf: UnionFind;
  /**
   * Segment dependency DAG (acyclic after SCC merge).
   * Keys = segment representatives. Values = dependent segment reps.
   * Direction: prerequisiteRep → dependentRep.
   */
  segDepGraph: DirectedGraph;
  /** Set of all segment representatives. */
  segmentReps: Set<string>;
  /** Number of SCC merges performed. */
  crossSegmentCycleMergeCount: number;
  /**
   * Ordering edge provenance: for each cross-segment ordering edge,
   * the prerequisite rep, dependent rep, and original edge info.
   */
  orderingEdgeProvenance: Array<{
    prerequisiteRep: string;
    dependentRep: string;
    edge: IREdge;
  }>;
  /**
   * Hazard edges: edges with edgeType in HAZARD_EDGE_TYPES that
   * cross segment boundaries. Processed in Phase 4 (SEG-2.4).
   */
  hazardEdges: IREdge[];
}

/**
 * Phase 1 + Phase 2: build segments from strong edges, then
 * merge ordering-cycle segments via one-pass SCC.
 */
export function buildSegments(
  nodes: readonly IRNodeBase[],
  resolvedEdges: readonly IREdge[]
): SegmentCoreResult {
  // ---- Phase 1: strong-edge union-find ----
  const uf = new UnionFind();
  for (const node of nodes) {
    uf.add(node.id);
  }

  const strongEdges: IREdge[] = [];
  const orderingEdges: IREdge[] = [];
  const hazardEdges: IREdge[] = [];

  for (const edge of resolvedEdges) {
    if (STRONG_EDGE_TYPES.has(edge.edgeType)) {
      strongEdges.push(edge);
    } else if (ORDERING_EDGE_TYPES.has(edge.edgeType)) {
      orderingEdges.push(edge);
    } else {
      // Must be hazard (validated upstream by IV4)
      hazardEdges.push(edge);
    }
  }

  for (const edge of strongEdges) {
    uf.union(edge.sourceId, edge.targetId);
  }

  // ---- Phase 2: ordering-edge SCC merge ----
  let crossSegmentCycleMergeCount = 0;
  let pass = 0;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    if (pass >= MAX_SCC_MERGE_PASSES) {
      throw new SegmenterInvariantError(
        'SCC-MERGE',
        `SCC merge did not converge after ${MAX_SCC_MERGE_PASSES} passes. This is a Segmenter bug.`
      );
    }

    // Build segment dependency graph from ordering edges
    const segDepGraph: DirectedGraph = new Map();
    const segmentReps = new Set<string>();

    // Register all segment reps
    for (const node of nodes) {
      segmentReps.add(uf.find(node.id));
    }
    for (const rep of segmentReps) {
      if (!segDepGraph.has(rep)) segDepGraph.set(rep, []);
    }

    // Add ordering edges between different segments
    for (const edge of orderingEdges) {
      const srcRep = uf.find(edge.sourceId);
      const tgtRep = uf.find(edge.targetId);
      if (srcRep === tgtRep) continue; // self-loop, skip

      const dir = getOrderingDirection(edge.edgeType);
      const prerequisiteRep = dir.prerequisite === 'source' ? srcRep : tgtRep;
      const dependentRep = dir.dependent === 'source' ? srcRep : tgtRep;

      segDepGraph.get(prerequisiteRep)!.push(dependentRep);
    }

    // Run Tarjan SCC
    const sccs = tarjanSCC(segmentReps, segDepGraph);
    const cycleSCCs = sccs.filter((scc) => scc.length > 1);

    if (cycleSCCs.length === 0) {
      // DAG achieved — collect provenance and return
      const orderingEdgeProvenance: SegmentCoreResult['orderingEdgeProvenance'] = [];
      for (const edge of orderingEdges) {
        const srcRep = uf.find(edge.sourceId);
        const tgtRep = uf.find(edge.targetId);
        if (srcRep === tgtRep) continue;

        const dir = getOrderingDirection(edge.edgeType);
        orderingEdgeProvenance.push({
          prerequisiteRep: dir.prerequisite === 'source' ? srcRep : tgtRep,
          dependentRep: dir.dependent === 'source' ? srcRep : tgtRep,
          edge,
        });
      }

      return {
        uf,
        segDepGraph,
        segmentReps,
        crossSegmentCycleMergeCount,
        orderingEdgeProvenance,
        hazardEdges,
      };
    }

    // Merge each cycle-SCC
    for (const scc of cycleSCCs) {
      for (let i = 1; i < scc.length; i++) {
        uf.union(scc[0]!, scc[i]!);
      }
      crossSegmentCycleMergeCount++;
    }

    pass++;
  }
}
