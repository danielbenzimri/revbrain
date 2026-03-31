/**
 * Approvals collector — CPQ custom actions, standard approvals, advanced approvals.
 *
 * Implements Extraction Spec Section 8:
 * - Step 8.1: SBQQ__CustomAction__c (CPQ custom actions)
 * - Step 8.2: SBQQ__CustomActionCondition__c (action conditions)
 * - Step 8.3: Standard Approval Processes via Tooling API (ProcessDefinition)
 * - Step 8.4: Advanced Approvals (sbaa__ namespace) — driven from Describe
 *
 * LLM-readiness: Approval rule conditions and criteria preserved in textValue.
 *
 * Tier 2 — failure → completed_warnings.
 */

import { BaseCollector, type CollectorContext, type CollectorResult } from './base.ts';
import type { CollectorDefinition } from './registry.ts';
import type { AssessmentFindingInput } from '@revbrain/contract';
import { createFinding } from '../normalize/findings.ts';
import { buildSafeQuery, getAllSbqqFields } from '../salesforce/query-builder.ts';
import type { DescribeResult } from '../salesforce/rest.ts';

const CPQ_APPROVAL_OBJECTS = ['SBQQ__Quote__c', 'Opportunity', 'Order'];

export class ApprovalsCollector extends BaseCollector {
  constructor(ctx: CollectorContext) {
    const definition: CollectorDefinition = {
      name: 'approvals',
      tier: 'tier2',
      timeoutMs: 10 * 60_000,
      requires: ['discovery'],
      domain: 'approvals',
    };
    super(definition, ctx);
  }

