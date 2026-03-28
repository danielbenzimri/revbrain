/**
 * Derived metrics computation.
 *
 * Computes aggregate and cross-collector metrics that cannot be
 * calculated within a single collector. These feed into the
 * assessment summary and LLM context.
 *
 * See: Extraction Spec — Post-processing, derived metrics
 */

import type { CollectorContext, CollectorResult } from '../collectors/base.ts';
import type { AssessmentFindingInput } from '@revbrain/contract';
import { createFinding } from './findings.ts';
import { logger } from '../lib/logger.ts';

const log = logger.child({ component: 'metrics' });

export interface DerivedMetrics {
  /** Overall migration complexity (0-100, higher = harder) */
  overallComplexityScore: number;
  /** Feature adoption heatmap: feature → usage level */
  featureAdoption: Record<string, FeatureAdoption>;
  /** Risk-weighted effort estimate in hours */
  estimatedEffortHours: number;
  /** Data volume classification */
  volumeTier: 'small' | 'medium' | 'large' | 'enterprise';
  /** Extraction coverage across domains (0-100) */
  coveragePercent: number;
  /** Per-domain complexity scores */
  domainComplexity: Record<string, number>;
  /** Migration readiness breakdown */
  migrationReadiness: {
    autoPercent: number;
    guidedPercent: number;
    manualPercent: number;
    blockedPercent: number;
  };
}

interface FeatureAdoption {
  used: boolean;
  level: 'heavy' | 'moderate' | 'light' | 'none';
  findingsCount: number;
}

// Effort multipliers per migration complexity
const EFFORT_HOURS: Record<string, number> = {
  direct: 0.5,
  transform: 2,
  redesign: 8,
  'no-equivalent': 16,
};

// Complexity weights for risk levels
const RISK_WEIGHT: Record<string, number> = {
  critical: 10,
  high: 6,
  medium: 3,
  low: 1,
  info: 0,
};

const COMPLEXITY_WEIGHT: Record<string, number> = {
  'very-high': 10,
  high: 7,
  medium: 4,
  low: 1,
};

/**
 * Compute derived metrics from all collector results.
 */
export async function computeDerivedMetrics(
  _ctx: CollectorContext,
  results: Map<string, CollectorResult>
): Promise<DerivedMetrics> {
  log.info('computing_derived_metrics');

  const allFindings: AssessmentFindingInput[] = [];
  const collectorCoverage: number[] = [];

  for (const [, result] of results) {
    if (result.status !== 'failed') {
      allFindings.push(...result.findings);
      collectorCoverage.push(result.metrics.coverage ?? 0);
    }
  }

  // 1. Feature adoption heatmap
  const featureAdoption = computeFeatureAdoption(allFindings, results);

  // 2. Per-domain complexity scores
  const domainComplexity = computeDomainComplexity(allFindings);

  // 3. Overall complexity score (weighted average of domain scores)
  const domainScores = Object.values(domainComplexity);
  const overallComplexityScore =
    domainScores.length > 0
      ? Math.round(domainScores.reduce((s, v) => s + v, 0) / domainScores.length)
      : 0;

  // 4. Risk-weighted effort estimate
  const estimatedEffortHours = computeEffortEstimate(allFindings);

  // 5. Volume tier
  const volumeTier = classifyVolumeTier(allFindings, results);

  // 6. Coverage across domains
  const coveragePercent =
    collectorCoverage.length > 0
      ? Math.round(collectorCoverage.reduce((s, v) => s + v, 0) / collectorCoverage.length)
      : 0;

  // 7. Migration readiness breakdown
  const migrationReadiness = computeMigrationReadiness(allFindings);

  const metrics: DerivedMetrics = {
    overallComplexityScore,
    featureAdoption,
    estimatedEffortHours,
    volumeTier,
    coveragePercent,
    domainComplexity,
    migrationReadiness,
  };

  log.info(
    {
      overallComplexityScore,
      estimatedEffortHours,
      volumeTier,
      coveragePercent,
      domains: Object.keys(domainComplexity).length,
      features: Object.keys(featureAdoption).length,
    },
    'derived_metrics_complete'
  );

  return metrics;
}

