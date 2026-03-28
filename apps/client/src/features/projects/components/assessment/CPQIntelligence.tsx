/**
 * CPQ Intelligence Section — renders the 10 new data sections from gap analysis.
 *
 * Displayed in the Overview tab between Zone 2 (Deep Dive) and Zone 3 (Status).
 * Each section is a collapsible card with a table or summary view.
 */
import {
  Settings,
  Plug,
  Users,
  Percent,
  ShoppingCart,
  BarChart3,
  AlertTriangle,
  Database,
  FileText,
  Shield,
} from 'lucide-react';
import type { AssessmentData } from '../../mocks/assessment-mock-data';

interface CPQIntelligenceProps {
  assessment: AssessmentData;
  t: (key: string, opts?: Record<string, unknown>) => string;
}

export default function CPQIntelligence({ assessment }: CPQIntelligenceProps) {
  const hasAnyData =
    (assessment.settingsPanel?.length ?? 0) > 0 ||
    (assessment.pluginInventory?.length ?? 0) > 0 ||
    (assessment.complexityHotspots?.length ?? 0) > 0 ||
    (assessment.topProducts?.length ?? 0) > 0 ||
    (assessment.conversionSegments?.length ?? 0) > 0 ||
    (assessment.dataQualityFlags?.length ?? 0) > 0;

  if (!hasAnyData) return null;

  return (
    <>
      {/* Section Divider */}
      <div className="flex items-center gap-4 py-2">
        <div className="flex-1 border-t border-slate-200" />
        <span className="text-xs font-semibold text-slate-400 uppercase tracking-widest">
          CPQ Intelligence
        </span>
        <div className="flex-1 border-t border-slate-200" />
      </div>

      {/* Row 1: Settings + Plugins */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Settings Panel */}
        {assessment.settingsPanel && assessment.settingsPanel.length > 0 && (
          <Card
            icon={<Settings size={16} />}
            title="CPQ Settings"
            count={assessment.settingsPanel.length}
          >
            <div className="max-h-64 overflow-y-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-100">
                    <th className="text-start py-1 font-medium text-slate-500">Setting</th>
                    <th className="text-start py-1 font-medium text-slate-500">Value</th>
                  </tr>
                </thead>
                <tbody>
                  {assessment.settingsPanel.slice(0, 20).map((s, i) => (
                    <tr key={i} className="border-b border-slate-50">
                      <td className="py-1 text-slate-700">{s.setting}</td>
                      <td className="py-1 font-medium text-slate-900">{s.value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {assessment.settingsPanel.length > 20 && (
                <p className="text-xs text-slate-400 mt-1">
                  +{assessment.settingsPanel.length - 20} more
                </p>
              )}
            </div>
          </Card>
        )}

        {/* Plugin Inventory */}
        {assessment.pluginInventory && assessment.pluginInventory.length > 0 && (
          <Card icon={<Plug size={16} />} title="Plugins" count={assessment.pluginInventory.length}>
            <div className="space-y-2">
              {assessment.pluginInventory.map((p, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between py-1.5 border-b border-slate-50 last:border-0"
                >
                  <span className="text-xs text-slate-700">{p.plugin}</span>
                  <span
                    className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                      p.status === 'Active'
                        ? 'bg-emerald-50 text-emerald-700'
                        : 'bg-slate-100 text-slate-500'
                    }`}
                  >
                    {p.status}
                  </span>
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>

      {/* Row 2: Hotspots + Data Quality */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Complexity Hotspots */}
        {assessment.complexityHotspots && assessment.complexityHotspots.length > 0 && (
          <Card
            icon={<AlertTriangle size={16} />}
            title="Complexity Hotspots"
            count={assessment.complexityHotspots.length}
          >
            <div className="space-y-3">
              {assessment.complexityHotspots.map((h, i) => (
                <div key={i} className="border-s-2 border-s-amber-400 ps-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-slate-900">{h.name}</span>
                    <span
                      className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
                        h.severity === 'critical' || h.severity === 'Critical'
                          ? 'bg-red-50 text-red-700'
                          : 'bg-amber-50 text-amber-700'
                      }`}
                    >
                      {h.severity}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-0.5">{h.analysis}</p>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* Data Quality Flags */}
        {assessment.dataQualityFlags && assessment.dataQualityFlags.length > 0 && (
          <Card
            icon={<Shield size={16} />}
            title="Data Quality"
            count={assessment.dataQualityFlags.length}
          >
            <div className="space-y-2">
              {assessment.dataQualityFlags.map((f, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between py-1.5 border-b border-slate-50 last:border-0"
                >
                  <span className="text-xs text-slate-700">{f.check}</span>
                  <span
                    className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                      f.status === 'clean'
                        ? 'bg-emerald-50 text-emerald-700'
                        : f.status === 'flagged'
                          ? 'bg-amber-50 text-amber-700'
                          : 'bg-slate-100 text-slate-500'
                    }`}
                  >
                    {f.status === 'flagged' ? `${f.count} found` : f.status}
                  </span>
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>

      {/* Row 3: Top Products + Conversion Segments */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Top Quoted Products */}
        {assessment.topProducts && assessment.topProducts.length > 0 && (
          <Card
            icon={<ShoppingCart size={16} />}
            title="Top Quoted Products"
            count={assessment.topProducts.length}
          >
            <div className="max-h-64 overflow-y-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-100">
                    <th className="text-start py-1 font-medium text-slate-500">#</th>
                    <th className="text-start py-1 font-medium text-slate-500">Product</th>
                    <th className="text-end py-1 font-medium text-slate-500">Quoted</th>
                  </tr>
                </thead>
                <tbody>
                  {assessment.topProducts.map((p, i) => (
                    <tr key={i} className="border-b border-slate-50">
                      <td className="py-1 text-slate-400">{i + 1}</td>
                      <td className="py-1 text-slate-700">{p.name}</td>
                      <td className="py-1 text-end font-medium text-slate-900">{p.quotedCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}

        {/* Conversion by Deal Size */}
        {assessment.conversionSegments && assessment.conversionSegments.length > 0 && (
          <Card
            icon={<BarChart3 size={16} />}
            title="Conversion by Deal Size"
            count={assessment.conversionSegments.length}
          >
            <div className="space-y-3">
              {assessment.conversionSegments.map((s, i) => {
                const pctQuotes =
                  s.evidenceRefs?.find((r) => r.label === '% of quotes')?.value ?? '0';
                const conversion =
                  s.evidenceRefs?.find((r) => r.label === 'conversion %')?.value ?? '0';
                return (
                  <div key={i}>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-slate-700 font-medium">{s.segment}</span>
                      <span className="text-slate-500">
                        {pctQuotes}% of quotes · {conversion}% conv.
                      </span>
                    </div>
                    <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-violet-500 rounded-full"
                        style={{ width: `${Number(pctQuotes)}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        )}
      </div>

      {/* Row 4: User Behavior + Discount Distribution */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* User Behavior */}
        {assessment.userBehavior && assessment.userBehavior.length > 0 && (
          <Card
            icon={<Users size={16} />}
            title="User Behavior by Role"
            count={assessment.userBehavior.length}
          >
            <div className="space-y-2">
              {assessment.userBehavior.map((u, i) => (
                <div key={i} className="bg-slate-50 rounded-lg p-2.5">
                  <div className="text-xs font-semibold text-slate-900">{u.profile}</div>
                  <div className="text-[11px] text-slate-500 mt-0.5">{u.notes}</div>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* Discount Distribution */}
        {assessment.discountDistribution && assessment.discountDistribution.buckets?.length > 0 && (
          <Card
            icon={<Percent size={16} />}
            title="Discount Distribution"
            count={assessment.discountDistribution.totalDiscounted}
          >
            <div className="space-y-2">
              {assessment.discountDistribution.buckets.map((b, i) => (
                <div key={i} className="flex items-center gap-3">
                  <span className="text-xs text-slate-600 w-16">{b.range}</span>
                  <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-amber-500 rounded-full"
                      style={{
                        width: `${Math.min((b.count / (assessment.discountDistribution?.totalDiscounted || 1)) * 100, 100)}%`,
                      }}
                    />
                  </div>
                  <span className="text-xs font-medium text-slate-700 w-8 text-end">{b.count}</span>
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>

      {/* Row 5: CPQ Reports + Object Inventory */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* CPQ Reports */}
        {assessment.cpqReports && assessment.cpqReports.length > 0 && (
          <Card
            icon={<FileText size={16} />}
            title="CPQ Reports & Dashboards"
            count={assessment.cpqReports.length}
          >
            <div className="max-h-48 overflow-y-auto space-y-1">
              {assessment.cpqReports.slice(0, 15).map((r, i) => (
                <div
                  key={i}
                  className="text-xs py-1 border-b border-slate-50 last:border-0 text-slate-700"
                >
                  {r.name}
                </div>
              ))}
              {assessment.cpqReports.length > 15 && (
                <p className="text-xs text-slate-400">+{assessment.cpqReports.length - 15} more</p>
              )}
            </div>
          </Card>
        )}

        {/* Object Inventory */}
        {assessment.objectInventory && assessment.objectInventory.length > 0 && (
          <Card
            icon={<Database size={16} />}
            title="Object Inventory"
            count={assessment.objectInventory.length}
          >
            <div className="max-h-48 overflow-y-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-100">
                    <th className="text-start py-1 font-medium text-slate-500">Object</th>
                    <th className="text-end py-1 font-medium text-slate-500">Count</th>
                  </tr>
                </thead>
                <tbody>
                  {assessment.objectInventory.map((o, i) => (
                    <tr key={i} className="border-b border-slate-50">
                      <td className="py-1 text-slate-700 font-mono text-[10px]">{o.objectName}</td>
                      <td className="py-1 text-end font-medium text-slate-900">{o.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Reusable Card component
// ---------------------------------------------------------------------------

function Card({
  icon,
  title,
  count,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="text-slate-400">{icon}</div>
          <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
        </div>
        <span className="text-xs font-medium text-slate-400 bg-slate-50 px-2 py-0.5 rounded-full">
          {count}
        </span>
      </div>
      {children}
    </div>
  );
}
