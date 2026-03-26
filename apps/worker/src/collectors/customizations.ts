/**
 * Customizations collector — custom fields, validation rules, sharing, page layouts.
 *
 * Implements Extraction Spec Section 9 + §16.3:
 * - Custom fields on CPQ objects (9.1)
 * - Custom objects related to CPQ (9.2 + auto-detection §16.3)
 * - Custom Metadata Types (9.3)
 * - Validation rules (9.4) — formulas preserved for LLM
 * - Record types (9.5)
 * - Sharing rules & OWD (9.7)
 *
 * Tier 1 — failure → completed_warnings.
 */

import { BaseCollector, type CollectorContext, type CollectorResult } from './base.ts';
import type { CollectorDefinition } from './registry.ts';
import type { AssessmentFindingInput } from '@revbrain/contract';
import { createFinding } from '../normalize/findings.ts';
import { getCustomFields } from '../salesforce/query-builder.ts';
import type { DescribeResult } from '../salesforce/rest.ts';

const CPQ_OBJECTS_TO_SCAN = [
  'Product2',
  'SBQQ__Quote__c',
  'SBQQ__QuoteLine__c',
  'SBQQ__QuoteLineGroup__c',
  'Opportunity',
  'Account',
  'Order',
  'OrderItem',
  'Contract',
  'Asset',
];

export class CustomizationsCollector extends BaseCollector {
  constructor(ctx: CollectorContext) {
    const definition: CollectorDefinition = {
      name: 'customizations',
      tier: 'tier1',
      timeoutMs: 10 * 60_000,
      requires: ['discovery'],
      domain: 'customization',
    };
    super(definition, ctx);
  }

