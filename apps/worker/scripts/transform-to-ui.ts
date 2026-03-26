#!/usr/bin/env npx tsx
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
  customization: 'rules', // Custom fields, validation rules → "Rules" tab
  templates: 'documents',
  approvals: 'approvals',
  integration: 'integrations',
  usage: 'dataReporting',
  'order-lifecycle': 'amendments',
  localization: 'dataReporting',
  settings: 'dataReporting',
};

// Mapping: our rcaMappingComplexity → UI migrationStatus
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

// Mapping: our complexityLevel → UI complexity
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

function main() {
  console.log('=== Transform Extraction Results → UI Format ===\n');

  const raw = JSON.parse(readFileSync(inputPath, 'utf-8'));
  const findings = raw.findings as any[];
  const metadata = raw.metadata;
  const collectors = raw.collectors;

  console.log(`Input: ${findings.length} findings from ${metadata.instanceUrl}`);

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
    const findings = domainFindings.get(id) || [];

    const items: AssessmentItem[] = findings
      .filter(
        (f: any) =>
          f.artifactType !== 'DataCount' &&
          f.artifactType !== 'OrgFingerprint' &&
          f.artifactType !== 'UsageOverview' &&
          f.artifactType !== 'OrderLifecycleOverview'
      )
      .map((f: any, i: number) => {
        const migrationStatus = mapMigrationStatus(f.rcaMappingComplexity);
        const complexity = mapComplexity(f.complexityLevel);

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
          dependencies: (f.evidenceRefs || [])
            .flatMap((r: any) => r.referencedObjects || [])
            .slice(0, 5),
          isActive: f.migrationRelevance !== 'optional',
          lastModified: new Date().toISOString(),
          linesOfCode: f.countValue || null,
          estimatedHours: null,
        };
      });

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

    // Determine overall domain complexity
    const domainComplexity: Complexity =
      stats.highComplexity > stats.total * 0.3
        ? 'high'
        : stats.highComplexity > 0
          ? 'moderate'
          : 'low';

    // Build insights from collector warnings + metrics
    const insights: string[] = [];
    for (const [collectorName, cData] of Object.entries(collectors)) {
      const cd = cData as any;
      if (
        DOMAIN_MAPPING[collectorName.replace('order-lifecycle', 'order-lifecycle')] === id ||
        (collectorName === 'discovery' && id === 'dataReporting')
      ) {
        for (const w of cd.warnings || []) {
          insights.push(w);
        }
      }
    }

    domains.push({
      id,
      labelKey,
      complexity: domainComplexity,
      stats,
      items,
      insights: insights.slice(0, 5),
      subTabs: [],
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
  };

  writeFileSync(outputPath, JSON.stringify(assessmentData, null, 2));

  console.log(`\nTransformed to UI format:`);
  console.log(`  Domains: ${domains.length}`);
  console.log(`  Total items: ${totalItems}`);
  console.log(
    `  Auto: ${totalAuto} | Guided: ${totalGuided} | Manual: ${totalManual} | Blocked: ${totalBlocked}`
  );
  console.log(`  Risks: ${risks.length}`);
  console.log(`  Key Findings: ${keyFindings.length}`);
  console.log(`\n  Per domain:`);
  for (const d of domains) {
    console.log(`    ${d.id}: ${d.stats.total} items (${d.complexity} complexity)`);
  }
  console.log(`\nOutput: ${outputPath}`);
  console.log(`Size: ${(JSON.stringify(assessmentData).length / 1024).toFixed(0)} KB`);
}

main();
