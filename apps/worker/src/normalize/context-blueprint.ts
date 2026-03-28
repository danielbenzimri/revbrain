/**
 * Context Definition field inventory (Context Blueprint).
 *
 * Builds the "Context Definition" that maps every extracted CPQ artifact
 * to its RCA equivalent, producing the field-level inventory that
 * the LLM uses for migration planning.
 *
 * The blueprint contains:
 * - Source CPQ field → Target RCA field mapping candidates
 * - Mapping complexity per field (direct, transform, redesign, no-equivalent)
 * - Custom field inventory requiring manual migration decisions
 * - Aggregate mapping coverage percentage
 *
 * See: Extraction Spec — Context Definition field inventory
 */

import type { CollectorContext, CollectorResult } from '../collectors/base.ts';
import type { AssessmentFindingInput } from '@revbrain/contract';
import { logger } from '../lib/logger.ts';

const log = logger.child({ component: 'context-blueprint' });

export interface ContextBlueprint {
  fields: FieldMapping[];
  coveragePercent: number;
  unmappedCount: number;
  objectSummary: ObjectMappingSummary[];
  totalSourceFields: number;
  totalMapped: number;
}

export interface FieldMapping {
  sourceObject: string;
  sourceField: string;
  targetObject?: string;
  targetField?: string;
  mappingComplexity: 'direct' | 'transform' | 'redesign' | 'no-equivalent';
  notes?: string;
  isCustom: boolean;
}

export interface ObjectMappingSummary {
  sourceObject: string;
  targetObject: string | null;
  totalFields: number;
  directMapped: number;
  transformRequired: number;
  redesignRequired: number;
  noEquivalent: number;
  coveragePercent: number;
}

// ============================================================================
// Known CPQ → RCA Object Mapping
// ============================================================================

const CPQ_TO_RCA_OBJECTS: Record<string, string> = {
  SBQQ__Quote__c: 'Quote',
  SBQQ__QuoteLine__c: 'QuoteLineItem',
  SBQQ__Product2: 'Product2',
  Product2: 'Product2',
  SBQQ__ProductOption__c: 'ProductRelationship / BundleElement',
  SBQQ__ProductFeature__c: 'ProductCategory / AttributeDefinition',
  SBQQ__ProductRule__c: 'ProductQualification / ConfigurationRule',
  SBQQ__ConfigurationAttribute__c: 'AttributeDefinition',
  SBQQ__PriceRule__c: 'PricingProcedure / PriceAdjustmentSchedule',
  SBQQ__PriceCondition__c: 'PriceCondition (Pricing Procedure step)',
  SBQQ__PriceAction__c: 'PriceAdjustment (Pricing Procedure step)',
  SBQQ__DiscountSchedule__c: 'PriceAdjustmentSchedule',
  SBQQ__DiscountTier__c: 'PriceAdjustmentTier',
  SBQQ__CustomScript__c: 'Pricing Procedure (declarative)',
  SBQQ__QuoteTemplate__c: 'DocumentTemplate / OmniScript',
  SBQQ__TemplateSection__c: 'DocumentTemplate section',
  SBQQ__LookupQuery__c: 'ExternalDataSource / PricingVariable',
  SBQQ__SummaryVariable__c: 'PricingProcedure aggregation step',
  SBQQ__ContractedPrice__c: 'ContractedPrice (RCA native)',
  SBQQ__Subscription__c: 'Asset / OrderItem lifecycle',
  SBQQ__QuoteLineGroup__c: 'QuoteLineItemGroup',
  Order: 'Order',
  OrderItem: 'OrderItem',
  Contract: 'Contract',
  Asset: 'Asset',
};

// ============================================================================
// Known CPQ → RCA Field Mappings (common fields)
// ============================================================================

interface KnownFieldMapping {
  target: string;
  complexity: 'direct' | 'transform' | 'redesign';
  notes?: string;
}

