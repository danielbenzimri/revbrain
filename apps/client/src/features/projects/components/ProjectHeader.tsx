/**
 * Project Header
 *
 * Header for project workspace with mobile menu and user info
 */
import { Menu, Globe, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { ProjectSidebar } from './ProjectSidebar';
import { useTranslation } from 'react-i18next';
import { useUser } from '@/stores/auth-store';
import { ROLE_DISPLAY_NAMES } from '@/types/auth';
import type { ProjectEntity } from '../hooks/use-project-api';

interface ProjectHeaderProps {
  project: ProjectEntity;
  onBackToProjects: () => void;
}

export function ProjectHeader({ project, onBackToProjects }: ProjectHeaderProps) {
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
    <header className="flex h-14 items-center gap-4 border-b bg-white px-4 md:px-6 lg:h-[60px] sticky top-0 z-10 shadow-sm">
      {/* Mobile Menu */}
      <Sheet>
        <SheetTrigger asChild>
          <Button variant="ghost" size="icon" className="md:hidden">
            <Menu className="h-5 w-5" />
            <span className="sr-only">Toggle menu</span>
          </Button>
        </SheetTrigger>
        <SheetContent side={isHebrew ? 'right' : 'left'} className="p-0 border-none w-64 pt-0">
          <ProjectSidebar project={project} className="border-none w-full" />
        </SheetContent>
      </Sheet>

      {/* Back Button (Mobile) */}
      <Button variant="ghost" size="sm" onClick={onBackToProjects} className="md:hidden">
        <ArrowLeft className="h-4 w-4" />
      </Button>

      {/* Project Name (Mobile) */}
      <div className="flex-1 md:hidden">
        <span className="font-semibold text-slate-900 truncate text-sm">{project.name}</span>
      </div>

      {/* Spacer (Desktop) */}
      <div className="flex-1 hidden md:block" />

      {/* Language Toggle */}
      <Button
        variant="outline"
        size="sm"
        onClick={toggleLanguage}
        className="flex items-center gap-2"
      >
        <Globe className="h-4 w-4" />
        <span className="font-medium">{isHebrew ? 'EN' : 'עב'}</span>
      </Button>

      {/* User Avatar */}
      <div className="hidden md:flex items-center gap-2">
        <div className="text-end">
          <p className="text-sm font-medium">{userName}</p>
          {userRole && <p className="text-xs text-slate-500">{userRole}</p>}
        </div>
        <div className="bg-emerald-100 text-emerald-700 rounded-full h-8 w-8 flex items-center justify-center text-sm font-medium">
          {userInitials}
        </div>
      </div>
    </header>
  );
}
