/**
 * Report Data Assembler — transforms assessment findings into ReportData.
 *
 * Reads findings from a completed assessment run and assembles them into
 * a structured object matching the 22-page benchmark report format.
 *
 * See: Completion Plan R-01
 * Updated: Redline mitigation R0–R2 (percentage fixes, active filtering,
 *          output state system, section coverage, migration language removal)
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
    lowVolumeWarning: string | null;
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
    scoringMethodology: Array<{
      dimension: string;
      weight: number;
      score: number;
      drivers: string;
    }>;
  };
  cpqAtAGlance: Record<string, Array<{ label: string; value: string; confidence: string }>>;
  dataConfidenceSummary: { confirmed: number; estimated: number; partial: number } | null;
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
      percentQuoted: string;
      confidence: string;
    }>;
    priceRules: Array<{
      name: string;
      description: string;
      complexity: string;
      status: string;
      confidence: string;
    }>;
    productRules: Array<{
      name: string;
      type: string;
      description: string;
      complexity: string;
      status: string;
      confidence: string;
    }>;
    activePriceRuleSummary: string;
    activeProductRuleSummary: string;
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
    discountDistribution: Array<{ range: string; count: number; percent: string }>;
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
      percentQuotes: string;
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
    permissionSets: Array<{ name: string; type: string; namespace: string }>;
  };
  approvalsAndDocs: {
    approvalRules: Array<{ name: string; object: string; conditions: number; status: string }>;
    quoteTemplates: Array<{ name: string; isDefault: boolean; lastModified: string }>;
    documentGeneration: { templateCount: number; docuSignActive: boolean };
  };
  /** Validation banners to display prominently in the report */
  reportBanners: string[];
  complexityHotspots: Array<{ name: string; severity: string; analysis: string }>;
  appendixA: Array<{
    id: number;
    objectName: string;
    apiName: string;
    count: number;
    complexity: string;
    confidence: string;
    isCpqObject: boolean;
  }>;
  appendixB: Array<{ name: string; description: string }>;
  appendixD: Array<{ category: string; coverage: string; notes: string }>;
}

// ============================================================================
// Helpers
// ============================================================================

/** Format a percentage with (N of M) context when denominator < 10 */
function pct(numerator: number, denominator: number): string {
  if (denominator === 0) return '0%';
  const value = Math.round((numerator / denominator) * 100);
  if (denominator < 10) return `${value}% (${numerator} of ${denominator})`;
  return `${value}%`;
}

/** Detect if a rule name looks like tech debt */
const TECH_DEBT_PATTERNS =
  /\b(delete|test|draft|deprecated|copy of|old|backup|temp|do not use|todo)\b/i;

/** Infer Apex class purpose from name */
function inferApexPurpose(name: string, notes: string | undefined): string {
  if (notes && notes.length > 0 && !notes.startsWith('CPQ-related')) {
    return notes.split('.')[0];
  }
  const lower = name.toLowerCase();
  if (lower.includes('test')) return 'Test class';
  if (lower.includes('plugin') || lower.includes('calculator')) return 'CPQ Plugin';
  if (lower.includes('quote')) return 'Quote processing';
  if (lower.includes('contract')) return 'Contract management';
  if (lower.includes('order')) return 'Order processing';
  if (lower.includes('trigger')) return 'Trigger handler';
  if (lower.includes('search')) return 'Product search';
  if (lower.includes('batch') || lower.includes('schedule')) return 'Batch/Scheduled job';
  if (lower.includes('invoice') || lower.includes('billing')) return 'Billing integration';
  if (lower.includes('handler')) return 'Event handler';
  if (lower.includes('util') || lower.includes('helper')) return 'Utility class';
  return 'CPQ-related Apex';
}

/** Detect origin from namespace */
function inferApexOrigin(name: string): string {
  if (name.startsWith('SBQQ')) return 'Managed (CPQ)';
  if (name.startsWith('sbaa')) return 'Managed (AA)';
  if (name.startsWith('dsfs') || name.startsWith('SBQQDS')) return 'Managed (DocuSign)';
  if (name.startsWith('blng')) return 'Managed (Billing)';
  if (name.startsWith('dlrs')) return 'Managed (DLRS)';
  return 'Custom';
}

/** Check if an object name is CPQ-related (SBQQ/sbaa/Product2) vs platform metadata */
function isCpqObjectName(name: string): boolean {
  return (
    name.startsWith('SBQQ__') ||
    name.startsWith('sbaa__') ||
    name === 'Product2' ||
    name === 'PricebookEntry' ||
    name === 'Pricebook2' ||
    name.startsWith('SBQQDS') ||
    name.includes('ContractedPrice')
  );
}

/** Parse validation rule object from domain/notes */
function parseValidationObject(domain: string, artifactName: string): string {
  // Try to parse "Object.RuleName" pattern from the artifactName
  const dotIdx = artifactName.indexOf('.');
  if (dotIdx > 0) {
    const obj = artifactName.substring(0, dotIdx);
    // Check if it looks like an object name
    if (obj.includes('__c') || obj.includes('__') || /^[A-Z]/.test(obj)) {
      return obj;
    }
  }
  // Fall back to domain
  if (domain === 'customization') return 'CPQ Object';
  return domain;
}

// ============================================================================
// Assembler
// ============================================================================

