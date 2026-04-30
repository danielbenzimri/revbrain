/**
 * Admin Partners Page (SI Billing)
 *
 * Task: P3.4
 * Refs: SI-BILLING-SPEC.md §12.1.1
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Users, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { usePartners, usePartnerDetail, type PartnerProfile } from '../hooks/use-partners';

function formatCurrency(cents: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

function TierBadge({ tier }: { tier: string }) {
  const colors: Record<string, string> = {
    standard: 'bg-slate-100 text-slate-700',
    silver: 'bg-gray-200 text-gray-800',
    gold: 'bg-amber-100 text-amber-800',
    platinum: 'bg-violet-100 text-violet-800',
  };
  return (
    <span
      className={`px-2 py-0.5 text-xs font-medium rounded-full ${colors[tier] ?? colors.standard}`}
    >
      {tier.charAt(0).toUpperCase() + tier.slice(1)}
    </span>
  );
}

function PartnerBillingContact({ partnerId }: { partnerId: string }) {
  const { t } = useTranslation();
  const { data } = usePartnerDetail(partnerId);

  return (
    <div className="mb-6 p-4 bg-slate-50 rounded-lg">
      <p className="text-sm font-medium text-slate-700 mb-1">
        {t('admin.partners.billingContact', 'Billing Contact')}
      </p>
      <p className="text-sm text-slate-600" data-testid="partner-billing-contact">
        {data?.billingContactEmail ?? t('admin.partners.noBillingContact', 'Not set')}
      </p>
    </div>
  );
}

export default function PartnersPage() {
  const { t } = useTranslation();
  const { data: partners = [], isLoading } = usePartners();
  const [selectedPartner, setSelectedPartner] = useState<PartnerProfile | null>(null);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="h-8 w-8 animate-spin text-violet-500" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6" data-testid="partners-page">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            {t('admin.partners.title', 'Partners')}
          </h1>
          <p className="text-slate-500">
            {t('admin.partners.subtitle', 'Manage SI partner organizations and fee agreements')}
          </p>
        </div>
      </div>

      {/* Empty State */}
      {partners.length === 0 ? (
        <div
          className="text-center py-12 border border-dashed border-slate-200 rounded-xl"
          data-testid="partners-empty"
        >
          <Users className="h-12 w-12 text-slate-300 mx-auto mb-4" />
          <p className="text-slate-500">
            {t(
              'admin.partners.empty',
              'No SI partners yet. Partners appear here when an organization is registered as an SI partner.'
            )}
          </p>
        </div>
      ) : (
        /* Partner Table */
        <div
          className="border border-slate-200 rounded-xl overflow-hidden"
          data-testid="partners-table"
        >
          <table className="w-full">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-start px-4 py-3 text-sm font-medium text-slate-600">
                  {t('admin.partners.colName', 'Partner Name')}
                </th>
                <th className="text-start px-4 py-3 text-sm font-medium text-slate-600">
                  {t('admin.partners.colTier', 'Tier')}
                </th>
                <th className="text-start px-4 py-3 text-sm font-medium text-slate-600">
                  {t('admin.partners.colProjects', 'Projects')}
                </th>
                <th className="text-start px-4 py-3 text-sm font-medium text-slate-600">
                  {t('admin.partners.colFeesPaid', 'Fees Paid')}
                </th>
              </tr>
            </thead>
            <tbody>
              {partners.map((partner) => (
                <tr
                  key={partner.id}
                  className="border-b border-slate-100 hover:bg-slate-50 cursor-pointer"
                  onClick={() => setSelectedPartner(partner)}
                  data-testid={`partner-row-${partner.id}`}
                >
                  <td className="px-4 py-3 text-sm font-medium text-slate-900">
                    {partner.organizationId}
                  </td>
                  <td className="px-4 py-3">
                    <TierBadge tier={partner.tierOverride ?? partner.tier} />
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-600">
                    {partner.completedProjectCount}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-600">
                    {formatCurrency(partner.cumulativeFeesPaid)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Partner Detail Drawer - simplified for initial implementation */}
      {selectedPartner && (
        <div
          className="fixed inset-y-0 end-0 w-96 bg-white shadow-xl border-s border-slate-200 z-50 p-6 overflow-y-auto"
          data-testid="partner-drawer"
        >
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-lg font-bold">{selectedPartner.organizationId}</h2>
            <Button variant="ghost" size="sm" onClick={() => setSelectedPartner(null)}>
              {t('common.close', 'Close')}
            </Button>
          </div>

          {/* Tier Status */}
          <div className="mb-6 p-4 bg-slate-50 rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-lg">★</span>
              <TierBadge tier={selectedPartner.tierOverride ?? selectedPartner.tier} />
            </div>
            <p className="text-sm text-slate-600">
              {t('admin.partners.feesPaid', 'Fees paid')}:{' '}
              {formatCurrency(selectedPartner.cumulativeFeesPaid)}
            </p>
            <p className="text-sm text-slate-600">
              {t('admin.partners.projectsCompleted', 'Projects completed')}:{' '}
              {selectedPartner.completedProjectCount}
            </p>
          </div>

          {/* Billing Contact (read-only, fetched from detail) */}
          <PartnerBillingContact partnerId={selectedPartner.id} />

          {/* Override Section */}
          {selectedPartner.tierOverride && (
            <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm">
              <p className="font-medium text-amber-800">
                {t('admin.partners.overrideActive', 'Tier override active')}
              </p>
              <p className="text-amber-700">{selectedPartner.tierOverrideReason}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
