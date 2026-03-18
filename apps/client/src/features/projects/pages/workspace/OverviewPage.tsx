/**
 * Project Overview/Dashboard Page
 *
 * Matches the original DashboardView layout from GEOMETRIX-1.
 * Data is loaded from the backend via useBillingData + useBOQItems.
 * Charts use pure CSS (no Recharts) for reliable rendering.
 */
import { useMemo, useState } from 'react';
import { useParams } from 'react-router';
import {
  AlertTriangle,
  CheckCircle2,
  FileText,
  Wallet,
  ArrowUpRight,
  Loader2,
  Activity,
  PieChart as PieIcon,
} from 'lucide-react';
import { useBillingData } from '@/features/execution/hooks/use-billing-data';
import { useBOQItems } from '@/features/boq/hooks/use-boq';
import { useProject } from '../../hooks/use-project-api';

const COLORS = ['#3b82f6', '#22c55e', '#eab308', '#a855f7', '#ec4899', '#64748b', '#f97316'];

export default function OverviewPage() {
  const { id } = useParams<{ id: string }>();
  const [pieMode, setPieMode] = useState<'approved' | 'submitted' | 'budget'>('submitted');

  const { data: project } = useProject(id);
  const { bills, approvedBills, isLoading: billingLoading } = useBillingData(id);
  const { data: boqData, isLoading: boqLoading } = useBOQItems(id);

  const boqItems = useMemo(
    () =>
      (boqData?.items ?? [])
        .filter((item) => item.unit)
        .map((item) => ({
          code: item.code,
          description: item.description,
          unit: item.unit || '',
          contractQuantity: item.contractQuantity ?? 0,
          unitPrice: (item.unitPriceCents ?? 0) / 100,
        })),
    [boqData]
  );

  // Total BOQ budget as fallback for contract scope
  const totalBoqBudget = useMemo(
    () =>
      boqItems.reduce((sum, item) => sum + (item.contractQuantity || 0) * (item.unitPrice || 0), 0),
    [boqItems]
  );

  const projectData = useMemo(
    () => ({
      name: project?.name ?? '',
      contractNumber: project?.contractNumber ?? '',
      contractorName: project?.contractorName ?? '',
      originalScope: (project?.contractValueCents ?? 0) / 100 || totalBoqBudget,
    }),
    [project, totalBoqBudget]
  );

  // --- Formatters ---
  const formatCurrency = (val: number) =>
    new Intl.NumberFormat('he-IL', {
      style: 'currency',
      currency: 'ILS',
      maximumFractionDigits: 0,
    }).format(val);
  const formatCurrencyPrecise = (val: number) =>
    new Intl.NumberFormat('he-IL', {
      style: 'currency',
      currency: 'ILS',
      minimumFractionDigits: 2,
    }).format(val);

  // --- KPIs ---
  const approvedCumulative = useMemo(
    () => approvedBills.reduce((sum, b) => sum + b.approvedAmount, 0),
    [approvedBills]
  );

  const submittedCumulative = useMemo(() => {
    if (bills.length === 0) return 0;
    const latestBill = [...bills].sort((a, b) => b.number - a.number)[0];
    return latestBill ? latestBill.cumulativeAmount : 0;
  }, [bills]);

  const currentBillDelta = submittedCumulative - approvedCumulative;

  const budgetUtilizationPercent =
    projectData.originalScope > 0 ? (approvedCumulative / projectData.originalScope) * 100 : 0;

  const exceptionsData = useMemo(() => {
    if (bills.length === 0) return { count: 0, value: 0 };
    const draftBill = bills.find((b) => b.status === 'draft');
    const submittedBill = [...bills].sort((a, b) => b.number - a.number)[0];
    const targetBill = draftBill || submittedBill;
    if (!targetBill) return { count: 0, value: 0 };
    let count = 0;
    let value = 0;
    targetBill.items.forEach((item) => {
      const parts = item.code.split('.');
      if (parts[0] === '99' || parts[1] === '99') {
        count++;
        value += item.totalAmount;
      }
    });
    return { count, value };
  }, [bills]);

  const performanceMetrics = {
    approvedVsSubmitted:
      submittedCumulative > 0 ? (approvedCumulative / submittedCumulative) * 100 : 0,
    approvedVsContract:
      projectData.originalScope > 0 ? (approvedCumulative / projectData.originalScope) * 100 : 0,
    submittedVsContract:
      projectData.originalScope > 0 ? (submittedCumulative / projectData.originalScope) * 100 : 0,
  };

  // --- Chart Data ---
  const topicBreakdownData = useMemo(() => {
    const approvedByChapter: Record<string, number> = {};
    approvedBills.forEach((bill) => {
      if (bill.chapterBreakdown) {
        Object.entries(bill.chapterBreakdown).forEach(([chapter, amount]) => {
          approvedByChapter[chapter] = (approvedByChapter[chapter] || 0) + (amount as number);
        });
      }
    });

    const submittedByChapter: Record<string, number> = {};
    const latestBill = [...bills].sort((a, b) => b.number - a.number)[0];
    if (latestBill) {
      latestBill.items.forEach((item) => {
        const parts = item.code.split('.');
        const chapterKey = parts.length >= 2 ? `${parts[0]}.${parts[1]}` : parts[0];
        submittedByChapter[chapterKey] = (submittedByChapter[chapterKey] || 0) + item.totalAmount;
      });
    }

    const budgetByChapter: Record<string, number> = {};
    boqItems.forEach((item) => {
      const parts = item.code.split('.');
      const chapterKey = parts.length >= 2 ? `${parts[0]}.${parts[1]}` : parts[0];
      const itemTotal = (item.contractQuantity || 0) * (item.unitPrice || 0);
      budgetByChapter[chapterKey] = (budgetByChapter[chapterKey] || 0) + itemTotal;
    });

    const activeChapters = Array.from(
      new Set([...Object.keys(approvedByChapter), ...Object.keys(submittedByChapter)])
    ).filter((ch) => ch !== '0' && ch !== '00' && ch !== '0.0');

    return activeChapters
      .map((chapter) => ({
        name: `פרק ${chapter}`,
        budget: budgetByChapter[chapter] || 0,
        approved: approvedByChapter[chapter] || 0,
        submitted: submittedByChapter[chapter] || 0,
      }))
      .filter((d) => d.submitted > 0 || d.approved > 0)
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  }, [approvedBills, bills, boqItems]);

  const budgetDistribution = useMemo(() => {
    return [...topicBreakdownData]
      .filter((item) => item.budget > 0)
      .sort((a, b) => (b.approved || b.submitted) - (a.approved || a.submitted))
      .slice(0, 5)
      .map((item) => ({
        category: item.name,
        budget: item.budget,
        used: item.approved || item.submitted,
      }));
  }, [topicBreakdownData]);

  const pieTotal = useMemo(
    () => topicBreakdownData.reduce((sum, item) => sum + item[pieMode], 0),
    [topicBreakdownData, pieMode]
  );

  // CSS bar chart: max value for scaling
  const barMax = useMemo(
    () => Math.max(...topicBreakdownData.map((d) => Math.max(d.submitted, d.approved)), 1),
    [topicBreakdownData]
  );

  // CSS donut: build conic-gradient segments
  const conicGradient = useMemo(() => {
    if (pieTotal === 0) return 'conic-gradient(#e2e8f0 0deg 360deg)';
    let cumDeg = 0;
    const stops: string[] = [];
    topicBreakdownData.forEach((entry, idx) => {
      const val = entry[pieMode];
      if (val <= 0) return;
      const deg = (val / pieTotal) * 360;
      const color = COLORS[idx % COLORS.length];
      stops.push(`${color} ${cumDeg}deg ${cumDeg + deg}deg`);
      cumDeg += deg;
    });
    if (stops.length === 0) return 'conic-gradient(#e2e8f0 0deg 360deg)';
    return `conic-gradient(${stops.join(', ')})`;
  }, [topicBreakdownData, pieMode, pieTotal]);

  // Derive effective bill status
  const approvedBillNumbers = useMemo(
    () => new Set(approvedBills.map((ab) => ab.billNumber)),
    [approvedBills]
  );
  const getEffectiveStatus = (bill: { number: number; status: string }) =>
    approvedBillNumbers.has(bill.number) ? 'approved' : bill.status;

  if (billingLoading || boqLoading) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-400">
        <Loader2 className="animate-spin h-8 w-8" />
      </div>
    );
  }

  return (
    <div className="animate-in fade-in duration-500 space-y-6 pb-10" dir="rtl">
      {/* Header */}
      <div className="flex justify-between items-end mb-2">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">מרכז בקרה - {projectData.name}</h2>
          <div className="flex gap-2 text-sm text-slate-500">
            <span>מס' חוזה: {projectData.contractNumber}</span>
            <span>•</span>
            <span>קבלן: {projectData.contractorName}</span>
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Approved Execution */}
        <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200 relative overflow-hidden group hover:shadow-md transition">
          <div className="absolute top-0 right-0 w-1 h-full bg-green-500" />
          <div className="flex justify-between items-start mb-2">
            <div className="text-slate-500 font-medium text-sm">ביצוע מצטבר מאושר</div>
            <div className="p-1.5 bg-green-50 rounded-lg text-green-600">
              <CheckCircle2 size={18} />
            </div>
          </div>
          <div className="text-2xl font-bold text-slate-800">
            {formatCurrency(approvedCumulative)}
          </div>
          <div className="mt-2 w-full bg-slate-100 rounded-full h-1.5">
            <div
              className="bg-green-500 h-1.5 rounded-full transition-all"
              style={{ width: `${Math.min(budgetUtilizationPercent, 100)}%` }}
            />
          </div>
          <div className="text-xs text-slate-400 mt-1">
            {budgetUtilizationPercent.toFixed(1)}% מהיקף החוזה המקורי (
            {formatCurrencyPrecise(projectData.originalScope)})
          </div>
        </div>

        {/* Submitted Execution */}
        <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200 relative overflow-hidden group hover:shadow-md transition">
          <div className="absolute top-0 right-0 w-1 h-full bg-blue-500" />
          <div className="flex justify-between items-start mb-2">
            <div className="text-slate-500 font-medium text-sm">ביצוע מצטבר מוגש</div>
            <div className="p-1.5 bg-blue-50 rounded-lg text-blue-600">
              <FileText size={18} />
            </div>
          </div>
          <div className="text-2xl font-bold text-slate-800">
            {formatCurrency(submittedCumulative)}
          </div>
          <div className="mt-2 text-xs text-blue-600 bg-blue-50 px-2 py-1 rounded inline-block">
            הפרש: {formatCurrency(currentBillDelta)}
          </div>
        </div>

        {/* Exceptions */}
        <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200 relative overflow-hidden group hover:shadow-md transition">
          <div className="absolute top-0 right-0 w-1 h-full bg-orange-500" />
          <div className="flex justify-between items-start mb-2">
            <div className="text-slate-500 font-medium text-sm">חריגים (סעיפים/שווי)</div>
            <div className="p-1.5 bg-orange-50 rounded-lg text-orange-600">
              <AlertTriangle size={18} />
            </div>
          </div>
          <div className="text-2xl font-bold text-slate-800">
            {exceptionsData.count}{' '}
            <span className="text-sm font-normal text-slate-500">סעיפים</span>
          </div>
          <div className="mt-2 pt-2 border-t border-slate-100">
            <div className="text-xs text-slate-500">שווי כספי מצטבר:</div>
            <div className="font-bold text-slate-700 text-sm font-mono">
              {formatCurrencyPrecise(exceptionsData.value)}
            </div>
          </div>
        </div>

        {/* Current Bill Amount */}
        <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200 relative overflow-hidden group hover:shadow-md transition">
          <div className="absolute top-0 right-0 w-1 h-full bg-purple-500" />
          <div className="flex justify-between items-start mb-2">
            <div className="text-slate-500 font-medium text-sm">סכום לחשבון נוכחי</div>
            <div className="p-1.5 bg-purple-50 rounded-lg text-purple-600">
              <Wallet size={18} />
            </div>
          </div>
          <div className="text-2xl font-bold text-slate-800">
            {formatCurrency(currentBillDelta)}
          </div>
          <div className="text-xs text-slate-500 mt-1 flex items-center gap-1">
            <ArrowUpRight size={12} className="text-purple-500" />
            דלתא (מוגש מינוס מאושר)
          </div>
          <div className="mt-2 w-full bg-slate-100 rounded-full h-1.5">
            <div className="bg-purple-500 h-1.5 rounded-full" style={{ width: '100%' }} />
          </div>
        </div>
      </div>

      {/* Performance Ratios */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex items-center justify-between">
          <div>
            <div className="text-sm text-slate-500 font-medium mb-1">מאושר / מוגש</div>
            <div className="text-2xl font-bold text-slate-800">
              {performanceMetrics.approvedVsSubmitted.toFixed(1)}%
            </div>
          </div>
          <div className="h-10 w-10 rounded-full bg-blue-50 flex items-center justify-center text-blue-600 font-bold text-xs">
            {performanceMetrics.approvedVsSubmitted.toFixed(0)}%
          </div>
        </div>
        <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex items-center justify-between">
          <div>
            <div className="text-sm text-slate-500 font-medium mb-1">מאושר / חוזה</div>
            <div className="text-2xl font-bold text-slate-800">
              {performanceMetrics.approvedVsContract.toFixed(1)}%
            </div>
          </div>
          <div className="h-10 w-10 rounded-full bg-green-50 flex items-center justify-center text-green-600 font-bold text-xs">
            {performanceMetrics.approvedVsContract.toFixed(0)}%
          </div>
        </div>
        <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex items-center justify-between">
          <div>
            <div className="text-sm text-slate-500 font-medium mb-1">מוגש / חוזה</div>
            <div className="text-2xl font-bold text-slate-800">
              {performanceMetrics.submittedVsContract.toFixed(1)}%
            </div>
          </div>
          <div className="h-10 w-10 rounded-full bg-purple-50 flex items-center justify-center text-purple-600 font-bold text-xs">
            {performanceMetrics.submittedVsContract.toFixed(0)}%
          </div>
        </div>
      </div>

      {/* Main Charts: 3-column layout */}
      <div className="content-offscreen grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column (2/3): Bar + Pie */}
        <div className="lg:col-span-2 space-y-6 min-w-0">
          {/* CSS Bar Chart — Chapter Breakdown */}
          <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
            <div className="flex justify-between items-center mb-6">
              <h3 className="font-bold text-lg text-slate-800">
                התפלגות חשבון לפי פרקים (מאושר מול מוגש)
              </h3>
              <div className="flex gap-4">
                <span className="flex items-center gap-1.5 text-xs font-medium text-slate-600">
                  <span className="w-3 h-3 rounded-full bg-blue-500" /> מוגש
                </span>
                <span className="flex items-center gap-1.5 text-xs font-medium text-slate-600">
                  <span className="w-3 h-3 rounded-full bg-green-500" /> מאושר
                </span>
              </div>
            </div>

            {topicBreakdownData.length > 0 ? (
              <div dir="ltr">
                {/* Y-axis labels + bars area */}
                <div className="flex" style={{ height: 260 }}>
                  {/* Y-axis */}
                  <div
                    className="flex flex-col justify-between text-[11px] text-slate-400 pr-2 py-1"
                    style={{ width: 60 }}
                  >
                    {[...Array(5)].map((_, i) => {
                      const val = barMax - (barMax / 4) * i;
                      return (
                        <span key={i} className="text-left">
                          {val >= 1000000
                            ? `₪${(val / 1000000).toFixed(1)}M`
                            : `₪${(val / 1000).toFixed(0)}k`}
                        </span>
                      );
                    })}
                    <span className="text-left">₪0</span>
                  </div>
                  {/* Bars grid */}
                  <div className="flex-1 relative border-l border-b border-slate-200">
                    {/* Horizontal grid lines */}
                    {[...Array(4)].map((_, i) => (
                      <div
                        key={i}
                        className="absolute w-full border-t border-slate-100"
                        style={{ top: `${((i + 1) / 5) * 100}%` }}
                      />
                    ))}
                    {/* Bar groups */}
                    <div
                      className="flex items-end h-full px-1"
                      style={{ gap: topicBreakdownData.length > 10 ? 2 : 8 }}
                    >
                      {topicBreakdownData.map((item, idx) => {
                        const submittedH = (item.submitted / barMax) * 100;
                        const approvedH = (item.approved / barMax) * 100;
                        return (
                          <div
                            key={idx}
                            className="flex-1 flex items-end justify-center gap-[2px] h-full min-w-0 group relative"
                          >
                            <div
                              className="bg-green-500 rounded-t-sm flex-shrink-0 transition-all"
                              style={{
                                height: `${approvedH}%`,
                                width: topicBreakdownData.length > 10 ? 6 : 14,
                              }}
                              title={`מאושר: ${formatCurrency(item.approved)}`}
                            />
                            <div
                              className="bg-blue-500 rounded-t-sm flex-shrink-0 transition-all"
                              style={{
                                height: `${submittedH}%`,
                                width: topicBreakdownData.length > 10 ? 6 : 14,
                              }}
                              title={`מוגש: ${formatCurrency(item.submitted)}`}
                            />
                            {/* Tooltip on hover */}
                            <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 bg-white border border-slate-200 shadow-lg rounded-lg p-2 text-right text-xs whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none z-10 transition-opacity">
                              <div className="font-bold text-slate-800 mb-1">{item.name}</div>
                              <div className="text-blue-600">
                                מוגש: {formatCurrency(item.submitted)}
                              </div>
                              <div className="text-green-600">
                                מאושר: {formatCurrency(item.approved)}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
                {/* X-axis labels */}
                <div className="flex pr-0" style={{ marginRight: 60 }}>
                  <div
                    className="flex-1 flex px-1"
                    style={{ gap: topicBreakdownData.length > 10 ? 2 : 8 }}
                  >
                    {topicBreakdownData.map((item, idx) => (
                      <div key={idx} className="flex-1 min-w-0 text-center">
                        <span
                          className="text-[10px] text-slate-500 inline-block origin-top-left"
                          style={{
                            transform:
                              topicBreakdownData.length > 6
                                ? 'rotate(-45deg) translateX(-50%)'
                                : 'none',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {item.name}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center h-48 text-sm text-slate-400">
                אין נתוני חשבונות להצגה
              </div>
            )}
          </div>

          {/* CSS Donut Chart with Toggles */}
          <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
              <h3 className="font-bold text-lg text-slate-800 flex items-center gap-2">
                <PieIcon size={20} className="text-purple-500" />
                התפלגות תשלומים לפי פרקים
              </h3>
              <div className="flex bg-slate-100 p-1 rounded-lg">
                <button
                  onClick={() => setPieMode('approved')}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition ${pieMode === 'approved' ? 'bg-white text-green-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                >
                  מאושר
                </button>
                <button
                  onClick={() => setPieMode('submitted')}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition ${pieMode === 'submitted' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                >
                  מוגש
                </button>
                <button
                  onClick={() => setPieMode('budget')}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition ${pieMode === 'budget' ? 'bg-white text-purple-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                >
                  חוזה מקורי
                </button>
              </div>
            </div>

            <div className="flex flex-col md:flex-row items-center justify-around gap-6">
              {/* CSS Donut */}
              <div className="relative w-56 h-56 flex-shrink-0">
                <div className="w-full h-full rounded-full" style={{ background: conicGradient }} />
                {/* Inner white circle for donut hole */}
                <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-36 h-36 rounded-full bg-white flex items-center justify-center">
                  <div className="text-center">
                    <div className="text-xs text-slate-400">סה"כ</div>
                    <div className="font-bold text-slate-700 text-sm">
                      {new Intl.NumberFormat('en-US', {
                        notation: 'compact',
                        maximumFractionDigits: 1,
                      }).format(pieTotal)}
                    </div>
                  </div>
                </div>
              </div>

              {/* Legend — compact grid like original */}
              <div className="flex-1 p-4">
                <div className="grid grid-cols-3 lg:grid-cols-4 gap-x-3 gap-y-2 text-xs">
                  {topicBreakdownData.map((entry, index) => {
                    const val = entry[pieMode];
                    if (val <= 0) return null;
                    return (
                      <div key={index} className="flex items-center gap-1.5 min-w-0">
                        <div
                          className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                          style={{ backgroundColor: COLORS[index % COLORS.length] }}
                        />
                        <div className="flex flex-col min-w-0 leading-tight">
                          <span
                            className="font-medium text-slate-700 truncate text-[10px]"
                            title={entry.name}
                          >
                            {entry.name}
                          </span>
                          <span className="text-slate-400 text-[9px]">{formatCurrency(val)}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column (1/3): Activity + Budget Bars */}
        <div className="space-y-6">
          {/* Recent Bills (Activity Feed) */}
          <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 max-h-[400px] overflow-y-auto">
            <h3 className="font-bold text-lg text-slate-800 mb-4">עדכונים אחרונים</h3>
            {bills.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-slate-400">
                <Activity size={32} className="mb-3 opacity-50" />
                <p className="text-sm">אין עדכונים להצגה</p>
              </div>
            ) : (
              <div className="space-y-3">
                {[...bills]
                  .sort((a, b) => b.number - a.number)
                  .slice(0, 6)
                  .map((bill) => {
                    const status = getEffectiveStatus(bill);
                    return (
                      <div
                        key={bill.id}
                        className="flex gap-3 items-start p-3 rounded-lg hover:bg-slate-50 transition border border-transparent hover:border-slate-100"
                      >
                        <div
                          className={`p-2 rounded-full shrink-0 ${
                            status === 'approved'
                              ? 'bg-green-50 text-green-600'
                              : status === 'submitted'
                                ? 'bg-amber-50 text-amber-600'
                                : 'bg-slate-100 text-slate-500'
                          }`}
                        >
                          <FileText size={16} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-slate-800">
                            חשבון #{bill.number}{' '}
                            <span
                              className={`text-xs px-1.5 py-0.5 rounded font-bold ${
                                status === 'approved'
                                  ? 'bg-green-100 text-green-700'
                                  : status === 'submitted'
                                    ? 'bg-amber-100 text-amber-700'
                                    : 'bg-slate-100 text-slate-500'
                              }`}
                            >
                              {status === 'approved'
                                ? 'מאושר'
                                : status === 'submitted'
                                  ? 'הוגש'
                                  : 'טיוטה'}
                            </span>
                          </p>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-xs text-slate-500">{bill.period}</span>
                            <span className="text-xs text-slate-300">•</span>
                            <span className="text-xs font-medium text-blue-600">
                              {formatCurrency(bill.currentAmount)}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}
          </div>

          {/* Budget Utilization Bars */}
          <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
            <h3 className="font-bold text-lg text-slate-800 mb-4">ניצול חוזה לפי פרקים</h3>
            <div className="space-y-4">
              {budgetDistribution.length > 0 ? (
                budgetDistribution.map((item, idx) => {
                  const percent = item.budget > 0 ? Math.round((item.used / item.budget) * 100) : 0;
                  return (
                    <div key={idx}>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-slate-700 font-medium">{item.category}</span>
                        <span className="text-slate-500">{percent}%</span>
                      </div>
                      <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${percent > 90 ? 'bg-red-500' : percent > 70 ? 'bg-orange-400' : 'bg-green-500'}`}
                          style={{ width: `${Math.min(percent, 100)}%` }}
                        />
                      </div>
                      <div className="flex justify-between text-xs text-slate-400 mt-1">
                        <span>{formatCurrency(item.used)}</span>
                        <span>{formatCurrency(item.budget)}</span>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="text-center py-6 text-sm text-slate-400">אין נתונים להצגה</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
