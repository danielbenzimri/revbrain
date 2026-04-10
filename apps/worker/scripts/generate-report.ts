#!/usr/bin/env npx tsx
/**
 * Generate a PDF assessment report from extraction results.
 *
 * Reads: apps/worker/output/assessment-results.json (or --input path)
 * Writes: apps/worker/output/assessment-report.pdf
 *
 * Usage:
 *   npx tsx apps/worker/scripts/generate-report.ts
 *   npx tsx apps/worker/scripts/generate-report.ts --input path/to/results.json
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateReport } from '../src/report/index.ts';
import { renderPdf } from '../src/report/renderer.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function main() {
  const inputArg = process.argv.find((a) => a.startsWith('--input='));
  const inputPath = inputArg
    ? inputArg.split('=')[1]
    : resolve(__dirname, '../output/assessment-results.json');
  const outputPath = resolve(__dirname, '../output/assessment-report.pdf');

  console.log('=== PDF Report Generator ===\n');
  console.log(`Input: ${inputPath}`);

  // Read extraction results
  const raw = JSON.parse(readFileSync(inputPath, 'utf-8'));
  const findings = raw.findings ?? [];
  console.log(`Findings: ${findings.length}`);

  // Assemble + Validate + Render via full pipeline
  const { reportData, validation, html } = generateReport(findings);
  console.log(`Report sections assembled:`);
  console.log(`  Settings: ${reportData.packageSettings.coreSettings.length} values`);
  console.log(`  Plugins: ${reportData.packageSettings.plugins.length}`);
  console.log(`  Price rules: ${reportData.configurationDomain.priceRules.length}`);
  console.log(`  Top products: ${reportData.usageAdoption.topProducts.length}`);
  console.log(`  Hotspots: ${reportData.complexityHotspots.length}`);
  console.log(`  Object inventory: ${reportData.appendixA.length} objects`);
  console.log(`  Data quality flags: ${reportData.dataQuality.flaggedAreas.length}`);

  // Report validation results
  console.log(`\n=== Validation Results (V17-V24) ===`);
  console.log(`  Overall: ${validation.valid ? 'PASSED' : 'FAILED'}`);
  for (const rule of validation.rules) {
    const status = rule.passed ? 'PASS' : 'FAIL';
    const icon = rule.passed ? '[OK]' : '[!!]';
    console.log(`  ${icon} ${rule.id}: ${rule.name} — ${status} — ${rule.message}`);
  }
  if (validation.reportBanners.length > 0) {
    console.log(`\n  Report Banners (${validation.reportBanners.length}):`);
    for (const b of validation.reportBanners) {
      console.log(`    - ${b}`);
    }
  } else {
    console.log(`\n  No error banners — zero errors.`);
  }

  // Also log canonical counts for snapshot
  console.log(`\n=== Canonical Counts (ReportCounts) ===`);
  const c = reportData.counts;
  console.log(`  totalProducts: ${c.totalProducts}`);
  console.log(
    `  activeProducts: ${c.activeProducts} (source: ${c.activeProductSource}, status: ${c.activeProductStatus})`
  );
  console.log(`  bundleProducts: ${c.bundleProducts}`);
  console.log(`  productOptions: ${c.productOptions}`);
  console.log(`  productFamilies: ${c.productFamilies}`);
  console.log(`  activePriceRules: ${c.activePriceRules} of ${c.totalPriceRules}`);
  console.log(`  activeProductRules: ${c.activeProductRules} of ${c.totalProductRules}`);
  console.log(`  totalQuotes: ${c.totalQuotes}`);
  console.log(`  totalQuoteLines: ${c.totalQuoteLines}`);
  console.log(
    `  activeUsers: ${c.activeUsers} (source: ${c.activeUsersSource}, status: ${c.activeUserStatus})`
  );
  console.log(`  sbaaInstalled: ${c.sbaaInstalled}`);
  console.log(`  sbaaVersionDisplay: ${c.sbaaVersionDisplay}`);
  console.log(`  approvalRuleCount: ${c.approvalRuleCount}`);
  console.log(`  flowCountActive: ${c.flowCountActive}`);
  console.log(`  validationRuleCount: ${c.validationRuleCount}`);
  console.log(`  apexClassCount: ${c.apexClassCount}`);
  console.log(`  triggerCount: ${c.triggerCount}`);

  console.log(`\nHTML rendered: ${(html.length / 1024).toFixed(0)} KB`);

  // Save HTML for debugging
  const htmlPath = resolve(__dirname, '../output/assessment-report.html');
  writeFileSync(htmlPath, html);
  console.log(`HTML saved: ${htmlPath}`);

  // Render PDF via Playwright
  console.log('\nGenerating PDF via Playwright...');
  const startTime = Date.now();
  const pdf = await renderPdf(html);
  const durationMs = Date.now() - startTime;

  writeFileSync(outputPath, pdf);
  console.log(`\nPDF generated in ${(durationMs / 1000).toFixed(1)}s`);
  console.log(`Output: ${outputPath}`);
  console.log(`Size: ${(pdf.length / 1024).toFixed(0)} KB`);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
