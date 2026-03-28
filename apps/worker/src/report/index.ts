/**
 * Report Generator — public API.
 *
 * Usage:
 *   const findings = await repo.findFindingsByRun(runId);
 *   const reportData = assembleReport(findings);
 *   const html = renderReport(reportData);
 *   const pdf = await renderPdf(html);
 */

export { assembleReport } from './assembler.ts';
export type { ReportData } from './assembler.ts';
export { renderReport } from './templates/index.ts';
export { renderPdf } from './renderer.ts';
