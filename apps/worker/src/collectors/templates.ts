/**
 * Templates collector — quote templates, document generation, output formats.
 *
 * Implements Extraction Spec Section 7:
 * - Step 7.1: SBQQ__QuoteTemplate__c extraction
 * - Step 7.2: SBQQ__TemplateSection__c mapping
 * - Step 7.3: SBQQ__TemplateContent__c (rich text, merge fields, JS blocks)
 * - Step 7.4: SBQQ__LineColumn__c (line item table columns)
 * - Step 7.5: SBQQ__Term__c (quote terms)
 * - Step 7.7: Quote document count (last 90 days)
 * - Step 7.8: Document & image references
 *
 * LLM-readiness: Merge field refs and JS blocks preserved in evidenceRefs.
 *
 * Tier 2 — failure → completed_warnings.
 */

import { BaseCollector, type CollectorContext, type CollectorResult } from './base.ts';
import type { CollectorDefinition } from './registry.ts';
import type { AssessmentFindingInput } from '@revbrain/contract';
import { createFinding } from '../normalize/findings.ts';
import { buildSafeQuery } from '../salesforce/query-builder.ts';
import type { DescribeResult } from '../salesforce/rest.ts';
import { truncateWithFlag } from '../lib/truncate.ts';

/** Merge field patterns from Spec §7.3 */
const MERGE_FIELD_REGEX = /\{!(\w+)\.(\w+)\}/g;
const RELATIONSHIP_MERGE_REGEX = /\{!(\w+)\.(\w+__r)\.(\w+)\}/g;
const LABEL_MERGE_REGEX = /\{!\$ObjectType\.(\w+)\.Fields\.(\w+)\.Label\}/g;
const SCRIPT_BLOCK_REGEX = /<script[\s\S]*?<\/script>/gi;

interface MergeFieldRef {
  objectName: string;
  fieldName: string;
  relationshipPath?: string;
  source: string;
}

export class TemplatesCollector extends BaseCollector {
  constructor(ctx: CollectorContext) {
    const definition: CollectorDefinition = {
      name: 'templates',
      tier: 'tier2',
      timeoutMs: 10 * 60_000,
      requires: ['discovery'],
      domain: 'templates',
    };
    super(definition, ctx);
  }

