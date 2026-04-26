/**
 * Transactional objects collector — metadata for 8 quote-to-cash objects.
 *
 * V11 Scope Expansion: collects per-object metadata that the SI expert
 * requested for Section 6.8 (Transactional Object Assessment) and
 * Section 6.9 (Additional CPQ Functionality).
 *
 * Per-object metadata collected:
 * - Page Layouts (via Tooling API)
 * - Buttons / Links / Actions (WebLink + QuickAction via Tooling API)
 * - Field Sets (from Describe cache)
 * - Record Types (from Describe cache — active only)
 * - Validation Rules (from Describe cache or Tooling API)
 * - Custom Fields with managed/org-owned split (from Describe cache)
 *
 * Tier 1 — failure → completed_warnings.
 */

import { BaseCollector, type CollectorContext, type CollectorResult } from './base.ts';
import type { CollectorDefinition } from './registry.ts';
import type { AssessmentFindingInput } from '@revbrain/contract';
import { createFinding } from '../normalize/findings.ts';
import type { DescribeResult } from '../salesforce/rest.ts';

/** The 8 transactional objects in quote-to-cash order (per V11 3A-1) */
const TARGET_OBJECTS = [
  { label: 'Opportunity', apiName: 'Opportunity' },
  { label: 'Opportunity Product', apiName: 'OpportunityLineItem' },
  { label: 'Quote', apiName: 'SBQQ__Quote__c' },
  { label: 'Quote Line', apiName: 'SBQQ__QuoteLine__c' },
  { label: 'Order', apiName: 'Order' },
  { label: 'Order Product', apiName: 'OrderItem' },
  { label: 'Contract', apiName: 'Contract' },
  { label: 'Subscription', apiName: 'SBQQ__Subscription__c' },
] as const;

/** Known CPQ Special Fields on Quote that manipulate OOB pricing */
const QUOTE_SPECIAL_FIELDS = [
  'SBQQ__AdditionalDiscountAmount__c',
  'SBQQ__DistributorDiscount__c',
  'SBQQ__PartnerDiscount__c',
  'SBQQ__CustomerDiscount__c',
  'SBQQ__CustomerAmount__c',
  'SBQQ__MarkupRate__c',
] as const;

/** Known CPQ Special Fields on Quote Line that manipulate OOB pricing */
const QUOTE_LINE_SPECIAL_FIELDS = [
  'SBQQ__AdditionalDiscount__c',
  'SBQQ__AdditionalDiscountAmount__c',
  'SBQQ__DistributorDiscount__c',
  'SBQQ__PartnerDiscount__c',
  'SBQQ__CustomerPrice__c',
  'SBQQ__MarkupRate__c',
  'SBQQ__MarkupAmount__c',
  'SBQQ__SpecialPrice__c',
  'SBQQ__SpecialPriceType__c',
  'SBQQ__UpliftAmount__c',
  'SBQQ__Uplift__c',
] as const;

export class TransactionalObjectsCollector extends BaseCollector {
  constructor(ctx: CollectorContext) {
    const definition: CollectorDefinition = {
      name: 'transactional-objects',
      tier: 'tier1',
      timeoutMs: 15 * 60_000,
      requires: ['discovery'],
      domain: 'transactional-objects',
    };
    super(definition, ctx);
  }