export function assembleReport(findings: AssessmentFindingInput[]): ReportData {
  // Group findings by artifact type for easy access
  // Normalize: some collectors use full SF names (SBQQ__PriceRule__c), others use short (PriceRule)
  const byType = new Map<string, AssessmentFindingInput[]>();
  for (const f of findings) {
    if (!byType.has(f.artifactType)) byType.set(f.artifactType, []);
    byType.get(f.artifactType)!.push(f);
  }

  // get() searches both short name and full SF API name
  const get = (...types: string[]) => {
    const result: AssessmentFindingInput[] = [];
    for (const t of types) {
      result.push(...(byType.get(t) ?? []));
    }
    return result;
  };
  const getOne = (...types: string[]) => {
    for (const t of types) {
      const found = byType.get(t)?.[0];
      if (found) return found;
    }
    return null;
  };

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

  // Code — handle both short and full SF API names
  const apexClasses = get('ApexClass');
  const triggers = get('ApexTrigger');
  const flows = get('Flow');
  const validationRules = get('ValidationRule');

  // Pricing — collectors use full SF names
  const priceRules = get('PriceRule', 'SBQQ__PriceRule__c');
  const productRules = get('ProductRule', 'SBQQ__ProductRule__c');
  const discountSchedules = get('DiscountSchedule', 'SBQQ__DiscountSchedule__c');
  const customScripts = get('CustomScript', 'SBQQ__CustomScript__c');

  // Catalog
  const _productOptions = get('ProductOption', 'SBQQ__ProductOption__c');
  const _productFeatures = get('ProductFeature', 'SBQQ__ProductFeature__c');

  // Templates
  const _quoteTemplates = get('QuoteTemplate', 'SBQQ__QuoteTemplate__c');

  // Presentation
  const hotspots = get('ComplexityHotspot');
  const inventory = get('ObjectInventoryItem');
  const reports = get('CPQReport');
  const confidence = get('ExtractionConfidence');
  const qualityFlags = get('DataQualityFlag');

  // Custom actions (approvals)
  const _customActions = get('CustomAction', 'SBQQ__CustomAction__c');

  // ---- Derived values ----
  const totalQuotes =
    findings.find(
      (f) =>
        f.artifactType === 'DataCount' &&
        (f.artifactName?.includes('Quote') || f.artifactName?.includes('SBQQ__Quote'))
    )?.countValue ?? 0;

  // Active/Inactive filtering for rules
  const activePriceRules = priceRules.filter(
    (r) => r.usageLevel !== 'dormant' && !r.notes?.includes('Inactive')
  );
  const inactivePriceRules = priceRules.length - activePriceRules.length;
  const activeProductRules = productRules.filter(
    (r) => r.usageLevel !== 'dormant' && !r.notes?.includes('Inactive')
  );
  const inactiveProductRules = productRules.length - activeProductRules.length;

  // Low volume detection
  const activeUsers = findings.find((f) => f.artifactType === 'UserAdoption')?.countValue ?? 0;
  const isLowVolume = totalQuotes < 50 || activeUsers < 5;
  const lowVolumeWarning = isLowVolume
    ? `Low activity detected in assessment window (${totalQuotes} quotes, ${activeUsers} active users). Some metrics may not be statistically meaningful.`
    : null;

  // Assessment period calculation
  const assessmentDate = new Date().toISOString().split('T')[0];
  const endDate = new Date();
  const startDate = new Date(endDate.getTime() - 90 * 24 * 60 * 60 * 1000);
  const formatDate = (d: Date) =>
    d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const assessmentPeriod = `${formatDate(startDate)} – ${formatDate(endDate)} (90 Days)`;

  // Discount distribution percentage calculation
  const discountRefs = discountDist?.evidenceRefs ?? [];
  const discountTotal = discountRefs.reduce((sum, r) => sum + Number(r.value ?? 0), 0);

  // Top products percentage calculation
  const totalTopProductQuoted = topProducts.reduce((sum, p) => sum + (p.countValue ?? 0), 0);
  const topProductDenominator = totalQuotes > 0 ? totalQuotes : totalTopProductQuoted;

  // Complexity scores
  const complexityScores = computeComplexityScores(findings);

  // Confidence summary
  const dataConfidenceSummary = computeConfidenceSummary(findings);

  // Technical debt
  const technicalDebt = buildTechnicalDebt(findings, priceRules, productRules, discountSchedules);

  // Feature utilization
  const featureUtilization = buildFeatureUtilization(findings);

  // sbaa version detection
  const sbaaVersion =
    orgFp?.notes?.match(/sbaa\s+([v\d.]+)/i)?.[1] ??
    findings
      .find(
        (f) =>
          f.artifactType === 'OrgFingerprint' &&
          f.notes?.toLowerCase().includes('advanced approval')
      )
      ?.notes?.match(/([v\d.]+)/)?.[1] ??
    null;

  return {
    metadata: {
      clientName: 'Assessment Client',
      orgId: orgFp?.artifactId ?? 'Unknown',
      environment: orgFp?.notes?.includes('sandbox') ? 'Sandbox' : 'Production',
      assessmentDate,
      assessmentPeriod,
      cpqVersion: orgFp?.notes?.match(/CPQ\s+([v\d.]+)/)?.[1] ?? 'Unknown',
      sbaaVersion,
      generatedBy: 'RevBrain CPQ Assessment Tool v1.0',
      lowVolumeWarning,
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
      complexityScores,
      scoringMethodology: buildScoringMethodology(complexityScores),
    },

    cpqAtAGlance: buildGlanceSections(findings, settingValues, technicalDebt, featureUtilization),

    dataConfidenceSummary,

    packageSettings: {
      installedPackages: buildInstalledPackages(orgFp, findings),
      coreSettings: settingValues.map((s) => ({
        setting: s.artifactName,
        value: s.evidenceRefs?.[0]?.label ?? 'Unknown',
        notes: s.notes ?? '',
        confidence: 'Confirmed',
      })),
      plugins: plugins.map((p) => {
        // Override QCP status if CustomScript findings exist (settings collector may not
        // detect custom settings, but pricing collector finds SBQQ__CustomScript__c records)
        const isQcp = p.artifactName?.includes('QCP') || p.artifactName?.includes('Calculator');
        const qcpOverride = isQcp && (p.countValue ?? 0) === 0 && customScripts.length > 0;
        return {
          plugin: p.artifactName,
          status: qcpOverride ? 'Active' : (p.countValue ?? 0) > 0 ? 'Active' : 'Not Configured',
          notes: qcpOverride
            ? `Active — ${customScripts.length} custom script(s) detected via SBQQ__CustomScript__c: ${customScripts.map((s) => s.artifactName).join(', ')}`
            : (p.notes ?? ''),
          confidence: 'Confirmed',
        };
      }),
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
      productCatalog: buildProductCatalog(findings, topProducts, totalQuotes),
      priceRules: priceRules.map((r) => {
        const isActive = r.usageLevel !== 'dormant' && !r.notes?.includes('Inactive');
        const isTechDebt = TECH_DEBT_PATTERNS.test(r.artifactName);
        return {
          name: r.artifactName + (isTechDebt ? ' ⚠ Potential tech debt' : ''),
          description: r.notes ?? '',
          complexity: r.complexityLevel ?? 'unknown',
          status: isActive ? 'Active' : 'Inactive',
          confidence: 'Confirmed',
        };
      }),
      productRules: productRules.map((r) => {
        const isActive = r.usageLevel !== 'dormant' && !r.notes?.includes('Inactive');
        const ruleType = r.evidenceRefs?.find((ref) => ref.label === 'Type')?.value ?? 'Unknown';
        const isTechDebt = TECH_DEBT_PATTERNS.test(r.artifactName);
        return {
          name: r.artifactName + (isTechDebt ? ' ⚠ Potential tech debt' : ''),
          type: ruleType,
          description: r.notes ?? '',
          complexity: r.complexityLevel ?? 'unknown',
          status: isActive ? 'Active' : 'Inactive',
          confidence: 'Confirmed',
        };
      }),
      activePriceRuleSummary:
        priceRules.length > 0
          ? `${activePriceRules.length} active of ${priceRules.length} total`
          : 'None detected',
      activeProductRuleSummary:
        productRules.length > 0
          ? `${activeProductRules.length} active of ${productRules.length} total`
          : 'None detected',
    },

    usageAdoption: {
      quotingActivity:
        trends.length > 0
          ? trends.map((t) => ({
              metric: t.artifactName,
              value: String(t.countValue ?? ''),
              trend: t.evidenceRefs?.find((r) => r.label === 'Trend')?.value ?? 'Stable',
              confidence: 'Confirmed',
            }))
          : [
              {
                metric: 'Quoting Activity',
                value: 'Not extracted',
                trend: 'N/A',
                confidence: 'Not extracted',
              },
            ],
      conversionBySize: segments.map((s) => ({
        segment: s.artifactName,
        percentQuotes: Number(s.evidenceRefs?.find((r) => r.label === '% of quotes')?.value ?? 0),
        percentRevenue: Number(s.evidenceRefs?.find((r) => r.label === '% of revenue')?.value ?? 0),
        conversionRate: Number(s.evidenceRefs?.find((r) => r.label === 'conversion %')?.value ?? 0),
        confidence: 'Estimated',
      })),
      discountDistribution: discountRefs.map((r) => {
        const count = Number(r.value ?? 0);
        return {
          range: r.label ?? '',
          count,
          percent: discountTotal > 0 ? pct(count, discountTotal) : '0%',
        };
      }),
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
        percentQuotes: pct(p.countValue ?? 0, topProductDenominator),
      })),
    },

    dataQuality: {
      flaggedAreas: qualityFlags.map((f) => ({
        issue: f.artifactName,
        status:
          (f.countValue ?? 0) > 0 ? 'Flagged' : f.countValue === null ? 'Not Assessed' : 'Clean',
        detail: f.notes ?? '',
      })),
      technicalDebt,
      featureUtilization,
    },

    customCode: {
      apexClasses: apexClasses.map((a) => ({
        name: a.artifactName,
        lines: a.countValue ?? 0,
        purpose: inferApexPurpose(a.artifactName, a.notes ?? undefined),
        origin: inferApexOrigin(a.artifactName),
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
        object: parseValidationObject(v.domain, v.artifactName),
        rule: v.artifactName.includes('.')
          ? v.artifactName.split('.').slice(1).join('.')
          : v.artifactName,
        status: v.usageLevel === 'dormant' ? 'Inactive' : 'Active',
        complexity: v.complexityLevel ?? 'low',
      })),
      permissionSets: get('PermissionSet').map((ps) => ({
        name: ps.artifactName,
        type: ps.notes?.includes('Custom') ? 'Custom' : 'Managed',
        namespace: ps.notes?.match(/\((\w+)\)/)?.[1] ?? '',
      })),
    },

    approvalsAndDocs: buildApprovalsAndDocs(findings, plugins),

    reportBanners: [],

    complexityHotspots:
      hotspots.length > 0
        ? hotspots.map((h) => ({
            name: h.artifactName,
            severity: h.riskLevel ?? 'Medium',
            analysis: h.notes ?? '',
          }))
        : detectHotspots(
            findings,
            priceRules,
            productRules,
            customScripts,
            discountSchedules,
            plugins
          ),

    appendixA:
      inventory.length > 0
        ? inventory.map((inv, i) => ({
            id: i + 1,
            objectName: inv.artifactName,
            apiName: inv.artifactName,
            count: inv.countValue ?? 0,
            complexity: inv.complexityLevel ?? 'low',
            confidence: 'Confirmed',
            isCpqObject: isCpqObjectName(inv.artifactName),
          }))
        : buildObjectInventoryInline(findings),

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
        : buildDynamicCoverage(findings),
  };
}

