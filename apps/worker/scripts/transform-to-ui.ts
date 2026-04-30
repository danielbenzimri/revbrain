#!/usr/bin/env npx tsx
/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Transform extraction results (assessment-results.json) into the format
 * expected by the Assessment Dashboard UI (assessment-mock-data.ts types).
 *
 * Reads: apps/worker/output/assessment-results.json
 * Writes: apps/worker/output/assessment-ui-data.json
 *
 * The output can be loaded directly by the UI as a replacement for mock data.
 *
 * Usage:
 *   npx tsx apps/worker/scripts/transform-to-ui.ts
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const inputPath = resolve(__dirname, '../output/assessment-results.json');
const outputPath = resolve(__dirname, '../output/assessment-ui-data.json');

// UI Types (matching assessment-mock-data.ts)
type MigrationStatus = 'auto' | 'guided' | 'manual' | 'blocked';
type Complexity = 'low' | 'moderate' | 'high';
type DomainId =
  | 'products'
  | 'pricing'
  | 'rules'
  | 'code'
  | 'integrations'
  | 'amendments'
  | 'approvals'
  | 'documents'
  | 'dataReporting';

interface AssessmentItem {
  id: string;
  name: string;
  apiName: string;
  complexity: Complexity;
  migrationStatus: MigrationStatus;
  triageState: string;
  rcaTarget: string | null;
  rcaTooltip: string | null;
  whyStatus: string;
  aiDescription: string;
  dependencies: string[];
  isActive: boolean;
  lastModified: string;
  linesOfCode: number | null;
  estimatedHours: number | null;
}

interface DomainStats {
  total: number;
  auto: number;
  guided: number;
  manual: number;
  blocked: number;
  highComplexity: number;
}

// Mapping: our collector domains → UI domain IDs
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

// Effort hours per RCA mapping complexity
const EFFORT_HOURS: Record<string, number> = {
  direct: 0.5,
  transform: 2,
  redesign: 8,
  'no-equivalent': 16,
};

function mapMigrationStatus(rcaComplexity: string | undefined): MigrationStatus {
  switch (rcaComplexity) {
    case 'direct':
      return 'auto';
    case 'transform':
      return 'guided';
    case 'redesign':
      return 'manual';
    case 'no-equivalent':
      return 'blocked';
    default:
      return 'guided';
  }
}

function mapComplexity(level: string | undefined): Complexity {
  switch (level) {
    case 'very-high':
    case 'high':
      return 'high';
    case 'medium':
      return 'moderate';
    case 'low':
    default:
      return 'low';
  }
}

// Aggregate/overview types that should be skipped when building item lists
const AGGREGATE_TYPES = new Set(['DataCount', 'OrgFingerprint', 'UsageOverview']);

