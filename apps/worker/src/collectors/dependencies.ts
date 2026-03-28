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

      for (const cls of allClasses) {
        const body = (cls.Body as string) || '';
        const name = cls.Name as string;
        const hasSbqq = /SBQQ__/.test(body);
        const hasTriggerControl = /SBQQ\.TriggerControl/.test(body);
        const hasCallout = /Http\s*\(|HttpRequest|fetch|WebServiceCallout/.test(body);

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
                {
                  type: 'code-snippet',
                  value: body.slice(0, 500),
                  label: `Apex: ${name}`,
                  referencedObjects: CPQ_OBJECTS.filter((o) => body.includes(o)),
                  referencedFields: (body.match(/SBQQ__\w+__c/g) || []).slice(0, 20),
                },
              ],
            })
          );
        }

        if (hasTriggerControl) triggerControlCount++;
      }

      metrics.cpqRelatedApexClasses = cpqApexClasses;
      metrics.cpqApexLineCount = totalApexLines;
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

      const cpqFlows = flowResult.records.filter((f) => {
        const trigger = f.TriggerObjectOrEvent as string;
        return trigger && CPQ_OBJECTS.some((o) => trigger.includes(o));
      });

      metrics.totalActiveFlows = flowResult.records.length;
      metrics.cpqRelatedFlows = cpqFlows.length;

      // Process types
      const processBuildersCount = flowResult.records.filter(
        (f) => f.ProcessType === 'Workflow'
      ).length;
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
    // 10.5: Synchronous dependency risk
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
