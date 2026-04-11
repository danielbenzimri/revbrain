import { describe, expect, it } from 'vitest';
import { isNotModeledV1, NOT_MODELED_V1_TYPES, normalizeNotModeled } from './not-modeled.ts';
import type { AssessmentFindingInput } from '@revbrain/contract';
import { prepareCatalog } from '../../stages/s2-5-schema-catalog.ts';

function finding(artifactType: string): AssessmentFindingInput {
  return {
    domain: 'customization',
    collectorName: 'misc',
    artifactType,
    artifactName: artifactType + '_1',
    findingKey: `nm-${artifactType}`,
    sourceType: 'metadata',
    detected: true,
    evidenceRefs: [],
    schemaVersion: '1.0',
  };
}

describe('PH6.17 — not-modeled-v1 quarantine router', () => {
  const ctx = { catalog: prepareCatalog(), diagnostics: [] };

  it('list has exactly 18 types (6 wave-1 + 5 EXT-1.7 + 1 EXT-1.2 + 6 EXT-2.x)', () => {
    expect(NOT_MODELED_V1_TYPES.size).toBe(18);
  });

  it.each([
    'SearchFilter',
    'SharingRule',
    'SBQQ__LookupData__c',
    'ESignature',
    'LanguageDistribution',
    'FieldCompleteness',
    // EXT-1.7 — components.ts artifact types
    'LightningComponentBundle',
    'AuraDefinitionBundle',
    'ApexPage',
    'ApexComponent',
    'StaticResource',
    // EXT-1.2 — plugin activation sidecar findings
    'PluginActivation',
    // EXT-2.x — Tier 2 inventory backlog
    'EmailTemplate',
    'CustomPermission',
    'PermissionSetGroup',
    'ScheduledApex',
    'RemoteSiteSetting',
    'CustomLabel',
  ])('routes %s to quarantine with reason not-modeled-v1', (t) => {
    expect(isNotModeledV1(t)).toBe(true);
    const result = normalizeNotModeled(finding(t), ctx);
    expect(result.nodes).toEqual([]);
    expect(result.quarantine?.reason).toBe('not-modeled-v1');
  });

  it('non-listed types return false from isNotModeledV1', () => {
    expect(isNotModeledV1('SomeOtherType')).toBe(false);
  });
});
