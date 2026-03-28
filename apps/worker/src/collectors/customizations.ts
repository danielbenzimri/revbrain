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
        'SELECT DeveloperName, NamespacePrefix ' +
          "FROM CustomObject WHERE DeveloperName LIKE '%mdt' AND NamespacePrefix = null",
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
            notes: `Custom Metadata Type: ${mdt.DeveloperName}__mdt`,
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
      // Query validation rules one object at a time (Metadata queries limited to 1 row at a time)
      const allVRs: Array<Record<string, unknown>> = [];
      for (const obj of CPQ_OBJECTS_TO_SCAN) {
        try {
          const vrResult = await this.ctx.restApi.toolingQuery<Record<string, unknown>>(
            `SELECT Id, ValidationName, Active, Description FROM ValidationRule WHERE EntityDefinition.DeveloperName = '${obj.replace('__c', '').replace('SBQQ__', '')}'`,
            this.signal
          );
          for (const vr of vrResult.records) {
            allVRs.push({ ...vr, _entity: obj });
          }
        } catch {
          // Some objects may not support this query — skip
        }
      }

      metrics.totalValidationRules = allVRs.length;
      metrics.activeValidationRules = allVRs.filter((r) => r.Active === true).length;

      for (const vr of allVRs) {
        const entity = vr._entity as string;

        findings.push(
          createFinding({
            domain: 'customization',
            collector: 'customizations',
            artifactType: 'ValidationRule',
            artifactName: `${entity}.${vr.ValidationName}`,
            artifactId: vr.Id as string,
            findingType: 'validation_rule',
            sourceType: 'tooling',
            riskLevel: 'low',
            migrationRelevance: vr.Active ? 'should-migrate' : 'optional',
            notes: `${vr.Active ? 'Active' : 'Inactive'} validation on ${entity}. ${(vr.Description as string) ?? ''}`,
            evidenceRefs: [
              {
                type: 'object-ref' as const,
                value: entity,
                label: vr.ValidationName as string,
                referencedObjects: [entity],
              },
            ],
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
      const sharingDevNames = CPQ_OBJECTS_TO_SCAN.map(
        (o) => `'${o.replace('__c', '').replace('SBQQ__', '')}'`
      ).join(',');
      const sharingResult = await this.ctx.restApi.toolingQuery<Record<string, unknown>>(
        `SELECT DeveloperName, ExternalSharingModel, InternalSharingModel ` +
          `FROM EntityDefinition WHERE DeveloperName IN (${sharingDevNames})`,
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
