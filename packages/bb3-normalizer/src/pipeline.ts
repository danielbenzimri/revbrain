/**
 * PH3.11 — Top-level `normalize()` entry point.
 *
 * Spec: §6.4.
 *
 * Wires the 9 stages into one deterministic pipeline and wraps the
 * result in `NormalizeResult`. Wall-clock telemetry — the single
 * place BB-3 is allowed to touch `Date.now()` — lives here on
 * `runtimeStats`, OUTSIDE the graph. The graph itself is the
 * stable contract; stats are sidecar.
 *
 * `normalize()` never throws on normal input. Partial compilation
 * is the explicit goal: a malformed finding quarantines, a bad
 * Apex class marks parseStatus, a missing catalog degrades V4.
 * Only the tightly-bounded hard-fail conditions from §10.1 throw.
 */

import type { AssessmentFindingInput } from '@revbrain/contract';
import type {
  Diagnostic,
  GraphMetadataIR,
  IREdge,
  IRGraph,
  IRNodeBase,
  QuarantineEntry,
  SchemaCatalog,
} from '@revbrain/migration-ir-contract';
import { inputGate, DEFAULT_INPUT_GATE_OPTIONS } from './stages/s1-input-gate.ts';
import { buildFindingIndex } from './stages/s2-group-index.ts';
import { prepareCatalog } from './stages/s2-5-schema-catalog.ts';
import { normalizeAll } from './normalizers/registry.ts';
import { registerAllNormalizers } from './normalizers/register-all.ts';
import { resolveReferences } from './stages/s4-resolve-refs.ts';
import { detectCycles } from './stages/s6-detect-cycles.ts';
import { buildIndex } from './stages/s7-build-index.ts';
import { validateGraph } from './stages/s8-validate.ts';
import { BB3InputError } from '@revbrain/migration-ir-contract';
import { assembleEnvelope } from './stages/s9-assemble.ts';
import type { NodeRefFieldDescriptor } from './graph/edge-projection.ts';
import { projectEdges, type NodeWithRefs } from './graph/edge-projection.ts';
import { DEFAULT_NODE_REF_DESCRIPTORS } from './stages/default-descriptors.ts';
import { enrichApexClass } from './normalizers/automation/apex-class.ts';
import { enrichApexTrigger } from './normalizers/automation/apex-trigger.ts';
import { createGlobalBudgetState } from './parsers/apex.ts';
import type {
  ApexClassAutomationIR,
  ApexTriggerAutomationIR,
} from '@revbrain/migration-ir-contract';
import { BB3_VERSION } from './version.ts';

export interface NormalizeOptions {
  catalog?: SchemaCatalog;
  maxInvalidRate?: number;
  strict?: boolean;
  /**
   * Descriptor list for projected-edge emission.
   *
   * Default: {@link DEFAULT_NODE_REF_DESCRIPTORS} — a comprehensive
   * table covering every inline `NodeRef` / `NodeRef[]` field in the
   * v1.2 IR catalog. Callers that want to project only a subset
   * (e.g. tests) can pass their own list; passing `[]` explicitly
   * disables projection entirely.
   */
  projectedDescriptors?: NodeRefFieldDescriptor[];
  /** Unresolved-ref threshold for V8. Default 0.2. */
  unresolvedRatioThreshold?: number;
  /**
   * ISO-8601 timestamp to stamp on the envelope. When omitted,
   * `new Date().toISOString()` is used — this is THE single place
   * wall-clock enters the graph.
   */
  extractedAt?: string;
}

export interface StageDuration {
  stage: string;
  durationMs: number;
}

export interface RuntimeStats {
  durationMs: number;
  stageDurations: StageDuration[];
  totalFindingsIn: number;
  totalNodesOut: number;
  quarantineCount: number;
  bb3Version: string;
}

export interface NormalizeResult {
  graph: IRGraph;
  runtimeStats: RuntimeStats;
  diagnostics: Diagnostic[];
  quarantine: QuarantineEntry[];
  serialized: string;
}

/** Simple hrtime-based stage timer. */
interface StageTimer {
  start: number;
  stage: string;
}

