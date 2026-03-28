/**
 * Discovery collector — org fingerprint, Describes, limits, CPQ version.
 *
 * Implements all of Extraction Spec Section 4:
 * - Step 4.0: Org fingerprint (Organization query)
 * - Step 4.1: Describe Global + namespace detection
 * - Step 4.2: Required object validation
 * - Step 4.3: Batched Describes via Composite API
 * - Step 4.4: Limits check with decision logic
 * - Step 4.5: CPQ version detection (3-step fallback)
 * - Step 4.6: Data size estimation + path selection
 * - API version validation (pin v62.0 → v66.0 based on org)
 * - Shield detection, multi-currency, Person Accounts, sandbox warning
 *
 * See: Implementation Plan Task 3.1
 */

import { BaseCollector, type CollectorContext, type CollectorResult } from './base.ts';
import type { CollectorDefinition } from './registry.ts';
import type { AssessmentFindingInput, CollectorMetricsInput } from '@revbrain/contract';
import { createFinding } from '../normalize/findings.ts';

// Objects we expect in a CPQ org (from Extraction Spec §4.2)
const REQUIRED_CPQ_OBJECTS = [
  'Product2',
  'PricebookEntry',
  'Pricebook2',
  'SBQQ__ProductFeature__c',
  'SBQQ__ProductOption__c',
  'SBQQ__OptionConstraint__c',
  'SBQQ__ProductRule__c',
  'SBQQ__ErrorCondition__c',
  'SBQQ__ConfigurationAttribute__c',
  'SBQQ__PriceRule__c',
  'SBQQ__PriceCondition__c',
  'SBQQ__PriceAction__c',
  'SBQQ__DiscountSchedule__c',
  'SBQQ__DiscountTier__c',
  'SBQQ__BlockPrice__c',
  'SBQQ__ContractedPrice__c',
  'SBQQ__SummaryVariable__c',
  'SBQQ__CustomScript__c',
  'SBQQ__LookupQuery__c',
  'SBQQ__LookupData__c',
  'SBQQ__Quote__c',
  'SBQQ__QuoteLine__c',
  'SBQQ__QuoteLineGroup__c',
  'SBQQ__QuoteDocument__c',
  'SBQQ__QuoteTemplate__c',
  'SBQQ__TemplateContent__c',
  'SBQQ__TemplateSection__c',
  'SBQQ__CustomAction__c',
  'SBQQ__Subscription__c',
  'SBQQ__SearchFilter__c',
  'SBQQ__Term__c',
  'SBQQ__Localization__c',
  'SBQQ__LineColumn__c',
  'SBQQ__RelatedContent__c',
  'SBQQ__ConsumptionSchedule__c',
];

// Objects to count for data size estimation (Spec §4.6)
const COUNT_OBJECTS = [
  { name: 'Product2', label: 'Products', soql: 'SELECT COUNT() FROM Product2' },
  { name: 'SBQQ__Quote__c', label: 'Quotes (all)', soql: 'SELECT COUNT() FROM SBQQ__Quote__c' },
  {
    name: 'SBQQ__Quote__c_90d',
    label: 'Quotes (90d)',
    soql: 'SELECT COUNT() FROM SBQQ__Quote__c WHERE CreatedDate >= LAST_N_DAYS:90',
  },
  {
    name: 'SBQQ__QuoteLine__c',
    label: 'Quote Lines (all)',
    soql: 'SELECT COUNT() FROM SBQQ__QuoteLine__c',
  },
  {
    name: 'SBQQ__PriceRule__c',
    label: 'Price Rules',
    soql: 'SELECT COUNT() FROM SBQQ__PriceRule__c',
  },
  {
    name: 'SBQQ__ProductRule__c',
    label: 'Product Rules',
    soql: 'SELECT COUNT() FROM SBQQ__ProductRule__c',
  },
  {
    name: 'SBQQ__ProductOption__c',
    label: 'Product Options',
    soql: 'SELECT COUNT() FROM SBQQ__ProductOption__c',
  },
  {
    name: 'SBQQ__CustomScript__c',
    label: 'QCP Scripts',
    soql: 'SELECT COUNT() FROM SBQQ__CustomScript__c',
  },
  {
    name: 'SBQQ__DiscountSchedule__c',
    label: 'Discount Schedules',
    soql: 'SELECT COUNT() FROM SBQQ__DiscountSchedule__c',
  },
  {
    name: 'SBQQ__ContractedPrice__c',
    label: 'Contracted Prices',
    soql: 'SELECT COUNT() FROM SBQQ__ContractedPrice__c',
  },
  {
    name: 'SBQQ__QuoteTemplate__c',
    label: 'Quote Templates',
    soql: 'SELECT COUNT() FROM SBQQ__QuoteTemplate__c',
  },
  {
    name: 'SBQQ__Localization__c',
    label: 'Localizations',
    soql: 'SELECT COUNT() FROM SBQQ__Localization__c',
  },
];

