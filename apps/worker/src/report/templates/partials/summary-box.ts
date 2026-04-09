/**
 * Summary box renderer — paired side-by-side cards.
 *
 * Used for: Product Summary (6.2), Bundle Summary (6.6),
 * At-a-Glance (3) if refactored.
 *
 * CSS: flexbox layout. Each box 48% width with 4% gap.
 * Print-safe: no media queries, no JS.
 */

import { escapeHtml } from './helpers.ts';

export interface SummaryBoxItem {
  label: string;
  value: string;
}

export interface SummaryBox {
  title: string;
  items: SummaryBoxItem[];
}

/** Render a single summary box card */
function renderBox(box: SummaryBox): string {
  const rows = box.items
    .map(
      (item) => `
      <div style="display: flex; justify-content: space-between; padding: 4px 0; border-bottom: 1px solid #f0f0f0;">
        <span>${escapeHtml(item.label)}</span>
        <span style="font-weight: 600;">${escapeHtml(item.value)}</span>
      </div>`
    )
    .join('');

  return `
    <div style="flex: 0 0 48%; background: #f8f9fa; border: 1px solid #dee2e6; border-radius: 6px; padding: 12px 16px;">
      <div style="font-weight: 700; font-size: 13px; color: #2c5282; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px; border-bottom: 2px solid #2c5282; padding-bottom: 4px;">
        ${escapeHtml(box.title)}
      </div>
      ${rows}
    </div>`;
}

/** Render two summary boxes side by side */
export function renderSummaryBoxPair(leftBox: SummaryBox, rightBox: SummaryBox): string {
  return `
    <div style="display: flex; gap: 4%; margin: 16px 0;">
      ${renderBox(leftBox)}
      ${renderBox(rightBox)}
    </div>`;
}

/** Render a single summary box (full width) */
export function renderSummaryBoxSingle(box: SummaryBox): string {
  return `
    <div style="margin: 16px 0;">
      ${renderBox(box)}
    </div>`;
}
