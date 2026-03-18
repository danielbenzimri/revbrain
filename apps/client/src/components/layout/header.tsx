import { Menu, Globe } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { Sidebar } from './sidebar';
import { useTranslation } from 'react-i18next';
import { useUser } from '@/stores/auth-store';
import { ROLE_DISPLAY_NAMES } from '@/types/auth';

export function Header() {
  const { i18n } = useTranslation();
  const user = useUser();

  const toggleLanguage = () => {
    const newLang = i18n.language === 'he' ? 'en' : 'he';
    i18n.changeLanguage(newLang);
    document.documentElement.dir = newLang === 'he' ? 'rtl' : 'ltr';
    document.documentElement.lang = newLang;
  };

  const isHebrew = i18n.language === 'he';

  // User info
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
        <span className="font-bold text-emerald-400">REVBRAIN</span>
      </div>

      {/* Spacer (Desktop) */}
      <div className="flex-1 hidden md:block" />

      {/* Language Toggle */}
      <Button
        variant="ghost"
        size="sm"
        onClick={toggleLanguage}
        className="flex items-center gap-2 text-white hover:bg-slate-700 border-slate-600"
      >
        <Globe className="h-4 w-4" />
        <span className="font-medium">{isHebrew ? 'EN' : 'עב'}</span>
      </Button>

      {/* User Avatar */}
      <div className="hidden md:flex items-center gap-2">
        <div className="text-end">
          <p className="text-sm font-medium text-white">{userName}</p>
          {userRole && <p className="text-xs text-slate-400">{userRole}</p>}
        </div>
        <div className="bg-emerald-500 text-white rounded-full h-8 w-8 flex items-center justify-center text-sm font-medium">
          {userInitials}
        </div>
      </div>
    </header>
  );
}