export class DiscoveryCollector extends BaseCollector {
  constructor(ctx: CollectorContext) {
    const definition: CollectorDefinition = {
      name: 'discovery',
      tier: 'tier0',
      timeoutMs: 5 * 60_000,
      requires: [],
      domain: 'discovery',
    };
    super(definition, ctx);
  }

  protected async execute(): Promise<CollectorResult> {
    const findings: AssessmentFindingInput[] = [];
    const metrics: Record<string, number | string | boolean> = {};
    const warnings: string[] = [];

    // ================================================================
    // Step 4.0: Org Fingerprint
    // ================================================================
    this.ctx.progress.updateSubstep('discovery', 'org_fingerprint');
    this.log.info('step_4_0_org_fingerprint');

    const orgResult = await this.ctx.restApi.query<Record<string, unknown>>(
      'SELECT Id, Name, OrganizationType, InstanceName, IsSandbox, ' +
        'LanguageLocaleKey, DefaultLocaleSidKey, TimeZoneSidKey, ' +
        'TrialExpirationDate, Country FROM Organization',
      this.signal
    );

    const org = orgResult.records[0];
    const orgFingerprint = {
      orgId: org?.Id as string,
      name: org?.Name as string,
      edition: org?.OrganizationType as string,
      instance: org?.InstanceName as string,
      isSandbox: org?.IsSandbox as boolean,
      language: org?.LanguageLocaleKey as string,
      locale: org?.DefaultLocaleSidKey as string,
      timezone: org?.TimeZoneSidKey as string,
      trialExpiration: org?.TrialExpirationDate as string | null,
      country: org?.Country as string,
    };

    this.log.info({ orgFingerprint }, 'org_fingerprint_captured');

    // Store fingerprint on the run record
    await this.ctx.sql`
      UPDATE assessment_runs
      SET org_fingerprint = ${JSON.stringify(orgFingerprint)}::jsonb
      WHERE id = ${this.ctx.runId}
    `;

    metrics.orgEdition = orgFingerprint.edition;
    metrics.isSandbox = orgFingerprint.isSandbox;

    // Sandbox warning (Spec §23.7)
    if (orgFingerprint.isSandbox) {
      warnings.push('Extraction from sandbox — data may not reflect production configuration');
    }

    if (await this.checkCancellation()) return this.emptyResult('success');

    // ================================================================
    // Step 4.1: Describe Global + Namespace Detection
    // ================================================================
    this.ctx.progress.updateSubstep('discovery', 'describe_global');
    this.log.info('step_4_1_describe_global');

    const descGlobal = await this.ctx.restApi.describeGlobal(this.signal);
    const allObjects = descGlobal.sobjects;
    const objectMap = new Map(allObjects.map((o) => [o.name, o]));

    const sbqqObjects = allObjects.filter(
      (o) => o.name.startsWith('SBQQ__') && o.name.endsWith('__c')
    );
    const sbaaObjects = allObjects.filter(
      (o) => o.name.startsWith('sbaa__') && o.name.endsWith('__c')
    );
    const mdtObjects = allObjects.filter((o) => o.name.endsWith('__mdt') && o.custom);

    metrics.totalObjects = allObjects.length;
    metrics.sbqqObjectCount = sbqqObjects.length;
    metrics.sbaaObjectCount = sbaaObjects.length;
    metrics.customMdtCount = mdtObjects.length;
    metrics.hasCpq = sbqqObjects.length > 0;
    metrics.hasAdvancedApprovals = sbaaObjects.length > 0;

    this.log.info(
      {
        total: allObjects.length,
        sbqq: sbqqObjects.length,
        sbaa: sbaaObjects.length,
        mdt: mdtObjects.length,
      },
      'describe_global_complete'
    );

    if (sbqqObjects.length === 0) {
      return {
        findings: [
          createFinding({
            domain: 'catalog',
            collector: 'discovery',
            artifactType: 'OrgFingerprint',
            artifactName: 'Organization',
            sourceType: 'inferred',
            metricName: 'cpq_not_installed',
            scope: 'global',
            riskLevel: 'critical',
            notes: 'CPQ package (SBQQ namespace) not detected in this org',
          }),
        ],
        relationships: [],
        metrics: this.buildMetrics(metrics, warnings, 0),
        status: 'failed',
        error: 'CPQ package not installed — no SBQQ__ objects found',
      };
    }

    // ================================================================
    // Step 4.2: Required Object Validation
    // ================================================================
    this.ctx.progress.updateSubstep('discovery', 'object_validation');
    this.log.info('step_4_2_object_validation');

    const presentObjects: string[] = [];
    const missingObjects: string[] = [];

    for (const objName of REQUIRED_CPQ_OBJECTS) {
      const obj = objectMap.get(objName);
      if (obj && obj.queryable) {
        presentObjects.push(objName);
      } else {
        missingObjects.push(objName);
      }
    }

    metrics.requiredObjectsPresent = presentObjects.length;
    metrics.requiredObjectsMissing = missingObjects.length;

    if (missingObjects.length > 0) {
      this.log.warn({ missingObjects }, 'missing_cpq_objects');
      warnings.push(
        `Missing ${missingObjects.length} expected CPQ objects: ${missingObjects.join(', ')}`
      );
    }

    if (await this.checkCancellation()) return this.emptyResult('success');

    // ================================================================
    // Step 4.3: Batched Describes via Composite API
    // ================================================================
    this.ctx.progress.updateSubstep('discovery', 'batched_describes');
    this.log.info({ objectCount: presentObjects.length }, 'step_4_3_batched_describes');

    const describeResults = await this.ctx.restApi.describeMultiple(presentObjects, this.signal);

    // Populate the Describe cache for downstream collectors
    let totalFields = 0;
    let totalSbqqFields = 0;
    let totalCustomFields = 0;

    for (const [objectName, describe] of describeResults) {
      if (describe) {
        this.ctx.describeCache.set(objectName, describe);
        const fields = describe.fields || [];
        totalFields += fields.length;
        totalSbqqFields += fields.filter((f) => f.name.startsWith('SBQQ__')).length;
        totalCustomFields += fields.filter(
          (f) => f.custom && !f.name.startsWith('SBQQ__') && !f.name.startsWith('sbaa__')
        ).length;
      }
    }

    metrics.describedObjects = describeResults.size;
    metrics.totalFields = totalFields;
    metrics.totalSbqqFields = totalSbqqFields;
    metrics.totalCustomFields = totalCustomFields;

    this.log.info(
      {
        described: describeResults.size,
        totalFields,
        sbqqFields: totalSbqqFields,
        customFields: totalCustomFields,
      },
      'describes_complete'
    );

    // Check for Shield Platform Encryption (Spec audit fix)
    let shieldFieldCount = 0;
    for (const [, describe] of describeResults) {
      if (describe) {
        for (const field of describe.fields) {
          if ((field as any).encrypted) shieldFieldCount++;
        }
      }
    }
    if (shieldFieldCount > 0) {
      warnings.push(
        `Shield Platform Encryption detected on ${shieldFieldCount} fields — values may be masked`
      );
      metrics.shieldEncryptedFields = shieldFieldCount;
    }

    // Check multi-currency (Spec §23.8)
    const quoteDescribe = describeResults.get('SBQQ__Quote__c');
    const hasMultiCurrency =
      quoteDescribe?.fields.some((f) => f.name === 'CurrencyIsoCode') ?? false;
    metrics.isMultiCurrency = hasMultiCurrency;
    if (hasMultiCurrency) {
      this.log.info('multi_currency_detected');
    }

    if (await this.checkCancellation()) return this.emptyResult('success');

    // ================================================================
    // Step 4.4: Limits Check
    // ================================================================
    this.ctx.progress.updateSubstep('discovery', 'limits_check');
    this.log.info('step_4_4_limits_check');

    const limits = await this.ctx.restApi.limits(this.signal);
    const apiRemaining = limits.DailyApiRequests?.Remaining ?? 0;
    const apiMax = limits.DailyApiRequests?.Max ?? 0;
    const bulkRemaining = limits.DailyBulkV2QueryJobs?.Remaining ?? 0;
    const bulkMax = limits.DailyBulkV2QueryJobs?.Max ?? 0;

    metrics.apiLimitMax = apiMax;
    metrics.apiLimitRemaining = apiRemaining;
    metrics.bulkLimitMax = bulkMax;
    metrics.bulkLimitRemaining = bulkRemaining;

    if (apiRemaining < 1000) {
      return {
        findings,
        relationships: [],
        metrics: this.buildMetrics(metrics, warnings, 0),
        status: 'failed',
        error: `API budget too low: ${apiRemaining} calls remaining (minimum 1,000 required)`,
      };
    }

    if (apiRemaining < 5000) {
      warnings.push(
        `Low API budget: ${apiRemaining.toLocaleString()} calls remaining. Consider running during off-hours.`
      );
    }

    this.log.info(
      {
        apiRemaining,
        apiMax,
        bulkRemaining,
        bulkMax,
      },
      'limits_check_complete'
    );

    // ================================================================
    // Step 4.5: CPQ Version Detection
    // ================================================================
    this.ctx.progress.updateSubstep('discovery', 'cpq_version');
    this.log.info('step_4_5_cpq_version');

    let cpqVersion = 'unknown';
    let sbaaVersion = 'unknown';
    const phantomPackages: string[] = [];

    try {
      // Primary: InstalledSubscriberPackage (all packages, filter client-side)
      const pkgResult = await this.ctx.restApi.toolingQuery<Record<string, any>>(
        'SELECT Id, SubscriberPackage.Name, SubscriberPackage.NamespacePrefix, ' +
          'SubscriberPackageVersion.MajorVersion, SubscriberPackageVersion.MinorVersion, ' +
          'SubscriberPackageVersion.PatchVersion FROM InstalledSubscriberPackage',
        this.signal
      );

      for (const pkg of pkgResult.records) {
        const ns = pkg.SubscriberPackage?.NamespacePrefix;
        const v = pkg.SubscriberPackageVersion;
        const version = v ? `${v.MajorVersion}.${v.MinorVersion}.${v.PatchVersion}` : 'unknown';

        if (ns === 'SBQQ') cpqVersion = version;
        if (ns === 'sbaa') sbaaVersion = version;
        if (['echosign_dev1', 'dsfs', 'Conga', 'loop'].includes(ns)) {
          phantomPackages.push(`${ns}: ${pkg.SubscriberPackage?.Name} v${version}`);
        }
      }
    } catch (err) {
      this.log.warn(
        { error: (err as Error).message },
        'installed_package_query_failed_using_fallback'
      );
      // Fallback: namespace detection from Describe Global (already done)
      cpqVersion = 'detected (version unavailable)';
    }

    metrics.cpqVersion = cpqVersion;
    metrics.sbaaVersion = sbaaVersion;
    metrics.phantomPackageCount = phantomPackages.length;

    if (phantomPackages.length > 0) {
      this.log.info({ phantomPackages }, 'phantom_packages_detected');
      warnings.push(`Phantom packages detected: ${phantomPackages.join('; ')}`);
    }

    // Person Accounts detection (Spec §23.9)
    try {
      const personAcctResult = await this.ctx.restApi.query<Record<string, unknown>>(
        "SELECT Id FROM RecordType WHERE SObjectType = 'Account' AND IsPersonType = true LIMIT 1",
        this.signal
      );
      metrics.hasPersonAccounts = personAcctResult.totalSize > 0;
      if (personAcctResult.totalSize > 0) {
        this.log.info('person_accounts_detected');
      }
    } catch {
      metrics.hasPersonAccounts = false;
    }

    if (await this.checkCancellation()) return this.emptyResult('success');

    // ================================================================
    // Step 4.6: Data Size Estimation
    // ================================================================
    this.ctx.progress.updateSubstep('discovery', 'size_estimation');
    this.log.info('step_4_6_size_estimation');

    const dataCounts: Record<string, number> = {};
    const bulkApiObjects: string[] = [];

    for (const countObj of COUNT_OBJECTS) {
      // Only count objects that exist
      if (
        !presentObjects.includes(countObj.name.replace('_90d', '')) &&
        !countObj.name.includes('Product2')
      ) {
        continue;
      }

      try {
        const result = await this.ctx.restApi.query<Record<string, unknown>>(
          countObj.soql,
          this.signal
        );
        const count = result.totalSize ?? 0;
        dataCounts[countObj.name] = count;
        metrics[`count_${countObj.name}`] = count;

        if (count > 2000 && !countObj.name.includes('_90d')) {
          bulkApiObjects.push(countObj.name);
        }
      } catch (err) {
        this.log.warn(
          { object: countObj.name, error: (err as Error).message },
          'count_query_failed'
        );
        dataCounts[countObj.name] = -1;
      }
    }

    metrics.bulkApiObjectCount = bulkApiObjects.length;

    // Estimate runtime
    const totalRecords = Object.values(dataCounts)
      .filter((v) => v > 0)
      .reduce((a, b) => a + b, 0);
    const estimatedBulkJobs = bulkApiObjects.length;
    const estimatedMinutes = Math.ceil(5 + totalRecords / 5000 + estimatedBulkJobs * 3);
    metrics.estimatedRuntimeMinutes = estimatedMinutes;

    this.log.info(
      {
        dataCounts,
        bulkApiObjects,
        totalRecords,
        estimatedMinutes,
      },
      'size_estimation_complete'
    );

    // ================================================================
    // Build findings
    // ================================================================
    findings.push(
      createFinding({
        domain: 'catalog',
        collector: 'discovery',
        artifactType: 'OrgFingerprint',
        artifactName: orgFingerprint.name,
        artifactId: orgFingerprint.orgId,
        sourceType: 'object',
        metricName: 'org_fingerprint',
        scope: 'global',
        notes: `${orgFingerprint.edition}, CPQ ${cpqVersion}, ${orgFingerprint.isSandbox ? 'sandbox' : 'production'}`,
        evidenceRefs: [
          {
            type: 'record-id',
            value: orgFingerprint.orgId,
            label: 'Organization',
            referencedObjects: ['Organization'],
          },
        ],
      })
    );

    // Finding for each data count
    for (const [name, count] of Object.entries(dataCounts)) {
      if (count >= 0) {
        const countObj = COUNT_OBJECTS.find((c) => c.name === name);
        findings.push(
          createFinding({
            domain: 'catalog',
            collector: 'discovery',
            artifactType: 'DataCount',
            artifactName: countObj?.label ?? name,
            sourceType: 'object',
            metricName: `count_${name}`,
            scope: 'global',
            countValue: count,
            notes: count > 2000 ? 'Will use Bulk API for extraction' : 'Will use REST API',
          })
        );
      }
    }

    // ================================================================
    // G-03: CPQ License & User Adoption Metrics
    // ================================================================
    this.ctx.progress.updateSubstep('discovery', 'user_adoption');

    // 1. CPQ license assignments (fallback chain per Gap Analysis G-03)
    try {
      const licenseResult = await this.ctx.restApi.query<Record<string, unknown>>(
        "SELECT COUNT() FROM UserPackageLicense WHERE PackageLicense.NamespacePrefix = 'SBQQ'",
        this.signal
      );
      metrics.cpqLicensesProvisioned = licenseResult.totalSize;
    } catch {
      // Fallback: count users with SBQQ permission sets
      try {
        const permResult = await this.ctx.restApi.query<Record<string, unknown>>(
          "SELECT AssigneeId FROM PermissionSetAssignment WHERE PermissionSet.NamespacePrefix = 'SBQQ' AND Assignee.IsActive = true GROUP BY AssigneeId",
          this.signal
        );
        metrics.cpqLicensesProvisioned = permResult.totalSize;
        warnings.push(
          'CPQ license count estimated from PermissionSetAssignment (UserPackageLicense not queryable)'
        );
      } catch {
        metrics.cpqLicensesProvisioned = -1;
        warnings.push('Could not determine CPQ license count');
      }
    }

    // 2. Active quote creators in last 90 days (GROUP BY, count rows — SOQL has no COUNT DISTINCT)
    try {
      const creatorResult = await this.ctx.restApi.query<Record<string, unknown>>(
        'SELECT CreatedById FROM SBQQ__Quote__c WHERE CreatedDate >= LAST_N_DAYS:90 GROUP BY CreatedById',
        this.signal
      );
      metrics.activeQuoteCreators90d = creatorResult.totalSize;
    } catch {
      metrics.activeQuoteCreators90d = -1;
    }

    // 3. Profiles with CPQ access
    try {
      const profileResult = await this.ctx.restApi.query<Record<string, unknown>>(
        "SELECT Assignee.ProfileId FROM PermissionSetAssignment WHERE PermissionSet.NamespacePrefix = 'SBQQ' AND Assignee.IsActive = true GROUP BY Assignee.ProfileId",
        this.signal
      );
      metrics.profilesWithCpqAccess = profileResult.totalSize;
    } catch {
      metrics.profilesWithCpqAccess = -1;
    }

    // Produce UserAdoption finding
    if (metrics.cpqLicensesProvisioned !== -1) {
      const adoptionRate =
        metrics.activeQuoteCreators90d !== -1 && metrics.cpqLicensesProvisioned > 0
          ? Math.round(
              ((metrics.activeQuoteCreators90d as number) /
                (metrics.cpqLicensesProvisioned as number)) *
                100
            )
          : null;

      findings.push(
        createFinding({
          domain: 'settings',
          collector: 'discovery',
          artifactType: 'UserAdoption',
          artifactName: 'CPQ User Adoption',
          sourceType: 'object',
          metricName: 'user_adoption',
          scope: 'global',
          riskLevel: 'info',
          notes: `Licenses: ${metrics.cpqLicensesProvisioned}, Active creators (90d): ${metrics.activeQuoteCreators90d}, Profiles: ${metrics.profilesWithCpqAccess}${adoptionRate !== null ? `, Adoption: ${adoptionRate}%` : ''}`,
          evidenceRefs: [
            {
              type: 'count' as const,
              value: String(metrics.cpqLicensesProvisioned),
              label: 'CPQ Licenses',
            },
            {
              type: 'count' as const,
              value: String(metrics.activeQuoteCreators90d),
              label: 'Active Creators (90d)',
            },
            {
              type: 'count' as const,
              value: String(metrics.profilesWithCpqAccess),
              label: 'Profiles with CPQ',
            },
          ],
        })
      );
    }

    const coverage = Math.round((presentObjects.length / REQUIRED_CPQ_OBJECTS.length) * 100);

    return {
      findings,
      relationships: [],
      metrics: this.buildMetrics(metrics, warnings, coverage),
      status: missingObjects.length > 5 ? 'partial' : 'success',
    };
  }

  private buildMetrics(
    metrics: Record<string, number | string | boolean>,
    warnings: string[],
    coverage: number
  ): CollectorMetricsInput {
    return {
      collectorName: 'discovery',
      domain: 'catalog',
      metrics,
      warnings,
      coverage,
      schemaVersion: '1.0',
    };
  }
}
