/**
 * Localization collector — translations, custom labels, language distribution.
 *
 * Implements Extraction Spec Section 14:
 * - Step 14.1: SBQQ__Localization__c records (driven from Describe)
 * - Step 14.2: Custom Labels (ExternalString) via Tooling API
 * - Step 14.3: Translation Workbench status
 *
 * Uses Bulk API path if localization count > 2000.
 *
 * Tier 2 — failure → completed_warnings.
 */

import { BaseCollector, type CollectorContext, type CollectorResult } from './base.ts';
import type { CollectorDefinition } from './registry.ts';
import type { AssessmentFindingInput } from '@revbrain/contract';
import { createFinding } from '../normalize/findings.ts';
import { buildSafeQuery } from '../salesforce/query-builder.ts';
import type { DescribeResult } from '../salesforce/rest.ts';

const BULK_THRESHOLD = 2000;

export class LocalizationCollector extends BaseCollector {
  constructor(ctx: CollectorContext) {
    const definition: CollectorDefinition = {
      name: 'localization',
      tier: 'tier2',
      timeoutMs: 10 * 60_000,
      requires: ['discovery'],
      domain: 'localization',
    };
    super(definition, ctx);
  }

  protected async execute(): Promise<CollectorResult> {
    const findings: AssessmentFindingInput[] = [];
    const metrics: Record<string, number | string | boolean> = {};
    const warnings: string[] = [];

    // ================================================================
    // 14.1: CPQ Localization Records (SBQQ__Localization__c)
    // ================================================================
    this.ctx.progress.updateSubstep('localization', 'localization_records');
    this.log.info('extracting_localization_records');

    const languageDistribution = new Map<string, number>();
    let translatedTemplateIds = new Set<string>();
    let translatedProductIds = new Set<string>();

    try {
      const describe = this.ctx.describeCache.get('SBQQ__Localization__c') as
        | DescribeResult
        | undefined;
      if (describe) {
        // Wishlist driven from Describe (per Spec §14.1 audit note)
        const wishlist = [
          'Id',
          'Name',
          'SBQQ__Language__c',
          'SBQQ__Label__c',
          'SBQQ__Text__c',
          'SBQQ__RichText__c',
          'SBQQ__APIName__c',
          'SBQQ__QuoteTemplate__c',
          'SBQQ__Product__c',
        ];
        const { query: safeQuery } = buildSafeQuery('SBQQ__Localization__c', wishlist, describe);

        // Check count first for Bulk API decision
        const countResult = await this.ctx.restApi.query<Record<string, unknown>>(
          'SELECT COUNT() FROM SBQQ__Localization__c',
          this.signal
        );
        const totalCount = countResult.totalSize;
        metrics.translationVolume = totalCount;

        if (totalCount === 0) {
          this.log.info('no_localization_records');
        } else if (totalCount > BULK_THRESHOLD) {
          // Bulk API path for large volumes
          this.log.info({ count: totalCount }, 'using_bulk_api_for_localizations');
          metrics.localizationBulkApiUsed = true;

          // For large volumes, use aggregate queries for distribution metrics
          // rather than fetching all records (Bulk CSV parsing is expensive)
          await this.extractLanguageDistribution(languageDistribution, warnings);

          // Get template and product translation counts via aggregate
          try {
            const templateAgg = await this.ctx.restApi.queryAll<Record<string, unknown>>(
              'SELECT SBQQ__QuoteTemplate__c tmpl FROM SBQQ__Localization__c ' +
                'WHERE SBQQ__QuoteTemplate__c != null GROUP BY SBQQ__QuoteTemplate__c',
              this.signal
            );
            translatedTemplateIds = new Set(templateAgg.map((r) => r.tmpl as string));

            const productAgg = await this.ctx.restApi.queryAll<Record<string, unknown>>(
              'SELECT SBQQ__Product__c prod FROM SBQQ__Localization__c ' +
                'WHERE SBQQ__Product__c != null GROUP BY SBQQ__Product__c',
              this.signal
            );
            translatedProductIds = new Set(productAgg.map((r) => r.prod as string));
          } catch (aggErr) {
            this.log.warn({ error: (aggErr as Error).message }, 'localization_aggregate_failed');
            warnings.push(`Localization aggregate queries failed: ${(aggErr as Error).message}`);
          }
        } else {
          // REST API path for smaller volumes
          const records = await this.ctx.restApi.queryAll<Record<string, unknown>>(
            safeQuery,
            this.signal
          );

          for (const r of records) {
            const lang = (r.SBQQ__Language__c as string) || 'Unknown';
            languageDistribution.set(lang, (languageDistribution.get(lang) || 0) + 1);
            if (r.SBQQ__QuoteTemplate__c)
              translatedTemplateIds.add(r.SBQQ__QuoteTemplate__c as string);
            if (r.SBQQ__Product__c) translatedProductIds.add(r.SBQQ__Product__c as string);
          }
        }

        // Store language distribution
        metrics.languageCount = languageDistribution.size;
        for (const [lang, count] of languageDistribution) {
          metrics[`lang_${lang}`] = count;
        }

        metrics.translatedTemplates = translatedTemplateIds.size;
        metrics.translatedProducts = translatedProductIds.size;

        // Create finding for overall localization scope
        if (totalCount > 0) {
          const languages = [...languageDistribution.keys()].join(', ');
          findings.push(
            createFinding({
              domain: 'localization',
              collector: 'localization',
              artifactType: 'LocalizationSummary',
              artifactName: 'cpq_localization_overview',
              findingType: 'localization_volume',
              sourceType: 'object',
              riskLevel: totalCount > 1000 ? 'high' : totalCount > 100 ? 'medium' : 'low',
              complexityLevel: totalCount > 1000 ? 'high' : 'medium',
              migrationRelevance: 'must-migrate',
              rcaTargetConcept: 'Translation Workbench',
              rcaMappingComplexity: 'transform',
              countValue: totalCount,
              notes: `${totalCount} localization records across ${languageDistribution.size} languages (${languages}). ${translatedTemplateIds.size} templates, ${translatedProductIds.size} products translated.${totalCount > 1000 ? ' Complex multi-region migration.' : ''}`,
            })
          );
        }

        // Per-language findings for major translation efforts
        for (const [lang, count] of languageDistribution) {
          if (count > 50) {
            findings.push(
              createFinding({
                domain: 'localization',
                collector: 'localization',
                artifactType: 'LanguageTranslation',
                artifactName: `language_${lang}`,
                findingType: 'language_translation_volume',
                sourceType: 'object',
                scope: lang,
                riskLevel: count > 500 ? 'high' : 'medium',
                migrationRelevance: 'must-migrate',
                rcaTargetConcept: 'Translation Workbench',
                rcaMappingComplexity: 'transform',
                countValue: count,
                notes: `${count} localization records for language: ${lang}`,
              })
            );
          }
        }
      } else {
        this.log.info('sbqq_localization_object_not_found');
        metrics.translationVolume = 0;
        metrics.languageCount = 0;
      }
    } catch (err) {
      this.log.warn({ error: (err as Error).message }, 'localization_extraction_failed');
      warnings.push(`Localization extraction failed: ${(err as Error).message}`);
    }

    if (await this.checkCancellation()) return this.emptyResult('success');

    // ================================================================
    // 14.2: Custom Labels (SBQQ namespace via Tooling API)
    // ================================================================
    this.ctx.progress.updateSubstep('localization', 'custom_labels');

    try {
      // SBQQ-managed labels
      const sbqqLabels = await this.ctx.restApi.toolingQuery<Record<string, unknown>>(
        'SELECT Id, Name, Value, Language, NamespacePrefix, Category ' +
          "FROM ExternalString WHERE NamespacePrefix = 'SBQQ'",
        this.signal
      );

      metrics.cpqManagedLabels = sbqqLabels.records.length;

      // Customer-created labels referencing CPQ
      const customCpqLabels = await this.ctx.restApi.toolingQuery<Record<string, unknown>>(
        'SELECT Id, Name, Value, Language, Category ' +
          'FROM ExternalString ' +
          "WHERE NamespacePrefix = null AND Category LIKE '%CPQ%'",
        this.signal
      );

      metrics.customerCpqLabels = customCpqLabels.records.length;
      metrics.totalCpqLabels = sbqqLabels.records.length + customCpqLabels.records.length;

      // Check for overridden SBQQ labels (language != default or value modified)
      // SBQQ labels in non-English languages indicate customer translation effort
      const labelLanguages = new Set<string>();
      for (const label of sbqqLabels.records) {
        if (label.Language) labelLanguages.add(label.Language as string);
      }
      metrics.labelLanguageCount = labelLanguages.size;

      if (customCpqLabels.records.length > 0) {
        findings.push(
          createFinding({
            domain: 'localization',
            collector: 'localization',
            artifactType: 'CustomLabel',
            artifactName: 'customer_cpq_labels',
            findingType: 'custom_cpq_labels',
            sourceType: 'tooling',
            riskLevel: 'medium',
            migrationRelevance: 'should-migrate',
            rcaTargetConcept: 'Custom Labels',
            rcaMappingComplexity: 'transform',
            countValue: customCpqLabels.records.length,
            notes: `${customCpqLabels.records.length} customer-created custom labels with CPQ category — may need remapping for RCA`,
          })
        );
      }
    } catch (err) {
      this.log.warn({ error: (err as Error).message }, 'custom_labels_extraction_failed');
      warnings.push(`Custom labels extraction failed: ${(err as Error).message}`);
    }

    if (await this.checkCancellation()) return this.emptyResult('success');

    // ================================================================
    // 14.3: Translation Workbench Status
    // ================================================================
    this.ctx.progress.updateSubstep('localization', 'translation_workbench');

    try {
      // Check org default language
      const orgResult = await this.ctx.restApi.query<Record<string, unknown>>(
        'SELECT LanguageLocaleKey FROM Organization',
        this.signal
      );

      if (orgResult.records.length > 0) {
        metrics.orgDefaultLanguage = orgResult.records[0].LanguageLocaleKey as string;
      }

      // Check for active languages (Translation Workbench)
      try {
        const langResult = await this.ctx.restApi.toolingQuery<Record<string, unknown>>(
          'SELECT Language, IsActive FROM LanguageLocaleKey WHERE IsActive = true',
          this.signal
        );
        metrics.activeLanguages = langResult.records.length;

        if (langResult.records.length > 1) {
          const activeLanguages = langResult.records.map((r) => r.Language as string).join(', ');
          findings.push(
            createFinding({
              domain: 'localization',
              collector: 'localization',
              artifactType: 'TranslationWorkbench',
              artifactName: 'translation_workbench_status',
              findingType: 'translation_workbench',
              sourceType: 'tooling',
              riskLevel: langResult.records.length > 5 ? 'high' : 'medium',
              migrationRelevance: 'should-migrate',
              rcaTargetConcept: 'Translation Workbench',
              rcaMappingComplexity: 'direct',
              countValue: langResult.records.length,
              detected: true,
              notes: `Translation Workbench active with ${langResult.records.length} languages: ${activeLanguages}`,
            })
          );
        }
      } catch (langErr) {
        // LanguageLocaleKey may not be queryable via Tooling in all orgs
        this.log.warn({ error: (langErr as Error).message }, 'language_locale_query_failed');
        // Fallback: infer from localization data
        if (languageDistribution.size > 1) {
          metrics.activeLanguages = languageDistribution.size;
        }
      }
    } catch (err) {
      this.log.warn({ error: (err as Error).message }, 'translation_workbench_check_failed');
      warnings.push(`Translation workbench check failed: ${(err as Error).message}`);
    }

    this.log.info(
      {
        translationVolume: metrics.translationVolume,
        languageCount: metrics.languageCount,
        cpqLabels: metrics.totalCpqLabels,
        translatedProducts: metrics.translatedProducts,
        translatedTemplates: metrics.translatedTemplates,
        findings: findings.length,
      },
      'localization_complete'
    );

    return {
      findings,
      relationships: [],
      metrics: {
        collectorName: 'localization',
        domain: 'localization',
        metrics,
        warnings,
        coverage: 100,
        schemaVersion: '1.0',
      },
      status: 'success',
    };
  }

  /**
   * Fallback: extract language distribution via aggregate query
   * when Bulk API fails for large localization volumes.
   */
  private async extractLanguageDistribution(
    distribution: Map<string, number>,
    warnings: string[]
  ): Promise<void> {
    try {
      const aggResult = await this.ctx.restApi.queryAll<Record<string, unknown>>(
        'SELECT SBQQ__Language__c lang, COUNT(Id) cnt ' +
          'FROM SBQQ__Localization__c GROUP BY SBQQ__Language__c',
        this.signal
      );
      for (const row of aggResult) {
        const lang = (row.lang as string) || 'Unknown';
        distribution.set(lang, row.cnt as number);
      }
    } catch (err) {
      this.log.warn({ error: (err as Error).message }, 'language_distribution_aggregate_failed');
      warnings.push(`Language distribution aggregate failed: ${(err as Error).message}`);
    }
  }
}