const KNOWN_FIELD_MAPPINGS: Record<string, Record<string, KnownFieldMapping>> = {
  SBQQ__Quote__c: {
    SBQQ__Status__c: { target: 'Status', complexity: 'direct' },
    SBQQ__Account__c: { target: 'AccountId', complexity: 'direct' },
    SBQQ__Opportunity2__c: { target: 'OpportunityId', complexity: 'direct' },
    SBQQ__PrimaryContact__c: { target: 'ContactId', complexity: 'direct' },
    SBQQ__ExpirationDate__c: { target: 'ExpirationDate', complexity: 'direct' },
    SBQQ__StartDate__c: { target: 'EffectiveDate', complexity: 'direct' },
    SBQQ__EndDate__c: { target: 'EndDate', complexity: 'direct' },
    SBQQ__PriceBook__c: { target: 'Pricebook2Id', complexity: 'direct' },
    SBQQ__NetAmount__c: {
      target: 'TotalPrice',
      complexity: 'transform',
      notes: 'Aggregation method may differ',
    },
    SBQQ__CustomerDiscount__c: { target: 'PriceAdjustmentSchedule', complexity: 'transform' },
    SBQQ__SubscriptionTerm__c: { target: 'Subscription Term (custom)', complexity: 'transform' },
    SBQQ__Ordered__c: {
      target: 'OrderCreated (process)',
      complexity: 'redesign',
      notes: 'CPQ checkbox → RCA order creation flow',
    },
  },
  SBQQ__QuoteLine__c: {
    SBQQ__Product__c: { target: 'Product2Id', complexity: 'direct' },
    SBQQ__Quantity__c: { target: 'Quantity', complexity: 'direct' },
    SBQQ__ListPrice__c: { target: 'ListPrice', complexity: 'direct' },
    SBQQ__NetPrice__c: { target: 'UnitPrice', complexity: 'transform' },
    SBQQ__SpecialPrice__c: { target: 'AdjustedPrice', complexity: 'transform' },
    SBQQ__Discount__c: { target: 'PriceAdjustment', complexity: 'transform' },
    SBQQ__AdditionalDiscount__c: { target: 'PriceAdjustment', complexity: 'transform' },
    SBQQ__PartnerDiscount__c: { target: 'PriceAdjustment', complexity: 'transform' },
    SBQQ__DistributorDiscount__c: { target: 'PriceAdjustment', complexity: 'transform' },
    SBQQ__PriorQuantity__c: { target: 'Amendment logic', complexity: 'redesign' },
    SBQQ__UpgradedSubscription__c: { target: 'Asset lifecycle', complexity: 'redesign' },
  },
  Product2: {
    Name: { target: 'Name', complexity: 'direct' },
    ProductCode: { target: 'ProductCode', complexity: 'direct' },
    IsActive: { target: 'IsActive', complexity: 'direct' },
    Family: { target: 'Family', complexity: 'direct' },
    SBQQ__SubscriptionPricing__c: { target: 'ProductSellingModel', complexity: 'transform' },
    SBQQ__SubscriptionType__c: { target: 'SellingModelType', complexity: 'transform' },
    SBQQ__SubscriptionTerm__c: { target: 'DefaultSubscriptionTerm', complexity: 'direct' },
    SBQQ__BillingFrequency__c: {
      target: 'BillingPolicy.BillingCycleType',
      complexity: 'transform',
    },
    SBQQ__ConfigurationType__c: { target: 'ProductRelationshipType', complexity: 'transform' },
    SBQQ__PricingMethod__c: { target: 'Pricing strategy in Procedure', complexity: 'redesign' },
  },
};

/**
 * Build the Context Blueprint from extraction results.
 */
