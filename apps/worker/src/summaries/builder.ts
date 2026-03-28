/**
 * Summary builder — generates per-domain and overall assessment summaries.
 *
 * Produces structured summaries consumed by:
 * - The assessment UI (dashboard cards, domain detail pages)
 * - The LLM migration advisor (structured context for recommendations)
 * - Export/report generation
 *
 * Each domain summary includes:
 * - Key findings count and breakdown by risk/complexity
 * - Feature adoption indicators
 * - Migration-relevant highlights
 * - Recommended next steps
 *
 * See: Extraction Spec — Phase 5 Summary generation
 */
/* eslint-disable @typescript-eslint/no-explicit-any */

import type { CollectorContext, CollectorResult } from '../collectors/base.ts';
import type { AssessmentFindingInput } from '@revbrain/contract';
import { createFinding } from '../normalize/findings.ts';
import type {
  SummarySchema,
  DomainSummary,
  RiskDistribution,
  ComplexityDistribution,
  SummaryHighlight,
} from './schemas.ts';
import { logger } from '../lib/logger.ts';

const log = logger.child({ component: 'summaries' });

/** Collector name → human-readable domain label */
const DOMAIN_LABELS: Record<string, string> = {
  discovery: 'Discovery',
  catalog: 'Product Catalog',
  pricing: 'Pricing Configuration',
  usage: 'Usage Analytics',
  dependencies: 'Code Dependencies',
  customizations: 'Customizations',
  settings: 'CPQ Settings',
  'order-lifecycle': 'Order Lifecycle',
  templates: 'Quote Templates',
  approvals: 'Approvals',
  integrations: 'Integrations',
  localization: 'Localization',
};

/**
 * Build all summaries from collector results.
 */
export async function buildSummaries(
  _ctx: CollectorContext,
  results: Map<string, CollectorResult>
): Promise<SummarySchema> {
  log.info('building_summaries');

  // Collect all findings
  const allFindings: AssessmentFindingInput[] = [];
  for (const [, result] of results) {
    allFindings.push(...result.findings);
  }

  // 1. Generate per-domain summaries
  const domainSummaries: DomainSummary[] = [];
  for (const [collectorName, result] of results) {
    const summary = buildDomainSummary(collectorName, result);
    domainSummaries.push(summary);
  }

  // Sort: failed last, then by findings count descending
  domainSummaries.sort((a, b) => {
    if (a.status === 'failed' && b.status !== 'failed') return 1;
    if (a.status !== 'failed' && b.status === 'failed') return -1;
    return b.findingsCount - a.findingsCount;
  });

  // 2. Overall risk distribution
  const riskDistribution = computeRiskDistribution(allFindings);

  // 3. Overall score (0-100)
  const overallScore = computeOverallScore(allFindings, results);

  // 4. G-13: Complexity hotspots (rule-based)
  const hotspots = identifyHotspots(allFindings, domainSummaries);

  // 5. G-17: Extraction confidence map
  const confidenceMap = buildConfidenceMap(results);

  // 6. G-14: Object inventory
  const inventoryFindings = buildObjectInventory(results);
  log.info({ inventoryItems: inventoryFindings.length }, 'object_inventory_built');

  const summary: SummarySchema = {
    overallScore,
    domainSummaries,
    totalFindings: allFindings.length,
    riskDistribution,
    generatedAt: new Date().toISOString(),
  };

  log.info(
    {
      overallScore,
      totalFindings: allFindings.length,
      domains: domainSummaries.length,
      hotspots: hotspots.length,
      confidenceCategories: confidenceMap.length,
    },
    'summaries_complete'
  );

  return summary;
}

/** Build summary for a single domain/collector */
function buildDomainSummary(collectorName: string, result: CollectorResult): DomainSummary {
  const findings = result.findings;
  const riskDistribution = computeRiskDistribution(findings);
  const complexityDistribution = computeComplexityDistribution(findings);
  const highlights = generateHighlights(collectorName, result);

  // Determine migration readiness
  const migrationReadiness = assessReadiness(findings);

  return {
    domain: DOMAIN_LABELS[collectorName] || collectorName,
    collectorName,
    status:
      result.status === 'failed' ? 'failed' : result.status === 'partial' ? 'partial' : 'success',
    findingsCount: findings.length,
    riskDistribution,
    complexityDistribution,
    highlights,
    migrationReadiness,
    coveragePercent: result.metrics.coverage ?? 0,
  };
}

