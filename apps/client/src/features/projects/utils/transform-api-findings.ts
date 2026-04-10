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
  const keyFindings: Array<{
    id: string;
    text: string;
    severity: 'success' | 'warning' | 'error';
    domain: DomainId | null;
  }> = [
    ...(qcpScripts.length > 0
      ? [
          {
            id: 'kf-qcp',
            // Dev Spec §5.4.3 / PDF V30: Show exactly ONE configured QCP name — never
            // concatenate all CustomScript records. Additional scripts are reported separately.
            text: `Custom Quote Calculator Plugin (QCP) active: ${qcpScripts[0].artifactName}. Configured QCP injects JavaScript-based pricing logic into every calculation — indicating a fundamentally different complexity profile than standard CPQ configuration.${
              qcpScripts.length > 1
                ? ` ${qcpScripts.length - 1} additional custom script(s) detected — see the Code domain for full inventory.`
                : ''
            }`,
            severity: 'warning' as const,
            domain: 'pricing' as DomainId,
          },
        ]
      : []),
    ...(priceRuleFindings.length > 0
      ? [
          {
            id: 'kf-rules',
            text: `${activePriceRules} active price rules detected. Heavy rule density indicates significant business logic in CPQ configuration.`,
            severity: 'success' as const,
            domain: 'pricing' as DomainId,
          },
        ]
      : []),
    ...(() => {
      // Multi-currency finding — include ISO code list if available
      const multi = findings.find(
        (f) => f.artifactType === 'CPQSettingValue' && f.artifactName?.includes('Multi-Currency')
      );
      if (!multi?.notes?.includes('Enabled')) return [];
      const match = multi.notes.match(/\(([^)]+)\)/);
      const refs = multi.evidenceRefs as EvidenceRef[] | undefined;
      const codes =
        refs
          ?.filter((r) => /^[A-Z]{3}$/.test(String(r.value ?? r.label ?? '')))
          .map((r) => String(r.value ?? r.label))
          .join(', ') ??
        match?.[1] ??
        '';
      return [
        {
          id: 'kf-multicurrency',
          text: codes
            ? `Multi-currency enabled (${codes}). The org uses multi-currency pricing — adding complexity to field mapping, exchange rate handling, and multi-currency price book structures.`
            : 'Multi-currency enabled. The org uses multi-currency pricing — adding complexity to field mapping, exchange rate handling, and multi-currency price book structures.',
          severity: 'warning' as const,
          domain: null as DomainId | null,
        },
      ];
    })(),
    ...hotspots.slice(0, 3).map((h, i) => ({
      id: `kf-hotspot-${i}`,
      text: `${h.artifactName}: ${h.notes ?? ''}`,
      severity: (h.riskLevel === 'critical' ? 'error' : 'warning') as 'error' | 'warning',
      domain: null as DomainId | null,
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
    id,
    labelKey: id,
    completed: count > 0,
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
      fieldRef: f.sourceRef ?? f.artifactName,
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
      notes: u.notes ?? '',
      evidenceRefs: (u.evidenceRefs ?? []) as Array<{ type: string; value: string; label: string }>,
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

  // ══════════════════════════════════════════════════════════════
  // V3 PDF parity: Feature utilization, dormant families,
  // discount schedule dedup, low-volume warnings, scoring
  // ══════════════════════════════════════════════════════════════

  // Feature Utilization (5-level model from PDF data quality section)
  const featureUtilization: Array<{ feature: string; status: string; detail: string }> = [];
  // Guided Selling
  const guidedSellingFlows = findings.filter(
    (f) => f.artifactType === 'GuidedSellingProcess' || f.artifactType === 'GuidedSelling'
  );
  featureUtilization.push({
    feature: 'Guided Selling',
    status: guidedSellingFlows.length > 0 ? 'Active' : 'Not Used',
    detail:
      guidedSellingFlows.length > 0
        ? `${guidedSellingFlows.length} process(es) detected`
        : 'No guided selling processes found',
  });
  // QCP (custom scripts)
  featureUtilization.push({
    feature: 'Custom Quote Calculator (QCP)',
    status: qcpScripts.length > 0 ? 'Active' : 'Not Used',
    detail:
      qcpScripts.length > 0
        ? `${qcpScripts.length} script(s) inject JS into pricing`
        : 'No QCP scripts detected',
  });
  // Advanced Approvals
  const advancedApprovalRules = findings.filter(
    (f) => f.artifactType === 'AdvancedApprovalRule' || f.artifactType === 'sbaa__ApprovalRule__c'
  );
  featureUtilization.push({
    feature: 'Advanced Approvals (sbaa)',
    status: advancedApprovalRules.length > 0 ? 'Active' : 'Not Used',
    detail:
      advancedApprovalRules.length > 0
        ? `${advancedApprovalRules.length} rule(s) configured`
        : 'sbaa package not detected or no rules configured',
  });
  // Multi-Dimensional Quoting
  const mdqProducts = findings.filter(
    (f) => f.notes?.includes('MDQ') || f.notes?.includes('multi-dimensional')
  );
  featureUtilization.push({
    feature: 'Multi-Dimensional Quoting (MDQ)',
    status: mdqProducts.length > 0 ? 'Active' : 'Not Used',
    detail:
      mdqProducts.length > 0
        ? `${mdqProducts.length} MDQ-related item(s) detected`
        : 'No MDQ configuration detected',
  });
  // Contracted Pricing
  const contractedPricing = findings.filter(
    (f) => f.artifactType === 'ContractedPrice' || f.artifactType === 'SBQQ__ContractedPrice__c'
  );
  featureUtilization.push({
    feature: 'Contracted Pricing',
    status: contractedPricing.length > 0 ? 'Active' : 'Not Used',
    detail:
      contractedPricing.length > 0
        ? `${contractedPricing.length} contracted price record(s)`
        : 'No contracted pricing data found',
  });

  // Dormant Product Families — families with 0 quoting in 90 days
  const productFindings = findings.filter((f) => f.artifactType === 'Product2');
  const familyMap = new Map<string, { total: number; quoted: number }>();
  for (const p of productFindings) {
    const family =
      (p.evidenceRefs as EvidenceRef[])?.find((r) => r.value === 'Product2.Family')?.label ??
      'Uncategorized';
    if (!familyMap.has(family)) familyMap.set(family, { total: 0, quoted: 0 });
    const entry = familyMap.get(family)!;
    entry.total++;
    if ((p.countValue ?? 0) > 0) entry.quoted++;
  }
  const dormantFamilies = Array.from(familyMap.entries())
    .filter(([, v]) => v.quoted === 0 && v.total > 0)
    .map(([name, v]) => ({ name, productCount: v.total }));

  // Discount Schedule Dedup
  const discountSchedules = findings.filter(
    (f) => f.artifactType === 'DiscountSchedule' || f.artifactType === 'SBQQ__DiscountSchedule__c'
  );
  const scheduleNames = discountSchedules.map((d) => d.artifactName);
  const uniqueScheduleNames = new Set(scheduleNames);
  const duplicateCount = scheduleNames.length - uniqueScheduleNames.size;
  const discountScheduleDedup = {
    totalCount: scheduleNames.length,
    uniqueCount: uniqueScheduleNames.size,
    duplicateDetail:
      duplicateCount > 0
        ? `${duplicateCount} duplicate schedule name(s) detected — may indicate copy/paste or version drift`
        : 'No duplicates detected.',
  };

  // Low-volume warning
  const lowVolumeWarning =
    totalQuotes < 50
      ? `Low volume: only ${totalQuotes} quotes in the 90-day assessment window. Statistical breakdowns may not be representative.`
      : null;

  // Complexity Scores (computed from findings density)
  const configDepth = Math.min(
    100,
    Math.round(
      (priceRuleFindings.length * 3 +
        findings.filter(
          (f) => f.artifactType === 'ProductRule' || f.artifactType === 'SBQQ__ProductRule__c'
        ).length *
          2 +
        discountSchedules.length * 2 +
        productFindings.length * 0.2) *
        0.8
    )
  );
  const pricingLogic = Math.min(
    100,
    Math.round(
      (qcpScripts.length * 25 + priceRuleFindings.length * 4 + discountSchedules.length * 2) * 0.9
    )
  );
  const customLevel = Math.min(
    100,
    Math.round(
      findings.filter((f) => f.artifactType === 'ApexClass').length * 3 +
        findings.filter((f) => f.artifactType === 'ApexTrigger').length * 5 +
        findings.filter((f) => f.artifactType === 'Flow').length * 2 +
        qcpScripts.length * 15
    )
  );
  const dataVolUsage = Math.min(
    100,
    Math.round(
      totalQuotes * 0.15 +
        (findings.find(
          (f) => f.artifactType === 'DataCount' && f.artifactName?.includes('QuoteLine')
        )?.countValue ?? 0) *
          0.01
    )
  );
  const techDebt = Math.min(
    100,
    Math.round(
      dormantFamilies.length * 5 +
        duplicateCount * 10 +
        findings.filter(
          (f) =>
            f.notes?.toLowerCase().includes('inactive') || f.notes?.toLowerCase().includes('stale')
        ).length *
          3
    )
  );
  const overall = Math.round(
    configDepth * 0.25 +
      pricingLogic * 0.25 +
      customLevel * 0.2 +
      dataVolUsage * 0.15 +
      techDebt * 0.15
  );

  const complexityScores = {
    overall,
    configurationDepth: configDepth,
    pricingLogic,
    customizationLevel: customLevel,
    dataVolumeUsage: dataVolUsage,
    technicalDebt: techDebt,
  };

  // ══════════════════════════════════════════════════════════════
  // PDF V2.1 parity: sections the UI was missing until now.
  // Mirrors the logic in apps/worker/src/report/assembler.ts so a
  // user who looks at the UI sees everything the PDF has, plus more.
  // ══════════════════════════════════════════════════════════════

  // Shared helpers
  type CbCategory = 'NOT_USED' | 'SOMETIMES' | 'MOST_TIMES' | 'ALWAYS' | 'NOT_APPLICABLE';
  const getCbCategory = (count: number | null, total: number): CbCategory => {
    if (total === 0) return 'NOT_APPLICABLE';
    if (count === null || count === undefined) return 'NOT_APPLICABLE';
    const pct = (count / total) * 100;
    if (pct === 0) return 'NOT_USED';
    if (pct <= 50) return 'SOMETIMES';
    if (pct <= 95) return 'MOST_TIMES';
    return 'ALWAYS';
  };
  const dataCountByName = (needle: string): number => {
    const n = needle.toLowerCase().replace(/[\s_]/g, '');
    const f = findings.find(
      (x) =>
        x.artifactType === 'DataCount' &&
        x.artifactName?.toLowerCase().replace(/[\s_]/g, '').startsWith(n)
    );
    return f?.countValue ?? 0;
  };

  const activeProducts = productFindings.filter((p) => {
    const refs = p.evidenceRefs as EvidenceRef[] | undefined;
    const hasIsActiveTrue = refs?.some(
      (r) =>
        (String(r.value || '') === 'Product2.IsActive' && String(r.label || '') === 'true') ||
        (String(r.label || '') === 'IsActive' && String(r.value || '') === 'true')
    );
    return hasIsActiveTrue || p.usageLevel !== 'dormant';
  }).length;
  const activeProductCount = activeProducts > 0 ? activeProducts : productFindings.length;
  const bundleCapableCount = productFindings.filter((p) => {
    const refs = p.evidenceRefs as EvidenceRef[] | undefined;
    return refs?.some(
      (r) =>
        String(r.value || '').includes('ConfigurationType') &&
        (String(r.label || '') === 'Required' || String(r.label || '') === 'Allowed')
    );
  }).length;

  // ── Section 3: CPQ At A Glance ──
  const quoteLinesCount =
    findings.find(
      (f) => f.artifactType === 'DataCount' && f.artifactName?.toLowerCase().includes('quote line')
    )?.countValue ?? 0;
  const orderCount =
    findings.find(
      (f) => f.artifactType === 'DataCount' && f.artifactName?.toLowerCase().includes('order')
    )?.countValue ?? 0;
  const priceBookCount =
    findings.find(
      (f) => f.artifactType === 'DataCount' && f.artifactName?.toLowerCase().startsWith('pricebook')
    )?.countValue ?? 0;
  const productOptionsCount = dataCountByName('ProductOption');
  const configuredBundlesCount = dataCountByName('ConfiguredBundle');
  const configuredQcpName = qcpScripts.length > 0 ? qcpScripts[0].artifactName : null;

  const atAGlance: AssessmentData['atAGlance'] = {
    productCatalog: {
      activeProducts: activeProductCount,
      inactiveProducts: Math.max(0, productFindings.length - activeProductCount),
      bundleCapable: bundleCapableCount,
      productOptions: productOptionsCount,
      priceBooks: priceBookCount,
    },
    pricingRules: {
      priceRulesActive: activePriceRules,
      productRules: findings.filter(
        (f) => f.artifactType === 'ProductRule' || f.artifactType === 'SBQQ__ProductRule__c'
      ).length,
      discountSchedules: discountSchedules.length,
      customScripts: qcpScripts.length,
      configuredQcp: configuredQcpName,
    },
    quoting: {
      quotesCreated: totalQuotes,
      quoteLines: quoteLinesCount,
      avgLinesPerQuote: totalQuotes > 0 ? Math.round((quoteLinesCount / totalQuotes) * 10) / 10 : 0,
      activeUsers: cpqLicenses,
      ordersCreated: orderCount,
    },
    techDebt: {
      dormantProductsPercent:
        productFindings.length > 0
          ? `${Math.round(((productFindings.length - activeProductCount) / productFindings.length) * 100)}%`
          : '0%',
      inactiveRules:
        priceRuleFindings.filter((f) => f.notes?.toLowerCase().includes('inactive')).length +
        findings.filter(
          (f) =>
            (f.artifactType === 'ProductRule' || f.artifactType === 'SBQQ__ProductRule__c') &&
            f.notes?.toLowerCase().includes('inactive')
        ).length,
      staleRules: findings.filter((f) => f.notes?.toLowerCase().includes('stale')).length,
      duplicateSchedules: duplicateCount,
      orphanedRecords: dataCountByName('FeatureOrphan'),
    },
  };

  // ── Section 4.1: Installed Packages ──
  const installedPackages = findings
    .filter((f) => f.artifactType === 'InstalledPackage')
    .slice(0, 30)
    .map((f) => {
      const refs = f.evidenceRefs as EvidenceRef[] | undefined;
      const ns = refs?.find((r) => r.label === 'Namespace')?.value ?? '';
      const version = refs?.find((r) => r.label === 'Version')?.value ?? '';
      return {
        name: f.artifactName,
        namespace: ns,
        version,
        status: (f.countValue ?? 0) > 0 ? 'Active' : 'Installed',
      };
    });

  // ── Section 6.2: Product Deep Dive (curated, matches PDF) ──
  const utilFindings = findings.filter((f) => f.artifactType === 'ProductFieldUtilization');
  const findByField = (fieldName: string) =>
    utilFindings.find((f) => f.artifactName === fieldName || f.textValue === fieldName);
  const enumValueCount = (fieldName: string, enumValue: string): number => {
    const f = findByField(fieldName);
    if (!f?.notes) return 0;
    const escaped = enumValue.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`(?:^|[,\\s:])${escaped}\\s*\\((\\d+)\\)`, 'i');
    const m = f.notes.match(re);
    return m ? Number(m[1]) : 0;
  };

  type PddFieldRow = NonNullable<AssessmentData['productDeepDive']>['fieldUtilization'][number];
  const buildFieldRow = (
    label: string,
    count: number,
    notes: string,
    isNested = false
  ): PddFieldRow => ({
    label,
    count,
    percentage:
      activeProductCount > 0 ? `${Math.round((count / activeProductCount) * 100)}%` : '0%',
    category: getCbCategory(count, activeProductCount),
    notes,
    isNested,
  });

  let productDeepDive: AssessmentData['productDeepDive'] | undefined;
  if (utilFindings.length > 0 && activeProductCount > 0) {
    const fieldUtilization: PddFieldRow[] = [];
    const family = findByField('Family');
    if (family) {
      fieldUtilization.push(
        buildFieldRow('Product Family', family.countValue ?? 0, 'Categorization field')
      );
    }
    const pm = findByField('SBQQ__PricingMethod__c');
    if (pm) {
      fieldUtilization.push(
        buildFieldRow('Pricing Method', pm.countValue ?? 0, 'Field populated (see breakdown below)')
      );
      for (const method of ['List', 'Cost', 'Block', 'Percent of Total']) {
        fieldUtilization.push(
          buildFieldRow(
            `→ ${method}`,
            enumValueCount('SBQQ__PricingMethod__c', method),
            method === 'List'
              ? 'Standard'
              : method === 'Cost'
                ? 'Margin calculations'
                : method === 'Block'
                  ? 'Tiered pricing'
                  : 'Line dependencies',
            true
          )
        );
      }
    }
    const priceEdit = findByField('SBQQ__PriceEditable__c');
    if (priceEdit)
      fieldUtilization.push(
        buildFieldRow('Price Editable', priceEdit.countValue ?? 0, 'Can bypass approvals')
      );
    const dsField = findByField('SBQQ__DiscountSchedule__c');
    if (dsField)
      fieldUtilization.push(
        buildFieldRow('Discount Schedule', dsField.countValue ?? 0, 'Volume / term discounts')
      );
    const st = findByField('SBQQ__SubscriptionType__c');
    if (st) {
      fieldUtilization.push(
        buildFieldRow(
          'Subscription Type',
          st.countValue ?? 0,
          'Field populated (see breakdown below)'
        )
      );
      for (const sub of ['One-time', 'Renewable', 'Evergreen']) {
        fieldUtilization.push(
          buildFieldRow(
            `→ ${sub}`,
            enumValueCount('SBQQ__SubscriptionType__c', sub),
            sub === 'Evergreen' ? '⚠ High complexity' : sub === 'Renewable' ? 'Renewable term' : '',
            true
          )
        );
      }
    }
    const billing = findByField('blng__BillingRule__c');
    if (billing)
      fieldUtilization.push(
        buildFieldRow('Billing Rule', billing.countValue ?? 0, 'Salesforce Billing integration')
      );
    const excl = findByField('SBQQ__ExcludeFromOpportunity__c');
    if (excl)
      fieldUtilization.push(
        buildFieldRow('Exclude From Opp', excl.countValue ?? 0, 'Quote value ≠ Opportunity value')
      );
    const renewal = findByField('SBQQ__RenewalProduct__c');
    if (renewal)
      fieldUtilization.push(
        buildFieldRow('Renewal Product', renewal.countValue ?? 0, 'Product swap on renewal')
      );

    const pricingMethodDistribution = ['List', 'Cost', 'Block', 'Percent of Total'].map(
      (method) => {
        const count = enumValueCount('SBQQ__PricingMethod__c', method);
        return {
          method,
          count,
          percentOfActive:
            activeProductCount > 0 ? `${Math.round((count / activeProductCount) * 100)}%` : '0%',
          complexity: method === 'Percent of Total' ? 'High' : method === 'List' ? 'Low' : 'Medium',
        };
      }
    );
    const subscriptionProfile = ['One-time', 'Renewable', 'Evergreen'].map((type) => {
      const count = enumValueCount('SBQQ__SubscriptionType__c', type);
      return {
        type,
        count,
        percentOfActive:
          activeProductCount > 0 ? `${Math.round((count / activeProductCount) * 100)}%` : '0%',
        notes: type === 'Evergreen' ? '⚠ High complexity' : '',
      };
    });

    productDeepDive = {
      summary: {
        activeProducts: activeProductCount,
        inactiveProducts: Math.max(0, productFindings.length - activeProductCount),
        bundleCapable: bundleCapableCount,
        priceBooks: priceBookCount,
        dormantPercent:
          productFindings.length > 0
            ? `${Math.round(((productFindings.length - activeProductCount) / productFindings.length) * 100)}%`
            : '0%',
      },
      fieldUtilization,
      pricingMethodDistribution,
      subscriptionProfile,
      denominator: activeProductCount,
    };
  }

  // ── Section 6.6: Bundles & Options Deep Dive ──
  let bundlesDeepDive: AssessmentData['bundlesDeepDive'] | undefined;
  if (productOptionsCount > 0) {
    const featuresDataCount = findings.find(
      (f) => f.artifactType === 'DataCount' && f.artifactName === 'Features'
    );
    const totalFeatures = featuresDataCount?.countValue ?? 0;
    const productsWithFeatures = Number(
      (featuresDataCount?.evidenceRefs as EvidenceRef[] | undefined)?.find(
        (r) => r.label === 'ProductsWithFeatures'
      )?.value ?? 0
    );
    const featureOrphans = dataCountByName('FeatureOrphan');
    const optionConstraints = dataCountByName('OptionConstraint');
    const optionalFor = dataCountByName('OptionalFor');
    const nestedBundles = dataCountByName('NestedBundle');
    const configAttrs = findings.filter(
      (f) =>
        f.artifactType === 'ConfigurationAttribute' ||
        f.artifactType === 'SBQQ__ConfigurationAttribute__c'
    ).length;

    type RouRow = NonNullable<
      AssessmentData['bundlesDeepDive']
    >['relatedObjectUtilization'][number];
    const rou: RouRow[] = [
      {
        label: 'Features',
        count: totalFeatures,
        percentage:
          activeProductCount > 0 && productsWithFeatures > 0
            ? `${Math.round((productsWithFeatures / activeProductCount) * 100)}%`
            : null,
        category: getCbCategory(productsWithFeatures, activeProductCount),
        notes:
          totalFeatures > 0
            ? `${totalFeatures} features across ${productsWithFeatures} bundle-capable product(s)`
            : 'No features detected',
      },
      {
        label: 'Feature Orphans',
        count: featureOrphans,
        percentage:
          totalFeatures > 0 ? `${Math.round((featureOrphans / totalFeatures) * 100)}%` : null,
        category: getCbCategory(featureOrphans, totalFeatures > 0 ? totalFeatures : 1),
        notes:
          totalFeatures > 0
            ? `${featureOrphans} of ${totalFeatures} features not referenced by any option — tech debt`
            : 'Tech debt indicator',
      },
      {
        label: 'Bundle-capable Products',
        count: bundleCapableCount,
        percentage:
          activeProductCount > 0
            ? `${Math.round((bundleCapableCount / activeProductCount) * 100)}%`
            : null,
        category: getCbCategory(bundleCapableCount, activeProductCount),
        notes: `${configuredBundlesCount} configured bundles`,
      },
      {
        label: 'Nested Bundles',
        count: nestedBundles,
        percentage: null,
        category: getCbCategory(nestedBundles, bundleCapableCount > 0 ? bundleCapableCount : 1),
        notes: 'Options that are also bundles',
      },
      {
        label: 'Options',
        count: productOptionsCount,
        percentage: null,
        category: 'ALWAYS',
        notes: 'Total option records',
      },
      {
        label: 'Optional For',
        count: optionalFor,
        percentage:
          activeProductCount > 0
            ? `${Math.round((optionalFor / activeProductCount) * 100)}%`
            : null,
        category: getCbCategory(optionalFor, activeProductCount),
        notes: 'Products as options (API only)',
      },
      {
        label: 'Option Constraints',
        count: optionConstraints,
        percentage: null,
        category: optionConstraints > 0 ? 'ALWAYS' : 'NOT_USED',
        notes: '(API only)',
      },
    ];

    bundlesDeepDive = {
      summary: {
        bundleCapable: bundleCapableCount,
        configuredBundles: configuredBundlesCount,
        nestedBundles,
        avgOptionsPerBundle:
          configuredBundlesCount > 0
            ? (productOptionsCount / configuredBundlesCount).toFixed(1)
            : '0',
        totalOptions: productOptionsCount,
        optionsWithConstraintsPercent:
          productOptionsCount > 0
            ? `${Math.round((optionConstraints / productOptionsCount) * 100)}%`
            : '0%',
        configAttributesPercent:
          activeProductCount > 0
            ? `${Math.round((configAttrs / activeProductCount) * 100)}%`
            : '0%',
        configRulesPercent:
          activeProductCount > 0
            ? `${Math.round(
                (findings.filter(
                  (f) =>
                    (f.artifactType === 'ProductRule' ||
                      f.artifactType === 'SBQQ__ProductRule__c') &&
                    f.usageLevel !== 'dormant'
                ).length /
                  activeProductCount) *
                  100
              )}%`
            : '0%',
      },
      relatedObjectUtilization: rou,
      denominator: activeProductCount,
    };
  }

  // ── Section 7.1: 90-Day Quoting Activity ──
  const quotingActivity: AssessmentData['quotingActivity'] = {
    quotesCreated: totalQuotes,
    quoteLines: quoteLinesCount,
    ordersCreated: orderCount,
    avgLinesPerQuote: totalQuotes > 0 ? Math.round((quoteLinesCount / totalQuotes) * 10) / 10 : 0,
  };

  // ── Section 10: Related Functionality Detection ──
  const cleanFailureProse = (notes: string | null | undefined, fallback: string): string => {
    if (!notes) return fallback;
    const patterns = [
      /not accessible/i,
      /query failed/i,
      /may not be (enabled|queryable)/i,
      /detection failed/i,
    ];
    return patterns.some((p) => p.test(notes)) ? fallback : notes;
  };
  const expCloud = findings.find((f) => f.artifactType === 'ExperienceCloud');
  const billingPkg = findings.find(
    (f) => f.artifactType === 'BillingDetection' && f.artifactName === 'Salesforce Billing Package'
  );
  const namedCreds = findings.filter((f) => f.artifactType === 'NamedCredential');
  const platformEvents = findings.filter(
    (f) => f.artifactType === 'PlatformEvent' || f.artifactType === 'PlatformEventChannel'
  );
  const apexCallouts = findings.filter((f) => f.artifactType === 'ApexCallout');
  const taxCalc = findings.find((f) => f.artifactType === 'TaxCalculator');

  type RfItem = NonNullable<AssessmentData['relatedFunctionality']>['items'][number];
  const rfItems: RfItem[] = [
    {
      label: 'Experience Cloud',
      used: expCloud?.countValue != null && expCloud.countValue > 0,
      notes: cleanFailureProse(expCloud?.notes, 'Not detected'),
    },
    {
      label: 'Salesforce Billing',
      used: (billingPkg?.countValue ?? 0) > 0,
      notes: cleanFailureProse(billingPkg?.notes, 'Not detected'),
    },
    {
      label: 'Named Credentials',
      used: namedCreds.length > 0,
      notes: namedCreds.length > 0 ? `${namedCreds.length} detected` : 'Not detected',
    },
    {
      label: 'Platform Events',
      used: platformEvents.length > 0,
      notes: platformEvents.length > 0 ? `${platformEvents.length} CPQ-related` : 'Not detected',
    },
    {
      label: 'Apex Callouts',
      used: apexCallouts.length > 0,
      notes:
        apexCallouts.length > 0 ? `${apexCallouts.length} classes with callouts` : 'Not detected',
    },
    {
      label: 'Tax Calculator',
      used: (taxCalc?.countValue ?? 0) > 0,
      notes: cleanFailureProse(taxCalc?.notes, 'Not detected'),
    },
  ];
  const rfObservations: string[] = [];
  if (rfItems[0].used)
    rfObservations.push('Community presence detected — adds complexity to the CPQ environment.');
  if (rfItems[1].used)
    rfObservations.push(
      'Salesforce Billing active — invoice handling is part of the quote-to-cash flow.'
    );
  if (rfItems[2].used || rfItems[4].used)
    rfObservations.push('External dependencies detected — integration points require assessment.');
  const relatedFunctionality: AssessmentData['relatedFunctionality'] = {
    items: rfItems,
    observations: rfObservations,
  };

  const scoringMethodology = [
    {
      dimension: 'Configuration Depth',
      weight: 25,
      score: configDepth,
      drivers: 'Price rules, product rules, discount schedules, product catalog size',
      rationale: `${priceRuleFindings.length} price rules, ${discountSchedules.length} discount schedules, ${productFindings.length} products`,
    },
    {
      dimension: 'Pricing Logic',
      weight: 25,
      score: pricingLogic,
      drivers: 'QCP scripts, price rule complexity, discount structures',
      rationale:
        qcpScripts.length > 0
          ? `QCP active with ${qcpScripts.length} script(s) — highest pricing complexity factor`
          : `${activePriceRules} active price rules drive pricing complexity`,
    },
    {
      dimension: 'Customization Level',
      weight: 20,
      score: customLevel,
      drivers: 'Apex classes, triggers, flows referencing CPQ objects',
      rationale: `${findings.filter((f) => f.artifactType === 'ApexClass').length} Apex classes, ${findings.filter((f) => f.artifactType === 'ApexTrigger').length} triggers`,
    },
    {
      dimension: 'Data Volume & Usage',
      weight: 15,
      score: dataVolUsage,
      drivers: '90-day quoting volume, quote line density',
      rationale: `${totalQuotes} quotes in assessment window`,
    },
    {
      dimension: 'Technical Debt',
      weight: 15,
      score: techDebt,
      drivers: 'Dormant configs, duplicate rules, inactive items',
      rationale: `${dormantFamilies.length} dormant families, ${duplicateCount} duplicate schedules`,
    },
  ];

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
    // V3 PDF parity
    featureUtilization,
    dormantFamilies,
    discountScheduleDedup,
    lowVolumeWarning,
    scoringMethodology,
    complexityScores,
    // V2.1 PDF parity — sections missing from the UI until now
    atAGlance,
    installedPackages,
    productDeepDive,
    bundlesDeepDive,
    quotingActivity,
    relatedFunctionality,
  } as unknown as AssessmentData;
}
