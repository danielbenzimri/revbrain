import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import he from './locales/he';
import en from './locales/en';

// Flatten nested namespace structure for i18next
// Converts { nav: { dashboard: "..." } } to { "nav.dashboard": "..." }
function flattenTranslations(obj: Record<string, unknown>, prefix = ''): Record<string, string> {
  const result: Record<string, string> = {};

  for (const [key, value] of Object.entries(obj)) {
    const newKey = prefix ? `${prefix}.${key}` : key;

    if (typeof value === 'object' && value !== null) {
      Object.assign(result, flattenTranslations(value as Record<string, unknown>, newKey));
    } else {
      result[newKey] = value as string;
    }
  }

  return result;
}

// Create resources with both flattened translation namespace AND individual namespaces
const resources = {
  he: {
    translation: flattenTranslations(he),
    // Individual namespaces for components that use useTranslation('namespace')
    ...Object.fromEntries(
      Object.entries(he).map(([key, value]) => [
        key,
        flattenTranslations(value as Record<string, unknown>),
      ])
    ),
  },
  en: {
    translation: flattenTranslations(en),
    // Individual namespaces for components that use useTranslation('namespace')
    ...Object.fromEntries(
      Object.entries(en).map(([key, value]) => [
        key,
        flattenTranslations(value as Record<string, unknown>),
      ])
    ),
  },
};

const LANGUAGE_STORAGE_KEY = 'revbrain_language';

/**
 * Get the saved language from localStorage.
 * Always defaults to English — ignores browser language detection.
 */
function getSavedLanguage(): string {
  try {
    const saved = localStorage.getItem(LANGUAGE_STORAGE_KEY);
    if (saved && (saved === 'en' || saved === 'he')) return saved;
  } catch {
    // localStorage may be unavailable
  }
  return 'en';
}

/**
 * Save language preference to localStorage.
 */
export function saveLanguage(lang: string): void {
  try {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, lang);
  } catch {
    // Ignore storage errors
  }
}

i18n.use(initReactI18next).init({
  resources,
  lng: getSavedLanguage(),
  fallbackLng: 'en',
  interpolation: {
    escapeValue: false,
  },
  // Allow components to use namespaces
  defaultNS: 'translation',
  fallbackNS: 'translation',
});

// Set document direction on init
const initialLang = i18n.language;
document.documentElement.setAttribute('dir', initialLang === 'he' ? 'rtl' : 'ltr');
document.documentElement.setAttribute('lang', initialLang);

export default i18n;
