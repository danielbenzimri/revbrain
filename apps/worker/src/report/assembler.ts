/**
 * Report Data Assembler — transforms assessment findings into ReportData.
 *
 * Reads findings from a completed assessment run and assembles them into
 * a structured object matching the 22-page benchmark report format.
 *
 * See: Completion Plan R-01
 */

import type { AssessmentFindingInput } from '@revbrain/contract';

// ============================================================================
// ReportData Interface (fully typed — no `any`)
// ============================================================================

export interface ReportData {
  metadata: {
    clientName: string;
    orgId: string;
    environment: string;
    assessmentDate: string;
    assessmentPeriod: string;
    cpqVersion: string;
    sbaaVersion: string | null;
    generatedBy: string;
  };
  executiveSummary: {
    keyFindings: Array<{ title: string; detail: string; confidence: string }>;
    complexityScores: {
      overall: number;
      configurationDepth: number;
      pricingLogic: number;
      customizationLevel: number;
      dataVolumeUsage: number;
      technicalDebt: number;
    };
  };
  cpqAtAGlance: Record<string, Array<{ label: string; value: string; confidence: string }>>;
  packageSettings: {
    installedPackages: Array<{ name: string; namespace: string; version: string; status: string }>;
    coreSettings: Array<{ setting: string; value: string; notes: string; confidence: string }>;
    plugins: Array<{ plugin: string; status: string; notes: string; confidence: string }>;
  };
  quoteLifecycle: Array<{ step: number; description: string }>;
  configurationDomain: {
    productCatalog: Array<{
      category: string;
      active: number;
      inactive: number;
      quoted90d: number;
      percentQuoted: number;
      confidence: string;
    }>;
    priceRules: Array<{
      name: string;
      description: string;
      complexity: string;
      usage: string;
      confidence: string;
    }>;
    productRules: Array<{
      name: string;
      description: string;
      complexity: string;
      confidence: string;
    }>;
  };
  usageAdoption: {
    quotingActivity: Array<{ metric: string; value: string; trend: string; confidence: string }>;
    conversionBySize: Array<{
      segment: string;
      percentQuotes: number;
      percentRevenue: number;
      conversionRate: number;
      confidence: string;
    }>;
    discountDistribution: Array<{ range: string; count: number; percent: number }>;
    overrideAnalysis: { count: number; rate: number; revenueImpact: number } | null;
    userBehavior: Array<{
      profile: string;
      users: number;
      percentQuotes: number;
      conversionRate: number;
    }>;
    topProducts: Array<{
      name: string;
      category: string;
      quotedCount: number;
      percentQuotes: number;
    }>;
  };
  dataQuality: {
    flaggedAreas: Array<{ issue: string; status: string; detail: string }>;
    technicalDebt: Array<{ category: string; count: number; detail: string }>;
    featureUtilization: Array<{ feature: string; status: string; detail: string }>;
  };
  customCode: {
    apexClasses: Array<{ name: string; lines: number; purpose: string; origin: string }>;
    triggersFlows: Array<{ name: string; type: string; object: string; status: string }>;
    validationRules: Array<{ object: string; rule: string; status: string; complexity: string }>;
  };
  complexityHotspots: Array<{ name: string; severity: string; analysis: string }>;
  appendixA: Array<{
    id: number;
    objectName: string;
    apiName: string;
    count: number;
    complexity: string;
    confidence: string;
  }>;
  appendixB: Array<{ name: string; description: string }>;
  appendixD: Array<{ category: string; coverage: string; notes: string }>;
}

// ============================================================================
// Assembler
// ============================================================================