  protected async execute(): Promise<CollectorResult> {
    const findings: AssessmentFindingInput[] = [];
    const metrics: Record<string, number | string | boolean> = {};
    const warnings: string[] = [];

    // ================================================================
    // Phase 1: Per-object metadata from Describe cache
    // ================================================================
    for (const obj of TARGET_OBJECTS) {
      this.ctx.progress.updateSubstep('transactional-objects', `describe:${obj.apiName}`);
      const describe = this.ctx.describeCache.get(obj.apiName) as DescribeResult | undefined;

      if (!describe) {
        // Object not in describe cache — may not exist in this org
        findings.push(
          createFinding({
            domain: 'transactional-objects',
            collector: 'transactional-objects',
            artifactType: 'TransactionalObjectMeta',
            artifactName: obj.label,
            sourceType: 'inferred',
            metricName: 'object_meta',
            scope: obj.apiName,
            detected: false,
            notes: `Object ${obj.apiName} not found in describe cache — may not exist in org`,
            evidenceRefs: [{ type: 'object-ref', value: obj.apiName, label: 'API Name' }],
          })
        );
        continue;
      }

      // --- Field Sets (from Describe) ---
      const fieldSetCount = describe.fieldSets?.length ?? 0;

      // --- Record Types (active only, excluding Master) ---
      const activeRecordTypes =
        describe.recordTypeInfos?.filter((rt) => rt.active && rt.name !== 'Master').length ?? 0;

      // --- Custom Fields with managed/org-owned split ---
      const customFields = describe.fields.filter((f) => f.custom);
      const managedFields = customFields.filter((f) => {
        // Managed-package fields have a namespace prefix: namespace__FieldName__c
        // Org-owned custom fields have no namespace: FieldName__c
        const parts = f.name.split('__');
        return parts.length === 3; // namespace__field__c
      });
      const orgOwnedFields = customFields.filter((f) => {
        const parts = f.name.split('__');
        return parts.length === 2; // field__c
      });

      // --- Build notes ---
      const notes: string[] = [];
      if (customFields.length > 0) {
        notes.push(
          `${customFields.length} total (${managedFields.length} managed / ${orgOwnedFields.length} org-owned)`
        );
      }
      if (managedFields.length > 0 && managedFields.length / customFields.length > 0.3) {
        notes.push('Managed-heavy (>30%)');
      }

      findings.push(
        createFinding({
          domain: 'transactional-objects',
          collector: 'transactional-objects',
          artifactType: 'TransactionalObjectMeta',
          artifactName: obj.label,
          sourceType: 'object',
          metricName: 'object_meta',
          scope: obj.apiName,
          detected: true,
          evidenceRefs: [
            { type: 'object-ref', value: obj.apiName, label: 'API Name' },
            { type: 'count', value: String(fieldSetCount), label: 'Field Sets' },
            { type: 'count', value: String(activeRecordTypes), label: 'Active Record Types' },
            { type: 'count', value: String(customFields.length), label: 'Custom Fields Total' },
            { type: 'count', value: String(managedFields.length), label: 'Custom Fields Managed' },
            {
              type: 'count',
              value: String(orgOwnedFields.length),
              label: 'Custom Fields Org-Owned',
            },
          ],
          notes: notes.join('; ') || undefined,
        })
      );

      metrics[`${obj.apiName}_fieldSets`] = fieldSetCount;
      metrics[`${obj.apiName}_activeRecordTypes`] = activeRecordTypes;
      metrics[`${obj.apiName}_customFieldsTotal`] = customFields.length;
      metrics[`${obj.apiName}_customFieldsManaged`] = managedFields.length;
      metrics[`${obj.apiName}_customFieldsOrg`] = orgOwnedFields.length;
    }

    if (await this.checkCancellation()) return this.emptyResult('success');

    // ================================================================
    // Phase 2: Tooling API metadata (Page Layouts, WebLinks, QuickActions, Validation Rules)
    // ================================================================
    for (const obj of TARGET_OBJECTS) {
      this.ctx.progress.updateSubstep('transactional-objects', `tooling:${obj.apiName}`);
      const describe = this.ctx.describeCache.get(obj.apiName) as DescribeResult | undefined;
      if (!describe) continue;

      // --- Page Layouts via Tooling API ---
      let pageLayoutCount: number | null = null;
      try {
        const layoutResult = await this.ctx.restApi.toolingQuery<{ Id: string; Name: string }>(
          `SELECT Id, Name FROM Layout WHERE TableEnumOrId = '${obj.apiName}'`,
          this.signal
        );
        pageLayoutCount = layoutResult.totalSize;
      } catch (err) {
        this.log.warn(
          { error: (err as Error).message, object: obj.apiName },
          'page_layout_query_failed'
        );
        warnings.push(`Page layout query failed for ${obj.apiName}`);
      }

      // --- Custom Buttons/Links (WebLink) via Tooling API ---
      let webLinkCount: number | null = null;
      try {
        const wlResult = await this.ctx.restApi.toolingQuery<{ Id: string; Name: string }>(
          `SELECT Id, Name FROM WebLink WHERE PageOrSObjectType = '${obj.apiName}'`,
          this.signal
        );
        webLinkCount = wlResult.totalSize;
      } catch (err) {
        this.log.warn(
          { error: (err as Error).message, object: obj.apiName },
          'weblink_query_failed'
        );
        warnings.push(`WebLink query failed for ${obj.apiName}`);
      }

      // --- Quick Actions via Tooling API ---
      let quickActionCount: number | null = null;
      try {
        const qaResult = await this.ctx.restApi.toolingQuery<{ Id: string; DeveloperName: string }>(
          `SELECT Id, DeveloperName FROM QuickActionDefinition WHERE SobjectType = '${obj.apiName}'`,
          this.signal
        );
        quickActionCount = qaResult.totalSize;
      } catch (err) {
        this.log.warn(
          { error: (err as Error).message, object: obj.apiName },
          'quick_action_query_failed'
        );
        warnings.push(`QuickAction query failed for ${obj.apiName}`);
      }

      // --- Validation Rules via Tooling API ---
      let activeValidationRules: number | null = null;
      try {
        const vrResult = await this.ctx.restApi.toolingQuery<{ Id: string }>(
          `SELECT Id FROM ValidationRule WHERE EntityDefinition.QualifiedApiName = '${obj.apiName}' AND Active = true`,
          this.signal
        );
        activeValidationRules = vrResult.totalSize;
      } catch (err) {
        this.log.warn(
          { error: (err as Error).message, object: obj.apiName },
          'validation_rule_query_failed'
        );
        warnings.push(`ValidationRule query failed for ${obj.apiName}`);
      }

      const buttonsLinksTotal = (webLinkCount ?? 0) + (quickActionCount ?? 0);
      const buttonsLinks =
        webLinkCount != null || quickActionCount != null ? buttonsLinksTotal : null;

      // Build layout complexity notes
      const layoutNotes: string[] = [];
      if (pageLayoutCount != null && pageLayoutCount > 5) {
        layoutNotes.push(`Page Layouts > 5 (${pageLayoutCount}) — adds complexity`);
      }

      findings.push(
        createFinding({
          domain: 'transactional-objects',
          collector: 'transactional-objects',
          artifactType: 'TransactionalObjectTooling',
          artifactName: obj.label,
          sourceType: 'tooling',
          metricName: 'object_tooling',
          scope: obj.apiName,
          detected: true,
          evidenceRefs: [
            { type: 'object-ref', value: obj.apiName, label: 'API Name' },
            { type: 'count', value: String(pageLayoutCount ?? -1), label: 'Page Layouts' },
            { type: 'count', value: String(buttonsLinks ?? -1), label: 'Buttons/Links/Actions' },
            { type: 'count', value: String(webLinkCount ?? -1), label: 'WebLinks' },
            { type: 'count', value: String(quickActionCount ?? -1), label: 'QuickActions' },
            {
              type: 'count',
              value: String(activeValidationRules ?? -1),
              label: 'Active Validation Rules',
            },
          ],
          notes: layoutNotes.join('; ') || undefined,
        })
      );

      metrics[`${obj.apiName}_pageLayouts`] = pageLayoutCount ?? -1;
      metrics[`${obj.apiName}_buttonsLinks`] = buttonsLinks ?? -1;
      metrics[`${obj.apiName}_activeValidationRules`] = activeValidationRules ?? -1;
    }

    if (await this.checkCancellation()) return this.emptyResult('success');

    // ================================================================
    // Phase 3: Special Fields population scan (Quote + QuoteLine)
    // ================================================================
    this.ctx.progress.updateSubstep('transactional-objects', 'special-fields');
    await this.extractSpecialFields(findings, metrics, warnings);

    if (await this.checkCancellation()) return this.emptyResult('success');

    // ================================================================
    // Phase 4: Twin Field detection (convention-based)
    // ================================================================
    this.ctx.progress.updateSubstep('transactional-objects', 'twin-fields');
    this.detectTwinFields(findings, metrics);

    this.log.info({ metrics }, 'transactional_objects_complete');

    return {
      findings,
      relationships: [],
      metrics: {
        collectorName: 'transactional-objects',
        domain: 'transactional-objects',
        metrics,
        warnings,
        coverage: 100,
        schemaVersion: '1.0',
      },
      status: 'success',
    };
  }

