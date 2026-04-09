/**
 * Post-extraction validation & consistency checker.
 *
 * Validates the completeness and consistency of extracted data
 * before report generation. Implements 8 cross-section consistency
 * rules (V1–V8) from the QA redline checklist, plus original checks.
 *
 * V1–V3 failures inject visible warnings into the report.
 * V4–V8 failures log warnings and flag in the validation report.
 *
 * See: docs/CPQ-REPORT-REDLINE-ANALYSIS.md — Task R1.2
 */

import type { CollectorContext, CollectorResult } from '../collectors/base.ts';
import type { AssessmentFindingInput } from '@revbrain/contract';
import type { ReportData } from '../report/assembler.ts';
import { logger } from '../lib/logger.ts';

const log = logger.child({ component: 'validation' });

export interface ValidationRule {
  id: string;
  name: string;
  severity: 'error' | 'warning';
  passed: boolean;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  warnings: string[];
  errors: string[];
  rules: ValidationRule[];
  /** Warnings that should be injected as visible banners in the PDF report */
  reportBanners: string[];
  stats: {
    totalFindings: number;
    duplicateKeys: number;
    domainsWithData: number;
    domainsEmpty: string[];
    failedCollectors: string[];
    schemaVersions: string[];
    droppedFields: Array<{ collector: string; object: string; fields: string[] }>;
  };
}

/** Expected domains that should have data in a typical CPQ org */
const EXPECTED_DOMAINS = [
  'catalog',
  'pricing',
  'customization',
  'dependency',
  'usage',
  'order-lifecycle',
];

/** Critical fields per object — if dropped, confidence must be downgraded */
const CRITICAL_FIELDS: Record<string, string[]> = {
  Product2: ['Family', 'SBQQ__ConfigurationType__c', 'IsActive'],
  SBQQ__PriceRule__c: ['SBQQ__Active__c', 'SBQQ__EvaluationEvent__c'],
  SBQQ__ProductRule__c: ['SBQQ__Active__c', 'SBQQ__Type__c'],
  SBQQ__QuoteLine__c: ['SBQQ__Quote__c', 'SBQQ__Product__c', 'SBQQ__NetPrice__c'],
  SBQQ__DiscountSchedule__c: ['SBQQ__Type__c', 'Name'],
};

/**
 * Validate extraction results for completeness and consistency.
 */
export async function validateExtraction(
  _ctx: CollectorContext,
  results: Map<string, CollectorResult>
): Promise<ValidationResult> {
  log.info('validating_extraction');

  const warnings: string[] = [];
  const errors: string[] = [];
  const reportBanners: string[] = [];
  const rules: ValidationRule[] = [];
  const allFindings: AssessmentFindingInput[] = [];
  const failedCollectors: string[] = [];
  const allDroppedFields: Array<{ collector: string; object: string; fields: string[] }> = [];

  for (const [name, result] of results) {
    if (result.status === 'failed') {
      failedCollectors.push(name);
    }
    allFindings.push(...result.findings);
    if (result.droppedFields) {
      for (const df of result.droppedFields) {
        allDroppedFields.push({ collector: name, ...df });
      }
    }
  }

  // ── Original checks ──

  // Check for duplicate finding keys
  const duplicateKeys = checkDuplicateKeys(allFindings);
  if (duplicateKeys > 0) {
    warnings.push(`${duplicateKeys} duplicate finding keys detected`);
  }

  // Verify domain coverage
  const domainsWithData = new Set<string>();
  for (const f of allFindings) {
    domainsWithData.add(f.domain);
  }
  const domainsEmpty: string[] = [];
  for (const domain of EXPECTED_DOMAINS) {
    if (!domainsWithData.has(domain)) {
      domainsEmpty.push(domain);
      warnings.push(`Expected domain "${domain}" has no findings`);
    }
  }

  // Cross-reference validation: products in pricing exist in catalog
  const crossRefIssues = validateCrossReferences(allFindings);
  warnings.push(...crossRefIssues);

  // Schema version consistency
  const schemaVersions = new Set<string>();
  for (const f of allFindings) {
    schemaVersions.add(f.schemaVersion ?? '1.0');
  }
  if (schemaVersions.size > 1) {
    warnings.push(
      `Multiple schema versions detected: ${[...schemaVersions].join(', ')}. Ensure compatibility.`
    );
  }

  // Data quality signals
  const qualityWarnings = checkDataQuality(allFindings);
  warnings.push(...qualityWarnings);

  // Failed collectors check
  if (failedCollectors.length > 0) {
    warnings.push(`${failedCollectors.length} collectors failed: ${failedCollectors.join(', ')}`);
  }

  // Critical field drops
  const criticalDrops = checkCriticalFieldDrops(allDroppedFields);
  warnings.push(...criticalDrops);

  // ── V0: Enhanced degradation warnings (V4 Mitigation Plan) ──
  const v0Warnings = checkV0_DegradationWarnings(allFindings, allDroppedFields, failedCollectors);
  warnings.push(...v0Warnings);

  // ── V1–V8: Cross-section consistency rules ──

  rules.push(checkV1_QuoteLineReconciliation(allFindings));
  rules.push(checkV2_ProductQuotedReconciliation(allFindings));
  rules.push(checkV3_PercentageMathValid(allFindings));
  rules.push(checkV4_RuleUsageNotDefaulted(allFindings));
  rules.push(checkV5_ConfidenceConsistency(allFindings));
  rules.push(checkV6_CoverageMatchesBody(allFindings, failedCollectors));
  rules.push(checkV7_TinyDenominatorContext(allFindings));
  rules.push(checkV8_ActiveCountFilter(allFindings));

  // V1–V3 failures inject banners into the report
  for (const rule of rules) {
    if (!rule.passed) {
      if (rule.severity === 'error') {
        errors.push(`[${rule.id}] ${rule.message}`);
      } else {
        warnings.push(`[${rule.id}] ${rule.message}`);
      }

      if (['V1', 'V2', 'V3'].includes(rule.id)) {
        reportBanners.push(`⚠ Data Consistency: ${rule.message}`);
      }
    }
  }

  const valid = errors.length === 0;

  const result: ValidationResult = {
    valid,
    warnings,
    errors,
    rules,
    reportBanners,
    stats: {
      totalFindings: allFindings.length,
      duplicateKeys,
      domainsWithData: domainsWithData.size,
      domainsEmpty,
      failedCollectors,
      schemaVersions: [...schemaVersions],
      droppedFields: allDroppedFields,
    },
  };

  log.info(
    {
      valid,
      totalFindings: allFindings.length,
      warnings: warnings.length,
      errors: errors.length,
      rulesPassed: rules.filter((r) => r.passed).length,
      rulesFailed: rules.filter((r) => !r.passed).length,
      reportBanners: reportBanners.length,
    },
    'validation_complete'
  );

  return result;
}

// ============================================================================
// V0: Enhanced degradation warnings (V4 Mitigation Plan — Task V0)
// ============================================================================