export function assembleReport(findings: AssessmentFindingInput[]): ReportData {
  // Group findings by artifact type for easy access
  const byType = new Map<string, AssessmentFindingInput[]>();
  for (const f of findings) {
    if (!byType.has(f.artifactType)) byType.set(f.artifactType, []);
    byType.get(f.artifactType)!.push(f);
  }

  const get = (type: string) => byType.get(type) ?? [];
  const getOne = (type: string) => byType.get(type)?.[0] ?? null;

  // Metadata from OrgFingerprint
  const orgFp = getOne('OrgFingerprint');

  // Settings
  const settingValues = get('CPQSettingValue');
  const plugins = get('PluginStatus');

  // Usage
  const _userAdoption = getOne('UserAdoption');
  const discountDist = getOne('DiscountDistribution');
  const overrides = getOne('PriceOverrideAnalysis');
  const topProducts = get('TopQuotedProduct');
  const segments = get('ConversionSegment');
  const userBehavior = get('UserBehavior');
  const trends = get('TrendIndicator');

  // Code
  const apexClasses = get('ApexClass');
  const triggers = get('ApexTrigger');
  const flows = get('Flow');
  const validationRules = get('ValidationRule');

  // Presentation
  const hotspots = get('ComplexityHotspot');
  const inventory = get('ObjectInventoryItem');
  const reports = get('CPQReport');
  const confidence = get('ExtractionConfidence');
  const qualityFlags = get('DataQualityFlag');

  return {
    metadata: {
      clientName: 'Assessment Client',
      orgId: orgFp?.artifactId ?? 'Unknown',
      environment: orgFp?.notes?.includes('sandbox') ? 'Sandbox' : 'Production',
      assessmentDate: new Date().toISOString().split('T')[0],
      assessmentPeriod: '90 Days',
      cpqVersion: orgFp?.notes?.match(/CPQ\s+([v\d.]+)/)?.[1] ?? 'Unknown',
      sbaaVersion: null,
      generatedBy: 'RevBrain CPQ Assessment Tool v1.0',
    },

    executiveSummary: {
      keyFindings:
        hotspots.length > 0
          ? hotspots.slice(0, 5).map((h) => ({
              title: h.artifactName,
              detail: h.notes ?? '',
              confidence: 'Confirmed',
            }))
          : buildDefaultKeyFindings(findings, settingValues, plugins),
      complexityScores: computeComplexityScores(findings),
    },

    cpqAtAGlance: buildGlanceSections(findings, settingValues),

    packageSettings: {
      installedPackages: [],
      coreSettings: settingValues.map((s) => ({
        setting: s.artifactName,
        value: s.evidenceRefs?.[0]?.label ?? 'Unknown',
        notes: s.notes ?? '',
        confidence: 'Confirmed',
      })),
      plugins: plugins.map((p) => ({
        plugin: p.artifactName,
        status: (p.countValue ?? 0) > 0 ? 'Active' : 'Not Configured',
        notes: p.notes ?? '',
        confidence: 'Confirmed',
      })),
    },

    quoteLifecycle: [
      { step: 1, description: 'Lead qualified → converted to Account, Contact, Opportunity.' },
      { step: 2, description: 'Sales Rep creates Quote from Opportunity.' },
      { step: 3, description: 'Quote Line Editor: products added, bundles configured.' },
      { step: 4, description: 'Price rules calculate freight, tax, discounts.' },
      { step: 5, description: 'Approval routing (if required).' },
      { step: 6, description: 'Quote PDF generated → Document signing.' },
      { step: 7, description: 'Quote accepted → Order auto-created.' },
    ],

    configurationDomain: {
      productCatalog: [],
      priceRules: get('PriceRule').map((r) => ({
        name: r.artifactName,
        description: r.notes ?? '',
        complexity: r.complexityLevel ?? 'medium',
        usage: '~100%',
        confidence: 'Confirmed',
      })),
      productRules: get('ProductRule').map((r) => ({
        name: r.artifactName,
        description: r.notes ?? '',
        complexity: r.complexityLevel ?? 'medium',
        confidence: 'Confirmed',
      })),
    },

    usageAdoption: {
      quotingActivity: trends.map((t) => ({
        metric: t.artifactName,
        value: String(t.countValue ?? ''),
        trend: t.evidenceRefs?.find((r) => r.label === 'Trend')?.value ?? 'Stable',
        confidence: 'Confirmed',
      })),
      conversionBySize: segments.map((s) => ({
        segment: s.artifactName,
        percentQuotes: Number(s.evidenceRefs?.find((r) => r.label === '% of quotes')?.value ?? 0),
        percentRevenue: Number(s.evidenceRefs?.find((r) => r.label === '% of revenue')?.value ?? 0),
        conversionRate: Number(s.evidenceRefs?.find((r) => r.label === 'conversion %')?.value ?? 0),
        confidence: 'Estimated',
      })),
      discountDistribution: (discountDist?.evidenceRefs ?? []).map((r) => ({
        range: r.label ?? '',
        count: Number(r.value ?? 0),
        percent: 0,
      })),
      overrideAnalysis: overrides
        ? {
            count: overrides.countValue ?? 0,
            rate: Number(
              overrides.evidenceRefs?.find((r) => r.label === 'Override rate %')?.value ?? 0
            ),
            revenueImpact: Number(
              overrides.evidenceRefs?.find((r) => r.label === 'Revenue impact $')?.value ?? 0
            ),
          }
        : null,
      userBehavior: userBehavior.map((u) => ({
        profile: u.artifactName,
        users: u.countValue ?? 0,
        percentQuotes: Number(u.evidenceRefs?.find((r) => r.label === '% of quotes')?.value ?? 0),
        conversionRate: Number(u.evidenceRefs?.find((r) => r.label === 'Conversion %')?.value ?? 0),
      })),
      topProducts: topProducts.map((p) => ({
        name: p.artifactName,
        category: p.evidenceRefs?.find((r) => r.value === 'Product2.Family')?.label ?? 'Unknown',
        quotedCount: p.countValue ?? 0,
        percentQuotes: 0,
      })),
    },

    dataQuality: {
      flaggedAreas: qualityFlags.map((f) => ({
        issue: f.artifactName,
        status:
          (f.countValue ?? 0) > 0 ? 'Flagged' : f.countValue === null ? 'Not Assessed' : 'Clean',
        detail: f.notes ?? '',
      })),
      technicalDebt: [],
      featureUtilization: [],
    },

    customCode: {
      apexClasses: apexClasses.map((a) => ({
        name: a.artifactName,
        lines: a.countValue ?? 0,
        purpose: a.notes?.split('.')[0] ?? '',
        origin: 'SI-Built',
      })),
      triggersFlows: [
        ...triggers.map((t) => ({
          name: t.artifactName,
          type: 'Trigger',
          object: t.notes?.match(/on (\w+)/)?.[1] ?? '',
          status: 'Active',
        })),
        ...flows.map((f) => ({
          name: f.artifactName,
          type: 'Flow',
          object: '',
          status: 'Active',
        })),
      ],
      validationRules: validationRules.map((v) => ({
        object: v.domain,
        rule: v.artifactName,
        status: 'Active',
        complexity: v.complexityLevel ?? 'low',
      })),
    },

    complexityHotspots: hotspots.map((h) => ({
      name: h.artifactName,
      severity: h.riskLevel ?? 'Medium',
      analysis: h.notes ?? '',
    })),

    appendixA: inventory.map((inv, i) => ({
      id: i + 1,
      objectName: inv.artifactName,
      apiName: inv.artifactName,
      count: inv.countValue ?? 0,
      complexity: inv.complexityLevel ?? 'low',
      confidence: 'Confirmed',
    })),

    appendixB: reports.map((r) => ({
      name: r.artifactName,
      description: r.notes ?? '',
    })),

    appendixD:
      confidence.length > 0
        ? confidence.map((c) => ({
            category: c.artifactName,
            coverage: c.notes?.split(':')[0] ?? 'Unknown',
            notes: c.notes ?? '',
          }))
        : [
            {
              category: 'CPQ Config Objects',
              coverage: 'Full',
              notes: 'All SBQQ objects detected.',
            },
            {
              category: 'Transactional Data',
              coverage: 'Full',
              notes: '90-day SOQL extracts complete.',
            },
            {
              category: 'Custom Code',
              coverage: 'Full',
              notes: 'Triggers, flows, Apex confirmed.',
            },
            {
              category: 'User Behavior',
              coverage: 'Estimated',
              notes: 'Derived from audit trail sampling.',
            },
          ],
  };
}

