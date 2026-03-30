/**
 * Catalog collector — Products, bundles, options, rules, attributes.
 *
 * Implements Extraction Spec Section 5 (§5.1-§5.8):
 * - Products (5.1): dynamic query, all derived metrics, PSM candidates
 * - Features (5.2): bundle feature groupings
 * - Options (5.3): child products, nested bundle detection
 * - Option Constraints (5.4)
 * - Product Rules (5.5) + Error Conditions (5.6)
 * - Configuration Attributes (5.7)
 * - Search Filters (5.8)
 *
 * Tier 0 — mandatory. Failure aborts the run.
 *
 * See: Implementation Plan Tasks 4.1a + 4.1b
 */

import { BaseCollector, type CollectorContext, type CollectorResult } from './base.ts';
import type { CollectorDefinition } from './registry.ts';
import type { AssessmentFindingInput, AssessmentRelationshipInput } from '@revbrain/contract';
import { createFinding } from '../normalize/findings.ts';
import { buildSafeQuery } from '../salesforce/query-builder.ts';
import type { DescribeResult } from '../salesforce/rest.ts';

// Product2 wishlist fields (Spec §5.1)
const PRODUCT_WISHLIST = [
  'Id',
  'Name',
  'ProductCode',
  'Family',
  'Description',
  'IsActive',
  'SBQQ__AssetAmendmentBehavior__c',
  'SBQQ__AssetConversion__c',
  'SBQQ__BatchQuantity__c',
  'SBQQ__BillingFrequency__c',
  'SBQQ__BillingType__c',
  'SBQQ__BlockPricingField__c',
  'SBQQ__ChargeType__c',
  'SBQQ__Component__c',
  'SBQQ__ConfigurationType__c',
  'SBQQ__ConfigurationEvent__c',
  'SBQQ__DefaultQuantity__c',
  'SBQQ__DiscountCategory__c',
  'SBQQ__DiscountSchedule__c',
  'SBQQ__ExternallyConfigurable__c',
  'SBQQ__GenerateContractedPrice__c',
  'SBQQ__HasConfigurationAttributes__c',
  'SBQQ__HasConsumptionSchedule__c',
  'SBQQ__Hidden__c',
  'SBQQ__NonDiscountable__c',
  'SBQQ__Optional__c',
  'SBQQ__PriceEditable__c',
  'SBQQ__PricingMethod__c',
  'SBQQ__QuantityEditable__c',
  'SBQQ__SubscriptionBase__c',
  'SBQQ__SubscriptionPricing__c',
  'SBQQ__SubscriptionTerm__c',
  'SBQQ__SubscriptionType__c',
  'SBQQ__Taxable__c',
  'CreatedDate',
  'LastModifiedDate',
];

export class CatalogCollector extends BaseCollector {
  constructor(ctx: CollectorContext) {
    const definition: CollectorDefinition = {
      name: 'catalog',
      tier: 'tier0',
      timeoutMs: 15 * 60_000,
      requires: ['discovery'],
      domain: 'catalog',
    };
    super(definition, ctx);
  }

