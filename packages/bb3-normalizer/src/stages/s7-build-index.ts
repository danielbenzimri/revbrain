/**
 * Stage 7 — Build ReferenceIndex + merge projected + synthetic edges.
 *
 * Spec: §6.1 Stage 7, §5.5, §5.1a, §8.8.
 *
 * Composes the reference index (PH3.8) with the projected edges
 * (PH2.6) and the synthetic cycle-contains edges Stage 6 already
 * emitted. The stage's job is:
 *
 * 1. Build `ReferenceIndex` over every node's field refs.
 * 2. Walk inline `NodeRef[]` fields via `projectEdges` to produce
 *    the projected subset of `IRGraph.edges`.
 * 3. Concatenate with the synthetic cycle-contains edges from
 *    Stage 6.
 * 4. Sort by (sourceId, targetId, edgeType) and collapse duplicate
 *    edges — same (source, target, edgeType, sourceField) → one
 *    entry + a diagnostic.
 */

import type {
  Diagnostic,
  FieldRefIR,
  IREdge,
  IRNodeBase,
  ReferenceIndex,
} from '@revbrain/migration-ir-contract';
import {
  projectEdges,
  type NodeRefFieldDescriptor,
  type NodeWithRefs,
} from '../graph/edge-projection.ts';
import { buildReferenceIndex } from '../graph/reference-index.ts';

export interface BuildIndexInput {
  nodes: readonly IRNodeBase[];
  /**
   * Synthetic edges Stage 6 produced. Stage 7 merges these with the
   * projected edges; Stage 6 is the only place that emits
   * `'cycle-contains'`.
   */
  syntheticEdges: readonly IREdge[];
  /** Descriptors describing which inline NodeRef fields become which edge types. */
  projectedDescriptors: readonly NodeRefFieldDescriptor[];
  /**
   * Per-node extra FieldRefIR lists merged into the ReferenceIndex.
   * Normalizers that carry field refs on dedicated fields
   * (e.g. `PricingRuleIR.inputFields`) surface them here.
   */
  extraRefs?: Map<string, FieldRefIR[]>;
}

export interface BuildIndexResult {
  referenceIndex: ReferenceIndex;
  edges: IREdge[];
  unresolvedRefCount: number;
  diagnostics: Diagnostic[];
}

/**
 * Hash-serialize an edge's identity tuple so duplicate-collapse is cheap.
 */
function edgeKey(e: IREdge): string {
  return `${e.sourceId}\0${e.targetId}\0${e.edgeType}\0${e.sourceField}`;
}

/**
 * Stable sort + duplicate collapse over the union of projected and
 * synthetic edges. Duplicates fire a diagnostic but keep the
 * pipeline running.
 */
function mergeAndSortEdges(
  projected: readonly IREdge[],
  synthetic: readonly IREdge[]
): { edges: IREdge[]; diagnostics: Diagnostic[] } {
  const diagnostics: Diagnostic[] = [];
  const seen = new Map<string, IREdge>();

  for (const e of projected) {
    const k = edgeKey(e);
    if (seen.has(k)) {
      diagnostics.push({
        severity: 'warning',
        stage: 'build-index',
        code: 'BB3_E001',
        message: `duplicate projected edge ${k}`,
      });
      continue;
    }
    seen.set(k, e);
  }

  for (const e of synthetic) {
    const k = edgeKey(e);
    if (seen.has(k)) {
      diagnostics.push({
        severity: 'warning',
        stage: 'build-index',
        code: 'BB3_E002',
        message: `duplicate synthetic edge ${k}`,
      });
      continue;
    }
    seen.set(k, e);
  }

  const edges = [...seen.values()].sort((a, b) => {
    if (a.sourceId !== b.sourceId) return a.sourceId < b.sourceId ? -1 : 1;
    if (a.targetId !== b.targetId) return a.targetId < b.targetId ? -1 : 1;
    if (a.edgeType !== b.edgeType) return a.edgeType < b.edgeType ? -1 : 1;
    if (a.sourceField !== b.sourceField) return a.sourceField < b.sourceField ? -1 : 1;
    return 0;
  });

  return { edges, diagnostics };
}

/**
 * Stage 7 entry point.
 */
export function buildIndex(input: BuildIndexInput): BuildIndexResult {
  const referenceIndex = buildReferenceIndex(input.nodes, input.extraRefs);

  const projected = projectEdges(
    input.nodes as unknown as NodeWithRefs[],
    input.projectedDescriptors
  );

  const merged = mergeAndSortEdges(projected.edges, input.syntheticEdges);

  return {
    referenceIndex,
    edges: merged.edges,
    unresolvedRefCount: projected.unresolvedRefCount,
    diagnostics: merged.diagnostics,
  };
}