  /**
   * Scan Special Fields on Quote and Quote Line for population rates.
   * V11 3A-4 (6.8.3.5) + 3B-2 (6.9.2).
   */
  private async extractSpecialFields(
    findings: AssessmentFindingInput[],
    metrics: Record<string, number | string | boolean>,
    warnings: string[]
  ): Promise<void> {
    const quoteDescribe = this.ctx.describeCache.get('SBQQ__Quote__c') as
      | DescribeResult
      | undefined;
    const qlDescribe = this.ctx.describeCache.get('SBQQ__QuoteLine__c') as
      | DescribeResult
      | undefined;

    // Quote-level Special Fields
    if (quoteDescribe) {
      const quoteFieldNames = new Set(quoteDescribe.fields.map((f) => f.name));
      for (const sf of QUOTE_SPECIAL_FIELDS) {
        if (!quoteFieldNames.has(sf)) continue;
        try {
          const result = await this.ctx.restApi.query<Record<string, unknown>>(
            `SELECT COUNT() FROM SBQQ__Quote__c WHERE ${sf} != null`,
            this.signal
          );
          findings.push(
            createFinding({
              domain: 'transactional-objects',
              collector: 'transactional-objects',
              artifactType: 'SpecialFieldUsage',
              artifactName: sf,
              sourceType: 'object',
              metricName: 'special_field',
              scope: 'SBQQ__Quote__c',
              detected: result.totalSize > 0,
              countValue: result.totalSize,
              evidenceRefs: [
                { type: 'field-ref', value: sf, label: 'Special Field' },
                { type: 'object-ref', value: 'SBQQ__Quote__c', label: 'Object' },
                {
                  type: 'count',
                  value: String(result.totalSize),
                  label: 'Records with field populated',
                },
              ],
            })
          );
          metrics[`specialField_Quote_${sf}`] = result.totalSize;
        } catch (err) {
          warnings.push(`Special field scan failed: ${sf} on Quote`);
        }
      }
    }

    // Quote Line Special Fields
    if (qlDescribe) {
      const qlFieldNames = new Set(qlDescribe.fields.map((f) => f.name));
      for (const sf of QUOTE_LINE_SPECIAL_FIELDS) {
        if (!qlFieldNames.has(sf)) continue;
        try {
          const result = await this.ctx.restApi.query<Record<string, unknown>>(
            `SELECT COUNT() FROM SBQQ__QuoteLine__c WHERE ${sf} != null`,
            this.signal
          );
          findings.push(
            createFinding({
              domain: 'transactional-objects',
              collector: 'transactional-objects',
              artifactType: 'SpecialFieldUsage',
              artifactName: sf,
              sourceType: 'object',
              metricName: 'special_field',
              scope: 'SBQQ__QuoteLine__c',
              detected: result.totalSize > 0,
              countValue: result.totalSize,
              evidenceRefs: [
                { type: 'field-ref', value: sf, label: 'Special Field' },
                { type: 'object-ref', value: 'SBQQ__QuoteLine__c', label: 'Object' },
                {
                  type: 'count',
                  value: String(result.totalSize),
                  label: 'Records with field populated',
                },
              ],
            })
          );
          metrics[`specialField_QuoteLine_${sf}`] = result.totalSize;
        } catch (err) {
          warnings.push(`Special field scan failed: ${sf} on QuoteLine`);
        }
      }
    }
  }

