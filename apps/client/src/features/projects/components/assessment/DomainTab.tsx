/**
 * Domain Tab — Reusable template for all domain tabs
 *
 * Stats strip → migration status bar → sub-tab sidebar (optional)
 * → inventory table → insights panel → business context area
 */
import { useState, useMemo } from 'react';
import type {
  DomainData,
  AssessmentItem,
  SubTab,
  Complexity,
  MigrationStatus,
  TriageState,
} from '../../mocks/assessment-mock-data';

// ---------------------------------------------------------------------------
// Stat Card
// ---------------------------------------------------------------------------

interface StatCardProps {
  label: string;
  value: string | number;
  accent?: string;
}

function StatCard({ label, value, accent }: StatCardProps) {
  return (
    <div className={`bg-white rounded-2xl p-4 text-center ${accent || ''}`}>
      <p className="text-2xl font-bold text-slate-900">{value}</p>
      <p className="text-xs text-slate-500 mt-0.5">{label}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Migration Status Bar
// ---------------------------------------------------------------------------

interface StatusBarProps {
  stats: DomainData['stats'];
  t: (key: string, opts?: Record<string, unknown>) => string;
}

function MigrationStatusBar({ stats, t }: StatusBarProps) {
  const total = stats.total;
  if (total === 0) return null;

  const segments = [
    { key: 'auto', count: stats.auto, color: 'bg-emerald-500', textColor: 'text-emerald-600' },
    { key: 'guided', count: stats.guided, color: 'bg-amber-500', textColor: 'text-amber-600' },
    { key: 'manual', count: stats.manual, color: 'bg-red-500', textColor: 'text-red-600' },
    { key: 'blocked', count: stats.blocked, color: 'bg-slate-800', textColor: 'text-slate-800' },
  ];

  return (
    <div className="bg-white rounded-2xl p-5" data-testid="migration-status-bar">
      <h3 className="text-sm font-semibold text-slate-900 mb-3">
        {t('assessment.domain.migrationStatusBar')}
      </h3>
      <div className="flex items-center gap-0.5 h-3 rounded-full overflow-hidden bg-slate-100 mb-3">
        {segments.map(({ key, count, color }) =>
          count > 0 ? (
            <div
              key={key}
              className={`${color} h-full transition-all`}
              style={{ width: `${(count / total) * 100}%` }}
            />
          ) : null
        )}
      </div>
      <div className="flex items-center gap-4 text-xs">
        {segments.map(({ key, count, color, textColor }) => (
          <div key={key} className="flex items-center gap-1.5">
            <div className={`w-2 h-2 rounded-full ${color}`} />
            <span className={`font-medium ${textColor}`}>
              {t(`assessment.migrationStatus.${key}`)} ({count})
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-tab Sidebar
// ---------------------------------------------------------------------------

interface SubTabSidebarProps {
  subTabs: SubTab[];
  activeSubTab: string;
  onSubTabChange: (id: string) => void;
  t: (key: string) => string;
}

function SubTabSidebar({ subTabs, activeSubTab, onSubTabChange, t }: SubTabSidebarProps) {
  return (
    <nav className="w-48 shrink-0 space-y-1" data-testid="sub-tab-sidebar" aria-label="Sub-tabs">
      {subTabs.map((sub) => (
        <button
          key={sub.id}
          onClick={() => onSubTabChange(sub.id)}
          className={`w-full text-start px-3 py-2 rounded-lg text-sm transition-colors ${
            activeSubTab === sub.id
              ? 'bg-violet-50 text-violet-700 font-medium'
              : 'text-slate-600 hover:bg-slate-50'
          }`}
        >
          {t(sub.labelKey)}
          <span className="text-slate-400 ms-1 text-xs">({sub.itemCount})</span>
        </button>
      ))}
    </nav>
  );
}

// ---------------------------------------------------------------------------
// Inventory Table
// ---------------------------------------------------------------------------

const COMPLEXITY_BADGE: Record<Complexity, string> = {
  low: 'text-emerald-700 bg-emerald-50',
  moderate: 'text-amber-700 bg-amber-50',
  high: 'text-red-700 bg-red-50',
};

const TRIAGE_INDICATOR: Record<TriageState, { icon: string; cls: string }> = {
  untriaged: { icon: '○', cls: 'text-slate-300' },
  in_scope: { icon: '✓', cls: 'text-emerald-500' },
  excluded: { icon: '—', cls: 'text-slate-300 line-through' },
  needs_discussion: { icon: '?', cls: 'text-amber-500' },
};

const STATUS_BADGE: Record<MigrationStatus, string> = {
  auto: 'text-emerald-700 bg-emerald-50',
  guided: 'text-amber-700 bg-amber-50',
  manual: 'text-red-700 bg-red-50',
  blocked: 'text-slate-700 bg-slate-100',
};

interface InventoryTableProps {
  items: AssessmentItem[];
  onItemClick?: (itemId: string) => void;
  t: (key: string, opts?: Record<string, unknown>) => string;
}

function InventoryTable({ items, onItemClick, t }: InventoryTableProps) {
  const [search, setSearch] = useState('');
  const [complexityFilter, setComplexityFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const filtered = useMemo(() => {
    return items.filter((item) => {
      if (search && !item.name.toLowerCase().includes(search.toLowerCase())) return false;
      if (complexityFilter !== 'all' && item.complexity !== complexityFilter) return false;
      if (statusFilter !== 'all' && item.migrationStatus !== statusFilter) return false;
      return true;
    });
  }, [items, search, complexityFilter, statusFilter]);

  return (
    <div data-testid="inventory-table">
      {/* Filters */}
      <div className="flex items-center gap-3 mb-3">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('assessment.table.search')}
          className="flex-1 px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-violet-200"
          aria-label={t('assessment.table.search')}
        />
        <select
          value={complexityFilter}
          onChange={(e) => setComplexityFilter(e.target.value)}
          className="px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white"
          aria-label={t('assessment.table.filterComplexity')}
        >
          <option value="all">{t('assessment.table.filterAll')}</option>
          <option value="low">{t('assessment.complexity.low')}</option>
          <option value="moderate">{t('assessment.complexity.moderate')}</option>
          <option value="high">{t('assessment.complexity.high')}</option>
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white"
          aria-label={t('assessment.table.filterStatus')}
        >
          <option value="all">{t('assessment.table.filterAll')}</option>
          <option value="auto">{t('assessment.migrationStatus.auto')}</option>
          <option value="guided">{t('assessment.migrationStatus.guided')}</option>
          <option value="manual">{t('assessment.migrationStatus.manual')}</option>
          <option value="blocked">{t('assessment.migrationStatus.blocked')}</option>
        </select>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="bg-slate-50 text-xs font-medium text-slate-500 uppercase">
              <th className="text-start px-4 py-3">{t('assessment.table.name')}</th>
              <th className="text-start px-4 py-3">{t('assessment.table.complexity')}</th>
              <th className="text-start px-4 py-3">{t('assessment.table.status')}</th>
              <th className="text-start px-4 py-3">{t('assessment.table.rcaTarget')}</th>
              <th className="px-4 py-3 w-8"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.map((item) => (
              <tr
                key={item.id}
                onClick={() => onItemClick?.(item.id)}
                className="hover:bg-slate-50/50 cursor-pointer transition-colors"
                role="row"
              >
                <td className="px-4 py-3">
                  <div className="flex items-start gap-2">
                    <span
                      className={`mt-1 text-sm ${TRIAGE_INDICATOR[item.triageState].cls}`}
                      title={t(`assessment.triage.${item.triageState}`)}
                      data-testid="triage-indicator"
                    >
                      {TRIAGE_INDICATOR[item.triageState].icon}
                    </span>
                    <div>
                      <p
                        className={`text-sm font-medium ${item.triageState === 'excluded' ? 'text-slate-400 line-through' : 'text-slate-900'}`}
                      >
                        {item.name}
                      </p>
                      <p className="text-xs text-slate-400">{item.apiName}</p>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`text-xs font-medium px-2 py-0.5 rounded-full ${COMPLEXITY_BADGE[item.complexity]}`}
                  >
                    {t(`assessment.complexity.${item.complexity}`)}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_BADGE[item.migrationStatus]}`}
                    title={item.whyStatus}
                  >
                    {t(`assessment.migrationStatus.${item.migrationStatus}`)}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className="text-sm text-slate-600">{item.rcaTarget || '—'}</span>
                </td>
                <td className="px-4 py-3 text-slate-300">→</td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-sm text-slate-400">
                  {t('assessment.table.noResults')}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Item count */}
      <p className="text-xs text-slate-400 mt-2">
        {t('assessment.table.showingItems', { from: 1, to: filtered.length, total: items.length })}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Insights Panel
// ---------------------------------------------------------------------------

interface InsightsPanelProps {
  insights: string[];
  t: (key: string) => string;
}

function InsightsPanel({ insights, t }: InsightsPanelProps) {
  if (insights.length === 0) return null;

  return (
    <section className="bg-white rounded-2xl p-5" data-testid="insights-panel">
      <h3 className="text-sm font-semibold text-slate-900 mb-3">
        {t('assessment.domain.insights')}
      </h3>
      <div className="space-y-2">
        {insights.map((insight, i) => (
          <div key={i} className="flex items-start gap-2.5">
            <span className="text-amber-500 mt-0.5 shrink-0">💡</span>
            <p className="text-sm text-slate-700">{t(insight)}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Business Context
// ---------------------------------------------------------------------------

interface BusinessContextProps {
  t: (key: string) => string;
}

function BusinessContext({ t }: BusinessContextProps) {
  const [collapsed, setCollapsed] = useState(true);

  return (
    <section className="bg-white rounded-2xl p-5" data-testid="business-context">
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="flex items-center justify-between w-full text-start"
      >
        <h3 className="text-sm font-semibold text-slate-900">
          {t('assessment.domain.businessContext')}
        </h3>
        <span className="text-xs text-slate-400">
          {collapsed ? t('assessment.domain.expand') : t('assessment.domain.collapse')}
        </span>
      </button>
      {!collapsed && (
        <div className="mt-3">
          <textarea
            className="w-full h-24 px-3 py-2 text-sm border border-slate-200 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-violet-200"
            placeholder={t('assessment.domain.businessContextPlaceholder')}
          />
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

interface DomainTabProps {
  domain: DomainData;
  statCards: StatCardProps[];
  onItemClick?: (itemId: string) => void;
  onSubTabChange?: (subTabId: string) => void;
  activeSubTab?: string;
  children?: React.ReactNode; // For sub-tab-specific content
  t: (key: string, opts?: Record<string, unknown>) => string;
}

export default function DomainTab({
  domain,
  statCards,
  onItemClick,
  onSubTabChange,
  activeSubTab,
  children,
  t,
}: DomainTabProps) {
  const hasSubTabs = domain.subTabs.length > 0;
  const currentSubTab = activeSubTab || (hasSubTabs ? domain.subTabs[0].id : '');

  return (
    <div className="space-y-4">
      {/* Stats Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3" data-testid="stats-strip">
        {statCards.map((card, i) => (
          <StatCard key={i} {...card} />
        ))}
      </div>

      {/* Migration Status Bar */}
      <MigrationStatusBar stats={domain.stats} t={t} />

      {/* Content Area (with optional sub-tab sidebar) */}
      {hasSubTabs ? (
        <div className="flex gap-4">
          <SubTabSidebar
            subTabs={domain.subTabs}
            activeSubTab={currentSubTab}
            onSubTabChange={onSubTabChange || (() => {})}
            t={t}
          />
          <div className="flex-1 space-y-4">
            {children || <InventoryTable items={domain.items} onItemClick={onItemClick} t={t} />}
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <InventoryTable items={domain.items} onItemClick={onItemClick} t={t} />
        </div>
      )}

      {/* Insights */}
      <InsightsPanel insights={domain.insights} t={t} />

      {/* Business Context */}
      <BusinessContext t={t} />
    </div>
  );
}
