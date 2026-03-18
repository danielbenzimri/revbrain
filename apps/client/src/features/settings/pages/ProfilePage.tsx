import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, Save, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useProfile, useUpdateProfile, type UserProfile } from '../hooks';

function ProfileForm({ profile }: { profile: UserProfile }) {
  const { t } = useTranslation();
  const updateProfile = useUpdateProfile();

  const [fullName, setFullName] = useState(profile.fullName || '');
  const [phoneNumber, setPhoneNumber] = useState(profile.phoneNumber || '');
  const [mobileNumber, setMobileNumber] = useState(profile.mobileNumber || '');
  const [jobTitle, setJobTitle] = useState(profile.jobTitle || '');
  const [address, setAddress] = useState(profile.address || '');
  const [bio, setBio] = useState(profile.bio || '');
  const [avatarUrl, setAvatarUrl] = useState(profile.avatarUrl || '');
  const [showSuccess, setShowSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      await updateProfile.mutateAsync({
        fullName,
        phoneNumber: phoneNumber || undefined,
        mobileNumber: mobileNumber || undefined,
        jobTitle: jobTitle || undefined,
        address: address || undefined,
        bio: bio || undefined,
        avatarUrl: avatarUrl || undefined,
      });
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 3000);
    } catch {
      // Error handled by mutation
    }
  };

  return (
    <div className="max-w-2xl">
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Success message */}
        {showSuccess && (
          <div className="flex items-center gap-2 bg-violet-50 text-violet-700 px-4 py-3 rounded-lg text-sm">
            <CheckCircle2 className="h-4 w-4" />
            {t('settings.profile.saved')}
          </div>
        )}

        {updateProfile.isError && (
          <div className="bg-red-50 text-red-600 px-4 py-3 rounded-lg text-sm">
            {t('settings.profile.saveFailed')}
          </div>
        )}

        {/* Email (read-only) */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">
            {t('settings.profile.email')}
          </label>
          <input
            type="email"
            value={profile.email}
            disabled
            className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-slate-50 text-slate-500 text-sm cursor-not-allowed"
          />
          <p className="text-xs text-slate-400 mt-1">{t('settings.profile.emailHint')}</p>
        </div>

        {/* Full Name */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">
            {t('settings.profile.fullName')}
          </label>
          <input
            type="text"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            required
            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-violet-500 outline-none text-sm"
          />
        </div>

        {/* Phone Numbers */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              {t('settings.profile.phone')}
            </label>
            <input
              type="tel"
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
              placeholder="+1 (555) 123-4567"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-violet-500 outline-none text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              {t('settings.profile.mobile')}
            </label>
            <input
              type="tel"
              value={mobileNumber}
              onChange={(e) => setMobileNumber(e.target.value)}
              placeholder="+1 (555) 987-6543"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-violet-500 outline-none text-sm"
            />
          </div>
        </div>

        {/* Job Title */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">
            {t('settings.profile.jobTitle')}
          </label>
          <input
            type="text"
            value={jobTitle}
            onChange={(e) => setJobTitle(e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-violet-500 outline-none text-sm"
          />
        </div>

        {/* Address */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">
            {t('settings.profile.address')}
          </label>
          <input
            type="text"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-violet-500 outline-none text-sm"
          />
        </div>

        {/* Avatar URL */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">
            {t('settings.profile.avatarUrl')}
          </label>
          <input
            type="url"
            value={avatarUrl}
            onChange={(e) => setAvatarUrl(e.target.value)}
            placeholder="https://..."
            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-violet-500 outline-none text-sm"
          />
        </div>

        {/* Bio */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">
            {t('settings.profile.bio')}
          </label>
          <textarea
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            rows={3}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-violet-500 outline-none text-sm resize-none"
          />
        </div>

        <div className="pt-2">
          <Button
            type="submit"
            disabled={updateProfile.isPending}
            className="bg-violet-500 hover:bg-violet-600 text-white"
          >
            {updateProfile.isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin me-2" />
                {t('common.saving')}
              </>
            ) : (
              <>
                <Save className="h-4 w-4 me-2" />
                {t('settings.profile.save')}
              </>
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}

export default function ProfilePage() {
  const { data: profile, isLoading } = useProfile();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
      </div>
    );
  }

  if (!profile) return null;

  return <ProfileForm key={profile.id} profile={profile} />;
}
