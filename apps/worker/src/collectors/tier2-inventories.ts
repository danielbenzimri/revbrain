/**
 * Tier 2 inventory collector — closes EXT-2.x backlog gaps in
 * one collector. Each sub-extractor produces inventory-only
 * findings (count + name + CPQ-related flag). Body extraction
 * is intentionally out of scope for these — they're "known
 * incomplete" gaps in the gaps doc §6 priority list.
 *
 * Sub-extractors:
 *  - EXT-2.1 — Email Templates referencing CPQ
 *  - EXT-2.2 — Custom Permissions + Permission Set Groups
 *  - EXT-2.3 — Scheduled Apex (CronTrigger)
 *  - EXT-2.5 — Remote Site Settings
 *  - EXT-2.7 — Translation Workbench (custom labels for CPQ objects)
 *
 * Per the OQ-6 pattern, each sub-extractor degrades independently
 * — failure of one does not block the others.
 */

import { BaseCollector, type CollectorContext, type CollectorResult } from './base.ts';
import type { CollectorDefinition } from './registry.ts';
import type { AssessmentFindingInput } from '@revbrain/contract';
import { createFinding } from '../normalize/findings.ts';

type SubStatus = 'ok' | 'failed';

export class Tier2InventoriesCollector extends BaseCollector {
  constructor(ctx: CollectorContext) {
    const definition: CollectorDefinition = {
      name: 'tier2-inventories',
      tier: 'tier2',
      timeoutMs: 5 * 60_000,
      requires: ['discovery'],
      domain: 'customization',
    };
    super(definition, ctx);
  }

  protected async execute(): Promise<CollectorResult> {
    const findings: AssessmentFindingInput[] = [];
    const metrics: Record<string, number | string | boolean> = {};
    const warnings: string[] = [];

    metrics.emailTemplateStatus = await this.extractEmailTemplates(findings, metrics, warnings);
    if (await this.checkCancellation()) {
      return this.partial(findings, metrics, warnings);
    }
    metrics.customPermissionStatus = await this.extractCustomPermissions(
      findings,
      metrics,
      warnings
    );
    if (await this.checkCancellation()) {
      return this.partial(findings, metrics, warnings);
    }
    metrics.scheduledApexStatus = await this.extractScheduledApex(findings, metrics, warnings);
    if (await this.checkCancellation()) {
      return this.partial(findings, metrics, warnings);
    }
    metrics.remoteSiteStatus = await this.extractRemoteSites(findings, metrics, warnings);
    if (await this.checkCancellation()) {
      return this.partial(findings, metrics, warnings);
    }
    metrics.translationStatus = await this.extractTranslations(findings, metrics, warnings);

    const failures = Object.values(metrics).filter((v) => v === 'failed').length;
    return {
      findings,
      relationships: [],
      metrics: this.buildMetrics(metrics, warnings),
      status: failures > 0 ? 'partial' : 'success',
    };
  }

  private partial(
    findings: AssessmentFindingInput[],
    metrics: Record<string, number | string | boolean>,
    warnings: string[]
  ): CollectorResult {
    return {
      findings,
      relationships: [],
      metrics: this.buildMetrics(metrics, warnings),
      status: 'partial',
    };
  }

  private buildMetrics(metrics: Record<string, number | string | boolean>, warnings: string[]) {
    return {
      collectorName: 'tier2-inventories',
      domain: 'customization' as const,
      metrics,
      warnings,
      coverage: 100,
      schemaVersion: '1.0',
    };
  }

