import { useTranslation } from 'react-i18next';

export default function DashboardPage() {
  const { t } = useTranslation();

  return (
    <div className="space-y-6">
      <div className="animate-fade-in-up flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t('dashboard.title')}</h1>
          <p className="text-neutral-500 text-sm">{t('dashboard.subtitle')}</p>
        </div>
      </div>

      <div className="animate-fade-in-up delay-50 grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded shadow-sm p-4 flex items-center gap-4">
          <div className="h-10 w-10 rounded-full bg-neutral-100 flex items-center justify-center">
            📁
          </div>
          <div>
            <p className="text-2xl font-bold">0</p>
            <p className="text-xs text-neutral-500">{t('projects.total')}</p>
          </div>
        </div>
        <div className="bg-white rounded shadow-sm p-4 flex items-center gap-4">
          <div className="h-10 w-10 rounded-full bg-green-100 flex items-center justify-center">
            🟢
          </div>
          <div>
            <p className="text-2xl font-bold">0</p>
            <p className="text-xs text-neutral-500">{t('projects.active')}</p>
          </div>
        </div>
        <div className="bg-white rounded shadow-sm p-4 flex items-center gap-4">
          <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center">
            ✅
          </div>
          <div>
            <p className="text-2xl font-bold">0</p>
            <p className="text-xs text-neutral-500">{t('projects.completed')}</p>
          </div>
        </div>
        <div className="bg-white rounded shadow-sm p-4 flex items-center gap-4">
          <div className="h-10 w-10 rounded-full bg-red-100 flex items-center justify-center">
            ⚠️
          </div>
          <div>
            <p className="text-2xl font-bold">0</p>
            <p className="text-xs text-neutral-500">{t('projects.attention')}</p>
          </div>
        </div>
      </div>

      <div className="animate-fade-in-up delay-100 bg-white rounded shadow-sm p-8 text-center">
        <div className="mx-auto w-16 h-16 bg-neutral-100 rounded-full flex items-center justify-center mb-4 text-3xl">
          📊
        </div>
        <h3 className="font-semibold text-lg mb-2">{t('dashboard.welcome')}</h3>
        <p className="text-neutral-500 text-sm">{t('dashboard.selectProject')}</p>
      </div>
    </div>
  );
}
