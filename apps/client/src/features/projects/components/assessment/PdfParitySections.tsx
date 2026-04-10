/**
 * PDF Parity Sections — UI cards that mirror every V2.1 PDF report section
 * that was previously missing from the assessment workspace.
 *
 * Covers:
 *   • Section 3   — CPQ At A Glance (6-box dashboard)
 *   • Section 4.1 — Installed Packages
 *   • Section 6.2 — Product Deep Dive (curated field utilization + breakdowns)
 *   • Section 6.6 — Bundles & Options Deep Dive
 *   • Section 7.1 — 90-Day Quoting Activity
 *   • Section 10  — Related Functionality Detection
 *
 * Each card renders only when the transformer has populated its data, matching
 * the T1/T2 tier rules from the PDF spec.
 */
import {
  Package,
  Boxes,
  Layers,
  Link2,
  LineChart,
  Gauge,
  AlertTriangle,
  Check,
  X,
} from 'lucide-react';
import type { AssessmentData } from '../../mocks/assessment-mock-data';

// ---------------------------------------------------------------------------
// Shared checkbox cell
// ---------------------------------------------------------------------------

type CbCategory = 'NOT_USED' | 'SOMETIMES' | 'MOST_TIMES' | 'ALWAYS' | 'NOT_APPLICABLE';

function CheckboxCells({ category }: { category: CbCategory }) {
  const columns: Array<{ key: CbCategory; label: string }> = [
    { key: 'NOT_USED', label: 'Not Used' },
    { key: 'SOMETIMES', label: 'Sometimes' },
    { key: 'MOST_TIMES', label: 'Most Times' },
    { key: 'ALWAYS', label: 'Always' },
  ];
  return (
    <>
      {columns.map((col) => (
        <td key={col.key} className="py-1.5 text-center">
          <span
            className={`inline-flex items-center justify-center w-4 h-4 rounded border ${
              category === col.key
                ? 'bg-violet-600 border-violet-600 text-white'
                : 'bg-white border-slate-300'
            }`}
            aria-label={category === col.key ? col.label : ''}
          >
            {category === col.key ? <Check size={10} strokeWidth={3} /> : null}
          </span>
        </td>
      ))}
    </>
  );
}

function BinaryCheckboxCells({ used }: { used: boolean }) {
  return (
    <>
      <td className="py-1.5 text-center">
        <span
          className={`inline-flex items-center justify-center w-4 h-4 rounded border ${
            !used ? 'bg-slate-600 border-slate-600 text-white' : 'bg-white border-slate-300'
          }`}
          aria-label={!used ? 'Not Used' : ''}
        >
          {!used ? <X size={10} strokeWidth={3} /> : null}
        </span>
      </td>
      <td className="py-1.5 text-center">
        <span
          className={`inline-flex items-center justify-center w-4 h-4 rounded border ${
            used ? 'bg-emerald-600 border-emerald-600 text-white' : 'bg-white border-slate-300'
          }`}
          aria-label={used ? 'Used' : ''}
        >
          {used ? <Check size={10} strokeWidth={3} /> : null}
        </span>
      </td>
    </>
  );
}

// ---------------------------------------------------------------------------
// Reusable Card component (same shape as CPQIntelligence.tsx)
// ---------------------------------------------------------------------------