  /**
   * Convention-based twin field detection.
   * Twin fields are custom fields with matching API names across related
   * object pairs (e.g., Quote ↔ Order, QuoteLine ↔ OrderItem).
   * V11 3B-1 (6.9.1).
   */
  private detectTwinFields(
    findings: AssessmentFindingInput[],
    metrics: Record<string, number | string | boolean>
  ): void {
    // Object pairs to scan for twin fields
    const pairs: Array<[string, string]> = [
      ['SBQQ__Quote__c', 'Opportunity'],
      ['SBQQ__Quote__c', 'Order'],
      ['SBQQ__QuoteLine__c', 'OpportunityLineItem'],
      ['SBQQ__QuoteLine__c', 'OrderItem'],
      ['Order', 'Contract'],
      ['OrderItem', 'SBQQ__Subscription__c'],
    ];

    let totalTwinFields = 0;

    for (const [objA, objB] of pairs) {
      const descA = this.ctx.describeCache.get(objA) as DescribeResult | undefined;
      const descB = this.ctx.describeCache.get(objB) as DescribeResult | undefined;
      if (!descA || !descB) continue;

      // Get org-owned custom field names (strip namespace prefix)
      const getOrgFields = (desc: DescribeResult) =>
        desc.fields.filter((f) => f.custom && f.name.split('__').length === 2).map((f) => f.name);

      const fieldsA = new Set(getOrgFields(descA));
      const fieldsB = getOrgFields(descB);

      const twins = fieldsB.filter((f) => fieldsA.has(f));

      if (twins.length > 0) {
        totalTwinFields += twins.length;
        findings.push(
          createFinding({
            domain: 'transactional-objects',
            collector: 'transactional-objects',
            artifactType: 'TwinFieldDetection',
            artifactName: `Twin Fields: ${objA} ↔ ${objB}`,
            sourceType: 'inferred',
            metricName: 'twin_fields',
            scope: `${objA}:${objB}`,
            detected: true,
            countValue: twins.length,
            evidenceRefs: [
              { type: 'object-ref', value: objA, label: 'Object A' },
              { type: 'object-ref', value: objB, label: 'Object B' },
              { type: 'count', value: String(twins.length), label: 'Twin Field Count' },
              // allow-slice: capping evidence refs to 5 twin field examples
              ...twins.slice(0, 5).map((f) => ({
                type: 'field-ref' as const,
                value: f,
                label: 'Twin Field Example',
              })),
            ],
            notes: `${twins.length} org-owned custom fields with matching API names across ${objA} and ${objB}. Detection method: API name convention matching.`,
          })
        );
      }

      metrics[`twinFields_${objA}_${objB}`] = twins.length;
    }

    metrics.totalTwinFields = totalTwinFields;
  }
}
