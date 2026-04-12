/**
 * Virtual external segments — placeholders for nodes outside the
 * extraction scope.
 *
 * Spec: docs/MIGRATION-SEGMENTER-DESIGN.md §6.7.
 * Task: SEG-3.1.
 */

import { createHash } from 'node:crypto';
import type {
  IREdge,
  Segment,
  ValidationConstraint,
  SegmentDiagnostic,
} from '@revbrain/migration-ir-contract';

/**
 * Create virtual segments from external edges (target not in graph).
 *
 * @param externalEdges Edges whose target is outside the graph (from validateInput).
 * @param nodeToSegment Existing node→segment map (used to find dependent segments).
 * @returns Virtual segments + validation constraints to add to dependents + diagnostics.
 */
export function buildVirtualSegments(
  externalEdges: readonly IREdge[],
  nodeToSegment: Record<string, string>
): {
  virtualSegments: Segment[];
  constraintsPerSegment: Map<string, ValidationConstraint[]>;
  diagnostics: SegmentDiagnostic[];
} {
  if (externalEdges.length === 0) {
    return { virtualSegments: [], constraintsPerSegment: new Map(), diagnostics: [] };
  }

  const diagnostics: SegmentDiagnostic[] = [];

  // Group by missing target ID
  const byTarget = new Map<
    string,
    {
      dependentSegIds: Set<string>;
      edges: IREdge[];
    }
  >();

  for (const edge of externalEdges) {
    const depSegId = nodeToSegment[edge.sourceId];
    if (!depSegId) continue;

    let group = byTarget.get(edge.targetId);
    if (!group) {
      group = { dependentSegIds: new Set(), edges: [] };
      byTarget.set(edge.targetId, group);
    }
    group.dependentSegIds.add(depSegId);
    group.edges.push(edge);
  }

  const virtualSegments: Segment[] = [];
  const constraintsPerSegment = new Map<string, ValidationConstraint[]>();

  for (const [targetId, group] of byTarget) {
    const hash = createHash('sha256').update(`external:${targetId}`).digest('base64url');

    const virtualSeg: Segment = {
      id: `seg:ext:${hash}`,
      persistentId: `pseg:ext:${targetId}`,
      label: `External: ${targetId}`,
      rootNodeId: targetId,
      nodeCount: 0,
      nodeTypes: [],
      memberNodeIds: [],
      complexityEstimate: 'simple',
      weight: 0,
      migrationOrder: -1,
      dependsOn: [],
      dependedOnBy: [...group.dependentSegIds].sort(),
      isIsland: false,
      isVirtual: true,
      validationConstraints: [],
      internalOrderingHints: [],
    };
    virtualSegments.push(virtualSeg);

    // Create validation constraints on dependent segments
    for (const depSegId of group.dependentSegIds) {
      if (!constraintsPerSegment.has(depSegId)) {
        constraintsPerSegment.set(depSegId, []);
      }
      const constraints = constraintsPerSegment.get(depSegId)!;
      const edgeType = group.edges.find((e) => nodeToSegment[e.sourceId] === depSegId)?.edgeType;
      if (edgeType) {
        constraints.push({
          type: 'prereq-exists',
          nodeId: targetId,
          nodeType: 'External',
          displayName: targetId,
          edgeType,
        });
      }
    }

    diagnostics.push({
      code: 'SEG_I003',
      severity: 'info',
      message: `Virtual segment created for external node '${targetId}'`,
      context: { segmentIds: [virtualSeg.id] },
    });
  }

  // Sort virtual segments by id
  virtualSegments.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  return { virtualSegments, constraintsPerSegment, diagnostics };
}
