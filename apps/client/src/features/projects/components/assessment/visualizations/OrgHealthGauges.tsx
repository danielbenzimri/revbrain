/**
 * Org Health Gauges
 *
 * Circular progress gauges for API usage, storage, and Apex governor.
 * Uses CSS conic-gradient — lightweight, no charting library.
 */
import type { OrgHealth } from '../../../mocks/assessment-mock-data';

// ---------------------------------------------------------------------------
// Gauge component
// ---------------------------------------------------------------------------

interface GaugeProps {
  value: number; // 0-100
  label: string;
  detail?: string;
  status: 'good' | 'warning' | 'danger';
}

function Gauge({ value, label, detail, status }: GaugeProps) {
  const color = status === 'danger' ? '#ef4444' : status === 'warning' ? '#f59e0b' : '#10b981';
  const bgColor = status === 'danger' ? '#fef2f2' : status === 'warning' ? '#fffbeb' : '#f0fdf4';

  return (
    <div className="flex flex-col items-center">
      <div
        className="relative w-20 h-20 rounded-full flex items-center justify-center"
        style={{
          background: `conic-gradient(${color} ${value * 3.6}deg, #f1f5f9 0deg)`,
        }}
      >
        <div
          className="w-14 h-14 rounded-full flex items-center justify-center"
          style={{ backgroundColor: bgColor }}
        >
          <span className="text-lg font-bold tabular-nums" style={{ color }}>
            {value}%
          </span>
        </div>
      </div>
      <p className="text-sm font-medium text-slate-900 mt-2">{label}</p>
      {detail && <p className="text-xs text-slate-400">{detail}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// License card
// ---------------------------------------------------------------------------

interface LicenseCardProps {
  label: string;
  count: number;
  status: 'ok' | 'missing';
}

function LicenseCard({ label, count, status }: LicenseCardProps) {
  return (
    <div
      className={`rounded-xl px-4 py-3 text-center ${
        status === 'missing' ? 'bg-red-50 ring-1 ring-red-200' : 'bg-emerald-50'
      }`}
    >
      <p
        className={`text-2xl font-bold tabular-nums ${
          status === 'missing' ? 'text-red-600' : 'text-emerald-600'
        }`}
      >
        {count}
      </p>
      <p className="text-xs text-slate-600 mt-0.5">{label}</p>
      {status === 'missing' && <p className="text-xs text-red-500 font-medium mt-1">Required</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface OrgHealthGaugesProps {
  orgHealth: OrgHealth;
  t: (key: string) => string;
}

export default function OrgHealthGauges({ orgHealth, t }: OrgHealthGaugesProps) {
  const getStatus = (pct: number): 'good' | 'warning' | 'danger' => {
    if (pct >= 80) return 'danger';
    if (pct >= 60) return 'warning';
    return 'good';
  };

  return (
    <div className="bg-white rounded-2xl p-5" data-testid="org-health-gauges">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-slate-900">
          {t('assessment.subTabs.orgHealth')}
        </h3>
        <span className="text-xs text-slate-400">{orgHealth.edition} Edition</span>
      </div>

      <div className="flex items-start justify-around mb-6">
        <Gauge
          value={orgHealth.apiUsagePercent}
          label="API Usage"
          detail={`${100 - orgHealth.apiUsagePercent}% headroom`}
          status={getStatus(orgHealth.apiUsagePercent)}
        />
        <Gauge
          value={orgHealth.storageUsagePercent}
          label="Storage"
          detail={`${100 - orgHealth.storageUsagePercent}% available`}
          status={getStatus(orgHealth.storageUsagePercent)}
        />
        <Gauge
          value={orgHealth.apexGovernorPercent}
          label="Apex Governor"
          detail={`${100 - orgHealth.apexGovernorPercent}% remaining`}
          status={getStatus(orgHealth.apexGovernorPercent)}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <LicenseCard label="CPQ Licenses" count={orgHealth.cpqLicenseCount} status="ok" />
        <LicenseCard
          label="RCA Licenses"
          count={orgHealth.rcaLicenseCount}
          status={orgHealth.rcaLicenseCount === 0 ? 'missing' : 'ok'}
        />
      </div>

      {orgHealth.hasSalesforceBilling && (
        <div className="mt-3 px-3 py-2 bg-amber-50 rounded-lg flex items-center gap-2">
          <span className="text-amber-500">⚠</span>
          <p className="text-xs text-amber-700 font-medium">
            {t('assessment.prerequisites.billingDetected')}
          </p>
        </div>
      )}
    </div>
  );
}
