/**
 * Pricing collector — price rules, discounts, QCP, lookups, context blueprint.
 *
 * Implements Extraction Spec Section 6 (§6.1-§6.14):
 * - Price Rules + Conditions + Actions (6.1-6.3)
 * - Discount Schedules + Tiers (6.4-6.5)
 * - Block Prices (6.6)
 * - Contracted Prices (6.7)
 * - Summary Variables (6.8)
 * - QCP/Custom Scripts (6.9) — source code extraction + regex analysis
 * - Lookup Queries + Data (6.10-6.11)
 * - Context Definition Blueprint (6.14)
 *
 * Tier 0 — mandatory. Failure aborts the run.
 *
 * See: Implementation Plan Tasks 4.2a + 4.2b + 4.2c
 */

import { BaseCollector, type CollectorContext, type CollectorResult } from './base.ts';
import type { CollectorDefinition } from './registry.ts';
import type { AssessmentFindingInput, AssessmentRelationshipInput } from '@revbrain/contract';
import { createFinding } from '../normalize/findings.ts';
import { buildSafeQuery } from '../salesforce/query-builder.ts';
import type { DescribeResult } from '../salesforce/rest.ts';
import { truncateWithFlag } from '../lib/truncate.ts';
import { detectQcpDynamicDispatch } from '../lib/apex-classify.ts';

export class PricingCollector extends BaseCollector {
  constructor(ctx: CollectorContext) {
    const definition: CollectorDefinition = {
      name: 'pricing',
      tier: 'tier0',
      timeoutMs: 20 * 60_000,
      requires: ['discovery'],
      domain: 'pricing',
    };
    super(definition, ctx);
  }

