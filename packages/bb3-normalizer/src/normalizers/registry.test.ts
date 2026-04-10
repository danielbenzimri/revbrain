import { afterEach, describe, expect, it } from 'vitest';
import {
  lookupNormalizer,
  normalizeAll,
  registerNormalizer,
  resetRegistry,
  setFallbackNormalizer,
  type NormalizerContext,
  type NormalizerFn,
} from './registry.ts';
import { BB3InternalError } from '@revbrain/migration-ir-contract';
import type { AssessmentFindingInput } from '@revbrain/contract';
import { prepareCatalog } from '../stages/s2-5-schema-catalog.ts';

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

function ctx(): NormalizerContext {
  return { catalog: prepareCatalog(), diagnostics: [] };
}

describe('PH3.4 — normalizer registry', () => {
  afterEach(() => {
    resetRegistry();
    // Restore default fallback
    setFallbackNormalizer((finding) => ({
      nodes: [],
      quarantine: {
        findingKey: finding.findingKey,
        artifactType: finding.artifactType,
        reason: 'unknown-artifact',
        detail: 'default',
        raw: finding,
      },
    }));
  });

  it('register + lookup returns the registered normalizer', () => {
    const fn: NormalizerFn = () => ({ nodes: [] });
    registerNormalizer('Product2', fn);
    expect(lookupNormalizer('Product2')).toBe(fn);
  });

  it('double-registration throws BB3InternalError', () => {
    const fn: NormalizerFn = () => ({ nodes: [] });
    registerNormalizer('Product2', fn);
    expect(() => registerNormalizer('Product2', fn)).toThrow(BB3InternalError);
  });

  it('unknown artifactType routes to the fallback', () => {
    const finding = f({ findingKey: 'u', artifactType: 'Unknown__c' });
    const results = normalizeAll([finding], ctx());
    expect(results.length).toBe(1);
    expect(results[0]!.quarantine?.reason).toBe('unknown-artifact');
  });

  it('normalizeAll calls each registered normalizer exactly once per matching finding', () => {
    let callCount = 0;
    const fn: NormalizerFn = () => {
      callCount++;
      return { nodes: [] };
    };
    registerNormalizer('Product2', fn);
    normalizeAll(
      [
        f({ findingKey: '1', artifactType: 'Product2' }),
        f({ findingKey: '2', artifactType: 'Product2' }),
        f({ findingKey: '3', artifactType: 'Product2' }),
      ],
      ctx()
    );
    expect(callCount).toBe(3);
  });

  it('mixed artifactTypes route correctly', () => {
    let p2 = 0;
    let pr = 0;
    registerNormalizer('Product2', () => {
      p2++;
      return { nodes: [] };
    });
    registerNormalizer('SBQQ__PriceRule__c', () => {
      pr++;
      return { nodes: [] };
    });
    normalizeAll(
      [
        f({ findingKey: '1', artifactType: 'Product2' }),
        f({ findingKey: '2', artifactType: 'SBQQ__PriceRule__c' }),
        f({ findingKey: '3', artifactType: 'Product2' }),
      ],
      ctx()
    );
    expect(p2).toBe(2);
    expect(pr).toBe(1);
  });

  it('setFallbackNormalizer replaces the fallback', () => {
    let hits = 0;
    setFallbackNormalizer(() => {
      hits++;
      return { nodes: [] };
    });
    normalizeAll([f({ findingKey: 'x', artifactType: 'Unknown' })], ctx());
    expect(hits).toBe(1);
  });
});
