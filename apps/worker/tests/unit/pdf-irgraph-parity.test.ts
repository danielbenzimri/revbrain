/**
 * PDF ↔ IRGraph parity test (CTO directive 2026-04-11).
 *
 * The two paths that consume `AssessmentFindingInput[]` are:
 *
 *   1. `assembleReport()` — used by the worker to render the
 *      assessment PDF for human consumption.
 *   2. `normalize()` from `@revbrain/bb3-normalizer` — used by
 *      BB-3 to produce the structured `IRGraph` that downstream
 *      building blocks (BB-4 segmentation, BB-5 disposition,
 *      BB-6 RCA emission) consume.
 *
 * These paths MUST agree on the headline counts. The bug we
 * shipped to production (PH9 §8.3) was that the IR was missing
 * 215 of 250 staging findings while the PDF reported the correct
 * counts — a silent divergence that would have poisoned every
 * downstream building block.
 *
 * This test catches that class of divergence by running both
 * paths over the SAME staging fixture and asserting that, for
 * every artifactType the PDF surfaces a count for, the IR has
 * the corresponding number of nodes.
 *
 * Why it lives in the worker package and not bb3-normalizer:
 * `assembleReport` lives in apps/worker, and worker depends on
 * bb3-normalizer. The reverse direction would create a cycle.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { AssessmentFindingInput } from '@revbrain/contract';
import { normalize } from '@revbrain/bb3-normalizer';
import { assembleReport } from '../../src/report/assembler.ts';

const STAGING_FIXTURE = resolve(
  __dirname,
  '../../../../packages/bb3-normalizer/__tests__/fixtures/staging-findings.json'
);

function loadStaging(): AssessmentFindingInput[] {
  return JSON.parse(readFileSync(STAGING_FIXTURE, 'utf8')) as AssessmentFindingInput[];
}

/**
 * Count IR nodes whose evidence sources include any finding of
 * the given artifactType. This walks the BB-3 source-trace
 * (`evidence.sourceFindingKeys`) so the comparison is robust to
 * whatever node type the normalizer chose.
 */
function countIRNodesForArtifactType(
  graph: { nodes: ReadonlyArray<{ evidence: { sourceFindingKeys: ReadonlyArray<string> } }> },
  findings: AssessmentFindingInput[],
  artifactType: string
): number {
  const keysOfType = new Set(
    findings.filter((f) => f.artifactType === artifactType).map((f) => f.findingKey)
  );
  let count = 0;
  for (const node of graph.nodes) {
    if (node.evidence.sourceFindingKeys.some((k) => keysOfType.has(k))) count++;
  }
  return count;
}

