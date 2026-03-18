/**
 * Supabase Edge Function: API
 *
 * Pure Adapter Pattern - No business logic here.
 *
 * This file is the ONLY place that knows about Supabase Edge Functions.
 * All business logic lives in @revbrain/server (Hono app).
 *
 * This design allows us to redeploy the same Hono app to:
 * - AWS Lambda
 * - Docker containers
 * - Cloudflare Workers
 * - Any other runtime
 *
 * ...with ZERO code changes to the core application.
 */

/**
 * POLYFILL: Deno.core.runMicrotasks
 *
 * ROOT CAUSE:
 * Supabase Edge Runtime stubs Deno.core.runMicrotasks() to throw
 * "not supported in this environment". This is called by:
 *
 *   deno_std/node/_core.ts:23  →  core.runMicrotasks()
 *   deno_std/node/_next_tick.ts:50  →  processTicksAndRejections()
 *   deno_std/node/process.ts:288  →  beforeunload listener
 *
 * WHY PREVIOUS FIXES FAILED:
 * - Object.defineProperty / direct assignment: the property is non-writable
 *   AND non-configurable on the native Deno.core object. Both fail silently.
 * - addEventListener wrapper: fails if Supabase pre-loads process.ts before
 *   user code runs (listener already registered before our wrapper is set up).
 *
 * THE FIX — Proxy globalThis.Deno:
 * _core.ts captures: `const core = (globalThis as any).Deno?.core`
 * If we replace globalThis.Deno with a Proxy BEFORE _core.ts loads, then
 * `core` becomes our Proxy, and `core.runMicrotasks()` calls our no-op.
 * Dynamic import guarantees our patches run before @revbrain/server
 * (which transitively loads postgres.js → process.ts → _next_tick.ts → _core.ts).
 *
 * Layers:
 *  1. Proxy globalThis.Deno  →  .core.runMicrotasks returns () => {}
 *  2. Replace process.nextTick with queueMicrotask (belt-and-suspenders)
 *  3. Global error handler to swallow residual uncaught runMicrotasks errors
 *  4. Dynamic import so all patches are in place before postgres.js loads
 */

const _g = globalThis as any;

// ── Layer 1: Proxy globalThis.Deno ──────────────────────────────────────────
// When _core.ts does `const core = Deno?.core`, it gets our Proxy.
// All property accesses pass through except runMicrotasks → no-op.
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

// ── Layer 2: Replace process.nextTick with queueMicrotask ───────────────────
// Prevents postgres.js from adding items to the Node nextTick queue.
// queueMicrotask is natively supported in Supabase Edge Runtime.
try {
  if (typeof _g.process?.nextTick === 'function') {
    _g.process.nextTick = (fn: (...a: unknown[]) => void, ...args: unknown[]) => {
      queueMicrotask(() => fn(...args));
    };
  }
} catch {
  // ignore
}

// ── Layer 3: Global error handler ───────────────────────────────────────────
// Last-resort: if the error still propagates (e.g. Layer 1 failed because
// globalThis.Deno is non-configurable and _core.ts was pre-loaded by the
// runtime), intercept it before it becomes an UncaughtException log entry.
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

// ── Layer 4: Dynamic import ──────────────────────────────────────────────────
// Static imports are hoisted — they always execute before module body code.
// Dynamic import guarantees Layers 1-3 are active before @revbrain/server
// (and its transitive deps: postgres.js, deno_std/node/process.ts, _core.ts)
// are evaluated.
const { default: app } = await import('@revbrain/server');

// Deno.serve is the Supabase Edge Function entry point
Deno.serve(app.fetch);