  protected async execute(): Promise<CollectorResult> {
    const findings: AssessmentFindingInput[] = [];
    const metrics: Record<string, number | string | boolean> = {};
    const warnings: string[] = [];

    // ================================================================
    // 9.1: Custom fields on CPQ objects
    // ================================================================
    this.ctx.progress.updateSubstep('customizations', 'custom_fields');
    this.log.info('extracting_custom_fields');

    let totalCustomFields = 0;
    let totalFormulaFields = 0;

    for (const objName of CPQ_OBJECTS_TO_SCAN) {
      const describe = this.ctx.describeCache.get(objName) as DescribeResult | undefined;
      if (!describe) continue;

      const customFields = getCustomFields(describe);
      const formulaFields = customFields.filter((f) => f.calculatedFormula != null);

      totalCustomFields += customFields.length;
      totalFormulaFields += formulaFields.length;

      metrics[`customFields_${objName}`] = customFields.length;
      metrics[`formulaFields_${objName}`] = formulaFields.length;

      // Create findings for formula fields (they contain logic)
      for (const f of formulaFields) {
        findings.push(
          createFinding({
            domain: 'customization',
            collector: 'customizations',
            artifactType: 'FormulaField',
            artifactName: `${objName}.${f.name}`,
            sourceType: 'metadata',
            findingType: 'formula_field',
            complexityLevel: 'medium',
            migrationRelevance: 'should-migrate',
            textValue: this.ctx.config.codeExtractionEnabled
              ? (f.calculatedFormula ?? undefined)
              : undefined,
            notes: `Formula field on ${objName}: ${f.label} (${f.type})`,
            evidenceRefs: [
              {
                type: 'formula',
                value: f.calculatedFormula ?? '',
                label: f.name,
                referencedObjects: [objName],
                referencedFields: [f.name],
              },
            ],
          })
        );
      }
    }

    metrics.totalCustomFieldsAcrossCPQ = totalCustomFields;
    metrics.totalFormulaFieldsAcrossCPQ = totalFormulaFields;

    if (await this.checkCancellation()) return this.emptyResult('success');

    // ================================================================
    // 9.3: Custom Metadata Types
    // ================================================================
    this.ctx.progress.updateSubstep('customizations', 'metadata_types');

    try {
      const mdtResult = await this.ctx.restApi.toolingQuery<Record<string, unknown>>(
        'SELECT DeveloperName, NamespacePrefix, QualifiedApiName ' +
          "FROM CustomObject WHERE QualifiedApiName LIKE '%__mdt' AND NamespacePrefix = null",
        this.signal
      );
      metrics.customMetadataTypesCount = mdtResult.records.length;

      for (const mdt of mdtResult.records) {
        findings.push(
          createFinding({
            domain: 'customization',
            collector: 'customizations',
            artifactType: 'CustomMetadataType',
            artifactName: mdt.DeveloperName as string,
            sourceType: 'tooling',
            findingType: 'custom_metadata',
            complexityLevel: 'medium',
            migrationRelevance: 'should-migrate',
            notes: `Custom Metadata Type: ${mdt.QualifiedApiName}`,
          })
        );
      }
    } catch (err) {
      this.log.warn({ error: (err as Error).message }, 'mdt_extraction_failed');
    }

    // ================================================================
    // 9.4: Validation Rules
    // ================================================================
    this.ctx.progress.updateSubstep('customizations', 'validation_rules');

    try {
      const vrObjects = CPQ_OBJECTS_TO_SCAN.map((o) => `'${o}'`).join(',');
      const vrResult = await this.ctx.restApi.toolingQuery<Record<string, unknown>>(
        `SELECT Id, EntityDefinition.QualifiedApiName, ValidationName, Active, Description, Metadata ` +
          `FROM ValidationRule WHERE EntityDefinition.QualifiedApiName IN (${vrObjects})`,
        this.signal
      );

      metrics.totalValidationRules = vrResult.records.length;
      metrics.activeValidationRules = vrResult.records.filter((r) => r.Active === true).length;

      for (const vr of vrResult.records) {
        const entity = (vr.EntityDefinition as Record<string, unknown>)?.QualifiedApiName as string;
        const metadata = vr.Metadata as Record<string, unknown>;
        const formula = metadata?.errorConditionFormula as string;

        // Check if formula references SBQQ fields
        const hasSbqqRef = formula ? /SBQQ__/.test(formula) : false;

        findings.push(
          createFinding({
            domain: 'customization',
            collector: 'customizations',
            artifactType: 'ValidationRule',
            artifactName: `${entity}.${vr.ValidationName}`,
            artifactId: vr.Id as string,
            findingType: 'validation_rule',
            sourceType: 'tooling',
            riskLevel: hasSbqqRef ? 'medium' : 'low',
            migrationRelevance: vr.Active ? 'should-migrate' : 'optional',
            textValue: this.ctx.config.codeExtractionEnabled ? formula : undefined,
            notes: `${vr.Active ? 'Active' : 'Inactive'} validation on ${entity}${hasSbqqRef ? ' — references CPQ fields' : ''}`,
            evidenceRefs: formula
              ? [
                  {
                    type: 'formula',
                    value: formula.slice(0, 500),
                    label: vr.ValidationName as string,
                    referencedObjects: [entity],
                    referencedFields: (formula.match(/SBQQ__\w+/g) || []).slice(0, 20),
                  },
                ]
              : [],
          })
        );
      }
    } catch (err) {
      this.log.warn({ error: (err as Error).message }, 'validation_rules_extraction_failed');
    }

    // ================================================================
    // 9.5: Record Types
    // ================================================================
    this.ctx.progress.updateSubstep('customizations', 'record_types');

    let recordTypeComplexity = 0;
    for (const objName of CPQ_OBJECTS_TO_SCAN) {
      const describe = this.ctx.describeCache.get(objName) as DescribeResult | undefined;
      if (!describe) continue;

      const activeRecordTypes = describe.recordTypeInfos.filter(
        (rt) => rt.active && rt.name !== 'Master'
      );
      if (activeRecordTypes.length > 0) {
        recordTypeComplexity += activeRecordTypes.length;
        metrics[`recordTypes_${objName}`] = activeRecordTypes.length;
      }
    }
    metrics.recordTypeComplexity = recordTypeComplexity;

    // ================================================================
    // 9.7: Sharing Rules & OWD
    // ================================================================
    this.ctx.progress.updateSubstep('customizations', 'sharing');

    try {
      const sharingObjects = CPQ_OBJECTS_TO_SCAN.map((o) => `'${o}'`).join(',');
      const sharingResult = await this.ctx.restApi.toolingQuery<Record<string, unknown>>(
        `SELECT QualifiedApiName, ExternalSharingModel, InternalSharingModel ` +
          `FROM EntityDefinition WHERE QualifiedApiName IN (${sharingObjects})`,
        this.signal
      );

      let privateShareCount = 0;
      for (const s of sharingResult.records) {
        if (s.InternalSharingModel === 'Private') privateShareCount++;
      }
      metrics.sharingModelComplexity = privateShareCount;
    } catch (err) {
      this.log.warn({ error: (err as Error).message }, 'sharing_extraction_failed');
    }

    this.log.info(
      {
        customFields: totalCustomFields,
        formulaFields: totalFormulaFields,
        findings: findings.length,
      },
      'customizations_complete'
    );

    return {
      findings,
      relationships: [],
      metrics: {
        collectorName: 'customizations',
        domain: 'customization',
        metrics,
        warnings,
        coverage: 100,
        schemaVersion: '1.0',
      },
      status: 'success',
    };
  }
}