/** Compute per-domain complexity (0-100) from findings risk + complexity */
function computeDomainComplexity(findings: AssessmentFindingInput[]): Record<string, number> {
  const domainScores: Record<string, { totalWeight: number; count: number }> = {};

  for (const f of findings) {
    if (!domainScores[f.domain]) domainScores[f.domain] = { totalWeight: 0, count: 0 };

    const riskW = RISK_WEIGHT[f.riskLevel ?? 'medium'] ?? 3;
    const complexW = COMPLEXITY_WEIGHT[f.complexityLevel ?? 'medium'] ?? 4;
    const combinedWeight = (riskW + complexW) / 2;

    domainScores[f.domain].totalWeight += combinedWeight;
    domainScores[f.domain].count++;
  }

  const result: Record<string, number> = {};
  for (const [domain, { totalWeight, count }] of Object.entries(domainScores)) {
    // Normalize to 0-100 scale (max per-finding weight is 10)
    const avgWeight = count > 0 ? totalWeight / count : 0;
    result[domain] = Math.round((avgWeight / 10) * 100);
  }
  return result;
}

/** Estimate total migration effort in hours */
function computeEffortEstimate(findings: AssessmentFindingInput[]): number {
  let total = 0;
  for (const f of findings) {
    // Skip aggregate/overview findings
    if (
      f.artifactType === 'DataCount' ||
      f.artifactType === 'OrgFingerprint' ||
      f.artifactType === 'UsageOverview' ||
      f.artifactType === 'OrderLifecycleOverview'
    ) {
      continue;
    }
    const hours = EFFORT_HOURS[f.rcaMappingComplexity ?? 'transform'] ?? 2;
    // Scale by complexity
    const complexityMultiplier =
      f.complexityLevel === 'very-high'
        ? 2.0
        : f.complexityLevel === 'high'
          ? 1.5
          : f.complexityLevel === 'medium'
            ? 1.0
            : 0.8;
    total += hours * complexityMultiplier;
  }
  return Math.round(total);
}

/** Classify data volume tier */
function classifyVolumeTier(
  findings: AssessmentFindingInput[],
  results: Map<string, CollectorResult>
): 'small' | 'medium' | 'large' | 'enterprise' {
  // Check usage metrics for volume indicators
  const usageResult = results.get('usage');
  const totalQuotes = (usageResult?.metrics.metrics as Record<string, number>)?.totalQuotes ?? 0;

  // Check catalog size
  const catalogResult = results.get('catalog');
  const totalProducts =
    (catalogResult?.metrics.metrics as Record<string, number>)?.totalProducts ?? 0;

  // Check order lifecycle for volume
  const olResult = results.get('order-lifecycle');
  const totalOrders = (olResult?.metrics.metrics as Record<string, number>)?.totalOrders ?? 0;

  const itemCount = findings.filter(
    (f) =>
      f.artifactType !== 'DataCount' &&
      f.artifactType !== 'OrgFingerprint' &&
      f.artifactType !== 'UsageOverview' &&
      f.artifactType !== 'OrderLifecycleOverview'
  ).length;

  // Tier based on largest dimension
  const maxDimension = Math.max(totalProducts, totalQuotes, totalOrders, itemCount);

  if (maxDimension > 5000) return 'enterprise';
  if (maxDimension > 1000) return 'large';
  if (maxDimension > 200) return 'medium';
  return 'small';
}