export async function buildContextBlueprint(
  ctx: CollectorContext,
  results: Map<string, CollectorResult>
): Promise<ContextBlueprint> {
  log.info('building_context_blueprint');

  const allFindings: AssessmentFindingInput[] = [];
  for (const [, result] of results) {
    if (result.status !== 'failed') {
      allFindings.push(...result.findings);
    }
  }

  const fields: FieldMapping[] = [];

  // 1. Build field inventory from Describe cache (collected by Discovery)
  for (const [objectName, describe] of ctx.describeCache.entries()) {
    const desc = describe as { fields?: Array<{ name: string; type: string; custom: boolean }> };
    if (!desc.fields) continue;

    // Only process CPQ-related objects
    const targetObject = CPQ_TO_RCA_OBJECTS[objectName];
    if (!targetObject && !objectName.startsWith('SBQQ__')) continue;

    const knownMappings = KNOWN_FIELD_MAPPINGS[objectName] || {};

    for (const field of desc.fields) {
      // Skip system/audit fields
      if (isSystemField(field.name)) continue;

      const known = knownMappings[field.name];
      const isCustom = field.custom || field.name.endsWith('__c');

      if (known) {
        fields.push({
          sourceObject: objectName,
          sourceField: field.name,
          targetObject: targetObject || undefined,
          targetField: known.target,
          mappingComplexity: known.complexity,
          notes: known.notes,
          isCustom,
        });
      } else if (isCustom) {
        // Custom fields with no known mapping
        fields.push({
          sourceObject: objectName,
          sourceField: field.name,
          mappingComplexity: 'no-equivalent',
          notes: 'Custom field — requires manual mapping decision',
          isCustom: true,
        });
      } else {
        // Standard fields on CPQ objects — likely have direct mappings
        fields.push({
          sourceObject: objectName,
          sourceField: field.name,
          targetObject: targetObject || undefined,
          targetField: field.name,
          mappingComplexity: 'direct',
          isCustom: false,
        });
      }
    }
  }

  // 2. Enrich from customization findings (custom fields discovered by customizations collector)
  const customFieldFindings = allFindings.filter(
    (f) => f.domain === 'customization' && f.artifactType === 'CustomField'
  );
  for (const cf of customFieldFindings) {
    // Check if we already have this field
    const exists = fields.some(
      (f) => f.sourceField === cf.artifactName || f.sourceField === cf.artifactId
    );
    if (!exists && cf.artifactId) {
      const parts = cf.artifactId.split('.');
      fields.push({
        sourceObject: parts[0] || 'Unknown',
        sourceField: parts[1] || cf.artifactName,
        mappingComplexity:
          (cf.rcaMappingComplexity as FieldMapping['mappingComplexity']) ?? 'no-equivalent',
        notes: cf.notes || 'Discovered by customizations collector',
        isCustom: true,
      });
    }
  }

  // 3. Compute per-object summary
  const objectMap = new Map<string, FieldMapping[]>();
  for (const f of fields) {
    if (!objectMap.has(f.sourceObject)) objectMap.set(f.sourceObject, []);
    objectMap.get(f.sourceObject)!.push(f);
  }

  const objectSummary: ObjectMappingSummary[] = [];
  for (const [obj, objFields] of objectMap) {
    const direct = objFields.filter((f) => f.mappingComplexity === 'direct').length;
    const transform = objFields.filter((f) => f.mappingComplexity === 'transform').length;
    const redesign = objFields.filter((f) => f.mappingComplexity === 'redesign').length;
    const noEq = objFields.filter((f) => f.mappingComplexity === 'no-equivalent').length;
    const mapped = direct + transform + redesign;
    const total = objFields.length;

    objectSummary.push({
      sourceObject: obj,
      targetObject: CPQ_TO_RCA_OBJECTS[obj] || null,
      totalFields: total,
      directMapped: direct,
      transformRequired: transform,
      redesignRequired: redesign,
      noEquivalent: noEq,
      coveragePercent: total > 0 ? Math.round((mapped / total) * 100) : 0,
    });
  }

  // Sort by total fields descending
  objectSummary.sort((a, b) => b.totalFields - a.totalFields);

  // 4. Compute overall coverage
  const totalMapped = fields.filter((f) => f.mappingComplexity !== 'no-equivalent').length;
  const coveragePercent = fields.length > 0 ? Math.round((totalMapped / fields.length) * 100) : 0;
  const unmappedCount = fields.filter((f) => f.mappingComplexity === 'no-equivalent').length;

  const blueprint: ContextBlueprint = {
    fields,
    coveragePercent,
    unmappedCount,
    objectSummary,
    totalSourceFields: fields.length,
    totalMapped,
  };

  log.info(
    {
      totalFields: fields.length,
      totalMapped,
      unmapped: unmappedCount,
      coveragePercent,
      objects: objectSummary.length,
    },
    'context_blueprint_complete'
  );

  return blueprint;
}

/** System/audit fields to skip */
function isSystemField(name: string): boolean {
  const systemFields = new Set([
    'Id',
    'IsDeleted',
    'CreatedById',
    'CreatedDate',
    'LastModifiedById',
    'LastModifiedDate',
    'SystemModstamp',
    'LastActivityDate',
    'LastViewedDate',
    'LastReferencedDate',
    'OwnerId',
    'RecordTypeId',
    'CurrencyIsoCode',
  ]);
  return systemFields.has(name);
}