  protected async execute(): Promise<CollectorResult> {
    const findings: AssessmentFindingInput[] = [];
    const relationships: AssessmentRelationshipInput[] = [];
    const metrics: Record<string, number | string | boolean> = {};
    const warnings: string[] = [];

    // Track fields participating in pricing logic (for Context Blueprint §6.14)
    const contextFields = new Set<string>();

    // ================================================================
    // 6.1: Price Rules
    // ================================================================
    this.ctx.progress.updateSubstep('pricing', 'price_rules');
    this.log.info('extracting_price_rules');

    const prDescribe = this.ctx.describeCache.get('SBQQ__PriceRule__c') as
      | DescribeResult
      | undefined;
    let priceRules: Record<string, unknown>[] = [];

    if (prDescribe) {
      const q = buildSafeQuery(
        'SBQQ__PriceRule__c',
        [
          'Id',
          'Name',
          'SBQQ__Active__c',
          'SBQQ__ConditionsMet__c',
          'SBQQ__EvaluationEvent__c',
          'SBQQ__EvaluationOrder__c',
          'SBQQ__LookupObject__c',
          'SBQQ__Product__c',
          'SBQQ__Scope__c',
          'SBQQ__TargetObject__c',
          'SBQQ__Calculator__c',
          'SBQQ__Configurator__c',
        ],
        prDescribe
      );
      priceRules = await this.ctx.restApi.queryAll<Record<string, unknown>>(q.query, this.signal);

      metrics.totalPriceRules = priceRules.length;
      metrics.activePriceRules = priceRules.filter((r) => r.SBQQ__Active__c === true).length;
      metrics.calculatorRules = priceRules.filter((r) => r.SBQQ__Calculator__c === true).length;
      metrics.configuratorRules = priceRules.filter((r) => r.SBQQ__Configurator__c === true).length;

      const evalDist: Record<string, number> = {};
      for (const r of priceRules) {
        const ev = (r.SBQQ__EvaluationEvent__c as string) || '(none)';
        evalDist[ev] = (evalDist[ev] || 0) + 1;
      }

      for (const r of priceRules) {
        const isActive = r.SBQQ__Active__c === true;
        findings.push(
          createFinding({
            domain: 'pricing',
            collector: 'pricing',
            artifactType: 'SBQQ__PriceRule__c',
            artifactName: r.Name as string,
            artifactId: r.Id as string,
            findingType: 'price_rule',
            sourceType: 'object',
            riskLevel: 'medium',
            complexityLevel: 'medium',
            migrationRelevance: isActive ? 'must-migrate' : 'optional',
            rcaTargetConcept: 'PricingProcedure',
            rcaMappingComplexity: 'transform',
            usageLevel: isActive ? undefined : 'dormant',
            notes: `${isActive ? '' : 'Inactive — '}Eval: ${r.SBQQ__EvaluationEvent__c}, Scope: ${r.SBQQ__Scope__c}`,
            evidenceRefs: [
              {
                type: 'field-ref',
                value: String(isActive),
                label: 'Active',
              },
            ],
          })
        );
      }
    }

    // ================================================================
    // 6.2: Price Conditions
    // ================================================================
    this.ctx.progress.updateSubstep('pricing', 'conditions');
    const pcDescribe = this.ctx.describeCache.get('SBQQ__PriceCondition__c') as
      | DescribeResult
      | undefined;

    if (pcDescribe) {
      const q = buildSafeQuery(
        'SBQQ__PriceCondition__c',
        [
          'Id',
          'SBQQ__Rule__c',
          'SBQQ__Field__c',
          'SBQQ__Object__c',
          'SBQQ__Operator__c',
          'SBQQ__Value__c',
          'SBQQ__FilterType__c',
          'SBQQ__TestedField__c',
          'SBQQ__TestedVariable__c',
        ],
        pcDescribe
      );
      const conditions = await this.ctx.restApi.queryAll<Record<string, unknown>>(
        q.query,
        this.signal
      );
      metrics.totalPriceConditions = conditions.length;

      // Track fields in pricing logic (Context Blueprint)
      for (const c of conditions) {
        if (c.SBQQ__TestedField__c)
          contextFields.add(`${c.SBQQ__Object__c || 'Quote'}.${c.SBQQ__TestedField__c}`);
        if (c.SBQQ__Field__c) contextFields.add(`Quote.${c.SBQQ__Field__c}`);
      }
    }

    // ================================================================
    // 6.3: Price Actions
    // ================================================================
    const paDescribe = this.ctx.describeCache.get('SBQQ__PriceAction__c') as
      | DescribeResult
      | undefined;

    if (paDescribe) {
      const q = buildSafeQuery(
        'SBQQ__PriceAction__c',
        [
          'Id',
          'SBQQ__Rule__c',
          'SBQQ__Field__c',
          'SBQQ__Formula__c',
          'SBQQ__Order__c',
          'SBQQ__SourceLookupField__c',
          'SBQQ__SourceVariable__c',
          'SBQQ__TargetObject__c',
          'SBQQ__Value__c',
        ],
        paDescribe
      );
      const actions = await this.ctx.restApi.queryAll<Record<string, unknown>>(
        q.query,
        this.signal
      );
      metrics.totalPriceActions = actions.length;

      for (const a of actions) {
        if (a.SBQQ__Field__c)
          contextFields.add(`${a.SBQQ__TargetObject__c || 'QuoteLine'}.${a.SBQQ__Field__c}`);
      }
    }

    if (await this.checkCancellation()) return this.emptyResult('success');

    // ================================================================
    // 6.4-6.5: Discount Schedules + Tiers
    // ================================================================
    this.ctx.progress.updateSubstep('pricing', 'discounts');
    const dsDescribe = this.ctx.describeCache.get('SBQQ__DiscountSchedule__c') as
      | DescribeResult
      | undefined;

    if (dsDescribe) {
      const q = buildSafeQuery(
        'SBQQ__DiscountSchedule__c',
        [
          'Id',
          'Name',
          'SBQQ__Account__c',
          'SBQQ__AggregationScope__c',
          'SBQQ__CrossOrders__c',
          'SBQQ__CrossProducts__c',
          'SBQQ__DiscountUnit__c',
          'SBQQ__Product__c',
          'SBQQ__ScheduleType__c',
          'SBQQ__Type__c',
        ],
        dsDescribe
      );
      const schedules = await this.ctx.restApi.queryAll<Record<string, unknown>>(
        q.query,
        this.signal
      );
      metrics.totalDiscountSchedules = schedules.length;
      metrics.crossProductSchedules = schedules.filter(
        (s) => s.SBQQ__CrossProducts__c === true
      ).length;

      // Discount tiers
      const dtDescribe = this.ctx.describeCache.get('SBQQ__DiscountTier__c') as
        | DescribeResult
        | undefined;
      if (dtDescribe) {
        const tq = buildSafeQuery(
          'SBQQ__DiscountTier__c',
          [
            'Id',
            'SBQQ__Schedule__c',
            'SBQQ__Discount__c',
            'SBQQ__LowerBound__c',
            'SBQQ__UpperBound__c',
            'SBQQ__Price__c',
          ],
          dtDescribe
        );
        const tiers = await this.ctx.restApi.queryAll<Record<string, unknown>>(
          tq.query,
          this.signal
        );
        metrics.totalDiscountTiers = tiers.length;
      }

      for (const s of schedules) {
        findings.push(
          createFinding({
            domain: 'pricing',
            collector: 'pricing',
            artifactType: 'SBQQ__DiscountSchedule__c',
            artifactName: s.Name as string,
            artifactId: s.Id as string,
            findingType: 'discount_schedule',
            sourceType: 'object',
            complexityLevel: 'medium',
            migrationRelevance: 'must-migrate',
            rcaTargetConcept: 'PricingProcedureDiscountNode',
            rcaMappingComplexity: 'transform',
          })
        );
      }
    }

    if (await this.checkCancellation()) return this.emptyResult('success');

    // ================================================================
    // 6.8: Summary Variables
    // ================================================================
    this.ctx.progress.updateSubstep('pricing', 'summary_variables');
    const svDescribe = this.ctx.describeCache.get('SBQQ__SummaryVariable__c') as
      | DescribeResult
      | undefined;

    if (svDescribe) {
      const q = buildSafeQuery(
        'SBQQ__SummaryVariable__c',
        [
          'Id',
          'Name',
          'SBQQ__AggregateField__c',
          'SBQQ__AggregateFunction__c',
          'SBQQ__FilterField__c',
          'SBQQ__FilterValue__c',
          'SBQQ__Scope__c',
          'SBQQ__TargetObject__c',
        ],
        svDescribe
      );
      const vars = await this.ctx.restApi.queryAll<Record<string, unknown>>(q.query, this.signal);
      metrics.totalSummaryVariables = vars.length;

      for (const v of vars) {
        if (v.SBQQ__AggregateField__c) contextFields.add(`QuoteLine.${v.SBQQ__AggregateField__c}`);
        if (v.SBQQ__FilterField__c) contextFields.add(`QuoteLine.${v.SBQQ__FilterField__c}`);
      }
    }

    // ================================================================
    // 6.9: QCP / Custom Scripts — HIGHEST RISK ITEM
    // ================================================================
    this.ctx.progress.updateSubstep('pricing', 'qcp_scripts');
    this.log.info('extracting_qcp_scripts');

    const qcpDescribe = this.ctx.describeCache.get('SBQQ__CustomScript__c') as
      | DescribeResult
      | undefined;

    if (qcpDescribe) {
      const q = buildSafeQuery(
        'SBQQ__CustomScript__c',
        [
          'Id',
          'Name',
          'SBQQ__GroupFields__c',
          'SBQQ__QuoteFields__c',
          'SBQQ__QuoteLineFields__c',
          'SBQQ__TranspiledCode__c',
          'SBQQ__Code__c',
        ],
        qcpDescribe
      );
      const scripts = await this.ctx.restApi.queryAll<Record<string, unknown>>(
        q.query,
        this.signal
      );
      metrics.totalCustomScripts = scripts.length;

      for (const s of scripts) {
        const code = (s.SBQQ__Code__c as string) || '';
        const lineCount = code.split('\n').length;

        // Regex analysis for field references, callouts, __mdt
        const sbqqRefs = code.match(/SBQQ__\w+/g) || [];
        const customFieldRefs = (code.match(/\w+__c/g) || []).filter(
          (f) => !f.startsWith('SBQQ__')
        );
        const calloutPatterns = code.match(/fetch|XMLHttpRequest|HttpRequest|Http\s*\(/g) || [];
        const connQueryPatterns = code.match(/conn\.query/g) || [];
        const mdtRefs = code.match(/\w+__mdt/g) || [];

        // Track QCP field references in Context Blueprint
        for (const ref of sbqqRefs) {
          contextFields.add(`QCP.${ref}`);
        }

        metrics[`qcp_${s.Name}_lines`] = lineCount;

        const hasCallouts = calloutPatterns.length > 0 || connQueryPatterns.length > 0;
        const riskLevel = hasCallouts ? 'critical' : lineCount > 500 ? 'high' : 'medium';

        findings.push(
          createFinding({
            domain: 'pricing',
            collector: 'pricing',
            artifactType: 'SBQQ__CustomScript__c',
            artifactName: s.Name as string,
            artifactId: s.Id as string,
            findingType: 'qcp_script',
            sourceType: 'object',
            riskLevel,
            complexityLevel: lineCount > 500 ? 'very-high' : lineCount > 200 ? 'high' : 'medium',
            migrationRelevance: 'must-migrate',
            rcaTargetConcept: 'PricingProcedure',
            rcaMappingComplexity: 'redesign',
            // LLM-readiness: preserve full source code
            textValue: this.ctx.config.codeExtractionEnabled ? code : undefined,
            countValue: lineCount,
            notes: `${lineCount} lines, ${sbqqRefs.length} SBQQ refs, ${customFieldRefs.length} custom field refs${hasCallouts ? ', HAS EXTERNAL CALLOUTS' : ''}`,
            evidenceRefs: [
              ((): AssessmentFindingInput['evidenceRefs'][number] => {
                const snippet = truncateWithFlag(code, 500);
                return {
                  type: 'code-snippet',
                  value: snippet.value,
                  label: `QCP: ${s.Name}`,
                  referencedObjects: ['SBQQ__Quote__c', 'SBQQ__QuoteLine__c'],
                  referencedFields: [...new Set([...sbqqRefs, ...customFieldRefs])].slice(0, 50),
                  referencedMetadata: mdtRefs,
                  ...(snippet.wasTruncated
                    ? { truncated: true, originalBytes: snippet.originalBytes }
                    : {}),
                };
              })(),
              // EXT-CC3 — surface every dynamic-dispatch pattern
              // detected in this QCP body. The v1.1 critical
              // pattern `conn.query()` runs arbitrary SOQL the
              // static analyzer cannot resolve.
              ...detectQcpDynamicDispatch(code).map((pattern) => ({
                type: 'field-ref' as const,
                value: 'dynamicDispatchPattern',
                label: pattern,
              })),
            ],
          })
        );

        if (hasCallouts) {
          warnings.push(
            `QCP "${s.Name}" has external callouts — requires complete redesign for RCA`
          );
        }
      }

      metrics.totalQcpLines = scripts.reduce(
        (sum, s) => sum + ((s.SBQQ__Code__c as string) || '').split('\n').length,
        0
      );
      metrics.qcpWithCallouts = scripts.filter((s) => {
        const code = (s.SBQQ__Code__c as string) || '';
        return /fetch|XMLHttpRequest|HttpRequest|conn\.query/.test(code);
      }).length;
    }

    if (await this.checkCancellation()) return this.emptyResult('success');

    // ================================================================
    // 6.10-6.11: Lookup Queries + Data
    // ================================================================
    this.ctx.progress.updateSubstep('pricing', 'lookups');
    const lqDescribe = this.ctx.describeCache.get('SBQQ__LookupQuery__c') as
      | DescribeResult
      | undefined;

    if (lqDescribe) {
      const q = buildSafeQuery(
        'SBQQ__LookupQuery__c',
        [
          'Id',
          'SBQQ__MatchType__c',
          'SBQQ__Operator__c',
          'SBQQ__PriceRule2__c',
          'SBQQ__ProductRule__c',
          'SBQQ__TestedField__c',
          'SBQQ__TestedObject__c',
        ],
        lqDescribe
      );
      const queries = await this.ctx.restApi.queryAll<Record<string, unknown>>(
        q.query,
        this.signal
      );
      metrics.totalLookupQueries = queries.length;

      // Count lookup data records
      const ldDescribe = this.ctx.describeCache.get('SBQQ__LookupData__c') as
        | DescribeResult
        | undefined;
      if (ldDescribe) {
        try {
          const countResult = await this.ctx.restApi.query<Record<string, unknown>>(
            'SELECT COUNT() FROM SBQQ__LookupData__c',
            this.signal
          );
          metrics.totalLookupDataRecords = countResult.totalSize;
        } catch {
          metrics.totalLookupDataRecords = -1;
        }
      }
    }

    // ================================================================
    // 6.7: Contracted Prices
    // ================================================================
    this.ctx.progress.updateSubstep('pricing', 'contracted_prices');
    const cpDescribe = this.ctx.describeCache.get('SBQQ__ContractedPrice__c') as
      | DescribeResult
      | undefined;

    if (cpDescribe) {
      const q = buildSafeQuery(
        'SBQQ__ContractedPrice__c',
        [
          'Id',
          'SBQQ__Account__c',
          'SBQQ__Product__c',
          'SBQQ__Discount__c',
          'SBQQ__Price__c',
          'SBQQ__EffectiveDate__c',
          'SBQQ__ExpirationDate__c',
        ],
        cpDescribe
      );
      const prices = await this.ctx.restApi.queryAll<Record<string, unknown>>(q.query, this.signal);

      const now = new Date();
      metrics.totalContractedPrices = prices.length;
      metrics.activeContractedPrices = prices.filter((p) => {
        const exp = p.SBQQ__ExpirationDate__c as string | null;
        return !exp || new Date(exp) > now;
      }).length;
      metrics.uniqueAccountsWithContractedPrices = new Set(
        prices.map((p) => p.SBQQ__Account__c as string)
      ).size;
    }

    // ================================================================
    // 6.14: Context Definition Blueprint
    // ================================================================
    metrics.contextFieldCount = contextFields.size;
    metrics.contextObjectCount = new Set([...contextFields].map((f) => f.split('.')[0])).size;

    this.log.info(
      {
        priceRules: priceRules.length,
        discountSchedules: metrics.totalDiscountSchedules,
        qcpScripts: metrics.totalCustomScripts,
        contextFields: contextFields.size,
        findings: findings.length,
      },
      'pricing_complete'
    );

    return {
      findings,
      relationships,
      metrics: {
        collectorName: 'pricing',
        domain: 'pricing',
        metrics,
        warnings,
        coverage: 100,
        schemaVersion: '1.0',
      },
      status: 'success',
    };
  }
}
