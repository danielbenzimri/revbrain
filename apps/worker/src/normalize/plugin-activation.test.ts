/**
 * Unit tests for the plugin-activation join (EXT-1.2).
 *
 * Tests cover three branches:
 *   1. Setting registers a class that exists → mark active
 *   2. Setting is unset/empty → emit cpq_plugin_unset finding
 *   3. Setting registers a class that doesn't exist as a finding → orphaned warning
 */

import { describe, expect, it } from 'vitest';
import type { AssessmentFindingInput } from '@revbrain/contract';
import { joinPluginActivation } from './plugin-activation.ts';

function pluginFinding(name: string, iface: string): AssessmentFindingInput {
  return {
    domain: 'dependency',
    collectorName: 'dependencies',
    artifactType: 'ApexClass',
    artifactName: name,
    artifactId: `a01000000000${name}`,
    findingKey: `dependencies:ApexClass:${name}:cpq_apex_plugin:${iface}`,
    sourceType: 'tooling',
    detected: true,
    evidenceRefs: [{ type: 'object-ref', value: iface, label: 'interfaceName' }],
    schemaVersion: '1.0',
  };
}

function settingFinding(path: string, value: string): AssessmentFindingInput {
  return {
    domain: 'settings',
    collectorName: 'settings',
    artifactType: 'CPQSettingValue',
    artifactName: path,
    artifactId: path,
    findingKey: `settings:CPQSettingValue:${path}`,
    sourceType: 'object',
    detected: true,
    evidenceRefs: [{ type: 'field-ref', value: path, label: value }],
    schemaVersion: '1.0',
  };
}

describe('joinPluginActivation', () => {
  it('marks an Apex plugin as active when its class is registered', () => {
    const findings: AssessmentFindingInput[] = [
      pluginFinding('AcmePricing', 'SBQQ.QuoteCalculatorPluginInterface'),
      settingFinding('SBQQ__Plugin__c.SBQQ__QuoteCalculator__c', 'AcmePricing'),
    ];
    const result = joinPluginActivation(findings);

    expect(result.stats.activePluginCount).toBe(1);
    expect(result.stats.orphanedRegistrationCount).toBe(0);

    // The plugin finding got an isActivePlugin evidence ref appended.
    const updatedPlugin = result.updatedFindings.find((f) => f.artifactName === 'AcmePricing')!;
    expect(updatedPlugin.evidenceRefs).toContainEqual({
      type: 'field-ref',
      value: 'SBQQ__Plugin__c.SBQQ__QuoteCalculator__c',
      label: 'isActivePlugin',
    });
  });

  it('emits a positive-absence finding when no plugin is registered', () => {
    const findings: AssessmentFindingInput[] = [
      // Plugin class exists but no setting registers it.
      pluginFinding('AcmePricing', 'SBQQ.QuoteCalculatorPluginInterface'),
    ];
    const result = joinPluginActivation(findings);

    // Every registration map entry that has no value emits an unset finding.
    // The map has 6 entries → 6 unset findings.
    expect(result.newFindings.length).toBeGreaterThan(0);
    expect(result.stats.unsetPluginCount).toBeGreaterThan(0);
    expect(result.stats.activePluginCount).toBe(0);

    const unset = result.newFindings.find(
      (f) => f.findingKey === 'plugin-activation:unset:SBQQ__Plugin__c.SBQQ__QuoteCalculator__c'
    );
    expect(unset).toBeDefined();
    expect(unset!.detected).toBe(false);
    expect(unset!.notes).toContain('unset');
    expect(unset!.notes).toContain('SBQQ.QuoteCalculatorPluginInterface');
  });

  it('emits an orphaned finding when a setting registers a class that does not exist', () => {
    const findings: AssessmentFindingInput[] = [
      // Setting registers AcmePricing but no plugin finding for it.
      settingFinding('SBQQ__Plugin__c.SBQQ__QuoteCalculator__c', 'GhostClass'),
    ];
    const result = joinPluginActivation(findings);

    expect(result.stats.orphanedRegistrationCount).toBe(1);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings[0]).toContain('GhostClass');

    const orphaned = result.newFindings.find(
      (f) => f.findingKey === 'plugin-activation:orphaned:SBQQ__Plugin__c.SBQQ__QuoteCalculator__c'
    );
    expect(orphaned).toBeDefined();
    expect(orphaned!.riskLevel).toBe('high');
    expect(orphaned!.migrationRelevance).toBe('must-migrate');
  });

  it('case-insensitive class name matching', () => {
    const findings: AssessmentFindingInput[] = [
      pluginFinding('AcmePricing', 'SBQQ.QuoteCalculatorPluginInterface'),
      settingFinding('SBQQ__Plugin__c.SBQQ__QuoteCalculator__c', 'acmepricing'),
    ];
    const result = joinPluginActivation(findings);
    expect(result.stats.activePluginCount).toBe(1);
  });

  it('does not modify the input findings array (immutability)', () => {
    const findings: AssessmentFindingInput[] = [
      pluginFinding('AcmePricing', 'SBQQ.QuoteCalculatorPluginInterface'),
      settingFinding('SBQQ__Plugin__c.SBQQ__QuoteCalculator__c', 'AcmePricing'),
    ];
    const originalEvidenceCount = findings[0]!.evidenceRefs.length;
    joinPluginActivation(findings);
    // Input is unchanged.
    expect(findings[0]!.evidenceRefs.length).toBe(originalEvidenceCount);
  });

  it('emits a degraded warning when an unknown CPQ version is supplied', () => {
    const result = joinPluginActivation([], { cpqVersion: 'WinterFake' });
    expect(result.warnings.some((w) => w.includes('WinterFake'))).toBe(true);
  });

  it('handles multiple plugins for the same class (multi-interface implementer)', () => {
    const findings: AssessmentFindingInput[] = [
      pluginFinding('Multi', 'SBQQ.QuoteCalculatorPluginInterface'),
      pluginFinding('Multi', 'SBQQ.ConfiguratorPluginInterface'),
      settingFinding('SBQQ__Plugin__c.SBQQ__QuoteCalculator__c', 'Multi'),
      settingFinding('SBQQ__Plugin__c.SBQQ__Configurator__c', 'Multi'),
    ];
    const result = joinPluginActivation(findings);
    expect(result.stats.activePluginCount).toBe(2);
  });

  it('is deterministic — same input produces same output', () => {
    const findings: AssessmentFindingInput[] = [
      pluginFinding('AcmePricing', 'SBQQ.QuoteCalculatorPluginInterface'),
      settingFinding('SBQQ__Plugin__c.SBQQ__QuoteCalculator__c', 'AcmePricing'),
    ];
    const r1 = joinPluginActivation(findings);
    const r2 = joinPluginActivation(findings);
    expect(JSON.stringify(r1.newFindings)).toBe(JSON.stringify(r2.newFindings));
    expect(r1.stats).toEqual(r2.stats);
  });
});
