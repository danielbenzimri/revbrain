/**
 * Topological sort (Kahn's algorithm) for wave assignment.
 *
 * Spec: docs/MIGRATION-SEGMENTER-DESIGN.md §5.3.
 * Task: SEG-1.4.
 *
 * Assigns a migration wave number to each segment:
 *   - Wave 0: segments with no prerequisites (can go first)
 *   - Wave N+1: successors of wave N
 *   - Islands: wave 0 (no deps in either direction)
 *
 * Virtual segments are NOT processed here — they always get
 * migrationOrder = -1, handled by the caller.
 *
 * Deterministic: within a wave, segments are processed in sorted
 * order by representative ID, so the wave assignment is stable
 * across runs (invariant S9).
 */

import type { DirectedGraph } from './scc.ts';
import { SegmenterInvariantError } from './errors.ts';

/**
 * Assign wave numbers to all nodes in a DAG using Kahn's BFS.
 *
 * @param dag Directed acyclic graph: prerequisite → dependent.
 * @returns Map from node ID → wave number.
 * @throws SegmenterInvariantError if the graph has a cycle (should
 *         not happen after SCC merge — this is a defensive check).
 */
export function assignWaves(dag: DirectedGraph): Map<string, number> {
  // Compute in-degrees
  const inDegree = new Map<string, number>();
  const allNodes = new Set<string>();

  for (const [node, neighbors] of dag) {
    allNodes.add(node);
    if (!inDegree.has(node)) inDegree.set(node, 0);
    for (const n of neighbors) {
      allNodes.add(n);
      inDegree.set(n, (inDegree.get(n) ?? 0) + 1);
    }
  }

  // Also register nodes that appear only as keys (no incoming edges)
  for (const node of allNodes) {
    if (!inDegree.has(node)) inDegree.set(node, 0);
  }

  // BFS from zero-indegree nodes
  const waveAssignment = new Map<string, number>();
  // Sort for determinism (S9)
  let currentWave = [...allNodes]
    .filter((n) => inDegree.get(n) === 0)
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  let wave = 0;
  let processed = 0;

  while (currentWave.length > 0) {
    const nextWave: string[] = [];

    for (const node of currentWave) {
      waveAssignment.set(node, wave);
      processed++;

      const neighbors = dag.get(node);
      if (neighbors) {
        for (const n of neighbors) {
          const deg = inDegree.get(n)! - 1;
          inDegree.set(n, deg);
          if (deg === 0) {
            nextWave.push(n);
          }
        }
      }
    }

    // Sort next wave for determinism
    nextWave.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    currentWave = nextWave;
    wave++;
  }

  // If we didn't process all nodes, there's a cycle (should never happen)
  if (processed < allNodes.size) {
    const unprocessed = [...allNodes].filter((n) => !waveAssignment.has(n));
    throw new SegmenterInvariantError(
      'S4',
      `Topological sort found a cycle in the segment DAG (should have been resolved by SCC merge). ` +
        `Unprocessed: ${unprocessed.slice(0, 5).join(', ')}`
    );
  }

  return waveAssignment;
}