  protected async execute(): Promise<CollectorResult> {
    const findings: AssessmentFindingInput[] = [];
    const metrics: Record<string, number | string | boolean> = {};
    const warnings: string[] = [];

    // ================================================================
    // 8.1: CPQ Custom Actions (SBQQ__CustomAction__c)
    // ================================================================
    this.ctx.progress.updateSubstep('approvals', 'custom_actions');
    this.log.info('extracting_custom_actions');

    try {
      const describe = this.ctx.describeCache.get('SBQQ__CustomAction__c') as
        | DescribeResult
        | undefined;
      if (describe) {
        const wishlist = [
          'Id',
          'Name',
          'SBQQ__Active__c',
          'SBQQ__Type__c',
          'SBQQ__DisplayOrder__c',
          'SBQQ__Location__c',
          'SBQQ__TargetObject__c',
          'SBQQ__TargetField__c',
          'SBQQ__TargetValue__c',
          'SBQQ__ConditionsMet__c',
          'SBQQ__Label__c',
          'SBQQ__Description__c',
          'SBQQ__Default__c',
        ];
        const { query } = buildSafeQuery('SBQQ__CustomAction__c', wishlist, describe);
        const result = await this.ctx.restApi.queryAll<Record<string, unknown>>(query, this.signal);

        metrics.totalCustomActions = result.length;
        metrics.activeCustomActions = result.filter((a) => a.SBQQ__Active__c === true).length;

        // Group by type for distribution
        const typeDistribution = new Map<string, number>();
        for (const action of result) {
          const type = (action.SBQQ__Type__c as string) || 'Unknown';
          typeDistribution.set(type, (typeDistribution.get(type) || 0) + 1);

          findings.push(
            createFinding({
              domain: 'approvals',
              collector: 'approvals',
              artifactType: 'CustomAction',
              artifactName: (action.SBQQ__Label__c || action.Name) as string,
              artifactId: action.Id as string,
              findingType: 'custom_action',
              sourceType: 'object',
              riskLevel: action.SBQQ__Active__c ? 'medium' : 'low',
              complexityLevel: 'medium',
              migrationRelevance: action.SBQQ__Active__c ? 'must-migrate' : 'optional',
              rcaTargetConcept: 'Flow-based approval orchestration',
              rcaMappingComplexity: 'redesign',
              notes: `Custom Action: ${action.Name} — Type: ${action.SBQQ__Type__c}, Location: ${action.SBQQ__Location__c || 'unset'}, Target: ${action.SBQQ__TargetObject__c || 'unset'}${action.SBQQ__Active__c ? '' : ' (INACTIVE)'}`,
            })
          );
        }

        // Store type distribution as metric
        for (const [type, count] of typeDistribution) {
          metrics[`actionType_${type}`] = count;
        }
      } else {
        warnings.push(
          'SBQQ__CustomAction__c not found in Describe cache — skipping custom actions'
        );
        metrics.totalCustomActions = 0;
        metrics.activeCustomActions = 0;
      }
    } catch (err) {
      this.log.warn({ error: (err as Error).message }, 'custom_action_extraction_failed');
      warnings.push(`Custom action extraction failed: ${(err as Error).message}`);
    }

    if (await this.checkCancellation()) return this.emptyResult('success');

    // ================================================================
    // 8.2: Custom Action Conditions (SBQQ__CustomActionCondition__c)
    // ================================================================
    this.ctx.progress.updateSubstep('approvals', 'action_conditions');

    try {
      const describe = this.ctx.describeCache.get('SBQQ__CustomActionCondition__c') as
        | DescribeResult
        | undefined;
      if (describe) {
        const wishlist = [
          'Id',
          'SBQQ__CustomAction__c',
          'SBQQ__Field__c',
          'SBQQ__Object__c',
          'SBQQ__Operator__c',
          'SBQQ__FilterValue__c',
          'SBQQ__FilterType__c',
          'SBQQ__FilterVariable__c',
          'SBQQ__TestedField__c',
          'SBQQ__TestedObject__c',
          'SBQQ__TestedVariable__c',
        ];
        const { query } = buildSafeQuery('SBQQ__CustomActionCondition__c', wishlist, describe);
        const result = await this.ctx.restApi.queryAll<Record<string, unknown>>(query, this.signal);

        metrics.totalActionConditions = result.length;

        // Group by action to understand complexity
        const conditionsByAction = new Map<string, number>();
        for (const c of result) {
          const actionId = c.SBQQ__CustomAction__c as string;
          conditionsByAction.set(actionId, (conditionsByAction.get(actionId) || 0) + 1);
        }

        const condCounts = [...conditionsByAction.values()];
        if (condCounts.length > 0) {
          metrics.maxConditionsPerAction = Math.max(...condCounts);
          metrics.avgConditionsPerAction =
            Math.round((condCounts.reduce((a, b) => a + b, 0) / condCounts.length) * 10) / 10;
        }

        // Detect variable-based conditions (dynamic, harder to migrate)
        const variableConditions = result.filter(
          (c) => c.SBQQ__FilterVariable__c != null || c.SBQQ__TestedVariable__c != null
        ).length;
        if (variableConditions > 0) {
          metrics.variableBasedConditions = variableConditions;
          warnings.push(
            `${variableConditions} action conditions use variables — these require careful migration analysis`
          );
        }
      }
    } catch (err) {
      this.log.warn({ error: (err as Error).message }, 'action_conditions_extraction_failed');
      warnings.push(`Action conditions extraction failed: ${(err as Error).message}`);
    }

    if (await this.checkCancellation()) return this.emptyResult('success');

    // ================================================================
    // 8.3: Standard Approval Processes (Tooling API)
    // ================================================================
    this.ctx.progress.updateSubstep('approvals', 'standard_approvals');

    try {
      const objectList = CPQ_APPROVAL_OBJECTS.map((o) => `'${o}'`).join(',');
      const result = await this.ctx.restApi.toolingQuery<Record<string, unknown>>(
        `SELECT Id, Name, TableEnumOrId, Description, State ` +
          `FROM ProcessDefinition WHERE TableEnumOrId IN (${objectList})`,
        this.signal
      );

      metrics.standardApprovalProcesses = result.records.length;
      metrics.activeApprovalProcesses = result.records.filter((p) => p.State === 'Active').length;

      for (const proc of result.records) {
        findings.push(
          createFinding({
            domain: 'approvals',
            collector: 'approvals',
            artifactType: 'ApprovalProcess',
            artifactName: proc.Name as string,
            artifactId: proc.Id as string,
            findingType: 'standard_approval',
            sourceType: 'tooling',
            riskLevel: proc.State === 'Active' ? 'high' : 'low',
            complexityLevel: 'high',
            migrationRelevance: proc.State === 'Active' ? 'must-migrate' : 'optional',
            rcaTargetConcept: 'Flow-based approval orchestration',
            rcaMappingComplexity: 'redesign',
            notes: `Standard Approval Process on ${proc.TableEnumOrId}: ${proc.Name}${proc.State === 'Active' ? ' (ACTIVE)' : ' (INACTIVE)'}${proc.Description ? ` — ${(proc.Description as string).slice(0, 200)}` : ''}`,
          })
        );
      }
    } catch (err) {
      this.log.warn({ error: (err as Error).message }, 'standard_approval_extraction_failed');
      warnings.push(`Standard approval extraction failed: ${(err as Error).message}`);
    }

    if (await this.checkCancellation()) return this.emptyResult('success');

    // ================================================================
    // 8.4: Advanced Approvals (sbaa__ namespace)
    // ================================================================
    this.ctx.progress.updateSubstep('approvals', 'advanced_approvals');

    // C2: Independent sbaa detection (not reliant on Discovery describeCache)
    const sbaaDetection = await this.detectSbaa();
    const sbaaInstalled = sbaaDetection.installed;
    metrics.advancedApprovalsInstalled = sbaaInstalled;

    if (sbaaDetection.installed && !sbaaDetection.accessible) {
      // sbaa package detected but objects not accessible — degrade gracefully
      warnings.push(sbaaDetection.degradedReason!);
      findings.push(
        createFinding({
          domain: 'approvals',
          collector: 'approvals',
          artifactType: 'AdvancedApprovals',
          artifactName: 'advanced_approvals_degraded',
          findingType: 'advanced_approvals_degraded',
          sourceType: 'inferred',
          riskLevel: 'high',
          complexityLevel: 'high',
          migrationRelevance: 'must-migrate',
          rcaTargetConcept: 'Flow-based approval orchestration',
          rcaMappingComplexity: 'redesign',
          detected: true,
          notes: sbaaDetection.degradedReason!,
        })
      );
    }

    if (sbaaDetection.installed && sbaaDetection.accessible) {
      // C2: Ensure all sbaa objects are described (may not be in cache if Discovery missed them)
      const sbaaObjects = [
        'sbaa__ApprovalCondition__c',
        'sbaa__ApprovalChain__c',
        'sbaa__Approver__c',
        'sbaa__ApprovalVariable__c',
      ];
      for (const objName of sbaaObjects) {
        if (!this.ctx.describeCache.has(objName)) {
          try {
            const desc = await this.ctx.restApi.describe(objName, this.signal);
            this.ctx.describeCache.set(objName, desc);
          } catch {
            this.log.warn({ object: objName }, 'sbaa_object_describe_failed');
          }
        }
      }

      // 8.4a: Approval Rules
      try {
        const describe = this.ctx.describeCache.get('sbaa__ApprovalRule__c') as
          | DescribeResult
          | undefined;
        if (describe) {
          const sbqqFields = getAllSbqqFields(describe);
          // sbaa__ fields — get all accessible fields from describe
          const allFields = describe.fields
            .filter((f) => f.name.startsWith('sbaa__'))
            .map((f) => f.name);
          const fields = ['Id', 'Name', ...allFields, ...sbqqFields];
          const { query } = buildSafeQuery('sbaa__ApprovalRule__c', fields, describe);
          const result = await this.ctx.restApi.queryAll<Record<string, unknown>>(
            query,
            this.signal
          );

          metrics.approvalRuleCount = result.length;

          // Pre-fetch condition counts per rule for enrichment (Task 0.1)
          const conditionsByRule = new Map<string, number>();
          try {
            const condDescribe = this.ctx.describeCache.get('sbaa__ApprovalCondition__c') as
              | DescribeResult
              | undefined;
            if (condDescribe) {
              const condFields = ['Id', 'sbaa__ApprovalRule__c'];
              const { query: condQuery } = buildSafeQuery(
                'sbaa__ApprovalCondition__c',
                condFields,
                condDescribe
              );
              const condResult = await this.ctx.restApi.queryAll<Record<string, unknown>>(
                condQuery,
                this.signal
              );
              for (const c of condResult) {
                const ruleId = c.sbaa__ApprovalRule__c as string;
                if (ruleId) {
                  conditionsByRule.set(ruleId, (conditionsByRule.get(ruleId) || 0) + 1);
                }
              }
            }
          } catch {
            // Condition pre-fetch failed — condition counts will default to 0
          }

          for (const rule of result) {
            const ruleId = rule.Id as string;
            const condCount = conditionsByRule.get(ruleId) ?? 0;

            findings.push(
              createFinding({
                domain: 'approvals',
                collector: 'approvals',
                artifactType: 'AdvancedApprovalRule',
                artifactName: rule.Name as string,
                artifactId: ruleId,
                findingType: 'advanced_approval_rule',
                sourceType: 'object',
                riskLevel: 'high',
                complexityLevel: 'high',
                migrationRelevance: 'must-migrate',
                rcaTargetConcept: 'Flow-based approval orchestration',
                rcaMappingComplexity: 'redesign',
                countValue: condCount,
                evidenceRefs: [
                  {
                    type: 'object-ref' as const,
                    label: 'TargetObject',
                    value: (rule.sbaa__TargetObject__c as string) ?? '',
                  },
                  {
                    type: 'count' as const,
                    label: 'ConditionCount',
                    value: String(condCount),
                  },
                ],
                notes: `Advanced Approval Rule: ${rule.Name} — Target: ${(rule.sbaa__TargetObject__c as string) ?? 'N/A'}, Conditions: ${condCount}`,
              })
            );
          }
        }
      } catch (err) {
        this.log.warn({ error: (err as Error).message }, 'approval_rules_extraction_failed');
        warnings.push(`Advanced approval rules extraction failed: ${(err as Error).message}`);
      }

      // 8.4b: Approval Conditions
      try {
        const describe = this.ctx.describeCache.get('sbaa__ApprovalCondition__c') as
          | DescribeResult
          | undefined;
        if (describe) {
          const allFields = describe.fields
            .filter((f) => f.name.startsWith('sbaa__'))
            .map((f) => f.name);
          const fields = ['Id', 'Name', ...allFields];
          const { query } = buildSafeQuery('sbaa__ApprovalCondition__c', fields, describe);
          const result = await this.ctx.restApi.queryAll<Record<string, unknown>>(
            query,
            this.signal
          );

          metrics.approvalConditionCount = result.length;
        }
      } catch (err) {
        this.log.warn({ error: (err as Error).message }, 'approval_conditions_extraction_failed');
      }

      // 8.4c: Approval Chains
      try {
        const describe = this.ctx.describeCache.get('sbaa__ApprovalChain__c') as
          | DescribeResult
          | undefined;
        if (describe) {
          const allFields = describe.fields
            .filter((f) => f.name.startsWith('sbaa__'))
            .map((f) => f.name);
          const fields = ['Id', 'Name', ...allFields];
          const { query } = buildSafeQuery('sbaa__ApprovalChain__c', fields, describe);
          const result = await this.ctx.restApi.queryAll<Record<string, unknown>>(
            query,
            this.signal
          );

          metrics.approvalChainCount = result.length;
        }
      } catch (err) {
        this.log.warn({ error: (err as Error).message }, 'approval_chains_extraction_failed');
      }

      // 8.4d: Approvers
      try {
        const describe = this.ctx.describeCache.get('sbaa__Approver__c') as
          | DescribeResult
          | undefined;
        if (describe) {
          const allFields = describe.fields
            .filter((f) => f.name.startsWith('sbaa__'))
            .map((f) => f.name);
          const fields = ['Id', 'Name', ...allFields];
          const { query } = buildSafeQuery('sbaa__Approver__c', fields, describe);
          const result = await this.ctx.restApi.queryAll<Record<string, unknown>>(
            query,
            this.signal
          );

          metrics.approverCount = result.length;
        }
      } catch (err) {
        this.log.warn({ error: (err as Error).message }, 'approvers_extraction_failed');
      }

      // 8.4e: Approval Variables
      try {
        const describe = this.ctx.describeCache.get('sbaa__ApprovalVariable__c') as
          | DescribeResult
          | undefined;
        if (describe) {
          const allFields = describe.fields
            .filter((f) => f.name.startsWith('sbaa__'))
            .map((f) => f.name);
          const fields = ['Id', 'Name', ...allFields];
          const { query } = buildSafeQuery('sbaa__ApprovalVariable__c', fields, describe);
          const result = await this.ctx.restApi.queryAll<Record<string, unknown>>(
            query,
            this.signal
          );

          metrics.approvalVariableCount = result.length;
        }
      } catch (err) {
        this.log.warn({ error: (err as Error).message }, 'approval_variables_extraction_failed');
      }

      if ((metrics.approvalRuleCount as number) > 0) {
        findings.push(
          createFinding({
            domain: 'approvals',
            collector: 'approvals',
            artifactType: 'AdvancedApprovals',
            artifactName: 'advanced_approvals_summary',
            findingType: 'advanced_approvals_installed',
            sourceType: 'inferred',
            riskLevel: 'high',
            complexityLevel: 'very-high',
            migrationRelevance: 'must-migrate',
            rcaTargetConcept: 'Flow-based approval orchestration',
            rcaMappingComplexity: 'redesign',
            detected: true,
            notes: `Advanced Approvals (sbaa__) installed with ${metrics.approvalRuleCount} rules, ${metrics.approvalChainCount || 0} chains, ${metrics.approverCount || 0} approvers, ${metrics.approvalVariableCount || 0} variables — full redesign required for RCA`,
          })
        );
      }
    } else {
      metrics.approvalRuleCount = 0;
      metrics.approvalChainCount = 0;
      metrics.approverCount = 0;
      metrics.approvalVariableCount = 0;
    }

    this.log.info(
      {
        customActions: metrics.totalCustomActions,
        activeCustomActions: metrics.activeCustomActions,
        standardApprovals: metrics.standardApprovalProcesses,
        advancedInstalled: sbaaInstalled,
        approvalRules: metrics.approvalRuleCount,
        findings: findings.length,
      },
      'approvals_complete'
    );

    return {
      findings,
      relationships: [],
      metrics: {
        collectorName: 'approvals',
        domain: 'approvals',
        metrics,
        warnings,
        coverage: 100,
        schemaVersion: '1.0',
      },
      status: 'success',
    };
  }