  protected async execute(): Promise<CollectorResult> {
    const findings: AssessmentFindingInput[] = [];
    const metrics: Record<string, number | string | boolean> = {};
    const warnings: string[] = [];

    // ================================================================
    // 7.1: Quote Templates (SBQQ__QuoteTemplate__c)
    // ================================================================
    this.ctx.progress.updateSubstep('templates', 'quote_templates');
    this.log.info('extracting_quote_templates');

    const templateIds = new Set<string>();

    try {
      const describe = this.ctx.describeCache.get('SBQQ__QuoteTemplate__c') as
        | DescribeResult
        | undefined;
      if (describe) {
        const wishlist = [
          'Id',
          'Name',
          'SBQQ__Default__c',
          'SBQQ__FontFamily__c',
          'SBQQ__FontSize__c',
          'SBQQ__GroupName__c',
          'SBQQ__HeaderHeight__c',
          'SBQQ__FooterHeight__c',
          'SBQQ__PageHeight__c',
          'SBQQ__PageWidth__c',
          'SBQQ__TopMargin__c',
          'SBQQ__BottomMargin__c',
          'SBQQ__BorderColor__c',
          'SBQQ__ShadingColor__c',
          'SBQQ__CompanyName__c',
          'SBQQ__CompanyPhone__c',
          'SBQQ__CompanySlogan__c',
          'SBQQ__LogoDocument__c',
          'SBQQ__WatermarkId__c',
          'CreatedDate',
          'LastModifiedDate',
        ];
        const { query } = buildSafeQuery('SBQQ__QuoteTemplate__c', wishlist, describe);
        const result = await this.ctx.restApi.queryAll<Record<string, unknown>>(query, this.signal);

        metrics.totalTemplates = result.length;
        const defaultTemplates = result.filter((t) => t.SBQQ__Default__c === true);
        metrics.defaultTemplates = defaultTemplates.length;

        // Collect document references (logos, watermarks)
        const documentRefIds: string[] = [];

        for (const t of result) {
          const id = t.Id as string;
          templateIds.add(id);

          if (t.SBQQ__LogoDocument__c) documentRefIds.push(t.SBQQ__LogoDocument__c as string);
          if (t.SBQQ__WatermarkId__c) documentRefIds.push(t.SBQQ__WatermarkId__c as string);

          findings.push(
            createFinding({
              domain: 'templates',
              collector: 'templates',
              artifactType: 'QuoteTemplate',
              artifactName: t.Name as string,
              artifactId: id,
              findingType: 'quote_template',
              sourceType: 'object',
              complexityLevel: 'medium',
              migrationRelevance: 'must-migrate',
              rcaTargetConcept: 'Document Generation',
              rcaMappingComplexity: 'redesign',
              notes: `Template: ${t.Name}${t.SBQQ__Default__c ? ' (DEFAULT)' : ''}. Font: ${t.SBQQ__FontFamily__c || 'unset'}, Size: ${t.SBQQ__FontSize__c || 'unset'}`,
            })
          );
        }

        metrics.documentDependencies = documentRefIds.length;

        // 7.8: Document metadata lookup
        if (documentRefIds.length > 0) {
          try {
            const docIdList = documentRefIds.map((id) => `'${id}'`).join(',');
            const docResult = await this.ctx.restApi.query<Record<string, unknown>>(
              `SELECT Id, Name, Type, ContentType, BodyLength FROM Document WHERE Id IN (${docIdList})`,
              this.signal
            );
            for (const doc of docResult.records) {
              findings.push(
                createFinding({
                  domain: 'templates',
                  collector: 'templates',
                  artifactType: 'Document',
                  artifactName: doc.Name as string,
                  artifactId: doc.Id as string,
                  findingType: 'template_document_ref',
                  sourceType: 'object',
                  riskLevel: 'medium',
                  migrationRelevance: 'must-migrate',
                  rcaTargetConcept: 'Salesforce Files',
                  rcaMappingComplexity: 'transform',
                  countValue: doc.BodyLength as number,
                  notes: `Referenced document: ${doc.Name} (${doc.ContentType}, ${doc.BodyLength} bytes). Must migrate to Salesforce Files.`,
                })
              );
            }
          } catch (err) {
            this.log.warn({ error: (err as Error).message }, 'document_ref_lookup_failed');
            warnings.push(`Document reference lookup failed: ${(err as Error).message}`);
          }
        }
      } else {
        warnings.push('SBQQ__QuoteTemplate__c not found in Describe cache — skipping templates');
        metrics.totalTemplates = 0;
      }
    } catch (err) {
      this.log.warn({ error: (err as Error).message }, 'template_extraction_failed');
      warnings.push(`Template extraction failed: ${(err as Error).message}`);
    }

    if (await this.checkCancellation()) return this.emptyResult('success');

    // ================================================================
    // 7.2: Template Sections (SBQQ__TemplateSection__c)
    // ================================================================
    this.ctx.progress.updateSubstep('templates', 'template_sections');

    let conditionalSections = 0;

    try {
      const describe = this.ctx.describeCache.get('SBQQ__TemplateSection__c') as
        | DescribeResult
        | undefined;
      if (describe) {
        const wishlist = [
          'Id',
          'Name',
          'SBQQ__Template__c',
          'SBQQ__Content__c',
          'SBQQ__ConditionalPrintField__c',
          'SBQQ__DisplayOrder__c',
          'SBQQ__SectionType__c',
          'SBQQ__PageBreakBefore__c',
          'SBQQ__BorderColor__c',
          'SBQQ__ShadingColor__c',
        ];
        const { query } = buildSafeQuery('SBQQ__TemplateSection__c', wishlist, describe, {
          orderBy: 'SBQQ__Template__c, SBQQ__DisplayOrder__c',
        });
        const result = await this.ctx.restApi.queryAll<Record<string, unknown>>(query, this.signal);

        metrics.totalSections = result.length;

        // Group by template for distribution metric
        const sectionsByTemplate = new Map<string, number>();
        for (const s of result) {
          const templateId = s.SBQQ__Template__c as string;
          sectionsByTemplate.set(templateId, (sectionsByTemplate.get(templateId) || 0) + 1);
          if (s.SBQQ__ConditionalPrintField__c) conditionalSections++;
        }

        metrics.conditionalSections = conditionalSections;

        // Sections per template distribution
        const sectionCounts = [...sectionsByTemplate.values()];
        if (sectionCounts.length > 0) {
          metrics.avgSectionsPerTemplate =
            Math.round((sectionCounts.reduce((a, b) => a + b, 0) / sectionCounts.length) * 10) / 10;
          metrics.maxSectionsPerTemplate = Math.max(...sectionCounts);
        }

        if (conditionalSections > 0) {
          findings.push(
            createFinding({
              domain: 'templates',
              collector: 'templates',
              artifactType: 'TemplateSection',
              artifactName: 'conditional_sections_summary',
              findingType: 'conditional_sections',
              sourceType: 'object',
              riskLevel: 'medium',
              complexityLevel: 'high',
              migrationRelevance: 'must-migrate',
              rcaTargetConcept: 'Document Generation conditional logic',
              rcaMappingComplexity: 'redesign',
              countValue: conditionalSections,
              notes: `${conditionalSections} template sections use conditional print fields — logic must be recreated in RCA document generation`,
            })
          );
        }
      }
    } catch (err) {
      this.log.warn({ error: (err as Error).message }, 'section_extraction_failed');
      warnings.push(`Section extraction failed: ${(err as Error).message}`);
    }

    if (await this.checkCancellation()) return this.emptyResult('success');

    // ================================================================
    // 7.3: Template Content — merge fields + JavaScript blocks
    // ================================================================
    this.ctx.progress.updateSubstep('templates', 'template_content');

    let javaScriptBlockCount = 0;
    const allMergeFields: MergeFieldRef[] = [];

    try {
      const describe = this.ctx.describeCache.get('SBQQ__TemplateContent__c') as
        | DescribeResult
        | undefined;
      if (describe) {
        const wishlist = [
          'Id',
          'Name',
          'SBQQ__FontFamily__c',
          'SBQQ__FontSize__c',
          'SBQQ__Markup__c',
          'SBQQ__RawMarkup__c',
          'SBQQ__Type__c',
        ];
        const { query } = buildSafeQuery('SBQQ__TemplateContent__c', wishlist, describe);
        const result = await this.ctx.restApi.queryAll<Record<string, unknown>>(query, this.signal);

        metrics.totalTemplateContent = result.length;

        for (const tc of result) {
          const name = tc.Name as string;
          const markup = (tc.SBQQ__Markup__c as string) || '';
          const rawMarkup = (tc.SBQQ__RawMarkup__c as string) || '';
          const combined = markup + rawMarkup;

          // Parse merge fields
          const mergeFields = this.parseMergeFields(combined, name);
          allMergeFields.push(...mergeFields);

          // Detect JavaScript blocks
          const scripts = combined.match(SCRIPT_BLOCK_REGEX) || [];
          if (scripts.length > 0) {
            javaScriptBlockCount += scripts.length;

            // EXT-CC6 + EXT-1.5 — replace the silent 2,000-char cap
            // with a 100 KB byte-aware cap and propagate the
            // truncation flag onto the produced evidenceRef so the
            // BB-3 normalizer + downstream consumers can see partial
            // bodies. The 100 KB cap matches gaps-doc OQ-2.
            const joined = scripts.join('\n---\n');
            const fullBody = truncateWithFlag(joined, 102_400);
            const snippetSrc = scripts[0] ?? '';
            const snippet = truncateWithFlag(snippetSrc, 500);

            findings.push(
              createFinding({
                domain: 'templates',
                collector: 'templates',
                artifactType: 'TemplateContent',
                artifactName: name,
                artifactId: tc.Id as string,
                findingType: 'javascript_in_template',
                sourceType: 'object',
                riskLevel: 'high',
                complexityLevel: 'very-high',
                migrationRelevance: 'must-migrate',
                rcaTargetConcept: 'Custom logic in document generation',
                rcaMappingComplexity: 'redesign',
                countValue: scripts.length,
                textValue: this.ctx.config.codeExtractionEnabled ? fullBody.value : undefined,
                notes:
                  `${scripts.length} JavaScript <script> block(s) found — HIGH RISK: must be rewritten for RCA` +
                  (fullBody.wasTruncated
                    ? ` (textValue truncated from ${fullBody.originalBytes} bytes to 102400)`
                    : ''),
                evidenceRefs: [
                  {
                    type: 'code-snippet',
                    value: snippet.value,
                    label: `JS in template: ${name}`,
                    ...(snippet.wasTruncated
                      ? { truncated: true, originalBytes: snippet.originalBytes }
                      : {}),
                  },
                ],
              })
            );
          }

          // Create finding for content with merge fields
          if (mergeFields.length > 0) {
            const referencedObjects = [...new Set(mergeFields.map((mf) => mf.objectName))];
            const referencedFields = [...new Set(mergeFields.map((mf) => mf.fieldName))];

            findings.push(
              createFinding({
                domain: 'templates',
                collector: 'templates',
                artifactType: 'TemplateContent',
                artifactName: name,
                artifactId: tc.Id as string,
                findingType: 'merge_field_content',
                sourceType: 'object',
                riskLevel: 'medium',
                migrationRelevance: 'must-migrate',
                rcaTargetConcept: 'Document Generation merge fields',
                rcaMappingComplexity: 'transform',
                countValue: mergeFields.length,
                notes: `${mergeFields.length} merge field references across ${referencedObjects.length} objects`,
                evidenceRefs: [
                  {
                    type: 'field-ref',
                    // allow-slice: bound merge-field list for evidence payload
                    value: JSON.stringify(mergeFields.slice(0, 50)),
                    label: `Merge fields in: ${name}`,
                    referencedObjects,
                    // allow-slice: bound referenced-field list for evidence
                    referencedFields: referencedFields.slice(0, 20),
                  },
                ],
              })
            );
          }
        }
      }
    } catch (err) {
      this.log.warn({ error: (err as Error).message }, 'content_extraction_failed');
      warnings.push(`Template content extraction failed: ${(err as Error).message}`);
    }

    metrics.javaScriptBlockCount = javaScriptBlockCount;
    metrics.mergeFieldsUsed = allMergeFields.length;
    metrics.mergeFieldObjects = [...new Set(allMergeFields.map((mf) => mf.objectName))].length;

    if (javaScriptBlockCount > 0) {
      warnings.push(
        `${javaScriptBlockCount} JavaScript blocks in template content — HIGH migration risk`
      );
    }

    if (await this.checkCancellation()) return this.emptyResult('success');

    // ================================================================
    // 7.4: Line Columns (SBQQ__LineColumn__c)
    // ================================================================
    this.ctx.progress.updateSubstep('templates', 'line_columns');

    try {
      const describe = this.ctx.describeCache.get('SBQQ__LineColumn__c') as
        | DescribeResult
        | undefined;
      if (describe) {
        const wishlist = [
          'Id',
          'Name',
          'SBQQ__Template__c',
          'SBQQ__FieldName__c',
          'SBQQ__DisplayOrder__c',
          'SBQQ__SummaryDisplayType__c',
          'SBQQ__Width__c',
          'SBQQ__Alignment__c',
          'SBQQ__ConditionalAppearanceField__c',
          'SBQQ__ConditionalAppearanceFilter__c',
          'SBQQ__ShadingColor__c',
        ];
        const { query } = buildSafeQuery('SBQQ__LineColumn__c', wishlist, describe, {
          orderBy: 'SBQQ__Template__c, SBQQ__DisplayOrder__c',
        });
        const result = await this.ctx.restApi.queryAll<Record<string, unknown>>(query, this.signal);

        metrics.totalLineColumns = result.length;
        const conditionalColumns = result.filter(
          (c) => c.SBQQ__ConditionalAppearanceField__c != null
        ).length;
        metrics.conditionalLineColumns = conditionalColumns;
      }
    } catch (err) {
      this.log.warn({ error: (err as Error).message }, 'line_column_extraction_failed');
      warnings.push(`Line column extraction failed: ${(err as Error).message}`);
    }

    if (await this.checkCancellation()) return this.emptyResult('success');

    // ================================================================
    // 7.5: Quote Terms (SBQQ__Term__c)
    // ================================================================
    this.ctx.progress.updateSubstep('templates', 'quote_terms');

    try {
      const describe = this.ctx.describeCache.get('SBQQ__Term__c') as DescribeResult | undefined;
      if (describe) {
        const wishlist = [
          'Id',
          'Name',
          'SBQQ__Active__c',
          'SBQQ__Body__c',
          'SBQQ__PrintOrder__c',
          'SBQQ__ConditionalPrintField__c',
          'SBQQ__ConditionalPrintValue__c',
          'SBQQ__StandardTerm__c',
        ];
        const { query } = buildSafeQuery('SBQQ__Term__c', wishlist, describe);
        const result = await this.ctx.restApi.queryAll<Record<string, unknown>>(query, this.signal);

        metrics.totalTerms = result.length;
        metrics.conditionalTerms = result.filter(
          (t) => t.SBQQ__ConditionalPrintField__c != null
        ).length;
      }
    } catch (err) {
      this.log.warn({ error: (err as Error).message }, 'term_extraction_failed');
      warnings.push(`Term extraction failed: ${(err as Error).message}`);
    }

    if (await this.checkCancellation()) return this.emptyResult('success');

    // ================================================================
    // 7.7: Quote Documents — count only (last 90 days)
    // ================================================================
    this.ctx.progress.updateSubstep('templates', 'quote_documents');

    const usedTemplateIds = new Set<string>();

    try {
      const describe = this.ctx.describeCache.get('SBQQ__QuoteDocument__c') as
        | DescribeResult
        | undefined;
      if (describe) {
        // First get a count
        const countResult = await this.ctx.restApi.query<Record<string, unknown>>(
          'SELECT COUNT() FROM SBQQ__QuoteDocument__c WHERE CreatedDate >= LAST_N_DAYS:90',
          this.signal
        );
        const docCount = countResult.totalSize;
        metrics.quoteDocumentsLast90Days = docCount;

        // Get template usage distribution (always small result set)
        const templateUsageResult = await this.ctx.restApi.queryAll<Record<string, unknown>>(
          'SELECT SBQQ__Template__c, COUNT(Id) cnt FROM SBQQ__QuoteDocument__c ' +
            'WHERE CreatedDate >= LAST_N_DAYS:90 GROUP BY SBQQ__Template__c',
          this.signal
        );

        for (const row of templateUsageResult) {
          if (row.SBQQ__Template__c) {
            usedTemplateIds.add(row.SBQQ__Template__c as string);
          }
        }

        metrics.templatesUsedLast90Days = usedTemplateIds.size;
      }
    } catch (err) {
      this.log.warn({ error: (err as Error).message }, 'document_count_failed');
      warnings.push(`Quote document count failed: ${(err as Error).message}`);
    }

    // Unused templates = total templates minus templates used in last 90 days
    const totalTemplateCount = (metrics.totalTemplates as number) || 0;
    const unusedTemplates =
      templateIds.size > 0 ? [...templateIds].filter((id) => !usedTemplateIds.has(id)).length : 0;
    metrics.unusedTemplates = unusedTemplates;

    if (unusedTemplates > 0 && totalTemplateCount > 0) {
      findings.push(
        createFinding({
          domain: 'templates',
          collector: 'templates',
          artifactType: 'QuoteTemplate',
          artifactName: 'unused_templates_summary',
          findingType: 'unused_templates',
          sourceType: 'inferred',
          riskLevel: 'info',
          migrationRelevance: 'optional',
          countValue: unusedTemplates,
          notes: `${unusedTemplates} of ${totalTemplateCount} templates had no document generation in the last 90 days — consider excluding from migration`,
        })
      );
    }

    this.log.info(
      {
        templates: metrics.totalTemplates,
        sections: metrics.totalSections,
        mergeFields: allMergeFields.length,
        jsBlocks: javaScriptBlockCount,
        unusedTemplates,
        findings: findings.length,
      },
      'templates_complete'
    );

    return {
      findings,
      relationships: [],
      metrics: {
        collectorName: 'templates',
        domain: 'templates',
        metrics,
        warnings,
        coverage: 100,
        schemaVersion: '1.0',
      },
      status: 'success',
    };
  }