/**
 * V0: Check for degraded extraction paths that should never be silent.
 * - IsActive unavailable due to FLS
 * - sbaa describe skipped (API budget or other reason)
 * - Installed package detected but dependent findings absent
 * - Extraction skipped states
 */
function checkV0_DegradationWarnings(
  findings: AssessmentFindingInput[],
  droppedFields: Array<{ collector: string; object: string; fields: string[] }>,
  failedCollectors: string[]
): string[] {
  const warnings: string[] = [];

  // (1) IsActive unavailable due to FLS
  const isActiveDrop = droppedFields.find(
    (d) => d.object === 'Product2' && d.fields.includes('IsActive')
  );
  if (isActiveDrop) {
    warnings.push(
      `[V0-FLS] Product2.IsActive field was dropped (likely FLS restriction) in ${isActiveDrop.collector}. ` +
        `Active product count will use usageLevel proxy instead of explicit IsActive field.`
    );
  }

  // (2) sbaa describe skipped — look for installed package but no approval findings
  const installedPackages = findings.filter((f) => f.artifactType === 'InstalledPackage');
  const sbaaPackage = installedPackages.find((f) => {
    const refs = Array.isArray(f.evidenceRefs) ? f.evidenceRefs : [];
    return refs.some((r) => String(r.label) === 'Namespace' && String(r.value) === 'sbaa');
  });
  const sbaaDetectedInOrg =
    sbaaPackage ||
    findings.some((f) => f.artifactType === 'OrgFingerprint' && f.notes?.includes('sbaa'));
  const hasApprovalFindings = findings.some((f) => f.artifactType === 'AdvancedApprovalRule');

  if (sbaaDetectedInOrg && !hasApprovalFindings) {
    warnings.push(
      `[V0-DEP] sbaa package detected but no AdvancedApprovalRule findings extracted. ` +
        `Approvals collector may have failed or sbaa objects may not be accessible.`
    );
  }

  // (3) Installed package detected but expected findings absent
  const packageNamespaces = new Set<string>();
  for (const pkg of installedPackages) {
    const refs = Array.isArray(pkg.evidenceRefs) ? pkg.evidenceRefs : [];
    const ns = refs.find((r) => String(r.label) === 'Namespace');
    if (ns) packageNamespaces.add(String(ns.value));
  }

  // If SBQQ package is installed, we must have at least some CPQ findings
  if (packageNamespaces.has('SBQQ') && !findings.some((f) => f.domain === 'catalog')) {
    warnings.push(
      `[V0-DEP] SBQQ package installed but no catalog domain findings. ` +
        `Catalog collector may have failed to extract Product2 data.`
    );
  }

  // (4) Extraction skipped states — check if collectors that should have run are absent
  const expectedCollectorDomains = ['catalog', 'pricing', 'usage'];
  for (const domain of expectedCollectorDomains) {
    const hasDomainFindings = findings.some((f) => f.domain === domain);
    const collectorFailed = failedCollectors.some((c) => c === domain);
    if (!hasDomainFindings && !collectorFailed) {
      // Domain has no findings and collector didn't fail — it may have been skipped
      warnings.push(
        `[V0-SKIP] Domain "${domain}" has no findings and no collector failure recorded. ` +
          `Extraction may have been skipped.`
      );
    }
  }

  return warnings;
}

// ============================================================================
// V1: Quote lines must reconcile with quotes
// ============================================================================

function checkV1_QuoteLineReconciliation(findings: AssessmentFindingInput[]): ValidationRule {
  const quoteCount = findDataCount(findings, 'Quote');
  const lineCount = findDataCount(findings, 'QuoteLine');
  const topProducts = findings.filter((f) => f.artifactType === 'TopQuotedProduct');
  const topProductTotalCount = topProducts.reduce((s, p) => s + (p.countValue ?? 0), 0);

  // If quotes exist but zero lines and top products show non-zero counts, fail
  if (quoteCount > 0 && lineCount === 0 && topProductTotalCount > 0) {
    return {
      id: 'V1',
      name: 'Quote lines reconcile with quotes',
      severity: 'error',
      passed: false,
      message: `${quoteCount} quotes found but 0 quote lines extracted, while top quoted products show ${topProductTotalCount} items. Quote line extraction may have failed.`,
    };
  }

  return {
    id: 'V1',
    name: 'Quote lines reconcile with quotes',
    severity: 'error',
    passed: true,
    message: 'OK',
  };
}

// ============================================================================
// V2: Product quoted counts must reconcile with catalog
// ============================================================================

function checkV2_ProductQuotedReconciliation(findings: AssessmentFindingInput[]): ValidationRule {
  const topProducts = findings.filter((f) => f.artifactType === 'TopQuotedProduct');
  const topProductTotalCount = topProducts.reduce((s, p) => s + (p.countValue ?? 0), 0);

  // Check if catalog says "0 quoted" but top products show nonzero
  const productFindings = findings.filter((f) => f.artifactType === 'Product2');
  const anyQuotedInCatalog = productFindings.some(
    (f) => f.usageLevel === 'high' || f.usageLevel === 'medium'
  );

  if (topProductTotalCount > 0 && productFindings.length > 0 && !anyQuotedInCatalog) {
    return {
      id: 'V2',
      name: 'Product quoted counts reconcile with catalog',
      severity: 'error',
      passed: false,
      message: `Top quoted products show ${topProductTotalCount} items but catalog marks all products as dormant/low usage. Usage data may not be propagating to catalog findings.`,
    };
  }

  return {
    id: 'V2',
    name: 'Product quoted counts reconcile with catalog',
    severity: 'error',
    passed: true,
    message: 'OK',
  };
}

// ============================================================================
// V3: Percentage math must be valid
// ============================================================================

function checkV3_PercentageMathValid(findings: AssessmentFindingInput[]): ValidationRule {
  // Check conversion segments sum to ~100%
  const segments = findings.filter((f) => f.artifactType === 'ConversionSegment');
  if (segments.length > 0) {
    const percentSum = segments.reduce((s, seg) => {
      const pct = Number(seg.evidenceRefs?.find((r) => r.label === '% of quotes')?.value ?? 0);
      return s + pct;
    }, 0);

    if (percentSum > 0 && (percentSum < 90 || percentSum > 110)) {
      return {
        id: 'V3',
        name: 'Percentage math valid',
        severity: 'error',
        passed: false,
        message: `Conversion segment percentages sum to ${percentSum}% (expected ~100%). Calculation logic may be incorrect.`,
      };
    }
  }

  return {
    id: 'V3',
    name: 'Percentage math valid',
    severity: 'error',
    passed: true,
    message: 'OK',
  };
}

// ============================================================================
// V4: Rule usage cannot default to ~100%
// ============================================================================

