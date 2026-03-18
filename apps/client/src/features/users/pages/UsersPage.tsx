import { useTranslation } from 'react-i18next';

export default function UsersPage() {
  const { t } = useTranslation();

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{t('users.title')}</h1>
      <p className="text-neutral-500">{t('users.subtitle')}</p>
      <div className="bg-white rounded shadow-sm p-8 text-center">
        <p className="text-neutral-400">{t('common.underDevelopment')}</p>
      </div>
    </div>
  );
}
