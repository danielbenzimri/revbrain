import { describe, expect, it } from 'vitest';
import {
  normalizeCPQSettingsBundle,
  DISPOSITION_RELEVANT,
  type CPQSettingsBundleIR,
} from './cpq-settings-bundle.ts';
import type { AssessmentFindingInput } from '@revbrain/contract';
import { runBaselineSuite } from '../__test-helpers__/baseline.ts';
import { prepareCatalog } from '../../stages/s2-5-schema-catalog.ts';

function validSetting(over: Partial<AssessmentFindingInput> = {}): AssessmentFindingInput {
  return {
    domain: 'settings',
    collectorName: 'settings',
    artifactType: 'CPQSettingValue',
    artifactName: 'CalculateImmediately',
    findingKey: 'setting-1',
    sourceType: 'metadata',
    detected: true,
    textValue: 'true',
    evidenceRefs: [],
    schemaVersion: '1.0',
    ...over,
  };
}

runBaselineSuite({
  fn: normalizeCPQSettingsBundle,
  taskId: 'PH6.15',
  nodeType: 'CPQSettingsBundle',
  validFinding: validSetting,
  malformedFinding: null,
  renameMutation: (f) => ({ ...f, artifactId: 'a0V3x00000newid' }),
  contentChangeMutation: (f) => ({ ...f, textValue: 'false' }),
  // PH9 §8.3 — CPQSettingsBundle is a singleton aggregator: all CPQ
  // settings in an org collapse into one bundle node by design.
  intentionallyCollapses: true,
});

describe('PH6.15 — CPQSettingsBundle disposition relevance', () => {
  const ctx = { catalog: prepareCatalog(), diagnostics: [] };

  it('CalculateImmediately is disposition-relevant', () => {
    const result = normalizeCPQSettingsBundle(validSetting(), ctx);
    const node = result.nodes[0]! as CPQSettingsBundleIR;
    expect(node.settings[0]!.isDispositionRelevant).toBe(true);
  });

  it('non-listed setting is NOT disposition-relevant', () => {
    const result = normalizeCPQSettingsBundle(validSetting({ artifactName: 'RandomSetting' }), ctx);
    const node = result.nodes[0]! as CPQSettingsBundleIR;
    expect(node.settings[0]!.isDispositionRelevant).toBe(false);
  });

  it('includes all 10 disposition-relevant settings in the constant', () => {
    expect(DISPOSITION_RELEVANT.size).toBe(10);
  });

  it('CustomScriptPluginClassName populates activeQcpPluginClass', () => {
    const result = normalizeCPQSettingsBundle(
      validSetting({ artifactName: 'CustomScriptPluginClassName', textValue: 'MyQCP' }),
      ctx
    );
    const node = result.nodes[0]! as CPQSettingsBundleIR;
    expect(node.activeQcpPluginClass).toBe('MyQCP');
  });
});
