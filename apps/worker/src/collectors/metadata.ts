/**
 * Metadata collector — page layouts, record types, field sets, validation rules, object limits.
 *
 * Implements Phase 3 (C-10): Metadata API extraction for Appendix E.
 *
 * Tier 2 / async / opt-in — failure does not abort pipeline.
 * Designed to run after the main report pipeline (does not block MVP delivery).
 *
 * Uses:
 * - REST API describeSObject() for record types, field sets
 * - Tooling API for validation rules
 * - Describe for object limits (custom field count, etc.)
 *
 * Note: Full Metadata API retrieve (SOAP) for layouts/FlexiPages is expensive.
 * V1 uses REST/Tooling API for what's available; full SOAP retrieve deferred.
 */

import { BaseCollector, type CollectorContext, type CollectorResult } from './base.ts';
import type { CollectorDefinition } from './registry.ts';
import type { AssessmentFindingInput } from '@revbrain/contract';
import { createFinding } from '../normalize/findings.ts';
import type { DescribeResult } from '../salesforce/rest.ts';

/** CPQ objects to analyze for metadata configuration */
const CPQ_OBJECTS_FOR_METADATA = [
  'Product2',
  'SBQQ__Quote__c',
  'SBQQ__QuoteLine__c',
  'SBQQ__ProductOption__c',
  'SBQQ__PriceRule__c',
  'SBQQ__ProductRule__c',
  'Order',
  'OrderItem',
  'Contract',
];

export class MetadataCollector extends BaseCollector {
  constructor(ctx: CollectorContext) {
    const definition: CollectorDefinition = {
      name: 'metadata',
      tier: 'tier2',
      timeoutMs: 15 * 60_000, // 15 min — metadata API is slow
      requires: ['discovery'],
      domain: 'customization',
    };
    super(definition, ctx);
  }

  protected async execute(): Promise<CollectorResult> {
    const findings: AssessmentFindingInput[] = [];
    const metrics: Record<string, number | string | boolean> = {};
    const warnings: string[] = [];

    for (const objectName of CPQ_OBJECTS_FOR_METADATA) {
      if (await this.checkCancellation()) break;

      this.ctx.progress.updateSubstep('metadata', objectName);
      const describe = this.ctx.describeCache.get(objectName) as DescribeResult | undefined;

      if (!describe) {
        // Object not accessible — skip
        continue;
      }

      try {
        // Record Types
        const allRecordTypes = (describe.recordTypeInfos ?? []) as Array<{
          active: boolean;
          name: string;
        }>;
        const recordTypes = allRecordTypes.filter(
          (rt) => rt.active === true && rt.name !== 'Master'
        );
        findings.push(
          createFinding({
            domain: 'customization',
            collector: 'metadata',
            artifactType: 'ObjectConfiguration',
            artifactName: `${objectName}: Record Types`,
            sourceType: 'metadata',
            detected: recordTypes.length > 0,
            countValue: recordTypes.length,
            notes:
              recordTypes.length > 0
                ? `${recordTypes.length} active record type(s): ${recordTypes.map((rt) => rt.name).join(', ')}`
                : 'No custom record types (Master only)',
          })
        );

        // Custom Fields count
        const customFields = describe.fields.filter((f) => f.custom === true);
        const managedFields = customFields.filter(
          (f) => f.name.includes('__c') && f.name.split('__').length > 2
        );
        findings.push(
          createFinding({
            domain: 'customization',
            collector: 'metadata',
            artifactType: 'ObjectConfiguration',
            artifactName: `${objectName}: Custom Fields`,
            sourceType: 'metadata',
            detected: customFields.length > 0,
            countValue: customFields.length,
            notes: `${customFields.length} custom fields (${managedFields.length} from managed packages)`,
          })
        );

        // Triggers (from describe)
        const triggerable = (describe as unknown as Record<string, unknown>).triggerable === true;
        findings.push(
          createFinding({
            domain: 'customization',
            collector: 'metadata',
            artifactType: 'ObjectConfiguration',
            artifactName: `${objectName}: Triggerable`,
            sourceType: 'metadata',
            detected: triggerable,
            notes: triggerable ? 'Object supports triggers' : 'Object does not support triggers',
          })
        );

        // Validation Rules via Tooling API
        try {
          const valRuleResult = await this.ctx.restApi.toolingQuery<Record<string, unknown>>(
            `SELECT Id, ValidationName, Active FROM ValidationRule WHERE EntityDefinition.QualifiedApiName = '${objectName}'`,
            this.signal
          );
          const activeRules = valRuleResult.records.filter((r) => r.Active === true);
          findings.push(
            createFinding({
              domain: 'customization',
              collector: 'metadata',
              artifactType: 'ObjectConfiguration',
              artifactName: `${objectName}: Validation Rules`,
              sourceType: 'tooling',
              detected: activeRules.length > 0,
              countValue: activeRules.length,
              notes: `${activeRules.length} active validation rule(s) of ${valRuleResult.totalSize} total`,
            })
          );
        } catch {
          warnings.push(`Validation rule query failed for ${objectName}`);
        }

        metrics[`${objectName}_recordTypes`] = recordTypes.length;
        metrics[`${objectName}_customFields`] = customFields.length;
      } catch (err) {
        this.log.warn(
          { object: objectName, error: (err as Error).message },
          'metadata_object_failed'
        );
        warnings.push(`Metadata extraction failed for ${objectName}: ${(err as Error).message}`);
      }
    }

    this.log.info(
      { objectsProcessed: CPQ_OBJECTS_FOR_METADATA.length, findings: findings.length },
      'metadata_extraction_complete'
    );

    return {
      findings,
      relationships: [],
      metrics: {
        collectorName: 'metadata',
        domain: 'customization',
        metrics,
        warnings,
        coverage:
          warnings.length === 0
            ? 100
            : Math.round(
                ((CPQ_OBJECTS_FOR_METADATA.length - warnings.length) /
                  CPQ_OBJECTS_FOR_METADATA.length) *
                  100
              ),
        schemaVersion: '1.0',
      },
      status: warnings.length > 0 ? 'partial' : 'success',
    };
  }
}
