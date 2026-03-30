/**
 * Transform API findings into AssessmentData shape for the dashboard.
 *
 * This bridges the gap between the server API response (flat findings list)
 * and the UI's AssessmentData structure (domain-organized with stats).
 *
 * Updated: Ensures UI has ALL data the PDF report has, plus more.
 * See: docs/CPQ-REPORT-REDLINE-ANALYSIS.md
 */

import type { AssessmentData, DomainId } from '../mocks/assessment-mock-data';
import type { AssessmentFindingResponse, AssessmentRunResponse } from '../hooks/use-assessment-run';

type MigrationStatus = 'auto' | 'guided' | 'manual' | 'blocked';
type Complexity = 'low' | 'moderate' | 'high';

const DOMAIN_MAPPING: Record<string, DomainId> = {
  catalog: 'products',
  pricing: 'pricing',
  dependency: 'code',
  customization: 'rules',
  templates: 'documents',
  approvals: 'approvals',
  integration: 'integrations',
  usage: 'dataReporting',
  'order-lifecycle': 'amendments',
  localization: 'dataReporting',
  settings: 'dataReporting',
};

const AGGREGATE_TYPES = new Set([
  'DataCount',
  'OrgFingerprint',
  'UsageOverview',
  'OrderLifecycleOverview',
  'CPQSettingValue',
  'PluginStatus',
  'UserAdoption',
  'UserBehavior',
  'DiscountDistribution',
  'PriceOverrideAnalysis',
  'ConversionSegment',
  'TrendIndicator',
  'DataQualityFlag',
  'ComplexityHotspot',
  'ExtractionConfidence',
  'ObjectInventoryItem',
  'CPQReport',
  'OptionAttachmentRate',
  'FieldCompleteness',
  'TopQuotedProduct',
  'PermissionSet',
  'Document',
  'LanguageTranslation',
  'LocalizationSummary',
]);

function mapMigrationStatus(rca: string | null): MigrationStatus {
  if (rca === 'direct') return 'auto';
  if (rca === 'transform') return 'guided';
  if (rca === 'redesign') return 'manual';
  if (rca === 'no-equivalent') return 'blocked';
  return 'guided';
}

function mapComplexity(level: string | null): Complexity {
  if (level === 'very-high' || level === 'high') return 'high';
  if (level === 'medium') return 'moderate';
  return 'low';
}

type EvidenceRef = { type?: string; value?: string; label?: string };

/** Safe evidence ref accessor */
function getRef(refs: unknown[] | null | undefined, label: string): string | undefined {
  if (!refs) return undefined;
  return (refs as EvidenceRef[]).find((r) => r.label === label)?.value;
}

/**
 * Convert API findings into the AssessmentData shape the UI expects.
 * Returns null if findings are empty or insufficient.
 */
