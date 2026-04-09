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
// Helpers — safe accessors for DB data (JSONB may not be proper arrays)
// ============================================================================

/** Safely get evidenceRefs as an array (JSONB from DB may be object/null) */
function safeRefs(f: { evidenceRefs?: unknown }): Array<Record<string, unknown>> {
  if (Array.isArray(f.evidenceRefs)) return f.evidenceRefs;
  return [];
}

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
    /** Document version for cover page (Task 1.8) */
    documentVersion: string;
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
      /** Per-dimension rationale (Task 2.5) */
      rationale: string;
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
    /** Dormant product families (Task 2.9) */
    dormantFamilies: Array<{ name: string; productCount: number }>;
    priceRules: Array<{
      name: string;
      description: string;
      complexity: string;
      status: string;
      confidence: string;
    }>;
    /** Pre-computed price rule summary (Task 2.3) */
    priceRuleSummary: {
      active: number;
      total: number;
      highComplexity: number;
      inactive: number;
      stale: number;
    };
    productRules: Array<{
      name: string;
      type: string;
      description: string;
      complexity: string;
      status: string;
      confidence: string;
    }>;
    /** Pre-computed product rule summary by type (Task 2.3) */
    productRuleSummary: {
      selection: number;
      alert: number;
      validation: number;
      filter: number;
      inactive: number;
      stale: number;
    };
    activePriceRuleSummary: string;
    activeProductRuleSummary: string;
    discountScheduleAnalysis: Array<{ name: string; isDuplicate: boolean }>;
    /** Total and unique discount schedule counts (Task 1.4) */
    discountScheduleTotalCount: number;
    discountScheduleUniqueCount: number;
    discountScheduleDuplicateDetail: string;
    optionAttachmentSummary: string | null;
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
    /** Low volume flag for inline warnings (Task 2.8) */
    isLowVolume: boolean;
  };
  dataQuality: {
    flaggedAreas: Array<{ issue: string; status: string; detail: string }>;
    technicalDebt: Array<{ category: string; count: number; detail: string }>;
    featureUtilization: Array<{ feature: string; status: string; detail: string }>;
    fieldCompleteness: Array<{
      object: string;
      totalFields: number;
      above50pct: number;
      below5pct: number;
      score: string;
    }>;
  };
  customCode: {
    apexClasses: Array<{ name: string; lines: number; purpose: string; origin: string }>;
    triggersFlows: Array<{ name: string; type: string; object: string; status: string }>;
    validationRules: Array<{ object: string; rule: string; status: string; complexity: string }>;
    permissionSets: Array<{ name: string; type: string; namespace: string }>;
  };
  approvalsAndDocs: {
    /** CPQ Custom Action buttons (SBQQ__CustomAction__c) — NOT approval rules */
    customActions: Array<{ name: string; type: string; location: string; status: string }>;
    /** Advanced Approval Rules (sbaa__ApprovalRule__c) */
    advancedApprovalRules: Array<{
      name: string;
      conditions: number;
      status: string;
      targetObject: string;
    }>;
    /** Approval chain summary */
    approvalChains: { count: number; approvers: number };
    /** Standard Approval Processes (ProcessDefinition on CPQ objects) */
    approvalRules: Array<{ name: string; object: string; status: string }>;
    quoteTemplates: Array<{ name: string; isDefault: boolean; lastModified: string }>;
    documentGeneration: {
      templateCount: number;
      totalTemplateRecords: number;
      usableTemplateCount: number;
      docuSignActive: boolean;
    };
  };
  /** Canonical counts — single source of truth for all metrics (A1) */
  counts: ReportCounts;
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
    /** Deployment phase (Task 2.12) */
    phase: string;
  }>;
  appendixB: Array<{ name: string; description: string; isStale: boolean }>;
  /** Appendix B summary (Task 2.11) */
  appendixBSummary: { total: number; runLast12Mo: number; staleCount: number };
  appendixD: Array<{ category: string; coverage: string; notes: string }>;

  // V2.1 T2 conditional sections (null = section omitted from report)
  productDeepDive: ProductDeepDive | null;
  bundlesDeepDive: BundlesDeepDive | null;
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

/** CPQ object → deployment phase mapping (Task 2.12) */
const CPQ_PHASE_MAP: Record<string, string> = {
  Product2: 'Phase 1',
  PricebookEntry: 'Phase 1',
  Pricebook2: 'Phase 1',
  SBQQ__ProductOption__c: 'Phase 1',
  SBQQ__ProductFeature__c: 'Phase 1',
  SBQQ__ProductRule__c: 'Phase 1',
  SBQQ__PriceRule__c: 'Phase 2',
  SBQQ__PriceCondition__c: 'Phase 2',
  SBQQ__PriceAction__c: 'Phase 2',
  SBQQ__DiscountSchedule__c: 'Phase 2',
  SBQQ__CustomScript__c: 'Phase 2',
  SBQQ__ContractedPrice__c: 'Phase 3',
  SBQQ__QuoteTemplate__c: 'Phase 2',
  SBQQ__TemplateSection__c: 'Phase 2',
  SBQQ__TemplateContent__c: 'Phase 2',
  SBQQ__CustomAction__c: 'Phase 3',
  sbaa__ApprovalRule__c: 'Phase 3',
  ApexClass: 'Phase 3',
  ApexTrigger: 'Phase 3',
};

/** CPQ-relevant package namespaces — only these appear in Section 4.1 (Task 1.1) */
const CPQ_RELEVANT_NAMESPACES = new Set([
  'SBQQ',
  'sbaa',
  'blng',
  'sbc',
  'dsfs',
  'dfsle',
  'SBQQDS',
  'APXTConga4',
  'APXTCFQ',
  'AVA_MAPPER',
  'AVA_BLNG',
  'SFBD',
  'cpqea',
  'cpqlabs',
]);

/** Infer Apex class purpose from name — metadata first, then heuristics (Task 3.3) */
function inferApexPurpose(name: string, notes: string | undefined): string {
  // Prefer metadata/annotation-derived purpose
  if (notes && notes.length > 0 && !notes.startsWith('CPQ-related')) {
    return notes.split('.')[0];
  }
  const lower = name.toLowerCase();
  // Task 3.3: expanded name-based lookup table
  if (lower.includes('test')) return 'Test class';
  if (lower.includes('plugin') || lower.includes('calculator')) return 'CPQ Plugin';
  if (lower.includes('controller') || lower.includes('ctrl')) return 'Controller';
  if (lower.includes('quote')) return 'Quote processing';
  if (lower.includes('contract')) return 'Contract management';
  if (lower.includes('order')) return 'Order processing';
  if (lower.includes('trigger')) return 'Trigger handler';
  if (lower.includes('search')) return 'Product search';
  if (lower.includes('batch') || lower.includes('schedule')) return 'Batch/Scheduled job';
  if (lower.includes('invoice') || lower.includes('bill')) return 'Billing integration';
  if (lower.includes('handler')) return 'Event handler';
  if (lower.includes('util') || lower.includes('helper') || lower.includes('utils'))
    return 'Utility class';
  if (lower.includes('clean')) return 'Org maintenance';
  if (lower.includes('datacannon') || lower.includes('blaster') || lower.includes('seed'))
    return 'Data generation';
  if (lower.includes('api') || lower.includes('rest') || lower.includes('callout'))
    return 'Integration';
  if (lower.includes('service')) return 'Service layer';
  if (lower.includes('selector') || lower.includes('query')) return 'Data access';
  return 'CPQ-related Apex';
}

