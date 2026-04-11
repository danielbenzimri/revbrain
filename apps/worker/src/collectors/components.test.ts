/**
 * Unit tests for the components collector (EXT-1.7).
 *
 * Two test layers:
 *  1. `isBinaryByMagic` — pure helper, exhaustive byte cases.
 *  2. End-to-end smoke tests on the collector itself with a
 *     stub `restApi` that returns canned query results. The
 *     stub is intentionally minimal — we're testing the collector
 *     orchestration (per-sub-extractor degradation, CPQ-token
 *     filtering, status surfacing), NOT the SF API.
 */

import { describe, expect, it, vi } from 'vitest';
import { ComponentsCollector, isBinaryByMagic } from './components.ts';
import type { CollectorContext } from './base.ts';

// ─── isBinaryByMagic helper ─────────────────────────────────

describe('isBinaryByMagic', () => {
  it('detects PNG (89 50 4E 47)', () => {
    expect(isBinaryByMagic(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x00]))).toBe(true);
  });

  it('detects JPEG (FF D8 FF)', () => {
    expect(isBinaryByMagic(Buffer.from([0xff, 0xd8, 0xff, 0x00, 0x00]))).toBe(true);
  });

  it('detects PDF (25 50 44 46)', () => {
    expect(isBinaryByMagic(Buffer.from([0x25, 0x50, 0x44, 0x46, 0x00]))).toBe(true);
  });

  it('detects ZIP / DOCX / JAR (50 4B 03 04)', () => {
    expect(isBinaryByMagic(Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00]))).toBe(true);
  });

  it('detects GIF (47 49 46 38)', () => {
    expect(isBinaryByMagic(Buffer.from([0x47, 0x49, 0x46, 0x38, 0x00]))).toBe(true);
  });

  it('returns false for plain ASCII text', () => {
    expect(isBinaryByMagic(Buffer.from('hello world', 'utf8'))).toBe(false);
  });

  it('returns false for empty buffer', () => {
    expect(isBinaryByMagic(Buffer.alloc(0))).toBe(false);
  });

  it('returns false for buffer shorter than 4 bytes', () => {
    expect(isBinaryByMagic(Buffer.from([0x89, 0x50]))).toBe(false);
  });

  it('returns false for JS source that starts with `function`', () => {
    expect(isBinaryByMagic(Buffer.from('function foo() {}', 'utf8'))).toBe(false);
  });
});

// ─── ComponentsCollector orchestration ────────────────────

interface StubQueryResult {
  records: Array<Record<string, unknown>>;
}

type ToolingRouter = (soql: string) => StubQueryResult | Promise<StubQueryResult>;
type RestRouter = (
  soql: string
) => Array<Record<string, unknown>> | Promise<Array<Record<string, unknown>>>;

function makeStubContext(router: { tooling: ToolingRouter; rest?: RestRouter }): CollectorContext {
  const restApi = {
    toolingQuery: vi.fn(async (soql: string) => router.tooling(soql)),
    queryAll: vi.fn(async (soql: string) => (router.rest ? router.rest(soql) : [])),
  };
  // Stub for `postgres.Sql` — the BaseCollector calls
  // `isCancelRequested(sql, runId)` between sub-extractors which
  // invokes sql as a tagged template. We return an empty result so
  // the cancellation check sees no cancel-request row.
  const sqlStub = vi.fn(async () => [] as Array<{ status: string }>);
  return {
    sql: sqlStub as never,
    restApi: restApi as never,
    bulkApi: {} as never,
    metadataApi: {} as never,
    checkpoint: {} as never,
    progress: {
      markRunning: vi.fn(),
      markSuccess: vi.fn(),
      markFailed: vi.fn(),
      markPartial: vi.fn(),
      markSkipped: vi.fn(),
      updateSubstep: vi.fn(),
    } as never,
    snapshots: {} as never,
    runId: 'test-run',
    organizationId: 'test-org',
    connectionId: 'test-conn',
    describeCache: new Map(),
    config: {
      codeExtractionEnabled: true,
      rawSnapshotMode: 'none',
    },
  };
}

