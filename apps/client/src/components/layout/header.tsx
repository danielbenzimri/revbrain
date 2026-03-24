import { useState, useRef, useEffect } from 'react';
import { Menu } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { Sidebar } from './sidebar';
import { useTranslation } from 'react-i18next';
import { useUser } from '@/stores/auth-store';
import { ROLE_DISPLAY_NAMES } from '@/types/auth';
import { saveLanguage } from '@/i18n';

// ─── Language definitions ────────────────────────────────────

interface LanguageOption {
  code: string;
  flag: string;
  label: string;
  dir: 'ltr' | 'rtl';
  enabled: boolean;
}

const LANGUAGES: LanguageOption[] = [
  { code: 'en', flag: '🇺🇸', label: 'English', dir: 'ltr', enabled: true },
  { code: 'he', flag: '🇮🇱', label: 'עברית', dir: 'rtl', enabled: true },
  { code: 'fr', flag: '🇫🇷', label: 'Français', dir: 'ltr', enabled: false },
  { code: 'de', flag: '🇩🇪', label: 'Deutsch', dir: 'ltr', enabled: false },
  { code: 'es', flag: '🇪🇸', label: 'Español', dir: 'ltr', enabled: false },
  { code: 'ja', flag: '🇯🇵', label: '日本語', dir: 'ltr', enabled: false },
];

// ─── Language Selector ───────────────────────────────────────

function LanguageSelector() {
  const { i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const currentLang = LANGUAGES.find((l) => l.code === i18n.language) || LANGUAGES[0]!;

  const handleSelect = (lang: LanguageOption) => {
    if (!lang.enabled) return;
    i18n.changeLanguage(lang.code);
    saveLanguage(lang.code);
    document.documentElement.setAttribute('dir', lang.dir);
    document.documentElement.setAttribute('lang', lang.code);
    setOpen(false);
  };

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-white hover:bg-slate-700 transition-colors"
        aria-label="Select language"
      >
        <span className="text-base leading-none">{currentLang.flag}</span>
        <span className="text-xs font-medium hidden sm:inline">
          {currentLang.code.toUpperCase()}
        </span>
      </button>

      {open && (
        <div className="absolute end-0 top-full mt-1.5 w-48 rounded-xl bg-white shadow-lg ring-1 ring-black/5 py-1.5 z-50">
          {LANGUAGES.map((lang) => (
            <button
              key={lang.code}
              onClick={() => handleSelect(lang)}
              disabled={!lang.enabled}
              className={`flex w-full items-center gap-3 px-3 py-2 text-start text-sm transition-colors ${
                lang.code === currentLang.code
                  ? 'bg-violet-50 text-violet-700 font-medium'
                  : lang.enabled
                    ? 'text-slate-700 hover:bg-slate-50'
                    : 'text-slate-300 cursor-not-allowed'
              }`}
            >
              <span className="text-base leading-none">{lang.flag}</span>
              <span className="flex-1">{lang.label}</span>
              {!lang.enabled && (
                <span className="text-[10px] text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">
                  Soon
                </span>
              )}
              {lang.code === currentLang.code && <span className="text-violet-500 text-xs">✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Header ──────────────────────────────────────────────────

export function Header() {
  const { i18n } = useTranslation();
  const user = useUser();

  const isHebrew = i18n.language === 'he';

  const userName = user?.name || 'User';
  const userRole = user?.role ? ROLE_DISPLAY_NAMES[user.role]?.[isHebrew ? 'he' : 'en'] : '';
  const userInitials = userName
    .split(' ')
    .map((n) => n[0])
    .join('')
    .slice(0, 2);

  return (
    <header className="flex h-14 items-center gap-4 bg-gradient-to-b from-[#1e293b] to-[#0f172a] text-white px-4 md:px-6 lg:h-[60px] sticky top-0 z-10">
      {/* Mobile Menu */}
      <Sheet>
        <SheetTrigger asChild>
          <Button variant="ghost" size="icon" className="md:hidden text-white hover:bg-slate-700">
            <Menu className="h-5 w-5" />
            <span className="sr-only">Toggle menu</span>
          </Button>
        </SheetTrigger>
        <SheetContent side={isHebrew ? 'right' : 'left'} className="p-0 border-none w-64 pt-0">
          <Sidebar className="border-none w-full" />
        </SheetContent>
      </Sheet>

      {/* Logo (Mobile) */}
      <div className="flex-1 md:hidden">
        <span className="font-bold text-violet-400">REVBRAIN</span>
      </div>

      {/* Mock Mode Badge */}
      {import.meta.env.VITE_AUTH_MODE === 'mock' && (
        <span className="px-2 py-0.5 text-[10px] font-bold bg-violet-100 text-violet-700 rounded-full">
          MOCK MODE
        </span>
      )}

      {/* Spacer (Desktop) */}
      <div className="flex-1 hidden md:block" />

      {/* Language Selector */}
      <LanguageSelector />

      {/* User Avatar */}
      <div className="hidden md:flex items-center gap-2">
        <div className="text-end">
          <p className="text-sm font-medium text-white">{userName}</p>
          {userRole && <p className="text-xs text-slate-400">{userRole}</p>}
        </div>
        <div className="bg-violet-500 text-white rounded-full h-8 w-8 flex items-center justify-center text-sm font-medium">
          {userInitials}
        </div>
      </div>
    </header>
  );
}
