/**
 * Stage 8 — Validator (V1–V8).
 *
 * Spec: §10.4.
 *
 * The validator walks the draft graph and reports diagnostics.
 * It NEVER mutates the graph — strict-mode elevation (throwing on
 * any error-severity diagnostic) is the caller's responsibility in
 * PH3.11 `normalize()`.
 *
 * Implemented checks:
 *
 * - V1a: every projected edge has a matching inline `NodeRef` on
 *   `nodes[sourceId]`.
 * - V1b: every inline resolved NodeRef in a projected field has
 *   exactly one matching edge.
 * - V1c: every synthetic `cycle-contains` edge's source is a
 *   `CyclicDependencyIR`.
 * - V1d: every synthetic `cycle-contains` edge's target appears as
 *   `{ id, resolved: true }` in the group's `members` NodeRef[].
 * - V1e: every member of a `CyclicDependencyIR.members` has a
 *   matching `cycle-contains` edge.
 * - V2: non-composite nodes must have ≥ 1 `sourceFindingKeys`.
 * - V3: no duplicate ids.
 * - V4: unresolved field refs (degraded path when no catalog).
 * - V5: cycle-group well-formedness (size ≥ 2, every member
 *   resolved, every referenced id present in `nodes[]`).
 * - V8: unresolved-ref ratio over threshold.
 *
 * Field access is a `ReferenceIndex` concern — V4 here operates on
 * the `unresolvedRefs` bucket, NOT on `edges[]`. Fields that appear
 * in `byField` but not in `edges[]` are CORRECT (v1.2).
 */

import {
  PROJECTED_EDGE_TYPES,
  type Diagnostic,
  type IREdge,
  type IRGraph,
  type IRNodeBase,
  type NodeRef,
  type ReferenceIndex,
} from '@revbrain/migration-ir-contract';
import { VALIDATOR_CODES } from './diagnostic-codes.ts';

export interface ValidationContext {
  /** When true, the downstream caller will throw on any error diagnostic. */
  strict: boolean;
  /** V8 threshold: unresolved-ref ratio above this fires. Default 0.2. */
  unresolvedRatioThreshold?: number;
  /** Whether the run had a SchemaCatalog (affects V4). */
  hasCatalog: boolean;
}

export interface ValidationResult {
  diagnostics: Diagnostic[];
  errorCount: number;
  warningCount: number;
}

/** Composite node types that legitimately have no source findings. */
const COMPOSITE_NODE_TYPES = new Set<string>(['CyclicDependency']);

function diag(
  severity: 'error' | 'warning' | 'info',
  code: string,
  message: string,
  extra?: { nodeId?: string; findingKey?: string }
): Diagnostic {
  const d: Diagnostic = { severity, stage: 'validate', code, message };
  if (extra?.nodeId !== undefined) d.nodeId = extra.nodeId;
  if (extra?.findingKey !== undefined) d.findingKey = extra.findingKey;
  return d;
}

/** Pull inline NodeRef[] fields off a node by name. */
function inlineRefs(node: IRNodeBase, fieldName: string): readonly NodeRef[] {
  const v = (node as unknown as Record<string, unknown>)[fieldName];
  if (!Array.isArray(v)) return [];
  return v.filter(
    (x): x is NodeRef =>
      typeof x === 'object' && x !== null && typeof (x as NodeRef).resolved === 'boolean'
  );
}

