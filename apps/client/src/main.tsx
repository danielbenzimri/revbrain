import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from './lib/query-client';
import './index.css';
import './i18n';
import App from './App.tsx';
import { initWebVitals } from './lib/web-vitals';

// ── Deferred initialization helper ─────────────────────────
// Uses requestIdleCallback with 1000ms fallback for Safari.
// 1000ms gives the main thread time to settle after first paint.
function idle(cb: () => void, opts?: { timeout?: number }) {
  if ('requestIdleCallback' in window) {
    requestIdleCallback(cb, opts);
  } else {
    setTimeout(cb, 1000);
  }
}

// ── Performance marks ──────────────────────────────────────
performance.mark('app-render-start');

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>
);

performance.mark('app-rendered');

// ── Deferred non-critical initialization ───────────────────
// Run after first paint to avoid competing with React's initial render
idle(
  () => {
    // Disable React DevTools instrumentation overhead in production
    if (import.meta.env.PROD && !window.location.search.includes('debug')) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const hook = (window as any).__REACT_DEVTOOLS_GLOBAL_HOOK__;
      if (hook) hook.inject = () => {};
    }

    // Future: Sentry initialization
    // When @sentry/react is installed, lazy-import and init here:
    // try {
    //   const Sentry = await import('@sentry/react');
    //   Sentry.init({ dsn: '...', environment: import.meta.env.MODE });
    // } catch {
    //   window.addEventListener('error', (e) => console.error('[Fallback]', e.error));
    // }

    // Collect Core Web Vitals (LCP, CLS, INP, TTFB, FCP)
    initWebVitals();

    performance.mark('init-complete');
    performance.measure('render-to-init', 'app-rendered', 'init-complete');
  },
  { timeout: 5000 }
);