// ============================================================================
// Confidence Summary
// ============================================================================

function computeConfidenceSummary(
  findings: AssessmentFindingInput[]
): { confirmed: number; estimated: number; partial: number } | null {
  const total = findings.length;
  if (total === 0) return null;

  // Use sourceType as proxy for confidence
  let confirmed = 0;
  let estimated = 0;
  let partial = 0;
  for (const f of findings) {
    if (f.sourceType === 'object' || f.sourceType === 'metadata' || f.sourceType === 'tooling') {
      confirmed++;
    } else if (f.sourceType === 'inferred') {
      estimated++;
    } else {
      partial++;
    }
  }
  return {
    confirmed: Math.round((confirmed / total) * 100),
    estimated: Math.round((estimated / total) * 100),
    partial: Math.round((partial / total) * 100),
  };
}

// ============================================================================
// Technical Debt Builder
// ============================================================================

function buildTechnicalDebt(
  findings: AssessmentFindingInput[],
  priceRules: AssessmentFindingInput[],
  productRules: AssessmentFindingInput[],
  discountSchedules: AssessmentFindingInput[]
): Array<{ category: string; count: number; detail: string }> {
  const debt: Array<{ category: string; count: number; detail: string }> = [];

  // Dormant products
  const dormant = findings.filter(
    (f) => f.artifactType === 'Product2' && f.usageLevel === 'dormant'
  ).length;
  if (dormant > 0) {
    debt.push({
      category: 'Dormant Products',
      count: dormant,
      detail: 'Products not quoted in the 90-day assessment window.',
    });
  }

  // Inactive price rules
  const inactivePR = priceRules.filter(
    (r) => r.usageLevel === 'dormant' || r.notes?.includes('Inactive')
  ).length;
  if (inactivePR > 0) {
    debt.push({
      category: 'Inactive Price Rules',
      count: inactivePR,
      detail: 'Price rules marked inactive. Review for cleanup.',
    });
  }

  // Inactive product rules
  const inactiveProdR = productRules.filter(
    (r) => r.usageLevel === 'dormant' || r.notes?.includes('Inactive')
  ).length;
  if (inactiveProdR > 0) {
    debt.push({
      category: 'Inactive Product Rules',
      count: inactiveProdR,
      detail: 'Product rules marked inactive. Review for cleanup.',
    });
  }

  // Rules with DELETE/TEST/DRAFT in name
  const staleRules = [...priceRules, ...productRules].filter((r) =>
    TECH_DEBT_PATTERNS.test(r.artifactName)
  ).length;
  if (staleRules > 0) {
    debt.push({
      category: 'Stale/Test Rules',
      count: staleRules,
      detail: 'Rules with DELETE, TEST, DRAFT, or similar in name — likely cleanup candidates.',
    });
  }

  // Duplicate discount schedule names
  const dsNames = discountSchedules.map((d) => d.artifactName);
  const nameCounts = new Map<string, number>();
  for (const name of dsNames) {
    nameCounts.set(name, (nameCounts.get(name) ?? 0) + 1);
  }
  const duplicateDS = [...nameCounts.entries()].filter(([, count]) => count > 1);
  if (duplicateDS.length > 0) {
    const totalDupes = duplicateDS.reduce((sum, [, count]) => sum + count, 0);
    debt.push({
      category: 'Duplicate Discount Schedules',
      count: totalDupes,
      detail: `${duplicateDS.length} schedule name(s) appear multiple times: ${duplicateDS.map(([n, c]) => `"${n}" (${c}×)`).join(', ')}.`,
    });
  }

  return debt;
}