  protected async execute(): Promise<CollectorResult> {
    const findings: AssessmentFindingInput[] = [];
    const relationships: AssessmentRelationshipInput[] = [];
    const metrics: Record<string, number | string | boolean> = {};
    const warnings: string[] = [];

    // ================================================================
    // 5.1: Products
    // ================================================================
    this.ctx.progress.updateSubstep('catalog', 'products');
    this.log.info('extracting_products');

    const productDescribe = this.ctx.describeCache.get('Product2') as DescribeResult | undefined;
    if (!productDescribe) {
      return this.failWith('Product2 Describe not in cache — Discovery must run first');
    }

    const productQuery = buildSafeQuery('Product2', PRODUCT_WISHLIST, productDescribe);
    this.log.info(
      { fields: productQuery.includedFields.length, skipped: productQuery.skippedFields.length },
      'product_query_built'
    );

    const products = await this.ctx.restApi.queryAll<Record<string, unknown>>(
      productQuery.query,
      this.signal
    );

    // Derived metrics (Spec §5.1)
    const totalProducts = products.length;
    const activeProducts = products.filter((p) => p.IsActive === true).length;
    const dormantProducts = totalProducts - activeProducts;
    const bundleProducts = products.filter(
      (p) =>
        p.SBQQ__ConfigurationType__c === 'Required' || p.SBQQ__ConfigurationType__c === 'Allowed'
    ).length;
    const subscriptionProducts = products.filter((p) => p.SBQQ__SubscriptionType__c != null).length;

    // Product family distribution
    const familyDist: Record<string, number> = {};
    for (const p of products) {
      const family = (p.Family as string) || '(none)';
      familyDist[family] = (familyDist[family] || 0) + 1;
    }

    // Charge type distribution
    const chargeTypeDist: Record<string, number> = {};
    for (const p of products) {
      const ct = (p.SBQQ__ChargeType__c as string) || '(none)';
      chargeTypeDist[ct] = (chargeTypeDist[ct] || 0) + 1;
    }

    // PSM candidates: unique combos of (SubscriptionType, ChargeType, BillingFrequency)
    const psmCombos = new Set<string>();
    for (const p of products) {
      if (p.IsActive && p.SBQQ__SubscriptionType__c) {
        psmCombos.add(
          `${p.SBQQ__SubscriptionType__c}|${p.SBQQ__ChargeType__c}|${p.SBQQ__BillingFrequency__c}`
        );
      }
    }

    metrics.totalProducts = totalProducts;
    metrics.activeProducts = activeProducts;
    metrics.dormantProducts = dormantProducts;
    metrics.bundleProducts = bundleProducts;
    metrics.subscriptionProducts = subscriptionProducts;
    metrics.productSellingModelCandidates = psmCombos.size;
    metrics.dynamicPricingCount = products.filter(
      (p) => p.SBQQ__PricingMethod__c === 'Dynamic'
    ).length;
    metrics.blockPricingCount = products.filter((p) => p.SBQQ__BlockPricingField__c != null).length;
    metrics.externallyConfigurableCount = products.filter(
      (p) => p.SBQQ__ExternallyConfigurable__c === true
    ).length;

    // Create findings per product
    for (const p of products) {
      findings.push(
        createFinding({
          domain: 'catalog',
          collector: 'catalog',
          artifactType: 'Product2',
          artifactName: p.Name as string,
          artifactId: p.Id as string,
          findingType: 'product',
          sourceType: 'object',
          complexityLevel: p.SBQQ__ConfigurationType__c ? 'medium' : 'low',
          migrationRelevance: p.IsActive ? 'must-migrate' : 'optional',
          rcaTargetConcept: 'ProductSellingModel',
          rcaMappingComplexity: p.SBQQ__ConfigurationType__c ? 'transform' : 'direct',
          usageLevel: p.IsActive ? undefined : 'dormant',
          evidenceRefs: [
            {
              type: 'record-id',
              value: p.Id as string,
              label: p.Name as string,
              referencedObjects: ['Product2'],
            },
            {
              type: 'field-ref',
              value: 'Product2.Family',
              label: (p.Family as string) ?? 'Other',
            },
            {
              type: 'field-ref',
              value: 'Product2.ProductCode',
              label: (p.ProductCode as string) ?? '',
            },
          ],
        })
      );
    }

    // Flag products with blank Family for data quality
    const blankFamilyProducts = products.filter(
      (p) => !p.Family || (p.Family as string).trim() === ''
    );
    if (blankFamilyProducts.length > 0) {
      findings.push(
        createFinding({
          domain: 'catalog',
          collector: 'catalog',
          artifactType: 'DataQualityFlag',
          artifactName: 'Products with Blank Family',
          findingType: 'blank_family_products',
          sourceType: 'object',
          riskLevel: 'low',
          complexityLevel: 'low',
          countValue: blankFamilyProducts.length,
          notes: `${blankFamilyProducts.length} products have no Product Family assigned: ${blankFamilyProducts
            .slice(0, 5)
            .map((p) => p.Name as string)
            .join(
              ', '
            )}${blankFamilyProducts.length > 5 ? '...' : ''}. Consider assigning families for better categorization.`,
        })
      );
    }

    this.log.info(
      { totalProducts, activeProducts, bundles: bundleProducts, psm: psmCombos.size },
      'products_extracted'
    );

    if (await this.checkCancellation()) return this.emptyResult('success');

    // ================================================================
    // 5.2: Features
    // ================================================================
    this.ctx.progress.updateSubstep('catalog', 'features');
    let totalFeatures = 0;
    const featureDescribe = this.ctx.describeCache.get('SBQQ__ProductFeature__c') as
      | DescribeResult
      | undefined;

    if (featureDescribe) {
      const q = buildSafeQuery(
        'SBQQ__ProductFeature__c',
        [
          'Id',
          'Name',
          'SBQQ__ConfiguredSKU__c',
          'SBQQ__Category__c',
          'SBQQ__MinOptionCount__c',
          'SBQQ__MaxOptionCount__c',
          'SBQQ__Number__c',
        ],
        featureDescribe,
        { orderBy: 'SBQQ__ConfiguredSKU__c, SBQQ__Number__c' }
      );
      const features = await this.ctx.restApi.queryAll<Record<string, unknown>>(
        q.query,
        this.signal
      );
      totalFeatures = features.length;
      metrics.totalFeatures = totalFeatures;
    }

    // ================================================================
    // 5.3: Options + nested bundle detection
    // ================================================================
    this.ctx.progress.updateSubstep('catalog', 'options');
    let totalOptions = 0;
    let maxBundleDepth = 0;
    const optionDescribe = this.ctx.describeCache.get('SBQQ__ProductOption__c') as
      | DescribeResult
      | undefined;

    if (optionDescribe) {
      const q = buildSafeQuery(
        'SBQQ__ProductOption__c',
        [
          'Id',
          'Name',
          'SBQQ__ConfiguredSKU__c',
          'SBQQ__OptionalSKU__c',
          'SBQQ__Feature__c',
          'SBQQ__Number__c',
          'SBQQ__Quantity__c',
          'SBQQ__Required__c',
          'SBQQ__Selected__c',
          'SBQQ__Type__c',
          'SBQQ__Bundled__c',
          'SBQQ__DiscountedByPackage__c',
        ],
        optionDescribe,
        { orderBy: 'SBQQ__ConfiguredSKU__c, SBQQ__Number__c' }
      );
      const options = await this.ctx.restApi.queryAll<Record<string, unknown>>(
        q.query,
        this.signal
      );
      totalOptions = options.length;

      // Nested bundle detection
      const bundleIds = new Set(
        products
          .filter(
            (p) =>
              p.SBQQ__ConfigurationType__c === 'Required' ||
              p.SBQQ__ConfigurationType__c === 'Allowed'
          )
          .map((p) => p.Id as string)
      );

      const nestedOptions = options.filter((o) => bundleIds.has(o.SBQQ__OptionalSKU__c as string));
      if (nestedOptions.length > 0) {
        const childBundles = new Set(nestedOptions.map((o) => o.SBQQ__OptionalSKU__c as string));
        const grandchild = options.filter(
          (o) =>
            childBundles.has(o.SBQQ__ConfiguredSKU__c as string) &&
            bundleIds.has(o.SBQQ__OptionalSKU__c as string)
        );
        maxBundleDepth = grandchild.length > 0 ? 3 : 2;
      } else if (bundleProducts > 0) {
        maxBundleDepth = 1;
      }

      metrics.totalOptions = totalOptions;
      metrics.maxBundleDepth = maxBundleDepth;
      metrics.nestedBundleCount = nestedOptions.length;
      metrics.requiredOptions = options.filter((o) => o.SBQQ__Required__c === true).length;

      // G-07: Store parent→option map for post-processing attachment rate computation
      // Key: parentProductId, Value: array of option product IDs
      const optionMapData: Record<string, string[]> = {};
      for (const o of options) {
        const parent = o.SBQQ__ConfiguredSKU__c as string;
        const option = o.SBQQ__OptionalSKU__c as string;
        if (parent && option) {
          if (!optionMapData[parent]) optionMapData[parent] = [];
          optionMapData[parent].push(option);
        }
      }
      metrics.optionMap = JSON.stringify(optionMapData);

      if (maxBundleDepth >= 3) {
        warnings.push('Bundle nesting depth ≥ 3 — complex migration to RCA Product Compositions');
      }
    }

    if (await this.checkCancellation()) return this.emptyResult('success');

    // ================================================================
    // 5.5: Product Rules
    // ================================================================
    this.ctx.progress.updateSubstep('catalog', 'rules');
    const ruleDescribe = this.ctx.describeCache.get('SBQQ__ProductRule__c') as
      | DescribeResult
      | undefined;

    if (ruleDescribe) {
      const q = buildSafeQuery(
        'SBQQ__ProductRule__c',
        [
          'Id',
          'Name',
          'SBQQ__Active__c',
          'SBQQ__Type__c',
          'SBQQ__Scope__c',
          'SBQQ__EvaluationEvent__c',
          'SBQQ__ConditionsMet__c',
          'SBQQ__ErrorMessage__c',
          'SBQQ__Product__c',
          'SBQQ__LookupObject__c',
        ],
        ruleDescribe
      );
      const rules = await this.ctx.restApi.queryAll<Record<string, unknown>>(q.query, this.signal);

      const ruleTypeDist: Record<string, number> = {};
      for (const r of rules) {
        const t = (r.SBQQ__Type__c as string) || '(none)';
        ruleTypeDist[t] = (ruleTypeDist[t] || 0) + 1;
      }

      metrics.totalProductRules = rules.length;
      metrics.activeProductRules = rules.filter((r) => r.SBQQ__Active__c === true).length;
      metrics.validationRules = ruleTypeDist['Validation'] || 0;
      metrics.selectionRules = ruleTypeDist['Selection'] || 0;
      metrics.filterRules = ruleTypeDist['Filter'] || 0;

      for (const r of rules) {
        const ruleType = (r.SBQQ__Type__c as string) || 'Unknown';
        const isActive = r.SBQQ__Active__c === true;
        findings.push(
          createFinding({
            domain: 'catalog',
            collector: 'catalog',
            artifactType: 'SBQQ__ProductRule__c',
            artifactName: r.Name as string,
            artifactId: r.Id as string,
            findingType: 'product_rule',
            sourceType: 'object',
            riskLevel: ruleType === 'Filter' ? 'high' : 'medium',
            migrationRelevance: isActive ? 'must-migrate' : 'optional',
            rcaTargetConcept: ruleType === 'Filter' ? 'QualificationRuleProcedure' : 'CML',
            rcaMappingComplexity: ruleType === 'Filter' ? 'redesign' : 'transform',
            usageLevel: isActive ? undefined : 'dormant',
            notes: isActive ? undefined : 'Inactive',
            evidenceRefs: [
              { type: 'field-ref', value: ruleType, label: 'Type' },
              { type: 'field-ref', value: String(isActive), label: 'Active' },
            ],
          })
        );
      }
    }

    // ================================================================
    // 5.7: Configuration Attributes
    // ================================================================
    this.ctx.progress.updateSubstep('catalog', 'attributes');
    const attrDescribe = this.ctx.describeCache.get('SBQQ__ConfigurationAttribute__c') as
      | DescribeResult
      | undefined;

    if (attrDescribe) {
      const q = buildSafeQuery(
        'SBQQ__ConfigurationAttribute__c',
        [
          'Id',
          'Name',
          'SBQQ__Product__c',
          'SBQQ__Feature__c',
          'SBQQ__TargetField__c',
          'SBQQ__Required__c',
          'SBQQ__Hidden__c',
        ],
        attrDescribe
      );
      const attrs = await this.ctx.restApi.queryAll<Record<string, unknown>>(q.query, this.signal);

      const attrsPerProduct: Record<string, number> = {};
      for (const a of attrs) {
        const pid = a.SBQQ__Product__c as string;
        attrsPerProduct[pid] = (attrsPerProduct[pid] || 0) + 1;
      }
      const productsOverThreshold = Object.values(attrsPerProduct).filter((c) => c > 10).length;

      metrics.totalConfigAttributes = attrs.length;
      metrics.maxAttributesPerProduct = Math.max(0, ...Object.values(attrsPerProduct));
      metrics.productsNeedingAttributeSets = productsOverThreshold;

      if (productsOverThreshold > 0) {
        warnings.push(
          `${productsOverThreshold} products have >10 config attributes — need RCA Attribute Sets`
        );
      }
    }

    const coverage = Math.round(
      (((totalProducts > 0 ? 1 : 0) + (totalOptions > 0 ? 1 : 0)) / 2) * 100
    );

    this.log.info(
      {
        products: totalProducts,
        features: totalFeatures,
        options: totalOptions,
        bundleDepth: maxBundleDepth,
        findings: findings.length,
      },
      'catalog_complete'
    );

    return {
      findings,
      relationships,
      metrics: {
        collectorName: 'catalog',
        domain: 'catalog',
        metrics,
        warnings,
        coverage,
        schemaVersion: '1.0',
      },
      status: 'success',
    };
  }

  private failWith(error: string): CollectorResult {
    return {
      findings: [],
      relationships: [],
      metrics: {
        collectorName: 'catalog',
        domain: 'catalog',
        metrics: {},
        warnings: [error],
        coverage: 0,
        schemaVersion: '1.0',
      },
      status: 'failed',
      error,
    };
  }
}