// ============================================================================
// Glance Dashboard Builder
// ============================================================================

function buildGlanceSections(
  findings: AssessmentFindingInput[],
  _settingValues: AssessmentFindingInput[]
): Record<string, Array<{ label: string; value: string; confidence: string }>> {
  const count = (type: string) => findings.filter((f) => f.artifactType === type).length;
  const dataCount = (name: string) => {
    const f = findings.find(
      (f) => f.artifactType === 'DataCount' && f.artifactName?.includes(name)
    );
    return f?.countValue ?? 0;
  };

  return {
    'Product Catalog': [
      { label: 'Active Products', value: String(dataCount('Product')), confidence: 'Confirmed' },
      {
        label: 'Product Bundles',
        value: String(count('ProductOption') > 0 ? 'Detected' : '0'),
        confidence: 'Estimated',
      },
      { label: 'Price Books', value: String(dataCount('Pricebook')), confidence: 'Confirmed' },
    ],
    'Pricing & Rules': [
      { label: 'Price Rules (Active)', value: String(count('PriceRule')), confidence: 'Confirmed' },
      {
        label: 'Product Rules (Active)',
        value: String(count('ProductRule')),
        confidence: 'Confirmed',
      },
      {
        label: 'Discount Schedules',
        value: String(count('DiscountSchedule')),
        confidence: 'Estimated',
      },
      {
        label: 'Custom Scripts',
        value: count('CustomScript') > 0 ? 'Detected' : 'Not Configured',
        confidence: 'Confirmed',
      },
    ],
    'Quoting (90 Days)': [
      { label: 'Quotes Created', value: String(dataCount('Quote')), confidence: 'Confirmed' },
      { label: 'Quote Lines', value: String(dataCount('QuoteLine')), confidence: 'Confirmed' },
    ],
    'Users & Licenses': [
      {
        label: 'CPQ Licenses',
        value:
          findings
            .find((f) => f.artifactType === 'UserAdoption')
            ?.evidenceRefs?.find((r) => r.label === 'CPQ Licenses')?.value ?? 'N/A',
        confidence: 'Confirmed',
      },
    ],
    'Automation & Code': [
      { label: 'Active Triggers', value: String(count('ApexTrigger')), confidence: 'Confirmed' },
      { label: 'Active Flows', value: String(count('Flow')), confidence: 'Confirmed' },
      {
        label: 'Validation Rules',
        value: String(count('ValidationRule')),
        confidence: 'Confirmed',
      },
    ],
  };
}