  /** EXT-2.1 — Email Templates with CPQ references in body or HTML. */
  private async extractEmailTemplates(
    findings: AssessmentFindingInput[],
    metrics: Record<string, number | string | boolean>,
    warnings: string[]
  ): Promise<SubStatus> {
    try {
      // Inventory all custom email templates. Filtering by CPQ
      // body content via SOQL LIKE is brittle (templates can
      // reference SBQQ fields without literal SBQQ__ in the
      // body), so we inventory and let downstream classification
      // do the deeper match.
      const result = await this.ctx.restApi.queryAll<Record<string, unknown>>(
        'SELECT Id, DeveloperName, Subject, FolderName, TemplateType, IsActive FROM EmailTemplate WHERE NamespacePrefix = null',
        this.signal
      );
      metrics.emailTemplateCount = result.length;
      let cpqRelated = 0;
      for (const t of result) {
        const folder = (t.FolderName as string) || '';
        const subject = (t.Subject as string) || '';
        const isCpqRelated = /sbqq|cpq|quote|order|contract/i.test(folder + subject);
        if (isCpqRelated) cpqRelated++;
        findings.push(
          createFinding({
            domain: 'customization',
            collector: 'tier2-inventories',
            artifactType: 'EmailTemplate',
            artifactName: t.DeveloperName as string,
            artifactId: t.Id as string,
            findingType: 'email_template',
            sourceType: 'tooling',
            riskLevel: isCpqRelated ? 'medium' : 'info',
            migrationRelevance: isCpqRelated ? 'should-migrate' : 'optional',
            notes: `Email template ${folder}/${subject || t.DeveloperName}${isCpqRelated ? ' — CPQ-related' : ''}`,
          })
        );
      }
      metrics.emailTemplateCpqRelatedCount = cpqRelated;
      return 'ok';
    } catch (err) {
      warnings.push(`Email template extraction failed: ${(err as Error).message}`);
      return 'failed';
    }
  }

  /** EXT-2.2 — Custom Permissions and Permission Set Groups inventory. */
  private async extractCustomPermissions(
    findings: AssessmentFindingInput[],
    metrics: Record<string, number | string | boolean>,
    warnings: string[]
  ): Promise<SubStatus> {
    try {
      const customPerms = await this.ctx.restApi.queryAll<Record<string, unknown>>(
        'SELECT Id, DeveloperName, MasterLabel FROM CustomPermission WHERE NamespacePrefix = null',
        this.signal
      );
      metrics.customPermissionCount = customPerms.length;
      for (const cp of customPerms) {
        findings.push(
          createFinding({
            domain: 'customization',
            collector: 'tier2-inventories',
            artifactType: 'CustomPermission',
            artifactName: cp.DeveloperName as string,
            artifactId: cp.Id as string,
            findingType: 'custom_permission',
            sourceType: 'object',
            riskLevel: 'info',
            migrationRelevance: 'optional',
            notes: `Custom permission: ${cp.MasterLabel as string}`,
          })
        );
      }

      try {
        const psgs = await this.ctx.restApi.queryAll<Record<string, unknown>>(
          'SELECT Id, DeveloperName, MasterLabel, Status FROM PermissionSetGroup',
          this.signal
        );
        metrics.permissionSetGroupCount = psgs.length;
        for (const psg of psgs) {
          findings.push(
            createFinding({
              domain: 'customization',
              collector: 'tier2-inventories',
              artifactType: 'PermissionSetGroup',
              artifactName: psg.DeveloperName as string,
              artifactId: psg.Id as string,
              findingType: 'permission_set_group',
              sourceType: 'object',
              riskLevel: 'info',
              migrationRelevance: 'optional',
              notes: `Permission set group: ${psg.MasterLabel as string} (${psg.Status as string})`,
            })
          );
        }
      } catch (err) {
        warnings.push(`PSG extraction failed: ${(err as Error).message}`);
      }
      return 'ok';
    } catch (err) {
      warnings.push(`Custom permission extraction failed: ${(err as Error).message}`);
      return 'failed';
    }
  }

