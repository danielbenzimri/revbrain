/**
 * Transform API findings into AssessmentData shape for the dashboard.
 *
 * This bridges the gap between the server API response (flat findings list)
 * and the UI's AssessmentData structure (domain-organized with stats).
 *
 * See: Final Audit Step 5
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

/**
 * Convert API findings into the AssessmentData shape the UI expects.
 * Returns null if findings are empty or insufficient.
 */
export function transformFindingsToAssessmentData(
  findings: AssessmentFindingResponse[],
  runStatus: AssessmentRunResponse
): AssessmentData | null {
  if (!findings || findings.length < 10) return null;

  // Group findings by UI domain
  const domainFindings = new Map<DomainId, AssessmentFindingResponse[]>();
  for (const f of findings) {
    const uiDomain = DOMAIN_MAPPING[f.domain] ?? 'dataReporting';
    if (!domainFindings.has(uiDomain)) domainFindings.set(uiDomain, []);
    domainFindings.get(uiDomain)!.push(f);
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

  // Build risks from high/critical findings
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

  // Build key findings from hotspots or high-level observations
  const hotspots = findings.filter((f) => f.artifactType === 'ComplexityHotspot');
  const qcpScripts = findings.filter(
    (f) => f.artifactType === 'SBQQ__CustomScript__c' || f.artifactType === 'CustomScript'
  );
  const priceRuleFindings = findings.filter(
    (f) => f.artifactType === 'PriceRule' || f.artifactType === 'SBQQ__PriceRule__c'
  );
  const activePriceRules = priceRuleFindings.filter(
    (f) => f.usageLevel !== 'dormant' && !f.notes?.includes('Inactive')
  ).length;

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

  // Extract org health from OrgFingerprint and UserAdoption findings
  const orgFp = findings.find((f) => f.artifactType === 'OrgFingerprint');
  const userAdoption = findings.find((f) => f.artifactType === 'UserAdoption');
  const cpqLicenses = Number(
    (userAdoption?.evidenceRefs as Array<{ label?: string; value?: string }>)?.find(
      (r) => r.label === 'CPQ Licenses'
    )?.value ?? 0
  );
  const orgEdition = orgFp?.notes?.match(/(\w+ Edition)/)?.[1] ?? 'Enterprise Edition';

  // Domain insights from aggregate data
  const dataQualityFlags = findings.filter((f) => f.artifactType === 'DataQualityFlag');
  for (const domain of domains) {
    const domainInsights: string[] = [];
    if (domain.id === 'products') {
      const familyCount = new Set(
        findings
          .filter((f) => f.artifactType === 'Product2')
          .map(
            (f) =>
              (f.evidenceRefs as Array<{ value?: string; label?: string }>)?.find(
                (r) => r.value === 'Product2.Family'
              )?.label
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

  // Build completeness from extraction coverage
  const completeness = Object.entries(domainCounts).map(([id, count]) => ({
    category: id,
    items: count as number,
    coverage: (count as number) > 5 ? 100 : (count as number) > 0 ? 75 : 0,
  }));

  // CPQ Intelligence data
  const settingsPanel = findings
    .filter((f) => f.artifactType === 'CPQSettingValue')
    .map((f) => ({
      setting: f.artifactName,
      value: ((f.evidenceRefs as Array<{ label?: string }>)?.[0]?.label as string) ?? 'Unknown',
      notes: f.notes ?? '',
    }));

  const pluginInventory = findings
    .filter((f) => f.artifactType === 'PluginStatus')
    .map((f) => {
      // Apply QCP/Plugin override (same logic as assembler)
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

  const topProducts = findings
    .filter((f) => f.artifactType === 'TopQuotedProduct')
    .map((f) => ({
      name: f.artifactName,
      quotedCount: f.countValue ?? 0,
    }));

  const permissionSets = findings
    .filter((f) => f.artifactType === 'PermissionSet')
    .map((f) => ({
      name: f.artifactName,
      type: f.notes?.includes('Custom') ? 'Custom' : 'Managed',
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
    // CPQ Intelligence data (consumed by CPQIntelligence component)
    settingsPanel,
    pluginInventory,
    topProducts,
    permissionSets,
    dataQualityFlags: dataQualityFlags.map((f) => ({
      issue: f.artifactName,
      status: (f.countValue ?? 0) > 0 ? 'Flagged' : 'Clean',
      detail: f.notes ?? '',
    })),
  } as AssessmentData;
}