/** Compute risk distribution from findings */
function computeRiskDistribution(findings: AssessmentFindingInput[]): RiskDistribution {
  const dist: RiskDistribution = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
  for (const f of findings) {
    const level = f.riskLevel ?? 'medium';
    if (level in dist) {
      dist[level as keyof RiskDistribution]++;
    }
  }
  return dist;
}

/** Compute complexity distribution */
function computeComplexityDistribution(findings: AssessmentFindingInput[]): ComplexityDistribution {
  const dist: ComplexityDistribution = {};
  for (const f of findings) {
    const level = f.complexityLevel;
    if (!level) continue;
    switch (level) {
      case 'very-high':
        dist.veryHigh = (dist.veryHigh ?? 0) + 1;
        break;
      case 'high':
        dist.high = (dist.high ?? 0) + 1;
        break;
      case 'medium':
        dist.medium = (dist.medium ?? 0) + 1;
        break;
      case 'low':
        dist.low = (dist.low ?? 0) + 1;
        break;
    }
  }
  return dist;
}

/** Generate highlight items for a domain */
function generateHighlights(collectorName: string, result: CollectorResult): SummaryHighlight[] {
  const highlights: SummaryHighlight[] = [];
  const findings = result.findings;
  const metrics = result.metrics.metrics as Record<string, number | string | boolean>;
  const warnings = result.metrics.warnings ?? [];

  // Add warnings as highlights
  for (const w of warnings.slice(0, 3)) {
    highlights.push({ label: 'Warning', description: w, severity: 'warning' });
  }

  // Domain-specific highlights
  switch (collectorName) {
    case 'catalog': {
      const products = findings.filter((f) => f.artifactType === 'Product2');
      const options = findings.filter((f) => f.artifactType === 'ProductOption');
      const rules = findings.filter((f) => f.artifactType === 'ProductRule');
      if (products.length > 0)
        highlights.push({
          label: `${products.length} Products`,
          description: `Product catalog with ${products.length} products, ${options.length} bundle options, ${rules.length} product rules`,
          severity: 'info',
        });
      // Nested bundles detection
      const nested = findings.filter(
        (f) => f.notes?.includes('nested') || f.notes?.includes('bundle depth')
      );
      if (nested.length > 0)
        highlights.push({
          label: 'Nested Bundles Detected',
          description:
            'Bundle hierarchy detected — requires careful migration planning for RCA product relationships',
          severity: 'warning',
        });
      break;
    }

    case 'pricing': {
      const qcpScripts = findings.filter((f) => f.artifactType === 'CustomScript');
      const priceRules = findings.filter((f) => f.artifactType === 'PriceRule');
      if (qcpScripts.length > 0)
        highlights.push({
          label: `${qcpScripts.length} QCP Scripts`,
          description:
            'Custom pricing logic must be converted to RCA Pricing Procedures (declarative)',
          severity: 'critical',
        });
      if (priceRules.length > 20)
        highlights.push({
          label: `${priceRules.length} Price Rules`,
          description: 'Large rule set — consider consolidation during RCA migration',
          severity: 'warning',
        });
      // Context Blueprint fields
      if (metrics.contextBlueprintFields)
        highlights.push({
          label: `${metrics.contextBlueprintFields} Context Fields`,
          description: 'Fields used in pricing logic that need mapping to RCA Context Definition',
          severity: 'info',
        });
      break;
    }

    case 'dependencies': {
      const apex = findings.filter(
        (f) => f.artifactType === 'ApexClass' || f.artifactType === 'ApexTrigger'
      );
      const callouts = findings.filter((f) => f.notes?.includes('callout'));
      if (apex.length > 0)
        highlights.push({
          label: `${apex.length} Apex Classes/Triggers`,
          description: `CPQ-dependent code that may need refactoring for RCA`,
          severity: apex.length > 10 ? 'warning' : 'info',
        });
      if (callouts.length > 0)
        highlights.push({
          label: `${callouts.length} External Callouts`,
          description: 'Apex with HTTP callouts — integration points to verify post-migration',
          severity: 'critical',
        });
      break;
    }

    case 'usage': {
      if (metrics.totalQuotes)
        highlights.push({
          label: `${metrics.totalQuotes} Quotes (90 days)`,
          description: `Active quoting with ${metrics.quoteToOrderRate ?? 'unknown'}% conversion rate`,
          severity: 'info',
        });
      if (metrics.avgDealSize)
        highlights.push({
          label: `Avg Deal Size: $${Number(metrics.avgDealSize).toLocaleString()}`,
          description: 'Average deal size helps estimate migration business impact',
          severity: 'info',
        });
      break;
    }

    case 'order-lifecycle': {
      if (metrics.totalOrders)
        highlights.push({
          label: `${metrics.totalOrders} Orders`,
          description: `${metrics.totalContracts ?? 0} contracts, ${metrics.assetsWithSubscriptions ?? 0} assets with subscriptions`,
          severity: 'info',
        });
      break;
    }

    case 'customizations': {
      const customFields = findings.filter((f) => f.artifactType === 'CustomField');
      const validationRules = findings.filter((f) => f.artifactType === 'ValidationRule');
      if (customFields.length > 0)
        highlights.push({
          label: `${customFields.length} Custom Fields`,
          description: 'Custom fields on CPQ objects requiring mapping decisions',
          severity: customFields.length > 50 ? 'warning' : 'info',
        });
      if (validationRules.length > 0)
        highlights.push({
          label: `${validationRules.length} Validation Rules`,
          description: 'Validation rules need to be recreated or adapted for RCA objects',
          severity: 'info',
        });
      break;
    }

    case 'templates': {
      const templates = findings.filter((f) => f.artifactType === 'QuoteTemplate');
      const mergeFields = findings.filter(
        (f) => f.notes?.includes('merge field') || f.artifactType === 'MergeField'
      );
      if (templates.length > 0)
        highlights.push({
          label: `${templates.length} Quote Templates`,
          description: 'Templates need conversion to RCA Document Generation (OmniStudio)',
          severity: 'warning',
        });
      if (mergeFields.length > 0)
        highlights.push({
          label: 'Merge Fields Detected',
          description: 'Template merge fields reference CPQ objects — mappings needed for RCA',
          severity: 'info',
        });
      break;
    }

    case 'integrations': {
      const namedCreds = findings.filter((f) => f.artifactType === 'NamedCredential');
      const esign = findings.filter(
        (f) =>
          f.notes?.includes('e-sign') || f.notes?.includes('DocuSign') || f.notes?.includes('Adobe')
      );
      if (namedCreds.length > 0)
        highlights.push({
          label: `${namedCreds.length} Named Credentials`,
          description: 'External integrations that may need endpoint updates post-migration',
          severity: 'info',
        });
      if (esign.length > 0)
        highlights.push({
          label: 'E-Signature Integration',
          description: 'Document signing integration detected — verify RCA compatibility',
          severity: 'warning',
        });
      break;
    }

    default:
      break;
  }

  // Add critical findings as highlights
  const criticals = findings.filter((f) => f.riskLevel === 'critical');
  for (const c of criticals.slice(0, 2)) {
    if (!highlights.some((h) => h.description.includes(c.artifactName))) {
      highlights.push({
        label: `Critical: ${c.artifactName}`,
        description: c.notes || `Critical risk finding requiring immediate attention`,
        severity: 'critical',
      });
    }
  }

  return highlights.slice(0, 8); // Cap at 8 highlights per domain
}