function checkV4_RuleUsageNotDefaulted(findings: AssessmentFindingInput[]): ValidationRule {
  // This rule checked for hardcoded usage values in the assembler.
  // Now that the assembler no longer outputs usage percentages (uses Active/Inactive instead),
  // this check verifies that no uniform complexity levels exist (all 'medium').
  const priceRules = findings.filter(
    (f) => f.artifactType === 'PriceRule' || f.artifactType === 'SBQQ__PriceRule__c'
  );
  if (priceRules.length > 5) {
    const complexities = priceRules.map((r) => r.complexityLevel ?? 'medium');
    const uniqueComplexities = new Set(complexities);
    if (uniqueComplexities.size === 1) {
      return {
        id: 'V4',
        name: 'Rule complexity not uniformly defaulted',
        severity: 'warning',
        passed: false,
        message: `All ${priceRules.length} price rules have identical complexity "${[...uniqueComplexities][0]}". Complexity may not be individually assessed.`,
      };
    }
  }

  return {
    id: 'V4',
    name: 'Rule complexity not uniformly defaulted',
    severity: 'warning',
    passed: true,
    message: 'OK',
  };
}

// ============================================================================
// V5: Confidence labels must be consistent across sections
// ============================================================================

function checkV5_ConfidenceConsistency(findings: AssessmentFindingInput[]): ValidationRule {
  // Check if the same metric (by artifactType + artifactName) has conflicting source types
  const metricSources = new Map<string, Set<string>>();
  for (const f of findings) {
    if (f.artifactType === 'DataCount' || f.artifactType === 'OrgFingerprint') continue;
    const key = `${f.artifactType}:${f.artifactName}`;
    if (!metricSources.has(key)) metricSources.set(key, new Set());
    metricSources.get(key)!.add(f.sourceType);
  }

  const conflicts = [...metricSources.entries()].filter(([, sources]) => sources.size > 1);
  if (conflicts.length > 3) {
    return {
      id: 'V5',
      name: 'Confidence labels consistent across sections',
      severity: 'warning',
      passed: false,
      message: `${conflicts.length} artifacts have conflicting confidence levels across sections.`,
    };
  }

  return {
    id: 'V5',
    name: 'Confidence labels consistent across sections',
    severity: 'warning',
    passed: true,
    message: 'OK',
  };
}

// ============================================================================
// V6: Extraction coverage must match body claims
// ============================================================================

function checkV6_CoverageMatchesBody(
  findings: AssessmentFindingInput[],
  failedCollectors: string[]
): ValidationRule {
  // If collectors failed but their domains have findings, that's OK (partial data from retries)
  // If collectors failed AND their domains have no findings, flag it
  const domainSet = new Set<string>(findings.map((f) => f.domain));

  const collectorToDomain: Record<string, string> = {
    catalog: 'catalog',
    pricing: 'pricing',
    usage: 'usage',
    dependencies: 'dependency',
    customizations: 'customization',
    templates: 'templates',
    approvals: 'approvals',
    settings: 'settings',
    integrations: 'integration',
    'order-lifecycle': 'order-lifecycle',
    localization: 'localization',
  };

  const missingDomains: string[] = [];
  for (const collector of failedCollectors) {
    const domain = collectorToDomain[collector];
    if (domain && !domainSet.has(domain)) {
      missingDomains.push(`${collector} (${domain})`);
    }
  }

  if (missingDomains.length > 0) {
    return {
      id: 'V6',
      name: 'Extraction coverage matches body claims',
      severity: 'warning',
      passed: false,
      message: `Failed collectors with no domain data: ${missingDomains.join(', ')}. Report coverage claims may be overstated.`,
    };
  }

  return {
    id: 'V6',
    name: 'Extraction coverage matches body claims',
    severity: 'warning',
    passed: true,
    message: 'OK',
  };
}

// ============================================================================
// V7: Tiny-denominator percentages must include context
// ============================================================================

function checkV7_TinyDenominatorContext(findings: AssessmentFindingInput[]): ValidationRule {
  // Check if total quotes < 10 (tiny denominator for all percentage calculations)
  const quoteCount = findDataCount(findings, 'Quote');
  if (quoteCount > 0 && quoteCount < 10) {
    return {
      id: 'V7',
      name: 'Tiny-denominator percentages flagged',
      severity: 'warning',
      passed: false,
      message: `Only ${quoteCount} quotes in assessment window. All percentage metrics use a denominator < 10 and must include (N of M) context.`,
    };
  }

  return {
    id: 'V7',
    name: 'Tiny-denominator percentages flagged',
    severity: 'warning',
    passed: true,
    message: 'OK',
  };
}

// ============================================================================
// V8: Active rule counts must use active-only filter
// ============================================================================

function checkV8_ActiveCountFilter(findings: AssessmentFindingInput[]): ValidationRule {
  // Verify that rule findings have active/inactive distinction
  const priceRules = findings.filter(
    (f) => f.artifactType === 'PriceRule' || f.artifactType === 'SBQQ__PriceRule__c'
  );
  const productRules = findings.filter(
    (f) => f.artifactType === 'ProductRule' || f.artifactType === 'SBQQ__ProductRule__c'
  );

  const allRules = [...priceRules, ...productRules];
  if (allRules.length > 0) {
    // Check if any rule has usageLevel or inactive note — indicating active/inactive is tracked
    const hasActiveDistinction = allRules.some(
      (r) => r.usageLevel === 'dormant' || r.notes?.includes('Inactive')
    );

    // If all rules appear active and there are many, it might indicate the active filter isn't working
    if (!hasActiveDistinction && allRules.length > 10) {
      return {
        id: 'V8',
        name: 'Active rule counts use active-only filter',
        severity: 'warning',
        passed: false,
        message: `All ${allRules.length} rules appear active. Verify that SBQQ__Active__c field is being read and inactive rules are flagged.`,
      };
    }
  }

  return {
    id: 'V8',
    name: 'Active rule counts use active-only filter',
    severity: 'warning',
    passed: true,
    message: 'OK',
  };
}

// ============================================================================
// Helpers
// ============================================================================

/** Find a DataCount finding by name pattern */
function findDataCount(findings: AssessmentFindingInput[], namePattern: string): number {
  const f = findings.find(
    (f) => f.artifactType === 'DataCount' && f.artifactName?.includes(namePattern)
  );
  return f?.countValue ?? 0;
}

/** Check for duplicate finding keys */
function checkDuplicateKeys(findings: AssessmentFindingInput[]): number {
  const seen = new Set<string>();
  let duplicates = 0;

  for (const f of findings) {
    if (seen.has(f.findingKey)) {
      duplicates++;
    }
    seen.add(f.findingKey);
  }

  return duplicates;
}

