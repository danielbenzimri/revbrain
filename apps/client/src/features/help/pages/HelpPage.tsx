import { useTranslation } from 'react-i18next';

export default function HelpPage() {
  const { t } = useTranslation();

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{t('help.title')}</h1>
      <p className="text-neutral-500">{t('help.subtitle')}</p>
      <div className="bg-white rounded shadow-sm p-8 text-center">
        <div className="mx-auto w-16 h-16 bg-neutral-100 rounded-full flex items-center justify-center mb-4 text-3xl">
          ❓
        </div>
        <h3 className="font-semibold text-lg mb-2">{t('help.needHelp')}</h3>
        <p className="text-neutral-500 text-sm">{t('help.contact')}</p>
      </div>
    </div>
  );
}
