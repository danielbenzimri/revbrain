#!/usr/bin/env npx tsx
/**
 * Phase 4.1 — Graph edge diagnosis (docs/PDF-AND-GRAPH-DECISIONS.md
 * decision 4).
 *
 * Runs BB-3 `normalize()` over a cached staging findings snapshot
 * and dumps a one-page diagnostic report explaining why the graph
 * contains N nodes but zero (or very few) edges.
 *
 * This is NOT a fix. It is the precondition for a fix: we cannot
 * pick the correct layer to repair (collector / normalizer /
 * descriptor / parent-lookup / projector) until we know WHICH one
 * is silently dropping data on real Salesforce data.
 *
 * Usage:
 *   npx tsx apps/worker/scripts/diagnose-graph-edges.ts \
 *     [--input=apps/worker/output/assessment-results.json] \
 *     [--verbose]
 *
 * Output goes to stdout. Pipe to a file if you want to save it.
 *
 * What it reports (in one run):
 *
 *   1. Pipeline summary — nodes in, edges out, orphan count,
 *      quarantine count, diagnostic count by severity
 *   2. Nodes by type — full histogram, sorted
 *   3. Edges by type — full histogram, sorted
 *   4. Per-parent-type array population — how many parent nodes
 *      have their children arrays populated, vs how many are
 *      still empty after Stage 4
 *   5. Per-child-type back-pointer state — resolved / unresolved
 *      histogram per child nodeType
 *   6. Descriptor coverage — for every field in
 *      DEFAULT_NODE_REF_DESCRIPTORS, how many nodes across all
 *      types have that field populated with at least one resolved
 *      ref
 *   7. PARENT_WIRING_RULES activity — per rule, how many child
 *      drafts entered Stage 4 and how many parents were indexed
 *   8. Orphaned children — full list with classification reason
 *   9. Candidate root causes — the script guesses the failure
 *      mode (empty child drafts, missing parent index, missing
 *      descriptor, etc.) and prints one-line explanations
 *
 * Budget: under 5 seconds on the 3598-finding staging snapshot.
 * Never mutates state. Never hits the network or the database.
 */

import { readFileSync } from 'node:fs';
import {
  normalize,
  DEFAULT_NODE_REF_DESCRIPTORS,
  PARENT_WIRING_RULES,
} from '@revbrain/bb3-normalizer';
import type { AssessmentFindingInput } from '@revbrain/contract';
import type { IRGraph, IRNode, NodeRef } from '@revbrain/migration-ir-contract';

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.split('=');
    return [k.replace(/^--/, ''), v ?? 'true'];
  })
);

const inputPath: string = args.input ?? 'apps/worker/output/assessment-results.json';
const verbose: boolean = args.verbose === 'true';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isNodeRef(v: unknown): v is NodeRef {
  return typeof v === 'object' && v !== null && typeof (v as NodeRef).resolved === 'boolean';
}

function extractRefs(node: IRNode, fieldName: string): NodeRef[] {
  const v = (node as unknown as Record<string, unknown>)[fieldName];
  if (v === null || v === undefined) return [];
  if (Array.isArray(v)) return v.filter(isNodeRef);
  if (isNodeRef(v)) return [v];
  return [];
}

function pct(num: number, denom: number): string {
  if (denom === 0) return '—';
  return `${((num / denom) * 100).toFixed(1)}%`;
}

function section(title: string): void {
  console.log('\n' + '='.repeat(72));
  console.log(title);
  console.log('='.repeat(72));
}