  /**
   * C2: Check if Advanced Approvals (sbaa__ namespace) is installed.
   *
   * Three-level detection (independent of Discovery describeCache):
   * 1. Fast path: check describeCache for sbaa__ keys (optimization)
   * 2. Check _installedPackages for any package with 'sbaa' namespace
   * 3. Direct describeSObject('sbaa__ApprovalRule__c') to confirm accessibility
   *
   * Returns: { installed: boolean; accessible: boolean; degradedReason?: string }
   */
  private async detectSbaa(): Promise<{
    installed: boolean;
    accessible: boolean;
    degradedReason?: string;
  }> {
    // Fast path: describeCache already has sbaa objects (from Discovery)
    for (const [key] of this.ctx.describeCache) {
      if (key.startsWith('sbaa__')) return { installed: true, accessible: true };
    }

    // Check _installedPackages for sbaa namespace
    const installedPackages = this.ctx.describeCache.get('_installedPackages') as
      | Array<{ namespace: string; name: string; version: string }>
      | undefined;
    const sbaaPackage = installedPackages?.find(
      (pkg) => pkg.namespace.toLowerCase() === 'sbaa'
    );

    if (!sbaaPackage) {
      return { installed: false, accessible: false };
    }

    // sbaa package detected — attempt direct describe to confirm accessibility
    try {
      const describe = await this.ctx.restApi.describe('sbaa__ApprovalRule__c', this.signal);
      // Cache the result for use in the extraction loop
      this.ctx.describeCache.set('sbaa__ApprovalRule__c', describe);
      return { installed: true, accessible: true };
    } catch {
      // Package installed but objects not accessible (FLS, permissions, etc.)
      return {
        installed: true,
        accessible: false,
        degradedReason: `sbaa package detected (${sbaaPackage.name} v${sbaaPackage.version}) but sbaa__ApprovalRule__c is not accessible — check FLS/permissions`,
      };
    }
  }
}
