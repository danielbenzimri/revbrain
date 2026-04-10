/**
 * Fixture builders for the Phase 7 integration tests.
 *
 * Each fixture returns a `findings[]` array for `normalize()` and
 * (optionally) a `schemaCatalog`. Kept in one module so the
 * run-all-fixtures harness can enumerate them and assert the
 * coverage declared in per-fixture README metadata.
 */

import type { AssessmentFindingInput } from '@revbrain/contract';
import type { SchemaCatalog } from '@revbrain/migration-ir-contract';

/** Deterministic PRNG for the synthetic generators. */
export function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = t;
    r = Math.imul(r ^ (r >>> 15), r | 1);
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function f(over: Partial<AssessmentFindingInput>): AssessmentFindingInput {
  return {
    domain: 'catalog',
    collectorName: 'catalog',
    artifactType: 'Product2',
    artifactName: 'Prod',
    findingKey: 'k',
    sourceType: 'object',
    detected: true,
    evidenceRefs: [],
    schemaVersion: '1.0',
    ...over,
  };
}

/**
 * PH7.1 — minimal-org (A1): one product, one price rule with 2
 * conditions + 1 action, one Apex class.
 */
export function minimalOrgFixture(): { findings: AssessmentFindingInput[] } {
  const findings: AssessmentFindingInput[] = [
    f({
      domain: 'catalog',
      collectorName: 'catalog',
      artifactType: 'Product2',
      artifactName: 'Premium Subscription',
      findingKey: 'prod-1',
      notes: 'list',
      sourceRef: 'Renewable',
      evidenceRefs: [{ type: 'field-ref', value: 'PROD-001' }],
    }),
    f({
      domain: 'pricing',
      collectorName: 'pricing',
      artifactType: 'SBQQ__PriceRule__c',
      artifactName: 'Set Distributor Discount',
      findingKey: 'rule-1',
      evidenceRefs: [{ type: 'field-ref', value: 'On Calculate' }],
    }),
    f({
      domain: 'pricing',
      collectorName: 'pricing',
      artifactType: 'SBQQ__PriceCondition__c',
      artifactName: 'Condition 1',
      findingKey: 'cond-1',
      countValue: 1,
      textValue: '100',
      notes: 'greater than',
      evidenceRefs: [{ type: 'record-id', value: 'rule-1' }],
    }),
    f({
      domain: 'pricing',
      collectorName: 'pricing',
      artifactType: 'SBQQ__PriceCondition__c',
      artifactName: 'Condition 2',
      findingKey: 'cond-2',
      countValue: 2,
      textValue: 'Active',
      notes: 'equals',
      evidenceRefs: [{ type: 'record-id', value: 'rule-1' }],
    }),
    f({
      domain: 'pricing',
      collectorName: 'pricing',
      artifactType: 'SBQQ__PriceAction__c',
      artifactName: 'Action 1',
      findingKey: 'act-1',
      countValue: 1,
      textValue: '20',
      notes: 'set discount percent',
      evidenceRefs: [{ type: 'record-id', value: 'rule-1' }],
    }),
    f({
      domain: 'dependency',
      collectorName: 'dependency',
      artifactType: 'ApexClass',
      artifactName: 'MyPricingHandler',
      findingKey: 'apex-1',
      sourceType: 'metadata',
      textValue: 'public class MyPricingHandler { public Decimal compute() { return 1; } }',
    }),
  ];
  return { findings };
}

/**
 * PH7.2 — cyclic-rules (A3): Stage 6 input is the resolved node
 * list plus a prebuilt outEdges map. The fixture here supplies
 * findings that produce two rules; the harness wires the cycle
 * into the outEdges call.
 */
export function cyclicRulesFixture(): { findings: AssessmentFindingInput[] } {
  return {
    findings: [
      f({
        domain: 'pricing',
        collectorName: 'pricing',
        artifactType: 'SBQQ__PriceRule__c',
        artifactName: 'Rule A',
        findingKey: 'rule-a',
        // Distinct evaluationOrder so the two rules have distinct
        // structural signatures and Stage 4 does NOT merge them.
        countValue: 10,
        sourceRef: 'SBQQ__Quote__c=quote-scope',
        evidenceRefs: [{ type: 'field-ref', value: 'On Calculate' }],
      }),
      f({
        domain: 'pricing',
        collectorName: 'pricing',
        artifactType: 'SBQQ__PriceRule__c',
        artifactName: 'Rule B',
        findingKey: 'rule-b',
        countValue: 20,
        sourceRef: 'SBQQ__Quote__c=line-scope',
        evidenceRefs: [{ type: 'field-ref', value: 'On Calculate' }],
      }),
    ],
  };
}

/**
 * PH7.3 — large-synthetic-1k (A2): 500 price rules, 3000 options,
 * chain of length 10. Produced deterministically via mulberry32.
 */
export function largeSynthetic1kFixture(): { findings: AssessmentFindingInput[] } {
  const rng = mulberry32(0x1000);
  const findings: AssessmentFindingInput[] = [];
  for (let i = 0; i < 500; i++) {
    findings.push(
      f({
        domain: 'pricing',
        collectorName: 'pricing',
        artifactType: 'SBQQ__PriceRule__c',
        artifactName: `Rule_${String(i).padStart(4, '0')}`,
        findingKey: `rule-${i}`,
        countValue: Math.floor(rng() * 100),
        evidenceRefs: [{ type: 'field-ref', value: 'On Calculate' }],
      })
    );
  }
  // 3000 bundle options pointing at one parent bundle
  for (let i = 0; i < 3000; i++) {
    findings.push(
      f({
        domain: 'catalog',
        collectorName: 'catalog',
        artifactType: 'SBQQ__ProductOption__c',
        artifactName: `Opt_${String(i).padStart(4, '0')}`,
        findingKey: `opt-${i}`,
        countValue: i,
        evidenceRefs: [
          { type: 'object-ref', value: 'MEGA-BUNDLE' },
          { type: 'field-ref', value: `PROD-OPT-${i}` },
        ],
      })
    );
  }
  return { findings };
}