/** Assess migration readiness for a domain */
function assessReadiness(
  findings: AssessmentFindingInput[]
): 'ready' | 'needs-work' | 'significant-effort' | 'unknown' {
  if (findings.length === 0) return 'unknown';

  const relevant = findings.filter(
    (f) =>
      f.rcaMappingComplexity &&
      f.artifactType !== 'DataCount' &&
      f.artifactType !== 'OrgFingerprint'
  );
  if (relevant.length === 0) return 'unknown';

  const directPercent =
    relevant.filter((f) => f.rcaMappingComplexity === 'direct').length / relevant.length;
  const redesignPercent =
    relevant.filter(
      (f) => f.rcaMappingComplexity === 'redesign' || f.rcaMappingComplexity === 'no-equivalent'
    ).length / relevant.length;

  const criticalCount = findings.filter((f) => f.riskLevel === 'critical').length;

  if (criticalCount > 3 || redesignPercent > 0.3) return 'significant-effort';
  if (directPercent > 0.6 && criticalCount === 0) return 'ready';
  return 'needs-work';
}

/** Compute overall migration readiness score (0-100, higher = more ready) */
function computeOverallScore(
  findings: AssessmentFindingInput[],
  results: Map<string, CollectorResult>
): number {
  const relevant = findings.filter(
    (f) =>
      f.rcaMappingComplexity &&
      f.artifactType !== 'DataCount' &&
      f.artifactType !== 'OrgFingerprint' &&
      f.artifactType !== 'UsageOverview' &&
      f.artifactType !== 'OrderLifecycleOverview'
  );

  if (relevant.length === 0) return 0;

  // Score components:
  // 1. RCA mapping readiness (40% weight)
  const direct = relevant.filter((f) => f.rcaMappingComplexity === 'direct').length;
  const transform = relevant.filter((f) => f.rcaMappingComplexity === 'transform').length;
  const redesign = relevant.filter((f) => f.rcaMappingComplexity === 'redesign').length;
  const noEq = relevant.filter((f) => f.rcaMappingComplexity === 'no-equivalent').length;
  const total = relevant.length;

  const mappingScore =
    ((direct * 100 + transform * 60 + redesign * 20 + noEq * 0) / (total * 100)) * 100;

  // 2. Risk profile (30% weight)
  const criticals = findings.filter((f) => f.riskLevel === 'critical').length;
  const highs = findings.filter((f) => f.riskLevel === 'high').length;
  const riskPenalty = Math.min(criticals * 10 + highs * 3, 100);
  const riskScore = Math.max(100 - riskPenalty, 0);

  // 3. Extraction coverage (15% weight)
  let coverageSum = 0;
  let coverageCount = 0;
  for (const [, result] of results) {
    if (result.status !== 'failed') {
      coverageSum += result.metrics.coverage ?? 0;
      coverageCount++;
    }
  }
  const coverageScore = coverageCount > 0 ? coverageSum / coverageCount : 0;

  // 4. Complexity profile (15% weight)
  const lowComplexity = relevant.filter(
    (f) => f.complexityLevel === 'low' || !f.complexityLevel
  ).length;
  const complexityScore = (lowComplexity / total) * 100;

  const overallScore = Math.round(
    mappingScore * 0.4 + riskScore * 0.3 + coverageScore * 0.15 + complexityScore * 0.15
  );

  return Math.max(0, Math.min(100, overallScore));
}

