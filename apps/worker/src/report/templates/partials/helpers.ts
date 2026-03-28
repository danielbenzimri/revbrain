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
    confidence === 'Confirmed'
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
