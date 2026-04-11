/**
 * Dependencies collector — Apex, flows, triggers, workflow rules.
 *
 * Implements Extraction Spec Section 10 (§10.1-§10.5):
 * - Apex classes (10.1): customer-written, SBQQ body scan, TriggerControl
 * - Apex triggers (10.2): CPQ object mapping
 * - Flows (10.3): FlowDefinitionView inventory, CPQ-related filtering
 * - Workflow Rules (10.4): legacy rules on CPQ objects
 * - Synchronous dependency risk metric (10.5)
 *
 * LLM-readiness: Apex bodies preserved in textValue, normalized refs.
 *
 * Tier 1 — failure → completed_warnings.
 */

import { BaseCollector, type CollectorContext, type CollectorResult } from './base.ts';
import type { CollectorDefinition } from './registry.ts';
import type { AssessmentFindingInput } from '@revbrain/contract';
import { createFinding } from '../normalize/findings.ts';
import { truncateWithFlag } from '../lib/truncate.ts';
import {
  CPQ_PLUGIN_INTERFACE_MAP,
  detectCpqPluginInterfaces,
  isApexTestClass,
} from '../lib/apex-classify.ts';

const CPQ_OBJECTS = [
  'SBQQ__Quote__c',
  'SBQQ__QuoteLine__c',
  'SBQQ__QuoteLineGroup__c',
  'Product2',
  'Opportunity',
  'Order',
  'OrderItem',
  'Contract',
  'Account',
];

export class DependenciesCollector extends BaseCollector {
  constructor(ctx: CollectorContext) {
    const definition: CollectorDefinition = {
      name: 'dependencies',
      tier: 'tier1',
      timeoutMs: 15 * 60_000,
      requires: ['discovery'],
      domain: 'dependency',
    };
    super(definition, ctx);
  }