// ============================================================================
// G-13: Complexity Hotspot Detection (rule-based)
// ============================================================================

interface ComplexityHotspot {
  name: string;
  severity: 'Critical' | 'High' | 'Medium';
  analysis: string;
  evidenceCounts: Record<string, number>;
}

function identifyHotspots(
  findings: AssessmentFindingInput[],
  domainSummaries: DomainSummary[]
): ComplexityHotspot[] {
  const hotspots: ComplexityHotspot[] = [];

  // 1. Pricing Engine Hotspot — based on complexity score, not raw counts
  const pricingSummary = domainSummaries.find((d) => d.collectorName === 'pricing');
  const priceRules = findings.filter((f) => f.artifactType === 'PriceRule').length;
  const productRules = findings.filter((f) => f.artifactType === 'ProductRule').length;
  const customScripts = findings.filter((f) => f.artifactType === 'CustomScript').length;
  const discountSchedules = findings.filter((f) => f.artifactType === 'DiscountSchedule').length;

  if (
    pricingSummary &&
    pricingSummary.coveragePercent > 0 &&
    priceRules > 0 &&
    productRules > 0 &&
    (customScripts > 0 || discountSchedules > 5)
  ) {
    hotspots.push({
      name: 'Quote Pricing Engine',
      severity: priceRules > 5 || customScripts > 0 ? 'Critical' : 'High',
      analysis: `${priceRules} Price Rules + ${productRules} Product Rules + ${discountSchedules} Discount Schedules${customScripts > 0 ? ` + ${customScripts} Custom Scripts` : ''} form a multi-layered calculation chain.`,
      evidenceCounts: { priceRules, productRules, discountSchedules, customScripts },
    });
  }

  // 2. Cross-cutting filter field (generalized from Brand/Region)
  const fieldRefs = new Map<string, Set<string>>();
  for (const f of findings) {
    if (!f.evidenceRefs) continue;
    for (const ref of f.evidenceRefs) {
      if (ref.referencedFields) {
        for (const field of ref.referencedFields) {
          const fieldName = field.split('.').pop() ?? field;
          if (
            fieldName.includes('Region') ||
            fieldName.includes('Market') ||
            fieldName.includes('Country') ||
            fieldName.includes('Brand') ||
            fieldName.includes('Segment')
          ) {
            if (!fieldRefs.has(fieldName)) fieldRefs.set(fieldName, new Set());
            fieldRefs.get(fieldName)!.add(f.domain);
          }
        }
      }
    }
  }

  for (const [field, domains] of fieldRefs) {
    if (domains.size >= 3) {
      hotspots.push({
        name: 'Cross-Cutting Data Partitioning',
        severity: 'High',
        analysis: `Field "${field}" referenced across ${domains.size} domains (${[...domains].join(', ')}). This parallel layer affects product visibility, pricing, templates, and approvals.`,
        evidenceCounts: { field: field as unknown as number, domains: domains.size },
      });
      break; // Only report the most prominent one
    }
  }

  // 3. Document Chain Hotspot
  const templates = findings.filter((f) => f.artifactType === 'QuoteTemplate').length;
  const esigPlugin = findings.find(
    (f) =>
      f.artifactType === 'PluginStatus' &&
      f.artifactName === 'Electronic Signature' &&
      (f.countValue ?? 0) > 0
  );
  const orderFlows = findings.filter(
    (f) => f.artifactType === 'Flow' && f.artifactName?.toLowerCase().includes('order')
  ).length;

  if (templates > 0 && esigPlugin) {
    hotspots.push({
      name: 'DocuSign Document Chain',
      severity: 'High',
      analysis: `Quote PDF generation → ${esigPlugin.notes?.includes('DocuSign') ? 'DocuSign' : 'e-signature'} → signing → Order creation. Spans CPQ, document generation, and e-signature in one automated flow.`,
      evidenceCounts: { templates, orderFlows },
    });
  }

  // 4. Quote-to-Order Hotspot
  const orderLifecycleFindings = findings.filter((f) => f.domain === 'order-lifecycle').length;
  if (orderFlows > 0 && orderLifecycleFindings > 0) {
    hotspots.push({
      name: 'Quote-to-Order Automation',
      severity: 'High',
      analysis: `Quote acceptance triggers Order creation via Flow. Deposit tracking, graphics-specific data, and field mapping add complexity.`,
      evidenceCounts: { orderFlows, orderLifecycleFindings },
    });
  }

  return hotspots;
}

