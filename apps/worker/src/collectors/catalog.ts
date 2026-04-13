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

    // C3: Check if IsActive was dropped by FLS
    const isActiveAccessible = productQuery.includedFields.includes('IsActive');
    if (!isActiveAccessible) {
      warnings.push(
        'Product2.IsActive field not accessible (FLS restriction) — active product counts will be inferred, not authoritative'
      );
      this.log.warn('product2_isactive_not_accessible_fls');
    }

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
    metrics.isActiveAccessible = isActiveAccessible;

    // Create findings per product
    for (const p of products) {
      // C3: Build evidenceRefs with IsActive field when accessible
      const productEvidenceRefs: Array<{
        type: 'record-id' | 'field-ref';
        value: string;
        label: string;
        referencedObjects?: string[];
      }> = [
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
      ];

      // C3: Add IsActive evidenceRef for canonical active product count
      if (isActiveAccessible) {
        productEvidenceRefs.push({
          type: 'field-ref',
          label: 'IsActive',
          value: String(p.IsActive ?? false),
        });
      }

      findings.push(
        createFinding({
          domain: 'catalog',
          collector: 'catalog',
          artifactType: 'Product2',
          artifactName: p.Name as string,
          artifactId: p.Id as string,
          findingType: 'product',
          sourceType: 'object',
          complexityLevel:
            p.SBQQ__ConfigurationType__c === 'Required' ||
            p.SBQQ__ConfigurationType__c === 'Allowed'
              ? 'medium'
              : 'low',
          migrationRelevance: p.IsActive ? 'must-migrate' : 'optional',
          rcaTargetConcept: 'ProductSellingModel',
          rcaMappingComplexity:
            p.SBQQ__ConfigurationType__c === 'Required' ||
            p.SBQQ__ConfigurationType__c === 'Allowed'
              ? 'transform'
              : 'direct',
          usageLevel: p.IsActive ? undefined : 'dormant',
          evidenceRefs: productEvidenceRefs,
        })
      );

      // BundleStructure emission moved below (after options + features
      // are queried). See the "Emit BundleStructure for every product
      // that is a parent of at least one option/feature" block — this
      // is a more robust definition than `ConfigurationType in
      // {Required, Allowed}`, which misses bundles that have their
      // children populated but don't set ConfigurationType (discovered
      // 2026-04-12 via the orphan quarantine entries on real staging).
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
            .slice(0, 5) // allow-slice: top-N name sample for notes
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
    // 5.1a: Per-field population rate (C-02)
    // Row-scan approach — single query already loaded in `products` array
    // ================================================================
    this.ctx.progress.updateSubstep('catalog', 'field-utilization');
    if (activeProducts > 0) {
      const activeProductRows = products.filter((p) => p.IsActive === true);
      const fieldsToScan = PRODUCT_WISHLIST.filter(
        (f) =>
          f !== 'Id' &&
          f !== 'Name' &&
          f !== 'IsActive' &&
          f !== 'CreatedDate' &&
          f !== 'LastModifiedDate'
      );

      // Type-aware population check
      const isFieldPopulated = (value: unknown): boolean => {
        if (value === null || value === undefined) return false;
        if (typeof value === 'string') {
          const trimmed = value.trim();
          return trimmed !== '' && trimmed !== '--None--';
        }
        if (typeof value === 'boolean') return true;
        if (typeof value === 'number') return true;
        return true;
      };

      let fieldsScanned = 0;
      let fieldsBlocked = 0;

      for (const field of fieldsToScan) {
        // Check if field was accessible (present in query results)
        const firstRow = activeProductRows[0];
        if (!firstRow || !(field in firstRow)) {
          // FLS-blocked or not in query results
          fieldsBlocked++;
          findings.push(
            createFinding({
              domain: 'catalog',
              collector: 'catalog',
              artifactType: 'ProductFieldUtilization',
              artifactName: field,
              sourceType: 'object',
              textValue: field,
              notes: 'Field not accessible (FLS)',
              evidenceRefs: [
                { type: 'count', value: String(activeProducts), label: 'TotalActive' },
              ],
            })
          );
          continue;
        }

        fieldsScanned++;
        const populatedCount = activeProductRows.filter((row) =>
          isFieldPopulated(row[field])
        ).length;

        // For picklist fields, capture top 5 value distribution
        let topValues = '';
        if (typeof activeProductRows[0]?.[field] === 'string') {
          const valueCounts: Record<string, number> = {};
          for (const row of activeProductRows) {
            const v = String(row[field] ?? '').trim();
            if (v && v !== '--None--') {
              valueCounts[v] = (valueCounts[v] ?? 0) + 1;
            }
          }
          const sorted = Object.entries(valueCounts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5); // allow-slice: top-5 values for notes summary
          if (sorted.length > 0) {
            topValues = ` Top values: ${sorted.map(([v, c]) => `${v} (${c})`).join(', ')}`;
          }
        }

        findings.push(
          createFinding({
            domain: 'catalog',
            collector: 'catalog',
            artifactType: 'ProductFieldUtilization',
            artifactName: field,
            sourceType: 'object',
            countValue: populatedCount,
            textValue: field,
            notes: `${populatedCount} of ${activeProducts} active products have ${field} populated (${Math.round((populatedCount / activeProducts) * 100)}%).${topValues}`,
            evidenceRefs: [{ type: 'count', value: String(activeProducts), label: 'TotalActive' }],
          })
        );
      }

      this.log.info({ fieldsScanned, fieldsBlocked, activeProducts }, 'field_utilization_computed');
      metrics.fieldUtilizationFieldsScanned = fieldsScanned;
      metrics.fieldUtilizationFieldsBlocked = fieldsBlocked;
    }

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

      // Emit a DataCount so the assembler's 6.6.1 table can use a real denominator.
      // Without this, assembleBundlesDeepDive was counting `ProductFeature` findings
      // (which is 0, since we don't emit a per-feature finding) and producing a
      // Features/Feature Orphans inconsistency (e.g. Features=0 but Orphans=39).
      if (totalFeatures > 0) {
        // Count distinct bundle-capable parents that have features
        const configuredSkusWithFeatures = new Set(
          features.map((f) => String(f.SBQQ__ConfiguredSKU__c ?? ''))
        );
        configuredSkusWithFeatures.delete('');
        findings.push(
          createFinding({
            domain: 'catalog',
            collector: 'catalog',
            artifactType: 'DataCount',
            artifactName: 'Features',
            sourceType: 'object',
            countValue: totalFeatures,
            notes: `${totalFeatures} SBQQ__ProductFeature__c records across ${configuredSkusWithFeatures.size} bundle-capable product(s)`,
            evidenceRefs: [
              {
                type: 'count',
                value: String(configuredSkusWithFeatures.size),
                label: 'ProductsWithFeatures',
              },
            ],
          })
        );
      }

      // Phase 4.1 — emit one finding per feature so BB-3 produces
      // BundleFeature nodes and Stage 4 parent-lookup can wire them
      // under BundleStructure.features. The normalizer reads the
      // parent's productCode from the `object-ref` evidenceRef, so
      // we translate SBQQ__ConfiguredSKU__c (a Product2 Id) to its
      // ProductCode via the products map. Features whose parent is
      // not in the catalog (managed package, deleted) are skipped.
      const productByIdForFeatures = new Map<string, Record<string, unknown>>();
      for (const p of products) {
        // allow-slice: normalize 18-char SF id to 15-char case-sensitive form
        productByIdForFeatures.set((p.Id as string).slice(0, 15), p);
      }
      for (const f of features) {
        // allow-slice: normalize 18-char SF id to 15-char case-sensitive form
        const parentId15 = String(f.SBQQ__ConfiguredSKU__c ?? '').slice(0, 15);
        const parentProduct = productByIdForFeatures.get(parentId15);
        if (!parentProduct) continue;
        const parentProductCode =
          (parentProduct.ProductCode as string | null) ?? (parentProduct.Id as string);
        const featureNumber = (f.SBQQ__Number__c as number | null) ?? 0;
        findings.push(
          createFinding({
            domain: 'catalog',
            collector: 'catalog',
            artifactType: 'SBQQ__ProductFeature__c',
            artifactName: (f.Name as string) ?? `Feature ${featureNumber}`,
            artifactId: f.Id as string,
            findingType: 'bundle_feature',
            sourceType: 'object',
            migrationRelevance: 'must-migrate',
            countValue: featureNumber,
            notes: (f.SBQQ__Category__c as string | null) ?? undefined,
            evidenceRefs: [{ type: 'object-ref', value: parentProductCode }],
          })
        );
      }
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

      // Normalize Salesforce IDs to 15-char for consistent comparison
      // SF IDs come as 15-char (case-sensitive) or 18-char (with checksum suffix)
      // Lookup fields like SBQQ__ConfiguredSKU__c may return either format
      const normalizeId = (id: string) => id?.substring(0, 15) ?? '';

      // Nested bundle detection — use normalized IDs throughout
      const bundleIds = new Set(
        products
          .filter(
            (p) =>
              p.SBQQ__ConfigurationType__c === 'Required' ||
              p.SBQQ__ConfigurationType__c === 'Allowed'
          )
          .map((p) => p.Id as string)
      );
      const bundleIds15 = new Set([...bundleIds].map(normalizeId));

      const nestedOptions = options.filter((o) =>
        bundleIds15.has(normalizeId(o.SBQQ__OptionalSKU__c as string))
      );
      if (nestedOptions.length > 0) {
        const childBundles = new Set(
          nestedOptions.map((o) => normalizeId(o.SBQQ__OptionalSKU__c as string))
        );
        const grandchild = options.filter(
          (o) =>
            childBundles.has(normalizeId(o.SBQQ__ConfiguredSKU__c as string)) &&
            bundleIds15.has(normalizeId(o.SBQQ__OptionalSKU__c as string))
        );
        maxBundleDepth = grandchild.length > 0 ? 3 : 2;
      } else if (bundleProducts > 0) {
        maxBundleDepth = 1;
      }

      metrics.totalOptions = totalOptions;
      metrics.maxBundleDepth = maxBundleDepth;
      metrics.nestedBundleCount = nestedOptions.length;
      metrics.requiredOptions = options.filter((o) => o.SBQQ__Required__c === true).length;

      // Store parent→option map using normalized IDs
      const optionMapData: Record<string, string[]> = {};
      for (const o of options) {
        const parent = normalizeId(o.SBQQ__ConfiguredSKU__c as string);
        const option = normalizeId(o.SBQQ__OptionalSKU__c as string);
        if (parent && option) {
          if (!optionMapData[parent]) optionMapData[parent] = [];
          optionMapData[parent].push(option);
        }
      }
      metrics.optionMap = JSON.stringify(optionMapData);

      // Count bundle-capable products that have child options
      // Uses normalized 15-char IDs to avoid 15 vs 18-char SF ID mismatch
      const configuredBundleCount = Object.keys(optionMapData).filter((parentId) =>
        bundleIds15.has(parentId)
      ).length;
      metrics.configuredBundleCount = configuredBundleCount;

      // Emit as a DataCount finding so assembler can use it in ReportCounts
      findings.push(
        createFinding({
          domain: 'catalog',
          collector: 'catalog',
          artifactType: 'DataCount',
          artifactName: 'Configured Bundles',
          sourceType: 'object',
          countValue: configuredBundleCount,
          notes: `${configuredBundleCount} bundle-capable products have at least one SBQQ__ProductOption__c child record (configured bundles with active nested options)`,
        })
      );

      // V8 P0 fix: emit a DataCount finding for the RAW option total
      // (all SBQQ__ProductOption__c records from the SOQL query,
      // including options whose parent isn't in the local product
      // map). The per-option findings below skip orphaned options,
      // but the report's headline count must reflect the full set.
      findings.push(
        createFinding({
          domain: 'catalog',
          collector: 'catalog',
          artifactType: 'DataCount',
          artifactName: 'ProductOption',
          sourceType: 'object',
          countValue: totalOptions,
          notes: `${totalOptions} total SBQQ__ProductOption__c records in the org`,
        })
      );

      // Phase 4.1 — emit one finding per option so BB-3 produces
      // BundleOption nodes and Stage 4 parent-lookup can wire them
      // under BundleStructure.options. Normalizer reads parent code
      // via `object-ref` evidenceRef and option product code via
      // `field-ref OptionalSKU.ProductCode`. Options whose parent is
      // not in the local catalog (managed package, deleted) are
      // skipped. Fields like `Required`, `Selected`, `Bundled` are
      // dropped for now — the normalizer defaults them and the extra
      // data lives on the finding's evidenceRefs only when we need it.
      const productByIdForOptions = new Map<string, Record<string, unknown>>();
      for (const p of products) {
        // allow-slice: normalize 18-char SF id to 15-char case-sensitive form
        productByIdForOptions.set((p.Id as string).slice(0, 15), p);
      }
      for (const o of options) {
        // allow-slice: normalize 18-char SF id to 15-char case-sensitive form
        const parentId15 = String(o.SBQQ__ConfiguredSKU__c ?? '').slice(0, 15);
        const parentProduct = productByIdForOptions.get(parentId15);
        if (!parentProduct) continue;
        const parentProductCode =
          (parentProduct.ProductCode as string | null) ?? (parentProduct.Id as string);
        // allow-slice: normalize 18-char SF id to 15-char case-sensitive form
        const optionalId15 = String(o.SBQQ__OptionalSKU__c ?? '').slice(0, 15);
        const optionProduct = productByIdForOptions.get(optionalId15);
        const optionProductCode =
          (optionProduct?.ProductCode as string | null | undefined) ?? optionalId15 ?? '';
        const optionNumber = (o.SBQQ__Number__c as number | null) ?? 0;
        findings.push(
          createFinding({
            domain: 'catalog',
            collector: 'catalog',
            artifactType: 'SBQQ__ProductOption__c',
            artifactName: (o.Name as string) ?? `${parentProductCode}:${optionProductCode}`,
            artifactId: o.Id as string,
            findingType: 'bundle_option',
            sourceType: 'object',
            migrationRelevance: 'must-migrate',
            countValue: optionNumber,
            notes: (o.SBQQ__Type__c as string | null) ?? undefined,
            evidenceRefs: [
              { type: 'object-ref', value: parentProductCode },
              {
                type: 'field-ref',
                value: 'OptionalSKU.ProductCode',
                label: optionProductCode,
              },
            ],
          })
        );
      }

      if (maxBundleDepth >= 3) {
        warnings.push('Bundle nesting depth ≥ 3 — complex migration to RCA Product Compositions');
      }
    }

    // ================================================================
    // 5.3b: BundleStructure emission (Phase 4.1, refined 2026-04-12)
    // ================================================================
    // Emit one BundleStructure finding per product that is the parent
    // of at least one ProductOption OR ProductFeature. This is a
    // stronger definition than `SBQQ__ConfigurationType__c ∈
    // {Required, Allowed}` — the previous rule missed 5 real bundles
    // on staging where ConfigurationType was null but the product had
    // options, producing 14 orphan quarantine entries.
    //
    // The parent-lookup rules wire BundleOption.parentBundle /
    // BundleFeature.parentBundle under BundleStructure.options /
    // BundleStructure.features respectively, keyed by the product's
    // ProductCode. This emission must run AFTER options + features
    // have been queried so we have the full set of parent IDs.
    // Rebuild the set of parent product codes from the option and
    // feature findings we just pushed. We use the object-ref evidence
    // (which carries the parentProductCode) rather than re-querying
    // Salesforce. This is cheap at CPQ scale (hundreds of children).
    const bundleParentIds = new Set<string>();
    for (const finding of findings) {
      if (
        finding.artifactType === 'SBQQ__ProductOption__c' ||
        finding.artifactType === 'SBQQ__ProductFeature__c'
      ) {
        const parentCode = finding.evidenceRefs?.find((r) => r.type === 'object-ref')?.value as
          | string
          | undefined;
        if (parentCode) bundleParentIds.add(parentCode);
      }
    }
    // De-duplicate against products we've already emitted — the
    // normalizer's identity recipe uses productCode, so two findings
    // with the same productCode would merge into the same node. We
    // emit at-most-one BundleStructure per product code.
    const emittedBundleCodes = new Set<string>();
    for (const p of products) {
      const productCode = (p.ProductCode as string | null) ?? (p.Id as string);
      if (!bundleParentIds.has(productCode)) continue;
      if (emittedBundleCodes.has(productCode)) continue;
      emittedBundleCodes.add(productCode);
      findings.push(
        createFinding({
          domain: 'catalog',
          collector: 'catalog',
          artifactType: 'BundleStructure',
          artifactName: p.Name as string,
          artifactId: p.Id as string,
          findingType: 'bundle_structure',
          sourceType: 'object',
          complexityLevel: 'medium',
          migrationRelevance: 'must-migrate',
          notes: (p.SBQQ__ConfigurationType__c as string | null) ?? undefined,
          evidenceRefs: [
            {
              type: 'field-ref',
              value: 'Product2.ProductCode',
              label: productCode,
            },
          ],
        })
      );
    }
    metrics.bundleStructureCount = emittedBundleCodes.size;

    // ================================================================
    // 5.3a: Feature orphan detection (C-03a)
    // Features with no ProductOption referencing them = tech debt
    // ================================================================
    if (featureDescribe && optionDescribe && totalFeatures > 0) {
      const featureQ = buildSafeQuery('SBQQ__ProductFeature__c', ['Id'], featureDescribe);
      const allFeatureIds = (
        await this.ctx.restApi.queryAll<Record<string, unknown>>(featureQ.query, this.signal)
      ).map((f) => String(f.Id));

      // Get distinct feature IDs referenced by options
      const referencedFeatureIds = new Set(
        (
          await this.ctx.restApi.queryAll<Record<string, unknown>>(
            `SELECT SBQQ__Feature__c FROM SBQQ__ProductOption__c WHERE SBQQ__Feature__c != null GROUP BY SBQQ__Feature__c`,
            this.signal
          )
        ).map((o) => String(o.SBQQ__Feature__c).substring(0, 15))
      );

      const orphanCount = allFeatureIds.filter(
        (id) => !referencedFeatureIds.has(id.substring(0, 15))
      ).length;

      findings.push(
        createFinding({
          domain: 'catalog',
          collector: 'catalog',
          artifactType: 'DataCount',
          artifactName: 'Feature Orphans',
          sourceType: 'object',
          countValue: orphanCount,
          notes: `${orphanCount} of ${totalFeatures} features are not referenced by any product option — tech debt indicator`,
        })
      );
      metrics.featureOrphanCount = orphanCount;
    }

    // ================================================================
    // 5.3b: Option constraint count (C-03b)
    // ================================================================
    const constraintDescribe = this.ctx.describeCache.get('SBQQ__OptionConstraint__c') as
      | DescribeResult
      | undefined;

    if (constraintDescribe) {
      try {
        const constraintResult = await this.ctx.restApi.queryAll<Record<string, unknown>>(
          'SELECT COUNT(Id) cnt FROM SBQQ__OptionConstraint__c',
          this.signal
        );
        const constraintCount = Number(constraintResult[0]?.cnt ?? 0);
        findings.push(
          createFinding({
            domain: 'catalog',
            collector: 'catalog',
            artifactType: 'DataCount',
            artifactName: 'Option Constraints',
            sourceType: 'object',
            countValue: constraintCount,
            notes: `${constraintCount} option constraint records configured`,
          })
        );
        metrics.optionConstraintCount = constraintCount;
      } catch {
        findings.push(
          createFinding({
            domain: 'catalog',
            collector: 'catalog',
            artifactType: 'DataCount',
            artifactName: 'Option Constraints',
            sourceType: 'object',
            detected: false,
            notes: 'SBQQ__OptionConstraint__c query failed — object may not be accessible',
          })
        );
      }
    } else {
      findings.push(
        createFinding({
          domain: 'catalog',
          collector: 'catalog',
          artifactType: 'DataCount',
          artifactName: 'Option Constraints',
          sourceType: 'object',
          detected: false,
          notes: 'SBQQ__OptionConstraint__c not found in org describe',
        })
      );
    }

    // ================================================================
    // 5.3c: Optional-for count (C-03c)
    // Products that appear as options in other bundles
    // ================================================================
    if (optionDescribe) {
      try {
        const optionalForResult = await this.ctx.restApi.queryAll<Record<string, unknown>>(
          'SELECT COUNT(Id) cnt FROM SBQQ__ProductOption__c WHERE SBQQ__OptionalSKU__c != null',
          this.signal
        );
        const distinctOptionalForResult = await this.ctx.restApi.queryAll<Record<string, unknown>>(
          'SELECT SBQQ__OptionalSKU__c FROM SBQQ__ProductOption__c WHERE SBQQ__OptionalSKU__c != null GROUP BY SBQQ__OptionalSKU__c',
          this.signal
        );
        const optionalForCount = distinctOptionalForResult.length;
        findings.push(
          createFinding({
            domain: 'catalog',
            collector: 'catalog',
            artifactType: 'DataCount',
            artifactName: 'Optional For',
            sourceType: 'object',
            countValue: optionalForCount,
            notes: `${optionalForCount} distinct products appear as options in other bundles (${Number(optionalForResult[0]?.cnt ?? 0)} total option records)`,
          })
        );
        metrics.optionalForCount = optionalForCount;
      } catch {
        warnings.push('Optional-for count query failed');
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
