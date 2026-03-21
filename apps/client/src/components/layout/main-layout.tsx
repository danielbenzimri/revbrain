import { useEffect, useRef } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Sidebar } from './sidebar';
import { Header } from './header';
import { useTranslation } from 'react-i18next';
import { ServicePanel } from '@/components/dev/service-panel';
import { ErrorBoundary } from '@/components/error-boundary';
import { ImpersonationBanner } from './ImpersonationBanner';
import { startBackgroundPreload, startBackgroundDataPreload } from '@/lib/route-prefetch';

export default function MainLayout() {
  const { i18n } = useTranslation();
  const isRTL = i18n.language === 'he';
  const queryClient = useQueryClient();
  const location = useLocation();
  const initialPathRef = useRef(location.pathname);

  useEffect(() => {
    // Data: fire immediately — async I/O, no main thread blocking
    startBackgroundDataPreload(queryClient, initialPathRef.current);
    // Chunks: defer 2s — JS parsing is CPU-bound
    const timer = setTimeout(startBackgroundPreload, 2000);
    return () => clearTimeout(timer);
  }, [queryClient]);

  return (
    <div className="flex flex-col h-screen w-full bg-slate-100" dir={isRTL ? 'rtl' : 'ltr'}>
      <ImpersonationBanner />
      <div className="flex flex-1 overflow-hidden">
        {/* Desktop Sidebar (hidden on mobile) */}
        <Sidebar className="hidden md:flex" />

        <div className="flex flex-col flex-1 overflow-hidden">
          <Header />
          <main className="flex-1 overflow-y-auto p-4 md:p-6">
            {/* Page-level error boundary - catches errors in individual pages without crashing the whole app */}
            <ErrorBoundary>
              <Outlet />
            </ErrorBoundary>
          </main>
        </div>

        {/* Dev Mode: Service Config Panel */}
        <ServicePanel />
      </div>
    </div>
  );
}
