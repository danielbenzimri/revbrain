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