/** V1a + V1b: projected-edge ↔ inline NodeRef round-trip check. */
function validateProjectedEdges(
  nodes: readonly IRNodeBase[],
  edges: readonly IREdge[],
  byId: Map<string, IRNodeBase>
): Diagnostic[] {
  const out: Diagnostic[] = [];

  // Build a lookup `sourceId → set of "(sourceField, targetId)"`
  // from the edges for V1b completeness.
  const edgeKeys = new Set<string>();
  const edgesByKey = new Map<string, IREdge>();
  for (const e of edges) {
    if (!PROJECTED_EDGE_TYPES.has(e.edgeType)) continue;
    const k = `${e.sourceId}\0${e.sourceField}\0${e.targetId}`;
    edgeKeys.add(k);
    edgesByKey.set(k, e);
  }

  // V1a: every projected edge must have a matching inline NodeRef.
  for (const e of edges) {
    if (!PROJECTED_EDGE_TYPES.has(e.edgeType)) continue;
    const src = byId.get(e.sourceId);
    if (!src) {
      out.push(
        diag(
          'error',
          VALIDATOR_CODES.V1_PROJECTED_EDGE_MISSING_INLINE,
          `projected edge ${e.edgeType} references missing source node ${e.sourceId}`,
          { nodeId: e.sourceId }
        )
      );
      continue;
    }
    const refs = inlineRefs(src, e.sourceField);
    const match = refs.find((r) => r.resolved && r.id === e.targetId);
    if (!match) {
      out.push(
        diag(
          'error',
          VALIDATOR_CODES.V1_PROJECTED_EDGE_MISSING_INLINE,
          `projected edge ${e.edgeType} at ${e.sourceId}.${e.sourceField} → ${e.targetId} has no matching inline NodeRef`,
          { nodeId: e.sourceId }
        )
      );
    }
  }

  // V1b: every inline resolved NodeRef on a projected field must
  // have a matching edge. We only check fields that actually appear
  // as sourceField on SOME projected edge — otherwise this stage
  // can't know which fields are projected.
  const projectedFieldNames = new Set<string>();
  for (const e of edges) {
    if (PROJECTED_EDGE_TYPES.has(e.edgeType)) projectedFieldNames.add(e.sourceField);
  }
  for (const node of nodes) {
    for (const fieldName of projectedFieldNames) {
      const refs = inlineRefs(node, fieldName);
      for (const ref of refs) {
        if (!ref.resolved) continue;
        // Build the expected key against every projected edge type.
        // In practice the descriptor maps one field → one edge type
        // so we only need to check presence at the (source, field, target)
        // tuple across edge types.
        const hasAnyMatchingEdge = [...edgeKeys].some(
          (k) => k.startsWith(`${node.id}\0${fieldName}\0`) && k.endsWith(`\0${ref.id}`)
        );
        if (!hasAnyMatchingEdge) {
          out.push(
            diag(
              'error',
              VALIDATOR_CODES.V1_INLINE_REF_MISSING_EDGE,
              `inline NodeRef ${node.id}.${fieldName} → ${ref.id} has no matching projected edge`,
              { nodeId: node.id }
            )
          );
        }
      }
    }
  }

  return out;
}

/** V1c–V1e: synthetic cycle-contains edges ↔ CyclicDependencyIR.members. */
function validateSyntheticEdges(
  edges: readonly IREdge[],
  byId: Map<string, IRNodeBase>
): Diagnostic[] {
  const out: Diagnostic[] = [];

  const cycleEdges = edges.filter((e) => e.edgeType === 'cycle-contains');
  const edgesBySource = new Map<string, Set<string>>();
  for (const e of cycleEdges) {
    let set = edgesBySource.get(e.sourceId);
    if (!set) {
      set = new Set();
      edgesBySource.set(e.sourceId, set);
    }
    set.add(e.targetId);
  }

  // V1c: source must be a CyclicDependency.
  // V1d: target must appear in the group's members.
  for (const e of cycleEdges) {
    const src = byId.get(e.sourceId);
    if (!src || src.nodeType !== 'CyclicDependency') {
      out.push(
        diag(
          'error',
          VALIDATOR_CODES.V1_SYNTHETIC_CYCLE_SOURCE_INVALID,
          `cycle-contains edge source ${e.sourceId} is not a CyclicDependency`,
          { nodeId: e.sourceId }
        )
      );
      continue;
    }
    const members = inlineRefs(src, 'members');
    const hasTarget = members.some((m) => m.resolved && m.id === e.targetId);
    if (!hasTarget) {
      out.push(
        diag(
          'error',
          VALIDATOR_CODES.V1_SYNTHETIC_CYCLE_TARGET_MISSING,
          `cycle-contains edge target ${e.targetId} not in group ${e.sourceId}.members`,
          { nodeId: e.sourceId }
        )
      );
    }
  }

  // V1e: every member of a CyclicDependency needs a matching edge.
  for (const [id, node] of byId) {
    if (node.nodeType !== 'CyclicDependency') continue;
    const members = inlineRefs(node, 'members');
    const expectedTargets = edgesBySource.get(id) ?? new Set();
    for (const m of members) {
      if (!m.resolved) continue;
      if (!expectedTargets.has(m.id)) {
        out.push(
          diag(
            'error',
            VALIDATOR_CODES.V1_SYNTHETIC_CYCLE_MEMBER_MISSING_EDGE,
            `CyclicDependency ${id} member ${m.id} has no matching cycle-contains edge`,
            { nodeId: id }
          )
        );
      }
    }
  }

  return out;
}

/** V2: non-composite nodes must have ≥ 1 sourceFindingKeys. */
function validateEvidence(nodes: readonly IRNodeBase[]): Diagnostic[] {
  const out: Diagnostic[] = [];
  for (const n of nodes) {
    if (COMPOSITE_NODE_TYPES.has(n.nodeType)) continue;
    if (n.evidence.sourceFindingKeys.length === 0) {
      out.push(
        diag(
          'error',
          VALIDATOR_CODES.V2_EMPTY_EVIDENCE,
          `node ${n.id} (${n.nodeType}) has no sourceFindingKeys`,
          { nodeId: n.id }
        )
      );
    }
  }
  return out;
}

