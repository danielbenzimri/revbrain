import { Server, HardDrive, Wifi, WifiOff, X } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useServiceConfigStore, useAppMode } from '@/stores/service-config-store';
import { isDev } from '@/types/auth';
import { Button } from '@/components/ui/button';

export function ServicePanel() {
  const { i18n } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);

  const mode = useAppMode();
  const setMode = useServiceConfigStore((s) => s.setMode);

  const isHebrew = i18n.language === 'he';

  // Only render in development
  if (!isDev) return null;

  return (
    <>
      {/* Floating Toggle Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`fixed bottom-4 end-4 z-50 p-3 rounded-full shadow-lg transition-colors ${
          mode === 'offline'
            ? 'bg-slate-600 text-white hover:bg-slate-500'
            : 'bg-violet-600 text-white hover:bg-violet-500'
        }`}
        title="Service Config"
      >
        {mode === 'offline' ? <WifiOff className="h-5 w-5" /> : <Wifi className="h-5 w-5" />}
      </button>

      {/* Panel */}
      {isOpen && (
        <div className="fixed bottom-16 end-4 z-50 bg-white rounded-xl shadow-2xl border border-slate-200 w-80 overflow-hidden">
          {/* Header */}
          <div className="bg-slate-800 text-white px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Server className="h-4 w-4" />
              <span className="font-medium text-sm">{isHebrew ? 'מצב מערכת' : 'System Mode'}</span>
            </div>
            <button onClick={() => setIsOpen(false)} className="hover:text-gray-300">
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Main Mode Toggle */}
          <div className="p-4">
            <div className="flex gap-2">
              <Button
                variant={mode === 'offline' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setMode('offline')}
                className={`flex-1 gap-2 ${mode === 'offline' ? 'bg-slate-600 hover:bg-slate-500' : ''}`}
              >
                <HardDrive className="h-4 w-4" />
                {isHebrew ? 'מקומי' : 'Offline'}
              </Button>
              <Button
                variant={mode === 'online' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setMode('online')}
                className={`flex-1 gap-2 ${mode === 'online' ? 'bg-violet-500 hover:bg-violet-600' : ''}`}
              >
                <Server className="h-4 w-4" />
                {isHebrew ? 'שרת' : 'Online'}
              </Button>
            </div>
            <p className="text-xs text-slate-500 mt-2 text-center">
              {mode === 'offline'
                ? isHebrew
                  ? 'הכל נשמר ב-localStorage'
                  : 'Mock mode — everything in localStorage'
                : isHebrew
                  ? 'משתמש בשירותי Backend'
                  : 'Using backend services'}
            </p>
          </div>

          {/* Status Bar */}
          <div className="bg-slate-50 px-4 py-2 text-xs text-slate-500 text-center border-t border-slate-200">
            {isHebrew ? 'מצב פיתוח בלבד' : 'Dev Mode Only'}
          </div>
        </div>
      )}
    </>
  );
}