/** Detect origin from namespace — check metadata first, then name heuristics (Task 3.2) */
function inferApexOrigin(name: string, namespacePrefix?: string): string {
  // Task 3.2: prefer metadata namespace if available
  if (namespacePrefix) {
    if (CPQ_RELEVANT_NAMESPACES.has(namespacePrefix)) return `Managed (${namespacePrefix})`;
    return `Managed (${namespacePrefix})`;
  }
  // Fallback: name-based heuristics
  if (name.startsWith('SBQQ')) return 'Managed (CPQ)';
  if (name.startsWith('sbaa')) return 'Managed (AA)';
  if (name.startsWith('dsfs') || name.startsWith('SBQQDS')) return 'Managed (DocuSign)';
  if (name.startsWith('blng')) return 'Managed (Billing)';
  if (name.startsWith('dlrs')) return 'Managed (DLRS)';
  if (name.startsWith('sbc')) return 'Managed (Subscription)';
  if (name.startsWith('cpqea') || name.startsWith('cpqlabs')) return 'Managed (CPQ Labs)';
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

/** Task 2.13: Compute section-level confidence from finding source types */
export function sectionConfidence(
  findings: AssessmentFindingInput[],
  ...sectionArtifactTypes: string[]
): 'Confirmed' | 'Estimated' | 'Partial' {
  const sectionFindings = findings.filter((f) => sectionArtifactTypes.includes(f.artifactType));
  if (sectionFindings.length === 0) return 'Partial';
  const hasInferred = sectionFindings.some((f) => f.sourceType === 'inferred');
  const allDirect = sectionFindings.every(
    (f) => f.sourceType === 'object' || f.sourceType === 'metadata' || f.sourceType === 'tooling'
  );
  if (allDirect) return 'Confirmed';
  if (hasInferred) return 'Estimated';
  return 'Confirmed';
}

// ============================================================================
// Assembler
// ============================================================================

export function assembleReport(findings: AssessmentFindingInput[]): ReportData {
  // Normalize evidenceRefs — JSONB from DB may be string, object, or null instead of array
  for (const f of findings) {
    const refs = f.evidenceRefs;
    if (typeof refs === 'string') {
      try {
        (f as Record<string, unknown>).evidenceRefs = JSON.parse(refs);
      } catch {
        (f as Record<string, unknown>).evidenceRefs = [];
      }
    } else if (!Array.isArray(refs)) {
      (f as Record<string, unknown>).evidenceRefs = [];
    }
  }

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
  // Total quotes: prefer 90-day scoped count, fallback to all-time, then 0.
  // Be specific to avoid matching "Quote Templates" or "Quote Lines".
  const quotes90d = findings.find(
    (f) => f.artifactType === 'DataCount' && f.artifactName?.includes('Quotes (90d)')
  );
  const quotesAll = findings.find(
    (f) => f.artifactType === 'DataCount' && f.artifactName?.includes('Quotes (all)')
  );
  const totalQuotes =
    (quotes90d?.countValue ?? 0) > 0 ? quotes90d!.countValue! : (quotesAll?.countValue ?? 0);

  // Active/Inactive filtering for rules
  const activePriceRules = priceRules.filter(
    (r) => r.usageLevel !== 'dormant' && !r.notes?.includes('Inactive')
  );
  const _inactivePriceRules = priceRules.length - activePriceRules.length;
  const activeProductRules = productRules.filter(
    (r) => r.usageLevel !== 'dormant' && !r.notes?.includes('Inactive')
  );
  const _inactiveProductRules = productRules.length - activeProductRules.length;

  // Low volume detection — placeholder; re-evaluated after reportCounts are built
  // (see lowVolumeWarning below)

  // Assessment period calculation
  const assessmentDate = new Date().toISOString().split('T')[0];
  const endDate = new Date();
  const startDate = new Date(endDate.getTime() - 90 * 24 * 60 * 60 * 1000);
  const formatDate = (d: Date) =>
    d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const assessmentPeriod = `${formatDate(startDate)} – ${formatDate(endDate)} (90 Days)`;

  // Discount distribution percentage calculation
  const discountRefs = Array.isArray(discountDist?.evidenceRefs) ? discountDist.evidenceRefs : [];
  const discountTotal = discountRefs.reduce(
    (sum: number, r: Record<string, unknown>) => sum + Number(r.value ?? 0),
    0
  );

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
  // featureUtilization computed after reportCounts (needs counts.configuredBundles)
  let featureUtilization: ReturnType<typeof buildFeatureUtilization> = [];

  // Canonical counts — computed once, passed to both glance and section builders (Task 0.8, A1)
  const totalQuoteLines =
    findings.find(
      (f) =>
        f.artifactType === 'DataCount' &&
        f.artifactName?.toLowerCase().replace(/\s/g, '').includes('quoteline')
    )?.countValue ?? 0;

  const dsNameSet = new Set(discountSchedules.map((d) => d.artifactName));

  // ── A1: Product counts ──
  const productFindings = findings.filter((f) => f.artifactType === 'Product2');
  const totalProducts = productFindings.length;

  // activeProducts: prefer IsActive evidenceRef, fallback to usageLevel proxy
  const productsWithIsActive = productFindings.filter((f) =>
    safeRefs(f).some((r) => String(r.label) === 'IsActive')
  );
  let activeProducts: number;
  let activeProductSource: 'IsActive' | 'inferred' | 'unknown';
  let activeProductStatus: MetricStatus;
  if (productsWithIsActive.length > 0) {
    activeProducts = productsWithIsActive.filter((f) =>
      safeRefs(f).some((r) => String(r.label) === 'IsActive' && String(r.value) === 'true')
    ).length;
    activeProductSource = 'IsActive';
    activeProductStatus = 'present';
  } else if (totalProducts > 0) {
    activeProducts = productFindings.filter((f) => f.usageLevel !== 'dormant').length;
    activeProductSource = 'inferred';
    activeProductStatus = 'estimated';
  } else {
    activeProducts = 0;
    activeProductSource = 'unknown';
    activeProductStatus = 'not_extracted';
  }

  const bundleProducts = productFindings.filter(
    (f) => f.complexityLevel === 'medium' // catalog sets medium for ConfigurationType products
  ).length;

  const productOptionCount =
    _productOptions.length > 0
      ? _productOptions.length
      : (findings.find(
          (f) =>
            f.artifactType === 'DataCount' &&
            f.artifactName?.toLowerCase().replace(/\s/g, '').includes('productoption')
        )?.countValue ?? 0);

  const productFamilySet = new Set(
    productFindings
      .filter((f) => f.usageLevel !== 'dormant')
      .map((f) => {
        const familyRef = safeRefs(f).find((r) => String(r.value) === 'Product2.Family');
        return familyRef ? String(familyRef.label) : null;
      })
      .filter((f): f is string => f != null && f !== '' && f !== '(none)')
  );
  const productFamilies = productFamilySet.size;

  // ── A1: Active users ──
  const userAdoptionFinding = findings.find((f) => f.artifactType === 'UserAdoption');
  let activeUsersCount: number;
  let activeUsersSource: 'UserAdoption' | 'UserBehavior' | 'unknown';
  let activeUserStatus: MetricStatus;
  if (userAdoptionFinding && (userAdoptionFinding.countValue ?? 0) > 0) {
    activeUsersCount = userAdoptionFinding.countValue!;
    activeUsersSource = 'UserAdoption';
    activeUserStatus = 'present';
  } else {
    const ubSum = userBehavior.reduce((s, u) => s + (u.countValue ?? 0), 0);
    if (ubSum > 0) {
      activeUsersCount = ubSum;
      activeUsersSource = 'UserBehavior';
      activeUserStatus = 'estimated';
    } else {
      activeUsersCount = 0;
      activeUsersSource = 'unknown';
      activeUserStatus = 'not_extracted';
    }
  }

  // ── A1: sbaa detection ──
  const installedPackageFindings = get('InstalledPackage');
  const sbaaInstalledPkg = installedPackageFindings.find((f) =>
    safeRefs(f).some((r) => String(r.label) === 'Namespace' && String(r.value) === 'sbaa')
  );
  const sbaaFromDescribe = findings.some(
    (f) => f.artifactType === 'OrgFingerprint' && f.notes?.includes('sbaa')
  );
  const sbaaFromSettings = settingValues.some((f) =>
    f.artifactName?.toLowerCase().includes('advanced approval')
  );
  const sbaaInstalled = !!sbaaInstalledPkg || sbaaFromDescribe || sbaaFromSettings;

  // sbaaVersionRaw: three-level extraction
  const sbaaVersionFromPkg = sbaaInstalledPkg
    ? safeRefs(sbaaInstalledPkg).find((r) => String(r.label) === 'Version')?.value
    : null;
  const sbaaVersionFromFp = orgFp?.notes?.match(/sbaa\s+(v\d[\d.]+)/i)?.[1] ?? null;
  const sbaaVersionFromSettings =
    findings
      .find(
        (f) =>
          f.artifactType === 'CPQSettingValue' &&
          f.artifactName?.toLowerCase().includes('advanced approval')
      )
      ?.notes?.match(/\b(v\d[\d.]+)/)?.[1] ?? null;
  const sbaaVersionRaw =
    (sbaaVersionFromPkg ? String(sbaaVersionFromPkg) : null) ??
    sbaaVersionFromFp ??
    sbaaVersionFromSettings;

  // V5-4: sbaa version display includes namespace and status from InstalledPackage evidenceRefs
  const sbaaStatusFromPkg = sbaaInstalledPkg
    ? safeRefs(sbaaInstalledPkg).find((r) => String(r.label) === 'Status')?.value
    : null;
  const sbaaStatusLabel = sbaaStatusFromPkg ? String(sbaaStatusFromPkg) : 'Active';

  let sbaaVersionDisplay: string;
  if (sbaaVersionRaw) {
    const vPrefix = sbaaVersionRaw.startsWith('v') ? '' : 'v';
    sbaaVersionDisplay = `sbaa ${vPrefix}${sbaaVersionRaw} (${sbaaStatusLabel})`;
  } else if (sbaaInstalled) {
    sbaaVersionDisplay = 'Installed (version unknown)';
  } else {
    sbaaVersionDisplay = 'Not installed';
  }

  // ── A1: Code & automation counts ──
  const advancedApprovalRuleFindings = get('AdvancedApprovalRule');
  const approvalRuleCount = advancedApprovalRuleFindings.length;
  const flowCountCpqRelated = flows.length;
  const summaryFlow = findings.find(
    (f) =>
      f.artifactType === 'Flow' &&
      (f.findingKey?.includes('non_cpq_summary') ||
        f.artifactName?.includes('additional active flows'))
  );
  const flowCountActive = summaryFlow
    ? flowCountCpqRelated + (summaryFlow.countValue ?? 0)
    : flowCountCpqRelated;

  const reportCounts: ReportCounts = {
    totalProducts,
    activeProducts,
    activeProductSource,
    activeProductStatus,
    bundleProducts,
    configuredBundles:
      findings.find(
        (f) => f.artifactType === 'DataCount' && f.artifactName === 'Configured Bundles'
      )?.countValue ?? 0,
    productOptions: productOptionCount,
    productFamilies,
    activePriceRules: activePriceRules.length,
    totalPriceRules: priceRules.length,
    activeProductRules: activeProductRules.length,
    totalProductRules: productRules.length,
    totalQuotes,
    totalQuoteLines,
    activeUsers: activeUsersCount,
    activeUsersSource,
    activeUserStatus,
    discountScheduleTotal: discountSchedules.length,
    discountScheduleUnique: dsNameSet.size,
    sbaaInstalled,
    sbaaVersionRaw,
    sbaaVersionDisplay,
    approvalRuleCount,
    flowCountActive,
    flowCountCpqRelated,
    validationRuleCount: validationRules.length,
    apexClassCount: apexClasses.length,
    triggerCount: triggers.length,
  };

  // Low volume detection (A4: uses canonical activeUsers count)
  // Compute featureUtilization now that reportCounts is available
  featureUtilization = buildFeatureUtilization(findings, reportCounts);

  const isLowVolume = totalQuotes < 50 || reportCounts.activeUsers < 3;
  const lowVolumeWarning = isLowVolume
    ? `Low activity detected in assessment window (${totalQuotes} quote${totalQuotes === 1 ? '' : 's'}, ${reportCounts.activeUsers} active user${reportCounts.activeUsers === 1 ? '' : 's'}). Some metrics may not be statistically meaningful.`
    : null;

  // sbaa version: use canonical counts (A2 three-level fallback)
  const sbaaVersion =
    reportCounts.sbaaVersionDisplay !== 'Not installed' ? reportCounts.sbaaVersionDisplay : null;

  return {
    metadata: {
      clientName: 'Assessment Client',
      orgId: orgFp?.artifactId ?? 'Unknown',
      environment: orgFp?.notes?.includes('sandbox') ? 'Sandbox' : 'Production',
      assessmentDate,
      assessmentPeriod,
      cpqVersion: orgFp?.notes?.match(/CPQ\s+([v\d.]+)/)?.[1] ?? 'Unknown',
      sbaaVersion,
      documentVersion: '1.0',
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
          : buildDefaultKeyFindings(findings, settingValues, plugins, reportCounts),
      complexityScores,
      scoringMethodology: buildScoringMethodology(
        complexityScores,
        findings,
        technicalDebt,
        reportCounts
      ),
    },

    cpqAtAGlance: buildGlanceSections(
      findings,
      settingValues,
      technicalDebt,
      featureUtilization,
      reportCounts
    ),

    dataConfidenceSummary,

    packageSettings: {
      installedPackages: buildInstalledPackages(orgFp, findings),
      // A6: Remove "Package:" entries — they already appear in installedPackages section
      coreSettings: settingValues
        .filter((s) => !s.artifactName.startsWith('Package:'))
        .map((s) => ({
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
        // Override Recommended Products Plugin if Apex implementation detected
        const isRecProducts = p.artifactName?.includes('Recommended');
        const recProductsApex = isRecProducts
          ? apexClasses.find((a) => /ProductRecommendation/i.test(a.artifactName))
          : null;
        const recOverride = isRecProducts && (p.countValue ?? 0) === 0 && recProductsApex;
        return {
          plugin: p.artifactName,
          status:
            qcpOverride || recOverride
              ? 'Active'
              : (p.countValue ?? 0) > 0
                ? 'Active'
                : 'Not Configured',
          notes: qcpOverride
            ? `Active — ${customScripts.length} custom script(s) detected via SBQQ__CustomScript__c: ${customScripts.map((s) => s.artifactName).join(', ')}`
            : recOverride
              ? `Active — Apex implementation detected: ${recProductsApex.artifactName}`
              : (p.notes ?? ''),
          confidence: 'Confirmed',
        };
      }),
    },

    quoteLifecycle: buildLifecycle(findings, plugins),

    configurationDomain: {
      productCatalog: buildProductCatalog(findings, topProducts, totalQuotes),
      dormantFamilies: (() => {
        const catalog = buildProductCatalog(findings, topProducts, totalQuotes);
        return catalog
          .filter((c) => c.quoted90d === 0)
          .sort((a, b) => b.active + b.inactive - (a.active + a.inactive))
          .map((c) => ({ name: c.category, productCount: c.active + c.inactive }));
      })(),
      priceRules: priceRules.map((r) => {
        const isActive = r.usageLevel !== 'dormant' && !r.notes?.includes('Inactive');
        const isTechDebt = TECH_DEBT_PATTERNS.test(r.artifactName);
        // Derive complexity from evaluation events in notes (e.g., "Eval: On Init;Before Calc;On Calc;After Calc")
        const evalMatch = r.notes?.match(/Eval:\s*([^,]+)/)?.[1] ?? '';
        const evalEvents = evalMatch.split(';').filter((e) => e.trim().length > 0).length;
        const derivedComplexity =
          r.complexityLevel && r.complexityLevel !== 'medium'
            ? r.complexityLevel
            : evalEvents >= 4
              ? 'high'
              : evalEvents >= 2
                ? 'medium'
                : evalEvents === 1
                  ? 'low'
                  : (r.complexityLevel ?? 'medium');
        return {
          name: r.artifactName + (isTechDebt ? ' ⚠ Potential tech debt' : ''),
          description: r.notes ?? '',
          complexity: derivedComplexity,
          status: isActive ? 'Active' : 'Inactive',
          confidence: 'Confirmed',
        };
      }),
      productRules: (() => {
        // Task 1.3: deduplicate by artifactName + type
        const seen = new Set<string>();
        return productRules
          .filter((r) => {
            const ruleType =
              r.evidenceRefs?.find((ref) => ref.label === 'Type')?.value ?? 'Unknown';
            const key = `${r.artifactName}::${ruleType}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          })
          .map((r) => {
            const isActive = r.usageLevel !== 'dormant' && !r.notes?.includes('Inactive');
            const ruleType =
              r.evidenceRefs?.find((ref) => ref.label === 'Type')?.value ?? 'Unknown';
            const isTechDebt = TECH_DEBT_PATTERNS.test(r.artifactName);
            // Task 2.2: derive complexity from condition count or fallback to 'Not assessed'
            const condCount = r.countValue ?? 0;
            const derivedComplexity =
              r.complexityLevel &&
              r.complexityLevel !== 'medium' &&
              (r.complexityLevel as string) !== 'unknown'
                ? r.complexityLevel
                : condCount >= 5
                  ? 'high'
                  : condCount >= 3
                    ? 'medium'
                    : condCount >= 1
                      ? 'low'
                      : '—';
            return {
              name: r.artifactName + (isTechDebt ? ' ⚠ Potential tech debt' : ''),
              type: ruleType,
              description: r.notes ?? '',
              complexity: derivedComplexity,
              status: isActive ? 'Active' : 'Inactive',
              confidence: 'Confirmed',
            };
          });
      })(),
      // Task 2.3: Pre-computed summary for price rules
      priceRuleSummary: (() => {
        const active = activePriceRules.length;
        const total = priceRules.length;
        const highComplexity = priceRules.filter((r) => {
          const evalMatch = r.notes?.match(/Eval:\s*([^,]+)/)?.[1] ?? '';
          return evalMatch.split(';').filter((e) => e.trim().length > 0).length >= 4;
        }).length;
        const inactive = total - active;
        const stale = priceRules.filter((r) => TECH_DEBT_PATTERNS.test(r.artifactName)).length;
        return { active, total, highComplexity, inactive, stale };
      })(),
      // Task 2.3: Pre-computed summary for product rules by type
      productRuleSummary: (() => {
        const typeCounts = {
          selection: 0,
          alert: 0,
          validation: 0,
          filter: 0,
          inactive: 0,
          stale: 0,
        };
        for (const r of productRules) {
          const type = (
            r.evidenceRefs?.find((ref) => ref.label === 'Type')?.value ?? ''
          ).toLowerCase();
          if (type.includes('selection')) typeCounts.selection++;
          else if (type.includes('alert')) typeCounts.alert++;
          else if (type.includes('validation')) typeCounts.validation++;
          else if (type.includes('filter')) typeCounts.filter++;
          if (r.usageLevel === 'dormant' || r.notes?.includes('Inactive')) typeCounts.inactive++;
          if (TECH_DEBT_PATTERNS.test(r.artifactName)) typeCounts.stale++;
        }
        return typeCounts;
      })(),
      activePriceRuleSummary:
        priceRules.length > 0
          ? `${activePriceRules.length} active of ${priceRules.length} total`
          : 'None detected',
      activeProductRuleSummary:
        productRules.length > 0
          ? `${activeProductRules.length} active of ${productRules.length} total`
          : 'None detected',
      discountScheduleAnalysis: buildDiscountScheduleAnalysis(discountSchedules),
      // Task 1.4: explicit total/unique/duplicate counts
      discountScheduleTotalCount: discountSchedules.length,
      discountScheduleUniqueCount: dsNameSet.size,
      discountScheduleDuplicateDetail: (() => {
        const nameCounts = new Map<string, number>();
        for (const ds of discountSchedules)
          nameCounts.set(ds.artifactName, (nameCounts.get(ds.artifactName) ?? 0) + 1);
        const dupes = [...nameCounts.entries()].filter(([, c]) => c > 1);
        return dupes.length > 0
          ? dupes.map(([n, c]) => `'${n}' appears ${c} times`).join('; ') +
              ' — flagged as duplicate in Technical Debt inventory.'
          : '';
      })(),
      // Task 1.5: set to null when cross-reference unavailable (clean "Not extracted" row)
      optionAttachmentSummary: (() => {
        const optCount =
          _productOptions.length > 0
            ? _productOptions.length
            : (findings.find(
                (f) =>
                  f.artifactType === 'DataCount' &&
                  f.artifactName?.toLowerCase().replace(/\s/g, '').includes('productoption')
              )?.countValue ?? 0);
        const bundleCount = findings.filter(
          (f) => f.artifactType === 'Product2' && f.complexityLevel === 'medium'
        ).length;
        // Check if quote-line-to-option cross-reference data exists
        const hasAttachmentData = findings.some((f) => f.artifactType === 'OptionAttachmentRate');
        if (optCount > 0 && hasAttachmentData) {
          return `${optCount} product options across ${bundleCount} bundle-capable products with attachment rate data.`;
        }
        const cfgBundles = reportCounts.configuredBundles;
        return optCount > 0
          ? `${optCount} product options across ${bundleCount} bundle-capable products (${cfgBundles} with active nested options). ${bundleCount} products have bundle configuration enabled (SBQQ__ConfigurationType__c); ${cfgBundles} are actively configured as bundles with child product options.`
          : null;
      })(),
    },

    usageAdoption: {
      quotingActivity: buildQuotingActivityMetrics(findings, trends, totalQuotes),
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
      isLowVolume,
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
      fieldCompleteness: buildFieldCompleteness(findings),
    },

    customCode: {
      apexClasses: apexClasses.map((a) => ({
        name: a.artifactName,
        lines: a.countValue ?? 0,
        purpose: inferApexPurpose(a.artifactName, a.notes ?? undefined),
        origin: inferApexOrigin(
          a.artifactName,
          a.evidenceRefs?.find((r) => r.label === 'NamespacePrefix')?.value ?? undefined
        ),
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

    counts: reportCounts,

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
            plugins,
            reportCounts
          ),

    appendixA: (() => {
      const items =
        inventory.length > 0
          ? inventory.map((inv, i) => ({
              id: i + 1,
              objectName:
                inv.artifactName === 'Product2'
                  ? `${inv.artifactName} (total records)`
                  : inv.artifactName,
              apiName: inv.artifactName,
              count: inv.countValue ?? 0,
              complexity: inv.complexityLevel ?? 'low',
              confidence: 'Confirmed',
              isCpqObject: isCpqObjectName(inv.artifactName),
              phase: CPQ_PHASE_MAP[inv.artifactName] ?? '',
            }))
          : buildObjectInventoryInline(findings, reportCounts);
      return items;
    })(),

    appendixB: (() => {
      // Deduplicate by report name (Task 0.4) — keep the entry with the longer description
      const seenReports = new Map<string, string>();
      for (const r of reports) {
        const existing = seenReports.get(r.artifactName);
        const desc = r.notes ?? '';
        if (!existing || desc.length > existing.length) {
          seenReports.set(r.artifactName, desc);
        }
      }
      // Task 2.11: sort by last-run date descending, flag stale reports
      const now = Date.now();
      const _twoYearsMs = 2 * 365 * 24 * 60 * 60 * 1000;
      const _oneYearMs = 365 * 24 * 60 * 60 * 1000;
      const entries = [...seenReports.entries()].map(([name, description]) => {
        const dateMatch = description.match(/(\d{4}-\d{2}-\d{2})/);
        const ts = dateMatch ? Date.parse(dateMatch[1]) : 0;
        const isStale = ts > 0 && now - ts > _twoYearsMs;
        return { name, description, isStale, _ts: ts };
      });
      entries.sort((a, b) => b._ts - a._ts);
      return entries.map(({ name, description, isStale }) => ({ name, description, isStale }));
    })(),

    appendixBSummary: (() => {
      const seenReports = new Map<string, string>();
      for (const r of reports) {
        const existing = seenReports.get(r.artifactName);
        const desc = r.notes ?? '';
        if (!existing || desc.length > existing.length) seenReports.set(r.artifactName, desc);
      }
      const now = Date.now();
      const twoYearsMs = 2 * 365 * 24 * 60 * 60 * 1000;
      const oneYearMs = 365 * 24 * 60 * 60 * 1000;
      let runLast12Mo = 0;
      let staleCount = 0;
      for (const desc of seenReports.values()) {
        const dateMatch = desc.match(/(\d{4}-\d{2}-\d{2})/);
        if (dateMatch) {
          const ts = Date.parse(dateMatch[1]);
          if (ts > 0 && now - ts < oneYearMs) runLast12Mo++;
          if (ts > 0 && now - ts > twoYearsMs) staleCount++;
        }
      }
      return { total: seenReports.size, runLast12Mo, staleCount };
    })(),

    appendixD:
      confidence.length > 0
        ? confidence.map((c) => ({
            category: c.artifactName,
            coverage: c.notes?.split(':')[0] ?? 'Unknown',
            notes: c.notes ?? '',
          }))
        : buildDynamicCoverage(findings, reportCounts),

    // V2.1 T2 sections — assembled from collector findings, null if data absent
    productDeepDive: assembleProductDeepDive(findings, reportCounts),
    bundlesDeepDive: assembleBundlesDeepDive(findings, reportCounts),
  };
}

// ============================================================================
// V2.1 Section Builders — Product Deep Dive (A-02) + Bundles Deep Dive (A-03)
// ============================================================================

/**
 * A-02: Build Product Deep Dive section data (Section 6.2).
 * Returns null if no ProductFieldUtilization findings exist (T2 conditional).
 */
function assembleProductDeepDive(
  findings: AssessmentFindingInput[],
  counts: ReportCounts
): ProductDeepDive | null {
  const utilFindings = findings.filter((f) => f.artifactType === 'ProductFieldUtilization');
  if (utilFindings.length === 0) return null;

  const totalActive = counts.activeProducts;
  if (totalActive === 0) return null;

  // Build field utilization rows in field wishlist order (fixed template order, not dynamic)
  const fieldUtilization: CheckboxRow[] = utilFindings.map((f) => {
    const count = getCountOrNull(f);
    const percentage =
      count !== null && totalActive > 0 ? `${Math.round((count / totalActive) * 100)}%` : null;
    return {
      label: f.artifactName ?? f.textValue ?? 'Unknown',
      category: getCheckboxCategory(count, totalActive),
      count,
      percentage,
      notes: f.notes ?? '',
    };
  });

  // Pricing method distribution
  const pricingMethods = ['List', 'Cost', 'Block', 'Percent of Total'];
  const pricingDistribution = pricingMethods.map((method) => {
    const methodFinding = utilFindings.find(
      (f) => f.textValue === 'SBQQ__PricingMethod__c' && (f.notes ?? '').includes(method)
    );
    // Extract count from notes if available
    const count = methodFinding
      ? methodFinding.notes?.match(new RegExp(`${method}\\s*\\((\\d+)\\)`))?.[1]
        ? Number(methodFinding.notes.match(new RegExp(`${method}\\s*\\((\\d+)\\)`))?.[1])
        : 0
      : 0;
    return {
      method,
      count,
      percentOfActive: totalActive > 0 ? `${Math.round((count / totalActive) * 100)}%` : '0%',
      complexity: method === 'Percent of Total' ? 'High' : method === 'List' ? 'Low' : 'Medium',
    };
  });

  // Subscription profile
  const subTypes = ['One-time', 'Renewable', 'Evergreen'];
  const subscriptionProfile = subTypes.map((type) => {
    const subFinding = utilFindings.find(
      (f) => f.textValue === 'SBQQ__SubscriptionType__c' && (f.notes ?? '').includes(type)
    );
    const count = subFinding
      ? subFinding.notes?.match(new RegExp(`${type}\\s*\\((\\d+)\\)`))?.[1]
        ? Number(subFinding.notes.match(new RegExp(`${type}\\s*\\((\\d+)\\)`))?.[1])
        : 0
      : 0;
    return {
      type,
      count,
      percentOfActive: totalActive > 0 ? `${Math.round((count / totalActive) * 100)}%` : '0%',
      notes: type === 'Evergreen' ? 'High complexity' : '',
    };
  });

  const dormantCount = counts.totalProducts - counts.activeProducts;
  const dormantPercent =
    counts.totalProducts > 0 ? `${Math.round((dormantCount / counts.totalProducts) * 100)}%` : '0%';

  return {
    summary: {
      activeProducts: counts.activeProducts,
      inactiveProducts: counts.totalProducts - counts.activeProducts,
      bundleCapableProducts: counts.bundleProducts,
      priceBooks:
        findings.filter(
          (f) => f.artifactType === 'DataCount' && f.artifactName?.includes('PriceBook')
        ).length > 0
          ? (findings.find(
              (f) => f.artifactType === 'DataCount' && f.artifactName?.includes('PriceBook')
            )?.countValue ?? 0)
          : 0,
      dormantPercent,
    },
    fieldUtilization,
    pricingMethodDistribution: pricingDistribution,
    subscriptionProfile,
    hasDenominatorFootnote: true,
    denominatorLabel: `Active Products (${totalActive})`,
  };
}

/**
 * A-03: Build Bundles & Options Deep Dive section data (Section 6.6).
 * Returns null if no ProductOption findings exist (T2 conditional).
 */
function assembleBundlesDeepDive(
  findings: AssessmentFindingInput[],
  counts: ReportCounts
): BundlesDeepDive | null {
  if (counts.productOptions === 0) return null;

  const totalActive = counts.activeProducts;
  const totalFeatures = findings.filter(
    (f) => f.artifactType === 'ProductFeature' || f.artifactType === 'SBQQ__ProductFeature__c'
  ).length;

  // Helper to find DataCount by name
  const dataCount = (name: string) => {
    const needle = name.toLowerCase().replace(/[\s_]/g, '');
    const f = findings.find(
      (f) =>
        f.artifactType === 'DataCount' &&
        f.artifactName?.toLowerCase().replace(/[\s_]/g, '').includes(needle)
    );
    return f?.countValue ?? 0;
  };

  const featureOrphans = dataCount('FeatureOrphan');
  const optionConstraints = dataCount('OptionConstraint');
  const optionalFor = dataCount('OptionalFor');
  const configuredBundles = counts.configuredBundles;
  const nestedBundles =
    findings.filter(
      (f) => f.artifactType === 'DataCount' && f.artifactName?.toLowerCase().includes('nested')
    ).length > 0
      ? (findings.find(
          (f) => f.artifactType === 'DataCount' && f.artifactName?.toLowerCase().includes('nested')
        )?.countValue ?? 0)
      : 0;

  const avgOptions =
    configuredBundles > 0 ? (counts.productOptions / configuredBundles).toFixed(1) : '0';

  // Build related object utilization rows
  const relatedObjectUtilization: CheckboxRow[] = [
    {
      label: 'Features',
      category: getCheckboxCategory(totalFeatures > 0 ? totalFeatures : 0, totalActive),
      count: totalFeatures,
      percentage: totalActive > 0 ? `${Math.round((totalFeatures / totalActive) * 100)}%` : null,
      notes: 'Products with features',
    },
    {
      label: 'Feature Orphans',
      category: getCheckboxCategory(featureOrphans, totalFeatures > 0 ? totalFeatures : 1),
      count: featureOrphans,
      percentage:
        totalFeatures > 0 ? `${Math.round((featureOrphans / totalFeatures) * 100)}%` : null,
      notes: 'Tech debt indicator',
    },
    {
      label: 'Bundle-capable Products',
      category: getCheckboxCategory(counts.bundleProducts, totalActive),
      count: counts.bundleProducts,
      percentage:
        totalActive > 0 ? `${Math.round((counts.bundleProducts / totalActive) * 100)}%` : null,
      notes: `${configuredBundles} configured bundles`,
    },
    {
      label: 'Nested Bundles',
      category: getCheckboxCategory(
        nestedBundles,
        counts.bundleProducts > 0 ? counts.bundleProducts : 1
      ),
      count: nestedBundles,
      percentage: null,
      notes: 'Options that are also bundles',
    },
    {
      label: 'Options',
      category: getCheckboxCategory(
        counts.productOptions,
        counts.productOptions > 0 ? counts.productOptions : 1
      ),
      count: counts.productOptions,
      percentage: null,
      notes: 'Total option records',
    },
    {
      label: 'Optional For',
      category: getCheckboxCategory(optionalFor, totalActive),
      count: optionalFor,
      percentage: totalActive > 0 ? `${Math.round((optionalFor / totalActive) * 100)}%` : null,
      notes: 'Products as options (API only)',
    },
    {
      label: 'Option Constraints',
      category:
        optionConstraints > 0
          ? getCheckboxCategory(optionConstraints, optionConstraints)
          : 'NOT_USED',
      count: optionConstraints,
      percentage: null,
      notes: '(API only)',
    },
  ];

  return {
    summary: {
      bundleCapable: counts.bundleProducts,
      configuredBundles,
      nestedBundles,
      avgOptionsPerBundle: avgOptions,
      totalOptions: counts.productOptions,
      optionsWithConstraintsPercent:
        counts.productOptions > 0
          ? `${Math.round((optionConstraints / counts.productOptions) * 100)}%`
          : '0%',
      configAttributesPercent:
        totalActive > 0
          ? `${Math.round((findings.filter((f) => f.artifactType === 'ConfigurationAttribute' || f.artifactType === 'SBQQ__ConfigurationAttribute__c').length / totalActive) * 100)}%`
          : '0%',
      configRulesPercent:
        totalActive > 0 ? `${Math.round((counts.activeProductRules / totalActive) * 100)}%` : '0%',
    },
    relatedObjectUtilization,
    hasDenominatorFootnote: true,
    denominatorLabel: `Active Products (${totalActive})`,
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
  findings: AssessmentFindingInput[],
  counts: ReportCounts
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
  // Task 2.7: 5-level status model — Active Usage, Configured, Low Usage, Detected / Unverified, Not Detected
  // V5-13: "Configured" for metadata-only detection; "Active Usage" reserved for transaction-backed evidence
  // V5-14: clarifying note distinguishes capability (ConfigurationType) from active configuration
  features.push({
    feature: 'Product Bundles',
    status: detectedBundles > 0 ? 'Configured' : 'Not Detected',
    detail:
      detectedBundles > 0
        ? `${bundleProducts} bundle-capable products (${counts.configuredBundles} with active nested options), ${optionDataCount || optionCount} product options.`
        : '',
  });

  const dsCount = count('DiscountSchedule', 'SBQQ__DiscountSchedule__c');
  features.push({
    feature: 'Discount Schedules',
    status: dsCount > 0 ? 'Configured' : 'Not Detected',
    detail: dsCount > 0 ? `${dsCount} schedules detected.` : '',
  });

  const csCount = count('CustomScript', 'SBQQ__CustomScript__c');
  // QCP is the ONE feature that keeps "Active Usage" — CustomScript records contain executable
  // JavaScript that runs on every quote calculation. This is active code injection, not metadata-only.
  features.push({
    feature: 'Custom Scripts (QCP)',
    status: csCount > 0 ? 'Active Usage' : 'Not Detected',
    detail: csCount > 0 ? `${csCount} custom scripts detected.` : '',
  });

  // V5-9: filter synthetic summary findings from template count
  const tmplFindings = findings.filter(
    (f) =>
      (f.artifactType === 'QuoteTemplate' || f.artifactType === 'SBQQ__QuoteTemplate__c') &&
      !f.findingKey?.includes('unused_templates_summary') &&
      !f.artifactName?.includes('unused_templates_summary')
  );
  const tmplCount = tmplFindings.length;
  features.push({
    feature: 'Quote Templates',
    status: tmplCount > 0 ? 'Configured' : 'Not Detected',
    detail: tmplCount > 0 ? `${tmplCount} configured templates. Usage not tracked.` : '',
  });

  const advApprovalCount = count('AdvancedApprovalRule');
  const customActionCount = count('CustomAction', 'SBQQ__CustomAction__c');
  features.push({
    feature: 'Advanced Approvals',
    status:
      advApprovalCount > 0
        ? 'Configured'
        : customActionCount > 0
          ? 'Detected / Unverified'
          : 'Not Detected',
    detail:
      advApprovalCount > 0
        ? `${advApprovalCount} advanced approval rules detected.`
        : customActionCount > 0
          ? `${customActionCount} custom action buttons detected (no advanced approvals).`
          : '',
  });

  const cpCount = count('ContractedPrice', 'SBQQ__ContractedPrice__c');
  // Task 2.7: ContractedPrice present means at least "Configured"
  const cpConfigured = findings.some(
    (f) =>
      f.artifactType === 'CPQSettingValue' &&
      f.artifactName?.includes('Contracted') &&
      f.evidenceRefs?.[0]?.label?.toLowerCase() !== 'false'
  );
  features.push({
    feature: 'Contracted Pricing',
    status: cpCount > 0 ? 'Configured' : cpConfigured ? 'Configured' : 'Not Detected',
    detail:
      cpCount > 0
        ? `${cpCount} contracted prices detected.`
        : cpConfigured
          ? 'ContractedPrice setting enabled but no records found.'
          : '',
  });

  const locCount = count('LocalizationSummary');
  features.push({
    feature: 'Multi-Language',
    status: locCount > 0 ? 'Configured' : 'Not Detected',
    detail: locCount > 0 ? `${locCount} localizations detected.` : '',
  });

  return features;
}

// ============================================================================
// Glance Dashboard Builder
// ============================================================================

/** Metric status — distinguishes true zero from unknown/unavailable (V4 Metric State Model) */
export type MetricStatus = 'present' | 'estimated' | 'not_extracted';

// ============================================================================
// V2.1 Types — Checkbox tables, Product Deep Dive, Bundles Deep Dive
// ============================================================================

/** Checkbox category for 4-column utilization tables (Section 6.2, 6.6) */
export type CheckboxCategory =
  | 'NOT_USED'
  | 'SOMETIMES'
  | 'MOST_TIMES'
  | 'ALWAYS'
  | 'NOT_APPLICABLE';

/** Thresholds for checkbox category assignment (named constants for easy tuning) */
export const CHECKBOX_THRESHOLDS = {
  SOMETIMES_MIN: 1, // 1% - 50%
  MOST_TIMES_MIN: 51, // 51% - 95%
  ALWAYS_MIN: 96, // >95%
} as const;

/**
 * Compute checkbox category from population count and total count.
 * Pure function — no side effects. Uses named threshold constants.
 */
export function getCheckboxCategory(
  populatedCount: number | null,
  totalCount: number
): CheckboxCategory {
  // null count = FLS-blocked or not computable
  if (populatedCount === null || populatedCount === undefined) return 'NOT_APPLICABLE';
  // zero denominator guard — never divide by zero
  if (totalCount <= 0) return 'NOT_APPLICABLE';
  // negative count safety
  if (populatedCount < 0) return 'NOT_APPLICABLE';

  const percentage = (populatedCount / totalCount) * 100;

  if (percentage === 0) return 'NOT_USED';
  if (percentage < CHECKBOX_THRESHOLDS.MOST_TIMES_MIN) return 'SOMETIMES';
  if (percentage < CHECKBOX_THRESHOLDS.ALWAYS_MIN) return 'MOST_TIMES';
  return 'ALWAYS';
}

/**
 * Check if a finding's count value represents accessible data.
 * Returns false if countValue is null (FLS-blocked or not extracted).
 */
export function isAccessible(finding: { countValue?: number | null }): boolean {
  return finding.countValue !== null && finding.countValue !== undefined;
}

/**
 * Get a finding's count value or null.
 * Wraps raw countValue access to prevent sentinel value leakage.
 */
export function getCountOrNull(finding: { countValue?: number | null }): number | null {
  if (finding.countValue === null || finding.countValue === undefined) return null;
  return finding.countValue;
}

/**
 * Type-aware check for whether a Salesforce field value is "populated".
 * - text: empty string or whitespace = not populated
 * - boolean: false = populated (it's a real value)
 * - number: 0 = populated
 * - picklist: "--None--" = not populated
 * - null/undefined = not populated
 */
export function isPopulated(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed !== '' && trimmed !== '--None--';
  }
  if (typeof value === 'boolean') return true; // false is a real value
  if (typeof value === 'number') return true; // 0 is a real value
  return true; // objects, arrays, etc. — populated
}

// ============================================================================
// Section Rendering Tier Registry (A-04)
// ============================================================================

/** Section keys are fixed constants — numbering never shifts when T2 sections are absent */
export type SectionKey =
  | '1'
  | '2'
  | '3'
  | '4'
  | '5'
  | '6.1'
  | '6.2'
  | '6.3'
  | '6.4'
  | '6.5'
  | '6.6'
  | '6.7'
  | '7'
  | '8'
  | '9'
  | '10'
  | '11'
  | 'appendixA'
  | 'appendixB'
  | 'appendixC'
  | 'appendixD'
  | 'appendixE';

type RenderTier = 'T1' | 'T2' | 'T3';

interface SectionConfig {
  tier: RenderTier;
  predicate: (data: ReportData) => boolean;
}

/**
 * Section render rules registry. T1 = always render. T2 = conditional.
 * T3 = never render (internal only).
 * Add a new conditional section = one entry here, no template logic changes.
 */
export const SECTION_RENDER_RULES: Record<SectionKey, SectionConfig> = {
  '1': { tier: 'T1', predicate: () => true },
  '2': { tier: 'T1', predicate: () => true },
  '3': { tier: 'T1', predicate: () => true },
  '4': { tier: 'T1', predicate: () => true },
  '5': { tier: 'T1', predicate: () => true },
  '6.1': { tier: 'T1', predicate: () => true },
  '6.2': { tier: 'T2', predicate: (data) => data.productDeepDive != null },
  '6.3': { tier: 'T1', predicate: () => true },
  '6.4': { tier: 'T1', predicate: () => true },
  '6.5': { tier: 'T1', predicate: () => true },
  '6.6': { tier: 'T2', predicate: (data) => data.bundlesDeepDive != null },
  '6.7': { tier: 'T1', predicate: () => true },
  '7': { tier: 'T1', predicate: () => true },
  '8': { tier: 'T1', predicate: () => true },
  '9': { tier: 'T1', predicate: () => true },
  '10': { tier: 'T2', predicate: () => false }, // TODO: enable when relatedFunctionality is added
  '11': { tier: 'T1', predicate: () => true },
  appendixA: { tier: 'T1', predicate: () => true },
  appendixB: { tier: 'T1', predicate: () => true },
  appendixC: { tier: 'T1', predicate: () => true },
  appendixD: { tier: 'T1', predicate: () => true },
  appendixE: { tier: 'T2', predicate: () => false }, // TODO: enable when objectConfiguration is added
};

/**
 * Check if a section should be rendered.
 * Pure, deterministic — always returns the same result for the same data.
 */
export function isSectionEnabled(section: SectionKey, data: ReportData): boolean {
  const config = SECTION_RENDER_RULES[section];
  if (!config) return false;
  if (config.tier === 'T3') return false;
  return config.predicate(data);
}

/** A single row in a checkbox utilization table */
export interface CheckboxRow {
  label: string;
  category: CheckboxCategory;
  count: number | null; // null = FLS-blocked / not applicable
  percentage: string | null; // null = not computable
  notes: string;
  isNested?: boolean; // indented sub-item (e.g., Pricing Method → List)
}

/** Product Deep Dive data (Section 6.2) — T2 conditional, null if absent */
export interface ProductDeepDive {
  summary: {
    activeProducts: number;
    inactiveProducts: number;
    bundleCapableProducts: number;
    priceBooks: number;
    dormantPercent: string;
  };
  fieldUtilization: CheckboxRow[];
  pricingMethodDistribution: Array<{
    method: string;
    count: number;
    percentOfActive: string;
    complexity: string;
  }>;
  subscriptionProfile: Array<{
    type: string;
    count: number;
    percentOfActive: string;
    notes: string;
  }>;
  hasDenominatorFootnote: boolean; // structural validator field (V32)
  denominatorLabel: string; // e.g., "Active Products (176)"
}

/** Bundles & Options Deep Dive data (Section 6.6) — T2 conditional, null if absent */
export interface BundlesDeepDive {
  summary: {
    bundleCapable: number;
    configuredBundles: number;
    nestedBundles: number;
    avgOptionsPerBundle: string;
    totalOptions: number;
    optionsWithConstraintsPercent: string;
    configAttributesPercent: string;
    configRulesPercent: string;
  };
  relatedObjectUtilization: CheckboxRow[];
  hasDenominatorFootnote: boolean;
  denominatorLabel: string;
}

/**
 * Canonical report counts — computed once, shared across glance and section builders.
 * Ensures At-a-Glance numbers always match section detail.
 *
 * ENFORCEMENT RULE: No assembler function may independently count findings for
 * any metric covered by ReportCounts. All access goes through `counts.X`.
 */
export interface ReportCounts {
  // Products
  totalProducts: number;
  activeProducts: number;
  activeProductSource: 'IsActive' | 'inferred' | 'unknown';
  activeProductStatus: MetricStatus;
  bundleProducts: number; // 76 = bundle-capable (ConfigurationType set)
  configuredBundles: number; // ~19 = products with actual child options
  productOptions: number;
  productFamilies: number;

  // Rules
  activePriceRules: number;
  totalPriceRules: number;
  activeProductRules: number;
  totalProductRules: number;

  // Usage (90-day scope)
  totalQuotes: number;
  totalQuoteLines: number;
  activeUsers: number;
  activeUsersSource: 'UserAdoption' | 'UserBehavior' | 'unknown';
  activeUserStatus: MetricStatus;

  // Discount schedules
  discountScheduleTotal: number;
  discountScheduleUnique: number;

  // Packages
  sbaaInstalled: boolean;
  sbaaVersionRaw: string | null;
  sbaaVersionDisplay: string;

  // Code & automation
  approvalRuleCount: number;
  flowCountActive: number;
  flowCountCpqRelated: number;
  validationRuleCount: number;
  apexClassCount: number;
  triggerCount: number;
}

function buildGlanceSections(
  findings: AssessmentFindingInput[],
  _settingValues: AssessmentFindingInput[],
  technicalDebt: Array<{ category: string; count: number; detail: string }>,
  featureUtilization: Array<{ feature: string; status: string; detail: string }>,
  counts: ReportCounts
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
        // A8: conditional label — "Products Extracted" when inferred, "Active Products" when from IsActive
        label: counts.activeProductSource === 'inferred' ? 'Products Extracted' : 'Active Products',
        value:
          counts.activeProductStatus === 'not_extracted'
            ? 'Not extracted'
            : String(counts.activeProducts),
        confidence:
          counts.activeProductSource === 'IsActive'
            ? 'Confirmed'
            : counts.activeProductSource === 'inferred'
              ? 'Estimated'
              : 'Not extracted',
      },
      {
        label: 'Bundle-capable Products',
        value:
          counts.bundleProducts > 0
            ? `${counts.bundleProducts} (${counts.configuredBundles} with options)`
            : bundleCount > 0
              ? 'Detected'
              : '0',
        confidence: counts.bundleProducts > 0 ? 'Confirmed' : 'Estimated',
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
        value: String(counts.activePriceRules),
        confidence: 'Confirmed',
      },
      {
        label: 'Product Rules (Active)',
        value: String(counts.activeProductRules),
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
      // Task 2.1: Avg Lines / Quote
      {
        label: 'Avg Lines / Quote',
        value:
          counts.totalQuotes > 0 && counts.totalQuoteLines > 0
            ? String(Math.round((counts.totalQuoteLines / counts.totalQuotes) * 10) / 10)
            : 'N/A',
        confidence:
          counts.totalQuotes > 0 && counts.totalQuoteLines > 0 ? 'Confirmed' : 'Not extracted',
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
      // A4: Active Users — uses canonical counts.activeUsers for both warning and glance
      {
        label:
          counts.activeUsersSource === 'UserBehavior'
            ? 'Active Users (90d) (Estimated)'
            : 'Active Users (90d)',
        value:
          counts.activeUserStatus === 'not_extracted'
            ? 'Not extracted'
            : String(counts.activeUsers),
        confidence:
          counts.activeUsersSource === 'UserAdoption'
            ? 'Confirmed'
            : counts.activeUsersSource === 'UserBehavior'
              ? 'Estimated'
              : 'Not extracted',
      },
    ],
    'Automation & Code': [
      { label: 'Active Triggers', value: String(count('ApexTrigger')), confidence: 'Confirmed' },
      {
        label: 'Active Flows',
        value: (() => {
          const cpqFlows = count('Flow');
          // Check for non-CPQ summary finding OR count from flow summary in notes
          const summaryFlow = findings.find(
            (f) =>
              f.artifactType === 'Flow' &&
              (f.findingKey?.includes('non_cpq_summary') ||
                f.artifactName?.includes('additional active flows'))
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
  // Task 1.2: dependency domain → customizationLevel (was technicalDebt)
  const customScore = Math.max(score('customization'), score('dependency'));
  const usageScore = score('usage');
  // Task 1.2: technicalDebt from actual debt indicators, not code volume
  const techDebtScore = scoreTechnicalDebt(findings);

  const overall = Math.round(
    catalogScore * 0.25 +
      pricingScore * 0.25 +
      customScore * 0.2 +
      usageScore * 0.15 +
      techDebtScore * 0.15
  );

  return {
    overall,
    configurationDepth: catalogScore,
    pricingLogic: pricingScore,
    customizationLevel: customScore,
    dataVolumeUsage: usageScore,
    technicalDebt: techDebtScore,
  };
}

/**
 * Score technical debt from actual debt indicators (Task 1.2):
 * dormant products, inactive rules, stale/test rules, duplicate schedules.
 */
function scoreTechnicalDebt(findings: AssessmentFindingInput[]): number {
  let debtSignals = 0;
  let totalRelevant = 0;

  for (const f of findings) {
    const isRule =
      f.artifactType === 'PriceRule' ||
      f.artifactType === 'SBQQ__PriceRule__c' ||
      f.artifactType === 'ProductRule' ||
      f.artifactType === 'SBQQ__ProductRule__c';
    const isProduct = f.artifactType === 'Product2';
    const isDS =
      f.artifactType === 'DiscountSchedule' || f.artifactType === 'SBQQ__DiscountSchedule__c';

    if (isRule || isProduct || isDS) {
      totalRelevant++;
      if (f.usageLevel === 'dormant' || f.notes?.includes('Inactive')) debtSignals++;
      if (TECH_DEBT_PATTERNS.test(f.artifactName)) debtSignals++;
    }
  }

  // Check duplicate discount schedule names
  const dsNames = findings
    .filter(
      (f) => f.artifactType === 'DiscountSchedule' || f.artifactType === 'SBQQ__DiscountSchedule__c'
    )
    .map((f) => f.artifactName);
  const dsNameCounts = new Map<string, number>();
  for (const n of dsNames) dsNameCounts.set(n, (dsNameCounts.get(n) ?? 0) + 1);
  const dupeDS = [...dsNameCounts.values()].filter((c) => c > 1).reduce((s, c) => s + c, 0);
  debtSignals += dupeDS;
  totalRelevant += dupeDS;

  if (totalRelevant === 0) return 0;
  return Math.min(100, Math.round((debtSignals / totalRelevant) * 100));
}

// ============================================================================
// Scoring Methodology Table
// ============================================================================

function buildScoringMethodology(
  scores: ReportData['executiveSummary']['complexityScores'],
  _findings: AssessmentFindingInput[],
  technicalDebt: Array<{ category: string; count: number; detail: string }>,
  counts: ReportCounts
): ReportData['executiveSummary']['scoringMethodology'] {
  // A5: use canonical counts for complexity rationale — no independent counting
  const csCount = _findings.filter(
    (f) => f.artifactType === 'CustomScript' || f.artifactType === 'SBQQ__CustomScript__c'
  ).length;

  const debtSummary = technicalDebt.map((d) => `${d.count} ${d.category.toLowerCase()}`).join(', ');

  // A5: options text uses canonical count — eliminates "no product options" contradiction
  const optionText =
    counts.productOptions > 0
      ? `${counts.productOptions} product options`
      : 'product options not extracted';

  return [
    {
      dimension: 'Configuration Depth',
      weight: 25,
      score: scores.configurationDepth,
      drivers: 'Product catalog size, bundle nesting, option constraints, config attributes',
      rationale: `Score reflects ${counts.totalProducts} total products (${counts.activeProducts} active), ${counts.bundleProducts} bundle-capable products, and ${optionText}. ${counts.bundleProducts > 50 ? 'High bundle density increases configuration complexity.' : 'Moderate configuration surface area.'}`,
    },
    {
      dimension: 'Pricing Logic',
      weight: 25,
      score: scores.pricingLogic,
      drivers: 'Price rules, discount schedules, custom scripts (QCP), contracted pricing',
      rationale: `Score reflects ${counts.totalPriceRules} price rules, ${counts.discountScheduleTotal} discount schedules${csCount > 0 ? `, and ${csCount} custom script(s) (QCP)` : ''}. ${csCount > 0 ? 'QCP presence significantly elevates pricing complexity.' : 'Standard pricing rule configuration.'}`,
    },
    {
      dimension: 'Customization Level',
      weight: 20,
      score: scores.customizationLevel,
      drivers:
        'Apex class count, trigger count, flow complexity, code dependencies, custom fields, validation rules',
      rationale: `Score reflects ${counts.apexClassCount} Apex classes, ${counts.triggerCount} triggers, and ${counts.flowCountCpqRelated} flows referencing CPQ objects. ${counts.apexClassCount > 30 ? 'Substantial custom code dependency detected.' : 'Moderate customization footprint.'}`,
    },
    {
      dimension: 'Data Volume & Usage',
      weight: 15,
      score: scores.dataVolumeUsage,
      drivers: 'Quote volume, line count, user adoption, discount patterns',
      rationale: `Score reflects ${counts.totalQuotes} quotes in the 90-day assessment window. ${counts.totalQuotes < 50 ? 'Low volume — some metrics may not be statistically meaningful.' : 'Adequate sample for usage analysis.'}`,
    },
    {
      dimension: 'Technical Debt',
      weight: 15,
      score: scores.technicalDebt,
      drivers:
        'Inactive price rules, stale/test rules, duplicate discount schedules, dormant products',
      rationale:
        debtSummary.length > 0
          ? `Score reflects ${debtSummary}. ${technicalDebt.length > 3 ? 'Multiple debt categories indicate cleanup opportunity.' : 'Manageable debt footprint.'}`
          : 'No significant technical debt indicators detected.',
    },
  ];
}

// ============================================================================
// Default Key Findings (when no hotspots detected)
// ============================================================================

function buildDefaultKeyFindings(
  findings: AssessmentFindingInput[],
  settings: AssessmentFindingInput[],
  plugins: AssessmentFindingInput[],
  counts: ReportCounts
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

  // Use canonical counts (A3)
  const activePR = counts.activePriceRules;
  const activeProdR = counts.activeProductRules;

  // First finding: analytical observation, not extraction status
  if (hasQcp) {
    // V6-1: Prefer the configured QCP class name from CPQSettingValue finding over alphabetical CustomScript order
    const qcpSettingFinding = settings.find(
      (s) => s.artifactName === 'Quote Calculator Plugin' || s.artifactName?.includes('QCP')
    );
    const configuredQcpClass = qcpSettingFinding?.evidenceRefs?.[0]?.label
      ? String(qcpSettingFinding.evidenceRefs[0].label)
      : null;
    // A-06: Use configured class name from settings. Fall back to SINGLE script name (never concatenate).
    const scriptName =
      configuredQcpClass ??
      (qcpScripts.length > 0
        ? `${qcpScripts[0].artifactName} (from CustomScript)`
        : (qcpPlugin?.notes?.match(/class:\s*(\S+)/)?.[1] ?? ''));
    const allScriptNames = qcpScripts.map((s) => s.artifactName).join(', ');
    kf.push({
      title: `Custom Quote Calculator Plugin (QCP) active${scriptName ? `: ${scriptName}` : ''}`,
      detail: `${qcpScripts.length} custom script(s) with JavaScript-based pricing logic injected into every calculation${allScriptNames ? ` (${allScriptNames})` : ''} — indicating a fundamentally different complexity profile than standard CPQ configuration.`,
      confidence: 'Confirmed',
    });
  }

  if (counts.totalPriceRules > 0 || counts.totalProductRules > 0) {
    kf.push({
      title: `${activePR} active price rules and ${activeProdR} active product rules detected`,
      detail: `${activePR} price rules and ${activeProdR} product rules actively configured — indicating significant business logic encoded in CPQ rule configuration.`,
      confidence: 'Confirmed',
    });
  }

  const dormantProducts = counts.totalProducts - counts.activeProducts;
  if (counts.totalProducts > 0 && dormantProducts > counts.totalProducts * 0.2) {
    kf.push({
      title: `Product catalog shows ${Math.round((dormantProducts / counts.totalProducts) * 100)}% dormancy`,
      detail: `${dormantProducts} of ${counts.totalProducts} products were not quoted in the 90-day window — suggesting significant catalog dormancy that may warrant cleanup.`,
      confidence: 'Confirmed',
    });
  }

  if (settings.length > 0) {
    const multiCurrency = settings.find((s) => s.artifactName?.includes('Multi-Currency'));
    if (multiCurrency?.notes?.includes('Enabled')) {
      kf.push({
        title: 'Multi-currency enabled',
        detail:
          'The org uses multi-currency pricing — adding complexity to field mapping, exchange rate handling, and multi-currency price book structures.',
        confidence: 'Confirmed',
      });
    }
  }

  // Apex/custom code density — use canonical count (A3)
  if (counts.apexClassCount > 20 && kf.length < 5) {
    kf.push({
      title: `${counts.apexClassCount} Apex classes reference CPQ objects`,
      detail: `${counts.apexClassCount} Apex classes reference CPQ objects — indicating substantial custom code dependency beyond standard CPQ configuration.`,
      confidence: 'Confirmed',
    });
  }

  // Ensure at least 3 findings with analytical observations
  // Task 2.4: synthesis with >=2 facts + 1 implication
  // A3: use counts.activeProducts with "active products" label; "X families with active products"
  if (counts.totalProducts > 0 && kf.length < 5) {
    const families = new Set(
      findings
        .filter((f) => f.artifactType === 'Product2')
        .map((f) => safeRefs(f).find((r) => String(r.value) === 'Product2.Family')?.label)
        .filter(Boolean)
    );
    // V6-4: Use quoting activity (same as Section 6.1 dormantFamilies) not usageLevel
    const quotedProductNames = new Set(
      findings.filter((f) => f.artifactType === 'TopQuotedProduct').map((f) => f.artifactName)
    );
    const dormantFamilyCount = [...families].filter((fam) => {
      const familyProducts = findings.filter(
        (f) =>
          f.artifactType === 'Product2' &&
          safeRefs(f).find((r) => String(r.value) === 'Product2.Family')?.label === fam
      );
      return (
        familyProducts.length > 0 &&
        familyProducts.every((p) => !quotedProductNames.has(p.artifactName))
      );
    }).length;
    const dormantNote =
      dormantFamilyCount > 0
        ? ` ${dormantFamilyCount} families show zero quoting activity in the assessment window — indicating potential catalog dormancy or narrow active use-case.`
        : '';
    const productLabel =
      counts.activeProductSource === 'IsActive' ? 'active products' : 'products extracted';
    kf.push({
      title: `${counts.activeProducts} ${productLabel} across ${counts.productFamilies} families`,
      detail: dormantNote
        ? `Product catalog spans ${counts.productFamilies} families with active products.${dormantNote}`
        : `Product catalog spans ${counts.productFamilies} families with active products — indicating a broad product portfolio under CPQ management.`,
      confidence: counts.activeProductSource === 'IsActive' ? 'Confirmed' : 'Estimated',
    });
  }

  while (kf.length < 3) {
    kf.push({
      title: `CPQ environment spans ${new Set(findings.map((f) => f.domain)).size} configuration domains`,
      detail: `${totalFindings} configuration artifacts assessed across product catalog, pricing, approvals, custom code, and usage analytics — indicating a broad CPQ implementation footprint.`,
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
  plugins: AssessmentFindingInput[],
  counts: ReportCounts
): Array<{ name: string; severity: string; analysis: string }> {
  const hotspots: Array<{ name: string; severity: string; analysis: string }> = [];

  if (priceRules.length > 0 && productRules.length > 0) {
    const activePR = priceRules.filter(
      (r) => r.usageLevel !== 'dormant' && !r.notes?.includes('Inactive')
    ).length;
    const activeProdR = productRules.filter(
      (r) => r.usageLevel !== 'dormant' && !r.notes?.includes('Inactive')
    ).length;
    hotspots.push({
      name: 'Quote Pricing Engine',
      severity: customScripts.length > 0 ? 'Critical' : 'High',
      analysis: `${activePR} active Price Rules + ${activeProdR} active Product Rules + ${discountSchedules.length} Discount Schedules${customScripts.length > 0 ? ` + ${customScripts.length} Custom Scripts (QCP)` : ''} form a multi-layered calculation chain.`,
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

  // Task 2.10: Bundle/option density hotspot
  const bundleHotspotCount = findings.filter(
    (f) => f.artifactType === 'Product2' && f.complexityLevel === 'medium'
  ).length;
  const optHotspotCount =
    findings.filter(
      (f) => f.artifactType === 'ProductOption' || f.artifactType === 'SBQQ__ProductOption__c'
    ).length ||
    (findings.find(
      (f) => f.artifactType === 'DataCount' && f.artifactName?.toLowerCase().includes('option')
    )?.countValue ??
      0);
  if (bundleHotspotCount > 50 || optHotspotCount > 200) {
    hotspots.push({
      name: 'Bundle & Option Configuration',
      severity: 'High',
      analysis: `${bundleHotspotCount} bundle-capable products (${counts.configuredBundles} with active nested options) and ${optHotspotCount} product options, enforced by Selection, Validation, Filter, and Alert product rules. Nested bundle configurations increase quote calculation complexity and UI surface area.`,
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
  // (1) CPQ Custom Action buttons — these are NOT approval rules (Task 0.1)
  const customActionFindings = findings.filter(
    (f) => f.artifactType === 'CustomAction' || f.artifactType === 'SBQQ__CustomAction__c'
  );

  // (2) Advanced Approval Rules (sbaa__ApprovalRule__c)
  const advancedApprovalFindings = findings.filter(
    (f) => f.artifactType === 'AdvancedApprovalRule'
  );

  // (3) Standard Approval Processes (ProcessDefinition on CPQ objects)
  const standardApprovalFindings = findings.filter((f) => f.artifactType === 'ApprovalProcess');

  // (4) Approval chain/approver summary from AdvancedApprovals summary finding
  const approvalSummary = findings.find(
    (f) => f.artifactType === 'AdvancedApprovals' && f.artifactName === 'advanced_approvals_summary'
  );
  const chainCount = Number(approvalSummary?.notes?.match(/(\d+)\s*chains?/)?.[1] ?? 0);
  const approverCount = Number(approvalSummary?.notes?.match(/(\d+)\s*approvers?/)?.[1] ?? 0);

  // Quote templates from templates collector — V5-9: filter out synthetic summary findings
  const allQuoteTemplates = findings.filter(
    (f) => f.artifactType === 'QuoteTemplate' || f.artifactType === 'SBQQ__QuoteTemplate__c'
  );
  // quoteTemplates = actual template records (excluding synthetic summary findings)
  const quoteTemplates = allQuoteTemplates.filter(
    (f) =>
      !f.findingKey?.includes('unused_templates_summary') &&
      !f.artifactName?.includes('unused_templates_summary')
  );
  // V6-3: totalTemplateRecords should match Appendix A count — replicate inventory builder's
  // counting logic (max of countValue, plus increments for null-countValue findings)
  const totalTemplateRecords = (() => {
    let count = 0;
    for (const f of allQuoteTemplates) {
      if (f.countValue != null && f.countValue > 0) {
        count = Math.max(count, f.countValue);
      } else {
        count++;
      }
    }
    return count;
  })();
  const usableTemplates = quoteTemplates.filter(
    (f) => !TECH_DEBT_PATTERNS.test(f.artifactName) && f.usageLevel !== 'dormant'
  );

  // DocuSign status from plugins
  const docuSignPlugin = plugins.find(
    (p) => p.artifactName?.includes('Electronic') && (p.countValue ?? 0) > 0
  );

  return {
    customActions: customActionFindings.map((a) => ({
      name: a.artifactName,
      type: a.notes?.match(/Type:\s*([^,]+)/)?.[1]?.trim() ?? 'Unknown',
      location: a.notes?.match(/Location:\s*([^,]+)/)?.[1]?.trim() ?? '',
      status: a.usageLevel === 'dormant' || a.notes?.includes('INACTIVE') ? 'Inactive' : 'Active',
    })),
    advancedApprovalRules: advancedApprovalFindings.map((r) => ({
      name: r.artifactName,
      conditions: r.countValue ?? 0,
      status: r.usageLevel === 'dormant' ? 'Inactive' : 'Active',
      targetObject: safeRefs(r).find((ref) => String(ref.label) === 'TargetObject')?.value
        ? String(safeRefs(r).find((ref) => String(ref.label) === 'TargetObject')!.value)
        : (r.notes?.match(/Target:\s*(\S+)/)?.[1] ?? ''),
    })),
    approvalChains: { count: chainCount, approvers: approverCount },
    approvalRules: standardApprovalFindings.map((r) => ({
      name: r.artifactName,
      object: r.notes?.match(/on\s+(\w+)/)?.[1] ?? '',
      status: r.notes?.includes('ACTIVE') ? 'Active' : 'Inactive',
    })),
    quoteTemplates: quoteTemplates.map((t) => {
      // Task 3.4: surface LastModifiedDate from evidence refs
      const lmd = t.evidenceRefs?.find((ref) => ref.label === 'LastModifiedDate')?.value;
      const formattedDate = lmd && lmd !== '' ? lmd.split('T')[0] : 'Not available';
      return {
        name: t.artifactName,
        isDefault: t.notes?.includes('Default') ?? false,
        lastModified: formattedDate,
      };
    }),
    documentGeneration: {
      templateCount: quoteTemplates.length,
      totalTemplateRecords: totalTemplateRecords,
      usableTemplateCount: usableTemplates.length,
      docuSignActive: !!docuSignPlugin,
    },
  };
}

// ============================================================================
// Dynamic Extraction Coverage (replaces hardcoded "Full" defaults)
// ============================================================================

function buildDynamicCoverage(
  findings: AssessmentFindingInput[],
  counts: ReportCounts
): ReportData['appendixD'] {
  const domainSet = new Set<string>(findings.map((f) => f.domain));

  // Task 1.7: per-category specific checks (not generic count > 5)
  const has = (...types: string[]) => findings.some((f) => types.includes(f.artifactType));

  // Product Catalog (A7: explicit Full/Partial/Minimal model)
  const hasCatalog = has('Product2');
  const hasOptions = counts.productOptions > 0;
  const hasRules = counts.totalProductRules > 0;
  let catalogCov: string;
  let catalogNotes: string;
  if (!hasCatalog) {
    catalogCov = 'Not extracted';
    catalogNotes = 'Product Catalog collector did not produce findings.';
  } else if (hasOptions && hasRules) {
    catalogCov = 'Full';
    catalogNotes = `Products, bundles, ${counts.productOptions} options, ${counts.totalProductRules} product rules.`;
  } else if (hasCatalog && !hasOptions && !hasRules) {
    catalogCov = 'Minimal';
    catalogNotes = 'Product counts available. Options and rules not extracted.';
  } else {
    catalogCov = 'Partial';
    catalogNotes = `Products extracted${hasOptions ? `, ${counts.productOptions} options` : ', options not extracted'}${hasRules ? `, ${counts.totalProductRules} rules` : ', rules not extracted'}.`;
  }

  // Pricing & Rules (Task 1.7, 2.15)
  const hasPR = has('PriceRule', 'SBQQ__PriceRule__c');
  const hasDS = has('DiscountSchedule', 'SBQQ__DiscountSchedule__c');
  const hasCS = has('CustomScript', 'SBQQ__CustomScript__c');
  const pricingCov =
    hasPR && hasDS && hasCS
      ? 'Full'
      : hasPR || hasDS
        ? 'Partial'
        : domainSet.has('pricing')
          ? 'Partial'
          : 'Not extracted';
  const pricingNotes = `Price rules${hasPR ? '' : ' (not extracted)'}, discount schedules${hasDS ? '' : ' (not extracted)'}, custom scripts${hasCS ? '' : ' (not extracted)'}. Price rule usage frequency: Not extracted — requires rule-to-quote linkage data.`;

  // Transactional Data (Task 1.7)
  const hasQuotes =
    has('DataCount') &&
    findings.some((f) => f.artifactType === 'DataCount' && f.artifactName?.includes('Quote'));
  const hasUserBehavior = has('UserBehavior');
  const txCov = hasQuotes ? 'Partial' : domainSet.has('usage') ? 'Partial' : 'Not extracted';
  const txNotes = `90-day quotes${hasQuotes ? '' : ' (not extracted)'}, quote lines, usage trends. Quote modification history and field-level change tracking not extracted.`;

  // Custom Fields & Validation (Task 1.7)
  const hasVR = has('ValidationRule');
  const hasFF = has('FormulaField');
  const hasFC = has('FieldCompleteness');
  const cfCov =
    hasVR && hasFF && hasFC
      ? 'Full'
      : hasVR || hasFF
        ? 'Partial'
        : domainSet.has('customization')
          ? 'Partial'
          : 'Not extracted';
  const cfNotes = `Custom fields, validation rules${hasVR ? '' : ' (not extracted)'}, formulas${hasFF ? '' : ' (not extracted)'}. ${!hasFC ? 'Field completeness not extracted — requires full schema scan.' : ''}`;

  // Custom Code (Task 1.7, 2.16)
  const hasApex = has('ApexClass');
  const hasTrigger = has('ApexTrigger');
  const hasFlow = has('Flow');
  const codeCov =
    hasApex && hasTrigger && hasFlow
      ? 'Full'
      : hasApex || hasTrigger
        ? 'Partial'
        : domainSet.has('dependency')
          ? 'Partial'
          : 'Not extracted';
  const codeNotes = `Apex classes${hasApex ? '' : ' (not extracted)'}, triggers${hasTrigger ? '' : ' (not extracted)'}, flows${hasFlow ? '' : ' (not extracted)'}. Apex class → SBQQ object dependencies: Not extracted — requires code-level analysis.`;

  // Quote Templates (Task 1.7)
  const hasTemplate = has('QuoteTemplate', 'SBQQ__QuoteTemplate__c');
  const hasSection = has('TemplateSection', 'SBQQ__TemplateSection__c');
  const tmplCov =
    hasTemplate && hasSection
      ? 'Full'
      : hasTemplate
        ? 'Partial'
        : domainSet.has('templates')
          ? 'Partial'
          : 'Not extracted';
  const tmplNotes = `Template structure${hasTemplate ? '' : ' (not extracted)'}, sections${hasSection ? '' : ' (not extracted)'}, content.`;

  // Advanced Approvals (Task 1.6)
  const hasAAR = has('AdvancedApprovalRule');
  const hasCA = has('CustomAction', 'SBQQ__CustomAction__c');
  const approvalCov =
    hasAAR && hasCA
      ? 'Partial'
      : hasCA && !hasAAR
        ? 'Partial'
        : hasAAR && !hasCA
          ? 'Partial'
          : domainSet.has('approvals')
            ? 'Partial'
            : 'Not extracted';
  const approvalNotes =
    hasAAR && hasCA
      ? 'Approval rules, conditions, chains, custom actions extracted. Approval-to-quote usage linkage not surfaced.'
      : hasCA && !hasAAR
        ? 'Approval action buttons detected; sbaa approval rules and chains not yet extracted.'
        : hasAAR && !hasCA
          ? 'Approval rules extracted; custom action buttons not extracted.'
          : 'Approvals collector did not produce findings.';

  const simpleCoverage = (
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
    return { category: label, coverage: 'Full', notes };
  };

  return [
    { category: 'Product Catalog', coverage: catalogCov, notes: catalogNotes },
    { category: 'Pricing & Rules', coverage: pricingCov, notes: pricingNotes },
    { category: 'Transactional Data', coverage: txCov, notes: txNotes },
    { category: 'Custom Fields & Validation', coverage: cfCov, notes: cfNotes },
    { category: 'Custom Code', coverage: codeCov, notes: codeNotes },
    { category: 'Quote Templates', coverage: tmplCov, notes: tmplNotes },
    { category: 'Advanced Approvals', coverage: approvalCov, notes: approvalNotes },
    simpleCoverage('settings', 'CPQ Package Settings', 'Custom settings, plugin configuration.'),
    simpleCoverage('integration', 'Integrations', 'Named credentials, platform events.'),
    simpleCoverage('order-lifecycle', 'Order Lifecycle', 'Orders, contracts, subscriptions.'),
    simpleCoverage('localization', 'Localization', 'Multi-language translations, custom labels.'),
    {
      category: 'User Behavior',
      coverage: hasUserBehavior ? 'Partial' : 'Not extracted',
      notes:
        'Derived from audit trail sampling. Full user session analysis and adoption scoring not extracted.',
    },
    // V5-16: honestly document product rule complexity as not extracted
    {
      category: 'Product Rule Complexity',
      coverage: 'Not extracted',
      notes:
        'Product rule structural complexity: Not extracted — requires condition/action scope analysis beyond current metadata extraction.',
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
  AdvancedApprovalRule: 'sbaa__ApprovalRule__c',
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
  'AdvancedApprovals',
]);

function buildObjectInventoryInline(
  findings: AssessmentFindingInput[],
  counts: ReportCounts
): ReportData['appendixA'] {
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

  // V5-5: override Flow count with canonical flowCountActive from ReportCounts
  if (objectMap.has('Flow') && counts.flowCountActive > 0) {
    const flowEntry = objectMap.get('Flow')!;
    flowEntry.count = counts.flowCountActive;
  }

  // V5-15: override approval rule count with canonical approvalRuleCount from ReportCounts
  const aarKey = objectMap.has('sbaa__ApprovalRule__c')
    ? 'sbaa__ApprovalRule__c'
    : 'AdvancedApprovalRule';
  if (objectMap.has(aarKey) && counts.approvalRuleCount > 0) {
    const aarEntry = objectMap.get(aarKey)!;
    aarEntry.count = counts.approvalRuleCount;
  }

  return [...objectMap.entries()]
    .sort((a, b) => b[1].count - a[1].count)
    .map(([name, data], i) => ({
      id: i + 1,
      objectName: name === 'Product2' ? `${name} (total records)` : name,
      apiName: name,
      count: data.count,
      complexity: data.complexity,
      confidence: 'Confirmed',
      isCpqObject: isCpqObjectName(name),
      phase: CPQ_PHASE_MAP[name] ?? '',
    }));
}

// ============================================================================
// Org-Specific Lifecycle (S5.1)
// ============================================================================

function buildLifecycle(
  findings: AssessmentFindingInput[],
  plugins: AssessmentFindingInput[]
): Array<{ step: number; description: string }> {
  const hasDocuSign = plugins.some(
    (p) => p.artifactName?.includes('Electronic') && (p.countValue ?? 0) > 0
  );
  const hasApprovals =
    findings.filter(
      (f) => f.artifactType === 'CustomAction' || f.artifactType === 'SBQQ__CustomAction__c'
    ).length > 0;
  const hasQcp = findings.some(
    (f) => f.artifactType === 'SBQQ__CustomScript__c' || f.artifactType === 'CustomScript'
  );
  const hasBundles = findings.some(
    (f) => f.artifactType === 'Product2' && f.complexityLevel === 'medium'
  );

  return [
    { step: 1, description: 'Lead qualified → converted to Account, Contact, Opportunity.' },
    {
      step: 2,
      description: 'Sales Rep creates Quote from Opportunity.',
    },
    {
      step: 3,
      description: `Quote Line Editor: products added${hasBundles ? ', bundles configured with nested options' : ''}. Product rules enforce selection and validation constraints.`,
    },
    {
      step: 4,
      description: `Pricing engine executes: price rules calculate adjustments, discount schedules apply tiered discounts${hasQcp ? ', QCP custom JavaScript injects additional pricing logic' : ''}.`,
    },
    {
      step: 5,
      description: hasApprovals
        ? 'Approval routing via Advanced Approvals (sbaa) — multi-level chains with condition-based routing.'
        : 'Approval routing (if required).',
    },
    {
      step: 6,
      description: hasDocuSign
        ? 'Quote PDF generated from configured templates → DocuSign envelope created for e-signature.'
        : 'Quote PDF generated → Document signing.',
    },
    { step: 7, description: 'Quote accepted → Order auto-created.' },
  ];
}

// ============================================================================
// Quoting Activity Metrics (S7.1 — expanded from 1 to 13 metrics)
// ============================================================================

function buildQuotingActivityMetrics(
  findings: AssessmentFindingInput[],
  trends: AssessmentFindingInput[],
  totalQuotes: number
): Array<{ metric: string; value: string; trend: string; confidence: string }> {
  const metrics: Array<{ metric: string; value: string; trend: string; confidence: string }> = [];

  // Find usage overview
  const usageOverview = findings.find((f) => f.artifactType === 'UsageOverview');
  const getRefs = (label: string) =>
    usageOverview?.evidenceRefs?.find((r) => r.label === label)?.value;

  // Quote volume
  metrics.push({
    metric: 'Quotes Created',
    value: String(totalQuotes || getRefs('totalQuotes') || '0'),
    trend:
      trends
        .find((t) => t.artifactName?.includes('Quote'))
        ?.evidenceRefs?.find((r) => r.label === 'Trend')?.value ?? 'Stable',
    confidence: 'Confirmed',
  });

  // Quote lines
  const qlCount = findings.find(
    (f) =>
      f.artifactType === 'DataCount' &&
      f.artifactName?.toLowerCase().replace(/\s/g, '').includes('quoteline')
  )?.countValue;
  metrics.push({
    metric: 'Quote Lines',
    value: qlCount != null ? String(qlCount) : 'Not extracted',
    trend: 'N/A',
    confidence: qlCount != null ? 'Confirmed' : 'Not extracted',
  });

  // Avg/Max lines per quote
  const avgLines = getRefs('avgQuoteLinesPerQuote');
  if (avgLines) {
    metrics.push({
      metric: 'Avg Lines per Quote',
      value: avgLines,
      trend: 'N/A',
      confidence: 'Confirmed',
    });
  }
  const maxLines = getRefs('maxQuoteLinesPerQuote');
  if (maxLines) {
    metrics.push({
      metric: 'Max Lines per Quote',
      value: maxLines,
      trend: 'N/A',
      confidence: 'Confirmed',
    });
  }

  // Conversion rate
  const orderRate = getRefs('quoteToOrderRate');
  if (orderRate) {
    metrics.push({
      metric: 'Quote-to-Order Rate',
      value: `${orderRate}%`,
      trend: 'N/A',
      confidence: 'Confirmed',
    });
  }

  // Primary quote rate
  const primaryRate = getRefs('primaryQuoteRate');
  if (primaryRate) {
    metrics.push({
      metric: 'Primary Quote Rate',
      value: `${primaryRate}%`,
      trend: 'N/A',
      confidence: 'Confirmed',
    });
  }

  // Discounting frequency
  const discFreq = getRefs('discountingFrequency');
  if (discFreq) {
    metrics.push({
      metric: 'Discounted Quotes',
      value: `${discFreq}%`,
      trend: 'N/A',
      confidence: 'Confirmed',
    });
  }

  // Modification rate
  const modRate = getRefs('quoteModificationRate');
  metrics.push({
    metric: 'Quote Modification Rate',
    value:
      modRate != null
        ? `${modRate}%`
        : 'Not assessed — requires Field History Tracking on SBQQ__Quote__c',
    trend: 'N/A',
    confidence: modRate != null ? 'Confirmed' : 'Not extracted',
  });

  // Trend metrics
  for (const t of trends) {
    if (!metrics.some((m) => m.metric === t.artifactName)) {
      metrics.push({
        metric: t.artifactName,
        value: String(t.countValue ?? ''),
        trend: t.evidenceRefs?.find((r) => r.label === 'Trend')?.value ?? 'Stable',
        confidence: 'Confirmed',
      });
    }
  }

  if (metrics.length === 0) {
    metrics.push({
      metric: 'Quoting Activity',
      value: 'Not extracted',
      trend: 'N/A',
      confidence: 'Not extracted',
    });
  }

  return metrics;
}

// ============================================================================
// Field Completeness (S8.1 — from Discovery's field completeness sampling)
// ============================================================================

function buildFieldCompleteness(findings: AssessmentFindingInput[]): Array<{
  object: string;
  totalFields: number;
  above50pct: number;
  below5pct: number;
  score: string;
}> {
  const completeness = findings.filter((f) => f.artifactType === 'FieldCompleteness');

  if (completeness.length > 0) {
    // Only return entries that have real data (Task 0.5)
    const mapped = completeness.map((f) => ({
      object: f.artifactName,
      totalFields: f.countValue ?? 0,
      above50pct: Number(f.evidenceRefs?.find((r) => r.label === 'above50pct')?.value ?? 0),
      below5pct: Number(f.evidenceRefs?.find((r) => r.label === 'below5pct')?.value ?? 0),
      score: f.evidenceRefs?.find((r) => r.label === 'score')?.value ?? 'N/A',
    }));
    // If all entries have zero population data (no above50pct, no below5pct, all N/A scores),
    // suppress the section — field completeness analysis was not actually performed (P0-5)
    const hasPopulationData = mapped.some(
      (f) => f.above50pct > 0 || f.below5pct > 0 || (f.score !== 'N/A' && f.score !== '')
    );
    return hasPopulationData ? mapped : [];
  }

  // No FieldCompleteness findings exist — return empty array instead of stub entries (Task 0.5)
  return [];
}

// ============================================================================
// Discount Schedule Analysis (S6.8)
// ============================================================================

function buildDiscountScheduleAnalysis(
  discountSchedules: AssessmentFindingInput[]
): Array<{ name: string; isDuplicate: boolean }> {
  const nameCounts = new Map<string, number>();
  for (const ds of discountSchedules) {
    nameCounts.set(ds.artifactName, (nameCounts.get(ds.artifactName) ?? 0) + 1);
  }

  // Deduplicate for display — show unique names with duplicate flag
  const seen = new Set<string>();
  const result: Array<{ name: string; isDuplicate: boolean }> = [];
  for (const ds of discountSchedules) {
    if (!seen.has(ds.artifactName)) {
      seen.add(ds.artifactName);
      result.push({
        name: ds.artifactName,
        isDuplicate: (nameCounts.get(ds.artifactName) ?? 0) > 1,
      });
    }
  }
  return result;
}

function buildInstalledPackages(
  orgFp: AssessmentFindingInput | null,
  findings: AssessmentFindingInput[]
): Array<{ name: string; namespace: string; version: string; status: string }> {
  const packages: Array<{ name: string; namespace: string; version: string; status: string }> = [];
  const seenNamespaces = new Set<string>();

  // (1) InstalledPackage findings from discovery collector (Task 1.1)
  const installedPkgs = findings.filter((f) => f.artifactType === 'InstalledPackage');
  let nonCpqCount = 0;
  for (const pkg of installedPkgs) {
    const ns = pkg.evidenceRefs?.find((r) => r.label === 'Namespace')?.value ?? '';
    if (ns && CPQ_RELEVANT_NAMESPACES.has(ns)) {
      if (seenNamespaces.has(ns)) continue;
      seenNamespaces.add(ns);
      packages.push({
        name: pkg.artifactName,
        namespace: ns,
        version: pkg.evidenceRefs?.find((r) => r.label === 'Version')?.value ?? 'Detected',
        status: 'Active',
      });
    } else {
      nonCpqCount++;
    }
  }

  // (2) Fallback: extract from OrgFingerprint notes if no InstalledPackage findings
  if (packages.length === 0 && orgFp?.notes) {
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
  if (!seenNamespaces.has('dsfs')) {
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
  }

  // Add summary line for non-CPQ packages (Task 1.1)
  if (nonCpqCount > 0) {
    packages.push({
      name: `${nonCpqCount} additional packages installed`,
      namespace: '—',
      version: '—',
      status: 'Not CPQ-relevant',
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
  _totalQuotes: number
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