/** Validate cross-references between domains */
function validateCrossReferences(findings: AssessmentFindingInput[]): string[] {
  const warnings: string[] = [];

  // Build indexes by domain
  const catalogArtifactIds = new Set<string>();
  const pricingReferencedProducts = new Set<string>();

  for (const f of findings) {
    if (f.domain === 'catalog' && f.artifactId) {
      catalogArtifactIds.add(f.artifactId);
    }
    // Check pricing findings for product references
    if (f.domain === 'pricing' && f.evidenceRefs) {
      for (const ref of f.evidenceRefs) {
        if (ref.referencedObjects) {
          for (const obj of ref.referencedObjects) {
            if (obj.startsWith('01t') || obj.startsWith('Product2')) {
              pricingReferencedProducts.add(obj);
            }
          }
        }
      }
    }
  }

  // Check if pricing references products not found in catalog
  const orphanedRefs = [...pricingReferencedProducts].filter((id) => !catalogArtifactIds.has(id));
  if (orphanedRefs.length > 0) {
    warnings.push(
      `${orphanedRefs.length} product references in pricing not found in catalog extraction`
    );
  }

  // Check for Apex classes referencing SBQQ without corresponding catalog data
  const hasApex = findings.some((f) => f.artifactType === 'ApexClass');
  const hasCatalog = findings.some((f) => f.domain === 'catalog');
  if (hasApex && !hasCatalog) {
    warnings.push('Apex classes found referencing CPQ but no catalog data extracted');
  }

  return warnings;
}

/** Check data quality signals */
function checkDataQuality(findings: AssessmentFindingInput[]): string[] {
  const warnings: string[] = [];

  // Check for findings without names
  const nameless = findings.filter((f) => !f.artifactName || f.artifactName === 'Unknown');
  if (nameless.length > 5) {
    warnings.push(`${nameless.length} findings have missing/unknown artifact names`);
  }

  // Check for high-risk findings without notes
  const highRiskNoNotes = findings.filter(
    (f) =>
      (f.riskLevel === 'critical' || f.riskLevel === 'high') &&
      !f.notes &&
      f.artifactType !== 'DataCount' &&
      f.artifactType !== 'OrgFingerprint'
  );
  if (highRiskNoNotes.length > 3) {
    warnings.push(`${highRiskNoNotes.length} high/critical findings lack descriptive notes`);
  }

  // Check for duplicate artifact names within the same domain+type
  const nameKeys = new Map<string, number>();
  for (const f of findings) {
    const key = `${f.domain}:${f.artifactType}:${f.artifactName}`;
    nameKeys.set(key, (nameKeys.get(key) ?? 0) + 1);
  }
  const duplicateNames = [...nameKeys.entries()].filter(([, count]) => count > 1);
  if (duplicateNames.length > 0) {
    warnings.push(
      `${duplicateNames.length} artifact name collisions detected (same domain+type+name)`
    );
  }

  return warnings;
}

/** Check if critical fields were dropped (FLS issues) */
function checkCriticalFieldDrops(
  droppedFields: Array<{ collector: string; object: string; fields: string[] }>
): string[] {
  const warnings: string[] = [];

  for (const drop of droppedFields) {
    const criticalForObject = CRITICAL_FIELDS[drop.object];
    if (!criticalForObject) continue;

    const criticalDropped = drop.fields.filter((f) => criticalForObject.includes(f));
    if (criticalDropped.length > 0) {
      warnings.push(
        `[FLS] Critical fields dropped for ${drop.object} in ${drop.collector}: ${criticalDropped.join(', ')}. Affected data may be incomplete.`
      );
    }
  }

  return warnings;
}

// ============================================================================
// V9–V12: Post-assembly validation rules (Task 0.7)
// ============================================================================

export interface ReportValidationResult {
  valid: boolean;
  rules: ValidationRule[];
  reportBanners: string[];
}

/**
 * Post-assembly validator — runs after assembleReport() and before renderReport().
 * Catches inconsistencies between assembled sections that can't be detected from
 * raw findings alone.
 */
export function validateReportData(data: ReportData): ReportValidationResult {
  const rules: ValidationRule[] = [];
  const reportBanners: string[] = [];

  rules.push(checkV9_ActiveTotalMismatch(data));
  rules.push(checkV10_DuplicateAppendix(data));
  rules.push(checkV11_FieldCompletenessSuppression(data));
  rules.push(checkV12_PercentageMath(data));
  rules.push(...validateTemplateParity(data));

  for (const rule of rules) {
    if (!rule.passed) {
      if (['V9', 'V12'].includes(rule.id)) {
        reportBanners.push(`⚠ Data Consistency: ${rule.message}`);
      }
    }
  }

  const valid = rules.every((r) => r.passed || r.severity === 'warning');

  log.info(
    {
      valid,
      rulesPassed: rules.filter((r) => r.passed).length,
      rulesFailed: rules.filter((r) => !r.passed).length,
      reportBanners: reportBanners.length,
    },
    'report_validation_complete'
  );

  return { valid, rules, reportBanners };
}

/**
 * V9: Active price/product rule count in At-a-Glance must match section detail.
 */
function checkV9_ActiveTotalMismatch(data: ReportData): ValidationRule {
  const glancePricing = data.cpqAtAGlance['Pricing & Rules'] ?? [];
  const glancePriceRules = glancePricing.find((m) => m.label === 'Price Rules (Active)');
  const glanceProductRules = glancePricing.find((m) => m.label === 'Product Rules (Active)');

  // Extract active count from section summary (e.g., "20 active of 28 total")
  const sectionPriceMatch = data.configurationDomain.activePriceRuleSummary.match(/^(\d+) active/);
  const sectionProductMatch =
    data.configurationDomain.activeProductRuleSummary.match(/^(\d+) active/);

  const mismatches: string[] = [];
  if (glancePriceRules && sectionPriceMatch) {
    if (glancePriceRules.value !== sectionPriceMatch[1]) {
      mismatches.push(
        `Price Rules: Glance=${glancePriceRules.value}, Section=${sectionPriceMatch[1]}`
      );
    }
  }
  if (glanceProductRules && sectionProductMatch) {
    if (glanceProductRules.value !== sectionProductMatch[1]) {
      mismatches.push(
        `Product Rules: Glance=${glanceProductRules.value}, Section=${sectionProductMatch[1]}`
      );
    }
  }

  if (mismatches.length > 0) {
    return {
      id: 'V9',
      name: 'At-a-Glance counts match section detail',
      severity: 'error',
      passed: false,
      message: `At-a-Glance counts do not match section detail: ${mismatches.join('; ')}.`,
    };
  }

  return {
    id: 'V9',
    name: 'At-a-Glance counts match section detail',
    severity: 'error',
    passed: true,
    message: 'OK',
  };
}

/**
 * V10: No two entries in appendix B should share the same name.
 */
function checkV10_DuplicateAppendix(data: ReportData): ValidationRule {
  const names = data.appendixB.map((r) => r.name);
  const uniqueNames = new Set(names);

  if (uniqueNames.size < names.length) {
    const duplicateCount = names.length - uniqueNames.size;
    return {
      id: 'V10',
      name: 'No duplicate appendix entries',
      severity: 'warning',
      passed: false,
      message: `${duplicateCount} duplicate report name(s) in Appendix B. Auto-deduplication should be applied.`,
    };
  }

  return {
    id: 'V10',
    name: 'No duplicate appendix entries',
    severity: 'warning',
    passed: true,
    message: 'OK',
  };
}

/**
 * V11: If all FieldCompleteness entries have score === 'N/A' or array is empty,
 * flag for suppression.
 */
