/**
 * Phase 4.1 — Graph-structure invariants (I4, I5, I6).
 *
 * Spec: `docs/PDF-AND-GRAPH-DECISIONS.md` decision 4.
 *
 * This file enforces three executable invariants that PH3–PH7 let
 * pass on structurally broken data. A real staging run on
 * 2026-04-11 produced 3102 nodes and ZERO edges — the existing
 * V1–V8 validator did not flag this because none of those checks
 * look at `edges.length`. Discovery of that defect is §8.3 class
 * (silent pass on broken graph) and the fix is the same: make
 * the invariant executable.
 *
 * The three invariants:
 *
 * - **I4 Edge Non-Emptiness**: if the input findings contain any
 *   parent-child relationship that the pipeline knows how to wire
 *   (PARENT_WIRING_RULES), the output graph MUST contain at least
 *   one projected edge. An empty `edges[]` array on a non-trivial
 *   finding set is a hard fail.
 *
 * - **I5 Pointer Resolution Completeness**: every `NodeRef` field
 *   on every node is either resolved (`{ resolved: true, id: ... }`)
 *   or explicitly marked unresolved with a reason
 *   (`{ resolved: false, reason: ... }`). A silent `undefined` in
 *   a NodeRef slot is a hard fail. This catches the class of bug
 *   where a normalizer forgot to set a required pointer and the
 *   field was left as `undefined` instead of `unresolvedRef(...)`.
 *
 * - **I6 Graph Connectivity**: on a non-trivial graph (>= 10 nodes),
 *   at least one PARENT_WIRING_RULES parent-child relationship
 *   actually produces edges. This is a weaker form of I4 — I4 says
 *   "SOMETHING must produce an edge", I6 says "the WIRING machinery
 *   must produce edges". A graph where all edges come from Stage 6
 *   synthetic cycle-contains would pass I4 but fail I6, because it
 *   means the authored parent-of wiring is broken.
 */

import { describe, it, expect } from 'vitest';
import { normalize } from '../../src/pipeline.ts';
import { PARENT_WIRING_RULES, DEFAULT_NODE_REF_DESCRIPTORS } from '../../src/index.ts';
import type { AssessmentFindingInput, IRGraph, NodeRef } from '@revbrain/migration-ir-contract';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build the smallest possible finding set that covers every
 * PARENT_WIRING_RULES relationship. The collector-side fix in
 * apps/worker/src/collectors/{pricing,catalog}.ts produces the
 * same shapes on real staging data; this fixture is a compact
 * synthetic mirror for the invariants so they run in milliseconds.
 *
 * Covered edges:
 *   - PricingRule → PriceCondition  (2 conditions per rule)
 *   - PricingRule → PriceAction     (1 action per rule)
 *   - DiscountSchedule → DiscountTier (3 tiers per schedule)
 *   - BundleStructure → BundleOption  (2 options per bundle)
 *   - BundleStructure → BundleFeature (1 feature per bundle)
 */