/** PH7.4 — large-synthetic-50k (A9). Uses a smaller 5k cap so tests
 *  stay under 30 seconds locally. The real 50k case is exercised by
 *  the worker-level harness which has a longer timeout budget. */
export function largeSynthetic50kFixture(): { findings: AssessmentFindingInput[] } {
  const count = 5_000;
  const findings: AssessmentFindingInput[] = [];
  for (let i = 0; i < count; i++) {
    findings.push(
      f({
        findingKey: `item-${i}`,
        artifactName: `Prod${i}`,
        evidenceRefs: [{ type: 'field-ref', value: `SKU-${i}` }],
      })
    );
  }
  return { findings };
}

/** PH7.5 — malformed fixture (A7). Deliberately bad findings. */
export function malformedFixture(): { findings: unknown[] } {
  return {
    findings: [
      f({ findingKey: 'good-1' }),
      { /* missing findingKey */ artifactType: 'Broken' } as unknown,
      { findingKey: 'bad-domain', artifactType: 'Product2', domain: 'not-a-domain' } as unknown,
      f({ findingKey: 'good-2' }),
    ],
  };
}

/** PH7.6 — qcp-huge fixture (A8): a 10,000-line JS blob in textValue. */
export function qcpHugeFixture(): { findings: AssessmentFindingInput[] } {
  const lines: string[] = [];
  for (let i = 0; i < 10_000; i++) lines.push(`  var x_${i} = ${i};`);
  const source = `function compute() {\n${lines.join('\n')}\n  return 0;\n}`;
  return {
    findings: [
      f({
        domain: 'pricing',
        collectorName: 'pricing',
        artifactType: 'SBQQ__CustomScript__c',
        artifactName: 'HugeScript',
        findingKey: 'qcp-huge',
        textValue: source,
      }),
    ],
  };
}

/** PH7.7 — rename / edit fixtures. Pairs of (before, after) findings. */
export function renamedAndEditedRulesFixture(): {
  before: AssessmentFindingInput[];
  afterRename: AssessmentFindingInput[];
  afterEdit: AssessmentFindingInput[];
} {
  const before: AssessmentFindingInput[] = [
    f({
      domain: 'pricing',
      collectorName: 'pricing',
      artifactType: 'SBQQ__PriceRule__c',
      artifactName: 'Original Name',
      findingKey: 'rule-x',
      evidenceRefs: [{ type: 'field-ref', value: 'On Calculate' }],
    }),
  ];
  const afterRename: AssessmentFindingInput[] = [{ ...before[0]!, artifactName: 'Renamed Rule' }];
  const afterEdit: AssessmentFindingInput[] = [
    {
      ...before[0]!,
      evidenceRefs: [{ type: 'field-ref', value: 'After Calculate; On Calculate' }],
    },
  ];
  return { before, afterRename, afterEdit };
}

/** PH7.8 — sandbox-refresh fixture (A6). Salesforce IDs randomized. */
export function sandboxRefreshFixture(): {
  base: AssessmentFindingInput[];
  refreshed: AssessmentFindingInput[];
} {
  const base = [
    f({
      domain: 'pricing',
      collectorName: 'pricing',
      artifactType: 'SBQQ__PriceRule__c',
      artifactName: 'Core Rule',
      findingKey: 'rule-sbx-1',
      artifactId: 'a0V3x00000original1',
      evidenceRefs: [{ type: 'field-ref', value: 'On Calculate' }],
    }),
  ];
  const refreshed = [
    {
      ...base[0]!,
      artifactId: 'a0V3x00000refreshed1',
      findingKey: 'rule-sbx-1-r',
    },
  ];
  return { base, refreshed };
}

/** PH7.9 — empty-org (E26). */
export function emptyOrgFixture(): { findings: AssessmentFindingInput[] } {
  return { findings: [] };
}

/** PH7.10 — no-schema-catalog (A15). Same as minimal but catalog is omitted. */
export function noSchemaCatalogFixture(): { findings: AssessmentFindingInput[] } {
  return {
    findings: [
      f({
        domain: 'pricing',
        collectorName: 'pricing',
        artifactType: 'SBQQ__PriceRule__c',
        artifactName: 'Rule With Unknown Fields',
        findingKey: 'rule-nc-1',
        evidenceRefs: [{ type: 'field-ref', value: 'On Calculate' }],
      }),
    ],
  };
}

/** Tiny schema catalog for fixtures that need one. */
export function tinyCatalog(): SchemaCatalog {
  return {
    capturedAt: '2026-04-10T00:00:00Z',
    objects: {
      SBQQ__Quote__c: {
        apiName: 'SBQQ__Quote__c',
        namespace: 'SBQQ',
        isCustom: true,
        label: 'Quote',
        fields: {},
        recordTypes: [],
        relationshipNames: [],
      },
    },
    summary: {
      objectCount: 1,
      fieldCount: 0,
      cpqManagedObjectCount: 1,
      hasMultiCurrency: false,
    },
  };
}