describe('ComponentsCollector', () => {
  it('returns success with empty findings when every sub-query returns nothing', async () => {
    const ctx = makeStubContext({
      tooling: () => ({ records: [] }),
      rest: () => [],
    });
    const collector = new ComponentsCollector(ctx);
    // Call execute() directly (bypassing run()) — the base
    // collector's run() reaches into Postgres for cancellation
    // checks which would require a full sql stub. We're testing
    // the EXT-1.7 collector orchestration here, not the base
    // collector's lifecycle wrapper.
    const result = await (
      collector as unknown as { execute: () => Promise<Awaited<ReturnType<typeof collector.run>>> }
    ).execute();
    expect(result.status).toBe('success');
    expect(result.findings).toEqual([]);
    expect(result.metrics.metrics.lwcStatus).toBe('ok');
    expect(result.metrics.metrics.auraStatus).toBe('ok');
    expect(result.metrics.metrics.vfStatus).toBe('ok');
    expect(result.metrics.metrics.staticResourceStatus).toBe('ok');
  });

  it('emits a CPQ-related LWC bundle finding when source contains CPQ tokens', async () => {
    const ctx = makeStubContext({
      tooling: (soql) => {
        // Order matters: the resource query mentions
        // LightningComponentBundleId in its WHERE clause, so check
        // for LightningComponentResource FIRST.
        if (soql.includes('LightningComponentResource')) {
          return {
            records: [
              {
                Id: '0Rs000000000001',
                FilePath: 'AcmeCpqHelper/AcmeCpqHelper.js',
                Format: 'js',
                Source:
                  "import { LightningElement } from 'lwc';\nimport SBQQ__Quote__c from '@salesforce/schema/SBQQ__Quote__c';",
              },
            ],
          };
        }
        if (soql.includes('FROM LightningComponentBundle')) {
          return {
            records: [
              {
                Id: '0Rb000000000001',
                DeveloperName: 'AcmeCpqHelper',
                NamespacePrefix: null,
                ApiVersion: 60.0,
              },
            ],
          };
        }
        return { records: [] };
      },
      rest: () => [],
    });
    const collector = new ComponentsCollector(ctx);
    // Call execute() directly (bypassing run()) — the base
    // collector's run() reaches into Postgres for cancellation
    // checks which would require a full sql stub. We're testing
    // the EXT-1.7 collector orchestration here, not the base
    // collector's lifecycle wrapper.
    const result = await (
      collector as unknown as { execute: () => Promise<Awaited<ReturnType<typeof collector.run>>> }
    ).execute();
    expect(result.status).toBe('success');
    // The bundle finding is keyed by the bare bundle name; the
    // per-resource finding adds `:filepath` after the bundle name.
    const bundleFinding = result.findings.find(
      (f) => f.artifactType === 'LightningComponentBundle' && f.artifactName === 'AcmeCpqHelper'
    );
    expect(bundleFinding).toBeDefined();
    expect(bundleFinding!.notes).toContain('references CPQ tokens');
    // CPQ-related → per-resource finding emitted with the bundle
    // name + file path. Filter by the artifactName containing ':'.
    const resourceFinding = result.findings.find(
      (f) =>
        f.artifactType === 'LightningComponentBundle' && f.artifactName.includes(':AcmeCpqHelper/')
    );
    expect(resourceFinding).toBeDefined();
    expect(resourceFinding!.textValue).toContain('SBQQ__Quote__c');
    expect(result.metrics.metrics.lwcCpqRelatedBundleCount).toBe(1);
  });

  it('LWC sub-extractor failure surfaces as lwcStatus: failed but does not block other sub-extractors', async () => {
    const ctx = makeStubContext({
      tooling: (soql) => {
        if (soql.includes('LightningComponentBundle')) {
          throw new Error('lwc query failed');
        }
        return { records: [] };
      },
      rest: () => [],
    });
    const collector = new ComponentsCollector(ctx);
    // Call execute() directly (bypassing run()) — the base
    // collector's run() reaches into Postgres for cancellation
    // checks which would require a full sql stub. We're testing
    // the EXT-1.7 collector orchestration here, not the base
    // collector's lifecycle wrapper.
    const result = await (
      collector as unknown as { execute: () => Promise<Awaited<ReturnType<typeof collector.run>>> }
    ).execute();
    expect(result.status).toBe('partial');
    expect(result.metrics.metrics.lwcStatus).toBe('failed');
    expect(result.metrics.metrics.auraStatus).toBe('ok');
    expect(result.metrics.metrics.vfStatus).toBe('ok');
    expect(result.metrics.metrics.staticResourceStatus).toBe('ok');
    expect(result.metrics.warnings.some((w) => w.includes('LWC extraction failed'))).toBe(true);
  });

  it('VF page extraction emits a high-risk finding when markup mentions SBQQ__Quote__c', async () => {
    const ctx = makeStubContext({
      tooling: (soql) => {
        if (soql.includes('FROM ApexPage')) {
          return {
            records: [
              {
                Id: '06600000000001',
                Name: 'CpqPriceOverride',
                Markup:
                  '<apex:page standardController="SBQQ__Quote__c"><apex:form>{!SBQQ__Quote__c.SBQQ__NetAmount__c}</apex:form></apex:page>',
                ApiVersion: 60.0,
              },
            ],
          };
        }
        return { records: [] };
      },
      rest: () => [],
    });
    const collector = new ComponentsCollector(ctx);
    // Call execute() directly (bypassing run()) — the base
    // collector's run() reaches into Postgres for cancellation
    // checks which would require a full sql stub. We're testing
    // the EXT-1.7 collector orchestration here, not the base
    // collector's lifecycle wrapper.
    const result = await (
      collector as unknown as { execute: () => Promise<Awaited<ReturnType<typeof collector.run>>> }
    ).execute();
    const vfFinding = result.findings.find((f) => f.artifactType === 'ApexPage');
    expect(vfFinding).toBeDefined();
    expect(vfFinding!.riskLevel).toBe('high');
    expect(vfFinding!.migrationRelevance).toBe('must-migrate');
    expect(vfFinding!.textValue).toContain('SBQQ__Quote__c');
    expect(result.metrics.metrics.vfPageCpqCount).toBe(1);
  });

  it('VF mixed success/failure: page query succeeds, component query fails → vfStatus: degraded', async () => {
    const ctx = makeStubContext({
      tooling: (soql) => {
        if (soql.includes('FROM ApexPage')) return { records: [] };
        if (soql.includes('FROM ApexComponent')) {
          throw new Error('component query failed');
        }
        return { records: [] };
      },
      rest: () => [],
    });
    const collector = new ComponentsCollector(ctx);
    // Call execute() directly (bypassing run()) — the base
    // collector's run() reaches into Postgres for cancellation
    // checks which would require a full sql stub. We're testing
    // the EXT-1.7 collector orchestration here, not the base
    // collector's lifecycle wrapper.
    const result = await (
      collector as unknown as { execute: () => Promise<Awaited<ReturnType<typeof collector.run>>> }
    ).execute();
    expect(result.metrics.metrics.vfStatus).toBe('degraded');
    expect(result.metrics.warnings.some((w) => w.includes('VF component'))).toBe(true);
  });

  it('Static resources are inventoried with name-based CPQ flag (no body fetch)', async () => {
    const ctx = makeStubContext({
      tooling: () => ({ records: [] }),
      rest: () => [
        {
          Id: '0810000000001',
          Name: 'sbqqHelpers.js',
          ContentType: 'application/javascript',
          BodyLength: 12345,
        },
        {
          Id: '0810000000002',
          Name: 'corporate-logo.png',
          ContentType: 'image/png',
          BodyLength: 8765,
        },
      ],
    });
    const collector = new ComponentsCollector(ctx);
    // Call execute() directly (bypassing run()) — the base
    // collector's run() reaches into Postgres for cancellation
    // checks which would require a full sql stub. We're testing
    // the EXT-1.7 collector orchestration here, not the base
    // collector's lifecycle wrapper.
    const result = await (
      collector as unknown as { execute: () => Promise<Awaited<ReturnType<typeof collector.run>>> }
    ).execute();
    const sbqqFinding = result.findings.find((f) => f.artifactName === 'sbqqHelpers.js');
    const logoFinding = result.findings.find((f) => f.artifactName === 'corporate-logo.png');
    expect(sbqqFinding).toBeDefined();
    expect(sbqqFinding!.riskLevel).toBe('medium'); // CPQ-related (name match)
    expect(logoFinding).toBeDefined();
    expect(logoFinding!.riskLevel).toBe('info'); // not CPQ-related
    // Both findings have body inventory only — no textValue.
    expect(sbqqFinding!.textValue).toBeUndefined();
    expect(logoFinding!.textValue).toBeUndefined();
    expect(result.metrics.metrics.staticResourceCount).toBe(2);
    expect(result.metrics.metrics.staticResourceCpqRelatedCount).toBe(1);
  });
});