  protected async execute(): Promise<CollectorResult> {
    const findings: AssessmentFindingInput[] = [];
    const metrics: Record<string, number | string | boolean> = {};
    const warnings: string[] = [];

    // ================================================================
    // 10.1: Apex Classes
    // ================================================================
    this.ctx.progress.updateSubstep('dependencies', 'apex_classes');
    this.log.info('extracting_apex_classes');

    let cpqApexClasses = 0;
    let triggerControlCount = 0;
    let totalApexLines = 0;

    try {
      const apexResult = await this.ctx.restApi.toolingQuery<Record<string, unknown>>(
        'SELECT Id, Name, NamespacePrefix, ApiVersion, Status, IsValid, ' +
          'LengthWithoutComments, Body, CreatedDate, LastModifiedDate ' +
          "FROM ApexClass WHERE NamespacePrefix = null AND Status = 'Active'",
        this.signal
      );

      // Auto-paginate if needed
      let allClasses = apexResult.records;
      if (!apexResult.done && apexResult.nextRecordsUrl) {
        // For tooling, paginate manually
        const remaining = await this.ctx.restApi.toolingQueryAll<Record<string, unknown>>(
          "SELECT Id, Name, Body, LengthWithoutComments FROM ApexClass WHERE NamespacePrefix = null AND Status = 'Active'",
          this.signal
        );
        allClasses = remaining;
      }

      metrics.totalCustomApexClasses = allClasses.length;

      let testClassCount = 0;
      let cpqPluginClassCount = 0;
      for (const cls of allClasses) {
        const body = (cls.Body as string) || '';
        const name = cls.Name as string;
        const hasSbqq = /SBQQ__/.test(body);
        const hasTriggerControl = /SBQQ\.TriggerControl/.test(body);
        const hasCallout = /Http\s*\(|HttpRequest|fetch|WebServiceCallout/.test(body);
        // EXT-CC2 — detect @isTest annotation via the pure helper in
        // lib/apex-classify.ts. Test classes still need to be
        // accounted for (so they show up in BB-3 as findings) but
        // MUST NOT inflate the cpqRelatedApexClasses /
        // cpqApexLineCount / triggerControlCount metrics that drive
        // the report's "47 Apex classes" line. The pre-fix count was
        // ~30% inflated by test classes that don't migrate.
        const isTestClass = isApexTestClass(body);

        if (hasSbqq && isTestClass) {
          testClassCount++;
          findings.push(
            createFinding({
              domain: 'dependency',
              collector: 'dependencies',
              artifactType: 'ApexClass',
              artifactName: name,
              artifactId: cls.Id as string,
              findingType: 'apex_test_class',
              sourceType: 'tooling',
              riskLevel: 'low',
              complexityLevel: 'low',
              migrationRelevance: 'optional',
              textValue: this.ctx.config.codeExtractionEnabled ? body : undefined,
              countValue: body.split('\n').length,
              notes: `Apex test class — excluded from migration metrics. Tests must be re-run on the target platform but do not migrate as code.`,
              evidenceRefs: [
                {
                  type: 'code-snippet',
                  value: `@isTest in ${name}`,
                  label: `Apex test: ${name}`,
                },
              ],
            })
          );
          continue;
        }

        if (hasSbqq) {
          cpqApexClasses++;
          totalApexLines += (cls.LengthWithoutComments as number) || body.split('\n').length;

          // Detect business concern hints
          const concerns: string[] = [];
          if (/SBQQ__Quote__c|SBQQ__QuoteLine__c/.test(body)) concerns.push('pricing');
          if (/Approval|sbaa__/.test(body)) concerns.push('approvals');
          if (/Order|Contract/.test(body)) concerns.push('quote-sync');
          if (hasCallout) concerns.push('integration');

          findings.push(
            createFinding({
              domain: 'dependency',
              collector: 'dependencies',
              artifactType: 'ApexClass',
              artifactName: name,
              artifactId: cls.Id as string,
              findingType: 'apex_cpq_related',
              sourceType: 'tooling',
              riskLevel: hasTriggerControl ? 'high' : hasCallout ? 'high' : 'medium',
              complexityLevel: hasTriggerControl ? 'high' : 'medium',
              migrationRelevance: 'must-migrate',
              rcaTargetConcept: 'Apex or Flow',
              rcaMappingComplexity: hasTriggerControl ? 'redesign' : 'transform',
              textValue: this.ctx.config.codeExtractionEnabled ? body : undefined,
              countValue: body.split('\n').length,
              notes: `CPQ-related Apex${hasTriggerControl ? ' — uses TriggerControl (pattern breaks in RCA)' : ''}${hasCallout ? ' — has callouts' : ''}. Concerns: ${concerns.join(', ') || 'general'}`,
              evidenceRefs: [
                ((): AssessmentFindingInput['evidenceRefs'][number] => {
                  const snippet = truncateWithFlag(body, 500);
                  return {
                    type: 'code-snippet',
                    value: snippet.value,
                    label: `Apex: ${name}`,
                    referencedObjects: CPQ_OBJECTS.filter((o) => body.includes(o)),
                    referencedFields: (body.match(/SBQQ__\w+__c/g) || []).slice(0, 20),
                    ...(snippet.wasTruncated
                      ? { truncated: true, originalBytes: snippet.originalBytes }
                      : {}),
                  };
                })(),
              ],
            })
          );

          // EXT-1.1 — Plugin classification. After the existing
          // body fetch, scan for `implements (SBQQ|sbaa).*Interface`
          // and emit one ADDITIONAL finding per detected interface.
          // The original apex_cpq_related finding still emits;
          // these are joinable by artifactId in BB-3 + downstream.
          // Plugin-classified findings are how the report can
          // answer "which Apex class IS the active QCP?" — see
          // EXT-1.2 for the activation join.
          const ifaces = detectCpqPluginInterfaces(body);
          for (const iface of ifaces) {
            cpqPluginClassCount++;
            const mapping = CPQ_PLUGIN_INTERFACE_MAP[iface];
            findings.push(
              createFinding({
                domain: 'dependency',
                collector: 'dependencies',
                artifactType: 'ApexClass',
                artifactName: name,
                artifactId: cls.Id as string,
                findingType: 'cpq_apex_plugin',
                sourceType: 'tooling',
                riskLevel: 'high',
                complexityLevel: 'high',
                migrationRelevance: 'must-migrate',
                rcaTargetConcept: mapping?.rcaTargetConcept,
                rcaMappingComplexity: mapping?.rcaMappingComplexity ?? 'redesign',
                notes: `Implements CPQ plugin interface: ${iface}`,
                evidenceRefs: [
                  {
                    type: 'object-ref',
                    value: iface,
                    label: 'interfaceName',
                  },
                ],
              })
            );
          }
        }

        if (hasTriggerControl) triggerControlCount++;
      }

      metrics.cpqRelatedApexClasses = cpqApexClasses;
      metrics.cpqApexLineCount = totalApexLines;
      // EXT-CC2 — surface the test-class population separately so the
      // observability/report layer can distinguish "47 Apex classes,
      // 18 of which are tests" from the inflated 47.
      metrics.testClassCount = testClassCount;
      // EXT-1.1 — surface the Apex plugin class count so the report
      // and BB-3 know how many classes implement CPQ extension points
      // (vs ordinary CPQ-related Apex). This is the strongest signal
      // for migration risk in the entire dependencies collector.
      metrics.cpqPluginClassCount = cpqPluginClassCount;
      metrics.triggerControlUsage = triggerControlCount > 0;
      metrics.triggerBypassCount = triggerControlCount;

      if (triggerControlCount > 0) {
        warnings.push(
          `${triggerControlCount} Apex classes use SBQQ.TriggerControl — this pattern breaks in RCA`
        );
      }
    } catch (err) {
      this.log.warn({ error: (err as Error).message }, 'apex_extraction_failed');
      warnings.push(`Apex extraction failed: ${(err as Error).message}`);
    }

    if (await this.checkCancellation()) return this.emptyResult('success');

    // ================================================================
    // 10.2: Apex Triggers
    // ================================================================
    this.ctx.progress.updateSubstep('dependencies', 'apex_triggers');

    try {
      const triggerResult = await this.ctx.restApi.toolingQuery<Record<string, unknown>>(
        'SELECT Id, Name, TableEnumOrId, Body, ApiVersion, Status, ' +
          'UsageBeforeInsert, UsageBeforeUpdate, UsageBeforeDelete, ' +
          'UsageAfterInsert, UsageAfterUpdate, UsageAfterDelete ' +
          "FROM ApexTrigger WHERE NamespacePrefix = null AND Status = 'Active'",
        this.signal
      );

      const cpqTriggers = triggerResult.records.filter((t) => {
        const table = t.TableEnumOrId as string;
        const body = (t.Body as string) || '';
        return CPQ_OBJECTS.some((o) => table === o) || /SBQQ__/.test(body);
      });

      metrics.totalCustomTriggers = triggerResult.records.length;
      metrics.cpqRelatedTriggers = cpqTriggers.length;

      // Synchronous dependency count (before-triggers)
      const syncTriggers = cpqTriggers.filter(
        (t) =>
          t.UsageBeforeInsert === true ||
          t.UsageBeforeUpdate === true ||
          t.UsageBeforeDelete === true
      ).length;
      metrics.synchronousTriggerCount = syncTriggers;

      for (const t of cpqTriggers) {
        findings.push(
          createFinding({
            domain: 'dependency',
            collector: 'dependencies',
            artifactType: 'ApexTrigger',
            artifactName: t.Name as string,
            artifactId: t.Id as string,
            findingType: 'trigger_cpq',
            sourceType: 'tooling',
            riskLevel: 'high',
            complexityLevel: 'high',
            migrationRelevance: 'must-migrate',
            rcaTargetConcept: 'Flow triggers',
            rcaMappingComplexity: 'redesign',
            textValue: this.ctx.config.codeExtractionEnabled ? (t.Body as string) : undefined,
            notes: `Trigger on ${t.TableEnumOrId}${t.UsageBeforeInsert || t.UsageBeforeUpdate ? ' (synchronous — before)' : ' (after)'}`,
          })
        );
      }
    } catch (err) {
      this.log.warn({ error: (err as Error).message }, 'trigger_extraction_failed');
    }

    if (await this.checkCancellation()) return this.emptyResult('success');

    // ================================================================
    // 10.3: Flows
    // ================================================================
    this.ctx.progress.updateSubstep('dependencies', 'flows');

    try {
      // Try FlowDefinitionView first, fall back to FlowDefinition for older orgs
      let flowResult: { records: Record<string, unknown>[] };
      try {
        flowResult = await this.ctx.restApi.toolingQuery<Record<string, unknown>>(
          'SELECT Id, DeveloperName, Description, ActiveVersionId, ' +
            'ProcessType, TriggerType, TriggerObjectOrEvent, IsActive, ApiName ' +
            'FROM FlowDefinitionView WHERE IsActive = true',
          this.signal
        );
      } catch {
        // FlowDefinitionView not supported — try FlowDefinition
        flowResult = await this.ctx.restApi.toolingQuery<Record<string, unknown>>(
          'SELECT Id, DeveloperName, Description, ActiveVersionId ' +
            'FROM FlowDefinition WHERE ActiveVersionId != null',
          this.signal
        );
      }

      // Report ALL active flows, not just CPQ-triggered ones
      // The redline found 84 flows; the previous CPQ-only filter was too aggressive
      const allFlows = flowResult.records;
      const cpqFlows = allFlows.filter((f) => {
        const trigger = (f.TriggerObjectOrEvent as string) || '';
        const name = ((f.DeveloperName || f.ApiName) as string) || '';
        const desc = ((f.Description as string) || '').toLowerCase();
        // Match flows that trigger on CPQ objects OR reference CPQ in name/description
        return (
          CPQ_OBJECTS.some((o) => trigger === o) ||
          /sbqq|cpq|quote|order|pricing/i.test(name) ||
          /sbqq|cpq|quote/i.test(desc)
        );
      });

      metrics.totalActiveFlows = allFlows.length;
      metrics.cpqRelatedFlows = cpqFlows.length;

      // Process types
      const processBuildersCount = allFlows.filter((f) => f.ProcessType === 'Workflow').length;
      metrics.processBuilderFlows = processBuildersCount;
      if (processBuildersCount > 0) {
        warnings.push(
          `${processBuildersCount} Process Builder flows detected — deprecated, must migrate to Flow`
        );
      }

      // Sync flows for risk metric
      const syncFlows = cpqFlows.filter(
        (f) => f.ProcessType === 'RecordTriggerFlow' || f.ProcessType === 'AutoLaunchedFlow'
      ).length;
      metrics.synchronousFlowCount = syncFlows;

      // Create findings for CPQ-related flows
      for (const f of cpqFlows) {
        findings.push(
          createFinding({
            domain: 'dependency',
            collector: 'dependencies',
            artifactType: 'Flow',
            artifactName: (f.DeveloperName || f.ApiName) as string,
            artifactId: f.Id as string,
            findingType: 'flow_cpq',
            sourceType: 'tooling',
            riskLevel: f.ProcessType === 'Workflow' ? 'high' : 'medium',
            migrationRelevance: 'must-migrate',
            rcaTargetConcept: 'Updated Flow',
            rcaMappingComplexity: f.ProcessType === 'Workflow' ? 'redesign' : 'transform',
            notes: `${f.ProcessType} on ${f.TriggerObjectOrEvent}${f.ProcessType === 'Workflow' ? ' (DEPRECATED — must migrate)' : ''}`,
          })
        );
      }

      // Also create summary findings for non-CPQ flows (visible in report)
      const nonCpqFlowCount = allFlows.length - cpqFlows.length;
      if (nonCpqFlowCount > 0) {
        findings.push(
          createFinding({
            domain: 'dependency',
            collector: 'dependencies',
            artifactType: 'Flow',
            artifactName: `${nonCpqFlowCount} additional active flows (non-CPQ)`,
            findingType: 'flow_non_cpq_summary',
            sourceType: 'tooling',
            riskLevel: 'info',
            complexityLevel: 'low',
            migrationRelevance: 'not-applicable',
            countValue: nonCpqFlowCount,
            notes: `${nonCpqFlowCount} active flows not directly related to CPQ objects. Total org flows: ${allFlows.length}.`,
          })
        );
      }
    } catch (err) {
      this.log.warn({ error: (err as Error).message }, 'flow_extraction_failed');
    }

    // ================================================================
    // 10.4: Workflow Rules
    // ================================================================
    this.ctx.progress.updateSubstep('dependencies', 'workflow_rules');

    try {
      const wfObjects = CPQ_OBJECTS.map((o) => `'${o}'`).join(',');
      const wfResult = await this.ctx.restApi.toolingQuery<Record<string, unknown>>(
        `SELECT Id, Name, TableEnumOrId, CreatedDate FROM WorkflowRule WHERE TableEnumOrId IN (${wfObjects})`,
        this.signal
      );
      metrics.workflowRulesOnCpq = wfResult.records.length;
    } catch (err) {
      this.log.warn({ error: (err as Error).message }, 'workflow_extraction_failed');
      metrics.workflowRulesOnCpq = -1;
    }

    // ================================================================
    // 10.5: CPQ Permission Sets
    // ================================================================
    this.ctx.progress.updateSubstep('dependencies', 'permission_sets');

    try {
      const psResult = await this.ctx.restApi.query<Record<string, unknown>>(
        'SELECT Id, Name, Label, IsCustom, NamespacePrefix ' +
          'FROM PermissionSet ' +
          "WHERE Name LIKE '%SBQQ%' OR Name LIKE '%sbaa%' OR Name LIKE '%CPQ%' " +
          "OR NamespacePrefix = 'SBQQ' OR NamespacePrefix = 'sbaa'",
        this.signal
      );

      metrics.cpqPermissionSets = psResult.records.length;

      for (const ps of psResult.records) {
        findings.push(
          createFinding({
            domain: 'dependency',
            collector: 'dependencies',
            artifactType: 'PermissionSet',
            artifactName: (ps.Label || ps.Name) as string,
            artifactId: ps.Id as string,
            findingType: 'cpq_permission_set',
            sourceType: 'object',
            riskLevel: 'info',
            complexityLevel: 'low',
            migrationRelevance: 'should-migrate',
            notes: `${ps.IsCustom ? 'Custom' : 'Managed'} permission set${ps.NamespacePrefix ? ` (${ps.NamespacePrefix})` : ''}`,
          })
        );
      }
    } catch (err) {
      this.log.warn({ error: (err as Error).message }, 'permission_set_extraction_failed');
    }

    // ================================================================
    // 10.6: CPQ Reports
    // ================================================================
    this.ctx.progress.updateSubstep('dependencies', 'cpq_reports');

    try {
      const reportResult = await this.ctx.restApi.query<Record<string, unknown>>(
        'SELECT Id, Name, FolderName, Description, LastRunDate ' +
          'FROM Report ' +
          "WHERE FolderName LIKE '%CPQ%' OR Name LIKE '%CPQ%' OR Name LIKE '%SBQQ%' " +
          "OR Name LIKE '%Quote%' OR FolderName LIKE '%Quote%'",
        this.signal
      );

      metrics.cpqReports = reportResult.records.length;

      for (const r of reportResult.records) {
        findings.push(
          createFinding({
            domain: 'dependency',
            collector: 'dependencies',
            artifactType: 'CPQReport',
            artifactName: r.Name as string,
            artifactId: r.Id as string,
            findingType: 'cpq_report',
            sourceType: 'object',
            riskLevel: 'info',
            complexityLevel: 'low',
            migrationRelevance: 'optional',
            notes: `Folder: ${r.FolderName}${r.LastRunDate ? ` — Last run: ${r.LastRunDate}` : ''}`,
          })
        );
      }
    } catch (err) {
      this.log.warn({ error: (err as Error).message }, 'report_extraction_failed');
    }

    // ================================================================
    // 10.7: Synchronous dependency risk
    // ================================================================
    const syncCount =
      ((metrics.synchronousTriggerCount as number) || 0) +
      ((metrics.synchronousFlowCount as number) || 0);
    metrics.synchronousDependencyCount = syncCount;
    metrics.synchronousDependencyRisk = syncCount > 5 ? 'high' : syncCount > 2 ? 'medium' : 'low';

    this.log.info(
      {
        apexClasses: cpqApexClasses,
        triggers: metrics.cpqRelatedTriggers,
        flows: metrics.cpqRelatedFlows,
        syncRisk: metrics.synchronousDependencyRisk,
        findings: findings.length,
      },
      'dependencies_complete'
    );

    return {
      findings,
      relationships: [],
      metrics: {
        collectorName: 'dependencies',
        domain: 'dependency',
        metrics,
        warnings,
        coverage: 100,
        schemaVersion: '1.0',
      },
      status: 'success',
    };
  }
}