function hr(): void {
  console.log('-'.repeat(72));
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  section('Phase 4.1 — Graph Edge Diagnosis');
  console.log(`Input: ${inputPath}`);

  const raw = JSON.parse(readFileSync(inputPath, 'utf-8')) as {
    findings?: AssessmentFindingInput[];
  };
  const findings: AssessmentFindingInput[] = raw.findings ?? [];
  console.log(`Findings loaded: ${findings.length}`);

  // ---- Run normalize ------------------------------------------------------
  console.log('\nRunning BB-3 normalize()...');
  const t0 = Date.now();
  const result = await normalize(findings, {
    extractedAt: '2026-04-11T00:00:00Z',
    maxInvalidRate: 1,
  });
  const elapsedMs = Date.now() - t0;
  console.log(`  → ${elapsedMs} ms`);

  const graph: IRGraph = result.graph;

  // ---- 1. Pipeline summary -----------------------------------------------
  section('1. Pipeline summary');
  console.log(`Findings in:            ${findings.length}`);
  console.log(`Valid after gate:       ${result.runtimeStats.totalFindingsIn}`);
  console.log(`Nodes out:              ${graph.nodes.length}`);
  console.log(`Edges out:              ${graph.edges.length}`);
  console.log(`Quarantine entries:     ${graph.quarantine.length}`);
  console.log(`Unresolved refs:        ${graph.metadata.unresolvedRefCount}`);
  console.log(`Diagnostics:            ${result.diagnostics.length}`);
  const diagBySeverity = new Map<string, number>();
  for (const d of result.diagnostics) {
    diagBySeverity.set(d.severity, (diagBySeverity.get(d.severity) ?? 0) + 1);
  }
  for (const [sev, count] of [...diagBySeverity.entries()].sort()) {
    console.log(`  ${sev.padEnd(10)} ${count}`);
  }

  // ---- 2. Nodes by type ---------------------------------------------------
  section('2. Nodes by type');
  const nodesByType = new Map<string, number>();
  for (const n of graph.nodes) {
    nodesByType.set(n.nodeType, (nodesByType.get(n.nodeType) ?? 0) + 1);
  }
  const sortedNodeTypes = [...nodesByType.entries()].sort((a, b) => b[1] - a[1]);
  for (const [type, count] of sortedNodeTypes) {
    console.log(`  ${String(count).padStart(6)}  ${type}`);
  }

  // ---- 3. Edges by type ---------------------------------------------------
  section('3. Edges by type');
  if (graph.edges.length === 0) {
    console.log('  (none — THIS IS THE BUG)');
  } else {
    const edgesByType = new Map<string, number>();
    for (const e of graph.edges) {
      edgesByType.set(e.edgeType, (edgesByType.get(e.edgeType) ?? 0) + 1);
    }
    for (const [type, count] of [...edgesByType.entries()].sort((a, b) => b[1] - a[1])) {
      console.log(`  ${String(count).padStart(6)}  ${type}`);
    }
  }

  // ---- 4. Per-parent-type array population -------------------------------
  section('4. Parent-array population (post-Stage 4)');
  console.log('For every DEFAULT_NODE_REF_DESCRIPTORS field, count nodes that have');
  console.log('the field populated with at least one RESOLVED NodeRef.');
  hr();
  console.log('  field                          nodes_with_field  resolved  unresolved');
  hr();
  const fieldStats = new Map<
    string,
    { nodesWithField: number; resolvedRefs: number; unresolvedRefs: number }
  >();
  for (const d of DEFAULT_NODE_REF_DESCRIPTORS) {
    fieldStats.set(d.fieldName, { nodesWithField: 0, resolvedRefs: 0, unresolvedRefs: 0 });
  }
  for (const node of graph.nodes) {
    for (const d of DEFAULT_NODE_REF_DESCRIPTORS) {
      const refs = extractRefs(node, d.fieldName);
      if (refs.length === 0) continue;
      const s = fieldStats.get(d.fieldName)!;
      s.nodesWithField += 1;
      for (const r of refs) {
        if (r.resolved) s.resolvedRefs += 1;
        else s.unresolvedRefs += 1;
      }
    }
  }
  for (const d of DEFAULT_NODE_REF_DESCRIPTORS) {
    const s = fieldStats.get(d.fieldName)!;
    console.log(
      `  ${d.fieldName.padEnd(30)} ${String(s.nodesWithField).padStart(16)}  ${String(s.resolvedRefs).padStart(8)}  ${String(s.unresolvedRefs).padStart(10)}`
    );
  }

  // ---- 5. Per-child-type back-pointer state ------------------------------
  section('5. Back-pointer state on child nodes (post-Stage 4)');
  console.log('For every (childNodeType, backPointerField) in PARENT_WIRING_RULES,');
  console.log('classify the back-pointer state on every child node of that type.');
  hr();
  console.log(
    '  childType.field                         child_count  resolved  unresolved  missing'
  );
  hr();
  for (const rule of PARENT_WIRING_RULES) {
    let childCount = 0;
    let resolved = 0;
    let unresolved = 0;
    let missing = 0;
    for (const node of graph.nodes) {
      if (node.nodeType !== rule.childNodeType) continue;
      childCount += 1;
      const v = (node as unknown as Record<string, unknown>)[rule.childBackPointerField];
      if (!isNodeRef(v)) {
        missing += 1;
        continue;
      }
      if (v.resolved) resolved += 1;
      else unresolved += 1;
    }
    const label = `${rule.childNodeType}.${rule.childBackPointerField}`.padEnd(40);
    console.log(
      `  ${label} ${String(childCount).padStart(11)}  ${String(resolved).padStart(8)}  ${String(unresolved).padStart(10)}  ${String(missing).padStart(7)}`
    );
  }

  // ---- 6. Parent index coverage ------------------------------------------
  section('6. Parent index coverage (what parent-lookup sees)');
  console.log('For every PARENT_WIRING_RULES rule, how many parents exist in the');
  console.log('post-Stage-4 graph, and how many of those would be indexed (i.e.');
  console.log('parentKeyExtractor returns at least one key).');
  hr();
  console.log(
    '  rule                                          parents  indexed  unindexed  orphans'
  );
  hr();
  const orphansByChildType = new Map<string, number>();
  for (const q of graph.quarantine) {
    if (q.reason === 'orphaned-reference') {
      orphansByChildType.set(q.artifactType, (orphansByChildType.get(q.artifactType) ?? 0) + 1);
    }
  }
  for (const rule of PARENT_WIRING_RULES) {
    let parentCount = 0;
    let indexedCount = 0;
    for (const node of graph.nodes) {
      if (node.nodeType !== rule.parentNodeType) continue;
      parentCount += 1;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const keys = rule.parentKeyExtractor(node as any);
      if (keys.length > 0) indexedCount += 1;
    }
    const label = `${rule.childNodeType} → ${rule.parentNodeType}`.padEnd(46);
    console.log(
      `  ${label} ${String(parentCount).padStart(7)}  ${String(indexedCount).padStart(7)}  ${String(parentCount - indexedCount).padStart(9)}  ${String(orphansByChildType.get(rule.childNodeType) ?? 0).padStart(7)}`
    );
  }

  // ---- 7. Orphan quarantine (full list if verbose) -----------------------
  section('7. Orphaned-reference quarantine entries');
  const orphanEntries = graph.quarantine.filter((q) => q.reason === 'orphaned-reference');
  console.log(`Total: ${orphanEntries.length}`);
  if (orphanEntries.length > 0) {
    const byType = new Map<string, number>();
    for (const o of orphanEntries) {
      byType.set(o.artifactType, (byType.get(o.artifactType) ?? 0) + 1);
    }
    for (const [type, count] of [...byType.entries()].sort((a, b) => b[1] - a[1])) {
      console.log(`  ${String(count).padStart(6)}  ${type}`);
    }
    if (verbose) {
      console.log('\n  First 10 orphan details:');
      for (const o of orphanEntries.slice(0, 10)) {
        console.log(`    - ${o.artifactType} (${o.findingKey}): ${o.detail}`);
      }
    }
  }

  // ---- 8. Sample nodes (verbose only) ------------------------------------
  if (verbose) {
    section('8. Sample nodes (first 3 of each type with descriptor fields)');
    for (const [nodeType] of sortedNodeTypes.slice(0, 15)) {
      const examples = graph.nodes.filter((n) => n.nodeType === nodeType).slice(0, 3);
      if (examples.length === 0) continue;
      console.log(`\n  [${nodeType}]`);
      for (const ex of examples) {
        const interesting: Record<string, unknown> = {};
        for (const d of DEFAULT_NODE_REF_DESCRIPTORS) {
          const v = (ex as unknown as Record<string, unknown>)[d.fieldName];
          if (v !== undefined && v !== null) interesting[d.fieldName] = v;
        }
        for (const rule of PARENT_WIRING_RULES) {
          if (rule.childNodeType !== nodeType) continue;
          const v = (ex as unknown as Record<string, unknown>)[rule.childBackPointerField];
          if (v !== undefined && v !== null) interesting[rule.childBackPointerField] = v;
        }
        console.log(
          `    ${ex.id.slice(0, 28).padEnd(28)} ${JSON.stringify(interesting).slice(0, 100)}`
        );
      }
    }
  }

  // ---- 9. Root-cause guess -----------------------------------------------
  section('9. Root-cause guess');
  const guesses: string[] = [];

  if (graph.edges.length === 0) {
    guesses.push('CONFIRMED: graph.edges is empty.');
  }

  // Check if any PARENT_WIRING rule finds zero children of that type
  let wiringZeroChildren = 0;
  for (const rule of PARENT_WIRING_RULES) {
    const childCount = graph.nodes.filter((n) => n.nodeType === rule.childNodeType).length;
    if (childCount === 0) wiringZeroChildren += 1;
  }
  if (wiringZeroChildren === PARENT_WIRING_RULES.length) {
    guesses.push(
      'ALL PARENT_WIRING_RULES have zero child nodes in the output graph. The normalizers that produce parent→child relationships (PriceCondition, PriceAction, BundleOption, BundleFeature, DiscountTier) are NOT being emitted by Stage 3. Check whether the upstream extraction is emitting the raw artifact types those normalizers consume, AND whether normalizers are registered.'
    );
  } else {
    for (const rule of PARENT_WIRING_RULES) {
      const childCount = graph.nodes.filter((n) => n.nodeType === rule.childNodeType).length;
      if (childCount === 0) {
        guesses.push(
          `Rule ${rule.childNodeType}.${rule.childBackPointerField} → ${rule.parentNodeType}.${rule.parentChildrenField}: zero child nodes of type ${rule.childNodeType} in the output.`
        );
      }
    }
  }

  // Check if any descriptor field is populated on any node
  const anyFieldPopulated = [...fieldStats.values()].some((s) => s.resolvedRefs > 0);
  if (!anyFieldPopulated) {
    guesses.push(
      'CONFIRMED: zero nodes have any DEFAULT_NODE_REF_DESCRIPTORS field populated with a resolved NodeRef. Either (a) the normalizers that should populate these fields are not running, (b) Stage 4 parent-lookup is not appending children into parent arrays, or (c) the node types that carry these fields are not present in the graph.'
    );
  }

  // Are there parent-type nodes in the graph at all?
  for (const rule of PARENT_WIRING_RULES) {
    const parentCount = graph.nodes.filter((n) => n.nodeType === rule.parentNodeType).length;
    if (parentCount === 0) {
      guesses.push(
        `Rule ${rule.parentNodeType}: zero parent nodes of this type in the output. Cannot wire ${rule.childNodeType} even if children exist.`
      );
    }
  }

  if (guesses.length === 0) {
    guesses.push(
      'No obvious structural explanation from the aggregate counts. Re-run with --verbose to inspect sample nodes.'
    );
  }

  for (const g of guesses) {
    console.log('  • ' + g);
  }

  // ---- 10. Quick-glance closing summary ----------------------------------
  section('Closing summary');
  console.log(
    `nodes=${graph.nodes.length} edges=${graph.edges.length} quarantine=${graph.quarantine.length} unresolvedRefs=${graph.metadata.unresolvedRefCount}`
  );
  console.log(
    `coverage: ${pct(
      [...fieldStats.values()].reduce((a, s) => a + s.resolvedRefs, 0),
      graph.nodes.length
    )} of nodes reference-count ratio`
  );
  console.log(`pipeline: ${elapsedMs} ms · bb3Version=${result.runtimeStats.bb3Version}`);
}

main().catch((err) => {
  console.error('diagnose-graph-edges FATAL:', err);
  process.exit(1);
});
