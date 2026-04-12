/**
 * Input validation (zero-trust) — IV1–IV5 checks.
 *
 * Spec: docs/MIGRATION-SEGMENTER-DESIGN.md §3.3.
 * Task: SEG-1.1.
 *
 * Runs before any algorithm. Separates edges into resolved
 * (both endpoints in graph), external (target missing but edge
 * type allows it), and invalid (hard error).
 */

import type { IRGraph, IREdge, IREdgeType } from '@revbrain/migration-ir-contract';
import { ALL_CLASSIFIED_EDGE_TYPES, EXTERNAL_ALLOWED_EDGE_TYPES } from './edge-classification.ts';
import {
  DanglingEdgeError,
  DuplicateNodeIdError,
  IncompatibleSchemaError,
  UnclassifiedEdgeTypeError,
} from './errors.ts';

/** Supported irSchemaVersion range (semver-ish). */
const SUPPORTED_SCHEMA_PREFIX = '1.';

export interface ValidatedInput {
  /** Node ID set for O(1) lookups. */
  nodeIndex: Set<string>;
  /** Edges where both endpoints exist in graph.nodes. */
  resolvedEdges: IREdge[];
  /** Edges where target is missing but edgeType is in EXTERNAL_ALLOWED. */
  externalEdges: IREdge[];
}

/**
 * Validate the input graph and triage edges.
 *
 * @throws DanglingEdgeError — sourceId missing OR targetId missing
 *         on a non-external edge type.
 * @throws DuplicateNodeIdError — duplicate node IDs.
 * @throws UnclassifiedEdgeTypeError — unknown edge type.
 * @throws IncompatibleSchemaError — unsupported irSchemaVersion.
 */
export function validateInput(graph: IRGraph): ValidatedInput {
  // IV5 — schema version compatibility
  if (!graph.irSchemaVersion.startsWith(SUPPORTED_SCHEMA_PREFIX)) {
    throw new IncompatibleSchemaError(graph.irSchemaVersion, `${SUPPORTED_SCHEMA_PREFIX}x`);
  }

  // IV3 — unique node IDs
  const nodeIndex = new Set<string>();
  const duplicates: string[] = [];
  for (const node of graph.nodes) {
    if (nodeIndex.has(node.id)) {
      duplicates.push(node.id);
    }
    nodeIndex.add(node.id);
  }
  if (duplicates.length > 0) {
    throw new DuplicateNodeIdError(duplicates);
  }

  // IV1, IV2, IV4 — edge validation + triage
  const resolvedEdges: IREdge[] = [];
  const externalEdges: IREdge[] = [];
  const danglingErrors: Array<{
    sourceId: string;
    targetId: string;
    edgeType: string;
    endpoint: 'source' | 'target';
  }> = [];

  for (const edge of graph.edges) {
    // IV4 — edge type must be classified
    if (!ALL_CLASSIFIED_EDGE_TYPES.has(edge.edgeType)) {
      throw new UnclassifiedEdgeTypeError(edge.edgeType);
    }

    // IV1 — source must exist (always hard error if missing)
    const sourceExists = nodeIndex.has(edge.sourceId);
    if (!sourceExists) {
      danglingErrors.push({
        sourceId: edge.sourceId,
        targetId: edge.targetId,
        edgeType: edge.edgeType,
        endpoint: 'source',
      });
      continue;
    }

    // IV2 — target must exist OR edge type allows external
    const targetExists = nodeIndex.has(edge.targetId);
    if (!targetExists) {
      if (EXTERNAL_ALLOWED_EDGE_TYPES.has(edge.edgeType)) {
        externalEdges.push(edge);
      } else {
        danglingErrors.push({
          sourceId: edge.sourceId,
          targetId: edge.targetId,
          edgeType: edge.edgeType,
          endpoint: 'target',
        });
      }
      continue;
    }

    resolvedEdges.push(edge);
  }

  if (danglingErrors.length > 0) {
    throw new DanglingEdgeError(danglingErrors);
  }

  return { nodeIndex, resolvedEdges, externalEdges };
}
