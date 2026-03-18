/**
 * ContactSalesModal Component
 *
 * Enterprise contact form modal for requesting custom pricing.
 * Triggered when clicking "Contact Sales" on Enterprise plan.
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Loader2, CheckCircle, Calendar, Building2, Users, Mail, Phone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useMutation } from '@tanstack/react-query';

interface ContactSalesModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface ContactFormData {
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  companyName: string;
  companySize: string;
  message: string;
}

const COMPANY_SIZES = [
  { value: '1-10', label: '1-10 employees' },
  { value: '11-50', label: '11-50 employees' },
  { value: '51-200', label: '51-200 employees' },
  { value: '200+', label: '200+ employees' },
];

const apiUrl = import.meta.env.VITE_API_URL || '/api';

export function ContactSalesModal({ isOpen, onClose }: ContactSalesModalProps) {
  const { t } = useTranslation();
  const [formData, setFormData] = useState<ContactFormData>({
    contactName: '',
    contactEmail: '',
    contactPhone: '',
    companyName: '',
    companySize: '',
    message: '',
  });
  const [success, setSuccess] = useState<{ calendlyUrl: string | null } | null>(null);

  const submitMutation = useMutation({
    mutationFn: async (data: ContactFormData) => {
      const response = await fetch(`${apiUrl}/v1/leads/contact-sales`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error?.message || 'Failed to submit form');
      }

      return response.json();
    },
    onSuccess: (data) => {
      setSuccess({ calendlyUrl: data.data?.calendlyUrl || null });
    },
  });

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    submitMutation.mutate(formData);
  };

  const handleClose = () => {
    setFormData({
      contactName: '',
      contactEmail: '',
      contactPhone: '',
      companyName: '',
      companySize: '',
      message: '',
    });
    setSuccess(null);
    submitMutation.reset();
    onClose();
  };

  const updateField = (field: keyof ContactFormData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  // Success state
  if (success) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
          {/* Header */}
          <div className="bg-gradient-to-r from-emerald-500 to-teal-500 px-6 py-5 text-white relative">
            <button
              onClick={handleClose}
              className="absolute top-4 end-4 p-1.5 rounded-full hover:bg-white/20 transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
            <div className="text-center">
              <CheckCircle className="h-12 w-12 mx-auto mb-3" />
              <h2 className="text-xl font-bold">
                {t('billing.contactSales.successTitle', 'Thank you!')}
              </h2>
            </div>
          </div>

          {/* Content */}
          <div className="p-6 text-center">
            <p className="text-slate-600 mb-6">
              {t(
                'billing.contactSales.successMessage',
                "We've received your inquiry. One of our enterprise specialists will be in touch within 1 business day."
              )}
            </p>

            {success.calendlyUrl && (
              <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4 mb-6">
                <Calendar className="h-8 w-8 text-emerald-600 mx-auto mb-2" />
                <p className="text-sm text-emerald-700 mb-3">
                  {t(
                    'billing.contactSales.calendlyPrompt',
                    'Want to skip the wait? Schedule a demo directly!'
                  )}
                </p>
                <Button
                  onClick={() => window.open(success.calendlyUrl!, '_blank')}
                  className="bg-emerald-500 hover:bg-emerald-600"
                >
                  <Calendar className="h-4 w-4 me-2" />
                  {t('billing.contactSales.scheduleDemo', 'Schedule a Demo')}
                </Button>
              </div>
            )}

            <Button variant="outline" onClick={handleClose} className="w-full">
              {t('common.close', 'Close')}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="bg-gradient-to-r from-indigo-600 to-purple-600 px-6 py-5 text-white relative flex-shrink-0">
          <button
            onClick={handleClose}
            className="absolute top-4 end-4 p-1.5 rounded-full hover:bg-white/20 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
          <div className="text-center">
            <Building2 className="h-10 w-10 mx-auto mb-2 opacity-90" />
            <h2 className="text-xl font-bold">
              {t('billing.contactSales.title', 'Contact Sales')}
            </h2>
            <p className="text-indigo-200 text-sm mt-1">
              {t('billing.contactSales.subtitle', 'Get a custom enterprise quote')}
            </p>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-4">
          {submitMutation.error && (
            <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg text-sm">
              {(submitMutation.error as Error).message}
            </div>
          )}

          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              {t('billing.contactSales.name', 'Your Name')} *
            </label>
            <div className="relative">
              <input
                type="text"
                value={formData.contactName}
                onChange={(e) => updateField('contactName', e.target.value)}
                required
                placeholder={t('billing.contactSales.namePlaceholder', 'John Smith')}
                className="w-full px-3 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none text-sm"
              />
            </div>
          </div>

          {/* Email */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              <Mail className="h-4 w-4 inline me-1" />
              {t('billing.contactSales.email', 'Work Email')} *
            </label>
            <input
              type="email"
              value={formData.contactEmail}
              onChange={(e) => updateField('contactEmail', e.target.value)}
              required
              placeholder="john@company.com"
              className="w-full px-3 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none text-sm"
            />
          </div>

          {/* Phone */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              <Phone className="h-4 w-4 inline me-1" />
              {t('billing.contactSales.phone', 'Phone Number')}
            </label>
            <input
              type="tel"
              value={formData.contactPhone}
              onChange={(e) => updateField('contactPhone', e.target.value)}
              placeholder="+1 (555) 123-4567"
              className="w-full px-3 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none text-sm"
            />
          </div>

          {/* Company Name */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              <Building2 className="h-4 w-4 inline me-1" />
              {t('billing.contactSales.company', 'Company Name')} *
            </label>
            <input
              type="text"
              value={formData.companyName}
              onChange={(e) => updateField('companyName', e.target.value)}
              required
              placeholder={t('billing.contactSales.companyPlaceholder', 'Acme Construction Ltd')}
              className="w-full px-3 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none text-sm"
            />
          </div>

          {/* Company Size */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              <Users className="h-4 w-4 inline me-1" />
              {t('billing.contactSales.teamSize', 'Team Size')}
            </label>
            <select
              value={formData.companySize}
              onChange={(e) => updateField('companySize', e.target.value)}
              className="w-full px-3 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none text-sm bg-white"
            >
              <option value="">{t('billing.contactSales.selectSize', 'Select team size')}</option>
              {COMPANY_SIZES.map((size) => (
                <option key={size.value} value={size.value}>
                  {size.label}
                </option>
              ))}
            </select>
          </div>

          {/* Message */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              {t('billing.contactSales.message', 'Message')}
            </label>
            <textarea
              value={formData.message}
              onChange={(e) => updateField('message', e.target.value)}
              rows={3}
              placeholder={t(
                'billing.contactSales.messagePlaceholder',
                'Tell us about your needs...'
              )}
              className="w-full px-3 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none text-sm resize-none"
            />
          </div>

          {/* Enterprise Benefits */}
          <div className="bg-slate-50 rounded-lg p-4">
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-2">
              {t('billing.contactSales.includes', 'Enterprise includes:')}
            </p>
            <ul className="space-y-1.5">
              {[
                t('billing.contactSales.feature1', 'Unlimited users & projects'),
                t('billing.contactSales.feature2', 'Dedicated account manager'),
                t('billing.contactSales.feature3', 'Custom onboarding & training'),
                t('billing.contactSales.feature4', 'Priority support with SLA'),
              ].map((feature, i) => (
                <li key={i} className="flex items-center gap-2 text-sm text-slate-600">
                  <CheckCircle className="h-4 w-4 text-emerald-500 flex-shrink-0" />
                  {feature}
                </li>
              ))}
            </ul>
          </div>
        </form>

        {/* Footer */}
        <div className="flex-shrink-0 border-t px-6 py-4 flex gap-3">
          <Button type="button" variant="outline" onClick={handleClose} className="flex-1">
            {t('common.cancel', 'Cancel')}
          </Button>
          <Button
            type="submit"
            onClick={handleSubmit}
            disabled={
              submitMutation.isPending ||
              !formData.contactName ||
              !formData.contactEmail ||
              !formData.companyName
            }
            className="flex-1 bg-indigo-600 hover:bg-indigo-700"
          >
            {submitMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin me-2" />
                {t('common.sending', 'Sending...')}
              </>
            ) : (
              t('billing.contactSales.submit', 'Submit Request')
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
