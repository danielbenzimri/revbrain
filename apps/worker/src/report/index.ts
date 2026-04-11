/**
 * Report Generator — public API.
 *
 * Pipeline: assembleReport → validateReportConsistency → renderReport → renderPdf
 *
 * Usage:
 *   const findings = await repo.findFindingsByRun(runId);
 *   const { html, reportData, validation } = generateReport(findings);
 *   const pdf = await renderPdf(html);
 */

import { assembleReport, type AssembleReportOptions } from './assembler.ts';
import { renderReport } from './templates/index.ts';
import { validateReportConsistency } from '../normalize/validation.ts';
import type { ReportData } from './assembler.ts';
import type { ReportValidationResult } from '../normalize/validation.ts';
import type { AssessmentFindingInput } from '@revbrain/contract';

export { assembleReport } from './assembler.ts';
export type { AssembleReportOptions, ReportData } from './assembler.ts';
export { renderReport } from './templates/index.ts';
export { renderPdf } from './renderer.ts';
export { validateReportConsistency } from '../normalize/validation.ts';

/**
 * Full report generation pipeline: assemble → validate → render.
 *
 * Validation errors are surfaced as visible banners in the report HTML.
 * Returns the assembled data, validation result, and final HTML.
 */
export function generateReport(
  findings: AssessmentFindingInput[],
  options: AssembleReportOptions
): {
  reportData: ReportData;
  validation: ReportValidationResult;
  html: string;
} {
  // Step 1: Assemble
  const reportData = assembleReport(findings, options);

  // Step 2: Validate (V17-V24 cross-section consistency)
  const validation = validateReportConsistency(reportData);

  // Step 3: Inject validation banners into report data
  if (validation.reportBanners.length > 0) {
    reportData.reportBanners.push(...validation.reportBanners);
  }

  // Step 4: Render
  const html = renderReport(reportData);

  return { reportData, validation, html };
}
