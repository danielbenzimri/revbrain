import {
  Server,
  HardDrive,
  Database,
  FolderOpen,
  Wifi,
  WifiOff,
  X,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useShallow } from 'zustand/shallow';
import { useServiceConfigStore, useAppMode, useIsOnline } from '@/stores/service-config-store';
import type { ServiceTarget } from '@/stores/service-config-store';
import { isDev } from '@/types/auth';
import { Button } from '@/components/ui/button';

interface ServiceTargetToggleProps {
  label: string;
  sublabelLocal: string;
  sublabelRemote: string;
  icon: React.ReactNode;
  target: ServiceTarget;
  onToggle: (target: ServiceTarget) => void;
}

function ServiceTargetToggle({
  label,
  sublabelLocal,
  sublabelRemote,
  icon,
  target,
  onToggle,
}: ServiceTargetToggleProps) {
  return (
    <div className="flex items-center justify-between py-2">
      <div className="flex items-center gap-2 text-sm">
        {icon}
        <div>
          <span className="font-medium">{label}</span>
          <p className="text-[10px] text-slate-400">
            {target === 'local' ? sublabelLocal : sublabelRemote}
          </p>
        </div>
      </div>
      <div className="flex gap-1">
        <button
          onClick={() => onToggle('local')}
          className={`px-2 py-1 text-xs rounded transition-colors ${
            target === 'local'
              ? 'bg-amber-500 text-white'
              : 'bg-gray-200 text-gray-600 hover:bg-gray-300'
          }`}
        >
          Local
        </button>
        <button
          onClick={() => onToggle('remote')}
          className={`px-2 py-1 text-xs rounded transition-colors ${
            target === 'remote'
              ? 'bg-blue-500 text-white'
              : 'bg-gray-200 text-gray-600 hover:bg-gray-300'
          }`}
        >
          Remote
        </button>
      </div>
    </div>
  );
}

export function ServicePanel() {
  const { i18n } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const mode = useAppMode();
  const isOnline = useIsOnline();
  const { targets, setMode, setServerTarget, setDatabaseTarget, setStorageTarget, setAllTargets } =
    useServiceConfigStore(
      useShallow((s) => ({
        targets: s.targets,
        setMode: s.setMode,
        setServerTarget: s.setServerTarget,
        setDatabaseTarget: s.setDatabaseTarget,
        setStorageTarget: s.setStorageTarget,
        setAllTargets: s.setAllTargets,
      }))
    );

  const isHebrew = i18n.language === 'he';

  // Only render in development
  if (!isDev) return null;

  // Count remote targets
  const remoteCount = Object.values(targets).filter((t) => t === 'remote').length;

  return (
    <>
      {/* Floating Toggle Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`fixed bottom-4 end-4 z-50 p-3 rounded-full shadow-lg transition-colors ${
          mode === 'offline'
            ? 'bg-slate-600 text-white hover:bg-slate-500'
            : 'bg-emerald-600 text-white hover:bg-emerald-500'
        }`}
        title="Service Config"
      >
        <div className="relative">
          {mode === 'offline' ? <WifiOff className="h-5 w-5" /> : <Wifi className="h-5 w-5" />}
          {isOnline && remoteCount > 0 && (
            <span className="absolute -top-1 -end-1 bg-blue-500 text-white text-[10px] rounded-full h-4 w-4 flex items-center justify-center">
              {remoteCount}
            </span>
          )}
        </div>
      </button>

      {/* Panel */}
      {isOpen && (
        <div className="fixed bottom-16 end-4 z-50 bg-white rounded-xl shadow-2xl border w-80 overflow-hidden">
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
          <div className="p-4 border-b">
            <div className="flex gap-2">
              <Button
                variant={mode === 'offline' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setMode('offline')}
                className={`flex-1 gap-2 ${mode === 'offline' ? 'bg-slate-600 hover:bg-slate-500' : ''}`}
              >
                <HardDrive className="h-4 w-4" />
                {isHebrew ? 'מקומי' : 'Local'}
              </Button>
              <Button
                variant={mode === 'online' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setMode('online')}
                className={`flex-1 gap-2 ${mode === 'online' ? 'bg-emerald-500 hover:bg-emerald-600' : ''}`}
              >
                <Server className="h-4 w-4" />
                {isHebrew ? 'שרת' : 'Server'}
              </Button>
            </div>
            <p className="text-xs text-slate-500 mt-2 text-center">
              {mode === 'offline'
                ? isHebrew
                  ? 'הכל נשמר ב-localStorage'
                  : 'Everything in localStorage'
                : isHebrew
                  ? 'משתמש בשירותי Backend'
                  : 'Using backend services'}
            </p>
          </div>

          {/* Advanced Options (only when online) */}
          {isOnline && (
            <>
              <button
                onClick={() => setShowAdvanced(!showAdvanced)}
                className="w-full px-4 py-2 flex items-center justify-between text-sm text-slate-600 hover:bg-slate-50"
              >
                <span>{isHebrew ? 'הגדרות מתקדמות' : 'Advanced Settings'}</span>
                {showAdvanced ? (
                  <ChevronUp className="h-4 w-4" />
                ) : (
                  <ChevronDown className="h-4 w-4" />
                )}
              </button>

              {showAdvanced && (
                <div className="px-4 pb-4 space-y-1 border-t">
                  <p className="text-[10px] text-slate-400 mt-2 mb-2">
                    {isHebrew
                      ? 'כל שירות יכול להיות מקומי או מרוחק'
                      : 'Each service can be local or remote'}
                  </p>

                  <ServiceTargetToggle
                    label={isHebrew ? 'שרת API' : 'API Server'}
                    sublabelLocal="Hono @ localhost:3000"
                    sublabelRemote="Supabase Edge Functions"
                    icon={<Server className="h-4 w-4 text-slate-500" />}
                    target={targets.server}
                    onToggle={setServerTarget}
                  />

                  <ServiceTargetToggle
                    label={isHebrew ? 'מסד נתונים' : 'Database'}
                    sublabelLocal="Docker Postgres"
                    sublabelRemote="Supabase Postgres"
                    icon={<Database className="h-4 w-4 text-slate-500" />}
                    target={targets.database}
                    onToggle={setDatabaseTarget}
                  />

                  <ServiceTargetToggle
                    label={isHebrew ? 'אחסון קבצים' : 'File Storage'}
                    sublabelLocal="Local Filesystem"
                    sublabelRemote="Supabase Storage"
                    icon={<FolderOpen className="h-4 w-4 text-slate-500" />}
                    target={targets.storage}
                    onToggle={setStorageTarget}
                  />

                  {/* Quick Actions */}
                  <div className="flex gap-2 pt-2 mt-2 border-t">
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1 text-xs h-7"
                      onClick={() => setAllTargets('local')}
                    >
                      All Local
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1 text-xs h-7"
                      onClick={() => setAllTargets('remote')}
                    >
                      All Remote
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}

          {/* Status Bar */}
          <div className="bg-slate-50 px-4 py-2 text-xs text-slate-500 text-center border-t">
            {isHebrew ? 'מצב פיתוח בלבד' : 'Dev Mode Only'}
          </div>
        </div>
      )}
    </>
  );
}
