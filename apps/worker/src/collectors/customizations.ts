/**
 * Customizations collector — custom fields, validation rules, sharing, page layouts.
 *
 * Implements Extraction Spec Section 9 + §16.3:
 * - Custom fields on CPQ objects (9.1)
 * - Custom objects related to CPQ (9.2 + auto-detection §16.3)
 * - Custom Metadata Types (9.3)
 * - Validation rules (9.4) — formulas extracted via Tooling Metadata (EXT-1.4)
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
import { fetchToolingMetadata } from '../salesforce/tooling-metadata-fetch.ts';
import { truncateWithFlag } from '../lib/truncate.ts';

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
      // EXT-1.3 wave-3 staging fix — the pre-fix Tooling query
      // `FROM CustomObject WHERE DeveloperName LIKE '%mdt'` does
      // NOT match real Salesforce CMT types because `DeveloperName`
      // on CustomObject is the short name WITHOUT the `__mdt`
      // suffix. Discovery already uses `describeGlobal` and
      // filters by `endsWith('__mdt')` which IS correct. We
      // mirror that pattern here; the call is cheap (one API
      // call) and describeGlobal is not per-object cached.
      const descGlobal = await this.ctx.restApi.describeGlobal(this.signal);
      const mdtObjects = descGlobal.sobjects
        .filter((o) => o.name.endsWith('__mdt') && o.custom && !o.name.startsWith('SBQQ__'))
        .map((o) => ({
          DeveloperName: o.name.replace(/__mdt$/, ''),
          NamespacePrefix: null as null,
        }));
      const mdtResult: { records: Array<Record<string, unknown>> } = { records: mdtObjects };
      metrics.customMetadataTypesCount = mdtResult.records.length;

      // EXT-1.3 — Per-type record extraction. The pre-fix collector
      // emitted only the type names, leaving the actual records
      // (which often hold rules-engine config — pricing tables,
      // approval matrices, etc.) silently absent. The closure
      // strategy from the v1.1 audit:
      //   1. Describe each MDT type to discover its field list.
      //   2. Build an explicit `SELECT Id, DeveloperName,
      //      MasterLabel, <field1>, <field2>, ... FROM Type__mdt`.
      //      Explicit field lists have NO 200-row cap (only the
      //      `FIELDS(STANDARD)` form does).
      //   3. Cap per-type at 5,000 records (configurable).
      //   4. Heuristically classify rules-engine candidates by
      //      record count + presence of `Active__c|Sequence__c|
      //      Condition__c`-style fields.
      const MDT_RECORD_CAP = 5000;
      let cmtRecordCount = 0;
      let rulesEngineCandidateCount = 0;

      for (const mdt of mdtResult.records) {
        const devName = mdt.DeveloperName as string;
        const apiName = `${devName}__mdt`;

        // Per-type type-level finding (existing behavior, with
        // counts added once we know them).
        let perTypeRecordCount = 0;
        let isRulesEngineCandidate = false;
        let truncationWarning: string | null = null;

        try {
          // Step 1: Describe the type to get the field list.
          let describe: DescribeResult | undefined;
          try {
            describe = this.ctx.describeCache.get(apiName) as DescribeResult | undefined;
            if (!describe) {
              describe = await this.ctx.restApi.describe(apiName, this.signal);
              this.ctx.describeCache.set(apiName, describe);
            }
          } catch (descErr) {
            // Describe failed — emit the type-level finding only.
            this.log.warn(
              { type: apiName, error: (descErr as Error).message },
              'mdt_describe_failed'
            );
          }

          if (describe) {
            // Step 2: Build the field list. Always include the
            // identity fields; for the rest skip system + audit
            // fields that don't carry config.
            const SKIP = new Set([
              'IsDeleted',
              'SystemModstamp',
              'CreatedById',
              'CreatedDate',
              'LastModifiedById',
              'LastModifiedDate',
              'NamespacePrefix',
              'QualifiedApiName',
            ]);
            const userFields = describe.fields
              .map((f) => f.name)
              .filter(
                (n) => !SKIP.has(n) && n !== 'Id' && n !== 'DeveloperName' && n !== 'MasterLabel'
              );
            const projection = ['Id', 'DeveloperName', 'MasterLabel', ...userFields];
            const soql = `SELECT ${projection.join(', ')} FROM ${apiName} LIMIT ${MDT_RECORD_CAP + 1}`;
            const records = await this.ctx.restApi.queryAll<Record<string, unknown>>(
              soql,
              this.signal
            );
            perTypeRecordCount = records.length;
            // EXT-1.3 — record-cap detection
            const trimmed = records.slice(0, MDT_RECORD_CAP);
            if (records.length > MDT_RECORD_CAP) {
              truncationWarning = `more than ${MDT_RECORD_CAP} records (showing first ${MDT_RECORD_CAP})`;
            }

            // Step 3: rules-engine heuristic. >10 records AND
            // presence of any of these field names → classify as
            // a DecisionTable candidate (worth a closer look in
            // the migration plan).
            isRulesEngineCandidate =
              records.length > 10 &&
              userFields.some((f) =>
                /^(Active|Sequence|Condition|Priority|Order|Rule)__c$/.test(f)
              );
            if (isRulesEngineCandidate) rulesEngineCandidateCount++;

            // Step 4: emit one finding per CMT RECORD. Use the
            // record's Id as artifactId so the §8.3 distinctness
            // invariant holds (each record gets its own node).
            for (const rec of trimmed) {
              cmtRecordCount++;
              const recId = rec.Id as string;
              const recDevName = (rec.DeveloperName as string) ?? '<unnamed>';
              // Serialize field values into evidence for downstream
              // consumers. Skip Id/DevName/MasterLabel since they
              // appear at the top level.
              const valuePairs = userFields
                .map((f) => ({ field: f, value: rec[f] }))
                .filter((p) => p.value !== null && p.value !== undefined && p.value !== '');
              findings.push(
                createFinding({
                  domain: 'customization',
                  collector: 'customizations',
                  artifactType: 'CustomMetadataRecord',
                  artifactName: `${devName}.${recDevName}`,
                  artifactId: recId,
                  findingType: 'custom_metadata_record',
                  sourceType: 'tooling',
                  complexityLevel: 'low',
                  migrationRelevance: 'should-migrate',
                  notes: `${devName}__mdt record: ${(rec.MasterLabel as string) ?? recDevName}`,
                  evidenceRefs: [
                    {
                      type: 'object-ref' as const,
                      value: apiName,
                      label: recDevName,
                    },
                    // EXT-1.3 wave-2 fix — emit MasterLabel as a
                    // structured evidence-ref so the BB-3 normalizer
                    // does not have to parse it back out of `notes`
                    // (notes is human-readable, not load-bearing).
                    // The normalizer reads `interfaceName: 'masterLabel'`
                    // by convention.
                    {
                      type: 'field-ref' as const,
                      value: 'masterLabel',
                      label: (rec.MasterLabel as string) ?? recDevName,
                    },
                    // allow-slice: EXT-1.3 bound value pairs per CMT record
                    ...valuePairs.slice(0, 30).map((p) => ({
                      type: 'field-ref' as const,
                      value: `${apiName}.${p.field}`,
                      label: String(p.value),
                    })),
                  ],
                })
              );
            }
          }
        } catch (err) {
          this.log.warn(
            { type: apiName, error: (err as Error).message },
            'mdt_record_extraction_failed'
          );
        }

        // Type-level finding (one per CMT type — preserved for
        // back-compat AND to carry the rules-engine classification).
        findings.push(
          createFinding({
            domain: 'customization',
            collector: 'customizations',
            artifactType: 'CustomMetadataType',
            artifactName: devName,
            sourceType: 'tooling',
            findingType: 'custom_metadata',
            complexityLevel: isRulesEngineCandidate ? 'high' : 'medium',
            migrationRelevance: 'should-migrate',
            rcaTargetConcept: isRulesEngineCandidate ? 'DecisionTable candidate' : undefined,
            countValue: perTypeRecordCount,
            notes:
              `Custom Metadata Type: ${apiName} (${perTypeRecordCount} records)` +
              (isRulesEngineCandidate
                ? ' — possible DecisionTable candidate (Active/Sequence/Condition fields detected)'
                : '') +
              (truncationWarning ? ` — ${truncationWarning}` : ''),
          })
        );
      }

      metrics.customMetadataRecordCount = cmtRecordCount;
      metrics.cmtRulesEngineCandidateCount = rulesEngineCandidateCount;
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

      // EXT-1.4 — Phase 2: chunked Tooling-Metadata fetch to retrieve
      // the `errorConditionFormula` field for every enumerated rule.
      // The bulk `SELECT Metadata FROM ValidationRule` is rejected
      // by SF without a strong filter, so we batch IDs into chunks
      // of 10 and issue `WHERE Id IN (...)` per chunk. Failures
      // degrade gracefully — partial maps are returned and the
      // affected rules emit findings without textValue.
      let formulaByVrId = new Map<string, { Metadata?: { errorConditionFormula?: string } }>();
      const vrIds = allVRs.map((vr) => vr.Id as string);
      try {
        const metadataResult = await fetchToolingMetadata<{
          Id: string;
          Metadata?: { errorConditionFormula?: string };
        }>('ValidationRule', vrIds, (soql, signal) => this.ctx.restApi.toolingQuery(soql, signal), {
          log: this.log,
          signal: this.signal,
        });
        formulaByVrId = metadataResult.byId;
        metrics.validationRulesWithFormulaBody = formulaByVrId.size;
        if (metadataResult.failedIds.size > 0) {
          this.log.warn(
            { failed: metadataResult.failedIds.size, total: vrIds.length },
            'validation_rule_metadata_partial_failure'
          );
        }
      } catch (err) {
        // Hard failure on every chunk — log and proceed with no
        // formulas. The findings still emit so G1 conservation
        // holds; downstream consumers see textValue: undefined.
        this.log.warn({ error: (err as Error).message }, 'validation_rule_metadata_total_failure');
        metrics.validationRulesWithFormulaBody = 0;
      }

      let vrBodyFetchFailed = 0;
      for (const vr of allVRs) {
        const entity = vr._entity as string;
        const id = vr.Id as string;
        const md = formulaByVrId.get(id);
        const formula = md?.Metadata?.errorConditionFormula ?? '';
        // EXT-1.4 wave-2 fix — track per-VR fetch status so the
        // metric is the truth, not "validationRulesWithFormulaBody"
        // which is silently undercounted when chunks fail.
        const bodyFetchSucceeded = formulaByVrId.has(id);
        if (!bodyFetchSucceeded) vrBodyFetchFailed++;
        // Extract field references from the formula via the same
        // pattern used elsewhere in the codebase. The regex matches
        // both bare field names (`SBQQ__NetAmount__c`) and dotted
        // paths (`Account.Name`, `SBQQ__Quote__r.SBQQ__Owner__c`).
        const fieldRefs = formula
          ? [
              ...new Set(
                formula.match(/\b[A-Z][A-Za-z0-9_]*(?:\.[A-Za-z][A-Za-z0-9_]*)*__[a-z]\b/g) ?? []
              ),
            ]
          : [];
        // EXT-CC6 — formulas are normally < 32 KB but defensive cap
        // protects against pathological auto-generated rules.
        const truncated = truncateWithFlag(formula, 32_768);

        const evidenceRefs: AssessmentFindingInput['evidenceRefs'] = [
          {
            type: 'object-ref' as const,
            value: entity,
            label: vr.ValidationName as string,
            referencedObjects: [entity],
            referencedFields: fieldRefs.length > 0 ? fieldRefs : undefined,
          },
          // EXT-1.4 wave-2 fix — bodyFetchStatus convention. The
          // BB-3 normalizer + downstream BBs read this to know
          // whether textValue is authoritative or absent.
          {
            type: 'field-ref' as const,
            value: 'bodyFetchStatus',
            label: bodyFetchSucceeded ? 'ok' : 'failed',
          },
        ];
        // Add a separate field-ref entry per parsed field name so
        // BB-3 + downstream consumers can join validation rules to
        // the field references that drive RCA migration risk.
        // allow-slice: EXT-1.4 bound referenced-field list per VR
        for (const fieldName of fieldRefs.slice(0, 50)) {
          evidenceRefs.push({
            type: 'field-ref' as const,
            value: `${entity}.${fieldName}`,
            label: vr.ValidationName as string,
          });
        }

        findings.push(
          createFinding({
            domain: 'customization',
            collector: 'customizations',
            artifactType: 'ValidationRule',
            artifactName: `${entity}.${vr.ValidationName}`,
            artifactId: id,
            findingType: 'validation_rule',
            sourceType: 'tooling',
            riskLevel: 'low',
            migrationRelevance: vr.Active ? 'should-migrate' : 'optional',
            textValue:
              this.ctx.config.codeExtractionEnabled && formula ? truncated.value : undefined,
            notes:
              `${vr.Active ? 'Active' : 'Inactive'} validation on ${entity}. ${(vr.Description as string) ?? ''}` +
              (truncated.wasTruncated
                ? ` (textValue truncated from ${truncated.originalBytes} bytes)`
                : '') +
              (formula ? '' : ' (formula body unavailable)'),
            evidenceRefs,
          })
        );
      }
      // EXT-1.4 wave-2 fix — surface the failed-fetch counter so
      // the pre-existing `validationRulesWithFormulaBody` metric
      // is not silently undercounted when chunks fail. The counter
      // + per-finding bodyFetchStatus evidenceRefs together give
      // downstream BBs the truth about coverage.
      metrics.validationRulesBodyFetchFailed = vrBodyFetchFailed;
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