  /**
   * Parse merge field references from markup content.
   * Handles standard {!Object.Field}, relationship traversal, and label refs.
   */
  private parseMergeFields(markup: string, source: string): MergeFieldRef[] {
    const refs: MergeFieldRef[] = [];
    if (!markup) return refs;

    // Standard merge fields: {!Object.Field}
    let match: RegExpExecArray | null;
    const standardRegex = new RegExp(MERGE_FIELD_REGEX.source, 'g');
    while ((match = standardRegex.exec(markup)) !== null) {
      refs.push({ objectName: match[1], fieldName: match[2], source });
    }

    // Relationship traversal: {!Object.Relationship__r.Field}
    const relRegex = new RegExp(RELATIONSHIP_MERGE_REGEX.source, 'g');
    while ((match = relRegex.exec(markup)) !== null) {
      refs.push({
        objectName: match[1],
        fieldName: match[3],
        relationshipPath: `${match[2]}.${match[3]}`,
        source,
      });
    }

    // Label references: {!$ObjectType.Object.Fields.Field.Label}
    const labelRegex = new RegExp(LABEL_MERGE_REGEX.source, 'g');
    while ((match = labelRegex.exec(markup)) !== null) {
      refs.push({ objectName: match[1], fieldName: match[2], source });
    }

    return refs;
  }
}
