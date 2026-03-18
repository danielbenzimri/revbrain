/**
 * BOQ Mini Dashboard
 *
 * Code structure: BB.PP.S.II
 *   BB = מבנה (building)
 *   PP = פרק (chapter)
 *   S  = תת פרק (sub-chapter)
 *   II = מספר סעיף (item number)
 *
 * Segmentation parses the code prefix — NOT tree depth.
 */
import { useMemo, useState } from 'react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import type { BOQItem } from '../hooks/use-boq';

type Segment = 'buildings' | 'chapters' | 'subchapters';

const SEGMENTS: { value: Segment; label: string; depth: number }[] = [
  { value: 'buildings', label: 'מבנים', depth: 1 },
  { value: 'chapters', label: 'פרקים', depth: 2 },
  { value: 'subchapters', label: 'תתי פרקים', depth: 3 },
];

const PALETTE = [
  '#3b82f6',
  '#10b981',
  '#f59e0b',
  '#8b5cf6',
  '#ef4444',
  '#ec4899',
  '#14b8a6',
  '#f97316',
  '#6366f1',
  '#84cc16',
  '#0ea5e9',
  '#a855f7',
];
const clr = (i: number) => PALETTE[i % PALETTE.length];

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Collect all leaf items (no children, or zero-value parents) */
function collectLeaves(items: BOQItem[]): BOQItem[] {
  const out: BOQItem[] = [];
  for (const it of items) {
    if (!it.children?.length) {
      out.push(it);
    } else {
      out.push(...collectLeaves(it.children));
    }
  }
  return out;
}

/** Build code → description map for all items in tree */
function buildDescMap(items: BOQItem[], map = new Map<string, string>()): Map<string, string> {
  for (const it of items) {
    if (it.code && it.description) map.set(it.code, it.description);
    if (it.children) buildDescMap(it.children, map);
  }
  return map;
}

/**
 * Get the prefix of `code` at a given depth.
 * "10.60.2.10" depth=2 → "10.60"
 */
function codePrefix(code: string, depth: number): string {
  return (code ?? '').split('.').slice(0, depth).join('.');
}

/**
 * Natural numeric sort for code prefixes.
 * "10.2" < "10.10" < "12.1" — each part compared as a number.
 */