/** V3: no duplicate ids. */
function validateUniqueIds(nodes: readonly IRNodeBase[]): Diagnostic[] {
  const out: Diagnostic[] = [];
  const seen = new Set<string>();
  for (const n of nodes) {
    if (seen.has(n.id)) {
      out.push(
        diag('error', VALIDATOR_CODES.V3_DUPLICATE_ID, `duplicate node id ${n.id}`, {
          nodeId: n.id,
        })
      );
    }
    seen.add(n.id);
  }
  return out;
}

/** V4: unresolved field refs (via ReferenceIndex). Degrades when no catalog. */
function validateFieldRefs(referenceIndex: ReferenceIndex, hasCatalog: boolean): Diagnostic[] {
  const out: Diagnostic[] = [];
  if (!hasCatalog) {
    out.push(
      diag(
        'warning',
        VALIDATOR_CODES.V4_DEGRADED,
        'V4 running in degraded mode: no SchemaCatalog provided, unresolved-ref checks are syntactic only'
      )
    );
    return out;
  }
  for (const entry of referenceIndex.unresolvedRefs) {
    out.push(
      diag(
        'warning',
        VALIDATOR_CODES.V4_UNRESOLVED_FIELD_REF,
        `unresolved field reference at ${entry.nodeId}: ${entry.reason}`,
        { nodeId: entry.nodeId }
      )
    );
  }
  return out;
}

/** V5: cycle-group well-formedness. */
function validateCycleGroups(
  nodes: readonly IRNodeBase[],
  byId: Map<string, IRNodeBase>
): Diagnostic[] {
  const out: Diagnostic[] = [];
  for (const n of nodes) {
    if (n.nodeType !== 'CyclicDependency') continue;
    const members = inlineRefs(n, 'members');
    if (members.length < 2) {
      out.push(
        diag(
          'error',
          VALIDATOR_CODES.V5_CYCLE_WELL_FORMED,
          `CyclicDependency ${n.id} has fewer than 2 members (size ${members.length})`,
          { nodeId: n.id }
        )
      );
    }
    for (const m of members) {
      if (!m.resolved) {
        out.push(
          diag(
            'error',
            VALIDATOR_CODES.V5_CYCLE_WELL_FORMED,
            `CyclicDependency ${n.id} has an unresolved member NodeRef`,
            { nodeId: n.id }
          )
        );
        continue;
      }
      if (!byId.has(m.id)) {
        out.push(
          diag(
            'error',
            VALIDATOR_CODES.V5_CYCLE_WELL_FORMED,
            `CyclicDependency ${n.id} member ${m.id} does not resolve to an existing node`,
            { nodeId: n.id }
          )
        );
      }
    }
  }
  return out;
}

/** V8: unresolved-ref ratio over threshold. */
function validateUnresolvedRatio(referenceIndex: ReferenceIndex, threshold: number): Diagnostic[] {
  const resolvedCount =
    Object.values(referenceIndex.byField).reduce((sum, ids) => sum + ids.length, 0) +
    Object.values(referenceIndex.byPath).reduce((sum, ids) => sum + ids.length, 0);
  const unresolvedCount = referenceIndex.unresolvedRefs.length;
  const total = resolvedCount + unresolvedCount;
  if (total === 0) return [];
  const ratio = unresolvedCount / total;
  if (ratio > threshold) {
    return [
      diag(
        'warning',
        VALIDATOR_CODES.V8_UNRESOLVED_RATIO,
        `unresolved-ref ratio ${(ratio * 100).toFixed(1)}% exceeds threshold ${(threshold * 100).toFixed(1)}%`
      ),
    ];
  }
  return [];
}

/**
 * Public entry: run all validators over a draft graph.
 */
export function validateGraph(
  graph: Pick<IRGraph, 'nodes' | 'edges' | 'referenceIndex'>,
  context: ValidationContext
): ValidationResult {
  const byId = new Map<string, IRNodeBase>();
  for (const n of graph.nodes) byId.set(n.id, n);

  const diagnostics: Diagnostic[] = [];
  diagnostics.push(...validateProjectedEdges(graph.nodes, graph.edges, byId));
  diagnostics.push(...validateSyntheticEdges(graph.edges, byId));
  diagnostics.push(...validateEvidence(graph.nodes));
  diagnostics.push(...validateUniqueIds(graph.nodes));
  diagnostics.push(...validateFieldRefs(graph.referenceIndex, context.hasCatalog));
  diagnostics.push(...validateCycleGroups(graph.nodes, byId));
  diagnostics.push(
    ...validateUnresolvedRatio(graph.referenceIndex, context.unresolvedRatioThreshold ?? 0.2)
  );

  const errorCount = diagnostics.filter((d) => d.severity === 'error').length;
  const warningCount = diagnostics.filter((d) => d.severity === 'warning').length;
  return { diagnostics, errorCount, warningCount };
}
