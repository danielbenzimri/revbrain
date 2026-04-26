/**
 * Supabase Edge Function: Demo API
 *
 * Identical to the main `api` function but forces mock mode.
 * No database, no auth, no secrets — serves seed data only.
 * Used for external partner/SI reviews at demo.revbrain.ai.
 *
 * NOTE: Deno.env.set() is blocked in Supabase Edge Runtime,
 * so we set process.env directly (Node compat polyfill).
 */

// ── Polyfills (same as api/index.ts) ─────────────────────────────────────────
// See api/index.ts for detailed explanation of each layer.

const _g = globalThis as any;

// Force mock mode BEFORE importing the server.
// Supabase Edge Runtime blocks both Deno.env.set() and process.env assignment.
// Secrets are project-wide (shared with the real api function).
// Solution: globalThis.__envOverrides — checked first by getEnv(), isMockMode(),
// and validateMockModeConfig() in the server.
_g.__envOverrides = {
  USE_MOCK_DATA: 'true',
  AUTH_MODE: 'mock',
  APP_MODE: 'demo',
  NODE_ENV: 'development',
  VITE_AUTH_MODE: 'mock',
};

// Layer 1: Proxy globalThis.Deno — intercept runMicrotasks
try {
  const _origDeno = _g.Deno;
  if (_origDeno?.core) {
    const _patchedCore = new Proxy(_origDeno.core, {
      get(target, prop, receiver) {
        if (prop === 'runMicrotasks') return () => {};
        return Reflect.get(target, prop, receiver);
      },
    });
    const _patchedDeno = new Proxy(_origDeno, {
      get(target, prop, receiver) {
        if (prop === 'core') return _patchedCore;
        return Reflect.get(target, prop, receiver);
      },
    });
    try {
      _g.Deno = _patchedDeno;
    } catch {
      try {
        Object.defineProperty(_g, 'Deno', {
          value: _patchedDeno,
          writable: true,
          configurable: true,
        });
      } catch {
        // globalThis.Deno is non-configurable — Layer 2 & 3 still apply
      }
    }
  }
} catch {
  // ignore
}

// Layer 2: Replace process.nextTick with queueMicrotask
try {
  if (typeof _g.process?.nextTick === 'function') {
    _g.process.nextTick = (fn: (...a: unknown[]) => void, ...args: unknown[]) => {
      queueMicrotask(() => fn(...args));
    };
  }
} catch {
  // ignore
}

// Layer 3: Global error handler for residual runMicrotasks errors
try {
  _g.addEventListener?.(
    'error',
    (e: ErrorEvent) => {
      if (
        e?.message?.includes('runMicrotasks') ||
        (e?.error as Error)?.message?.includes('runMicrotasks')
      ) {
        e.preventDefault?.();
      }
    },
    { capture: true }
  );
} catch {
  // ignore
}

// Layer 4: Dynamic import — patches are active before server loads
const { default: app } = await import('@revbrain/server');

// Supabase Edge Functions pass the function name as the first path segment.
// The main `api` function gets paths like `/api/v1/plans` which matches the
// server's route mounts. For `demo-api`, paths arrive as `/demo-api/v1/plans`.
// Rewrite to `/api/v1/...` so the server's existing routes match.
Deno.serve((req: Request) => {
  const url = new URL(req.url);
  if (url.pathname.startsWith('/demo-api')) {
    url.pathname = '/api' + url.pathname.slice('/demo-api'.length);
    return app.fetch(new Request(url.toString(), req));
  }
  return app.fetch(req);
});
