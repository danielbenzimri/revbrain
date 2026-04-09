/**
 * Checkbox table renderer — 4-column utilization + 2-column binary.
 *
 * Uses CSS-based checkmarks (pseudo-elements) rather than Unicode glyphs.
 * Unicode ☑/☐ is unreliable in Chrome headless PDF rendering.
 *
 * Used by: Section 6.2.1, 6.6.1 (4-column), Section 10.1 (2-column).
 */

import type { CheckboxCategory, CheckboxRow } from '../../assembler.ts';
import { escapeHtml } from './helpers.ts';

/** CSS for checkbox rendering — must be included in reportStyles */
export const checkboxStyles = `
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
`;

/** Render a single checkbox mark (checked or unchecked) */
function check(isChecked: boolean): string {
  return `<span class="cb-check${isChecked ? ' checked' : ''}"></span>`;
}

/** Map CheckboxCategory to which of the 4 columns is checked */
function getCategoryChecks(category: CheckboxCategory): [boolean, boolean, boolean, boolean] {
  switch (category) {
    case 'NOT_USED':
      return [true, false, false, false];
    case 'SOMETIMES':
      return [false, true, false, false];
    case 'MOST_TIMES':
      return [false, false, true, false];
    case 'ALWAYS':
      return [false, false, false, true];
    case 'NOT_APPLICABLE':
    default:
      return [false, false, false, false];
  }
}

/**
 * Render a 4-column checkbox utilization table.
 *
 * Columns: Observation | Not Used | Sometimes | Most Times | Always | Count / % | Notes
 */
export function renderCheckboxTable(rows: CheckboxRow[], title: string, footnote: string): string {
  const headerRow = `
    <tr>
      <th style="text-align: left; min-width: 180px;">Observation</th>
      <th class="cb-cell">Not Used</th>
      <th class="cb-cell">Sometimes</th>
      <th class="cb-cell">Most Times</th>
      <th class="cb-cell">Always</th>
      <th style="text-align: right; width: 90px;">Count / %</th>
      <th style="text-align: left;">Notes</th>
    </tr>`;

  const bodyRows = rows
    .map((row) => {
      const checks = getCategoryChecks(row.category);
      const labelClass = row.isNested ? ' class="cb-nested"' : '';
      const countDisplay =
        row.count !== null && row.percentage !== null
          ? `${row.count} / ${row.percentage}`
          : row.count !== null
            ? String(row.count)
            : 'N/A';

      return `
      <tr>
        <td${labelClass}><strong>${escapeHtml(row.label)}</strong></td>
        <td class="cb-cell">${check(checks[0])}</td>
        <td class="cb-cell">${check(checks[1])}</td>
        <td class="cb-cell">${check(checks[2])}</td>
        <td class="cb-cell">${check(checks[3])}</td>
        <td class="cb-count">${escapeHtml(countDisplay)}</td>
        <td class="cb-notes">${escapeHtml(row.notes)}</td>
      </tr>`;
    })
    .join('');

  return `
    <h4>${escapeHtml(title)}</h4>
    <table class="cb-table">
      <thead>${headerRow}</thead>
      <tbody>${bodyRows}</tbody>
    </table>
    <p style="font-size: 11px; color: #718096; margin-top: 4px;">
      <em>Checkbox thresholds: Not Used = 0%, Sometimes = 1-50%, Most Times = 51-95%, Always = &gt;95%</em>
    </p>
    <p style="font-size: 11px; color: #718096;">${escapeHtml(footnote)}</p>`;
}

/**
 * Render a 2-column binary checkbox table (Used / Not Used).
 *
 * Columns: Functionality | Not Used | Used | Notes
 */
export function renderBinaryCheckboxTable(
  rows: Array<{ label: string; used: boolean; notes: string; isNested?: boolean }>,
  title: string
): string {
  const headerRow = `
    <tr>
      <th style="text-align: left; min-width: 200px;">Functionality</th>
      <th class="cb-cell">Not Used</th>
      <th class="cb-cell">Used</th>
      <th style="text-align: left;">Notes</th>
    </tr>`;

  const bodyRows = rows
    .map((row) => {
      const labelClass = row.isNested ? ' class="cb-nested"' : '';
      return `
      <tr>
        <td${labelClass}><strong>${escapeHtml(row.label)}</strong></td>
        <td class="cb-cell">${check(!row.used)}</td>
        <td class="cb-cell">${check(row.used)}</td>
        <td class="cb-notes">${escapeHtml(row.notes)}</td>
      </tr>`;
    })
    .join('');

  return `
    <h4>${escapeHtml(title)}</h4>
    <table class="cb-table">
      <thead>${headerRow}</thead>
      <tbody>${bodyRows}</tbody>
    </table>`;
}

/**
 * Render a denominator footnote for percentage tables.
 * Enforced via required parameter — compile-time guarantee.
 */
export function renderDenominatorFootnote(
  numeratorDesc: string,
  denominatorDesc: string,
  denominatorValue: number | string
): string {
  return `<p style="font-size: 11px; color: #718096; margin-top: 4px;">
    <em>% = ${escapeHtml(numeratorDesc)} / ${escapeHtml(denominatorDesc)} (${escapeHtml(String(denominatorValue))})</em>
  </p>`;
}
