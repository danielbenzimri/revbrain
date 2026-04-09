/**
 * Print-optimized CSS for the assessment report PDF.
 * Blue/orange color scheme matching the benchmark.
 */

export const reportStyles = `
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 10pt; color: #333; line-height: 1.5; }

  /* Page breaks */
  .page-break { page-break-before: always; }

  /* Headers */
  h1 { font-size: 22pt; color: #1a5276; margin-bottom: 8px; font-weight: 700; }
  h2 { font-size: 16pt; color: #2e86c1; margin: 20px 0 10px; border-bottom: 2px solid #2e86c1; padding-bottom: 4px; }
  h3 { font-size: 12pt; color: #1a5276; margin: 14px 0 6px; }

  /* Tables */
  table { width: 100%; border-collapse: collapse; margin: 10px 0 16px; font-size: 9pt; }
  th { background: #2e86c1; color: white; padding: 6px 8px; text-align: left; font-weight: 600; }
  td { padding: 5px 8px; border-bottom: 1px solid #ddd; }
  tr:nth-child(even) td { background: #f8f9fa; }

  /* Confidence badges */
  .badge { display: inline-block; padding: 1px 6px; border-radius: 3px; font-size: 8pt; font-weight: 500; }
  .badge-confirmed { background: #d4edda; color: #155724; }
  .badge-estimated { background: #fff3cd; color: #856404; }
  .badge-partial { background: #e2e3e5; color: #383d41; }

  /* Score bars */
  .score-bar { display: flex; height: 18px; background: #eee; border-radius: 3px; overflow: hidden; margin: 4px 0; }
  .score-fill { background: linear-gradient(90deg, #e67e22, #f39c12); height: 100%; transition: width 0.3s; }
  .score-label { font-size: 10pt; font-weight: 600; color: #e67e22; margin-left: 8px; }

  /* Severity */
  .severity-critical { color: #c0392b; font-weight: 700; }
  .severity-high { color: #e67e22; font-weight: 600; }
  .severity-medium { color: #f39c12; }
  .severity-low { color: #27ae60; }

  /* Cover page */
  .cover { text-align: center; padding-top: 120px; }
  .cover h1 { font-size: 28pt; color: #1a5276; margin-bottom: 4px; }
  .cover h2 { font-size: 18pt; color: #666; border: none; margin-bottom: 40px; }
  .cover .info-table { width: 60%; margin: 30px auto; text-align: left; }
  .cover .info-table td:first-child { font-weight: 600; width: 40%; background: #f0f4f8; }

  /* Footer line */
  .section-footer { border-top: 2px solid #2e86c1; margin-top: 20px; padding-top: 4px; font-size: 8pt; color: #999; }

  /* Metric grid (CPQ at a Glance) */
  .glance-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
  .glance-section { border: 1px solid #ddd; border-radius: 4px; padding: 10px; }
  .glance-section h4 { background: #2e86c1; color: white; margin: -10px -10px 8px; padding: 6px 10px; border-radius: 4px 4px 0 0; font-size: 9pt; }

  /* V2.1 Checkbox tables (R-01, R-02) */
  .cb-table { width: 100%; border-collapse: collapse; font-size: 12px; margin: 12px 0; }
  .cb-table th { background: #2c5282; color: #fff; padding: 6px 8px; text-align: center; font-size: 11px; }
  .cb-table th:first-child { text-align: left; }
  .cb-table td { padding: 5px 8px; border-bottom: 1px solid #e2e8f0; }
  .cb-table tr:nth-child(even) { background: #f7fafc; }
  .cb-table .cb-cell { text-align: center; width: 70px; }
  .cb-table .cb-count { text-align: right; width: 90px; font-variant-numeric: tabular-nums; }
  .cb-table .cb-notes { color: #718096; font-size: 11px; }
  .cb-table .cb-nested { padding-left: 24px; }
  .cb-check { display: inline-block; width: 16px; height: 16px; border: 2px solid #cbd5e0; border-radius: 3px; position: relative; }
  .cb-check.checked { background: #2c5282; border-color: #2c5282; }
  .cb-check.checked::after { content: ''; position: absolute; left: 4px; top: 1px; width: 5px; height: 9px; border: solid #fff; border-width: 0 2px 2px 0; transform: rotate(45deg); }

  /* V2.1 Numeric column alignment */
  .numeric { text-align: right; font-variant-numeric: tabular-nums; }

  /* V2.1 Page rules for PDF */
  @page { size: A4 portrait; margin: 1in; }
`;