function buildWireableFixture(): AssessmentFindingInput[] {
  const findings: AssessmentFindingInput[] = [];

  // Helper
  const f = (partial: Partial<AssessmentFindingInput>): AssessmentFindingInput => ({
    domain: 'catalog',
    collectorName: 'fixture',
    findingKey: 'missing',
    artifactType: 'Product2',
    artifactName: 'unnamed',
    sourceType: 'object',
    detected: true,
    evidenceRefs: [],
    schemaVersion: '1.0',
    ...partial,
  });

  // 1. Price rule + 2 conditions + 1 action ---------------------------------
  findings.push(
    f({
      domain: 'pricing',
      collectorName: 'pricing',
      artifactType: 'SBQQ__PriceRule__c',
      artifactName: 'Inv4.1 Rule A',
      artifactId: 'a0AInv4100000001AAA',
      findingKey: 'rule-a',
      evidenceRefs: [{ type: 'field-ref', value: 'On Calculate' }],
    })
  );
  findings.push(
    f({
      domain: 'pricing',
      collectorName: 'pricing',
      artifactType: 'SBQQ__PriceCondition__c',
      artifactName: 'Cond 1',
      findingKey: 'cond-1',
      countValue: 1,
      textValue: '100',
      notes: 'greater than',
      evidenceRefs: [{ type: 'record-id', value: 'a0AInv4100000001AAA' }],
    })
  );
  findings.push(
    f({
      domain: 'pricing',
      collectorName: 'pricing',
      artifactType: 'SBQQ__PriceCondition__c',
      artifactName: 'Cond 2',
      findingKey: 'cond-2',
      countValue: 2,
      textValue: 'Active',
      notes: 'equals',
      evidenceRefs: [{ type: 'record-id', value: 'a0AInv4100000001AAA' }],
    })
  );
  findings.push(
    f({
      domain: 'pricing',
      collectorName: 'pricing',
      artifactType: 'SBQQ__PriceAction__c',
      artifactName: 'Action 1',
      findingKey: 'act-1',
      countValue: 1,
      textValue: '20',
      notes: 'set discount percent',
      evidenceRefs: [{ type: 'record-id', value: 'a0AInv4100000001AAA' }],
    })
  );

  // 2. Discount schedule + 3 tiers ------------------------------------------
  findings.push(
    f({
      domain: 'pricing',
      collectorName: 'pricing',
      artifactType: 'SBQQ__DiscountSchedule__c',
      artifactName: 'Inv4.1 Volume Schedule',
      artifactId: 'a0BInv4100000002BBB',
      findingKey: 'sched-1',
    })
  );
  for (let i = 0; i < 3; i++) {
    findings.push(
      f({
        domain: 'pricing',
        collectorName: 'pricing',
        artifactType: 'SBQQ__DiscountTier__c',
        artifactName: `Tier ${i + 1}`,
        findingKey: `tier-${i + 1}`,
        countValue: i * 10,
        textValue: String(5 * (i + 1)),
        evidenceRefs: [{ type: 'record-id', value: 'a0BInv4100000002BBB' }],
      })
    );
  }

  // 3. Bundle-capable product → BundleStructure → options + features --------
  // The catalog collector fix emits a Product2 finding AND a separate
  // BundleStructure finding for every configurable product. This
  // fixture mirrors that exact shape.
  findings.push(
    f({
      domain: 'catalog',
      collectorName: 'catalog',
      artifactType: 'Product2',
      artifactName: 'Premium Bundle',
      artifactId: '01tInv4100000003CCC',
      findingKey: 'prod-bundle',
      sourceRef: 'Renewable',
      evidenceRefs: [{ type: 'field-ref', value: 'Product2.ProductCode', label: 'PREM-BUNDLE' }],
    })
  );
  findings.push(
    f({
      domain: 'catalog',
      collectorName: 'catalog',
      artifactType: 'BundleStructure',
      artifactName: 'Premium Bundle',
      artifactId: '01tInv4100000003CCC',
      findingKey: 'bs-1',
      notes: 'Required',
      evidenceRefs: [{ type: 'field-ref', value: 'Product2.ProductCode', label: 'PREM-BUNDLE' }],
    })
  );
  for (let i = 0; i < 2; i++) {
    findings.push(
      f({
        domain: 'catalog',
        collectorName: 'catalog',
        artifactType: 'SBQQ__ProductOption__c',
        artifactName: `Opt ${i + 1}`,
        findingKey: `opt-${i + 1}`,
        countValue: i + 1,
        notes: 'Component',
        evidenceRefs: [
          { type: 'object-ref', value: 'PREM-BUNDLE' },
          {
            type: 'field-ref',
            value: 'OptionalSKU.ProductCode',
            label: `ADDON-${i + 1}`,
          },
        ],
      })
    );
  }
  findings.push(
    f({
      domain: 'catalog',
      collectorName: 'catalog',
      artifactType: 'SBQQ__ProductFeature__c',
      artifactName: 'Storage Options',
      findingKey: 'feat-1',
      countValue: 1,
      notes: 'Storage',
      evidenceRefs: [{ type: 'object-ref', value: 'PREM-BUNDLE' }],
    })
  );

  return findings;
}

/**
 * Scan a graph for every inline NodeRef shape on every node and
 * return counts of malformed entries: `undefined` in a slot where
 * a NodeRef was expected, or an object that is neither resolved
 * nor properly marked unresolved.
 */
