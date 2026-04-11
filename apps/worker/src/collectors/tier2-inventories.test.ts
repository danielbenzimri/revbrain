/**
 * Unit tests for the Tier 2 inventory collector (EXT-2.x).
 *
 * Same minimal smoke pattern as components.test.ts: stub
 * `restApi.queryAll` and `restApi.toolingQuery`, call execute()
 * directly (bypassing BaseCollector.run() which needs Postgres).
 */

import { describe, expect, it, vi } from 'vitest';
import { Tier2InventoriesCollector } from './tier2-inventories.ts';
import type { CollectorContext } from './base.ts';

interface StubQueryResult {
  records: Array<Record<string, unknown>>;
}

type ToolingRouter = (soql: string) => StubQueryResult | Promise<StubQueryResult>;
type RestRouter = (
  soql: string
) => Array<Record<string, unknown>> | Promise<Array<Record<string, unknown>>>;

function makeStubContext(router: { tooling: ToolingRouter; rest: RestRouter }): CollectorContext {
  const restApi = {
    toolingQuery: vi.fn(async (soql: string) => router.tooling(soql)),
    queryAll: vi.fn(async (soql: string) => router.rest(soql)),
  };
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

async function runExecute(collector: Tier2InventoriesCollector) {
  return (
    collector as unknown as { execute: () => Promise<Awaited<ReturnType<typeof collector.run>>> }
  ).execute();
}

describe('Tier2InventoriesCollector', () => {
  it('returns success with empty findings when every sub-extractor returns nothing', async () => {
    const ctx = makeStubContext({
      tooling: () => ({ records: [] }),
      rest: () => [],
    });
    const result = await runExecute(new Tier2InventoriesCollector(ctx));
    expect(result.status).toBe('success');
    expect(result.findings).toEqual([]);
    expect(result.metrics.metrics.emailTemplateStatus).toBe('ok');
    expect(result.metrics.metrics.customPermissionStatus).toBe('ok');
    expect(result.metrics.metrics.scheduledApexStatus).toBe('ok');
    expect(result.metrics.metrics.remoteSiteStatus).toBe('ok');
    expect(result.metrics.metrics.translationStatus).toBe('ok');
  });

  it('email template extraction flags CPQ-related templates by folder/subject heuristic', async () => {
    const ctx = makeStubContext({
      tooling: () => ({ records: [] }),
      rest: (soql) => {
        if (soql.includes('FROM EmailTemplate')) {
          return [
            {
              Id: '00X1',
              DeveloperName: 'CpqQuoteSent',
              Subject: 'Your quote',
              FolderName: 'CPQ Templates',
              TemplateType: 'html',
            },
            {
              Id: '00X2',
              DeveloperName: 'PasswordReset',
              Subject: 'Reset your password',
              FolderName: 'Account',
              TemplateType: 'text',
            },
          ];
        }
        return [];
      },
    });
    const result = await runExecute(new Tier2InventoriesCollector(ctx));
    const cpqTemplate = result.findings.find((f) => f.artifactName === 'CpqQuoteSent');
    const otherTemplate = result.findings.find((f) => f.artifactName === 'PasswordReset');
    expect(cpqTemplate).toBeDefined();
    expect(cpqTemplate!.riskLevel).toBe('medium');
    expect(otherTemplate).toBeDefined();
    expect(otherTemplate!.riskLevel).toBe('info');
    expect(result.metrics.metrics.emailTemplateCount).toBe(2);
    expect(result.metrics.metrics.emailTemplateCpqRelatedCount).toBe(1);
  });

  it('CronTrigger findings carry stability="runtime" (EXT-CC5 propagation)', async () => {
    const ctx = makeStubContext({
      tooling: () => ({ records: [] }),
      rest: (soql) => {
        if (soql.includes('FROM CronTrigger')) {
          return [
            {
              Id: '08e1',
              CronJobDetailId: '08j1',
              NextFireTime: '2026-04-12T03:00:00Z',
              State: 'WAITING',
              CronExpression: '0 0 3 * * ?',
              TimesTriggered: 47,
            },
          ];
        }
        return [];
      },
    });
    const result = await runExecute(new Tier2InventoriesCollector(ctx));
    const cronFinding = result.findings.find((f) => f.artifactType === 'ScheduledApex');
    expect(cronFinding).toBeDefined();
    // EXT-CC5 — the wave-3 review caught that this was silently
    // dropped before the createFinding fix. This test would have
    // caught it if it had existed.
    expect(cronFinding!.stability).toBe('runtime');
    expect(result.metrics.metrics.scheduledApexCount).toBe(1);
  });

  it('Custom Permissions and PSGs are extracted independently', async () => {
    const ctx = makeStubContext({
      tooling: () => ({ records: [] }),
      rest: (soql) => {
        if (soql.includes('FROM CustomPermission')) {
          return [{ Id: '0PS1', DeveloperName: 'Cpq_Admin', MasterLabel: 'CPQ Admin' }];
        }
        if (soql.includes('FROM PermissionSetGroup')) {
          return [
            {
              Id: '0PG1',
              DeveloperName: 'Sales_Ops',
              MasterLabel: 'Sales Ops',
              Status: 'Updated',
            },
          ];
        }
        return [];
      },
    });
    const result = await runExecute(new Tier2InventoriesCollector(ctx));
    expect(result.findings.find((f) => f.artifactType === 'CustomPermission')).toBeDefined();
    expect(result.findings.find((f) => f.artifactType === 'PermissionSetGroup')).toBeDefined();
    expect(result.metrics.metrics.customPermissionCount).toBe(1);
    expect(result.metrics.metrics.permissionSetGroupCount).toBe(1);
  });

  it('Remote Site Settings are inventoried via Tooling API', async () => {
    const ctx = makeStubContext({
      tooling: (soql) => {
        if (soql.includes('FROM RemoteSiteSetting')) {
          return {
            records: [
              {
                Id: '0Cm1',
                DeveloperName: 'AcmePartnerApi',
                EndpointUrl: 'https://api.acme.com',
                IsActive: true,
                Description: 'Acme partner integration',
              },
            ],
          };
        }
        return { records: [] };
      },
      rest: () => [],
    });
    const result = await runExecute(new Tier2InventoriesCollector(ctx));
    const rs = result.findings.find((f) => f.artifactType === 'RemoteSiteSetting');
    expect(rs).toBeDefined();
    expect(rs!.riskLevel).toBe('medium'); // active
    expect(result.metrics.metrics.remoteSiteCount).toBe(1);
  });

  it('Custom labels are extracted via Tooling ExternalString query', async () => {
    const ctx = makeStubContext({
      tooling: (soql) => {
        if (soql.includes('FROM ExternalString')) {
          return {
            records: [
              {
                Id: '101a',
                Name: 'cpq_quote_header',
                MasterLabel: 'Your Quote',
                Language: 'en_US',
                IsProtected: false,
              },
            ],
          };
        }
        return { records: [] };
      },
      rest: () => [],
    });
    const result = await runExecute(new Tier2InventoriesCollector(ctx));
    const cl = result.findings.find((f) => f.artifactType === 'CustomLabel');
    expect(cl).toBeDefined();
    expect(result.metrics.metrics.customLabelCount).toBe(1);
  });

  it('one sub-extractor failure does not block the others (per-extractor degradation)', async () => {
    const ctx = makeStubContext({
      tooling: (soql) => {
        if (soql.includes('FROM RemoteSiteSetting')) {
          throw new Error('remote site query failed');
        }
        return { records: [] };
      },
      rest: () => [],
    });
    const result = await runExecute(new Tier2InventoriesCollector(ctx));
    expect(result.status).toBe('partial');
    expect(result.metrics.metrics.remoteSiteStatus).toBe('failed');
    // Other sub-extractors still ran (even with empty input)
    expect(result.metrics.metrics.emailTemplateStatus).toBe('ok');
    expect(result.metrics.metrics.translationStatus).toBe('ok');
  });
});
