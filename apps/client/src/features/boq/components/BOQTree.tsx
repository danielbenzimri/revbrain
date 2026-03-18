/**
 * BOQ Tree Component
 *
 * Displays BOQ items in a hierarchical tree structure with:
 * - Expand/collapse functionality
 * - Smart search by code / description (partial, case-insensitive)
 * - Quantity and price display
 * - Row selection for editing
 */
import { useState, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ChevronRight,
  ChevronDown,
  Loader2,
  ChevronsDownUp,
  ChevronsUpDown,
  Search,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { BOQItem } from '../hooks/use-boq';

interface BOQTreeProps {
  items: BOQItem[];
  isLoading?: boolean;
  onItemClick?: (item: BOQItem) => void;
  selectedId?: string | null;
}

interface BOQTreeNodeProps {
  item: BOQItem;
  level: number;
  expandedIds: Set<string>;
  onToggle: (id: string) => void;
  onItemClick?: (item: BOQItem) => void;
  selectedId?: string | null;
  rowIndex: number;
  searchQuery: string;
}

// ─── Formatting ────────────────────────────────────────────────────────────────

function formatCurrency(cents: number | null): string {
  if (cents === null) return '—';
  return new Intl.NumberFormat('he-IL', {
    style: 'currency',
    currency: 'ILS',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

function formatQuantity(qty: number | null, unit: string | null): string {
  if (qty === null) return '—';
  const formattedQty = new Intl.NumberFormat('he-IL', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 4,
  }).format(qty);
  return unit ? `${formattedQty} ${unit}` : formattedQty;
}

function calculateTotalPrice(qty: number | null, unitPriceCents: number | null): number | null {
  if (qty === null || unitPriceCents === null) return null;
  return Math.round(qty * unitPriceCents);
}

// ─── Search helpers ────────────────────────────────────────────────────────────

/** Normalize text for matching — lowercase, collapse whitespace, strip some punctuation */
function normalize(str: string): string {
  return str
    .toLowerCase()
    .replace(/['"״׳]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function itemMatchesQuery(item: BOQItem, query: string): boolean {
  if (!query) return true;
  const q = normalize(query);
  return normalize(item.code ?? '').includes(q) || normalize(item.description ?? '').includes(q);
}

/**
 * Recursively filter items.
 * - If the item itself matches → include it with ALL its original children (full subtree).
 * - If the item doesn't match but a descendant does → include item with only matching branches.
 * - Otherwise → exclude.
 */
function filterItem(item: BOQItem, query: string): BOQItem | null {
  const selfMatches = itemMatchesQuery(item, query);

  if (selfMatches) {
    // Show full subtree so the user sees context
    return item;
  }

  // Check descendants
  const filteredChildren = (item.children ?? [])
    .map((c) => filterItem(c, query))
    .filter(Boolean) as BOQItem[];

  if (filteredChildren.length > 0) {
    return { ...item, children: filteredChildren };
  }

  return null;
}

/** Collect all parent IDs that have children in the (filtered) tree — for auto-expand */
function collectParentIds(items: BOQItem[], acc: Set<string> = new Set()): Set<string> {
  for (const item of items) {
    if (item.children && item.children.length > 0) {
      acc.add(item.id);
      collectParentIds(item.children, acc);
    }
  }
  return acc;
}

/** Count total leaf/visible items in a (possibly filtered) tree */
function countItems(items: BOQItem[]): number {
  let count = 0;
  for (const item of items) {
    count += 1;
    if (item.children) count += countItems(item.children);
  }
  return count;
}

// ─── Flatten tree for virtualization ─────────────────────────────────────────

interface FlatRow {
  item: BOQItem;
  level: number;
}

function flattenVisibleTree(items: BOQItem[], expandedIds: Set<string>, level = 0): FlatRow[] {
  const rows: FlatRow[] = [];
  for (const item of items) {
    rows.push({ item, level });
    if (item.children && item.children.length > 0 && expandedIds.has(item.id)) {
      rows.push(...flattenVisibleTree(item.children, expandedIds, level + 1));
    }
  }
  return rows;
}

const ROW_HEIGHT = 44;
const VIRTUAL_OVERSCAN = 5;
const VIRTUAL_THRESHOLD = 50;

// ─── Text highlight ────────────────────────────────────────────────────────────

function HighlightedText({ text, query }: { text: string; query: string }) {
  if (!query || !text) return <>{text}</>;

  const q = normalize(query);
  const lower = normalize(text);
  const parts: React.ReactNode[] = [];
  let cursor = 0;

  let idx = lower.indexOf(q, cursor);
  while (idx !== -1) {
    if (idx > cursor) parts.push(text.slice(cursor, idx));
    parts.push(
      <mark key={idx} className="bg-amber-200 text-amber-900 rounded-sm px-0.5">
        {text.slice(idx, idx + q.length)}
      </mark>
    );
    cursor = idx + q.length;
    idx = lower.indexOf(q, cursor);
  }
  if (cursor < text.length) parts.push(text.slice(cursor));

  return <>{parts}</>;
}

// ─── Level styles ──────────────────────────────────────────────────────────────

const levelConfig = [
  {
    row: 'bg-slate-100 border-b-2 border-slate-200',
    rowHover: 'hover:bg-slate-200/70',
    rowSelected: 'bg-blue-100 hover:bg-blue-200/70 border-blue-200',
    codeBadge:
      'bg-slate-700 text-white text-xs font-bold px-2 py-0.5 rounded-md font-mono tracking-wide',
    desc: 'font-bold text-slate-800 text-sm',
    nums: 'font-bold text-slate-700 text-sm',
    accentBar: 'bg-slate-500',
  },
  {
    row: 'bg-slate-50 border-b border-slate-200',
    rowHover: 'hover:bg-blue-50/60',
    rowSelected: 'bg-blue-50 hover:bg-blue-100/80',
    codeBadge: 'text-slate-600 text-xs font-semibold font-mono',
    desc: 'font-semibold text-slate-700 text-sm',
    nums: 'font-semibold text-slate-600 text-sm',
    accentBar: 'bg-blue-400',
  },
  {
    row: 'bg-white border-b border-slate-100',
    rowHover: 'hover:bg-emerald-50/50',
    rowSelected: 'bg-blue-50 hover:bg-blue-100/60',
    codeBadge: 'text-slate-500 text-xs font-mono',
    desc: 'text-slate-700 text-sm',
    nums: 'text-slate-600 text-sm',
    accentBar: 'bg-emerald-400',
  },
];

function getLevelStyle(level: number) {
  return levelConfig[Math.min(level, levelConfig.length - 1)];
}

// ─── Tree node ─────────────────────────────────────────────────────────────────

function BOQTreeNode(props: BOQTreeNodeProps) {
  const { item, level, expandedIds, onToggle, onItemClick, selectedId, searchQuery } = props;
  const hasChildren = item.children && item.children.length > 0;
  const isExpanded = expandedIds.has(item.id);
  const isSelected = selectedId === item.id;
  const totalPrice = calculateTotalPrice(item.contractQuantity, item.unitPriceCents);
  const style = getLevelStyle(level);

  return (
    <>
      <tr
        className={cn(
          'cursor-pointer transition-colors duration-100 group',
          style.row,
          isSelected ? style.rowSelected : style.rowHover,
          !item.isActive && 'opacity-40'
        )}
        onClick={() => onItemClick?.(item)}
      >
        {/* Code column */}
        <td className="py-2.5 px-3">
          <div
            className="flex items-center gap-1.5"
            style={{ paddingInlineStart: `${level * 18}px` }}
          >
            {level > 0 && (
              <span
                className={cn(
                  'inline-block w-0.5 rounded-full self-stretch min-h-[18px]',
                  style.accentBar
                )}
              />
            )}

            {hasChildren ? (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onToggle(item.id);
                }}
                className={cn(
                  'flex-shrink-0 p-0.5 rounded transition-colors',
                  level === 0
                    ? 'hover:bg-slate-300 text-slate-600'
                    : 'hover:bg-slate-200 text-slate-400 group-hover:text-slate-600'
                )}
              >
                {isExpanded ? (
                  <ChevronDown className="h-3.5 w-3.5" />
                ) : (
                  <ChevronRight className="h-3.5 w-3.5" />
                )}
              </button>
            ) : (
              <span className="w-5 flex-shrink-0" />
            )}

            <span className={style.codeBadge}>
              <HighlightedText text={item.code ?? ''} query={searchQuery} />
            </span>
          </div>
        </td>

        {/* Description */}
        <td className="py-2.5 px-3">
          <span className={style.desc}>
            <HighlightedText text={item.description ?? ''} query={searchQuery} />
          </span>
        </td>

        {/* Quantity */}
        <td className="py-2.5 px-3 text-end tabular-nums">
          <span className={style.nums}>{formatQuantity(item.contractQuantity, item.unit)}</span>
        </td>

        {/* Unit Price */}
        <td className="py-2.5 px-3 text-end tabular-nums">
          <span className={style.nums}>{formatCurrency(item.unitPriceCents)}</span>
        </td>

        {/* Total Price */}
        <td className="py-2.5 px-3 text-end tabular-nums">
          <span
            className={cn(style.nums, level === 0 && totalPrice !== null && 'text-emerald-700')}
          >
            {formatCurrency(totalPrice)}
          </span>
        </td>
      </tr>

      {hasChildren &&
        isExpanded &&
        item.children!.map((child, idx) => (
          <BOQTreeNode
            key={child.id}
            item={child}
            level={level + 1}
            expandedIds={expandedIds}
            onToggle={onToggle}
            onItemClick={onItemClick}
            selectedId={selectedId}
            rowIndex={idx}
            searchQuery={searchQuery}
          />
        ))}
    </>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────

export function BOQTree({ items, isLoading, onItemClick, selectedId }: BOQTreeProps) {
  const { t } = useTranslation();
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');

  const handleToggle = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleExpandAll = () => {
    const allIds = new Set<string>();
    const collectIds = (items: BOQItem[]) => {
      items.forEach((item) => {
        if (item.children && item.children.length > 0) {
          allIds.add(item.id);
          collectIds(item.children);
        }
      });
    };
    collectIds(items);
    setExpandedIds(allIds);
  };

  const handleCollapseAll = () => {
    setExpandedIds(new Set());
  };

  // ── Search filtering ──
  const isSearching = searchQuery.trim().length > 0;

  const filteredItems = useMemo(() => {
    if (!isSearching) return items;
    return items.map((item) => filterItem(item, searchQuery.trim())).filter(Boolean) as BOQItem[];
  }, [items, searchQuery, isSearching]);

  // When searching, auto-expand all parent nodes that have visible children
  const searchExpandedIds = useMemo(() => {
    if (!isSearching) return null;
    return collectParentIds(filteredItems);
  }, [filteredItems, isSearching]);

  // Active expanded set: during search use auto-expanded, otherwise manual
  const activeExpandedIds = searchExpandedIds ?? expandedIds;

  const matchCount = useMemo(
    () => (isSearching ? countItems(filteredItems) : null),
    [filteredItems, isSearching]
  );

  // ── Loading / empty states ──
  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-500" />
        <span className="ms-2 text-neutral-500">{t('boq.tree.loading')}</span>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="p-8 text-center bg-neutral-50 rounded-xl border border-dashed border-neutral-200">
        <div className="mx-auto w-16 h-16 bg-neutral-100 rounded-full flex items-center justify-center mb-4 text-3xl">
          📋
        </div>
        <h3 className="font-semibold text-lg mb-2">{t('boq.empty')}</h3>
        <p className="text-neutral-500 text-sm">{t('boq.emptyDescription')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex items-center gap-2 flex-wrap">
        {/* Search box */}
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute start-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="חיפוש לפי מספר סעיף או תיאור..."
            className="w-full ps-8 pe-7 py-1.5 text-sm rounded-lg border border-slate-200 bg-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-400 transition-colors"
            dir="rtl"
          />
          {isSearching && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute end-2 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* Match count badge */}
        {isSearching && (
          <span className="text-xs text-slate-500 whitespace-nowrap">
            {matchCount === 0 ? 'לא נמצאו תוצאות' : `נמצאו ${matchCount} פריטים`}
          </span>
        )}

        {/* Spacer */}
        <div className="flex-1" />

        {/* Expand / Collapse */}
        <button
          onClick={handleExpandAll}
          className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-800 px-2.5 py-1.5 rounded-lg hover:bg-slate-100 transition-colors font-medium"
        >
          <ChevronsUpDown className="h-3.5 w-3.5" />
          {t('boq.tree.expand')}
        </button>
        <button
          onClick={handleCollapseAll}
          className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-800 px-2.5 py-1.5 rounded-lg hover:bg-slate-100 transition-colors font-medium"
        >
          <ChevronsDownUp className="h-3.5 w-3.5" />
          {t('boq.tree.collapse')}
        </button>
      </div>

      {/* Table */}
      <BOQVirtualTable
        filteredItems={filteredItems}
        activeExpandedIds={activeExpandedIds}
        handleToggle={handleToggle}
        onItemClick={onItemClick}
        selectedId={selectedId}
        searchQuery={isSearching ? searchQuery.trim() : ''}
        t={t}
      />
    </div>
  );
}

// ─── Virtualized table ─────────────────────────────────────────────────────────

interface BOQVirtualTableProps {
  filteredItems: BOQItem[];
  activeExpandedIds: Set<string>;
  handleToggle: (id: string) => void;
  onItemClick?: (item: BOQItem) => void;
  selectedId?: string | null;
  searchQuery: string;
  t: (key: string) => string;
}

function BOQVirtualTable({
  filteredItems,
  activeExpandedIds,
  handleToggle,
  onItemClick,
  selectedId,
  searchQuery,
  t,
}: BOQVirtualTableProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const flatRows = useMemo(
    () => flattenVisibleTree(filteredItems, activeExpandedIds),
    [filteredItems, activeExpandedIds]
  );

  const useVirtual = flatRows.length > VIRTUAL_THRESHOLD;

  const virtualizer = useVirtualizer({
    count: flatRows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: VIRTUAL_OVERSCAN,
    enabled: useVirtual,
  });

  const tableHeader = (
    <thead className="sticky top-0 z-10">
      <tr className="bg-gradient-to-b from-slate-700 to-slate-800">
        <th className="text-start px-3 py-3 text-xs font-semibold text-slate-200 uppercase tracking-wider w-40 md:w-52">
          {t('boq.item.code')}
        </th>
        <th className="text-start px-3 py-3 text-xs font-semibold text-slate-200 uppercase tracking-wider min-w-[200px]">
          {t('boq.item.description')}
        </th>
        <th className="text-end px-3 py-3 text-xs font-semibold text-slate-200 uppercase tracking-wider w-32 md:w-36">
          {t('boq.item.quantity')}
        </th>
        <th className="text-end px-3 py-3 text-xs font-semibold text-slate-200 uppercase tracking-wider w-32 md:w-36">
          {t('boq.item.unitPrice')}
        </th>
        <th className="text-end px-3 py-3 text-xs font-semibold text-slate-200 uppercase tracking-wider w-32 md:w-40">
          {t('boq.item.totalPrice')}
        </th>
      </tr>
    </thead>
  );

  if (filteredItems.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200 overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px] border-collapse">
            {tableHeader}
            <tbody>
              <tr>
                <td colSpan={5} className="py-12 text-center text-slate-400 text-sm">
                  <Search className="h-8 w-8 mx-auto mb-2 opacity-30" />
                  לא נמצאו סעיפים התואמים את החיפוש
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  if (!useVirtual) {
    return (
      <div className="rounded-xl border border-slate-200 overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px] border-collapse">
            {tableHeader}
            <tbody>
              {flatRows.map((row) => (
                <BOQTreeNode
                  key={row.item.id}
                  item={row.item}
                  level={row.level}
                  expandedIds={activeExpandedIds}
                  onToggle={handleToggle}
                  onItemClick={onItemClick}
                  selectedId={selectedId}
                  rowIndex={0}
                  searchQuery={searchQuery}
                />
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  const virtualItems = virtualizer.getVirtualItems();

  return (
    <div
      className="rounded-xl border border-slate-200 overflow-hidden shadow-sm"
      aria-rowcount={flatRows.length}
    >
      <div ref={scrollRef} className="overflow-auto max-h-[70vh]" style={{ minWidth: 700 }}>
        <table className="w-full min-w-[700px] border-collapse">
          {tableHeader}
          <tbody
            style={{
              height: virtualizer.getTotalSize(),
              position: 'relative',
            }}
          >
            {virtualItems.map((virtualRow) => {
              const row = flatRows[virtualRow.index];
              return (
                <tr
                  key={row.item.id}
                  aria-rowindex={virtualRow.index + 1}
                  data-index={virtualRow.index}
                  ref={virtualizer.measureElement}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                  className={cn(
                    'cursor-pointer transition-colors duration-100 group',
                    getLevelStyle(row.level).row,
                    selectedId === row.item.id
                      ? getLevelStyle(row.level).rowSelected
                      : getLevelStyle(row.level).rowHover,
                    !row.item.isActive && 'opacity-40'
                  )}
                  onClick={() => onItemClick?.(row.item)}
                >
                  <td className="py-2.5 px-3">
                    <div
                      className="flex items-center gap-1.5"
                      style={{ paddingInlineStart: `${row.level * 18}px` }}
                    >
                      {row.level > 0 && (
                        <span
                          className={cn(
                            'inline-block w-0.5 rounded-full self-stretch min-h-[18px]',
                            getLevelStyle(row.level).accentBar
                          )}
                        />
                      )}
                      {row.item.children && row.item.children.length > 0 ? (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleToggle(row.item.id);
                          }}
                          className={cn(
                            'flex-shrink-0 p-0.5 rounded transition-colors',
                            row.level === 0
                              ? 'hover:bg-slate-300 text-slate-600'
                              : 'hover:bg-slate-200 text-slate-400 group-hover:text-slate-600'
                          )}
                        >
                          {activeExpandedIds.has(row.item.id) ? (
                            <ChevronDown className="h-3.5 w-3.5" />
                          ) : (
                            <ChevronRight className="h-3.5 w-3.5" />
                          )}
                        </button>
                      ) : (
                        <span className="w-5 flex-shrink-0" />
                      )}
                      <span className={getLevelStyle(row.level).codeBadge}>
                        <HighlightedText text={row.item.code ?? ''} query={searchQuery} />
                      </span>
                    </div>
                  </td>
                  <td className="py-2.5 px-3">
                    <span className={getLevelStyle(row.level).desc}>
                      <HighlightedText text={row.item.description ?? ''} query={searchQuery} />
                    </span>
                  </td>
                  <td className="py-2.5 px-3 text-end tabular-nums">
                    <span className={getLevelStyle(row.level).nums}>
                      {formatQuantity(row.item.contractQuantity, row.item.unit)}
                    </span>
                  </td>
                  <td className="py-2.5 px-3 text-end tabular-nums">
                    <span className={getLevelStyle(row.level).nums}>
                      {formatCurrency(row.item.unitPriceCents)}
                    </span>
                  </td>
                  <td className="py-2.5 px-3 text-end tabular-nums">
                    <span
                      className={cn(
                        getLevelStyle(row.level).nums,
                        row.level === 0 &&
                          calculateTotalPrice(
                            row.item.contractQuantity,
                            row.item.unitPriceCents
                          ) !== null &&
                          'text-emerald-700'
                      )}
                    >
                      {formatCurrency(
                        calculateTotalPrice(row.item.contractQuantity, row.item.unitPriceCents)
                      )}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default BOQTree;