export function transformFindingsToAssessmentData(
  findings: AssessmentFindingResponse[],
  runStatus: AssessmentRunResponse
): AssessmentData | null {
  if (!findings || findings.length < 10) return null;

  // ── Reusable lookups ──
  const qcpScripts = findings.filter(
    (f) => f.artifactType === 'SBQQ__CustomScript__c' || f.artifactType === 'CustomScript'
  );
  const priceRuleFindings = findings.filter(
    (f) => f.artifactType === 'PriceRule' || f.artifactType === 'SBQQ__PriceRule__c'
  );
  const activePriceRules = priceRuleFindings.filter(
    (f) => f.usageLevel !== 'dormant' && !f.notes?.includes('Inactive')
  ).length;
  const totalQuotes =
    findings.find(
      (f) =>
        f.artifactType === 'DataCount' &&
        f.artifactName?.toLowerCase().replace(/\s/g, '').includes('quote') &&
        !f.artifactName?.toLowerCase().includes('line')
    )?.countValue ?? 0;

  // ── Group findings by UI domain ──
  const domainFindings = new Map<DomainId, AssessmentFindingResponse[]>();
  const domainItemCounts: Record<string, number> = {};
  for (const f of findings) {
    const uiDomain = DOMAIN_MAPPING[f.domain] ?? 'dataReporting';
    if (!domainFindings.has(uiDomain)) domainFindings.set(uiDomain, []);
    domainFindings.get(uiDomain)!.push(f);
    if (!AGGREGATE_TYPES.has(f.artifactType)) {
      domainItemCounts[uiDomain] = (domainItemCounts[uiDomain] ?? 0) + 1;
    }
  }

  const domainOrder: DomainId[] = [
    'products',
    'pricing',
    'rules',
    'code',
    'integrations',
    'amendments',
    'approvals',
    'documents',
    'dataReporting',
  ];

  let totalItems = 0;
  let totalAuto = 0;
  let totalGuided = 0;
  let totalManual = 0;
  let totalBlocked = 0;

  const domains = domainOrder.map((id) => {
    const df = domainFindings.get(id) ?? [];
    const items = df
      .filter((f) => !AGGREGATE_TYPES.has(f.artifactType))
      .map((f, i) => {
        const migrationStatus = mapMigrationStatus(f.rcaMappingComplexity);
        const complexity = mapComplexity(f.complexityLevel);
        return {
          id: f.artifactId ?? `${id}-${i}`,
          name: f.artifactName ?? 'Unknown',
          apiName: f.artifactType ? `${f.artifactType}:${f.artifactId ?? i}` : `${id}-${i}`,
          complexity,
          migrationStatus,
          triageState: 'untriaged' as const,
          rcaTarget: f.rcaTargetConcept ?? null,
          rcaTooltip: f.notes ?? null,
          whyStatus: f.notes ?? `${f.riskLevel ?? 'medium'} risk`,
          aiDescription: f.textValue
            ? `Source: ${f.textValue.slice(0, 200)}...`
            : (f.notes ?? 'Extracted from Salesforce CPQ.'),
          dependencies: [] as string[],
          isActive: f.migrationRelevance !== 'optional',
          lastModified: f.createdAt,
          linesOfCode: f.countValue ?? null,
          estimatedHours: null as number | null,
        };
      });

    const stats = {
      total: items.length,
      auto: items.filter((i) => i.migrationStatus === 'auto').length,
      guided: items.filter((i) => i.migrationStatus === 'guided').length,
      manual: items.filter((i) => i.migrationStatus === 'manual').length,
      blocked: items.filter((i) => i.migrationStatus === 'blocked').length,
      highComplexity: items.filter((i) => i.complexity === 'high').length,
    };

    totalItems += stats.total;
    totalAuto += stats.auto;
    totalGuided += stats.guided;
    totalManual += stats.manual;
    totalBlocked += stats.blocked;

    return {
      id,
      labelKey: `assessment.tabs.${id}`,
      complexity: (stats.highComplexity > stats.total * 0.3
        ? 'high'
        : stats.highComplexity > 0
          ? 'moderate'
          : 'low') as Complexity,
      stats,
      items,
      insights: [] as string[],
      subTabs: [] as Array<{ id: string; labelKey: string; itemCount: number }>,
    };
  });

  // ── Risks from high/critical findings ──
  const risks = findings
    .filter((f) => f.riskLevel === 'critical' || f.riskLevel === 'high')
    .slice(0, 20)
    .map((f, i) => ({
      id: `risk-${i}`,
      description: f.notes ?? `${f.artifactName}: ${f.riskLevel} risk`,
      category: f.domain === 'pricing' ? ('technical' as const) : ('business' as const),
      severity: f.riskLevel === 'critical' ? ('critical' as const) : ('high' as const),
      likelihood: f.riskLevel === 'critical' ? 5 : 4,
      impact: f.riskLevel === 'critical' ? 5 : 4,
      affectedItems: [f.artifactName],
      affectedDomains: [DOMAIN_MAPPING[f.domain] ?? 'dataReporting'] as DomainId[],
      mitigation:
        f.rcaMappingComplexity === 'redesign'
          ? 'Requires full redesign for RCA.'
          : 'Review and transform for RCA compatibility.',
      owner: null as string | null,
    }));

  // ── Key Findings ──
  const hotspots = findings.filter((f) => f.artifactType === 'ComplexityHotspot');
  const keyFindings = [
    ...(qcpScripts.length > 0
      ? [
          {
            id: 'kf-qcp',
            text: `Custom Quote Calculator Plugin (QCP) detected: ${qcpScripts.length} script(s). JavaScript-based pricing logic fundamentally changes the complexity profile.`,
            severity: 'warning' as const,
          },
        ]
      : []),
    ...(priceRuleFindings.length > 0
      ? [
          {
            id: 'kf-rules',
            text: `${activePriceRules} active price rules detected. Heavy rule density indicates significant business logic in CPQ configuration.`,
            severity: 'success' as const,
          },
        ]
      : []),
    ...hotspots.slice(0, 3).map((h, i) => ({
      id: `kf-hotspot-${i}`,
      text: `${h.artifactName}: ${h.notes ?? ''}`,
      severity: (h.riskLevel === 'critical' ? 'error' : 'warning') as 'error' | 'warning',
    })),
  ];

  // ── Org Health ──
  const orgFp = findings.find((f) => f.artifactType === 'OrgFingerprint');
  const userAdoption = findings.find((f) => f.artifactType === 'UserAdoption');
  const cpqLicenses = Number(getRef(userAdoption?.evidenceRefs, 'CPQ Licenses') ?? 0);
  const orgEdition = orgFp?.notes?.match(/(\w+ Edition)/)?.[1] ?? 'Enterprise Edition';

  // ── Domain Insights ──
  for (const domain of domains) {
    const domainInsights: string[] = [];
    if (domain.id === 'products') {
      const familyCount = new Set(
        findings
          .filter((f) => f.artifactType === 'Product2')
          .map(
            (f) =>
              (f.evidenceRefs as EvidenceRef[])?.find((r) => r.value === 'Product2.Family')?.label
          )
          .filter(Boolean)
      ).size;
      if (familyCount > 0) domainInsights.push(`${familyCount} product families detected.`);
    }
    if (domain.id === 'pricing' && qcpScripts.length > 0) {
      domainInsights.push(
        `${qcpScripts.length} Custom Script(s) (QCP) inject JavaScript into pricing calculations.`
      );
    }
    if (domain.id === 'approvals' && domain.stats.total > 0) {
      domainInsights.push(`${domain.stats.total} custom approval actions configured.`);
    }
    if (domain.id === 'code') {
      const triggerCtrl = findings.filter(
        (f) => f.artifactType === 'ApexClass' && f.notes?.includes('TriggerControl')
      ).length;
      if (triggerCtrl > 0)
        domainInsights.push(`${triggerCtrl} classes use TriggerControl pattern.`);
    }
    domain.insights = domainInsights;
  }

  // ── Completeness from domain counts ──
  const completeness = Object.entries(domainItemCounts).map(([id, count]) => ({
    category: id,
    items: count,
    coverage: count > 5 ? 100 : count > 0 ? 75 : 0,
  }));

  // ══════════════════════════════════════════════════════════════
  // CPQ Intelligence data — matches everything the PDF has + more
  // ══════════════════════════════════════════════════════════════

  // Settings Panel
  const settingsPanel = findings
    .filter((f) => f.artifactType === 'CPQSettingValue')
    .map((f) => ({
      setting: f.artifactName,
      value: (f.evidenceRefs as EvidenceRef[])?.[0]?.label ?? 'Unknown',
      notes: f.notes ?? '',
    }));

  // Plugin Inventory (with QCP + Rec Products override)
  const pluginInventory = findings
    .filter((f) => f.artifactType === 'PluginStatus')
    .map((f) => {
      const isQcp = f.artifactName?.includes('QCP') || f.artifactName?.includes('Calculator');
      const qcpOverride = isQcp && (f.countValue ?? 0) === 0 && qcpScripts.length > 0;
      const isRecProducts = f.artifactName?.includes('Recommended');
      const recApex = isRecProducts
        ? findings.find(
            (a) => a.artifactType === 'ApexClass' && /ProductRecommendation/i.test(a.artifactName)
          )
        : null;
      const recOverride = isRecProducts && (f.countValue ?? 0) === 0 && recApex;
      return {
        plugin: f.artifactName,
        status:
          qcpOverride || recOverride
            ? 'Active'
            : (f.countValue ?? 0) > 0
              ? 'Active'
              : 'Not Configured',
        notes: qcpOverride
          ? `Active — ${qcpScripts.length} custom script(s) detected`
          : recOverride
            ? `Active — Apex implementation: ${recApex.artifactName}`
            : (f.notes ?? ''),
      };
    });

  // Complexity Hotspots
  const complexityHotspots = hotspots.map((h) => ({
    name: h.artifactName,
    severity: h.riskLevel ?? 'medium',
    analysis: h.notes ?? '',
  }));

  // Top Quoted Products (with category + percentQuotes from PDF)
  const topProducts = findings
    .filter((f) => f.artifactType === 'TopQuotedProduct')
    .map((f) => {
      const count = f.countValue ?? 0;
      const denom = totalQuotes > 0 ? totalQuotes : 1;
      const pct =
        denom < 10
          ? `${Math.round((count / denom) * 100)}% (${count} of ${denom})`
          : `${Math.round((count / denom) * 100)}%`;
      return {
        name: f.artifactName,
        category:
          (f.evidenceRefs as EvidenceRef[])?.find((r) => r.value === 'Product2.Family')?.label ??
          'Unknown',
        quotedCount: count,
        percentQuotes: pct,
      };
    });

  // Conversion Segments
  const conversionSegments = findings
    .filter((f) => f.artifactType === 'ConversionSegment')
    .map((s) => ({
      segment: s.artifactName,
      percentQuotes: Number(getRef(s.evidenceRefs, '% of quotes') ?? 0),
      percentRevenue: Number(getRef(s.evidenceRefs, '% of revenue') ?? 0),
      conversionRate: Number(getRef(s.evidenceRefs, 'conversion %') ?? 0),
    }));

  // User Behavior
  const userBehavior = findings
    .filter((f) => f.artifactType === 'UserBehavior')
    .map((u) => ({
      profile: u.artifactName,
      users: u.countValue ?? 0,
      percentQuotes: Number(getRef(u.evidenceRefs, '% of quotes') ?? 0),
      conversionRate: Number(getRef(u.evidenceRefs, 'Conversion %') ?? 0),
      notes: u.notes ?? '',
    }));

  // Discount Distribution
  const discountDistFinding = findings.find((f) => f.artifactType === 'DiscountDistribution');
  const discountBuckets = (discountDistFinding?.evidenceRefs as EvidenceRef[] | undefined) ?? [];
  const totalDiscounted = discountBuckets.reduce((s, r) => s + Number(r.value ?? 0), 0);
  const discountDistribution = {
    totalDiscounted,
    avgPercent: 0,
    buckets: discountBuckets.map((r) => ({
      range: r.label ?? '',
      count: Number(r.value ?? 0),
      percent: totalDiscounted > 0 ? Math.round((Number(r.value ?? 0) / totalDiscounted) * 100) : 0,
    })),
  };

  // Data Quality Flags (matches UI field names: check, count, status, notes)
  const dataQualityFlags = findings
    .filter((f) => f.artifactType === 'DataQualityFlag')
    .map((f) => ({
      check: f.artifactName,
      count: f.countValue ?? 0,
      status: ((f.countValue ?? 0) > 0
        ? 'flagged'
        : f.countValue === null
          ? 'not_assessed'
          : 'clean') as string,
      notes: f.notes ?? '',
    }));

  // CPQ Reports
  const cpqReports = findings
    .filter((f) => f.artifactType === 'CPQReport')
    .map((r) => ({
      name: r.artifactName,
      notes: r.notes ?? '',
    }));

  // Object Inventory (from ObjectInventoryItem findings)
  const objectInventory = findings
    .filter((f) => f.artifactType === 'ObjectInventoryItem')
    .map((f) => ({
      objectName: f.artifactName,
      count: f.countValue ?? 0,
      complexity: f.complexityLevel ?? 'low',
    }));

  // Permission Sets
  const permissionSets = findings
    .filter((f) => f.artifactType === 'PermissionSet')
    .map((f) => ({
      name: f.artifactName,
      type: f.notes?.includes('Custom') ? 'Custom' : 'Managed',
    }));

  // Price Override Analysis
  const overrideFinding = findings.find((f) => f.artifactType === 'PriceOverrideAnalysis');
  const priceOverrides = overrideFinding
    ? {
        count: overrideFinding.countValue ?? 0,
        rate: Number(getRef(overrideFinding.evidenceRefs, 'Override rate %') ?? 0),
        revenueImpact: Number(getRef(overrideFinding.evidenceRefs, 'Revenue impact $') ?? 0),
      }
    : undefined;

  // Trend Indicators
  const trendIndicators = findings
    .filter((f) => f.artifactType === 'TrendIndicator')
    .map((t) => ({
      metric: t.artifactName,
      value: t.countValue ?? 0,
      trend: getRef(t.evidenceRefs, 'Trend') ?? 'Stable',
    }));

  return {
    projectId: runStatus.projectId,
    domains,
    risks,
    keyFindings,
    runs: [
      {
        id: runStatus.runId,
        number: 1,
        completedAt: runStatus.completedAt ?? new Date().toISOString(),
        itemsScanned: totalItems,
        duration: (runStatus.durationMs ?? 0) / 1000,
      },
    ],
    currentRunIndex: 0,
    runDelta: { added: totalItems, removed: 0, changed: 0, details: [] },
    orgHealth: {
      edition: orgEdition,
      apiUsagePercent: 0,
      storageUsagePercent: 0,
      apexGovernorPercent: 0,
      cpqLicenseCount: cpqLicenses,
      rcaLicenseCount: 0,
      hasSalesforceBilling: false,
      billingObjectCount: 0,
    },
    completeness,
    totalItems,
    totalAuto,
    totalGuided,
    totalManual,
    totalBlocked,
    // CPQ Intelligence data — consumed by CPQIntelligence component
    settingsPanel,
    pluginInventory,
    complexityHotspots,
    topProducts,
    conversionSegments,
    userBehavior,
    discountDistribution,
    dataQualityFlags,
    cpqReports,
    objectInventory,
    permissionSets,
    priceOverrides,
    trendIndicators,
  } as AssessmentData;
}