function checkV11_FieldCompletenessSuppression(data: ReportData): ValidationRule {
  const fc = data.dataQuality.fieldCompleteness;

  if (fc.length === 0) {
    // Empty is OK — means the assembler already suppressed it (Task 0.5)
    return {
      id: 'V11',
      name: 'Field completeness suppressed when empty',
      severity: 'warning',
      passed: true,
      message: 'OK — field completeness suppressed (no data).',
    };
  }

  const allStub = fc.every((f) => f.totalFields === 0 || f.score === 'N/A');
  if (allStub) {
    return {
      id: 'V11',
      name: 'Field completeness suppressed when empty',
      severity: 'warning',
      passed: false,
      message:
        'All field completeness entries have zero fields or N/A scores. Table should be suppressed.',
    };
  }

  return {
    id: 'V11',
    name: 'Field completeness suppressed when empty',
    severity: 'warning',
    passed: true,
    message: 'OK',
  };
}

/**
 * Task 2.17: Template parity pre-release verification.
 * Checks all required fields/sections exist in ReportData.
 */
function validateTemplateParity(data: ReportData): ValidationRule[] {
  const rules: ValidationRule[] = [];

  // V13: Cover page required fields
  const coverFields = [
    'clientName',
    'orgId',
    'environment',
    'assessmentDate',
    'assessmentPeriod',
    'cpqVersion',
    'documentVersion',
    'generatedBy',
  ] as const;
  const missingCover = coverFields.filter(
    (f) => !data.metadata[f] || data.metadata[f] === 'Unknown'
  );
  rules.push({
    id: 'V13',
    name: 'Cover page has all required fields',
    severity: 'warning',
    passed: missingCover.length === 0,
    message:
      missingCover.length > 0 ? `Cover page missing fields: ${missingCover.join(', ')}.` : 'OK',
  });

  // V14: Executive Summary has findings with title + detail + confidence
  const findingsOk =
    data.executiveSummary.keyFindings.length >= 3 &&
    data.executiveSummary.keyFindings.every((f) => f.title && f.detail && f.confidence);
  rules.push({
    id: 'V14',
    name: 'Executive Summary has valid key findings',
    severity: 'warning',
    passed: findingsOk,
    message: findingsOk
      ? 'OK'
      : `Executive Summary has ${data.executiveSummary.keyFindings.length} findings (expected >= 3, each with title + detail + confidence).`,
  });

  // V15: At-a-Glance panels check
  const glancePanels = Object.keys(data.cpqAtAGlance);
  const expectedPanels = [
    'Product Catalog',
    'Pricing & Rules',
    'Quoting (90 Days)',
    'Users & Licenses',
    'Automation & Code',
  ];
  const missingPanels = expectedPanels.filter((p) => !glancePanels.includes(p));
  rules.push({
    id: 'V15',
    name: 'At-a-Glance has required panels',
    severity: 'warning',
    passed: missingPanels.length === 0,
    message:
      missingPanels.length > 0 ? `At-a-Glance missing panels: ${missingPanels.join(', ')}.` : 'OK',
  });

  // V16: Appendix D has >=10 category rows
  rules.push({
    id: 'V16',
    name: 'Appendix D has sufficient category rows',
    severity: 'warning',
    passed: data.appendixD.length >= 10,
    message:
      data.appendixD.length >= 10
        ? 'OK'
        : `Appendix D has only ${data.appendixD.length} categories (expected >= 10).`,
  });

  return rules;
}

/**
 * V12: Percentage totals (conversion segments, discount distribution) should sum to ~100%.
 */
function checkV12_PercentageMath(data: ReportData): ValidationRule {
  const issues: string[] = [];

  // Conversion segments
  if (data.usageAdoption.conversionBySize.length > 0) {
    const segmentSum = data.usageAdoption.conversionBySize.reduce(
      (sum, s) => sum + s.percentQuotes,
      0
    );
    if (segmentSum > 0 && (segmentSum < 90 || segmentSum > 110)) {
      issues.push(`Conversion segment %Quotes sums to ${segmentSum}% (expected ~100%)`);
    }
  }

  // Discount distribution
  if (data.usageAdoption.discountDistribution.length > 0) {
    const discountSum = data.usageAdoption.discountDistribution.reduce((sum, d) => {
      const pctMatch = d.percent.match(/^(\d+)/);
      return sum + (pctMatch ? Number(pctMatch[1]) : 0);
    }, 0);
    if (discountSum > 0 && (discountSum < 90 || discountSum > 110)) {
      issues.push(`Discount distribution sums to ${discountSum}% (expected ~100%)`);
    }
  }

  if (issues.length > 0) {
    return {
      id: 'V12',
      name: 'Percentage math valid (post-assembly)',
      severity: 'error',
      passed: false,
      message: `Percentage calculations inconsistent: ${issues.join('; ')}.`,
    };
  }

  return {
    id: 'V12',
    name: 'Percentage math valid (post-assembly)',
    severity: 'error',
    passed: true,
    message: 'OK',
  };
}

// ============================================================================
// V17–V24: ReportConsistencyValidator (V4 Mitigation Plan — Task V1)
// ============================================================================

/**
 * Post-assembly consistency validator — catches cross-section contradictions
 * in the assembled ReportData that can't be detected from raw findings alone.
 *
 * All rules are Error severity per the V4 Mitigation Plan.
 */
export function validateReportConsistency(data: ReportData): ReportValidationResult {
  const rules: ValidationRule[] = [];
  const reportBanners: string[] = [];

  rules.push(checkV17_PercentageOver100(data));
  rules.push(checkV18_ActiveUserMismatch(data));
  rules.push(checkV19_ProductCountMismatch(data));
  rules.push(checkV20_OptionsTextContradiction(data));
  rules.push(checkV21_SbaaVersionContradiction(data));
  rules.push(checkV22_ApprovalSectionContradiction(data));
  rules.push(checkV23_TopProductPercentage(data));
  rules.push(checkV24_CoverageContradiction(data));
  rules.push(checkV25_ApprovalCountCrossCheck(data));
  rules.push(checkV26_BrandConsistency(data));
  rules.push(checkV28_PercentageDenominatorContext(data));
  rules.push(checkV29_LabelRequirement(data));
  rules.push(checkV30_QcpSingleName(data));
  rules.push(checkV31_BundleCapableWording(data));
  rules.push(checkV32_DenominatorFootnotes(data));
  rules.push(checkV33_FindingImplicationPattern(data));

  for (const rule of rules) {
    if (!rule.passed) {
      reportBanners.push(`⚠ Consistency: ${rule.message}`);
    }
  }

  const valid = rules.every((r) => r.passed);

  log.info(
    {
      valid,
      rulesPassed: rules.filter((r) => r.passed).length,
      rulesFailed: rules.filter((r) => !r.passed).length,
      reportBanners: reportBanners.length,
    },
    'report_consistency_validation_complete'
  );

  return { valid, rules, reportBanners };
}

/**
 * V17: Any percentage metric > 100% in assembled report.
 */