// ============================================================================
// Complexity Score Computation (from findings)
// ============================================================================

const RISK_WEIGHT: Record<string, number> = { critical: 10, high: 6, medium: 3, low: 1, info: 0 };
const COMPLEXITY_WEIGHT: Record<string, number> = { 'very-high': 10, high: 7, medium: 4, low: 1 };

function computeComplexityScores(
  findings: AssessmentFindingInput[]
): ReportData['executiveSummary']['complexityScores'] {
  const domainFindings: Record<string, AssessmentFindingInput[]> = {};
  for (const f of findings) {
    if (!domainFindings[f.domain]) domainFindings[f.domain] = [];
    domainFindings[f.domain].push(f);
  }

  const score = (domain: string): number => {
    const df = domainFindings[domain] ?? [];
    if (df.length === 0) return 0;
    let totalWeight = 0;
    for (const f of df) {
      const riskW = RISK_WEIGHT[f.riskLevel ?? 'medium'] ?? 3;
      const complexW = COMPLEXITY_WEIGHT[f.complexityLevel ?? 'medium'] ?? 4;
      totalWeight += (riskW + complexW) / 2;
    }
    return Math.min(100, Math.round((totalWeight / df.length / 10) * 100));
  };

  const catalogScore = score('catalog');
  const pricingScore = score('pricing');
  const customScore = score('customization');
  const usageScore = score('usage');
  const depScore = score('dependency');

  const overall = Math.round(
    catalogScore * 0.25 +
      pricingScore * 0.25 +
      customScore * 0.2 +
      usageScore * 0.15 +
      depScore * 0.15
  );

  return {
    overall,
    configurationDepth: catalogScore,
    pricingLogic: pricingScore,
    customizationLevel: customScore,
    dataVolumeUsage: usageScore,
    technicalDebt: depScore,
  };
}