function comparePrefixes(a: string, b: string): number {
  const ap = a.split('.').map(Number);
  const bp = b.split('.').map(Number);
  for (let i = 0; i < Math.max(ap.length, bp.length); i++) {
    const diff = (ap[i] ?? 0) - (bp[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

/**
 * Find the description for a group prefix by looking up the "header" item.
 * prefix "10.60" → tries "10.60.0.0", "10.60.0", "10.60" in descMap
 */
function groupDesc(prefix: string, descMap: Map<string, string>): string {
  const parts = prefix.split('.');
  // Pad with zeros up to 4 parts
  for (let len = parts.length; len <= 4; len++) {
    const key = [...parts, ...Array(len - parts.length).fill('0')].join('.');
    const d = descMap.get(key);
    if (d) return d;
  }
  return '';
}

function fmtC(v: number) {
  if (v >= 1_000_000) return `₪${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `₪${(v / 1_000).toFixed(0)}K`;
  return `₪${Math.round(v)}`;
}
function fmtFull(v: number) {
  return new Intl.NumberFormat('he-IL', {
    style: 'currency',
    currency: 'ILS',
    maximumFractionDigits: 0,
  }).format(v);
}

// ── Pie tooltip ───────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function PieTip({ active, payload }: { active?: boolean; payload?: any[] }) {
  if (!active || !payload?.length) return null;
  const d = payload[0];
  return (
    <div
      className="bg-white border border-slate-200 rounded-lg shadow-lg px-3 py-2 text-xs"
      style={{ textAlign: 'right', direction: 'rtl' }}
    >
      <div className="font-mono text-slate-400 text-[10px]">{d.payload.prefix}</div>
      {d.payload.desc && <div className="text-slate-700 font-medium mb-0.5">{d.payload.desc}</div>}
      <div className="font-bold" style={{ color: d.payload.fill }}>
        {fmtFull(d.value)}
      </div>
      <div className="text-slate-400">{d.payload.pct}%</div>
    </div>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export function BOQDashboard({ items }: { items: BOQItem[] }) {
  const [segment, setSegment] = useState<Segment>('buildings');
  const depth = SEGMENTS.find((s) => s.value === segment)!.depth;

  const { barData, pieData, total, catCount } = useMemo(() => {
    const leaves = collectLeaves(items);
    const descMap = buildDescMap(items);

    // Group leaves by code prefix
    const groups = new Map<string, number>();
    for (const leaf of leaves) {
      const v = ((leaf.contractQuantity ?? 0) * (leaf.unitPriceCents ?? 0)) / 100;
      if (!v) continue;
      const pfx = codePrefix(leaf.code ?? '', depth);
      if (!pfx) continue;
      groups.set(pfx, (groups.get(pfx) ?? 0) + v);
    }

    const grandTotal = [...groups.values()].reduce((s, v) => s + v, 0);

    // Sort chronologically by code prefix (10 < 12 < 12.10 < 12.20),
    // then assign stable colors so chapters within building 10 come before 12, etc.
    const sorted = [...groups.entries()]
      .map(([pfx, val]) => ({
        id: pfx,
        prefix: pfx,
        desc: groupDesc(pfx, descMap),
        value: Math.round(val),
        pct: grandTotal > 0 ? ((val / grandTotal) * 100).toFixed(1) : '0',
      }))
      .filter((d) => d.value > 0)
      .sort((a, b) => comparePrefixes(a.prefix, b.prefix))
      .map((d, i) => ({ ...d, fill: clr(i) }));

    const maxVal = Math.max(...sorted.map((d) => d.value), 1);
    const barData = sorted.slice(0, 7).map((d) => ({ ...d, maxVal }));

    // Pie: top 8 + rest
    const TOP = 8;
    let pie = sorted;
    if (sorted.length > TOP + 1) {
      const rest = sorted.slice(TOP).reduce((s, d) => s + d.value, 0);
      pie = [
        ...sorted.slice(0, TOP),
        {
          id: '__rest__',
          prefix: '',
          desc: 'אחר',
          value: Math.round(rest),
          fill: '#cbd5e1',
          pct: grandTotal > 0 ? ((rest / grandTotal) * 100).toFixed(1) : '0',
        },
      ];
    }

    return { barData, pieData: pie, total: grandTotal, catCount: sorted.length };
  }, [items, depth]);

  const hasData = barData.length > 0;

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      {/* ── Header ── */}
      <div
        className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-slate-100 bg-slate-50"
        style={{ direction: 'rtl' }}
      >
        <div className="flex items-center gap-3">
          <span className="text-sm font-bold text-slate-700">ניתוח כתב כמויות</span>
          {hasData && (
            <>
              <span className="text-slate-200">|</span>
              <span className="text-sm font-semibold text-slate-800">{fmtFull(total)}</span>
              <span className="text-xs text-slate-400">{catCount} קבוצות</span>
            </>
          )}
        </div>
        <div className="flex items-center bg-white border border-slate-200 rounded-lg p-0.5 gap-0.5">
          {SEGMENTS.map((s) => (
            <button
              key={s.value}
              onClick={() => setSegment(s.value)}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${
                segment === s.value
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Empty ── */}
      {!hasData ? (
        <div
          className="flex items-center justify-center h-28 text-slate-400 text-sm gap-2"
          style={{ direction: 'rtl' }}
        >
          <span>📊</span>
          <span>אין נתונים עבור פילוח זה</span>
        </div>
      ) : (
        <div
          style={{ direction: 'ltr' }}
          className="grid grid-cols-1 md:grid-cols-[1fr_240px] divide-y md:divide-y-0 md:divide-x divide-slate-100"
        >
          {/* ── CSS Bar chart ── */}
          <div className="p-4">
            <p
              className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-3"
              style={{ textAlign: 'right', direction: 'rtl' }}
            >
              {barData.length} קבוצות (לפי סדר קוד)
            </p>
            <div className="flex flex-col gap-2.5">
              {barData.map((d) => {
                const pct = Math.max(3, (d.value / d.maxVal) * 100);
                return (
                  <div key={d.id} title={d.desc || d.prefix}>
                    {/* code + description */}
                    <div className="flex items-baseline gap-2 mb-0.5">
                      <span
                        className="text-[11px] font-mono font-semibold text-slate-600 shrink-0"
                        style={{ direction: 'ltr' }}
                      >
                        {d.prefix}
                      </span>
                      {d.desc && (
                        <span
                          className="text-[10px] text-slate-400 truncate"
                          style={{ direction: 'rtl', maxWidth: 200 }}
                        >
                          {d.desc}
                        </span>
                      )}
                    </div>
                    {/* bar row */}
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-4 bg-slate-100 rounded-sm overflow-hidden relative">
                        <div
                          className="absolute inset-y-0 left-0 rounded-sm"
                          style={{ width: `${pct}%`, backgroundColor: d.fill }}
                        />
                      </div>
                      <span
                        className="text-[11px] font-semibold text-slate-600 w-12 shrink-0 tabular-nums"
                        style={{ direction: 'ltr', textAlign: 'right' }}
                      >
                        {fmtC(d.value)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── Donut + legend ── */}
          <div className="p-4 flex flex-col gap-2">
            <p
              className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide"
              style={{ textAlign: 'right', direction: 'rtl' }}
            >
              חלוקה באחוזים
            </p>
            <div style={{ width: '100%', height: 160 }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={46}
                    outerRadius={72}
                    dataKey="value"
                    paddingAngle={2}
                    startAngle={90}
                    endAngle={-270}
                    stroke="none"
                  >
                    {pieData.map((d) => (
                      <Cell key={d.id} fill={d.fill} />
                    ))}
                  </Pie>
                  <Tooltip content={<PieTip />} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div
              className="flex flex-col gap-1.5 overflow-y-auto"
              style={{ maxHeight: 90, direction: 'rtl' }}
            >
              {pieData.map((d) => (
                <div key={d.id} className="flex items-center gap-1.5 min-w-0">
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ background: d.fill }} />
                  <span
                    className="text-[11px] font-mono text-slate-500 shrink-0"
                    style={{ direction: 'ltr' }}
                  >
                    {d.prefix || 'אחר'}
                  </span>
                  {d.desc && (
                    <span className="text-[10px] text-slate-400 truncate flex-1">{d.desc}</span>
                  )}
                  <span
                    className="text-[11px] font-bold shrink-0 tabular-nums"
                    style={{ color: d.fill }}
                  >
                    {d.pct}%
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default BOQDashboard;