function main() {
  console.log('=== Transform Extraction Results → UI Format ===\n');

  const raw = JSON.parse(readFileSync(inputPath, 'utf-8'));
  const findings = raw.findings as any[];
  const metadata = raw.metadata ?? {};
  const collectors = raw.collectors ?? {};

  // Ensure evidenceRefs is always an array (DB export may stringify it)
  for (const f of findings) {
    if (f.evidenceRefs && !Array.isArray(f.evidenceRefs)) {
      try {
        f.evidenceRefs = typeof f.evidenceRefs === 'string' ? JSON.parse(f.evidenceRefs) : [];
      } catch {
        f.evidenceRefs = [];
      }
    }
    if (!f.evidenceRefs) f.evidenceRefs = [];
  }

  console.log(
    `Input: ${findings.length} findings from ${metadata?.instanceUrl ?? 'staging DB export'}`
  );

  // Group findings by UI domain
  const domainFindings = new Map<DomainId, any[]>();
  for (const f of findings) {
    const uiDomain = DOMAIN_MAPPING[f.domain] || 'dataReporting';
    if (!domainFindings.has(uiDomain)) domainFindings.set(uiDomain, []);
    domainFindings.get(uiDomain)!.push(f);
  }

  // Build UI items per domain
  const domains: any[] = [];
  let totalItems = 0;
  let totalAuto = 0;
  let totalGuided = 0;
  let totalManual = 0;
  let totalBlocked = 0;

  const domainConfigs: Array<{ id: DomainId; labelKey: string }> = [
    { id: 'products', labelKey: 'assessment.tabs.products' },
    { id: 'pricing', labelKey: 'assessment.tabs.pricing' },
    { id: 'rules', labelKey: 'assessment.tabs.rules' },
    { id: 'code', labelKey: 'assessment.tabs.code' },
    { id: 'integrations', labelKey: 'assessment.tabs.integrations' },
    { id: 'amendments', labelKey: 'assessment.tabs.amendments' },
    { id: 'approvals', labelKey: 'assessment.tabs.approvals' },
    { id: 'documents', labelKey: 'assessment.tabs.documents' },
    { id: 'dataReporting', labelKey: 'assessment.tabs.dataReporting' },
  ];

  for (const { id, labelKey } of domainConfigs) {
    const domainFindingsList = domainFindings.get(id) || [];

    // Build items from non-aggregate findings
    const items: AssessmentItem[] = domainFindingsList
      .filter((f: any) => !AGGREGATE_TYPES.has(f.artifactType))
      .map((f: any, i: number) => {
        const migrationStatus = mapMigrationStatus(f.rcaMappingComplexity);
        const complexity = mapComplexity(f.complexityLevel);
        const baseHours = EFFORT_HOURS[f.rcaMappingComplexity ?? 'transform'] ?? 2;
        const complexityMul = complexity === 'high' ? 1.5 : complexity === 'moderate' ? 1.0 : 0.8;

        return {
          id: f.artifactId || `${id}-${i}`,
          name: f.artifactName || 'Unknown',
          apiName: f.artifactType ? `${f.artifactType}:${f.artifactId || i}` : `${id}-${i}`,
          complexity,
          migrationStatus,
          triageState: 'untriaged',
          rcaTarget: f.rcaTargetConcept || null,
          rcaTooltip: f.notes || null,
          whyStatus:
            f.notes ||
            `${f.riskLevel || 'medium'} risk — ${f.migrationRelevance || 'should-migrate'}`,
          aiDescription: f.textValue
            ? `Source code: ${(f.textValue as string).slice(0, 200)}...`
            : f.notes || 'Extracted from Salesforce CPQ configuration.',
          dependencies: (Array.isArray(f.evidenceRefs) ? f.evidenceRefs : [])
            .flatMap((r: any) => r.referencedObjects || [])
            .slice(0, 5),
          isActive: f.migrationRelevance !== 'optional',
          lastModified: new Date().toISOString(),
          linesOfCode: f.countValue || null,
          estimatedHours: Math.round(baseHours * complexityMul * 10) / 10,
        };
      });

    // For amendments domain: synthesize items from order-lifecycle metrics if no items found
    if (id === 'amendments' && items.length === 0) {
      const olMetrics = (collectors['order-lifecycle'] as any)?.metrics;
      if (olMetrics) {
        const synthItems = buildAmendmentsItems(olMetrics);
        items.push(...synthItems);
      }
    }

    // Compute stats
    const stats: DomainStats = {
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

    const domainComplexity: Complexity =
      stats.highComplexity > stats.total * 0.3
        ? 'high'
        : stats.highComplexity > 0
          ? 'moderate'
          : 'low';

    // Build insights from collector warnings + metrics
    const insights: string[] = [];
    for (const [collectorName, cData] of Object.entries(collectors || {})) {
      const cd = cData as any;
      if (
        DOMAIN_MAPPING[collectorName] === id ||
        (collectorName === 'discovery' && id === 'dataReporting')
      ) {
        for (const w of cd.warnings || []) {
          insights.push(w);
        }
      }
    }

    // Build sub-tabs from domain-specific data
    const subTabs = buildSubTabs(id, domainFindingsList, collectors);

    // Build domain-specific features
    const domainExtras = buildDomainExtras(id, domainFindingsList, collectors);

    domains.push({
      id,
      labelKey,
      complexity: domainComplexity,
      stats,
      items,
      insights: insights.slice(0, 5),
      subTabs,
      ...domainExtras,
    });
  }

  // Build risks from high/critical findings
  const risks = findings
    .filter((f: any) => f.riskLevel === 'critical' || f.riskLevel === 'high')
    .slice(0, 20)
    .map((f: any, i: number) => ({
      id: `risk-${i}`,
      description: f.notes || `${f.artifactName}: ${f.riskLevel} risk`,
      category:
        f.domain === 'pricing' ? 'technical' : f.domain === 'dependency' ? 'technical' : 'business',
      severity: f.riskLevel === 'critical' ? 'critical' : 'high',
      likelihood: f.riskLevel === 'critical' ? 5 : 4,
      impact: f.riskLevel === 'critical' ? 5 : 4,
      affectedItems: [f.artifactName],
      affectedDomains: [DOMAIN_MAPPING[f.domain] || 'dataReporting'],
      mitigation:
        f.rcaMappingComplexity === 'redesign'
          ? 'Requires full redesign for RCA. Engage solution architect.'
          : 'Review and transform for RCA compatibility.',
      owner: null,
    }));

  // Build key findings
  const keyFindings = [
    {
      id: 'kf-1',
      text: `${totalItems} CPQ artifacts extracted from ${metadata.orgId}`,
      severity: 'success',
      domain: null,
    },
    {
      id: 'kf-2',
      text: `CPQ Version ${metadata.cpqVersion} — Enterprise Edition`,
      severity: 'success',
      domain: null,
    },
    ...findings
      .filter((f: any) => f.riskLevel === 'critical')
      .slice(0, 3)
      .map((f: any, i: number) => ({
        id: `kf-crit-${i}`,
        text: f.notes || `Critical: ${f.artifactName}`,
        severity: 'error' as const,
        domain: DOMAIN_MAPPING[f.domain] || null,
      })),
    ...Object.entries(collectors)
      .flatMap(([, cd]: [string, any]) => (cd.warnings || []).slice(0, 1))
      .slice(0, 5)
      .map((w: string, i: number) => ({
        id: `kf-warn-${i}`,
        text: w,
        severity: 'warning' as const,
        domain: null,
      })),
  ];

  // Compute effort estimate
  const totalEstimatedHours = domains.reduce(
    (sum: number, d: any) =>
      sum + d.items.reduce((s: number, i: any) => s + (i.estimatedHours ?? 0), 0),
    0
  );

  // ============================================================================
  // C-05: Extract new artifact types into top-level UI sections
  // ============================================================================

  // Settings panel (G-01)
  const settingsPanel = findings
    .filter((f: any) => f.artifactType === 'CPQSettingValue')
    .map((f: any) => ({
      setting: f.artifactName,
      value: (f.evidenceRefs?.[0]?.label as string) ?? 'Unknown',
      fieldRef: f.artifactId ?? '',
      notes: f.notes ?? '',
    }));

  // Plugin inventory (G-02)
  const pluginInventory = findings
    .filter((f: any) => f.artifactType === 'PluginStatus')
    .map((f: any) => ({
      plugin: f.artifactName,
      status: (f.countValue ?? 0) > 0 ? 'Active' : 'Not Configured',
      notes: f.notes ?? '',
    }));

  // User adoption (G-03)
  const userAdoption = findings.find((f: any) => f.artifactType === 'UserAdoption');

  // User behavior by role (G-04)
  const userBehavior = findings
    .filter((f: any) => f.artifactType === 'UserBehavior')
    .map((f: any) => ({
      profile: f.artifactName,
      users: f.countValue ?? 0,
      notes: f.notes ?? '',
      evidenceRefs: f.evidenceRefs ?? [],
    }));

  // Discount distribution (G-05)
  const discountDistribution = findings.find((f: any) => f.artifactType === 'DiscountDistribution');

  // Price override analysis (G-06)
  const priceOverrides = findings.find((f: any) => f.artifactType === 'PriceOverrideAnalysis');

  // Top quoted products (G-08)
  const topProducts = findings
    .filter((f: any) => f.artifactType === 'TopQuotedProduct')
    .map((f: any) => ({
      name: f.artifactName,
      productId: f.artifactId,
      quotedCount: f.countValue ?? 0,
      notes: f.notes ?? '',
      evidenceRefs: f.evidenceRefs ?? [],
    }));

  // Conversion segments (G-09)
  const conversionSegments = findings
    .filter((f: any) => f.artifactType === 'ConversionSegment')
    .map((f: any) => ({
      segment: f.artifactName,
      quoteCount: f.countValue ?? 0,
      notes: f.notes ?? '',
      evidenceRefs: f.evidenceRefs ?? [],
    }));

  // Trend indicators (G-18)
  const trendIndicators = findings
    .filter((f: any) => f.artifactType === 'TrendIndicator')
    .map((f: any) => ({
      metric: f.artifactName,
      notes: f.notes ?? '',
      evidenceRefs: f.evidenceRefs ?? [],
    }));

  // Data quality flags (G-19)
  const dataQualityFlags = findings
    .filter((f: any) => f.artifactType === 'DataQualityFlag')
    .map((f: any) => ({
      check: f.artifactName,
      count: f.countValue ?? null,
      status:
        (f.countValue ?? 0) > 0 ? 'flagged' : f.countValue === null ? 'not_assessed' : 'clean',
      notes: f.notes ?? '',
    }));

  // Complexity hotspots (G-13)
  const complexityHotspots = findings
    .filter((f: any) => f.artifactType === 'ComplexityHotspot')
    .map((f: any) => ({
      name: f.artifactName,
      severity: f.riskLevel ?? 'medium',
      analysis: f.notes ?? '',
      evidenceRefs: f.evidenceRefs ?? [],
    }));

  // Extraction confidence (G-17)
  const extractionConfidence = findings
    .filter((f: any) => f.artifactType === 'ExtractionConfidence')
    .map((f: any) => ({
      category: f.artifactName,
      coverage: f.notes?.split(':')[0] ?? 'Unknown',
      notes: f.notes ?? '',
    }));

  // Object inventory (G-14)
  const objectInventory = findings
    .filter((f: any) => f.artifactType === 'ObjectInventoryItem')
    .map((f: any, i: number) => ({
      id: i + 1,
      objectName: f.artifactName,
      count: f.countValue ?? 0,
      complexity: f.complexityLevel ?? 'low',
      notes: f.notes ?? '',
    }));

  // CPQ reports (G-15)
  const cpqReports = findings
    .filter((f: any) => f.artifactType === 'CPQReport')
    .map((f: any) => ({
      name: f.artifactName,
      notes: f.notes ?? '',
    }));

  // Option attachment rates (G-07)
  const attachmentRates = findings
    .filter((f: any) => f.artifactType === 'OptionAttachmentRate')
    .map((f: any) => ({
      name: f.artifactName,
      count: f.countValue ?? 0,
      notes: f.notes ?? '',
      evidenceRefs: f.evidenceRefs ?? [],
    }));

  const assessmentData = {
    projectId: '00000000-0000-4000-a000-000000000404',
    domains,
    risks,
    keyFindings,
    runs: [
      {
        id: 'run-live-1',
        number: 1,
        completedAt: new Date().toISOString(),
        itemsScanned: totalItems,
        duration: metadata.durationSeconds,
      },
    ],
    currentRunIndex: 0,
    runDelta: { added: totalItems, removed: 0, changed: 0, details: [] },
    orgHealth: {
      edition: 'Enterprise Edition',
      apiUsagePercent:
        Math.round(
          (1 -
            (collectors.discovery as any)?.metrics?.apiLimitRemaining /
              (collectors.discovery as any)?.metrics?.apiLimitMax) *
            100
        ) || 0,
      storageUsagePercent: 15,
      apexGovernorPercent: 10,
      cpqLicenseCount: 25,
      rcaLicenseCount: 0,
      hasSalesforceBilling: false,
      billingObjectCount: 0,
    },
    completeness: [
      { id: 'c1', labelKey: 'assessment.completeness.productCatalog', completed: true },
      { id: 'c2', labelKey: 'assessment.completeness.pricingRules', completed: true },
      { id: 'c3', labelKey: 'assessment.completeness.quoteTemplates', completed: true },
      { id: 'c4', labelKey: 'assessment.completeness.approvalFlows', completed: true },
      { id: 'c5', labelKey: 'assessment.completeness.codeDependencies', completed: true },
      { id: 'c6', labelKey: 'assessment.completeness.integrations', completed: true },
      { id: 'c7', labelKey: 'assessment.completeness.usageAnalytics', completed: true },
      { id: 'c8', labelKey: 'assessment.completeness.orderLifecycle', completed: true },
      { id: 'c9', labelKey: 'assessment.completeness.localization', completed: true },
    ],
    totalItems,
    totalAuto,
    totalGuided,
    totalManual,
    totalBlocked,
    totalEstimatedHours: Math.round(totalEstimatedHours),
    // C-05: New sections from gap analysis mitigations
    settingsPanel,
    pluginInventory,
    userAdoption: userAdoption
      ? {
          licenses:
            (userAdoption as any).evidenceRefs?.find((r: any) => r.label === 'CPQ Licenses')
              ?.value ?? null,
          activeCreators:
            (userAdoption as any).evidenceRefs?.find(
              (r: any) => r.label === 'Active Creators (90d)'
            )?.value ?? null,
          profileCount:
            (userAdoption as any).evidenceRefs?.find((r: any) => r.label === 'Profiles with CPQ')
              ?.value ?? null,
          notes: (userAdoption as any).notes ?? '',
        }
      : null,
    userBehavior,
    discountDistribution: discountDistribution
      ? {
          totalDiscounted: (discountDistribution as any).countValue ?? 0,
          avgPercent: (collectors.usage as any)?.metrics?.avgDiscountPercent ?? 0,
          buckets: ((discountDistribution as any).evidenceRefs ?? []).map((r: any) => ({
            range: r.label,
            count: Number(r.value),
          })),
        }
      : null,
    priceOverrides: priceOverrides
      ? {
          count: (priceOverrides as any).countValue ?? 0,
          notes: (priceOverrides as any).notes ?? '',
          evidenceRefs: (priceOverrides as any).evidenceRefs ?? [],
        }
      : null,
    topProducts,
    conversionSegments,
    trendIndicators,
    dataQualityFlags,
    complexityHotspots,
    extractionConfidence,
    objectInventory,
    cpqReports,
    attachmentRates,
  };

  writeFileSync(outputPath, JSON.stringify(assessmentData, null, 2));

  console.log(`\nTransformed to UI format:`);
  console.log(`  Domains: ${domains.length}`);
  console.log(`  Total items: ${totalItems}`);
  console.log(
    `  Auto: ${totalAuto} | Guided: ${totalGuided} | Manual: ${totalManual} | Blocked: ${totalBlocked}`
  );
  console.log(`  Estimated effort: ${Math.round(totalEstimatedHours)} hours`);
  console.log(`  Risks: ${risks.length}`);
  console.log(`  Key Findings: ${keyFindings.length}`);
  console.log(`\n  Per domain:`);
  for (const d of domains) {
    const subTabInfo = d.subTabs?.length ? ` (${d.subTabs.length} sub-tabs)` : '';
    console.log(`    ${d.id}: ${d.stats.total} items (${d.complexity} complexity)${subTabInfo}`);
  }
  console.log(`\n  New sections (C-05):`);
  console.log(`    Settings panel: ${settingsPanel.length} values`);
  console.log(`    Plugins: ${pluginInventory.length} plugins`);
  console.log(`    User behavior: ${userBehavior.length} profiles`);
  console.log(`    Top products: ${topProducts.length}`);
  console.log(`    Conversion segments: ${conversionSegments.length}`);
  console.log(`    Data quality flags: ${dataQualityFlags.length}`);
  console.log(`    Complexity hotspots: ${complexityHotspots.length}`);
  console.log(`    Object inventory: ${objectInventory.length} objects`);
  console.log(`    CPQ reports: ${cpqReports.length}`);
  console.log(`\nOutput: ${outputPath}`);
  console.log(`Size: ${(JSON.stringify(assessmentData).length / 1024).toFixed(0)} KB`);
}

// ============================================================================
// Amendments: synthesize items from order-lifecycle metrics
// ============================================================================

function buildAmendmentsItems(olMetrics: Record<string, any>): AssessmentItem[] {
  const items: AssessmentItem[] = [];

  if (olMetrics.totalOrders > 0) {
    items.push({
      id: 'ol-orders',
      name: `Orders (${olMetrics.totalOrders})`,
      apiName: 'Order',
      complexity: olMetrics.totalOrders > 500 ? 'high' : 'moderate',
      migrationStatus: 'guided',
      triageState: 'untriaged',
      rcaTarget: 'Order (RCA native)',
      rcaTooltip: 'Orders migrate with field mapping; SBQQ fields need transformation',
      whyStatus: `${olMetrics.totalOrders} orders with ${olMetrics.sbqqFieldsOnOrder ?? 0} CPQ fields`,
      aiDescription: `${olMetrics.totalOrders} orders found. CPQ-specific fields (SBQQ__) need mapping to RCA order fields. Order activation flow may change.`,
      dependencies: ['OrderItem', 'Contract'],
      isActive: true,
      lastModified: new Date().toISOString(),
      linesOfCode: null,
      estimatedHours: Math.ceil(olMetrics.totalOrders / 100) * 2,
    });
  }

  if (olMetrics.totalOrderItems > 0) {
    items.push({
      id: 'ol-order-items',
      name: `Order Items (${olMetrics.totalOrderItems})`,
      apiName: 'OrderItem',
      complexity: olMetrics.totalOrderItems > 1000 ? 'high' : 'moderate',
      migrationStatus: 'guided',
      triageState: 'untriaged',
      rcaTarget: 'OrderItem (RCA native)',
      rcaTooltip: 'Order line items with CPQ pricing waterfall fields',
      whyStatus: `${olMetrics.totalOrderItems} order items with ${olMetrics.sbqqFieldsOnOrderItem ?? 0} CPQ fields`,
      aiDescription: `${olMetrics.totalOrderItems} order items. Pricing waterfall fields (List, Net, Special, Customer prices) need mapping to RCA pricing model.`,
      dependencies: ['Order', 'Product2'],
      isActive: true,
      lastModified: new Date().toISOString(),
      linesOfCode: null,
      estimatedHours: Math.ceil(olMetrics.totalOrderItems / 200) * 2,
    });
  }

  if (olMetrics.totalContracts > 0) {
    items.push({
      id: 'ol-contracts',
      name: `Contracts (${olMetrics.totalContracts}, ${olMetrics.activeContracts ?? 0} active)`,
      apiName: 'Contract',
      complexity: 'moderate',
      migrationStatus: 'guided',
      triageState: 'untriaged',
      rcaTarget: 'Contract (RCA native)',
      rcaTooltip: 'Contract records with subscription and amendment data',
      whyStatus: `${olMetrics.totalContracts} contracts (${olMetrics.activeContracts ?? 0} active)`,
      aiDescription: `${olMetrics.totalContracts} contracts. Active contracts need careful migration sequencing. Amendment/renewal flows may differ in RCA.`,
      dependencies: ['Order', 'Account'],
      isActive: true,
      lastModified: new Date().toISOString(),
      linesOfCode: null,
      estimatedHours: Math.ceil(olMetrics.totalContracts / 100) * 3,
    });
  }

  if (olMetrics.assetsWithSubscriptions > 0) {
    items.push({
      id: 'ol-assets-subs',
      name: `Subscription Assets (${olMetrics.assetsWithSubscriptions})`,
      apiName: 'Asset',
      complexity: 'high',
      migrationStatus: 'manual',
      triageState: 'untriaged',
      rcaTarget: 'Asset lifecycle (RCA)',
      rcaTooltip: 'Assets tied to SBQQ subscriptions — lifecycle model differs in RCA',
      whyStatus: `${olMetrics.assetsWithSubscriptions} assets linked to CPQ subscriptions`,
      aiDescription: `${olMetrics.assetsWithSubscriptions} assets with active subscriptions. The CPQ subscription→asset model differs from RCA. Requires migration of subscription lifecycle data.`,
      dependencies: ['Contract', 'SBQQ__Subscription__c'],
      isActive: true,
      lastModified: new Date().toISOString(),
      linesOfCode: null,
      estimatedHours: Math.ceil(olMetrics.assetsWithSubscriptions / 50) * 4,
    });
  }

  return items;
}

// ============================================================================
// Sub-tabs: build from domain-specific findings
// ============================================================================

function buildSubTabs(
  domainId: DomainId,
  domainFindings: any[],
  collectors: Record<string, any>
): Array<{ id: string; labelKey: string; itemCount: number }> {
  switch (domainId) {
    case 'products': {
      const products = domainFindings.filter((f) => f.artifactType === 'Product2');
      const options = domainFindings.filter((f) => f.artifactType === 'ProductOption');
      const rules = domainFindings.filter((f) => f.artifactType === 'ProductRule');
      const attrs = domainFindings.filter((f) => f.artifactType === 'ConfigurationAttribute');
      const tabs = [];
      if (products.length > 0)
        tabs.push({
          id: 'catalog',
          labelKey: 'assessment.subTabs.catalog',
          itemCount: products.length,
        });
      if (options.length > 0)
        tabs.push({
          id: 'bundle-options',
          labelKey: 'assessment.subTabs.bundleOptions',
          itemCount: options.length,
        });
      if (rules.length > 0)
        tabs.push({
          id: 'product-rules',
          labelKey: 'assessment.subTabs.productRules',
          itemCount: rules.length,
        });
      if (attrs.length > 0)
        tabs.push({
          id: 'config-attributes',
          labelKey: 'assessment.subTabs.configAttributes',
          itemCount: attrs.length,
        });
      return tabs;
    }

    case 'pricing': {
      const priceRules = domainFindings.filter((f) => f.artifactType === 'PriceRule');
      const discounts = domainFindings.filter((f) => f.artifactType === 'DiscountSchedule');
      const contracted = domainFindings.filter((f) => f.artifactType === 'ContractedPrice');
      const qcp = domainFindings.filter((f) => f.artifactType === 'CustomScript');
      const lookups = domainFindings.filter((f) => f.artifactType === 'LookupQuery');
      const tabs = [];
      if (priceRules.length > 0)
        tabs.push({
          id: 'price-rules',
          labelKey: 'assessment.subTabs.priceRules',
          itemCount: priceRules.length,
        });
      if (discounts.length > 0)
        tabs.push({
          id: 'discount-schedules',
          labelKey: 'assessment.subTabs.discountSchedules',
          itemCount: discounts.length,
        });
      if (contracted.length > 0)
        tabs.push({
          id: 'contracted-pricing',
          labelKey: 'assessment.subTabs.contractedPricing',
          itemCount: contracted.length,
        });
      if (qcp.length > 0)
        tabs.push({
          id: 'qcp-scripts',
          labelKey: 'assessment.subTabs.qcpScripts',
          itemCount: qcp.length,
        });
      if (lookups.length > 0)
        tabs.push({
          id: 'lookup-queries',
          labelKey: 'assessment.subTabs.lookupQueries',
          itemCount: lookups.length,
        });
      return tabs;
    }

    case 'code': {
      const apex = domainFindings.filter(
        (f) => f.artifactType === 'ApexClass' || f.artifactType === 'ApexTrigger'
      );
      const flows = domainFindings.filter((f) => f.artifactType === 'Flow');
      const workflows = domainFindings.filter((f) => f.artifactType === 'WorkflowRule');
      const tabs = [];
      if (apex.length > 0)
        tabs.push({
          id: 'apex-code',
          labelKey: 'assessment.subTabs.apexCode',
          itemCount: apex.length,
        });
      if (flows.length > 0)
        tabs.push({ id: 'flows', labelKey: 'assessment.subTabs.flows', itemCount: flows.length });
      if (workflows.length > 0)
        tabs.push({
          id: 'workflows',
          labelKey: 'assessment.subTabs.workflows',
          itemCount: workflows.length,
        });
      return tabs;
    }

    case 'amendments': {
      const olMetrics = (collectors['order-lifecycle'] as any)?.metrics;
      if (!olMetrics) return [];
      const tabs = [];
      if (olMetrics.totalOrders > 0)
        tabs.push({
          id: 'orders',
          labelKey: 'assessment.subTabs.orders',
          itemCount: olMetrics.totalOrders,
        });
      if (olMetrics.totalContracts > 0)
        tabs.push({
          id: 'contracts',
          labelKey: 'assessment.subTabs.contracts',
          itemCount: olMetrics.totalContracts,
        });
      if (olMetrics.assetsWithSubscriptions > 0)
        tabs.push({
          id: 'subscriptions',
          labelKey: 'assessment.subTabs.subscriptions',
          itemCount: olMetrics.assetsWithSubscriptions,
        });
      return tabs;
    }

    case 'integrations': {
      const namedCreds = domainFindings.filter((f) => f.artifactType === 'NamedCredential');
      const events = domainFindings.filter((f) => f.artifactType === 'PlatformEvent');
      const outbound = domainFindings.filter((f) => f.artifactType === 'OutboundMessage');
      const tabs = [];
      if (namedCreds.length > 0)
        tabs.push({
          id: 'named-credentials',
          labelKey: 'assessment.subTabs.namedCredentials',
          itemCount: namedCreds.length,
        });
      if (events.length > 0)
        tabs.push({
          id: 'platform-events',
          labelKey: 'assessment.subTabs.platformEvents',
          itemCount: events.length,
        });
      if (outbound.length > 0)
        tabs.push({
          id: 'outbound-messages',
          labelKey: 'assessment.subTabs.outboundMessages',
          itemCount: outbound.length,
        });
      return tabs;
    }

    case 'documents': {
      const templates = domainFindings.filter((f) => f.artifactType === 'QuoteTemplate');
      const sections = domainFindings.filter((f) => f.artifactType === 'TemplateSection');
      const tabs = [];
      if (templates.length > 0)
        tabs.push({
          id: 'templates',
          labelKey: 'assessment.subTabs.templates',
          itemCount: templates.length,
        });
      if (sections.length > 0)
        tabs.push({
          id: 'sections',
          labelKey: 'assessment.subTabs.sections',
          itemCount: sections.length,
        });
      return tabs;
    }

    case 'dataReporting': {
      const usage = domainFindings.filter((f) => f.domain === 'usage');
      const settings = domainFindings.filter((f) => f.domain === 'settings');
      const localization = domainFindings.filter((f) => f.domain === 'localization');
      const tabs = [];
      if (usage.length > 0)
        tabs.push({
          id: 'usage-analytics',
          labelKey: 'assessment.subTabs.usageAnalytics',
          itemCount: usage.length,
        });
      if (settings.length > 0)
        tabs.push({
          id: 'cpq-settings',
          labelKey: 'assessment.subTabs.cpqSettings',
          itemCount: settings.length,
        });
      if (localization.length > 0)
        tabs.push({
          id: 'localization',
          labelKey: 'assessment.subTabs.localization',
          itemCount: localization.length,
        });
      return tabs;
    }

    default:
      return [];
  }
}

// ============================================================================
// Domain extras: domain-specific properties for UI feature cards
// ============================================================================

function buildDomainExtras(
  domainId: DomainId,
  domainFindings: any[],
  collectors: Record<string, any>
): Record<string, any> {
  switch (domainId) {
    case 'products': {
      const options = domainFindings.filter((f) => f.artifactType === 'ProductOption');
      const features = domainFindings.filter((f) => f.artifactType === 'ProductFeature');
      return {
        bundleCount: features.length,
        optionCount: options.length,
      };
    }

    case 'pricing': {
      const contracted = domainFindings.filter((f) => f.artifactType === 'ContractedPrice');
      const summaryVars = domainFindings.filter((f) => f.artifactType === 'SummaryVariable');
      const pricingMetrics = (collectors.pricing as any)?.metrics;
      return {
        contractedPricing:
          contracted.length > 0
            ? {
                totalRecords: contracted.length,
                accountCount: new Set(contracted.map((c: any) => c.artifactId?.split(':')[0])).size,
              }
            : undefined,
        summaryVariableCount: summaryVars.length,
        contextBlueprintFields: pricingMetrics?.contextBlueprintFields ?? 0,
      };
    }

    case 'amendments': {
      const olMetrics = (collectors['order-lifecycle'] as any)?.metrics;
      if (!olMetrics) return {};
      return {
        subscriptionManagement: {
          hasCoTermination: false,
          hasMdq: (olMetrics.assetsWithSubscriptions ?? 0) > 0,
          mdqProductCount: 0,
          hasUplift: false,
          totalOrders: olMetrics.totalOrders ?? 0,
          totalContracts: olMetrics.totalContracts ?? 0,
          activeContracts: olMetrics.activeContracts ?? 0,
          assetsWithSubscriptions: olMetrics.assetsWithSubscriptions ?? 0,
        },
      };
    }

    case 'code': {
      const apex = domainFindings.filter((f) => f.artifactType === 'ApexClass');
      const triggers = domainFindings.filter((f) => f.artifactType === 'ApexTrigger');
      const flows = domainFindings.filter((f) => f.artifactType === 'Flow');
      return {
        apexClassCount: apex.length,
        triggerCount: triggers.length,
        flowCount: flows.length,
        totalLinesOfCode: domainFindings.reduce(
          (sum: number, f: any) => sum + (f.countValue ?? 0),
          0
        ),
      };
    }

    default:
      return {};
  }
}

main();