// ============================================================================
// Feature Utilization Builder
// ============================================================================

function buildFeatureUtilization(
  findings: AssessmentFindingInput[]
): Array<{ feature: string; status: string; detail: string }> {
  const count = (...types: string[]) =>
    findings.filter((f) => types.includes(f.artifactType)).length;

  const features: Array<{ feature: string; status: string; detail: string }> = [];

  // Bundle detection: count Product2 findings with medium complexity (= has ConfigurationType)
  // OR count ProductOption findings, OR check DataCount for ProductOption
  const bundleProducts = findings.filter(
    (f) => f.artifactType === 'Product2' && f.complexityLevel === 'medium'
  ).length;
  const optionCount = count('ProductOption', 'SBQQ__ProductOption__c');
  const optionDataCount =
    findings.find(
      (f) => f.artifactType === 'DataCount' && f.artifactName?.toLowerCase().includes('option')
    )?.countValue ?? 0;
  const detectedBundles = bundleProducts || optionCount || optionDataCount;
  features.push({
    feature: 'Product Bundles',
    status: detectedBundles > 0 ? 'Active' : 'Not Detected',
    detail:
      detectedBundles > 0
        ? `${bundleProducts} bundle products, ${optionDataCount || optionCount} product options.`
        : '',
  });

  const dsCount = count('DiscountSchedule', 'SBQQ__DiscountSchedule__c');
  features.push({
    feature: 'Discount Schedules',
    status: dsCount > 0 ? 'Active' : 'Not Detected',
    detail: dsCount > 0 ? `${dsCount} schedules detected.` : '',
  });

  const csCount = count('CustomScript', 'SBQQ__CustomScript__c');
  features.push({
    feature: 'Custom Scripts (QCP)',
    status: csCount > 0 ? 'Active' : 'Not Detected',
    detail: csCount > 0 ? `${csCount} custom scripts detected.` : '',
  });

  const tmplCount = count('QuoteTemplate', 'SBQQ__QuoteTemplate__c');
  features.push({
    feature: 'Quote Templates',
    status: tmplCount > 0 ? 'Active' : 'Not Detected',
    detail: tmplCount > 0 ? `${tmplCount} templates detected.` : '',
  });

  const approvalCount = count('CustomAction', 'SBQQ__CustomAction__c');
  features.push({
    feature: 'Advanced Approvals',
    status: approvalCount > 0 ? 'Active' : 'Not Detected',
    detail: approvalCount > 0 ? `${approvalCount} approval actions detected.` : '',
  });

  const cpCount = count('ContractedPrice', 'SBQQ__ContractedPrice__c');
  features.push({
    feature: 'Contracted Pricing',
    status: cpCount > 0 ? 'Active' : 'Not Detected',
    detail: cpCount > 0 ? `${cpCount} contracted prices detected.` : '',
  });

  const locCount = count('LocalizationSummary');
  features.push({
    feature: 'Multi-Language',
    status: locCount > 0 ? 'Active' : 'Not Detected',
    detail: locCount > 0 ? `${locCount} localizations detected.` : '',
  });

  return features;
}

