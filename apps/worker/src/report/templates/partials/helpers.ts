/** HTML escaping to prevent XSS from finding data */
export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Confidence badge */
export function badge(confidence: string): string {
  const cls =
    confidence === 'Confirmed' || confidence === 'Full'
      ? 'badge-confirmed'
      : confidence === 'Estimated'
        ? 'badge-estimated'
        : 'badge-partial';
  return `<span class="badge ${cls}">${escapeHtml(confidence)}</span>`;
}

/** Score bar (0-100) */
export function scoreBar(label: string, score: number): string {
  return `
    <div style="display: flex; align-items: center; margin: 4px 0;">
      <div style="width: 180px; font-weight: 600;">${escapeHtml(label)}</div>
      <div style="color: #e67e22; font-weight: 600; width: 50px;">${score}/100</div>
      <div class="score-bar" style="flex: 1;">
        <div class="score-fill" style="width: ${score}%;"></div>
      </div>
    </div>`;
}

/** Severity label */
export function severity(level: string): string {
  return `<span class="severity-${level.toLowerCase()}">${escapeHtml(level)}</span>`;
}

/** Simple table from rows */
export function table(headers: string[], rows: string[][]): string {
  const ths = headers.map((h) => `<th>${escapeHtml(h)}</th>`).join('');
  const trs = rows.map((row) => `<tr>${row.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('\n');
  return `<table><thead><tr>${ths}</tr></thead><tbody>${trs}</tbody></table>`;
}

/**
 * Paginate a table: show first maxRows rows, with a "see Appendix" footer
 * linking to the full list. Returns the truncated row array + footer HTML.
 *
 * Anchor convention: #appendix-a, #appendix-b, etc.
 */
export function paginateTable<T>(
  rows: T[],
  maxRows: number = 20,
  appendixLabel?: string,
  appendixAnchor?: string
): { visible: T[]; footer: string } {
  if (rows.length <= maxRows) {
    return { visible: rows, footer: '' };
  }
  const visible = rows.slice(0, maxRows);
  const footer =
    appendixLabel && appendixAnchor
      ? `<p style="font-size: 11px; color: #718096; margin-top: 4px;">
        <em>Top ${maxRows} shown. See <a href="#${escapeHtml(appendixAnchor)}">${escapeHtml(appendixLabel)}</a> for full list (${rows.length} total).</em>
      </p>`
      : `<p style="font-size: 11px; color: #718096; margin-top: 4px;">
        <em>Top ${maxRows} of ${rows.length} shown.</em>
      </p>`;
  return { visible, footer };
}

/** Format a label for bundle-capable products (V31 enforcement constant) */
export const BUNDLE_CAPABLE_LABEL = 'bundle-capable';

/** Format a bundle-capable count string */
export function formatBundleCapable(count: number): string {
  return `${count} ${BUNDLE_CAPABLE_LABEL} products`;
}
