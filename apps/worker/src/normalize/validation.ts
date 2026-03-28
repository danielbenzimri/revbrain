/**
 * Post-extraction validation.
 *
 * Validates the completeness and consistency of extracted data
 * before summary generation. Catches issues like:
 * - Missing expected findings for known objects
 * - Inconsistent cross-references (e.g., product referenced in pricing but not in catalog)
 * - Duplicate finding keys
 * - Schema version mismatches
 *
 * See: Extraction Spec — Post-processing, validation
 */

import type { CollectorContext, CollectorResult } from '../collectors/base.ts';
import type { AssessmentFindingInput } from '@revbrain/contract';
import { logger } from '../lib/logger.ts';

const log = logger.child({ component: 'validation' });

export interface ValidationResult {
  valid: boolean;
  warnings: string[];
  errors: string[];
  stats: {
    totalFindings: number;
    duplicateKeys: number;
    domainsWithData: number;
    domainsEmpty: string[];
    failedCollectors: string[];
    schemaVersions: string[];
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
  const allFindings: AssessmentFindingInput[] = [];
  const failedCollectors: string[] = [];

  for (const [name, result] of results) {
    if (result.status === 'failed') {
      failedCollectors.push(name);
    }
    allFindings.push(...result.findings);
  }

  // 1. Check for duplicate finding keys
  const duplicateKeys = checkDuplicateKeys(allFindings);
  if (duplicateKeys > 0) {
    warnings.push(`${duplicateKeys} duplicate finding keys detected`);
  }

  // 2. Verify domain coverage
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

  // 3. Cross-reference validation: products in pricing exist in catalog
  const crossRefIssues = validateCrossReferences(allFindings);
  warnings.push(...crossRefIssues);

  // 4. Schema version consistency
  const schemaVersions = new Set<string>();
  for (const f of allFindings) {
    schemaVersions.add(f.schemaVersion ?? '1.0');
  }
  if (schemaVersions.size > 1) {
    warnings.push(
      `Multiple schema versions detected: ${[...schemaVersions].join(', ')}. Ensure compatibility.`
    );
  }

  // 5. Data quality signals
  const qualityWarnings = checkDataQuality(allFindings);
  warnings.push(...qualityWarnings);

  // 6. Failed collectors check
  if (failedCollectors.length > 0) {
    warnings.push(`${failedCollectors.length} collectors failed: ${failedCollectors.join(', ')}`);
  }

  const valid = errors.length === 0;

  const result: ValidationResult = {
    valid,
    warnings,
    errors,
    stats: {
      totalFindings: allFindings.length,
      duplicateKeys,
      domainsWithData: domainsWithData.size,
      domainsEmpty,
      failedCollectors,
      schemaVersions: [...schemaVersions],
    },
  };

  log.info(
    {
      valid,
      totalFindings: allFindings.length,
      warnings: warnings.length,
      errors: errors.length,
      duplicateKeys,
    },
    'validation_complete'
  );

  return result;
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

  // Check for findings without RCA mapping
  const noMapping = findings.filter(
    (f) =>
      !f.rcaMappingComplexity &&
      f.artifactType !== 'DataCount' &&
      f.artifactType !== 'OrgFingerprint' &&
      f.artifactType !== 'UsageOverview' &&
      f.artifactType !== 'OrderLifecycleOverview'
  );
  const noMappingPercent = findings.length > 0 ? (noMapping.length / findings.length) * 100 : 0;
  if (noMappingPercent > 30) {
    warnings.push(
      `${Math.round(noMappingPercent)}% of findings lack RCA mapping complexity classification`
    );
  }

  return warnings;
}