describe('PDF ↔ IRGraph parity (CTO directive 2026-04-11)', () => {
  it('Product2 findings → totalProducts in PDF and Product nodes in IR are equal', async () => {
    const findings = loadStaging();
    const report = assembleReport(findings);
    const result = await normalize(findings, {
      extractedAt: '2026-04-11T00:00:00Z',
      maxInvalidRate: 1,
    });
    const irProductCount = countIRNodesForArtifactType(result.graph, findings, 'Product2');
    expect(irProductCount).toBe(report.counts.totalProducts);
  });

  it('SBQQ__ProductRule__c findings → totalProductRules in PDF and IR nodes from the same findings are equal', async () => {
    const findings = loadStaging();
    const report = assembleReport(findings);
    const result = await normalize(findings, {
      extractedAt: '2026-04-11T00:00:00Z',
      maxInvalidRate: 1,
    });
    const irProductRuleCount = countIRNodesForArtifactType(
      result.graph,
      findings,
      'SBQQ__ProductRule__c'
    );
    // The PDF reports `totalProductRules` from `get('ProductRule', 'SBQQ__ProductRule__c')`.
    // The fixture uses the full SF API name, so a single artifactType is enough.
    expect(irProductRuleCount).toBe(report.counts.totalProductRules);
  });

  it('SBQQ__PriceRule__c findings → totalPriceRules in PDF and PricingRule nodes in IR are equal', async () => {
    const findings = loadStaging();
    const report = assembleReport(findings);
    const result = await normalize(findings, {
      extractedAt: '2026-04-11T00:00:00Z',
      maxInvalidRate: 1,
    });
    const irPriceRuleCount = countIRNodesForArtifactType(
      result.graph,
      findings,
      'SBQQ__PriceRule__c'
    );
    expect(irPriceRuleCount).toBe(report.counts.totalPriceRules);
  });

  it('ApexClass findings → apexClassCount in PDF and Automation/ApexClass nodes in IR are equal', async () => {
    const findings = loadStaging();
    const report = assembleReport(findings);
    const result = await normalize(findings, {
      extractedAt: '2026-04-11T00:00:00Z',
      maxInvalidRate: 1,
    });
    const irApexClassCount = countIRNodesForArtifactType(result.graph, findings, 'ApexClass');
    expect(irApexClassCount).toBe(report.counts.apexClassCount);
  });

  it('ApexTrigger findings → triggerCount in PDF and Automation/ApexTrigger nodes in IR are equal', async () => {
    const findings = loadStaging();
    const report = assembleReport(findings);
    const result = await normalize(findings, {
      extractedAt: '2026-04-11T00:00:00Z',
      maxInvalidRate: 1,
    });
    const irTriggerCount = countIRNodesForArtifactType(result.graph, findings, 'ApexTrigger');
    expect(irTriggerCount).toBe(report.counts.triggerCount);
  });

  it('ValidationRule findings → validationRuleCount in PDF and ValidationRule nodes in IR are equal', async () => {
    const findings = loadStaging();
    const report = assembleReport(findings);
    const result = await normalize(findings, {
      extractedAt: '2026-04-11T00:00:00Z',
      maxInvalidRate: 1,
    });
    const irValidationRuleCount = countIRNodesForArtifactType(
      result.graph,
      findings,
      'ValidationRule'
    );
    expect(irValidationRuleCount).toBe(report.counts.validationRuleCount);
  });

  it('Flow findings → flowCountCpqRelated in PDF and Automation/Flow nodes in IR are equal', async () => {
    const findings = loadStaging();
    const report = assembleReport(findings);
    const result = await normalize(findings, {
      extractedAt: '2026-04-11T00:00:00Z',
      maxInvalidRate: 1,
    });
    const irFlowCount = countIRNodesForArtifactType(result.graph, findings, 'Flow');
    // Use flowCountCpqRelated, not flowCountActive — the latter
    // includes a synthetic non-CPQ summary count from a DataCount
    // finding, which BB-3 intentionally excludes.
    expect(irFlowCount).toBe(report.counts.flowCountCpqRelated);
  });

  it('EXT-1.1 — Apex class implementing a CPQ plugin interface produces an IR node with implementedInterfaces populated', async () => {
    // Synthetic finding pair: an apex_cpq_related finding for a class
    // that implements SBQQ.QuoteCalculatorPluginInterface, plus the
    // sibling cpq_apex_plugin finding the dependencies collector
    // emits. Both share the same artifactId and merge by identity in
    // BB-3, producing one IR node whose implementedInterfaces array
    // contains the plugin name.
    const apexBody = `public with sharing class AcmePricing implements SBQQ.QuoteCalculatorPluginInterface {
  public void calculate(SBQQ__Quote__c quote) { }
}`;
    const findings: AssessmentFindingInput[] = [
      {
        domain: 'dependency',
        collectorName: 'dependencies',
        artifactType: 'ApexClass',
        artifactName: 'AcmePricing',
        artifactId: 'a01000000000001',
        findingKey: 'dependencies:ApexClass:a01000000000001:apex_cpq_related',
        sourceType: 'tooling',
        evidenceRefs: [],
        textValue: apexBody,
        schemaVersion: '1.0',
      },
      {
        domain: 'dependency',
        collectorName: 'dependencies',
        artifactType: 'ApexClass',
        artifactName: 'AcmePricing',
        artifactId: 'a01000000000001',
        findingKey:
          'dependencies:ApexClass:a01000000000001:cpq_apex_plugin:SBQQ.QuoteCalculatorPluginInterface',
        sourceType: 'tooling',
        evidenceRefs: [
          {
            type: 'object-ref',
            value: 'SBQQ.QuoteCalculatorPluginInterface',
            label: 'interfaceName',
          },
        ],
        schemaVersion: '1.0',
      },
    ];
    const result = await normalize(findings, {
      extractedAt: '2026-04-11T00:00:00Z',
      maxInvalidRate: 1,
    });
    // Both findings share artifactId so they merge into one node
    // (the auto-discriminator at buildBaseNode picks artifactId as
    // the per-record discriminator). The node's implementedInterfaces
    // array MUST contain the plugin name — derived deterministically
    // from textValue by the BB-3 normalizer's regex.
    const apexNodes = result.graph.nodes.filter(
      (n): n is typeof n & { implementedInterfaces: string[] } =>
        n.nodeType === 'Automation' &&
        'sourceType' in n &&
        (n as { sourceType?: string }).sourceType === 'ApexClass'
    );
    expect(apexNodes.length).toBe(1);
    expect(apexNodes[0]!.implementedInterfaces).toEqual(['SBQQ.QuoteCalculatorPluginInterface']);
  });

  it('SBQQ__DiscountSchedule__c findings → discountScheduleTotal in PDF and DiscountSchedule nodes in IR are equal', async () => {
    const findings = loadStaging();
    const report = assembleReport(findings);
    const result = await normalize(findings, {
      extractedAt: '2026-04-11T00:00:00Z',
      maxInvalidRate: 1,
    });
    const irDiscountScheduleCount = countIRNodesForArtifactType(
      result.graph,
      findings,
      'SBQQ__DiscountSchedule__c'
    );
    expect(irDiscountScheduleCount).toBe(report.counts.discountScheduleTotal);
  });

  it('every artifactType the PDF surfaces is also represented in the IR', async () => {
    const findings = loadStaging();
    const report = assembleReport(findings);
    const result = await normalize(findings, {
      extractedAt: '2026-04-11T00:00:00Z',
      maxInvalidRate: 1,
    });

    // For every category that the PDF reports as non-zero, the IR
    // must produce at least one node from a finding of that type
    // (or quarantine it explicitly with a documented reason).
    type Probe = { label: string; pdfCount: number; artifactTypes: string[] };
    const probes: Probe[] = [
      { label: 'Products', pdfCount: report.counts.totalProducts, artifactTypes: ['Product2'] },
      {
        label: 'Price Rules',
        pdfCount: report.counts.totalPriceRules,
        artifactTypes: ['PriceRule', 'SBQQ__PriceRule__c'],
      },
      {
        label: 'Product Rules',
        pdfCount: report.counts.totalProductRules,
        artifactTypes: ['ProductRule', 'SBQQ__ProductRule__c'],
      },
      {
        label: 'Discount Schedules',
        pdfCount: report.counts.discountScheduleTotal,
        artifactTypes: ['DiscountSchedule', 'SBQQ__DiscountSchedule__c'],
      },
      {
        label: 'Apex Classes',
        pdfCount: report.counts.apexClassCount,
        artifactTypes: ['ApexClass'],
      },
      {
        label: 'Apex Triggers',
        pdfCount: report.counts.triggerCount,
        artifactTypes: ['ApexTrigger'],
      },
      {
        label: 'Validation Rules',
        pdfCount: report.counts.validationRuleCount,
        artifactTypes: ['ValidationRule'],
      },
      {
        label: 'Flows (CPQ-related)',
        pdfCount: report.counts.flowCountCpqRelated,
        artifactTypes: ['Flow'],
      },
    ];

    const failures: string[] = [];
    for (const probe of probes) {
      if (probe.pdfCount === 0) continue;
      let irCount = 0;
      for (const at of probe.artifactTypes) {
        irCount += countIRNodesForArtifactType(result.graph, findings, at);
      }
      if (irCount !== probe.pdfCount) {
        failures.push(
          `  ${probe.label}: PDF=${probe.pdfCount} but IR=${irCount} ` +
            `(artifactTypes: ${probe.artifactTypes.join(', ')})`
        );
      }
    }

    if (failures.length > 0) {
      throw new Error(
        `PDF↔IRGraph parity violation:\n${failures.join('\n')}\n\n` +
          `The PDF report and the BB-3 IR are derived from the SAME findings array, ` +
          `so any divergence is a normalizer bug or a missing registry entry.`
      );
    }
    expect(failures.length).toBe(0);
  });
});