  /** EXT-2.3 — Scheduled Apex via CronTrigger. */
  private async extractScheduledApex(
    findings: AssessmentFindingInput[],
    metrics: Record<string, number | string | boolean>,
    warnings: string[]
  ): Promise<SubStatus> {
    try {
      const result = await this.ctx.restApi.queryAll<Record<string, unknown>>(
        "SELECT Id, CronJobDetailId, NextFireTime, State, CronExpression, TimesTriggered FROM CronTrigger WHERE State = 'WAITING'",
        this.signal
      );
      metrics.scheduledApexCount = result.length;
      for (const ct of result) {
        findings.push(
          createFinding({
            domain: 'dependency',
            collector: 'tier2-inventories',
            artifactType: 'ScheduledApex',
            artifactName: (ct.CronJobDetailId as string) || (ct.Id as string),
            artifactId: ct.Id as string,
            findingType: 'scheduled_apex',
            sourceType: 'object',
            riskLevel: 'medium',
            migrationRelevance: 'must-migrate',
            // Stability: 'runtime' — CronTrigger.State and
            // NextFireTime are observed at extraction and may
            // drift. EXT-CC5 stability convention.
            stability: 'runtime',
            notes: `Scheduled Apex: ${ct.CronExpression as string} (next: ${ct.NextFireTime as string}, triggered ${ct.TimesTriggered as number}x)`,
          } as Parameters<typeof createFinding>[0])
        );
      }
      return 'ok';
    } catch (err) {
      warnings.push(`Scheduled Apex extraction failed: ${(err as Error).message}`);
      return 'failed';
    }
  }

  /** EXT-2.5 — Remote Site Settings inventory. */
  private async extractRemoteSites(
    findings: AssessmentFindingInput[],
    metrics: Record<string, number | string | boolean>,
    warnings: string[]
  ): Promise<SubStatus> {
    try {
      const result = await this.ctx.restApi.toolingQuery<Record<string, unknown>>(
        'SELECT Id, DeveloperName, EndpointUrl, IsActive, Description FROM RemoteSiteSetting',
        this.signal
      );
      metrics.remoteSiteCount = result.records.length;
      for (const rs of result.records) {
        findings.push(
          createFinding({
            domain: 'integration',
            collector: 'tier2-inventories',
            artifactType: 'RemoteSiteSetting',
            artifactName: rs.DeveloperName as string,
            artifactId: rs.Id as string,
            findingType: 'remote_site_setting',
            sourceType: 'tooling',
            riskLevel: rs.IsActive ? 'medium' : 'info',
            migrationRelevance: 'should-migrate',
            notes: `Remote site: ${rs.EndpointUrl as string} (${rs.IsActive ? 'active' : 'inactive'})`,
          })
        );
      }
      return 'ok';
    } catch (err) {
      warnings.push(`Remote site extraction failed: ${(err as Error).message}`);
      return 'failed';
    }
  }

  /** EXT-2.7 — Translation Workbench (custom labels). */
  private async extractTranslations(
    findings: AssessmentFindingInput[],
    metrics: Record<string, number | string | boolean>,
    warnings: string[]
  ): Promise<SubStatus> {
    try {
      // Inventory custom labels — translations attach to these
      // and the count gives a coarse i18n surface area.
      const result = await this.ctx.restApi.toolingQuery<Record<string, unknown>>(
        'SELECT Id, Name, MasterLabel, Language, IsProtected FROM ExternalString WHERE NamespacePrefix = null',
        this.signal
      );
      metrics.customLabelCount = result.records.length;
      for (const cl of result.records) {
        findings.push(
          createFinding({
            domain: 'localization',
            collector: 'tier2-inventories',
            artifactType: 'CustomLabel',
            artifactName: cl.Name as string,
            artifactId: cl.Id as string,
            findingType: 'custom_label',
            sourceType: 'tooling',
            riskLevel: 'info',
            migrationRelevance: 'should-migrate',
            notes: `Custom label: ${cl.MasterLabel as string} (${cl.Language as string})`,
          })
        );
      }
      return 'ok';
    } catch (err) {
      warnings.push(`Translation extraction failed: ${(err as Error).message}`);
      return 'failed';
    }
  }
}