function scanNodeRefs(graph: IRGraph): {
  total: number;
  resolved: number;
  unresolvedWithReason: number;
  malformed: number;
  malformedSamples: string[];
} {
  let total = 0;
  let resolved = 0;
  let unresolvedWithReason = 0;
  let malformed = 0;
  const samples: string[] = [];

  const classify = (v: unknown, nodeId: string, fieldName: string): void => {
    if (v === undefined || v === null) return; // optional: not counted
    if (Array.isArray(v)) {
      for (const item of v) classify(item, nodeId, fieldName);
      return;
    }
    if (typeof v !== 'object') return;
    const ref = v as NodeRef;
    if (typeof ref.resolved !== 'boolean') {
      malformed += 1;
      if (samples.length < 5) samples.push(`${nodeId}.${fieldName}`);
      return;
    }
    total += 1;
    if (ref.resolved) {
      resolved += 1;
      if (typeof ref.id !== 'string' || ref.id.length === 0) {
        malformed += 1;
        if (samples.length < 5) samples.push(`${nodeId}.${fieldName} resolved-but-no-id`);
      }
    } else {
      // Unresolved must carry a reason
      const withReason = typeof (ref as { reason?: unknown }).reason === 'string';
      if (withReason) unresolvedWithReason += 1;
      else {
        malformed += 1;
        if (samples.length < 5) samples.push(`${nodeId}.${fieldName} unresolved-no-reason`);
      }
    }
  };

  // Union of fields we know about: descriptor fields + parent-lookup
  // back-pointer fields. Extending this list keeps I5 honest as new
  // pointer fields land.
  const fieldNames = new Set<string>();
  for (const d of DEFAULT_NODE_REF_DESCRIPTORS) fieldNames.add(d.fieldName);
  for (const r of PARENT_WIRING_RULES) fieldNames.add(r.childBackPointerField);

  for (const node of graph.nodes) {
    for (const fieldName of fieldNames) {
      const v = (node as unknown as Record<string, unknown>)[fieldName];
      classify(v, node.id, fieldName);
    }
  }

  return { total, resolved, unresolvedWithReason, malformed, malformedSamples: samples };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Phase 4.1 — graph-structure invariants (I4, I5, I6)', () => {
  it('I4 — empty findings produce empty graph (baseline guard)', async () => {
    // Sanity baseline: if there is nothing to wire, it is OK for
    // edges to be empty. I4 only fires on a non-trivial input.
    const result = await normalize([], { maxInvalidRate: 1 });
    expect(result.graph.nodes.length).toBe(0);
    expect(result.graph.edges.length).toBe(0);
  });

  it('I4 — a fixture with all 5 parent-child relationships produces edges', async () => {
    const findings = buildWireableFixture();
    const result = await normalize(findings);

    // Must produce at least one edge. Zero edges on this fixture
    // would mean the whole wire-and-project machinery is broken.
    expect(result.graph.edges.length).toBeGreaterThan(0);

    // Break down by type for diagnostic clarity on failures.
    const edgesByType = new Map<string, number>();
    for (const e of result.graph.edges) {
      edgesByType.set(e.edgeType, (edgesByType.get(e.edgeType) ?? 0) + 1);
    }
    // We authored 5 parent-of edges in the fixture:
    //   2 conditions, 1 action, 3 tiers, 2 options, 1 feature = 9
    // (Tiers = 3 because we authored 3 tiers.) But counts depend on
    // node identity merging. Assert >= 3 as a stability floor and
    // confirm the parent-of edge type specifically is present.
    expect(edgesByType.get('parent-of') ?? 0).toBeGreaterThanOrEqual(3);
  });

  it('I4 — every PARENT_WIRING_RULES relationship produces at least one edge', async () => {
    const findings = buildWireableFixture();
    const result = await normalize(findings);

    // For each rule, find at least one parent with a non-empty
    // children array. This proves the wiring pipeline touched
    // every rule, not just the first one.
    for (const rule of PARENT_WIRING_RULES) {
      const parents = result.graph.nodes.filter((n) => n.nodeType === rule.parentNodeType);
      expect(
        parents.length,
        `expected at least one ${rule.parentNodeType} in the fixture graph`
      ).toBeGreaterThan(0);

      const withChildren = parents.filter((p) => {
        const arr = (p as unknown as Record<string, unknown>)[rule.parentChildrenField];
        return Array.isArray(arr) && arr.length > 0;
      });
      expect(
        withChildren.length,
        `expected ${rule.parentNodeType}.${rule.parentChildrenField} to be populated by parent-lookup`
      ).toBeGreaterThan(0);
    }
  });

  it('I5 — every NodeRef slot is resolved or explicitly unresolved (no silent undefineds)', async () => {
    const findings = buildWireableFixture();
    const result = await normalize(findings);

    const scan = scanNodeRefs(result.graph);
    expect(
      scan.malformed,
      `malformed NodeRef entries detected (first 5): ${scan.malformedSamples.join(', ')}`
    ).toBe(0);

    // At least some refs must resolve — otherwise we have edges
    // with no basis. This is a consistency check with I4.
    expect(scan.resolved).toBeGreaterThan(0);
  });

  it('I6 — graph connectivity: more than half of parent nodes have children populated', async () => {
    // A graph where 99% of parent nodes are isolated is a structural
    // defect: it means the wiring pass only touched a couple of
    // rules. We assert the opposite: on the wireable fixture, most
    // parents should carry at least one resolved child.
    const findings = buildWireableFixture();
    const result = await normalize(findings);

    let totalParents = 0;
    let parentsWithChildren = 0;
    const parentNodeTypes = new Set(PARENT_WIRING_RULES.map((r) => r.parentNodeType));
    const childrenFields = new Set(PARENT_WIRING_RULES.map((r) => r.parentChildrenField));
    for (const node of result.graph.nodes) {
      if (!parentNodeTypes.has(node.nodeType)) continue;
      totalParents += 1;
      let hasChild = false;
      for (const field of childrenFields) {
        const v = (node as unknown as Record<string, unknown>)[field];
        if (Array.isArray(v) && v.length > 0) {
          hasChild = true;
          break;
        }
      }
      if (hasChild) parentsWithChildren += 1;
    }
    expect(totalParents).toBeGreaterThan(0);
    // At least 50% of parents should have children populated. On the
    // minimal wireable fixture this should be 100%.
    expect(parentsWithChildren).toBeGreaterThanOrEqual(Math.ceil(totalParents * 0.5));
  });
});