// ============================================================================
// G-14: Consolidated Object Inventory
// ============================================================================

const ARTIFACT_TO_SF_OBJECT: Record<string, string> = {
  Product2: 'Product2',
  ProductFeature: 'SBQQ__ProductFeature__c',
  ProductOption: 'SBQQ__ProductOption__c',
  ProductRule: 'SBQQ__ProductRule__c',
  ConfigurationAttribute: 'SBQQ__ConfigurationAttribute__c',
  PriceRule: 'SBQQ__PriceRule__c',
  PriceCondition: 'SBQQ__PriceCondition__c',
  PriceAction: 'SBQQ__PriceAction__c',
  DiscountSchedule: 'SBQQ__DiscountSchedule__c',
  DiscountTier: 'SBQQ__DiscountTier__c',
  ContractedPrice: 'SBQQ__ContractedPrice__c',
  CustomScript: 'SBQQ__CustomScript__c',
  SummaryVariable: 'SBQQ__SummaryVariable__c',
  LookupQuery: 'SBQQ__LookupQuery__c',
  LookupData: 'SBQQ__LookupData__c',
  QuoteTemplate: 'SBQQ__QuoteTemplate__c',
  TemplateSection: 'SBQQ__TemplateSection__c',
  TemplateContent: 'SBQQ__TemplateContent__c',
  LineColumn: 'SBQQ__LineColumn__c',
  QuoteTerm: 'SBQQ__QuoteTerm__c',
  CustomAction: 'SBQQ__CustomAction__c',
  AdvancedApproval: 'sbaa__ApprovalRule__c',
  AdvancedApprovalChain: 'sbaa__ApprovalChain__c',
  ApprovalProcess: 'ProcessDefinition',
  NamedCredential: 'NamedCredential',
  PlatformEvent: 'PlatformEventChannel',
  OutboundMessage: 'OutboundMessage',
  Localization: 'SBQQ__Localization__c',
  CPQSetting: 'SBQQ__CustomSettings',
  BlockPrice: 'SBQQ__BlockPrice__c',
  CPQReport: 'Report',
};

