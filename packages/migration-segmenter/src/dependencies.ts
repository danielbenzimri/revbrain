/**
 * Cross-segment dependency wiring + validation constraints.
 *
 * Spec: docs/MIGRATION-SEGMENTER-DESIGN.md §6.2, §6.3.
 * Task: SEG-2.2.
 */

import type {
  IREdge,
  IREdgeType,
  IRNodeBase,
  Segment,
  SegmentDependency,
  ValidationConstraint,
} from '@revbrain/migration-ir-contract';
import type { SegmentCoreResult } from './segment-core.ts';

const MAX_SAMPLE_EDGES = 5;

/**
 * Wire `dependsOn`, `dependedOnBy`, `validationConstraints`, and
 * `isIsland` onto the segments. Also build the `SegmentDependency`
 * provenance list.
 */
export function wireDependencies(
  segments: Segment[],
  nodeToSegment: Record<string, string>,
  coreResult: SegmentCoreResult,
  nodeById: ReadonlyMap<string, IRNodeBase>
): SegmentDependency[] {
  const segById = new Map<string, Segment>();
  for (const seg of segments) segById.set(seg.id, seg);

  // Build per-segment-pair dependency accumulator
  const depKey = (prereq: string, dep: string) => `${prereq}||${dep}`;
  const depMap = new Map<
    string,
    {
      prerequisiteSegmentId: string;
      dependentSegmentId: string;
      byEdgeType: Map<IREdgeType, number>;
      sampleEdges: SegmentDependency['sampleEdges'];
    }
  >();

  for (const prov of coreResult.orderingEdgeProvenance) {
    const prereqSegId =
      nodeToSegment[
        prov.edge[
          prov.prerequisiteRep === coreResult.uf.find(prov.edge.sourceId) ? 'sourceId' : 'targetId'
        ]
      ];
    const depSegId =
      nodeToSegment[
        prov.edge[
          prov.dependentRep === coreResult.uf.find(prov.edge.sourceId) ? 'sourceId' : 'targetId'
        ]
      ];
    if (!prereqSegId || !depSegId || prereqSegId === depSegId) continue;

    const key = depKey(prereqSegId, depSegId);
    let entry = depMap.get(key);
    if (!entry) {
      entry = {
        prerequisiteSegmentId: prereqSegId,
        dependentSegmentId: depSegId,
        byEdgeType: new Map(),
        sampleEdges: [],
      };
      depMap.set(key, entry);
    }

    entry.byEdgeType.set(prov.edge.edgeType, (entry.byEdgeType.get(prov.edge.edgeType) ?? 0) + 1);

    if (entry.sampleEdges.length < MAX_SAMPLE_EDGES) {
      entry.sampleEdges.push({
        edgeType: prov.edge.edgeType,
        sourceNodeId: prov.edge.sourceId,
        targetNodeId: prov.edge.targetId,
      });
    }

    // Wire dependsOn / dependedOnBy
    const depSeg = segById.get(depSegId);
    const prereqSeg = segById.get(prereqSegId);
    if (depSeg && !depSeg.dependsOn.includes(prereqSegId)) {
      depSeg.dependsOn.push(prereqSegId);
    }
    if (prereqSeg && !prereqSeg.dependedOnBy.includes(depSegId)) {
      prereqSeg.dependedOnBy.push(depSegId);
    }
  }

  // Build validation constraints for consumes-variable edges
  for (const prov of coreResult.orderingEdgeProvenance) {
    if (prov.edge.edgeType !== 'consumes-variable') continue;
    const prereqNodeId = prov.edge.targetId; // variable is at target
    const depSegId = nodeToSegment[prov.edge.sourceId];
    const prereqSegId = nodeToSegment[prereqNodeId];
    if (!depSegId || !prereqSegId || depSegId === prereqSegId) continue;

    const depSeg = segById.get(depSegId);
    if (!depSeg) continue;

    const prereqNode = nodeById.get(prereqNodeId);
    const constraint: ValidationConstraint = {
      type: 'prereq-exists',
      nodeId: prereqNodeId,
      nodeType: prereqNode?.nodeType ?? 'unknown',
      displayName: prereqNode?.displayName ?? prereqNodeId,
      edgeType: prov.edge.edgeType,
    };

    // Dedup by (nodeId, edgeType)
    if (
      !depSeg.validationConstraints.some(
        (c) => c.nodeId === constraint.nodeId && c.edgeType === constraint.edgeType
      )
    ) {
      depSeg.validationConstraints.push(constraint);
    }
  }

  // Sort constraints deterministically
  for (const seg of segments) {
    seg.validationConstraints.sort((a, b) => {
      if (a.nodeType !== b.nodeType) return a.nodeType < b.nodeType ? -1 : 1;
      if (a.displayName !== b.displayName) return a.displayName < b.displayName ? -1 : 1;
      if (a.nodeId !== b.nodeId) return a.nodeId < b.nodeId ? -1 : 1;
      return a.edgeType < b.edgeType ? -1 : a.edgeType > b.edgeType ? 1 : 0;
    });

    // Sort dependsOn / dependedOnBy
    seg.dependsOn.sort();
    seg.dependedOnBy.sort();

    // Recalculate isIsland
    seg.isIsland = seg.dependsOn.length === 0 && seg.dependedOnBy.length === 0;
  }

  // Convert dep map to array
  const dependencies: SegmentDependency[] = [...depMap.values()].map((d) => ({
    prerequisiteSegmentId: d.prerequisiteSegmentId,
    dependentSegmentId: d.dependentSegmentId,
    byEdgeType: Object.fromEntries(d.byEdgeType) as Partial<Record<IREdgeType, number>>,
    sampleEdges: d.sampleEdges,
  }));

  // Sort dependencies deterministically
  dependencies.sort((a, b) => {
    if (a.prerequisiteSegmentId !== b.prerequisiteSegmentId)
      return a.prerequisiteSegmentId < b.prerequisiteSegmentId ? -1 : 1;
    return a.dependentSegmentId < b.dependentSegmentId ? -1 : 1;
  });

  return dependencies;
}
