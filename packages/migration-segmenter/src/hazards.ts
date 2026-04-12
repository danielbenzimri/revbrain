/**
 * Coordination hazards + Product↔BundleStructure diagnostic.
 *
 * Spec: docs/MIGRATION-SEGMENTER-DESIGN.md §4.3, §6.6, §8.6.
 * Task: SEG-2.4.
 */

import { createHash } from 'node:crypto';
import type {
  IREdge,
  IRNodeBase,
  CoordinationHazard,
  SegmentDiagnostic,
} from '@revbrain/migration-ir-contract';

const MAX_SAMPLE_EDGES = 5;

/**
 * Build CoordinationHazard entries from hazard edges (e.g. triggers)
 * that cross segment boundaries.
 */
export function buildCoordinationHazards(
  hazardEdges: readonly IREdge[],
  nodeToSegment: Record<string, string>
): CoordinationHazard[] {
  // Group by (segmentId, relatedSegmentId, edgeType)
  const key = (segId: string, relatedId: string, edgeType: string) =>
    `${segId}||${relatedId}||${edgeType}`;

  const groups = new Map<
    string,
    {
      segmentId: string;
      relatedSegmentId: string;
      edgeType: IREdge['edgeType'];
      sampleEdges: CoordinationHazard['sampleEdges'];
    }
  >();

  for (const e of hazardEdges) {
    const srcSeg = nodeToSegment[e.sourceId];
    const tgtSeg = nodeToSegment[e.targetId];
    if (!srcSeg || !tgtSeg || srcSeg === tgtSeg) continue;

    const k = key(srcSeg, tgtSeg, e.edgeType);
    let group = groups.get(k);
    if (!group) {
      group = {
        segmentId: srcSeg,
        relatedSegmentId: tgtSeg,
        edgeType: e.edgeType,
        sampleEdges: [],
      };
      groups.set(k, group);
    }
    if (group.sampleEdges.length < MAX_SAMPLE_EDGES) {
      group.sampleEdges.push({
        sourceNodeId: e.sourceId,
        targetNodeId: e.targetId,
      });
    }
  }

  return [...groups.values()]
    .map((g) => ({
      fingerprint: createHash('sha256')
        .update(`${g.segmentId}||${g.relatedSegmentId}||${g.edgeType}`)
        .digest('base64url'),
      segmentId: g.segmentId,
      relatedSegmentId: g.relatedSegmentId,
      edgeType: g.edgeType,
      description: `${g.edgeType} coupling between segments`,
      sampleEdges: g.sampleEdges,
    }))
    .sort((a, b) => (a.fingerprint < b.fingerprint ? -1 : a.fingerprint > b.fingerprint ? 1 : 0));
}

/**
 * Product↔BundleStructure orphan diagnostic (heuristic, opt-in).
 * Checks if a Product and a BundleStructure with matching
 * parentProductCode are in separate segments without an edge.
 *
 * Gated behind `options.enableHeuristics`.
 */
export function detectProductBundleOrphans(
  nodes: readonly IRNodeBase[],
  nodeToSegment: Record<string, string>
): SegmentDiagnostic[] {
  const diagnostics: SegmentDiagnostic[] = [];

  // Build product code → segment ID map from Product nodes
  const productCodeToSegment = new Map<string, { nodeId: string; segId: string }>();
  for (const n of nodes) {
    if (n.nodeType !== 'Product') continue;
    // Try to read productCode from evidence or developerName
    const code = n.developerName ?? n.displayName;
    if (code) {
      const segId = nodeToSegment[n.id];
      if (segId) productCodeToSegment.set(code, { nodeId: n.id, segId });
    }
  }

  // Check BundleStructure nodes
  for (const n of nodes) {
    if (n.nodeType !== 'BundleStructure') continue;
    const parentCode = (n as unknown as { parentProductCode?: string }).parentProductCode;
    if (!parentCode) continue;

    const product = productCodeToSegment.get(parentCode);
    if (!product) continue;

    const bsSeg = nodeToSegment[n.id];
    if (!bsSeg || bsSeg === product.segId) continue;

    diagnostics.push({
      code: 'SEG_W004',
      severity: 'warn',
      message: `Product '${parentCode}' (segment ${product.segId.slice(0, 20)}...) and BundleStructure '${n.displayName}' (segment ${bsSeg.slice(0, 20)}...) are in separate segments with no connecting edge. Consider adding a parent-of edge in Normalize.`,
      context: {
        segmentIds: [product.segId, bsSeg],
        nodeIds: [product.nodeId, n.id],
      },
    });
  }

  return diagnostics;
}