const SYNTHETIC_TYPES = new Set([
  'CPQSettingValue',
  'PluginStatus',
  'UserAdoption',
  'UserBehavior',
  'DiscountDistribution',
  'PriceOverrideAnalysis',
  'TopQuotedProduct',
  'ConversionSegment',
  'TrendIndicator',
  'DataQualityFlag',
  'ComplexityHotspot',
  'ExtractionConfidence',
  'OptionAttachmentRate',
  'DataCount',
  'OrgFingerprint',
  'UsageOverview',
  'OrderLifecycleOverview',
  'GlanceDashboard',
]);

const METADATA_TYPES = new Set([
  'ApexClass',
  'ApexTrigger',
  'Flow',
  'WorkflowRule',
  'ValidationRule',
  'CustomField',
  'CustomMetadataType',
  'FormulaField',
  'RecordType',
]);

function buildObjectInventory(results: Map<string, CollectorResult>): AssessmentFindingInput[] {
  const objectMap = new Map<
    string,
    { count: number; domain: string; maxComplexity: string; brandSpecific: boolean }
  >();

  for (const [, result] of results) {
    for (const f of result.findings) {
      if (SYNTHETIC_TYPES.has(f.artifactType) || METADATA_TYPES.has(f.artifactType)) continue;
      const sfObject = ARTIFACT_TO_SF_OBJECT[f.artifactType];
      if (!sfObject) {
        // Unknown type — skip
        continue;
      }
      const existing = objectMap.get(sfObject) ?? {
        count: 0,
        domain: f.domain,
        maxComplexity: 'low',
        brandSpecific: false,
      };

      // Use countValue for aggregate findings, increment for individual
      if (f.countValue != null && f.countValue > 0) {
        existing.count = Math.max(existing.count, f.countValue);
      } else {
        existing.count++;
      }

      // Track max complexity
      const complexityOrder = ['low', 'medium', 'high', 'very-high'];
      const currentIdx = complexityOrder.indexOf(existing.maxComplexity);
      const newIdx = complexityOrder.indexOf(f.complexityLevel ?? 'low');
      if (newIdx > currentIdx) existing.maxComplexity = f.complexityLevel ?? 'low';

      // Check for brand/region fields
      if (
        f.evidenceRefs?.some((r) =>
          r.referencedFields?.some((rf) => /Region|Market|Country|Brand/i.test(rf))
        )
      ) {
        existing.brandSpecific = true;
      }

      objectMap.set(sfObject, existing);
    }
  }

  // Sort by domain then count descending
  const sorted = [...objectMap.entries()].sort((a, b) => {
    if (a[1].domain !== b[1].domain) return a[1].domain.localeCompare(b[1].domain);
    return b[1].count - a[1].count;
  });

  return sorted.map(([sfObject, data], index) =>
    createFinding({
      domain: data.domain as any,
      collector: 'summaries',
      artifactType: 'ObjectInventoryItem',
      artifactName: sfObject,
      sourceType: 'inferred',
      findingType: 'object_inventory',
      riskLevel: 'info',
      countValue: data.count,
      complexityLevel: data.maxComplexity as any,
      notes: `#${index + 1} ${sfObject}: ${data.count} records. ${data.brandSpecific ? 'Brand-specific.' : ''} Complexity: ${data.maxComplexity}.`,
      evidenceRefs: [
        { type: 'count' as const, value: String(data.count), label: 'Record count' },
        {
          type: 'count' as const,
          value: data.brandSpecific ? 'Yes' : 'No',
          label: 'Brand-specific',
        },
      ],
    })
  );
}