function now(): number {
  // `performance.now()` gives sub-millisecond resolution; fall back
  // to `Date.now()` if the caller is in an environment without it.
  // Both are used ONLY inside runtimeStats — never on the graph.
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

function startStage(stage: string): StageTimer {
  return { start: now(), stage };
}

function endStage(timer: StageTimer, durations: StageDuration[]): void {
  durations.push({ stage: timer.stage, durationMs: now() - timer.start });
}

/**
 * Public entry point. Drive the 9 stages, collect diagnostics and
 * quarantines along the way, and wrap everything in a `NormalizeResult`.
 */
export async function normalize(
  findings: unknown,
  options: NormalizeOptions = {}
): Promise<NormalizeResult> {
  // Populate the normalizer registry idempotently. First call does
  // the work; subsequent calls re-initialize via resetRegistry, which
  // is cheap and keeps tests from drifting on shared module state.
  registerAllNormalizers();

  const pipelineStart = now();
  const stageDurations: StageDuration[] = [];
  const diagnostics: Diagnostic[] = [];
  const quarantine: QuarantineEntry[] = [];

  // Stage 1 — Input gate.
  const s1 = startStage('input-gate');
  const gate = inputGate(findings, {
    strict: options.strict ?? DEFAULT_INPUT_GATE_OPTIONS.strict,
    maxInvalidRate: options.maxInvalidRate ?? DEFAULT_INPUT_GATE_OPTIONS.maxInvalidRate,
  });
  diagnostics.push(...gate.diagnostics);
  quarantine.push(...gate.quarantine);
  endStage(s1, stageDurations);

  const validFindings: AssessmentFindingInput[] = gate.validFindings;

  // Stage 2 — Group & index.
  const s2 = startStage('group-index');
  const findingIndex = buildFindingIndex(validFindings);
  endStage(s2, stageDurations);

  // Stage 2.5 — Schema catalog.
  const s25 = startStage('normalize'); // fold into the 'normalize' stage bucket
  const catalogCtx = prepareCatalog(options.catalog);

  // Stage 3 — Normalizer dispatch.
  const dispatchDiagnostics: Diagnostic[] = [];
  const dispatchResults = normalizeAll(validFindings, {
    catalog: catalogCtx,
    diagnostics: dispatchDiagnostics,
    findingIndex,
  });
  diagnostics.push(...dispatchDiagnostics);
  const draftNodes: IRNodeBase[] = [];
  for (const res of dispatchResults) {
    draftNodes.push(...res.nodes);
    if (res.quarantine) quarantine.push(res.quarantine);
  }
  endStage(s25, stageDurations);

  // Stage 4 — Reference resolution + cross-collector merge.
  const s4 = startStage('resolve-refs');
  const resolved = resolveReferences({ drafts: draftNodes, findingIndex });
  diagnostics.push(...resolved.diagnostics);
  quarantine.push(...resolved.quarantine);
  endStage(s4, stageDurations);

  // Stage 5 — Code parsing (PH9.5).
  // Walks every ApexClass and ApexTrigger draft in developerName
  // order, runs the tree-sitter Apex parser via the shared global
  // byte budget, and swaps the enriched result back into the
  // resolved node list. Formula + SOQL parsing is already done
  // inline by the per-normalizer implementations (validation-rule,
  // formula-field, lookup-query) so Stage 5 only owns Apex.
  // QCP (CustomComputation) stays at parseStatus 'deferred-to-bb3b'.
  const s5 = startStage('parse-code');
  const apexBudget = createGlobalBudgetState();
  // Process in id order so budget-skip decisions are deterministic.
  const apexIndices = resolved.nodes
    .map((n, i) => ({ n, i }))
    .filter(({ n }) => {
      if (n.nodeType !== 'Automation') return false;
      const sourceType = (n as unknown as { sourceType?: string }).sourceType;
      return sourceType === 'ApexClass' || sourceType === 'ApexTrigger';
    })
    .sort((a, b) => (a.n.id < b.n.id ? -1 : a.n.id > b.n.id ? 1 : 0));

  for (const { n, i } of apexIndices) {
    const findingKey = n.evidence.sourceFindingKeys[0];
    if (!findingKey) continue;
    const finding = findingIndex.byFindingKey.get(findingKey);
    if (!finding || finding.textValue === undefined) continue;

    const sourceType = (n as unknown as { sourceType: string }).sourceType;
    if (sourceType === 'ApexClass') {
      resolved.nodes[i] = await enrichApexClass(
        n as ApexClassAutomationIR,
        finding.textValue,
        apexBudget
      );
    } else if (sourceType === 'ApexTrigger') {
      resolved.nodes[i] = await enrichApexTrigger(
        n as ApexTriggerAutomationIR,
        finding.textValue,
        apexBudget
      );
    }
  }
  endStage(s5, stageDurations);

  // PH9.4 — Project inline NodeRef[] fields into IREdge[] BEFORE
  // Stage 6 so cycle detection sees real dependency edges (not an
  // empty outEdges map, as in the pre-PH9.4 pipeline). The same
  // projected edges are fed to Stage 7 for the final merge with
  // synthetic cycle-contains edges. `projectEdges` is pure and
  // deterministic so computing it once up front is safe.
  const descriptors = options.projectedDescriptors ?? DEFAULT_NODE_REF_DESCRIPTORS;
  const projection = projectEdges(resolved.nodes as unknown as NodeWithRefs[], descriptors);

  // Build a Tarjan-ready out-edges map from the projected edges.
  // Any projected edge counts as a "dependency" for cycle purposes —
  // composition edges (parent-of) form a forest so they can't
  // create false positives, and real cycles only arise from
  // depends-on / calls / triggers which are also projected.
  const outEdgesMap = new Map<string, string[]>();
  for (const edge of projection.edges) {
    const list = outEdgesMap.get(edge.sourceId);
    if (list) list.push(edge.targetId);
    else outEdgesMap.set(edge.sourceId, [edge.targetId]);
  }

  // Stage 6 — Cycle detection. Now receives real out-edges so
  // cycles in the input graph are actually detected (G5 close).
  const s6 = startStage('detect-cycles');
  const cycleResult = detectCycles({
    nodes: resolved.nodes,
    outEdges: outEdgesMap as Map<string, readonly string[]>,
    bb3Version: BB3_VERSION,
  });
  // Attach self-loop warnings.
  for (const id of cycleResult.selfLoopNodeIds) {
    const n = cycleResult.nodes.find((x) => x.id === id);
    if (n && !n.warnings.includes('self-loop-detected')) {
      n.warnings.push('self-loop-detected');
    }
  }
  endStage(s6, stageDurations);

  // Stage 7 — Reference index + projected edges.
  // PH9.4: projection already ran above. We still call buildIndex
  // so the reference index + synthetic-edge merge happens over the
  // post-cycle node list; buildIndex will re-project here over the
  // same (now larger) node list — the newly added CyclicDependency
  // groups have no projected NodeRef fields so the result is
  // identical for projected edges, plus the synthetic cycle-contains
  // edges from Stage 6. The double projection is a few microseconds
  // and keeps Stage 7's contract stable for PH3.8 tests.
  const s7 = startStage('build-index');
  const idx = buildIndex({
    nodes: cycleResult.nodes,
    syntheticEdges: cycleResult.syntheticEdges,
    projectedDescriptors: descriptors,
  });
  diagnostics.push(...idx.diagnostics);
  endStage(s7, stageDurations);

  // Stage 8 — Validator.
  const s8 = startStage('validate');
  const validation = validateGraph(
    { nodes: cycleResult.nodes, edges: idx.edges, referenceIndex: idx.referenceIndex },
    {
      strict: options.strict ?? false,
      hasCatalog: catalogCtx.catalog !== null,
      ...(options.unresolvedRatioThreshold !== undefined && {
        unresolvedRatioThreshold: options.unresolvedRatioThreshold,
      }),
    }
  );
  diagnostics.push(...validation.diagnostics);
  endStage(s8, stageDurations);

  if (options.strict && validation.errorCount > 0) {
    throw new BB3InputError(`strict mode: validator reported ${validation.errorCount} error(s)`, {
      code: 'BB3_S001',
      errorCount: validation.errorCount,
    });
  }

  // Stage 9 — Envelope assembly.
  const s9 = startStage('assemble');
  const cycleCount = cycleResult.nodes.filter((n) => n.nodeType === 'CyclicDependency').length;
  const metadata: GraphMetadataIR = {
    collectorCoverage: {},
    collectorWarnings: {},
    degradedInputs: catalogCtx.warnings.map((reason) => ({
      source: 'schema-catalog' as const,
      identifier: 'schema-catalog',
      reason,
      severity: 'warn' as const,
    })),
    quarantineCount: quarantine.length,
    totalFindingsConsumed: validFindings.length,
    totalIRNodesEmitted: cycleResult.nodes.length,
    cycleCount,
    unknownArtifactCount: quarantine.filter((q) => q.reason === 'unknown-artifact').length,
    unresolvedRefCount: idx.unresolvedRefCount,
    // PH9.6 — canonical-JSON SHA-256 of the input catalog (or null
    // when no catalog was supplied). BB-17 re-assessment compares
    // this across runs to detect catalog drift.
    schemaCatalogHash: catalogCtx.hash,
  };

  const extractedAt =
    options.extractedAt ??
    // This is the ONE allowed wall-clock call inside BB-3's output path —
    // the spec carves out `extractedAt` as the single nondeterministic field.
    new Date().toISOString();

  const { graph, serialized } = assembleEnvelope({
    bb3Version: BB3_VERSION,
    extractedAt,
    nodes: cycleResult.nodes,
    edges: idx.edges as readonly IREdge[],
    referenceIndex: idx.referenceIndex,
    metadata,
    quarantine,
  });
  endStage(s9, stageDurations);

  const runtimeStats: RuntimeStats = {
    durationMs: now() - pipelineStart,
    stageDurations,
    totalFindingsIn: Array.isArray(findings) ? findings.length : 0,
    totalNodesOut: graph.nodes.length,
    quarantineCount: quarantine.length,
    bb3Version: BB3_VERSION,
  };

  return { graph, runtimeStats, diagnostics, quarantine, serialized };
}