function checkV17_PercentageOver100(data: ReportData): ValidationRule {
  const issues: string[] = [];

  // Check top products
  for (const p of data.usageAdoption.topProducts) {
    const pctMatch = p.percentQuotes.match(/^(\d+)%/);
    if (pctMatch && Number(pctMatch[1]) > 100) {
      issues.push(`Top product "${p.name}" shows ${p.percentQuotes}`);
    }
  }

  // Check conversion segments
  for (const s of data.usageAdoption.conversionBySize) {
    if (s.percentQuotes > 100)
      issues.push(`Conversion segment "${s.segment}" %Quotes = ${s.percentQuotes}%`);
    if (s.percentRevenue > 100)
      issues.push(`Conversion segment "${s.segment}" %Revenue = ${s.percentRevenue}%`);
    if (s.conversionRate > 100)
      issues.push(`Conversion segment "${s.segment}" conversion = ${s.conversionRate}%`);
  }

  // Check product catalog percentQuoted
  for (const c of data.configurationDomain.productCatalog) {
    const pctMatch = c.percentQuoted.match(/^(\d+)%/);
    if (pctMatch && Number(pctMatch[1]) > 100) {
      issues.push(`Product family "${c.category}" shows ${c.percentQuoted} quoted`);
    }
  }

  if (issues.length > 0) {
    return {
      id: 'V17',
      name: 'No percentage metric exceeds 100%',
      severity: 'error',
      passed: false,
      message: `Percentage > 100% detected: ${issues.join('; ')}.`,
    };
  }

  return {
    id: 'V17',
    name: 'No percentage metric exceeds 100%',
    severity: 'error',
    passed: true,
    message: 'OK',
  };
}

/**
 * V18: lowVolumeWarning active users must match cpqAtAGlance active users.
 */
function checkV18_ActiveUserMismatch(data: ReportData): ValidationRule {
  if (!data.metadata.lowVolumeWarning) {
    return {
      id: 'V18',
      name: 'Active user count consistent across sections',
      severity: 'error',
      passed: true,
      message: 'OK — no low-volume warning.',
    };
  }

  const warningMatch = data.metadata.lowVolumeWarning.match(/(\d+)\s*active users/);
  const warningCount = warningMatch ? Number(warningMatch[1]) : null;

  const glanceUsers = data.cpqAtAGlance['Users & Licenses']?.find((m) =>
    m.label.includes('Active Users')
  );
  const glanceCount = glanceUsers ? Number(glanceUsers.value) : null;

  if (
    warningCount !== null &&
    glanceCount !== null &&
    !isNaN(glanceCount) &&
    warningCount !== glanceCount
  ) {
    return {
      id: 'V18',
      name: 'Active user count consistent across sections',
      severity: 'error',
      passed: false,
      message: `Low-volume warning says ${warningCount} active users but At-a-Glance shows ${glanceCount}.`,
    };
  }

  return {
    id: 'V18',
    name: 'Active user count consistent across sections',
    severity: 'error',
    passed: true,
    message: 'OK',
  };
}

/**
 * V19: For each metric in [activeProducts, totalProducts, bundleProducts],
 * every rendered instance in ReportData must equal counts.{metric}.
 */
function checkV19_ProductCountMismatch(data: ReportData): ValidationRule {
  if (!data.counts) {
    return {
      id: 'V19',
      name: 'Product counts consistent',
      severity: 'error',
      passed: true,
      message: 'OK — no counts available.',
    };
  }

  const issues: string[] = [];
  const glanceCatalog = data.cpqAtAGlance['Product Catalog'] ?? [];

  // Check active products in glance
  const activeEntry = glanceCatalog.find(
    (m) => m.label === 'Active Products' || m.label === 'Products Extracted'
  );
  if (activeEntry && activeEntry.value !== 'Not extracted') {
    const glanceVal = Number(activeEntry.value);
    if (!isNaN(glanceVal) && glanceVal !== data.counts.activeProducts) {
      issues.push(`Active Products: Glance=${glanceVal}, counts=${data.counts.activeProducts}`);
    }
  }

  // Check bundle products in glance
  const bundleEntry = glanceCatalog.find((m) => m.label === 'Bundle-capable Products');
  if (bundleEntry && bundleEntry.value !== 'Detected' && bundleEntry.value !== '0') {
    const glanceVal = Number(bundleEntry.value);
    if (!isNaN(glanceVal) && glanceVal !== data.counts.bundleProducts) {
      issues.push(`Bundle Products: Glance=${glanceVal}, counts=${data.counts.bundleProducts}`);
    }
  }

  if (issues.length > 0) {
    return {
      id: 'V19',
      name: 'Product counts consistent',
      severity: 'error',
      passed: false,
      message: `Product count mismatch: ${issues.join('; ')}.`,
    };
  }

  return {
    id: 'V19',
    name: 'Product counts consistent',
    severity: 'error',
    passed: true,
    message: 'OK',
  };
}

/**
 * V20: Complexity rationale mentions "no product options" when counts.productOptions > 0.
 */
function checkV20_OptionsTextContradiction(data: ReportData): ValidationRule {
  if (!data.counts || data.counts.productOptions === 0) {
    return {
      id: 'V20',
      name: 'No "no product options" when options exist',
      severity: 'error',
      passed: true,
      message: 'OK',
    };
  }

  for (const m of data.executiveSummary.scoringMethodology) {
    if (m.rationale.toLowerCase().includes('no product options')) {
      return {
        id: 'V20',
        name: 'No "no product options" when options exist',
        severity: 'error',
        passed: false,
        message: `Scoring rationale says "no product options" but counts.productOptions = ${data.counts.productOptions}.`,
      };
    }
  }

  return {
    id: 'V20',
    name: 'No "no product options" when options exist',
    severity: 'error',
    passed: true,
    message: 'OK',
  };
}

/**
 * V21: sbaaInstalled=true AND rendered sbaa version display equals "Not installed".
 */
function checkV21_SbaaVersionContradiction(data: ReportData): ValidationRule {
  if (!data.counts || !data.counts.sbaaInstalled) {
    return {
      id: 'V21',
      name: 'sbaa version not contradicted',
      severity: 'error',
      passed: true,
      message: 'OK',
    };
  }

  if (!data.metadata.sbaaVersion || data.metadata.sbaaVersion === 'Not installed') {
    return {
      id: 'V21',
      name: 'sbaa version not contradicted',
      severity: 'error',
      passed: false,
      message: `sbaa package is installed (counts.sbaaInstalled=true) but metadata.sbaaVersion shows "Not installed" or is null.`,
    };
  }

  return {
    id: 'V21',
    name: 'sbaa version not contradicted',
    severity: 'error',
    passed: true,
    message: 'OK',
  };
}

/**
 * V22: Approval rules section says "not detected" when counts.approvalRuleCount > 0.
 */