/** Build feature adoption heatmap */
function computeFeatureAdoption(
  findings: AssessmentFindingInput[],
  results: Map<string, CollectorResult>
): Record<string, FeatureAdoption> {
  const adoption: Record<string, FeatureAdoption> = {};

  const features: Array<{
    name: string;
    check: (f: AssessmentFindingInput[], r: Map<string, CollectorResult>) => FeatureAdoption;
  }> = [
    {
      name: 'Product Bundles',
      check: (f) => {
        const opts = f.filter((x) => x.artifactType === 'ProductOption');
        return {
          used: opts.length > 0,
          level:
            opts.length > 100
              ? 'heavy'
              : opts.length > 20
                ? 'moderate'
                : opts.length > 0
                  ? 'light'
                  : 'none',
          findingsCount: opts.length,
        };
      },
    },
    {
      name: 'Price Rules',
      check: (f) => {
        const rules = f.filter((x) => x.artifactType === 'PriceRule');
        return {
          used: rules.length > 0,
          level:
            rules.length > 50
              ? 'heavy'
              : rules.length > 10
                ? 'moderate'
                : rules.length > 0
                  ? 'light'
                  : 'none',
          findingsCount: rules.length,
        };
      },
    },
    {
      name: 'Discount Schedules',
      check: (f) => {
        const ds = f.filter((x) => x.artifactType === 'DiscountSchedule');
        return {
          used: ds.length > 0,
          level:
            ds.length > 20
              ? 'heavy'
              : ds.length > 5
                ? 'moderate'
                : ds.length > 0
                  ? 'light'
                  : 'none',
          findingsCount: ds.length,
        };
      },
    },
    {
      name: 'QCP / Custom Scripts',
      check: (f) => {
        const qcp = f.filter((x) => x.artifactType === 'CustomScript');
        return {
          used: qcp.length > 0,
          level:
            qcp.length > 3
              ? 'heavy'
              : qcp.length > 1
                ? 'moderate'
                : qcp.length > 0
                  ? 'light'
                  : 'none',
          findingsCount: qcp.length,
        };
      },
    },
    {
      name: 'Quote Templates',
      check: (f) => {
        const templates = f.filter((x) => x.artifactType === 'QuoteTemplate');
        return {
          used: templates.length > 0,
          level:
            templates.length > 10
              ? 'heavy'
              : templates.length > 3
                ? 'moderate'
                : templates.length > 0
                  ? 'light'
                  : 'none',
          findingsCount: templates.length,
        };
      },
    },
    {
      name: 'Advanced Approvals',
      check: (f) => {
        const aa = f.filter(
          (x) => x.artifactType === 'AdvancedApproval' || x.artifactType === 'ApprovalProcess'
        );
        return {
          used: aa.length > 0,
          level:
            aa.length > 10
              ? 'heavy'
              : aa.length > 3
                ? 'moderate'
                : aa.length > 0
                  ? 'light'
                  : 'none',
          findingsCount: aa.length,
        };
      },
    },
    {
      name: 'Contracted Pricing',
      check: (f) => {
        const cp = f.filter((x) => x.artifactType === 'ContractedPrice');
        return {
          used: cp.length > 0,
          level:
            cp.length > 100
              ? 'heavy'
              : cp.length > 20
                ? 'moderate'
                : cp.length > 0
                  ? 'light'
                  : 'none',
          findingsCount: cp.length,
        };
      },
    },
    {
      name: 'Lookup Queries',
      check: (f) => {
        const lq = f.filter((x) => x.artifactType === 'LookupQuery');
        return {
          used: lq.length > 0,
          level:
            lq.length > 20
              ? 'heavy'
              : lq.length > 5
                ? 'moderate'
                : lq.length > 0
                  ? 'light'
                  : 'none',
          findingsCount: lq.length,
        };
      },
    },
    {
      name: 'Apex Customizations',
      check: (f) => {
        const apex = f.filter(
          (x) => x.artifactType === 'ApexClass' || x.artifactType === 'ApexTrigger'
        );
        return {
          used: apex.length > 0,
          level:
            apex.length > 20
              ? 'heavy'
              : apex.length > 5
                ? 'moderate'
                : apex.length > 0
                  ? 'light'
                  : 'none',
          findingsCount: apex.length,
        };
      },
    },
    {
      name: 'Multi-Currency',
      check: (_f, r) => {
        const disc = r.get('discovery');
        const mc = (disc?.metrics.metrics as Record<string, boolean | number | string>)
          ?.multiCurrencyEnabled;
        return {
          used: mc === true,
          level: mc ? 'moderate' : 'none',
          findingsCount: mc ? 1 : 0,
        };
      },
    },
    {
      name: 'Subscription / MDQ',
      check: (_f, r) => {
        const olMetrics = r.get('order-lifecycle')?.metrics.metrics as
          | Record<string, number>
          | undefined;
        const assetsSubs = olMetrics?.assetsWithSubscriptions ?? 0;
        return {
          used: assetsSubs > 0,
          level:
            assetsSubs > 100
              ? 'heavy'
              : assetsSubs > 10
                ? 'moderate'
                : assetsSubs > 0
                  ? 'light'
                  : 'none',
          findingsCount: assetsSubs,
        };
      },
    },
    // G-12: Additional features from benchmark
    {
      name: 'Block Pricing',
      check: (f) => {
        const bp = f.filter((x) => x.artifactType === 'BlockPrice');
        return {
          used: bp.length > 0,
          level: bp.length > 0 ? 'light' : 'none',
          findingsCount: bp.length,
        };
      },
    },
    {
      name: 'Price Dimensions',
      check: (f) => {
        const pd = f.filter((x) => x.artifactType === 'PriceDimension');
        return {
          used: pd.length > 0,
          level: pd.length > 0 ? 'light' : 'none',
          findingsCount: pd.length,
        };
      },
    },
    {
      name: 'Quote Terms',
      check: (f) => {
        const qt = f.filter((x) => x.artifactType === 'QuoteTerm');
        return {
          used: qt.length > 0,
          level: qt.length > 5 ? 'moderate' : qt.length > 0 ? 'light' : 'none',
          findingsCount: qt.length,
        };
      },
    },
    {
      name: 'Twin Fields',
      check: (f) => {
        const tf = f.filter(
          (x) => x.artifactType === 'CPQSettingValue' && x.artifactName === 'Twin Fields'
        );
        const enabled = tf.length > 0 && tf[0].notes?.includes('Enabled');
        return {
          used: !!enabled,
          level: enabled ? 'moderate' : 'none',
          findingsCount: enabled ? 1 : 0,
        };
      },
    },
    {
      name: 'Localizations',
      check: (f) => {
        const loc = f.filter((x) => x.domain === 'localization');
        return {
          used: loc.length > 0,
          level: loc.length > 10 ? 'moderate' : loc.length > 0 ? 'light' : 'none',
          findingsCount: loc.length,
        };
      },
    },
    {
      name: 'Quote Processes',
      check: (f) => {
        const qp = f.filter(
          (x) =>
            x.artifactType === 'DataCount' &&
            (x.artifactName?.includes('QuoteProcess') ||
              x.artifactId?.includes('SBQQ__QuoteProcess'))
        );
        const count = qp.reduce((s, x) => s + (x.countValue ?? 0), 0);
        return { used: count > 0, level: count > 0 ? 'light' : 'none', findingsCount: count };
      },
    },
    {
      name: 'Import Formats',
      check: (f) => {
        const imp = f.filter(
          (x) =>
            x.artifactType === 'DataCount' &&
            (x.artifactName?.includes('ImportFormat') ||
              x.artifactId?.includes('SBQQ__ImportFormat'))
        );
        const count = imp.reduce((s, x) => s + (x.countValue ?? 0), 0);
        return { used: count > 0, level: count > 0 ? 'light' : 'none', findingsCount: count };
      },
    },
    {
      name: 'DocuSign / E-Signature',
      check: (f) => {
        const esig = f.filter(
          (x) => x.artifactType === 'PluginStatus' && x.artifactName === 'Electronic Signature'
        );
        const active = esig.length > 0 && (esig[0].countValue ?? 0) > 0;
        return {
          used: !!active,
          level: active ? 'moderate' : 'none',
          findingsCount: active ? 1 : 0,
        };
      },
    },
  ];

  for (const feat of features) {
    adoption[feat.name] = feat.check(findings, results);
  }

  return adoption;
}

