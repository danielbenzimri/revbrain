/**
 * Invariant enforcement — S0a through S15.
 *
 * Spec: docs/MIGRATION-SEGMENTER-DESIGN.md §7.
 * Task: SEG-4.1.
 *
 * Every invariant is a function that returns { ok, message }.
 * assertInvariants runs all and throws SegmenterInvariantError
 * on the first failure.
 */

import type {
  IRGraph,
  IREdge,
  SegmentAssignment,
  SegmentManifest,
} from '@revbrain/migration-ir-contract';
import { STRONG_EDGE_TYPES } from './edge-classification.ts';
import { SegmenterInvariantError } from './errors.ts';

interface Check {
  ok: boolean;
  message: string;
}

function fail(id: string, msg: string): never {
  throw new SegmenterInvariantError(id, msg);
}

/**
 * Run all invariants. Throws SegmenterInvariantError on the first
 * violation found.
 */
export function assertInvariants(
  graph: IRGraph,
  assignment: SegmentAssignment,
  manifest: SegmentManifest,
  resolvedEdges: readonly IREdge[]
): void {
  const { nodeToSegment } = assignment;
  const segById = new Map(manifest.segments.map((s) => [s.id, s]));
  const realSegments = manifest.segments.filter((s) => !s.isVirtual);
  const virtualSegments = manifest.segments.filter((s) => s.isVirtual);

  // S1: every node has exactly one entry
  const ntsKeys = Object.keys(nodeToSegment);
  if (ntsKeys.length !== graph.nodes.length) {
    fail(
      'S1',
      `nodeToSegment has ${ntsKeys.length} entries but graph has ${graph.nodes.length} nodes`
    );
  }
  for (const node of graph.nodes) {
    if (!(node.id in nodeToSegment)) {
      fail('S1', `node '${node.id}' has no entry in nodeToSegment`);
    }
  }

  // S2: every non-virtual segment ID appears in nodeToSegment
  const ntsValues = new Set(Object.values(nodeToSegment));
  for (const seg of realSegments) {
    if (!ntsValues.has(seg.id)) {
      fail('S2', `real segment '${seg.id}' not found in nodeToSegment values`);
    }
  }

  // S2v: virtual segments have zero nodeToSegment entries
  for (const seg of virtualSegments) {
    if (seg.memberNodeIds.length !== 0) {
      fail(
        'S2v',
        `virtual segment '${seg.id}' has ${seg.memberNodeIds.length} members (expected 0)`
      );
    }
    if (ntsValues.has(seg.id)) {
      fail('S2v', `virtual segment '${seg.id}' appears in nodeToSegment`);
    }
  }

  // S2b: memberNodeIds matches nodeToSegment for each real segment
  for (const seg of realSegments) {
    const expectedMembers = new Set(seg.memberNodeIds);
    const actualMembers = new Set(
      Object.entries(nodeToSegment)
        .filter(([, sid]) => sid === seg.id)
        .map(([nid]) => nid)
    );
    if (expectedMembers.size !== actualMembers.size) {
      fail(
        'S2b',
        `segment '${seg.id}' memberNodeIds (${expectedMembers.size}) ≠ nodeToSegment count (${actualMembers.size})`
      );
    }
  }

  // S3: strong edges → same segment
  for (const edge of resolvedEdges) {
    if (!STRONG_EDGE_TYPES.has(edge.edgeType)) continue;
    const srcSeg = nodeToSegment[edge.sourceId];
    const tgtSeg = nodeToSegment[edge.targetId];
    if (srcSeg !== tgtSeg) {
      fail(
        'S3',
        `strong edge ${edge.edgeType} ${edge.sourceId}→${edge.targetId} crosses segments ${srcSeg}/${tgtSeg}`
      );
    }
  }

  // S5: migrationOrder is valid topological order
  for (const seg of realSegments) {
    for (const prereqId of seg.dependsOn) {
      const prereq = segById.get(prereqId);
      if (prereq && !prereq.isVirtual && prereq.migrationOrder >= seg.migrationOrder) {
        fail(
          'S5',
          `segment ${seg.id} (wave ${seg.migrationOrder}) depends on ${prereqId} (wave ${prereq.migrationOrder}) — prerequisite must have lower wave`
        );
      }
    }
  }

  // S7: sizeHistogram sums to realSegmentCount
  const histSum =
    manifest.sizeHistogram.singleton +
    manifest.sizeHistogram.small +
    manifest.sizeHistogram.medium +
    manifest.sizeHistogram.large +
    manifest.sizeHistogram.xlarge;
  if (histSum !== manifest.realSegmentCount) {
    fail('S7', `sizeHistogram sum ${histSum} ≠ realSegmentCount ${manifest.realSegmentCount}`);
  }

  // S8: waveWeights.length === waveCount
  if (manifest.waveWeights.length !== manifest.waveCount) {
    fail(
      'S8',
      `waveWeights length ${manifest.waveWeights.length} ≠ waveCount ${manifest.waveCount}`
    );
  }

  // S10: every real segment has rootNodeId as a member
  for (const seg of realSegments) {
    if (!seg.memberNodeIds.includes(seg.rootNodeId)) {
      fail('S10', `segment '${seg.id}' rootNodeId '${seg.rootNodeId}' is not a member`);
    }
  }

  // S11: virtual segments have migrationOrder -1, empty dependsOn
  for (const seg of virtualSegments) {
    if (seg.migrationOrder !== -1) {
      fail(
        'S11',
        `virtual segment '${seg.id}' has migrationOrder ${seg.migrationOrder} (expected -1)`
      );
    }
    if (seg.dependsOn.length !== 0) {
      fail('S11', `virtual segment '${seg.id}' has non-empty dependsOn`);
    }
    if (!seg.isVirtual) {
      fail('S11', `virtual segment '${seg.id}' has isVirtual=false`);
    }
  }

  // S12: all dependsOn/dependedOnBy entries exist in manifest
  for (const seg of manifest.segments) {
    for (const depId of seg.dependsOn) {
      if (!segById.has(depId)) {
        fail('S12', `segment '${seg.id}' dependsOn '${depId}' which is not in manifest`);
      }
    }
    for (const depId of seg.dependedOnBy) {
      if (!segById.has(depId)) {
        fail('S12', `segment '${seg.id}' dependedOnBy '${depId}' which is not in manifest`);
      }
    }
  }

  // S13: all segment IDs unique
  const allIds = manifest.segments.map((s) => s.id);
  const uniqueIds = new Set(allIds);
  if (uniqueIds.size !== allIds.length) {
    fail('S13', `${allIds.length - uniqueIds.size} duplicate segment IDs in manifest`);
  }

  // S14: no virtual segment ID in any real segment's memberNodeIds
  const virtualIds = new Set(virtualSegments.map((s) => s.id));
  for (const seg of realSegments) {
    for (const mid of seg.memberNodeIds) {
      if (virtualIds.has(mid)) {
        fail('S14', `real segment '${seg.id}' has virtual ID '${mid}' in memberNodeIds`);
      }
    }
  }
}
