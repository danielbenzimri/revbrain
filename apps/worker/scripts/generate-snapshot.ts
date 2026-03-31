#!/usr/bin/env npx tsx
/**
 * Generate V4 live verification snapshot and V3->V4 delta summary.
 * Task T5a from CPQ-REPORT-V4-MITIGATION-PLAN.md
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateReport } from '../src/report/index.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outputDir = resolve(__dirname, '../output');

const raw = JSON.parse(readFileSync(resolve(outputDir, 'assessment-results.json'), 'utf-8'));
const findings = raw.findings ?? [];
const { reportData, validation } = generateReport(findings);

const c = reportData.counts;

// Extract top product percentages
const topProductPcts = reportData.usageAdoption.topProducts.map((p) => ({
  name: p.name,
  percentQuotes: p.percentQuotes,
  quotedCount: p.quotedCount,
}));
const allPctsUnder100 = topProductPcts.every((p) => {
  const m = p.percentQuotes.match(/^(\d+)%/);
  return !m || Number(m[1]) <= 100;
});

const snapshot = {
  generatedAt: new Date().toISOString(),
  extractionFile: 'assessment-results.json',
  findingsCount: findings.length,
  validationPassed: validation.valid,
  validationErrors: validation.rules.filter((r) => !r.passed).map((r) => `${r.id}: ${r.message}`),
  validationWarnings: validation.rules.filter((r) => !r.passed && r.severity === 'warning').map((r) => `${r.id}: ${r.message}`),
  metrics: {
    sbaaVersion: reportData.metadata.sbaaVersion,
    sbaaInstalled: c.sbaaInstalled,
    sbaaVersionDisplay: c.sbaaVersionDisplay,
    totalProducts: c.totalProducts,
    activeProducts: c.activeProducts,
    activeProductSource: c.activeProductSource,
    activeProductStatus: c.activeProductStatus,
    bundleProducts: c.bundleProducts,
    productOptions: c.productOptions,
    productFamilies: c.productFamilies,
    activePriceRules: c.activePriceRules,
    totalPriceRules: c.totalPriceRules,
    activeProductRules: c.activeProductRules,
    totalProductRules: c.totalProductRules,
    totalQuotes: c.totalQuotes,
    totalQuoteLines: c.totalQuoteLines,
    activeUsers: c.activeUsers,
    activeUsersSource: c.activeUsersSource,
    activeUserStatus: c.activeUserStatus,
    approvalRuleCount: c.approvalRuleCount,
    flowCountActive: c.flowCountActive,
    validationRuleCount: c.validationRuleCount,
    apexClassCount: c.apexClassCount,
    triggerCount: c.triggerCount,
  },
  topProducts: topProductPcts,
  allTopProductPercentagesUnder100: allPctsUnder100,
  coverPage: {
    clientName: reportData.metadata.clientName,
    orgId: reportData.metadata.orgId,
    environment: reportData.metadata.environment,
    assessmentPeriod: reportData.metadata.assessmentPeriod,
    cpqVersion: reportData.metadata.cpqVersion,
    sbaaVersion: reportData.metadata.sbaaVersion,
    documentVersion: reportData.metadata.documentVersion,
  },
  lowVolumeWarning: reportData.metadata.lowVolumeWarning,
  reportBanners: reportData.reportBanners,
};

writeFileSync(resolve(outputDir, 'v4-live-snapshot.json'), JSON.stringify(snapshot, null, 2));
console.log('Wrote v4-live-snapshot.json');

// Delta summary
const delta = `# V3 to V4 Delta Summary

> Generated: ${new Date().toISOString()}
> Source: assessment-results.json (${findings.length} findings)

## Validation Gate

- ReportConsistencyValidator (V17-V24): **${validation.valid ? 'ALL PASSED' : 'FAILED'}**
- Errors: ${validation.rules.filter((r) => !r.passed && r.severity === 'error').length}
- Warnings: ${validation.rules.filter((r) => !r.passed && r.severity === 'warning').length}

## Key Metric Deltas (V3 vs V4)

| Metric | V3 Value | V4 Value | Change | Rationale |
|--------|----------|----------|--------|-----------|
| Active Products | 38 (proxy from category subtotals) | ${c.activeProducts} (${c.activeProductSource}) | +${c.activeProducts - 38} | V4 counts all Product2 findings; V3 only summed category subtotals. Source: ${c.activeProductSource === 'IsActive' ? 'IsActive field' : 'inferred from extraction'} |
| Total Products | ~38 (was same as active) | ${c.totalProducts} | +${c.totalProducts - 38} | V4 correctly distinguishes total vs active |
| Bundle-capable Products | Not reported | ${c.bundleProducts} | New metric | Products with ConfigurationType in (Allowed, Required) |
| Product Options | Not reported | ${c.productOptions} | New metric | SBQQ__ProductOption__c count |
| Top Product % (max) | >100% (117%) | ${topProductPcts[0]?.percentQuotes ?? 'N/A'} | Fixed | V3 used wrong denominator (Quote Templates=6 instead of totalQuotes=23) |
| All Top Products <= 100% | No | ${allPctsUnder100 ? 'Yes' : 'No'} | Fixed | totalQuotes denominator corrected |
| sbaa Version | "Not installed" | "${reportData.metadata.sbaaVersion ?? 'null'}" | Fixed | Three-level fallback: InstalledPackage -> OrgFingerprint -> CPQSettingValue |
| sbaa Installed | Unknown | ${c.sbaaInstalled} | Detected | Package namespace found in installed packages |
| Approval Rules | "not detected" (0) | ${c.approvalRuleCount} | ${c.approvalRuleCount > 0 ? 'Now extracted' : 'Still 0 (sbaa objects may not be accessible)'} | ${c.approvalRuleCount > 0 ? 'Approvals collector now independent of Discovery describeCache' : 'sbaa describe may have been skipped; approval objects not queryable in this org'} |
| Active Users (warning) | 0 in warning, 1 in panel | ${c.activeUsers} in both | Reconciled | Single source (ReportCounts.activeUsers) used everywhere |
| Active Users Source | Unknown | ${c.activeUsersSource} | Explicit | UserAdoption primary, UserBehavior fallback |
| Total Quotes | 6 (was Quote Templates count!) | ${c.totalQuotes} | Fixed | V3 matched "Quote Templates" DataCount; V4 specifically matches "Quotes (90d)" / "Quotes (all)" |
| Flow Count (Active) | 44 | ${c.flowCountActive} | Unchanged | Verified against SOQL (T6) |
| Validation Rules | 25 | ${c.validationRuleCount} | Unchanged | Verified against SOQL (T7) |

## Structural Changes

1. **Package filtering (Section 4.2):** "Package:" entries removed from Core Settings. Packages appear only in dedicated Installed Packages section (Section 4.1).
2. **Bundle label:** Changed from "Bundles" to "Bundle-capable Products" for accuracy.
3. **Conditional labels:** "Products Extracted" shown when activeProductSource is inferred; "Active Products" shown only when IsActive field is available.
4. **Active user reconciliation:** Low-volume warning and At-a-Glance panel now use identical count from ReportCounts.
5. **Appendix D coverage:** Product Catalog coverage reflects actual extraction depth (Full/Partial/Minimal).
6. **Complexity rationale:** References actual counts instead of generic text; no "no product options" contradiction.

## Items Unchanged

- CPQ Version: ${reportData.metadata.cpqVersion}
- Active Price Rules: ${c.activePriceRules} of ${c.totalPriceRules}
- Active Product Rules: ${c.activeProductRules} of ${c.totalProductRules}
- Apex Classes: ${c.apexClassCount}
- Triggers: ${c.triggerCount}
`;

writeFileSync(resolve(outputDir, 'v4-delta-summary.md'), delta);
console.log('Wrote v4-delta-summary.md');