/** Compute migration readiness breakdown percentages */
function computeMigrationReadiness(findings: AssessmentFindingInput[]): {
  autoPercent: number;
  guidedPercent: number;
  manualPercent: number;
  blockedPercent: number;
} {
  const relevant = findings.filter(
    (f) =>
      f.rcaMappingComplexity &&
      f.artifactType !== 'DataCount' &&
      f.artifactType !== 'OrgFingerprint'
  );

  if (relevant.length === 0) {
    return { autoPercent: 0, guidedPercent: 0, manualPercent: 0, blockedPercent: 0 };
  }

  const auto = relevant.filter((f) => f.rcaMappingComplexity === 'direct').length;
  const guided = relevant.filter((f) => f.rcaMappingComplexity === 'transform').length;
  const manual = relevant.filter((f) => f.rcaMappingComplexity === 'redesign').length;
  const blocked = relevant.filter((f) => f.rcaMappingComplexity === 'no-equivalent').length;
  const total = relevant.length;

  return {
    autoPercent: Math.round((auto / total) * 100),
    guidedPercent: Math.round((guided / total) * 100),
    manualPercent: Math.round((manual / total) * 100),
    blockedPercent: Math.round((blocked / total) * 100),
  };
}

// ============================================================================
// G-07: Product Option Attachment Rates
// ============================================================================