// ============================================================================
// G-17: Extraction Confidence Map
// ============================================================================

interface ConfidenceEntry {
  category: string;
  coverage: 'Full' | 'Partial' | 'Estimated' | 'Not Extracted';
  notes: string;
}

function buildConfidenceMap(results: Map<string, CollectorResult>): ConfidenceEntry[] {
  const map: ConfidenceEntry[] = [];

  const collectorConfidence = (name: string, category: string): ConfidenceEntry => {
    const result = results.get(name);
    if (!result) return { category, coverage: 'Not Extracted', notes: 'Collector did not run.' };
    if (result.status === 'failed')
      return { category, coverage: 'Not Extracted', notes: `Collector failed: ${result.error}` };
    const cov = result.metrics.coverage ?? 0;
    if (cov >= 90)
      return { category, coverage: 'Full', notes: `${result.findings.length} findings extracted.` };
    return {
      category,
      coverage: 'Partial',
      notes: `${result.findings.length} findings, ${cov}% coverage.`,
    };
  };

  map.push(collectorConfidence('discovery', 'CPQ Config Objects (SBQQ)'));
  map.push(collectorConfidence('catalog', 'Product Catalog'));
  map.push(collectorConfidence('pricing', 'Pricing Rules & Logic'));
  map.push(collectorConfidence('usage', 'Transactional Data (Quotes, Orders)'));
  map.push(collectorConfidence('dependencies', 'Triggers & Flows'));
  map.push(collectorConfidence('customizations', 'Custom Fields & Validation Rules'));
  map.push(collectorConfidence('settings', 'CPQ Package Settings'));
  map.push(collectorConfidence('order-lifecycle', 'Order Lifecycle'));
  map.push(collectorConfidence('templates', 'Quote Templates'));
  map.push(collectorConfidence('approvals', 'Approval Processes'));
  map.push(collectorConfidence('integrations', 'Integrations'));
  map.push(collectorConfidence('localization', 'Localizations'));

  // Derived metrics
  map.push({
    category: 'User Behavior / Modifications',
    coverage: 'Estimated',
    notes: 'Derived from audit trail sampling.',
  });
  map.push({
    category: 'Discount / Override Patterns',
    coverage: 'Estimated',
    notes: 'Derived from quote data sampling.',
  });
  map.push({
    category: 'Data Quality Metrics',
    coverage: 'Estimated',
    notes: 'Estimated from metadata + data sampling.',
  });

  // Out of scope
  map.push({
    category: 'LWC / Visualforce',
    coverage: 'Not Extracted',
    notes: 'Not in current assessment scope.',
  });
  map.push({
    category: 'Community / Experience Cloud',
    coverage: 'Not Extracted',
    notes: 'Not in current assessment scope.',
  });
  map.push({
    category: 'Permission Sets / Profiles (FLS)',
    coverage: 'Not Extracted',
    notes: 'Counts extracted. Field-level access not extracted.',
  });

  return map;
}
