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
import { assembleReport } from '../src/report/assembler.ts';
import { renderReport } from '../src/report/templates/index.ts';
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

  // Assemble report data
  const reportData = assembleReport(findings);
  console.log(`Report sections assembled:`);
  console.log(`  Settings: ${reportData.packageSettings.coreSettings.length} values`);
  console.log(`  Plugins: ${reportData.packageSettings.plugins.length}`);
  console.log(`  Price rules: ${reportData.configurationDomain.priceRules.length}`);
  console.log(`  Top products: ${reportData.usageAdoption.topProducts.length}`);
  console.log(`  Hotspots: ${reportData.complexityHotspots.length}`);
  console.log(`  Object inventory: ${reportData.appendixA.length} objects`);
  console.log(`  Data quality flags: ${reportData.dataQuality.flaggedAreas.length}`);

  // Render HTML
  const html = renderReport(reportData);
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