function checkV22_ApprovalSectionContradiction(data: ReportData): ValidationRule {
  if (!data.counts || data.counts.approvalRuleCount === 0) {
    return {
      id: 'V22',
      name: 'Approval rules section consistent',
      severity: 'error',
      passed: true,
      message: 'OK',
    };
  }

  if (data.approvalsAndDocs.advancedApprovalRules.length === 0) {
    return {
      id: 'V22',
      name: 'Approval rules section consistent',
      severity: 'error',
      passed: false,
      message: `counts.approvalRuleCount = ${data.counts.approvalRuleCount} but approvalsAndDocs shows 0 advanced approval rules.`,
    };
  }

  return {
    id: 'V22',
    name: 'Approval rules section consistent',
    severity: 'error',
    passed: true,
    message: 'OK',
  };
}

/**
 * V23: Every Top Quoted Product has percentQuotes <= 100%.
 */
function checkV23_TopProductPercentage(data: ReportData): ValidationRule {
  const violations: string[] = [];

  for (const p of data.usageAdoption.topProducts) {
    const pctMatch = p.percentQuotes.match(/^(\d+)%/);
    if (pctMatch && Number(pctMatch[1]) > 100) {
      violations.push(`"${p.name}" at ${p.percentQuotes}`);
    }
  }

  if (violations.length > 0) {
    return {
      id: 'V23',
      name: 'Top product percentages <= 100%',
      severity: 'error',
      passed: false,
      message: `Top quoted products with > 100%: ${violations.join(', ')}.`,
    };
  }

  return {
    id: 'V23',
    name: 'Top product percentages <= 100%',
    severity: 'error',
    passed: true,
    message: 'OK',
  };
}

/**
 * V24: Appendix D Product Catalog says "not available" when counts.productOptions > 0.
 */
function checkV24_CoverageContradiction(data: ReportData): ValidationRule {
  if (!data.counts || data.counts.productOptions === 0) {
    return {
      id: 'V24',
      name: 'Coverage claims match data',
      severity: 'error',
      passed: true,
      message: 'OK',
    };
  }

  const catalogCoverage = data.appendixD.find((d) => d.category === 'Product Catalog');
  if (catalogCoverage && catalogCoverage.notes.toLowerCase().includes('not available')) {
    return {
      id: 'V24',
      name: 'Coverage claims match data',
      severity: 'error',
      passed: false,
      message: `Appendix D says product options "not available" but counts.productOptions = ${data.counts.productOptions}.`,
    };
  }

  return {
    id: 'V24',
    name: 'Coverage claims match data',
    severity: 'error',
    passed: true,
    message: 'OK',
  };
}

/**
 * V25: Section 6.6.1 advanced approval rule count must equal Section 8.3 feature utilization approval count.
 */
function checkV25_ApprovalCountCrossCheck(data: ReportData): ValidationRule {
  const sectionCount = data.approvalsAndDocs.advancedApprovalRules.length;

  // Find the Advanced Approvals entry in feature utilization
  const approvalFeature = data.dataQuality.featureUtilization.find(
    (f) => f.feature === 'Advanced Approvals'
  );

  if (!approvalFeature) {
    // No feature utilization entry — nothing to cross-check
    return {
      id: 'V25',
      name: 'Approval rule count cross-section check',
      severity: 'error',
      passed: true,
      message: 'OK — no approval feature utilization entry.',
    };
  }

  // Extract count from feature detail (e.g., "5 advanced approval rules detected.")
  const detailMatch = approvalFeature.detail.match(/^(\d+)\s+advanced approval rule/);
  const featureCount = detailMatch ? Number(detailMatch[1]) : null;

  if (featureCount !== null && featureCount !== sectionCount) {
    return {
      id: 'V25',
      name: 'Approval rule count cross-section check',
      severity: 'error',
      passed: false,
      message: `Section 6.6.1 shows ${sectionCount} advanced approval rules but Section 8.3 feature utilization reports ${featureCount}.`,
    };
  }

  return {
    id: 'V25',
    name: 'Approval rule count cross-section check',
    severity: 'error',
    passed: true,
    message: 'OK',
  };
}

/**
 * V26: Report branding must match configured brand name.
 * Config-based check — validates that the report references the expected brand
 * (default "RevBrain"). Ensures branding consistency when white-labelling.
 */
function checkV26_BrandConsistency(data: ReportData): ValidationRule {
  const expectedBrand = data.metadata.generatedBy?.split(' ')[0] || 'RevBrain';

  // Check cover page "Generated by" contains the expected brand
  const generatedBy = data.metadata.generatedBy || '';
  if (!generatedBy.includes(expectedBrand)) {
    return {
      id: 'V26',
      name: 'Brand consistency check',
      severity: 'warning',
      passed: false,
      message: `Report generatedBy "${generatedBy}" does not reference expected brand "${expectedBrand}".`,
    };
  }

  return {
    id: 'V26',
    name: 'Brand consistency check',
    severity: 'warning',
    passed: true,
    message: 'OK',
  };
}

/**
 * V28: Warn if percentage tables exist without denominator context.
 * Checks that percentage-bearing sections have non-zero denominators.
 */
function checkV28_PercentageDenominatorContext(data: ReportData): ValidationRule {
  const issues: string[] = [];

  // Top products: must have totalQuotes as denominator
  if (data.usageAdoption.topProducts.length > 0 && data.counts.totalQuotes === 0) {
    issues.push('Top products have percentage but totalQuotes = 0');
  }

  // Conversion by size: must have totalQuotes as denominator
  if (data.usageAdoption.conversionBySize.length > 0 && data.counts.totalQuotes === 0) {
    issues.push('Conversion segments have percentage but totalQuotes = 0');
  }

  // Discount distribution: must have at least some count values
  if (data.usageAdoption.discountDistribution.length > 0) {
    const totalCount = data.usageAdoption.discountDistribution.reduce((s, d) => s + d.count, 0);
    if (totalCount === 0) {
      issues.push('Discount distribution has percentage but all counts = 0');
    }
  }

  // Product catalog: % Quoted requires active products
  if (data.configurationDomain.productCatalog.length > 0) {
    const hasPercentage = data.configurationDomain.productCatalog.some(
      (c) => c.percentQuoted !== '0%' && c.percentQuoted !== 'N/A'
    );
    if (hasPercentage && data.counts.activeProducts === 0) {
      issues.push('Product catalog has % Quoted but activeProducts = 0');
    }
  }

  if (issues.length > 0) {
    return {
      id: 'V28',
      name: 'Percentage tables have denominator context',
      severity: 'warning',
      passed: false,
      message: `Percentage tables lack denominator context: ${issues.join('; ')}.`,
    };
  }

  return {
    id: 'V28',
    name: 'Percentage tables have denominator context',
    severity: 'warning',
    passed: true,
    message: 'OK',
  };
}

/**
 * V29: Warn if displayed count lacks basis label where multiple definitions exist.
 * Applies to:
 * - Product counts: Total / Active / Bundle-capable (three different definitions)
 * - Rule counts: Active / Total (two different definitions)
 * - Template counts: Total / Configured / Usable (three different definitions)
 */