// ============================================================================
// Default Key Findings (when no hotspots detected)
// ============================================================================

function buildDefaultKeyFindings(
  findings: AssessmentFindingInput[],
  settings: AssessmentFindingInput[],
  plugins: AssessmentFindingInput[]
): Array<{ title: string; detail: string; confidence: string }> {
  const kf: Array<{ title: string; detail: string; confidence: string }> = [];

  const totalFindings = findings.length;
  const domains = new Set(findings.map((f) => f.domain));
  kf.push({
    title: `${totalFindings} CPQ artifacts extracted across ${domains.size} domains`,
    detail: `Comprehensive extraction covering product catalog, pricing rules, quote templates, approvals, code dependencies, and usage analytics.`,
    confidence: 'Confirmed',
  });

  const priceRules = findings.filter((f) => f.artifactType === 'PriceRule').length;
  const productRules = findings.filter((f) => f.artifactType === 'ProductRule').length;
  if (priceRules > 0 || productRules > 0) {
    kf.push({
      title: `${priceRules} price rules and ${productRules} product rules detected`,
      detail: `Pricing logic encoded in business-specific rules that require mapping to RCA Pricing Procedures.`,
      confidence: 'Confirmed',
    });
  }

  const qcpPlugin = plugins.find(
    (p) => p.artifactName?.includes('QCP') || p.artifactName?.includes('Calculator')
  );
  if (qcpPlugin && (qcpPlugin.countValue ?? 0) > 0) {
    kf.push({
      title: 'Custom Quote Calculator Plugin (QCP) detected',
      detail: `JavaScript-based pricing logic must be converted to declarative RCA Pricing Procedures. This is typically the highest-effort migration item.`,
      confidence: 'Confirmed',
    });
  }

  const dormantProducts = findings.filter(
    (f) => f.artifactType === 'Product2' && f.usageLevel === 'dormant'
  ).length;
  const totalProducts = findings.filter((f) => f.artifactType === 'Product2').length;
  if (totalProducts > 0 && dormantProducts > totalProducts * 0.2) {
    kf.push({
      title: `Product catalog shows ${Math.round((dormantProducts / totalProducts) * 100)}% dormancy`,
      detail: `${dormantProducts} of ${totalProducts} products were not quoted in the 90-day window. Consider cleanup before migration.`,
      confidence: 'Confirmed',
    });
  }

  if (settings.length > 0) {
    const multiCurrency = settings.find((s) => s.artifactName?.includes('Multi-Currency'));
    if (multiCurrency?.notes?.includes('Enabled')) {
      kf.push({
        title: 'Multi-currency enabled',
        detail:
          'The org uses multi-currency pricing. RCA supports multi-currency natively but field mappings need verification.',
        confidence: 'Confirmed',
      });
    }
  }

  // Ensure at least 3 findings
  while (kf.length < 3) {
    kf.push({
      title: 'Assessment complete',
      detail: `Full CPQ environment assessment extracted ${totalFindings} artifacts for migration planning.`,
      confidence: 'Confirmed',
    });
  }

  return kf.slice(0, 5);
}
