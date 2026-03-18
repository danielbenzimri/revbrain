import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Pencil, Loader2, Tag, Percent, DollarSign, Clock, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CouponEditorDrawer } from '../components/CouponEditorDrawer';
import {
  useCoupons,
  useCreateCoupon,
  useUpdateCoupon,
  useDeleteCoupon,
  useSyncCouponToStripe,
} from '../hooks';
import type { Coupon, CouponCreateInput, CouponUpdateInput } from '../hooks';

export default function CouponListPage() {
  const { t } = useTranslation();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedCoupon, setSelectedCoupon] = useState<Coupon | null>(null);
  const [showInactive, setShowInactive] = useState(false);

  const { data: coupons = [], isLoading } = useCoupons({ includeInactive: showInactive });
  const createMutation = useCreateCoupon();
  const updateMutation = useUpdateCoupon();
  const deleteMutation = useDeleteCoupon();
  const syncMutation = useSyncCouponToStripe();

  const handleNewCoupon = () => {
    setSelectedCoupon(null);
    setDrawerOpen(true);
  };

  const handleEditCoupon = (coupon: Coupon) => {
    setSelectedCoupon(coupon);
    setDrawerOpen(true);
  };

  const handleSaveCoupon = async (data: CouponCreateInput | CouponUpdateInput, isEdit: boolean) => {
    if (isEdit && selectedCoupon) {
      await updateMutation.mutateAsync({ id: selectedCoupon.id, data: data as CouponUpdateInput });
    } else {
      await createMutation.mutateAsync(data as CouponCreateInput);
    }
  };

  const handleDeleteCoupon = async (couponId: string) => {
    await deleteMutation.mutateAsync(couponId);
  };

  const handleSyncCoupon = async (couponId: string) => {
    await syncMutation.mutateAsync(couponId);
  };

  const getDiscountDisplay = (coupon: Coupon) => {
    if (coupon.discountType === 'percent') {
      return `${coupon.discountValue}%`;
    }
    return `$${coupon.discountValue}`;
  };

  const getDurationDisplay = (coupon: Coupon) => {
    switch (coupon.duration) {
      case 'once':
        return t('admin.coupons.durationOnce', 'Once');
      case 'forever':
        return t('admin.coupons.durationForever', 'Forever');
      case 'repeating':
        return t('admin.coupons.durationRepeating', '{{months}} months', {
          months: coupon.durationInMonths,
        });
      default:
        return coupon.duration;
    }
  };

  const getStatusBadge = (coupon: Coupon) => {
    const now = new Date();
    const validFrom = new Date(coupon.validFrom);
    const validUntil = coupon.validUntil ? new Date(coupon.validUntil) : null;

    if (!coupon.isActive) {
      return (
        <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-slate-100 text-slate-600">
          {t('admin.coupons.statusInactive', 'Inactive')}
        </span>
      );
    }

    if (now < validFrom) {
      return (
        <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-violet-100 text-violet-700">
          {t('admin.coupons.statusScheduled', 'Scheduled')}
        </span>
      );
    }

    if (validUntil && now > validUntil) {
      return (
        <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-red-100 text-red-700">
          {t('admin.coupons.statusExpired', 'Expired')}
        </span>
      );
    }

    if (coupon.maxUses && coupon.currentUses >= coupon.maxUses) {
      return (
        <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-orange-100 text-orange-700">
          {t('admin.coupons.statusMaxed', 'Maxed Out')}
        </span>
      );
    }

    return (
      <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-violet-100 text-violet-700">
        {t('admin.coupons.statusActive', 'Active')}
      </span>
    );
  };

  const formatDate = (dateStr: string | null | undefined) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString();
  };

  if (isLoading) {
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            {t('admin.coupons.title', 'Coupons & Promotions')}
          </h1>
          <p className="text-slate-500">
            {t('admin.coupons.subtitle', 'Manage discount codes and promotional offers')}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input
              type="checkbox"
              checked={showInactive}
              onChange={(e) => setShowInactive(e.target.checked)}
              className="rounded border-slate-300 text-amber-600 focus:ring-amber-500"
            />
            {t('admin.coupons.showInactive', 'Show inactive')}
          </label>
          <Button onClick={handleNewCoupon} className="bg-amber-500 hover:bg-amber-600">
            <Plus className="h-4 w-4 me-2" />
            {t('admin.coupons.newCoupon', 'New Coupon')}
          </Button>
        </div>
      </div>

      {/* Coupons Table */}
      {coupons.length === 0 ? (
        <div className="text-center py-12 border-2 border-dashed border-slate-200 rounded-xl">
          <Tag className="h-12 w-12 text-slate-300 mx-auto mb-4" />
          <p className="text-slate-500 mb-4">{t('admin.coupons.noCoupons', 'No coupons yet')}</p>
          <Button onClick={handleNewCoupon} variant="outline">
            <Plus className="h-4 w-4 me-2" />
            {t('admin.coupons.createFirst', 'Create your first coupon')}
          </Button>
        </div>
      ) : (
        <div className="bg-white rounded shadow-sm border-slate-200 overflow-hidden">
          <table className="w-full">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-start px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  {t('admin.coupons.tableCode', 'Code')}
                </th>
                <th className="text-start px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  {t('admin.coupons.tableDiscount', 'Discount')}
                </th>
                <th className="text-start px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  {t('admin.coupons.tableDuration', 'Duration')}
                </th>
                <th className="text-start px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  {t('admin.coupons.tableUsage', 'Usage')}
                </th>
                <th className="text-start px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  {t('admin.coupons.tableValidity', 'Validity')}
                </th>
                <th className="text-start px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  {t('admin.coupons.tableStatus', 'Status')}
                </th>
                <th className="text-end px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  {t('admin.coupons.tableActions', 'Actions')}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {coupons.map((coupon) => (
                <tr key={coupon.id} className="hover:bg-slate-50 transition-colors">
                  {/* Code & Name */}
                  <td className="px-4 py-4">
                    <div className="flex items-center gap-3">
                      <div
                        className={`h-10 w-10 rounded-lg flex items-center justify-center ${
                          coupon.isActive
                            ? 'bg-amber-100 text-amber-600'
                            : 'bg-slate-100 text-slate-400'
                        }`}
                      >
                        <Tag className="h-5 w-5" />
                      </div>
                      <div>
                        <p className="font-mono font-bold text-slate-900">{coupon.code}</p>
                        <p className="text-sm text-slate-500">{coupon.name}</p>
                      </div>
                    </div>
                  </td>

                  {/* Discount */}
                  <td className="px-4 py-4">
                    <div className="flex items-center gap-2">
                      {coupon.discountType === 'percent' ? (
                        <Percent className="h-4 w-4 text-slate-400" />
                      ) : (
                        <DollarSign className="h-4 w-4 text-slate-400" />
                      )}
                      <span className="font-semibold text-slate-900">
                        {getDiscountDisplay(coupon)}
                      </span>
                    </div>
                  </td>

                  {/* Duration */}
                  <td className="px-4 py-4">
                    <div className="flex items-center gap-2 text-sm text-slate-600">
                      <Clock className="h-4 w-4 text-slate-400" />
                      {getDurationDisplay(coupon)}
                    </div>
                  </td>

                  {/* Usage */}
                  <td className="px-4 py-4">
                    <div className="flex items-center gap-2 text-sm">
                      <Users className="h-4 w-4 text-slate-400" />
                      <span className="text-slate-900 font-medium">{coupon.currentUses}</span>
                      <span className="text-slate-400">
                        / {coupon.maxUses ?? t('admin.coupons.unlimited', '∞')}
                      </span>
                    </div>
                  </td>

                  {/* Validity */}
                  <td className="px-4 py-4">
                    <div className="text-sm text-slate-600">
                      <div>{formatDate(coupon.validFrom)}</div>
                      <div className="text-slate-400">
                        →{' '}
                        {coupon.validUntil
                          ? formatDate(coupon.validUntil)
                          : t('admin.coupons.noExpiry', 'No expiry')}
                      </div>
                    </div>
                  </td>

                  {/* Status */}
                  <td className="px-4 py-4">
                    <div className="flex flex-col gap-1">
                      {getStatusBadge(coupon)}
                      {coupon.stripeCouponId && (
                        <span className="text-xs text-slate-400">
                          {t('admin.coupons.stripeSynced', 'Stripe ✓')}
                        </span>
                      )}
                    </div>
                  </td>

                  {/* Actions */}
                  <td className="px-4 py-4 text-end">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleEditCoupon(coupon)}
                      className="text-slate-600"
                    >
                      <Pencil className="h-4 w-4 me-1" />
                      {t('common.edit', 'Edit')}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Editor Drawer */}
      <CouponEditorDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        coupon={selectedCoupon}
        onSave={handleSaveCoupon}
        onDelete={handleDeleteCoupon}
        onSync={handleSyncCoupon}
      />
    </div>
  );
}