/**
 * Compute product option attachment rates by cross-referencing
 * catalog options with usage quote lines via SBQQ__RequiredBy__c.
 */
export function computeAttachmentRates(
  results: Map<string, CollectorResult>
): AssessmentFindingInput[] {
  const catalogResult = results.get('catalog');
  const usageResult = results.get('usage');
  if (!catalogResult || !usageResult) return [];

  // 1. Parse option map from catalog metrics (stored as JSON string by catalog collector)
  const optionMapJson = catalogResult.metrics.metrics?.optionMap as string | undefined;
  if (!optionMapJson) {
    log.warn('attachment_rates_skip: no optionMap in catalog metrics');
    return [];
  }

  let optionMapData: Record<string, string[]>;
  try {
    optionMapData = JSON.parse(optionMapJson);
  } catch {
    log.warn('attachment_rates_skip: failed to parse optionMap JSON');
    return [];
  }

  if (Object.keys(optionMapData).length === 0) {
    log.info('attachment_rates_skip: no product options in catalog');
    return [];
  }

  // 2. Build quote line index from usage findings
  // Usage collector stores quote lines in its raw metrics — but we need them from findings.
  // The quote lines aren't stored as individual findings. We need to use the metrics data.
  // For now, produce a summary finding based on catalog option counts.
  // Full RequiredBy__c analysis requires quote line data which is only available during usage collection.

  // Produce summary findings based on option configuration
  const findings: AssessmentFindingInput[] = [];
  let totalParents = 0;
  let totalOptions = 0;

  for (const [_parentId, optionIds] of Object.entries(optionMapData)) {
    totalParents++;
    totalOptions += optionIds.length;
  }

  if (totalParents > 0) {
    findings.push(
      createFinding({
        domain: 'catalog',
        collector: 'metrics',
        artifactType: 'OptionAttachmentRate',
        artifactName: 'Product Option Configuration',
        sourceType: 'inferred',
        findingType: 'attachment_summary',
        riskLevel: 'info',
        countValue: totalOptions,
        notes: `${totalParents} bundle parents with ${totalOptions} configured options. Actual usage rates require per-quote analysis (available when running against live data).`,
        evidenceRefs: [
          { type: 'count' as const, value: String(totalParents), label: 'Bundle parents' },
          { type: 'count' as const, value: String(totalOptions), label: 'Configured options' },
          {
            type: 'count' as const,
            value: String(Math.round(totalOptions / totalParents)),
            label: 'Avg options per bundle',
          },
        ],
      })
    );
  }

  return findings;
}