// ============================================================================
// Glance Dashboard Builder
// ============================================================================

function buildGlanceSections(
  findings: AssessmentFindingInput[],
  _settingValues: AssessmentFindingInput[],
  technicalDebt: Array<{ category: string; count: number; detail: string }>,
  featureUtilization: Array<{ feature: string; status: string; detail: string }>
): Record<string, Array<{ label: string; value: string; confidence: string }>> {
  // Count by artifact type — handle both short and full SF API names
  const count = (...types: string[]) =>
    findings.filter((f) => types.includes(f.artifactType)).length;
  // DataCount findings have human labels like "Quote Lines (all)", "Product Options"
  // Match flexibly: case-insensitive, ignore spaces, match partial
  const dataCount = (name: string) => {
    const needle = name.toLowerCase().replace(/[\s_]/g, '');
    const f = findings.find(
      (f) =>
        f.artifactType === 'DataCount' &&
        f.artifactName?.toLowerCase().replace(/[\s_]/g, '').includes(needle)
    );
    return f?.countValue ?? 0;
  };

  // Bundle count: from DataCount "Product Options" or Product2 findings with ConfigurationType
  const bundleCount =
    dataCount('ProductOption') > 0
      ? dataCount('ProductOption')
      : count('ProductOption', 'SBQQ__ProductOption__c');
  // Also count products WITH ConfigurationType (actual bundles, not options)
  const bundleProductCount = findings.filter(
    (f) => f.artifactType === 'Product2' && f.complexityLevel === 'medium' // catalog sets medium for ConfigurationType products
  ).length;

  return {
    'Product Catalog': [
      {
        label: 'Active Products',
        value: String(dataCount('Product') || count('Product2')),
        confidence: 'Confirmed',
      },
      {
        label: 'Product Bundles',
        value:
          bundleProductCount > 0 ? String(bundleProductCount) : bundleCount > 0 ? 'Detected' : '0',
        confidence: bundleProductCount > 0 ? 'Confirmed' : 'Estimated',
      },
      {
        label: 'Price Books',
        value: String(dataCount('Pricebook') || 'N/A'),
        confidence: 'Confirmed',
      },
    ],
    'Pricing & Rules': [
      {
        label: 'Price Rules (Active)',
        value: String(count('PriceRule', 'SBQQ__PriceRule__c') || dataCount('PriceRule')),
        confidence: 'Confirmed',
      },
      {
        label: 'Product Rules (Active)',
        value: String(count('ProductRule', 'SBQQ__ProductRule__c') || dataCount('ProductRule')),
        confidence: 'Confirmed',
      },
      {
        label: 'Discount Schedules',
        value: `~${count('DiscountSchedule', 'SBQQ__DiscountSchedule__c') || dataCount('DiscountSchedule')}`,
        confidence: 'Estimated',
      },
      {
        label: 'Custom Scripts (QCP)',
        value:
          count('CustomScript', 'SBQQ__CustomScript__c') > 0
            ? `${count('CustomScript', 'SBQQ__CustomScript__c')} Detected`
            : dataCount('QCP') > 0
              ? `${dataCount('QCP')} Detected`
              : 'Not Configured',
        confidence: 'Confirmed',
      },
    ],
    'Quoting (90 Days)': [
      {
        label: 'Quotes Created',
        value: String(dataCount('Quote') || dataCount('SBQQ__Quote')),
        confidence: 'Confirmed',
      },
      {
        label: 'Quote Lines',
        value: String(dataCount('QuoteLine') || dataCount('SBQQ__QuoteLine')),
        confidence: 'Confirmed',
      },
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
      {
        label: 'Active Flows',
        value: (() => {
          const cpqFlows = count('Flow');
          // Check if there's a summary finding with total org flow count
          const summaryFlow = findings.find(
            (f) => f.artifactType === 'Flow' && f.findingKey?.includes('non_cpq_summary')
          );
          const totalOrgFlows = summaryFlow ? cpqFlows + (summaryFlow.countValue ?? 0) : cpqFlows;
          return totalOrgFlows > cpqFlows
            ? `${totalOrgFlows} total (${cpqFlows} CPQ-related)`
            : String(cpqFlows);
        })(),
        confidence: 'Confirmed',
      },
      {
        label: 'Validation Rules',
        value: String(count('ValidationRule')),
        confidence: 'Confirmed',
      },
    ],
    'Technical Debt':
      technicalDebt.length > 0
        ? technicalDebt.map((d) => ({
            label: d.category,
            value: String(d.count),
            confidence: 'Confirmed',
          }))
        : [{ label: 'No tech debt detected', value: '—', confidence: 'Confirmed' }],
    'Feature Utilization': featureUtilization.slice(0, 5).map((f) => ({
      label: f.feature,
      value: f.status,
      confidence: f.status === 'Active' ? 'Confirmed' : 'Estimated',
    })),
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
// Scoring Methodology Table
// ============================================================================

function buildScoringMethodology(
  scores: ReportData['executiveSummary']['complexityScores']
): ReportData['executiveSummary']['scoringMethodology'] {
  return [
    {
      dimension: 'Configuration Depth',
      weight: 25,
      score: scores.configurationDepth,
      drivers: 'Product catalog size, bundle nesting, option constraints, config attributes',
    },
    {
      dimension: 'Pricing Logic',
      weight: 25,
      score: scores.pricingLogic,
      drivers: 'Price rules, discount schedules, custom scripts (QCP), contracted pricing',
    },
    {
      dimension: 'Customization Level',
      weight: 20,
      score: scores.customizationLevel,
      drivers: 'Custom fields, validation rules, formula complexity, custom metadata',
    },
    {
      dimension: 'Data Volume & Usage',
      weight: 15,
      score: scores.dataVolumeUsage,
      drivers: 'Quote volume, line count, user adoption, discount patterns',
    },
    {
      dimension: 'Technical Debt',
      weight: 15,
      score: scores.technicalDebt,
      drivers: 'Apex class count, trigger count, flow complexity, code dependencies',
    },
  ];
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

  // --- QCP detection: check both plugin status AND CustomScript findings ---
  const qcpPlugin = plugins.find(
    (p) => p.artifactName?.includes('QCP') || p.artifactName?.includes('Calculator')
  );
  const qcpScripts = findings.filter(
    (f) => f.artifactType === 'SBQQ__CustomScript__c' || f.artifactType === 'CustomScript'
  );
  const hasQcp = (qcpPlugin && (qcpPlugin.countValue ?? 0) > 0) || qcpScripts.length > 0;

  // --- Price/Product rules ---
  const priceRules = findings.filter(
    (f) => f.artifactType === 'PriceRule' || f.artifactType === 'SBQQ__PriceRule__c'
  );
  const productRules = findings.filter(
    (f) => f.artifactType === 'ProductRule' || f.artifactType === 'SBQQ__ProductRule__c'
  );
  const activePR = priceRules.filter(
    (r) => r.usageLevel !== 'dormant' && !r.notes?.includes('Inactive')
  ).length;
  const activeProdR = productRules.filter(
    (r) => r.usageLevel !== 'dormant' && !r.notes?.includes('Inactive')
  ).length;

  // First finding: analytical observation, not extraction status
  if (hasQcp) {
    const scriptName =
      qcpScripts[0]?.artifactName ?? qcpPlugin?.notes?.match(/class:\s*(\S+)/)?.[1] ?? '';
    kf.push({
      title: `Custom Quote Calculator Plugin (QCP) active${scriptName ? `: ${scriptName}` : ''}`,
      detail: `${qcpScripts.length} custom script(s) with JavaScript-based pricing logic injected into every calculation. This fundamentally changes the complexity profile.`,
      confidence: 'Confirmed',
    });
  }

  if (priceRules.length > 0 || productRules.length > 0) {
    kf.push({
      title: `${activePR} active price rules and ${activeProdR} active product rules detected`,
      detail: `Heavy rule density indicates significant business logic encoded in CPQ configuration. Pricing logic concentrated in business-specific rules.`,
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
      detail: `${dormantProducts} of ${totalProducts} products were not quoted in the 90-day window. Consider cleanup to reduce configuration surface area.`,
      confidence: 'Confirmed',
    });
  }

  if (settings.length > 0) {
    const multiCurrency = settings.find((s) => s.artifactName?.includes('Multi-Currency'));
    if (multiCurrency?.notes?.includes('Enabled')) {
      kf.push({
        title: 'Multi-currency enabled',
        detail:
          'The org uses multi-currency pricing. Field mappings and currency handling require verification.',
        confidence: 'Confirmed',
      });
    }
  }

  // Apex/custom code density
  const apexCount = findings.filter((f) => f.artifactType === 'ApexClass').length;
  if (apexCount > 20 && kf.length < 5) {
    kf.push({
      title: `${apexCount} Apex classes reference CPQ objects`,
      detail: `Substantial custom code dependency suggests significant customization beyond standard CPQ configuration.`,
      confidence: 'Confirmed',
    });
  }

  // Ensure at least 3 findings with analytical observations
  const productCount = findings.filter((f) => f.artifactType === 'Product2').length;
  if (productCount > 0 && kf.length < 5) {
    const families = new Set(
      findings
        .filter((f) => f.artifactType === 'Product2')
        .map((f) => f.evidenceRefs?.find((r) => r.value === 'Product2.Family')?.label)
        .filter(Boolean)
    );
    kf.push({
      title: `${productCount} products across ${families.size} product families`,
      detail: `Product catalog spans ${families.size > 5 ? 'a diverse range of' : ''} families including ${[...families].slice(0, 5).join(', ')}${families.size > 5 ? ', and more' : ''}.`,
      confidence: 'Confirmed',
    });
  }

  while (kf.length < 3) {
    kf.push({
      title: `CPQ environment spans ${new Set(findings.map((f) => f.domain)).size} configuration domains`,
      detail: `${totalFindings} configuration artifacts assessed across product catalog, pricing, approvals, custom code, and usage analytics.`,
      confidence: 'Confirmed',
    });
  }

  return kf.slice(0, 5);
}

// ============================================================================
// Installed Packages (from OrgFingerprint notes)
// ============================================================================

// ============================================================================
// Hotspot Detection (inline, for when pipeline hotspots aren't in findings)
// ============================================================================

function detectHotspots(
  findings: AssessmentFindingInput[],
  priceRules: AssessmentFindingInput[],
  productRules: AssessmentFindingInput[],
  customScripts: AssessmentFindingInput[],
  discountSchedules: AssessmentFindingInput[],
  plugins: AssessmentFindingInput[]
): Array<{ name: string; severity: string; analysis: string }> {
  const hotspots: Array<{ name: string; severity: string; analysis: string }> = [];

  if (priceRules.length > 0 && productRules.length > 0) {
    hotspots.push({
      name: 'Quote Pricing Engine',
      severity: customScripts.length > 0 ? 'Critical' : 'High',
      analysis: `${priceRules.length} Price Rules + ${productRules.length} Product Rules + ${discountSchedules.length} Discount Schedules${customScripts.length > 0 ? ` + ${customScripts.length} Custom Scripts` : ''} form a multi-layered calculation chain.`,
    });
  }

  const esigPlugin = plugins.find(
    (p) => p.artifactName?.includes('Electronic') && (p.countValue ?? 0) > 0
  );
  if (esigPlugin) {
    hotspots.push({
      name: 'DocuSign Document Chain',
      severity: 'High',
      analysis:
        'Quote PDF generation → DocuSign envelope → signing → Order creation spans CPQ, document generation, and e-signature.',
    });
  }

  const apexCount = findings.filter((f) => f.artifactType === 'ApexClass').length;
  const triggerCount = findings.filter((f) => f.artifactType === 'ApexTrigger').length;
  if (apexCount > 20 || triggerCount > 3) {
    hotspots.push({
      name: 'Custom Code Dependencies',
      severity: 'High',
      analysis: `${apexCount} Apex classes + ${triggerCount} triggers reference CPQ objects. Code review required for full assessment.`,
    });
  }

  return hotspots;
}

// ============================================================================
// Approvals & Document Generation Section
// ============================================================================

function buildApprovalsAndDocs(
  findings: AssessmentFindingInput[],
  plugins: AssessmentFindingInput[]
): ReportData['approvalsAndDocs'] {
  // Approval rules from approvals collector
  const approvalRules = findings.filter(
    (f) =>
      f.artifactType === 'CustomAction' ||
      f.artifactType === 'SBQQ__CustomAction__c' ||
      f.findingKey?.includes('advanced_approval')
  );

  // Quote templates from templates collector
  const quoteTemplates = findings.filter(
    (f) => f.artifactType === 'QuoteTemplate' || f.artifactType === 'SBQQ__QuoteTemplate__c'
  );

  // DocuSign status from plugins
  const docuSignPlugin = plugins.find(
    (p) => p.artifactName?.includes('Electronic') && (p.countValue ?? 0) > 0
  );

  return {
    approvalRules: approvalRules.map((r) => ({
      name: r.artifactName,
      object: r.evidenceRefs?.find((ref) => ref.label === 'TargetObject')?.value ?? '',
      conditions: r.countValue ?? 0,
      status: r.usageLevel === 'dormant' ? 'Inactive' : 'Active',
    })),
    quoteTemplates: quoteTemplates.map((t) => ({
      name: t.artifactName,
      isDefault: t.notes?.includes('Default') ?? false,
      lastModified: t.evidenceRefs?.find((ref) => ref.label === 'LastModifiedDate')?.value ?? '',
    })),
    documentGeneration: {
      templateCount: quoteTemplates.length,
      docuSignActive: !!docuSignPlugin,
    },
  };
}

// ============================================================================
// Dynamic Extraction Coverage (replaces hardcoded "Full" defaults)
// ============================================================================

function buildDynamicCoverage(findings: AssessmentFindingInput[]): ReportData['appendixD'] {
  const domainSet = new Set<string>(findings.map((f) => f.domain));
  const countInDomain = (d: string) => findings.filter((f) => f.domain === d).length;

  const coverage = (
    domain: string,
    label: string,
    notes: string
  ): { category: string; coverage: string; notes: string } => {
    if (!domainSet.has(domain))
      return {
        category: label,
        coverage: 'Not extracted',
        notes: `${label} collector did not produce findings.`,
      };
    return { category: label, coverage: countInDomain(domain) > 5 ? 'Full' : 'Partial', notes };
  };

  return [
    coverage('catalog', 'Product Catalog', 'Products, bundles, options, config attributes.'),
    coverage('pricing', 'Pricing & Rules', 'Price rules, discount schedules, custom scripts.'),
    coverage('usage', 'Transactional Data', '90-day quotes, quote lines, usage trends.'),
    coverage(
      'customization',
      'Custom Fields & Validation',
      'Custom fields, validation rules, formulas.'
    ),
    coverage(
      'dependency',
      'Custom Code',
      'Apex classes, triggers, flows identified by namespace scan. Purpose and origin estimated from metadata, not verified through code review.'
    ),
    coverage('templates', 'Quote Templates', 'Template structure, sections, content.'),
    coverage('approvals', 'Advanced Approvals', 'Approval rules, conditions, chains.'),
    coverage('settings', 'CPQ Package Settings', 'Custom settings, plugin configuration.'),
    coverage('integration', 'Integrations', 'Named credentials, platform events.'),
    coverage('order-lifecycle', 'Order Lifecycle', 'Orders, contracts, subscriptions.'),
    coverage('localization', 'Localization', 'Multi-language translations, custom labels.'),
    {
      category: 'User Behavior',
      coverage: findings.some((f) => f.artifactType === 'UserBehavior')
        ? 'Estimated'
        : 'Not extracted',
      notes: 'Derived from audit trail sampling.',
    },
  ];
}

// ============================================================================
// Object Inventory Builder (inline for report, mirrors summaries/builder.ts logic)
// ============================================================================

const REPORT_ARTIFACT_TO_SF: Record<string, string> = {
  Product2: 'Product2',
  SBQQ__ProductRule__c: 'SBQQ__ProductRule__c',
  SBQQ__PriceRule__c: 'SBQQ__PriceRule__c',
  SBQQ__PriceCondition__c: 'SBQQ__PriceCondition__c',
  SBQQ__PriceAction__c: 'SBQQ__PriceAction__c',
  SBQQ__DiscountSchedule__c: 'SBQQ__DiscountSchedule__c',
  SBQQ__ContractedPrice__c: 'SBQQ__ContractedPrice__c',
  SBQQ__CustomScript__c: 'SBQQ__CustomScript__c',
  SBQQ__ProductOption__c: 'SBQQ__ProductOption__c',
  QuoteTemplate: 'SBQQ__QuoteTemplate__c',
  TemplateSection: 'SBQQ__TemplateSection__c',
  TemplateContent: 'SBQQ__TemplateContent__c',
  CustomAction: 'SBQQ__CustomAction__c',
  ApexClass: 'ApexClass',
  ApexTrigger: 'ApexTrigger',
  ValidationRule: 'ValidationRule',
  FormulaField: 'CustomField (Formula)',
  PlatformEvent: 'PlatformEventChannel',
  NamedCredential: 'NamedCredential',
  LocalizationSummary: 'SBQQ__Localization__c',
};

const REPORT_SKIP_TYPES = new Set([
  'DataCount',
  'OrgFingerprint',
  'UsageOverview',
  'OrderLifecycleOverview',
  'CPQSetting',
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
  'ObjectInventoryItem',
  'CPQReport',
  'OptionAttachmentRate',
  'FieldCompleteness',
  'Document',
  'LanguageTranslation',
  'ExternalIdField',
]);

function buildObjectInventoryInline(findings: AssessmentFindingInput[]): ReportData['appendixA'] {
  const objectMap = new Map<string, { count: number; complexity: string }>();

  for (const f of findings) {
    if (REPORT_SKIP_TYPES.has(f.artifactType)) continue;
    const sfName = REPORT_ARTIFACT_TO_SF[f.artifactType] ?? f.artifactType;
    const existing = objectMap.get(sfName) ?? { count: 0, complexity: 'low' };

    if (f.countValue != null && f.countValue > 0) {
      existing.count = Math.max(existing.count, f.countValue);
    } else {
      existing.count++;
    }

    const complexityOrder = ['low', 'medium', 'high', 'very-high'];
    const currentIdx = complexityOrder.indexOf(existing.complexity);
    const newIdx = complexityOrder.indexOf(f.complexityLevel ?? 'low');
    if (newIdx > currentIdx) existing.complexity = f.complexityLevel ?? 'low';

    objectMap.set(sfName, existing);
  }

  return [...objectMap.entries()]
    .sort((a, b) => b[1].count - a[1].count)
    .map(([name, data], i) => ({
      id: i + 1,
      objectName: name,
      apiName: name,
      count: data.count,
      complexity: data.complexity,
      confidence: 'Confirmed',
      isCpqObject: isCpqObjectName(name),
    }));
}

function buildInstalledPackages(
  orgFp: AssessmentFindingInput | null,
  findings: AssessmentFindingInput[]
): Array<{ name: string; namespace: string; version: string; status: string }> {
  const packages: Array<{ name: string; namespace: string; version: string; status: string }> = [];

  if (orgFp?.notes) {
    const cpqMatch = orgFp.notes.match(/CPQ\s+([v\d.]+)/);
    if (cpqMatch) {
      packages.push({
        name: 'Salesforce CPQ',
        namespace: 'SBQQ',
        version: cpqMatch[1],
        status: 'Active',
      });
    }
  }

  // Detect DocuSign from PluginStatus findings
  const esig = findings.find(
    (f) =>
      f.artifactType === 'PluginStatus' &&
      f.artifactName?.includes('Electronic') &&
      (f.countValue ?? 0) > 0
  );
  if (esig) {
    packages.push({
      name: esig.notes?.includes('DocuSign') ? 'DocuSign eSignature' : 'E-Signature',
      namespace: 'dsfs',
      version: 'Detected',
      status: 'Active',
    });
  }

  return packages;
}

// ============================================================================
// Product Catalog by Category (from Product2 findings)
// ============================================================================

function buildProductCatalog(
  findings: AssessmentFindingInput[],
  topProducts: AssessmentFindingInput[],
  totalQuotes: number
): ReportData['configurationDomain']['productCatalog'] {
  const products = findings.filter((f) => f.artifactType === 'Product2');
  if (products.length === 0) return [];

  // Build a set of quoted product names from top products
  const quotedProducts = new Set(topProducts.map((p) => p.artifactName));

  // Group by Family (from evidenceRefs or notes)
  const families: Record<string, { active: number; inactive: number; quoted: number }> = {};
  for (const p of products) {
    // evidenceRef layout: { value: 'Product2.Family', label: '<family_name>' }
    const familyRef = p.evidenceRefs?.find((r) => r.value === 'Product2.Family');
    const family = familyRef?.label && familyRef.label !== '' ? familyRef.label : 'Other';
    if (!families[family]) families[family] = { active: 0, inactive: 0, quoted: 0 };
    if (p.usageLevel === 'dormant') {
      families[family].inactive++;
    } else {
      families[family].active++;
    }
    if (quotedProducts.has(p.artifactName)) {
      families[family].quoted++;
    }
  }

  return Object.entries(families).map(([category, counts]) => ({
    category,
    active: counts.active,
    inactive: counts.inactive,
    quoted90d: counts.quoted,
    percentQuoted:
      counts.active + counts.inactive > 0
        ? pct(counts.quoted, counts.active + counts.inactive)
        : '0%',
    confidence: 'Confirmed',
  }));
}
