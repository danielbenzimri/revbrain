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
`;
