/* eslint-disable @typescript-eslint/no-explicit-any */
import { createContext, useContext, useState, useCallback, useRef } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';

// ── Types ─────────────────────────────────────────────────────────────────────

type DialogType = 'alert' | 'confirm' | 'prompt';

interface DialogState {
  type: DialogType;
  title?: string;
  message: string;
  defaultValue?: string;
  inputLabel?: string;
}

interface AppDialogApi {
  alert: (message: string, title?: string) => Promise<void>;
  confirm: (message: string, title?: string) => Promise<boolean>;
  prompt: (message: string, defaultValue?: string, title?: string) => Promise<string | null>;
}

const AppDialogContext = createContext<AppDialogApi | null>(null);

export function useAppDialog(): AppDialogApi {
  const ctx = useContext(AppDialogContext);
  if (!ctx) throw new Error('useAppDialog must be used within AppDialogProvider');
  return ctx;
}

// ── Provider ──────────────────────────────────────────────────────────────────

export function AppDialogProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<DialogState>({ type: 'alert', message: '' });
  const [inputValue, setInputValue] = useState('');
  const resolveRef = useRef<((value: any) => void) | null>(null);

  const cleanup = useCallback(() => {
    setOpen(false);
    resolveRef.current = null;
  }, []);

  const alert = useCallback(
    (message: string, title?: string): Promise<void> =>
      new Promise((resolve) => {
        resolveRef.current = resolve;
        setState({ type: 'alert', message, title });
        setOpen(true);
      }),
    []
  );

  const confirm = useCallback(
    (message: string, title?: string): Promise<boolean> =>
      new Promise((resolve) => {
        resolveRef.current = resolve;
        setState({ type: 'confirm', message, title });
        setOpen(true);
      }),
    []
  );

  const prompt = useCallback(
    (message: string, defaultValue?: string, title?: string): Promise<string | null> =>
      new Promise((resolve) => {
        resolveRef.current = resolve;
        setInputValue(defaultValue ?? '');
        setState({ type: 'prompt', message, title, defaultValue });
        setOpen(true);
      }),
    []
  );

  const handleOk = useCallback(() => {
    if (state.type === 'alert') resolveRef.current?.(undefined);
    else if (state.type === 'confirm') resolveRef.current?.(true);
    else if (state.type === 'prompt') resolveRef.current?.(inputValue);
    cleanup();
  }, [state.type, inputValue, cleanup]);

  const handleCancel = useCallback(() => {
    if (state.type === 'confirm') resolveRef.current?.(false);
    else if (state.type === 'prompt') resolveRef.current?.(null);
    else resolveRef.current?.(undefined);
    cleanup();
  }, [state.type, cleanup]);

  const api: AppDialogApi = { alert, confirm, prompt };

  const isDestructive = state.title === 'מחיקה' || state.title === 'delete';

  return (
    <AppDialogContext.Provider value={api}>
      {children}
      <Dialog
        open={open}
        onOpenChange={(v) => {
          if (!v) handleCancel();
        }}
      >
        <DialogContent className="max-w-sm" dir="rtl">
          <DialogHeader className="flex flex-col items-center text-center gap-3 pt-2">
            {isDestructive && (
              <div className="w-14 h-14 rounded-full bg-red-100 flex items-center justify-center">
                <svg
                  width="28"
                  height="28"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#ef4444"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                  <line x1="10" y1="11" x2="10" y2="17" />
                  <line x1="14" y1="11" x2="14" y2="17" />
                </svg>
              </div>
            )}
            <DialogTitle className={isDestructive ? 'text-lg font-bold text-slate-800' : ''}>
              {state.title || 'הודעה'}
            </DialogTitle>
            <DialogDescription className="whitespace-pre-wrap text-center text-sm text-slate-500">
              {state.message}
            </DialogDescription>
          </DialogHeader>

          {state.type === 'prompt' && (
            <input
              autoFocus
              className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleOk();
              }}
              dir="rtl"
            />
          )}

          <DialogFooter className="flex gap-3 sm:justify-center pt-2">
            {state.type !== 'alert' && (
              <button
                onClick={handleCancel}
                className="flex-1 px-4 py-2.5 bg-slate-100 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-200 transition-colors"
              >
                ביטול
              </button>
            )}
            <button
              onClick={handleOk}
              className={`flex-1 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isDestructive
                  ? 'bg-red-500 text-white hover:bg-red-600'
                  : 'bg-violet-600 text-white hover:bg-violet-700'
              }`}
            >
              {isDestructive ? 'מחק' : 'אישור'}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppDialogContext.Provider>
  );
}
