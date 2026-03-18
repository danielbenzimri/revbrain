# Performance Playbook: Hono + React + Supabase

**Created:** 2026-03-16
**Stack:** Hono (server) + React (client) + Supabase (auth/database) + Vite (bundler) + TanStack Query (data) + Zustand (state)
**Derived from:** RevBrain and Procure production optimizations

This is a generic, reusable playbook for optimizing applications built on the Hono + React + Supabase stack. It captures hard-won lessons from two production codebases — what works, what doesn't, and what causes regressions.

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Server Performance (Hono)](#server-performance-hono)
3. [Client Performance (React + Vite)](#client-performance-react--vite)
4. [Auth Performance (Supabase JWT)](#auth-performance-supabase-jwt)
5. [Data Layer (TanStack Query + Supabase)](#data-layer-tanstack-query--supabase)
6. [State Management (Zustand)](#state-management-zustand)
7. [Perceived Performance](#perceived-performance)
8. [Anti-Patterns to Avoid](#anti-patterns-to-avoid)
9. [Measurement & Regression Prevention](#measurement--regression-prevention)
10. [Checklist](#checklist)

---

## Architecture Overview

```
                                   ┌──────────────────┐
                                   │  Supabase Edge   │
                                   │  (Gateway)       │
                                   │  ──────────────  │
                                   │  JWT Verification│
                                   │  Rate Limiting   │
                                   │  CORS            │
                                   └────────┬─────────┘
                                            │
        ┌───────────────────────────────────┼───────────────────────────────┐
        │                                   │                               │
┌───────▼────────┐               ┌──────────▼──────────┐          ┌────────▼────────┐
│  React Client  │               │   Hono Server       │          │  Supabase DB    │
│  (Vite + SPA)  │◄─────────────►│   (Edge Function)   │◄────────►│  (PostgreSQL)   │
│  ────────────  │   fetch()     │   ────────────────  │  Drizzle │  ────────────── │
│  TanStack Query│               │   Middleware chain   │          │  Connection Pool│
│  Zustand       │               │   Route handlers     │          │  Indexes        │
│  React Router  │               │   Services           │          │  RLS            │
└────────────────┘               └─────────────────────┘          └─────────────────┘
```

**Key insight:** The Supabase gateway sits between client and server. It handles JWT verification, so the server doesn't need to re-verify. Understanding this architecture is critical for auth performance.

---

## Server Performance (Hono)

### Middleware Chain Optimization

Every middleware runs on every request. Minimize the chain and ensure correct ordering.

**Recommended middleware order:**

```typescript
// 1. Observability (lightweight, needed for all requests)
app.use('*', loggerMiddleware);

// 2. Compression (must run BEFORE anything that reads response body)
app.use('*', compress());

// 3. CORS (should short-circuit OPTIONS early)
app.use('*', cors({ origin: getAllowedOrigins(), credentials: true }));

// 4. Security headers (lightweight, static)
app.use('*', securityHeaders);

// 5. Timeouts (per-route, prevents hung requests)
app.use('/v1/*', timeout(30000));

// 6. Body limits (per-route, rejects oversized payloads early)
app.use('/v1/*', bodyLimit({ maxSize: '1mb' }));

// 7. Auth (per-route, skips public endpoints)
app.use('/v1/*', authMiddleware);

// 8. Rate limiting (per-route, after auth so we have user ID)
app.use('/v1/*', rateLimiter);

// 9. Cache headers (per-route, different TTLs per data volatility)
app.use('/v1/projects/*', cacheShort); // 15s — changes frequently
app.use('/v1/users/me', cacheLong); // 1h — rarely changes
app.use('/v1/plans', cacheStatic); // 24h — near-static
app.use('/v1/*', cacheDefault); // 60s — general fallback

// 10. Routes
app.route('/v1', v1Router);
```

**Rules:**

- **Do NOT add response-body-reading middleware globally.** Any middleware that calls `c.res.text()` or `c.res.json()` consumes the response stream and must rebuild it — this is expensive (500ms+ for large payloads).
- **Do NOT create service instances per-request** unless they hold request-specific state. Create once at module level or cache them.
- **Skip auth for health/public endpoints** — check the path before running auth logic.

### Tiered Cache Headers

Match cache duration to data volatility:

| Preset    | max-age  | stale-while-revalidate | Use Case                              |
| --------- | -------- | ---------------------- | ------------------------------------- |
| `noCache` | no-store | —                      | Auth endpoints, sensitive data        |
| `short`   | 15s      | 30s                    | Real-time data (tasks, notifications) |
| `default` | 60s      | 5min                   | Lists, detail pages                   |
| `long`    | 1h       | 4h                     | Org settings, user profiles           |
| `static`  | 24h      | 7d                     | Plans, enums, health endpoint         |

Always include `private` and `Vary: Authorization` for user-specific data.

### ETag Strategy

**Do NOT use body-based ETags.** Reading the response body to compute a hash (`await c.res.text()` + hash + `new Response(body)`) adds 500ms-2s per request. This was the single largest performance regression in production.

**If conditional GET is needed, use metadata-based ETags:**

```typescript
// DB timestamp-based ETag — no body reading
app.get('/v1/projects/:id', async (c) => {
  const ifNoneMatch = c.req.header('If-None-Match');
  const project = await getProject(id);
  const etag = `W/"project-${id}-${project.updatedAt.getTime()}"`;

  if (ifNoneMatch === etag) {
    return c.body(null, 304, { ETag: etag });
  }

  return c.json(project, 200, { ETag: etag });
});
```

**When ETags make sense:**

- Response payload > 10KB
- Data changes infrequently (> 1 minute between changes)
- Client actually sends `If-None-Match` (verify with DevTools)

**When ETags don't help:**

- SPAs using TanStack Query (client manages its own cache)
- Small payloads (< 5KB) — the overhead of conditional requests exceeds savings
- Real-time data with short cache TTLs

### Database Connection Pooling

```typescript
const pool = postgres(connectionString, {
  prepare: true, // Prepared statements — faster repeated queries
  max: 10, // Concurrent connections (tune to workload)
  ssl: 'require',
  idle_timeout: 20, // Close idle connections after 20s
  connect_timeout: 10, // Fail fast on connection issues
});
```

**Tuning:**

- Supabase Edge Functions: `max: 5-10` (limited resources per invocation)
- Dedicated server: `max: 20-50` (scale with CPU cores)
- Monitor for connection exhaustion — each new connection adds 500-1000ms cold start (TCP + SSL + PG auth)

---

## Client Performance (React + Vite)

### Route Chunk Prefetching

Lazy-loaded routes mean the user waits for a JS chunk download on every navigation. Prefetch cooperatively during idle time.

**Two-phase prefetch pattern:**

```typescript
// Phase 1: Data — fire immediately (async I/O, no CPU blocking)
startBackgroundDataPreload(queryClient, location.pathname);

// Phase 2: Chunks — defer 2s (JS parsing is CPU-bound)
setTimeout(() => startBackgroundPreload(), 2000);
```

**Implementation:**

```typescript
// route-prefetch.ts
export function startBackgroundPreload() {
  if (!shouldPrefetch()) return; // Skip on slow/metered connections

  const idle = window.requestIdleCallback || ((cb) => setTimeout(cb, 100));
  const pending = Object.entries(routeChunkMap).filter(([k]) => !prefetched.has(k));

  idle(
    (deadline) => {
      for (const [route, importer] of pending) {
        if (deadline.timeRemaining() < 5) {
          idle(continuePreload, { timeout: 10000 }); // Yield to browser
          return;
        }
        prefetched.add(route);
        importer().catch(() => prefetched.delete(route));
      }
    },
    { timeout: 10000 }
  );
}

export function startBackgroundDataPreload(queryClient, currentPath) {
  if (!shouldPrefetch()) return;
  for (const [path, prefetcher] of Object.entries(routeDataPrefetchMap)) {
    if (path !== currentPath) {
      prefetcher(queryClient); // React Query deduplicates
    }
  }
}
```

**Critical:** Data prefetch entries must use the **exact same queryKey** as the page's hooks. Mismatched keys = no cache hit = useless prefetch.

**Also add hover prefetch on navigation links:**

```typescript
// sidebar-link.tsx
const prefetchTimer = useRef<NodeJS.Timeout>();

const handleMouseEnter = () => {
  prefetchTimer.current = setTimeout(() => {
    prefetchRoute(href); // JS chunk
    prefetchRouteData(href, queryClient); // Data
  }, 100); // 100ms debounce to avoid prefetch on mouse-pass
};

const handleMouseLeave = () => clearTimeout(prefetchTimer.current);
```

### Vite Chunk Splitting

Vendor chunks should be split by update frequency:

```typescript
// vite.config.ts
manualChunks: {
  'react-vendor': ['react', 'react-dom', 'react-router-dom'],
  'query-vendor': ['@tanstack/react-query'],
  'ui-vendor': ['@radix-ui/*', 'class-variance-authority', 'clsx'],
  'form-vendor': ['react-hook-form', '@hookform/resolvers', 'zod'],
  'i18n-vendor': ['i18next', 'react-i18next'],
  // Domain-specific:
  'chart-vendor': ['recharts'],
  'geo-vendor': ['leaflet', 'three'],
}
```

This ensures React (changes rarely) doesn't invalidate the cache when your form library updates.

### List Virtualization

Any list with 50+ items should be virtualized. Use `@tanstack/react-virtual`:

```typescript
import { useVirtualizer } from '@tanstack/react-virtual';

function VirtualList({ items }) {
  const parentRef = useRef(null);
  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 48, // Row height in px
    overscan: 5,
  });

  return (
    <div ref={parentRef} style={{ height: '100%', overflow: 'auto' }}>
      <div style={{ height: virtualizer.getTotalSize() }}>
        {virtualizer.getVirtualItems().map((vi) => (
          <div key={vi.key} style={{
            position: 'absolute',
            top: vi.start,
            height: vi.size,
            width: '100%',
          }}>
            <ItemRow item={items[vi.index]} />
          </div>
        ))}
      </div>
    </div>
  );
}
```

### React.memo for List Items

Every component rendered inside a list should be memoized:

```typescript
const ItemRow = React.memo(function ItemRow({ item }: { item: Item }) {
  return <div>{item.name}</div>;
});
```

Ensure parent components pass stable references (use `useMemo` for computed objects/arrays passed as props).

### Deferred Initialization

Move non-critical initialization after first paint:

```typescript
// main.tsx
ReactDOM.createRoot(root).render(<App />);

// Then defer non-critical work
const idle = window.requestIdleCallback || ((cb) => setTimeout(cb, 100));
idle(() => {
  import('@sentry/react').then(Sentry => Sentry.init({ /* ... */ }));
}, { timeout: 5000 });
```

### Resource Hints

Add to `index.html`:

```html
<link rel="dns-prefetch" href="https://your-project.supabase.co" />
<link rel="preconnect" href="https://fonts.googleapis.com" crossorigin />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
```

### Disable React DevTools in Production

```typescript
// main.tsx — before createRoot
if (import.meta.env.PROD) {
  const hook = (window as any).__REACT_DEVTOOLS_GLOBAL_HOOK__;
  if (hook) hook.inject = () => {};
}
```

---

## Auth Performance (Supabase JWT)

### The Critical Insight

**On Supabase Edge Functions, the Supabase gateway already verifies JWT signatures before forwarding requests to your code.** Re-verifying is pure overhead.

### Server-Side JWT Strategy

```
┌──────────────────────────────────────────────────┐
│ 1. Decode JWT header → check algorithm           │
│    ↓                                             │
│ ┌─────────────────────┬────────────────────────┐ │
│ │ ES256 (Supabase)    │ HS256 (Custom/Legacy)  │ │
│ │ ──────────────────  │ ────────────────────── │ │
│ │ Decode only (~0ms)  │ Verify with secret     │ │
│ │ Check exp claim     │ (~5ms)                 │ │
│ └─────────────────────┴────────────────────────┘ │
│    ↓                                             │
│ 2. Check user cache (in-memory, 10-15min TTL)    │
│    ↓                                             │
│ 3. Cache miss → DB lookup (100-200ms)            │
│    ↓                                             │
│ 4. Last resort → supabase.auth.getUser() (1-2s)  │
│    WITH 3s timeout cap                           │
└──────────────────────────────────────────────────┘
```

**Implementation:**

```typescript
import { decode, verify } from 'hono/jwt';

// ES256 (current Supabase standard) — decode only
if (jwtHeader.alg === 'ES256') {
  const decoded = decode(token);
  payload = decoded.payload;
  if (payload.exp < Math.floor(Date.now() / 1000)) {
    throw new Error('Token expired');
  }
}

// HS256 (legacy/custom) — full verification
else if (jwtSecret) {
  payload = await verify(token, jwtSecret, 'HS256');
}

// No secret configured — remote fallback with timeout
else {
  payload = await verifyTokenRemotely(token); // 3s timeout
}
```

**User cache:**

```typescript
const USER_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const userCache = new Map<string, { user: User; expiresAt: number }>();

function getCachedUser(supabaseUserId: string): User | null {
  const entry = userCache.get(supabaseUserId);
  if (!entry || Date.now() > entry.expiresAt) return null;
  return entry.user;
}

// Clear cache on user update/delete for immediate consistency
export function clearUserCache(userId: string) {
  userCache.delete(userId);
}
```

### Client-Side Auth Strategy

**Cache the user in localStorage for instant render on return visits:**

```typescript
const USER_CACHE_KEY = 'app_user';

initialize: () => {
  // 1. Show cached user immediately (no spinner for returning users)
  const cached = localStorage.getItem(USER_CACHE_KEY);
  if (cached) {
    set({ user: JSON.parse(cached), isLoading: false });
  } else {
    set({ isLoading: true }); // Only show spinner for first-time users
  }

  // 2. Validate session in background
  adapter.getSession().then(async (session) => {
    if (session) {
      const user = await adapter.getCurrentUser();
      if (user) {
        localStorage.setItem(USER_CACHE_KEY, JSON.stringify(appUser));
        set({ user: appUser, isLoading: false });
        return;
      }
    }
    // Invalid session — clear and show login
    localStorage.removeItem(USER_CACHE_KEY);
    set({ user: null, isLoading: false });
  });
};
```

**Also optimize `getCurrentUser()`** — prefer the cached session user:

```typescript
async getCurrentUser(): Promise<AuthUser | null> {
  // Prefer cached session (localStorage, no network)
  const { data: { session } } = await supabase.auth.getSession();
  if (session?.user) return mapUser(session.user);

  // Fallback to network only if no cached session
  const { data: { user } } = await supabase.auth.getUser();
  return user ? mapUser(user) : null;
}
```

### Auth Token Cache for API Calls

Avoid reading `localStorage` on every API request:

```typescript
let _cachedToken: string | null = null;

export function invalidateAuthCache() {
  _cachedToken = null;
}

export async function getAuthToken(): Promise<string | null> {
  if (_cachedToken) return _cachedToken;

  const {
    data: { session },
  } = await supabase.auth.getSession();
  _cachedToken = session?.access_token ?? null;
  return _cachedToken;
}

// Clear on auth state change
supabase.auth.onAuthStateChange(() => invalidateAuthCache());
```

---

## Data Layer (TanStack Query + Supabase)

### Per-Query staleTime Tuning

Different data has different freshness needs:

| Data Type               | staleTime | gcTime | Rationale                  |
| ----------------------- | --------- | ------ | -------------------------- |
| Real-time (tasks, logs) | 30s       | 5min   | Changes frequently         |
| Lists (projects, users) | 60s       | 10min  | Moderate change rate       |
| Dashboard/stats         | 5min      | 30min  | Aggregated, changes slowly |
| Settings/profile        | 10min     | 30min  | Rarely changes             |
| Enums/constants         | 30min     | 1h     | Near-static                |

```typescript
// Example query with tuned timing
useQuery({
  queryKey: ['projects', 'list'],
  queryFn: fetchProjects,
  staleTime: 60 * 1000, // 60 seconds
  gcTime: 10 * 60 * 1000, // 10 minutes
});
```

### API Request Deduplication

TanStack Query deduplicates by queryKey. Ensure the same data always uses the same key:

```typescript
// GOOD: Consistent key — React Query deduplicates
const projectKeys = {
  all: ['projects'] as const,
  list: (filters?: Filters) => [...projectKeys.all, 'list', filters] as const,
  detail: (id: string) => [...projectKeys.all, 'detail', id] as const,
};

// BAD: Different key shapes for same data — double fetches
useQuery({ queryKey: ['projects'] }); // Component A
useQuery({ queryKey: ['project-list'] }); // Component B — NOT deduplicated!
```

### Optimistic Updates

For mutation-heavy UIs, use optimistic updates to eliminate perceived latency:

```typescript
useMutation({
  mutationFn: updateProject,
  onMutate: async (updated) => {
    await queryClient.cancelQueries({ queryKey: projectKeys.detail(updated.id) });
    const previous = queryClient.getQueryData(projectKeys.detail(updated.id));
    queryClient.setQueryData(projectKeys.detail(updated.id), updated);
    return { previous };
  },
  onError: (err, updated, context) => {
    queryClient.setQueryData(projectKeys.detail(updated.id), context?.previous);
  },
  onSettled: () => {
    queryClient.invalidateQueries({ queryKey: projectKeys.all });
  },
});
```

---

## State Management (Zustand)

### Use `useShallow` for All Multi-Property Selectors

Without `useShallow`, any store change triggers re-renders in all consumers:

```typescript
// BAD: Re-renders on ANY store change
const { user, isLoading } = useAuthStore((s) => ({
  user: s.user,
  isLoading: s.isLoading,
}));

// GOOD: Re-renders only when user or isLoading changes
import { useShallow } from 'zustand/shallow';
const { user, isLoading } = useAuthStore(
  useShallow((s) => ({
    user: s.user,
    isLoading: s.isLoading,
  }))
);

// BEST: Single-property selectors don't need useShallow
const user = useAuthStore((s) => s.user);
```

---

## Perceived Performance

### Composable Skeleton Library

Create skeletons that match real page layouts — not generic grey boxes:

```typescript
// Base building block
function Skeleton({ className }) {
  return <div className={cn('animate-pulse rounded-md bg-slate-200', className)} aria-hidden />;
}

// Composable primitives
function SkeletonKpi() { /* Label + big number + subtitle */ }
function SkeletonTable({ rows, cols }) { /* Header + N rows */ }
function SkeletonChart() { /* Title + bar chart shape */ }

// Page-specific compositions (used as Suspense fallbacks)
function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-8 w-48" />
      <div className="grid grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => <SkeletonKpi key={i} />)}
      </div>
      <SkeletonTable rows={5} cols={4} />
    </div>
  );
}
```

Wire into router as Suspense fallbacks:

```typescript
<Suspense fallback={<DashboardSkeleton />}>
  <DashboardPage />
</Suspense>
```

### Staggered Animations

Cascading fade-in creates a progressive-loading perception:

```css
@keyframes fadeInUp {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
.animate-fade-in-up {
  animation: fadeInUp 0.4s ease-out both;
}
.delay-50 {
  animation-delay: 50ms;
}
.delay-100 {
  animation-delay: 100ms;
}
.delay-200 {
  animation-delay: 200ms;
}
```

Apply to page sections:

- Header: 0ms
- KPI cards: 50ms
- Main content: 100ms
- Secondary content: 200ms

**Keep animations subtle** — 0.4s max, 8px translate. This is perceived performance, not decoration.

---

## Anti-Patterns to Avoid

### 1. Body-Based ETag Middleware

```typescript
// NEVER DO THIS — reads and rebuilds every response body
const body = await c.res.text();    // Consumes response stream
const etag = hash(body);            // CPU-intensive for large payloads
c.res = new Response(body, { ... }); // Rebuilds entire response
```

**Cost:** 500ms-2s per GET request. Caused 6-8 second API responses in production.

### 2. Full JWT Verification on Edge Functions

```typescript
// AVOID on Supabase Edge Functions — the gateway already verified it
const keys = await fetch(`${SUPABASE_URL}/auth/v1/.well-known/jwks.json`);
const payload = await verify(token, jwk, 'ES256'); // Unnecessary crypto

// DO THIS INSTEAD
const payload = decode(token).payload; // ~0ms, gateway already verified
```

### 3. Remote Auth Fallback Without Timeout

```typescript
// DANGEROUS — can hang for 30+ seconds
const { data } = await supabase.auth.getUser(token);

// SAFE — 3s timeout cap
const result = await Promise.race([
  supabase.auth.getUser(token),
  new Promise((_, reject) => setTimeout(() => reject(new Error('Auth timeout')), 3000)),
]);
```

### 4. Creating Service Instances Per-Request

```typescript
// BAD — constructor overhead on every request
app.use('*', async (c, next) => {
  c.set('services', {
    billing: new BillingService(), // New instance every time
    users: new UserService(),
  });
  await next();
});

// GOOD — create once, reuse
const services = { billing: new BillingService(), users: new UserService() };
app.use('*', async (c, next) => {
  c.set('services', services);
  await next();
});
```

### 5. Missing `shouldPrefetch()` Guard

Always check network conditions before prefetching:

```typescript
function shouldPrefetch(): boolean {
  const conn = (navigator as any).connection;
  if (conn?.saveData) return false;
  if (conn?.effectiveType === '2g' || conn?.effectiveType === 'slow-2g') return false;
  return true;
}
```

### 6. Prefetch QueryKey Mismatch

```typescript
// USELESS PREFETCH — key doesn't match the page's useQuery
queryClient.prefetchQuery({
  queryKey: ['projects'], // ← prefetch uses this key
  queryFn: fetchProjects,
});
// Page uses: queryKey: ['projects', 'list', undefined]  ← different key!

// CORRECT — keys must be identical
queryClient.prefetchQuery({
  queryKey: ['projects', 'list', undefined], // ← matches page exactly
  queryFn: fetchProjects,
});
```

---

## Measurement & Regression Prevention

### Core Web Vitals Targets

| Metric                                | Target  | Measurement          |
| ------------------------------------- | ------- | -------------------- |
| LCP (Largest Contentful Paint)        | < 2.5s  | `web-vitals` package |
| FID / INP (Interaction to Next Paint) | < 100ms | `web-vitals` package |
| CLS (Cumulative Layout Shift)         | < 0.1   | `web-vitals` package |
| TTFB (Time to First Byte)             | < 800ms | DevTools Network tab |
| Bundle size (main chunk)              | < 200KB | `size-limit` in CI   |
| DOM node count (list pages)           | < 1000  | E2E test assertion   |
| API response time (p95)               | < 500ms | Server-side logging  |

### CI Integration

```bash
# Bundle size budget
npx size-limit --json

# Lighthouse CI
npx lhci autorun --config=lighthouserc.json

# E2E performance assertions
npx playwright test e2e/performance/
```

### Performance Monitoring Checklist

1. Add `[PERF]` log markers in auth middleware to track which verification path is used
2. Log middleware chain timing (total request duration minus handler duration = middleware overhead)
3. Track cache hit rates (304 responses / total GET responses)
4. Monitor DB connection pool utilization
5. Set alerts for p95 response time > 1s

---

## Checklist

### Server (Hono)

- [ ] Middleware chain is minimal and correctly ordered
- [ ] No body-reading middleware applied globally
- [ ] Cache headers are tiered by data volatility
- [ ] Auth uses decode (not verify) for ES256 on Supabase Edge
- [ ] Remote auth fallback has timeout cap (3s)
- [ ] User cache in memory (10-15min TTL) with invalidation on update
- [ ] Database connection pool sized appropriately
- [ ] No service instances created per-request (unless holding request state)
- [ ] Rate limiting uses in-memory store (not DB lookups)
- [ ] Health endpoint skips auth

### Client (React)

- [ ] Route chunks prefetched during idle time (requestIdleCallback)
- [ ] Data prefetched on mount (not just on hover)
- [ ] Two-phase prefetch: data immediately, chunks deferred 2s
- [ ] All Zustand multi-property selectors use `useShallow`
- [ ] Lists with 50+ items are virtualized
- [ ] List item components wrapped in React.memo
- [ ] Route-specific skeleton components as Suspense fallbacks
- [ ] Staggered fade-in animations on key pages
- [ ] Non-critical init deferred (Sentry, analytics)
- [ ] React DevTools disabled in production
- [ ] DNS-prefetch for Supabase/API domains
- [ ] Auth token cached in memory (not reading localStorage per-request)
- [ ] User cached in localStorage for instant render on return
- [ ] Vite vendor chunks split by update frequency
- [ ] shouldPrefetch() checks network conditions

### Data Layer

- [ ] Per-query staleTime tuned to data volatility
- [ ] QueryKeys are consistent (factory pattern)
- [ ] Prefetch queryKeys match page queryKeys exactly
- [ ] Optimistic updates for mutation-heavy UIs

### Measurement

- [ ] Web Vitals collection enabled
- [ ] Bundle size budgets in CI
- [ ] E2E performance tests with assertions
- [ ] Server-side response time logging
- [ ] Performance regression alerts