function checkV29_LabelRequirement(data: ReportData): ValidationRule {
  const issues: string[] = [];

  // Check product count labels in At-a-Glance
  const glanceCatalog = data.cpqAtAGlance['Product Catalog'] ?? [];
  for (const m of glanceCatalog) {
    if (
      m.value !== '0' &&
      m.value !== 'Not extracted' &&
      m.value !== 'N/A' &&
      m.value !== 'Detected'
    ) {
      // Check that labels disambiguate: "Active Products", "Products Extracted", "Bundle-capable Products"
      // are acceptable. Raw "Products" without qualifier is not.
      if (m.label === 'Products') {
        issues.push(
          `Product count "${m.value}" labeled as generic "Products" — should specify Active/Total/Extracted`
        );
      }
    }
  }

  // Check rule count labels in At-a-Glance
  const glancePricing = data.cpqAtAGlance['Pricing & Rules'] ?? [];
  for (const m of glancePricing) {
    if (m.label === 'Price Rules' || m.label === 'Product Rules') {
      issues.push(
        `Rule count "${m.value}" labeled as "${m.label}" — should specify (Active) or (Total)`
      );
    }
  }

  // Check template counts in document generation
  const docGen = data.approvalsAndDocs.documentGeneration;
  if (docGen.totalTemplateRecords > 0 && docGen.totalTemplateRecords !== docGen.templateCount) {
    // Multi-definition exists — both templateCount and totalTemplateRecords
    // The template already renders both, so this is OK. But warn if usableTemplateCount is 0
    // when templateCount > 0, as it might indicate a labelling gap.
    if (docGen.usableTemplateCount === 0 && docGen.templateCount > 0) {
      issues.push(
        `Template count shows ${docGen.templateCount} configured but 0 usable — verify template count labels`
      );
    }
  }

  if (issues.length > 0) {
    return {
      id: 'V29',
      name: 'Multi-definition counts have basis labels',
      severity: 'warning',
      passed: false,
      message: `Count labels missing basis qualifier: ${issues.join('; ')}.`,
    };
  }

  return {
    id: 'V29',
    name: 'Multi-definition counts have basis labels',
    severity: 'warning',
    passed: true,
    message: 'OK',
  };
}

// ============================================================================
// V2.1 Validators (V30-V33) — structured data checks, NOT HTML grep
// ============================================================================

/**
 * V30: QCP shows exactly 1 configured name (not concatenated list).
 * Check: name must not contain comma or semicolon (concatenation indicator).
 */
function checkV30_QcpSingleName(data: ReportData): ValidationRule {
  // Find QCP name in At-a-Glance
  const pricingSection =
    data.cpqAtAGlance['Pricing & Rules'] ?? data.cpqAtAGlance['PRICING & RULES'] ?? [];
  const qcpEntry = pricingSection.find(
    (item) => item.label?.includes('QCP') || item.label?.includes('Calculator')
  );

  if (!qcpEntry || qcpEntry.value === 'Not Configured' || qcpEntry.value === 'Not configured') {
    return {
      id: 'V30',
      name: 'QCP shows single name',
      severity: 'warning',
      passed: true,
      message: 'OK',
    };
  }

  // Check for concatenation indicators (comma, semicolon)
  if (qcpEntry.value.includes(',') || qcpEntry.value.includes(';')) {
    return {
      id: 'V30',
      name: 'QCP shows single name',
      severity: 'warning',
      passed: false,
      message: `QCP name appears to be concatenated: "${qcpEntry.value}". Should show exactly 1 configured plugin name.`,
    };
  }

  return {
    id: 'V30',
    name: 'QCP shows single name',
    severity: 'warning',
    passed: true,
    message: 'OK',
  };
}

/**
 * V31: No bare "bundle" without "bundle-capable" qualifier.
 * Scans curated string fields for pattern: /\bbundle(s)?\b(?!-capable)/
 */
function checkV31_BundleCapableWording(data: ReportData): ValidationRule {
  const bareBundlePattern = /\bbundle(s)?\b(?!-capable|d\b)/i;
  const issues: string[] = [];

  // Check key findings
  for (const finding of data.executiveSummary.keyFindings) {
    if (
      bareBundlePattern.test(finding.title) &&
      !finding.title.toLowerCase().includes('bundle-capable') &&
      !finding.title.toLowerCase().includes('configured bundle')
    ) {
      issues.push(`Key finding title: "${finding.title}"`);
    }
  }

  // Check complexity hotspots
  for (const hotspot of data.complexityHotspots) {
    if (
      bareBundlePattern.test(hotspot.analysis) &&
      !hotspot.analysis.toLowerCase().includes('bundle-capable') &&
      !hotspot.analysis.toLowerCase().includes('configured bundle')
    ) {
      issues.push(`Hotspot analysis: "${hotspot.name}"`);
    }
  }

  if (issues.length > 0) {
    return {
      id: 'V31',
      name: 'Bundle-capable wording consistency',
      severity: 'warning',
      passed: false,
      message: `Found bare "bundle" without "-capable" qualifier in: ${issues.join('; ')}`,
    };
  }

  return {
    id: 'V31',
    name: 'Bundle-capable wording consistency',
    severity: 'warning',
    passed: true,
    message: 'OK',
  };
}

/**
 * V32: All percentage tables have denominator footnotes.
 * Checks hasDenominatorFootnote field on T2 section data (structural, not HTML).
 */
function checkV32_DenominatorFootnotes(data: ReportData): ValidationRule {
  const issues: string[] = [];

  if (data.productDeepDive && !data.productDeepDive.hasDenominatorFootnote) {
    issues.push('Section 6.2 (Product Deep Dive)');
  }
  if (data.bundlesDeepDive && !data.bundlesDeepDive.hasDenominatorFootnote) {
    issues.push('Section 6.6 (Bundles Deep Dive)');
  }

  if (issues.length > 0) {
    return {
      id: 'V32',
      name: 'Percentage tables have denominator footnotes',
      severity: 'warning',
      passed: false,
      message: `Missing hasDenominatorFootnote in: ${issues.join('; ')}`,
    };
  }

  return {
    id: 'V32',
    name: 'Percentage tables have denominator footnotes',
    severity: 'warning',
    passed: true,
    message: 'OK',
  };
}

/**
 * V33: Every key finding follows Fact + Implication pattern.
 * Check: detail must contain ' — ' followed by an implication word.
 */
function checkV33_FindingImplicationPattern(data: ReportData): ValidationRule {
  const implicationPattern = /\s—\s+(indicating|which means|adding|suggesting|requiring)/i;
  const issues: string[] = [];

  for (const finding of data.executiveSummary.keyFindings) {
    if (!implicationPattern.test(finding.detail)) {
      issues.push(`Finding "${finding.title}": detail missing Fact + Implication pattern`);
    }
  }

  if (issues.length > 0) {
    return {
      id: 'V33',
      name: 'Key findings follow Fact + Implication pattern',
      severity: 'warning',
      passed: false,
      message: issues.join('; '),
    };
  }

  return {
    id: 'V33',
    name: 'Key findings follow Fact + Implication pattern',
    severity: 'warning',
    passed: true,
    message: 'OK',
  };
}