function Card({
  icon,
  title,
  subtitle,
  children,
  fullWidth = false,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  fullWidth?: boolean;
}) {
  return (
    <div
      className={`bg-white rounded-2xl border border-slate-200 p-5 ${fullWidth ? 'lg:col-span-2' : ''}`}
    >
      <div className="mb-3">
        <div className="flex items-center gap-2">
          <div className="text-slate-400">{icon}</div>
          <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
        </div>
        {subtitle && <p className="text-[11px] text-slate-500 mt-0.5">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section 3: CPQ At A Glance
// ---------------------------------------------------------------------------

function AtAGlanceDashboard({ data }: { data: NonNullable<AssessmentData['atAGlance']> }) {
  const panels = [
    {
      title: 'Product Catalog',
      color: 'text-indigo-600 bg-indigo-50',
      rows: [
        { label: 'Active Products', value: data.productCatalog.activeProducts },
        { label: 'Inactive Products', value: data.productCatalog.inactiveProducts },
        { label: 'Bundle-capable', value: data.productCatalog.bundleCapable },
        { label: 'Product Options', value: data.productCatalog.productOptions },
        { label: 'Price Books', value: data.productCatalog.priceBooks },
      ],
    },
    {
      title: 'Pricing & Rules',
      color: 'text-emerald-600 bg-emerald-50',
      rows: [
        { label: 'Price Rules (Active)', value: data.pricingRules.priceRulesActive },
        { label: 'Product Rules', value: data.pricingRules.productRules },
        { label: 'Discount Schedules', value: data.pricingRules.discountSchedules },
        { label: 'Custom Scripts (QCP)', value: data.pricingRules.customScripts },
        {
          label: 'Configured QCP',
          value: data.pricingRules.configuredQcp ?? '—',
        },
      ],
    },
    {
      title: 'Quoting (90 Days)',
      color: 'text-violet-600 bg-violet-50',
      rows: [
        { label: 'Quotes Created', value: data.quoting.quotesCreated },
        { label: 'Quote Lines', value: data.quoting.quoteLines },
        { label: 'Avg Lines/Quote', value: data.quoting.avgLinesPerQuote },
        { label: 'Active Users', value: data.quoting.activeUsers },
        { label: 'Orders Created', value: data.quoting.ordersCreated },
      ],
    },
    {
      title: 'Technical Debt',
      color: 'text-amber-600 bg-amber-50',
      rows: [
        { label: 'Dormant Products', value: data.techDebt.dormantProductsPercent },
        { label: 'Inactive Rules', value: data.techDebt.inactiveRules },
        { label: 'Stale/Test Rules', value: data.techDebt.staleRules },
        { label: 'Duplicate Schedules', value: data.techDebt.duplicateSchedules },
        { label: 'Orphaned Records', value: data.techDebt.orphanedRecords },
      ],
    },
  ];

  return (
    <section aria-label="CPQ at a glance">
      <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-3">
        CPQ at a Glance
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {panels.map((panel) => (
          <div
            key={panel.title}
            className="bg-white rounded-2xl border border-slate-200 overflow-hidden"
          >
            <div className={`px-4 py-2 text-xs font-semibold uppercase tracking-wide ${panel.color}`}>
              {panel.title}
            </div>
            <div className="p-4 space-y-2">
              {panel.rows.map((row) => (
                <div key={row.label} className="flex items-center justify-between text-xs">
                  <span className="text-slate-600">{row.label}</span>
                  <span className="font-semibold text-slate-900 tabular-nums">
                    {typeof row.value === 'string' && row.value.length > 18
                      ? row.value.slice(0, 16) + '…'
                      : row.value}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Section 4.1: Installed Packages
// ---------------------------------------------------------------------------

function InstalledPackagesCard({
  packages,
}: {
  packages: NonNullable<AssessmentData['installedPackages']>;
}) {
  return (
    <Card icon={<Package size={16} />} title={`Installed Packages (${packages.length})`}>
      <div className="max-h-64 overflow-y-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-slate-100 text-slate-500">
              <th className="text-start py-1 font-medium">Package</th>
              <th className="text-start py-1 font-medium">Namespace</th>
              <th className="text-start py-1 font-medium">Version</th>
              <th className="text-end py-1 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {packages.slice(0, 15).map((p, i) => (
              <tr key={i} className="border-b border-slate-50">
                <td className="py-1 text-slate-700">{p.name}</td>
                <td className="py-1 text-slate-500 font-mono text-[10px]">{p.namespace || '—'}</td>
                <td className="py-1 text-slate-500 tabular-nums">{p.version || '—'}</td>
                <td className="py-1 text-end">
                  <span
                    className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
                      p.status === 'Active'
                        ? 'bg-emerald-50 text-emerald-700'
                        : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    {p.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {packages.length > 15 && (
          <p className="text-[10px] text-slate-400 mt-1">+{packages.length - 15} more</p>
        )}
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Section 7.1: Quoting Activity
// ---------------------------------------------------------------------------

function QuotingActivityCard({
  activity,
}: {
  activity: NonNullable<AssessmentData['quotingActivity']>;
}) {
  const stats = [
    { label: 'Quotes Created', value: activity.quotesCreated, color: 'text-violet-600' },
    { label: 'Quote Lines', value: activity.quoteLines, color: 'text-emerald-600' },
    { label: 'Orders Created', value: activity.ordersCreated, color: 'text-indigo-600' },
    { label: 'Avg Lines/Quote', value: activity.avgLinesPerQuote, color: 'text-amber-600' },
  ];
  return (
    <Card icon={<LineChart size={16} />} title="90-Day Quoting Activity">
      <div className="grid grid-cols-2 gap-3">
        {stats.map((s) => (
          <div key={s.label} className="bg-slate-50 rounded-lg p-3 text-center">
            <p className={`text-2xl font-bold ${s.color} tabular-nums`}>{s.value}</p>
            <p className="text-[10px] text-slate-500 mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Section 6.2: Product Deep Dive
// ---------------------------------------------------------------------------

function ProductDeepDiveCard({
  data,
}: {
  data: NonNullable<AssessmentData['productDeepDive']>;
}) {
  return (
    <Card
      icon={<Boxes size={16} />}
      title="Product Deep Dive"
      subtitle={`Active products: ${data.summary.activeProducts} · Bundle-capable: ${data.summary.bundleCapable} · Price books: ${data.summary.priceBooks} · Dormant: ${data.summary.dormantPercent}`}
      fullWidth
    >
      {/* 6.2.1 Field Utilization — checkbox table */}
      <div>
        <h4 className="text-xs font-semibold text-slate-700 mb-2">Product Field Utilization</h4>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500">
                <th className="text-start py-1.5 font-medium">Observation</th>
                <th className="py-1.5 font-medium text-[10px] w-16">Not Used</th>
                <th className="py-1.5 font-medium text-[10px] w-16">Sometimes</th>
                <th className="py-1.5 font-medium text-[10px] w-16">Most Times</th>
                <th className="py-1.5 font-medium text-[10px] w-16">Always</th>
                <th className="text-end py-1.5 font-medium w-24">Count / %</th>
                <th className="text-start py-1.5 font-medium ps-4">Notes</th>
              </tr>
            </thead>
            <tbody>
              {data.fieldUtilization.map((row, i) => (
                <tr key={i} className="border-b border-slate-50">
                  <td
                    className={`py-1.5 ${row.isNested ? 'ps-6 text-slate-500' : 'font-medium text-slate-700'}`}
                  >
                    {row.label}
                  </td>
                  <CheckboxCells category={row.category} />
                  <td className="py-1.5 text-end tabular-nums text-slate-900">
                    {row.count} / {row.percentage}
                  </td>
                  <td className="py-1.5 ps-4 text-[10px] text-slate-500">{row.notes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-[10px] text-slate-400 italic mt-2">
          Thresholds: Not Used = 0% · Sometimes = 1–50% · Most Times = 51–95% · Always = &gt;95% ·
          Denominator: {data.denominator} active products
        </p>
      </div>

      {/* 6.2.2 Pricing Method Distribution — mini bar chart */}
      <div className="mt-5">
        <h4 className="text-xs font-semibold text-slate-700 mb-2">Pricing Method Distribution</h4>
        <div className="space-y-1.5">
          {data.pricingMethodDistribution.map((pm) => {
            const pct = parseInt(pm.percentOfActive) || 0;
            return (
              <div key={pm.method} className="flex items-center gap-2 text-xs">
                <span className="text-slate-700 w-32 truncate">{pm.method}</span>
                <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${
                      pm.complexity === 'High'
                        ? 'bg-red-400'
                        : pm.complexity === 'Medium'
                          ? 'bg-amber-400'
                          : 'bg-emerald-400'
                    }`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span className="text-slate-500 tabular-nums w-20 text-end">
                  {pm.count} / {pm.percentOfActive}
                </span>
                <span
                  className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
                    pm.complexity === 'High'
                      ? 'bg-red-50 text-red-700'
                      : pm.complexity === 'Medium'
                        ? 'bg-amber-50 text-amber-700'
                        : 'bg-emerald-50 text-emerald-700'
                  }`}
                >
                  {pm.complexity}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* 6.2.3 Subscription Profile — mini bar chart */}
      <div className="mt-5">
        <h4 className="text-xs font-semibold text-slate-700 mb-2">Subscription Profile</h4>
        <div className="space-y-1.5">
          {data.subscriptionProfile.map((sp) => {
            const pct = parseInt(sp.percentOfActive) || 0;
            return (
              <div key={sp.type} className="flex items-center gap-2 text-xs">
                <span className="text-slate-700 w-32 truncate">{sp.type}</span>
                <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${
                      sp.type === 'Evergreen' ? 'bg-red-400' : 'bg-violet-400'
                    }`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span className="text-slate-500 tabular-nums w-20 text-end">
                  {sp.count} / {sp.percentOfActive}
                </span>
                {sp.notes && (
                  <span className="text-[10px] text-amber-700 font-medium">{sp.notes}</span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Section 6.6: Bundles & Options Deep Dive
// ---------------------------------------------------------------------------

function BundlesDeepDiveCard({
  data,
}: {
  data: NonNullable<AssessmentData['bundlesDeepDive']>;
}) {
  const s = data.summary;
  const summaryBoxes = [
    { label: 'Bundle-capable', value: s.bundleCapable, color: 'text-indigo-600' },
    { label: 'Configured Bundles', value: s.configuredBundles, color: 'text-indigo-600' },
    { label: 'Nested Bundles', value: s.nestedBundles, color: 'text-indigo-600' },
    { label: 'Avg Options/Bundle', value: s.avgOptionsPerBundle, color: 'text-indigo-600' },
    { label: 'Total Options', value: s.totalOptions, color: 'text-violet-600' },
    {
      label: 'Options w/ Constraints',
      value: s.optionsWithConstraintsPercent,
      color: 'text-violet-600',
    },
    { label: 'Config Attributes', value: s.configAttributesPercent, color: 'text-violet-600' },
    { label: 'Config Rules', value: s.configRulesPercent, color: 'text-violet-600' },
  ];
  const bundleDelta = s.bundleCapable - s.configuredBundles;

  return (
    <Card icon={<Layers size={16} />} title="Bundles & Options Deep Dive" fullWidth>
      {/* Summary grid — Bundle Configuration + Option Complexity */}
      <div className="grid grid-cols-4 gap-2 mb-4">
        {summaryBoxes.map((b) => (
          <div key={b.label} className="bg-slate-50 rounded-lg p-2.5 text-center">
            <p className={`text-lg font-bold ${b.color} tabular-nums`}>{b.value}</p>
            <p className="text-[10px] text-slate-500 mt-0.5">{b.label}</p>
          </div>
        ))}
      </div>

      {bundleDelta > 0 && (
        <p className="text-[10px] text-slate-500 italic mb-3">
          Bundle-capable = products with <code>SBQQ__ConfigurationType__c</code> set. Configured
          Bundles = those with at least one active option. The difference ({bundleDelta}) reflects
          bundle-capable products with no options currently attached.
        </p>
      )}

      {/* 6.6.1 Related Object Utilization — checkbox table */}
      <h4 className="text-xs font-semibold text-slate-700 mb-2">Related Object Utilization</h4>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-slate-200 text-slate-500">
              <th className="text-start py-1.5 font-medium">Observation</th>
              <th className="py-1.5 font-medium text-[10px] w-16">Not Used</th>
              <th className="py-1.5 font-medium text-[10px] w-16">Sometimes</th>
              <th className="py-1.5 font-medium text-[10px] w-16">Most Times</th>
              <th className="py-1.5 font-medium text-[10px] w-16">Always</th>
              <th className="text-end py-1.5 font-medium w-24">Count / %</th>
              <th className="text-start py-1.5 font-medium ps-4">Notes</th>
            </tr>
          </thead>
          <tbody>
            {data.relatedObjectUtilization.map((row, i) => (
              <tr key={i} className="border-b border-slate-50">
                <td className="py-1.5 font-medium text-slate-700">{row.label}</td>
                <CheckboxCells category={row.category} />
                <td className="py-1.5 text-end tabular-nums text-slate-900">
                  {row.count}
                  {row.percentage ? ` / ${row.percentage}` : ''}
                </td>
                <td className="py-1.5 ps-4 text-[10px] text-slate-500">{row.notes}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[10px] text-slate-400 italic mt-2">
        Denominator: {data.denominator} active products
      </p>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Section 10: Related Functionality
// ---------------------------------------------------------------------------

function RelatedFunctionalityCard({
  data,
}: {
  data: NonNullable<AssessmentData['relatedFunctionality']>;
}) {
  const usedCount = data.items.filter((i) => i.used).length;
  return (
    <Card
      icon={<Link2 size={16} />}
      title="Related Functionality"
      subtitle={`${usedCount} of ${data.items.length} integration points detected`}
    >
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-slate-200 text-slate-500">
              <th className="text-start py-1.5 font-medium">Functionality</th>
              <th className="py-1.5 font-medium text-[10px] w-16">Not Used</th>
              <th className="py-1.5 font-medium text-[10px] w-16">Used</th>
              <th className="text-start py-1.5 font-medium ps-4">Notes</th>
            </tr>
          </thead>
          <tbody>
            {data.items.map((row, i) => (
              <tr key={i} className="border-b border-slate-50">
                <td
                  className={`py-1.5 ${row.isNested ? 'ps-6 text-slate-500' : 'font-medium text-slate-700'}`}
                >
                  {row.label}
                </td>
                <BinaryCheckboxCells used={row.used} />
                <td className="py-1.5 ps-4 text-[10px] text-slate-500">{row.notes}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {data.observations.length > 0 && (
        <div className="mt-3 pt-3 border-t border-slate-100">
          <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
            Observations
          </p>
          <ul className="space-y-1">
            {data.observations.map((obs, i) => (
              <li key={i} className="text-[11px] text-slate-600 flex items-start gap-1.5">
                <AlertTriangle size={11} className="text-amber-500 shrink-0 mt-0.5" />
                <span>{obs}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Main export — renders all PDF-parity sections
// ---------------------------------------------------------------------------

interface PdfParitySectionsProps {
  assessment: AssessmentData;
}

/** Renders the At A Glance dashboard at the top of Overview. */
export function AtAGlanceSection({ assessment }: PdfParitySectionsProps) {
  if (!assessment.atAGlance) return null;
  return <AtAGlanceDashboard data={assessment.atAGlance} />;
}

/**
 * Renders the middle block of PDF-parity cards (Deep Dives + integrations).
 * Designed to sit between CPQ Intelligence and the Status/Progress zone.
 */
export default function PdfParitySections({ assessment }: PdfParitySectionsProps) {
  const hasAny =
    assessment.productDeepDive ||
    assessment.bundlesDeepDive ||
    assessment.relatedFunctionality ||
    assessment.quotingActivity ||
    (assessment.installedPackages?.length ?? 0) > 0;
  if (!hasAny) return null;

  return (
    <>
      {/* Section divider */}
      <div className="flex items-center gap-4 py-2">
        <div className="flex-1 border-t border-slate-200" />
        <span className="text-xs font-semibold text-slate-400 uppercase tracking-widest">
          Deep Dives & Integrations
        </span>
        <div className="flex-1 border-t border-slate-200" />
      </div>

      {/* Row: Packages + Quoting Activity (side by side) */}
      {((assessment.installedPackages?.length ?? 0) > 0 || assessment.quotingActivity) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {(assessment.installedPackages?.length ?? 0) > 0 && (
            <InstalledPackagesCard packages={assessment.installedPackages!} />
          )}
          {assessment.quotingActivity && (
            <QuotingActivityCard activity={assessment.quotingActivity} />
          )}
        </div>
      )}

      {/* Product Deep Dive — full width */}
      {assessment.productDeepDive && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <ProductDeepDiveCard data={assessment.productDeepDive} />
        </div>
      )}

      {/* Bundles Deep Dive — full width */}
      {assessment.bundlesDeepDive && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <BundlesDeepDiveCard data={assessment.bundlesDeepDive} />
        </div>
      )}

      {/* Related Functionality */}
      {assessment.relatedFunctionality && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <RelatedFunctionalityCard data={assessment.relatedFunctionality} />
          {/* Gauge placeholder keeps grid balanced on desktop */}
          <div className="hidden lg:block">
            <Card
              icon={<Gauge size={16} />}
              title="Integration Signal"
              subtitle="Higher = more external dependencies to assess"
            >
              {(() => {
                const used = assessment.relatedFunctionality.items.filter((i) => i.used).length;
                const total = assessment.relatedFunctionality.items.length;
                const pct = total > 0 ? Math.round((used / total) * 100) : 0;
                return (
                  <div className="flex flex-col items-center justify-center py-4">
                    <div className="relative w-32 h-32">
                      <svg viewBox="0 0 100 100" className="transform -rotate-90">
                        <circle
                          cx="50"
                          cy="50"
                          r="40"
                          fill="none"
                          stroke="#f1f5f9"
                          strokeWidth="10"
                        />
                        <circle
                          cx="50"
                          cy="50"
                          r="40"
                          fill="none"
                          stroke={pct >= 66 ? '#ef4444' : pct >= 33 ? '#f59e0b' : '#10b981'}
                          strokeWidth="10"
                          strokeDasharray={`${pct * 2.51} 251`}
                          strokeLinecap="round"
                        />
                      </svg>
                      <div className="absolute inset-0 flex flex-col items-center justify-center">
                        <span className="text-2xl font-bold text-slate-900 tabular-nums">{pct}%</span>
                        <span className="text-[10px] text-slate-500">
                          {used} of {total}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })()}
            </Card>
          </div>
        </div>
      )}
    </>
  );
}
