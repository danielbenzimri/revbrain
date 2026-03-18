# RevBrain Performance Speedup Roadmap

**Date:** 2026-03-15
**Benchmark:** Procure project (same architecture, 10x faster after optimizations)
**Goal:** Match Procure's perceived and actual performance

---

## Executive Summary

RevBrain has a **solid foundation** (route-level code splitting, React Query, server compression, database indexes) but is missing **critical runtime optimizations** that make Procure feel instant. The biggest gaps are: no list virtualization, no Zustand shallow equality, monolithic components blocking lazy loading, no route chunk prefetching, no ETag support, and no idle-time initialization.

**Estimated overall improvement: 3-5x perceived speed** when all items are implemented.

---

## Analysis: Procure vs RevBrain

### What RevBrain Already Has (No Action Needed)

| Optimization                   | RevBrain                    | Procure                      | Status              |
| ------------------------------ | ---------------------------- | ---------------------------- | ------------------- |
| Vite vendor chunk splitting    | 7 chunks                     | 5 chunks                     | **RevBrain ahead** |
| Route-level React.lazy         | 25+ pages                    | 35+ pages                    | **On par**          |
| React Query config             | staleTime 2min, gcTime 10min | staleTime 5min, gcTime 30min | **On par**          |
| Server gzip/brotli compression | Hono compress()              | Hono compress()              | **On par**          |
| HTTP cache headers             | 60s + stale-while-revalidate | Tiered (15s to 24h)          | **Partial**         |
| Database indexes               | 15+ indexes                  | 11 indexes                   | **RevBrain ahead** |
| Connection pooling             | max: 10, idle: 20s           | max: 5, idle: 20s            | **RevBrain ahead** |
| Rate limiting                  | 8 limiters                   | 9 limiters                   | **On par**          |
| useMemo/useCallback            | 97/134 files                 | 85+ files                    | **On par**          |
| Debouncing                     | 19 files                     | useDebouncedValue hook       | **On par**          |
| TypeScript incremental         | tsc -b + .tsbuildinfo        | tsc -b                       | **On par**          |
| Turbo build caching            | Configured                   | Configured                   | **On par**          |
| Font preconnect                | Google Fonts                 | Google Fonts + CDNs          | **Partial**         |
| Sentry deferred                | Dynamic import               | requestIdleCallback          | **Partial**         |
| Tailwind purging               | v4 auto-purge                | v4 content-based             | **On par**          |

### What RevBrain Is Missing (Action Required)

| Optimization                   | Procure                                   | RevBrain                     | Impact                                   |
| ------------------------------ | ----------------------------------------- | ----------------------------- | ---------------------------------------- |
| List virtualization            | Custom useVirtualization + useVirtualGrid | **None**                      | **Critical**                             |
| Zustand useShallow             | All selectors                             | **None**                      | **High**                                 |
| Route chunk prefetching        | Full prefetch system (6 routes)           | **None**                      | **High**                                 |
| Background data preloading     | startBackgroundDataPreload()              | Hover-only prefetch           | **High**                                 |
| ETag middleware                | FNV-1a hash, 304 responses                | **None**                      | **Medium**                               |
| Tiered cache headers           | 7 presets (15s to immutable)              | Single 60s policy             | **Medium**                               |
| requestIdleCallback            | Sentry, analytics, chunk loading          | **None**                      | **Medium**                               |
| React.memo coverage            | Broad                                     | 9 files only                  | **Medium**                               |
| Component code splitting       | Lazy tabs, lazy sub-views                 | Monolithic views (19K+ lines) | **Critical**                             |
| Infinite scroll                | useInfiniteScroll + IntersectionObserver  | **None**                      | **Medium**                               |
| useShallow selectors           | All Zustand consumers                     | **None**                      | **High**                                 |
| Disable React DevTools in prod | window.**REACT_DEVTOOLS_GLOBAL_HOOK**     | **None**                      | **Low**                                  |
| In-memory auth token cache     | \_cachedToken avoids localStorage         | **None**                      | **Low**                                  |
| DNS-prefetch                   | Supabase domain                           | **None**                      | **Low**                                  |
| Dev-only Zod validation        | Skip in prod                              | Always validates              | **Low**                                  |
| Lazy tab pattern               | Default tab eager, rest lazy              | All tabs loaded               | **Medium**                               |
| Web Workers                    | Not in Procure either                     | **None**                      | **Medium** (RevBrain-specific: DXF, 3D) |

---

## Roadmap: Ordered by Impact

### Phase 1: Quick Wins (1-2 days, highest ROI)

#### 1.1 Add useShallow to All Zustand Selectors

**Impact:** High | **Effort:** 30 min | **Perceived speedup:** 20-30%

**Problem:** Every component consuming Zustand re-renders on ANY state change, even unrelated fields. RevBrain has auth-store, sidebar-store, and service-config-store — all missing shallow equality.

**What Procure does:** Every selector uses `useShallow` from `zustand/shallow`:

```typescript
// Procure pattern
const { isCollapsed } = useSidebarStore(useShallow((s) => ({ isCollapsed: s.isCollapsed })));
```

**What RevBrain does:** Direct selectors without shallow comparison:

```typescript
// Current RevBrain pattern — re-renders on ANY store change
const isCollapsed = useSidebarStore((s) => s.isCollapsed);
```

**Task:** Add `useShallow` wrapper to all store selector hooks across:

- `apps/client/src/stores/auth-store.ts`
- `apps/client/src/stores/sidebar-store.ts`
- `apps/client/src/stores/service-config-store.ts`
- All consuming components

---

#### 1.2 Disable React DevTools in Production

**Impact:** Low | **Effort:** 5 min | **Perceived speedup:** 5-10%

**Problem:** React DevTools hook adds instrumentation overhead to every component render in production.

**What Procure does:**

```typescript
// main.tsx
if (import.meta.env.PROD) {
  const hook = window.__REACT_DEVTOOLS_GLOBAL_HOOK__;
  if (hook) hook.inject = () => {};
}
```

**Task:** Add the above snippet to `apps/client/src/main.tsx` before `ReactDOM.createRoot()`.

---

#### 1.3 Cache Auth Token in Memory

**Impact:** Low | **Effort:** 15 min | **Perceived speedup:** 5% on every API call

**Problem:** Every API request reads auth token from localStorage (synchronous I/O). With hundreds of requests per session, this adds up.

**What Procure does:** Caches token in module-level variable, invalidates on auth state change:

```typescript
let _cachedToken: string | null = null;
export function invalidateAuthCache() {
  _cachedToken = null;
}
// On every API call: use _cachedToken || read from storage
```

**Task:** Add in-memory token cache to `apps/client/src/lib/api.ts` or equivalent API client.

---

#### 1.4 Add DNS-Prefetch and Additional Preconnects

**Impact:** Low | **Effort:** 10 min | **Perceived speedup:** 100-300ms on first load

**Problem:** RevBrain only preconnects to Google Fonts. Missing DNS prefetch for API/Supabase domains.

**What Procure does:**

```html
<link rel="dns-prefetch" href="https://supabase.co" />
<link rel="preconnect" href="https://fonts.googleapis.com" crossorigin />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link rel="preconnect" href="https://images.unsplash.com" />
```

**Task:** Add dns-prefetch for Supabase/API domain in `apps/client/index.html`.

---

### Phase 2: Core Performance (3-5 days, transformative)

#### 2.1 Implement List Virtualization

**Impact:** Critical | **Effort:** 1-2 days | **Perceived speedup:** 5-10x on large lists

**Problem:** All list views render every DOM node. A project with 200 tasks renders 200 TaskCard components. A BOQ with 500 items renders 500 rows. This causes:

- Slow initial render (500ms+ for large lists)
- Janky scrolling
- High memory usage
- Slow re-renders on state change

**What Procure does:** Custom `useVirtualization` hook with:

- Binary search for visible range calculation
- Overscan buffer (3 items)
- Variable-height item support
- `scrollToIndex()` / `scrollToOffset()`
- ResizeObserver for container measurements
- Companion `useVirtualGrid` for 2D layouts

**Target components in RevBrain:**

1. **TaskListView** — task list in project workspace
2. **BOQ item lists** — bill of quantities rows
3. **Bill lists** — measurement bills
4. **Execution/WorkLog lists** — work log entries
5. **User management tables** — admin user lists
6. **Audit log viewer** — log entries
7. **Any table with 50+ rows**

**Approach:** Install `@tanstack/react-virtual` (lighter than react-virtuoso, tree-shakeable) and create a `useVirtualList` hook. Apply to all list views above.

---

#### 2.2 Route Chunk Prefetching System

**Impact:** High | **Effort:** 1 day | **Perceived speedup:** Instant navigation (0ms perceived)

**Problem:** When navigating between routes, the user waits for the lazy chunk to download. On slow connections this can be 500ms-2s.

**What Procure does:** Comprehensive 3-layer prefetch system:

1. **Hover prefetch:** On nav link hover, preload the route chunk + data
2. **Background chunk preload:** After initial page load, use `requestIdleCallback` to preload all major route chunks cooperatively (yields when `deadline.timeRemaining() < 5ms`)
3. **Background data preload:** After auth, prefetch data for 6 major routes in parallel

```typescript
// Procure prefetch.ts (simplified)
const routeChunkMap = {
  '/dashboard': () => import('./features/dashboard/DashboardPage'),
  '/suppliers': () => import('./features/suppliers/SuppliersPage'),
  // ... 20+ routes
};

export function startBackgroundPreload() {
  requestIdleCallback(
    (deadline) => {
      for (const [route, importer] of pendingChunks) {
        if (deadline.timeRemaining() < 5) {
          requestIdleCallback(continuePreload); // yield to browser
          return;
        }
        importer(); // triggers Vite chunk download
        prefetched.add(route);
      }
    },
    { timeout: 10000 }
  );
}
```

**Task:** Create `apps/client/src/lib/prefetch.ts` with:

1. Route-to-chunk map matching `router.tsx`
2. `prefetchRoute(path)` — called on link hover
3. `startBackgroundPreload()` — called after initial render via requestIdleCallback
4. `startBackgroundDataPreload(queryClient)` — prefetch data for top routes
5. Wire hover handlers into sidebar navigation components

---

#### 2.3 Split Monolithic Components

**Impact:** Critical | **Effort:** 2-3 days | **Perceived speedup:** 40-60% faster module loads

**Problem:** Several components are enormous monoliths that cannot be lazy-loaded in parts:

| Component                | Lines      | Size             |
| ------------------------ | ---------- | ---------------- |
| WallDashboard (drainage) | 19,816     | ~400KB source    |
| LandscapingViewComponent | 18,116     | ~360KB source    |
| PavingViewComponent      | 12,567     | ~250KB source    |
| Viewer3D components      | 9,450+     | ~190KB source    |
| PrintSketches (4 copies) | 6,700 each | ~27KB duplicated |
| LeafletDxfViewer         | —          | 217KB bundle     |

**What Procure does:** Lazy tab pattern — default tab is loaded eagerly, additional tabs load on first click:

```typescript
const OverviewTab = () => <Overview />;  // Loaded eagerly
const ContractsTab = lazy(() => import('./tabs/ContractsTab'));  // Lazy
const OrdersTab = lazy(() => import('./tabs/OrdersTab'));  // Lazy
```

**Task:**

1. Split WallDashboard into: `WallOverview` + `WallEditor` + `WallCalculator` (lazy)
2. Split LandscapingViewComponent into: `LandscapingOverview` + `LandscapingEditor` + `LandscapingAnnotator` (lazy)
3. Split PavingViewComponent into: `PavingOverview` + `PavingEditor` (lazy)
4. Deduplicate PrintSketches (extract shared component, delete 3 copies)
5. Lazy-load Viewer3D only when 3D tab is opened
6. Break LeafletDxfViewer into core + plugins

---

#### 2.4 Expand React.memo Coverage

**Impact:** Medium | **Effort:** 1 day | **Perceived speedup:** 25-35% fewer re-renders

**Problem:** Only 9 files use React.memo. List item components re-render when parent state changes even if their props haven't changed.

**What Procure does:** Extensive memo usage on all list items, cards, and repeated components.

**Target components:**

1. **ProjectCard** — re-renders when sibling projects change
2. **BOQRow / BOQItemCard** — re-renders on any BOQ state change
3. **BillCard / BillRow** — re-renders on bill list changes
4. **ExecutionCard** — re-renders on execution list changes
5. **UserRow** — re-renders on user list changes
6. **AuditLogEntry** — re-renders on log list changes
7. **SidebarNavItem** — re-renders on route change
8. **DashboardStatCard** — re-renders on any dashboard state
9. **All table row components** — critical for large tables
10. **ModuleCard** — re-renders on module list changes

**Task:** Wrap 20+ high-traffic components with `React.memo()`. For components receiving object/array props, ensure parent uses `useMemo` on those props.

---

### Phase 3: Server & Network (2-3 days)

#### 3.1 Add ETag Middleware

**Impact:** Medium | **Effort:** 4 hours | **Perceived speedup:** 30-50% less data transfer

**Problem:** Every GET response sends the full payload even when data hasn't changed. For list endpoints returning 10-50KB, this wastes bandwidth and parsing time.

**What Procure does:** FNV-1a hash-based ETag middleware:

```typescript
// Fast non-cryptographic hash
function fnv1a(str: string): string {
  let hash = 2166136261;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = (hash * 16777619) >>> 0;
  }
  return hash.toString(36);
}

// Middleware
app.use('*', async (c, next) => {
  await next();
  if (c.req.method !== 'GET') return;
  const body = await c.res.text();
  const etag = `"${fnv1a(body)}"`;
  if (c.req.header('If-None-Match') === etag) {
    return c.body(null, 304);
  }
  c.header('ETag', etag);
});
```

**Task:** Create `apps/server/src/middleware/etag.ts` with FNV-1a ETag generation. Apply to GET routes.

---

#### 3.2 Implement Tiered Cache Headers

**Impact:** Medium | **Effort:** 2 hours | **Perceived speedup:** Faster repeat visits

**Problem:** RevBrain has a single 60s cache policy for all GET requests. Different data has different volatility.

**What Procure does:** 7 cache presets applied per-route:

| Preset      | max-age  | stale-while-revalidate | Use Case                              |
| ----------- | -------- | ---------------------- | ------------------------------------- |
| shortCache  | 15s      | 30s                    | Real-time data (tasks, notifications) |
| cache       | 60s      | 5min                   | Default (lists, details)              |
| longCache   | 1 hour   | 4 hours                | Semi-static (org settings, plans)     |
| staticCache | 24 hours | 7 days                 | Enums, categories, constants          |
| noCache     | no-store | —                      | Auth, user profile                    |
| immutable   | 1 year   | —                      | Versioned assets                      |

**Task:** Expand `apps/server/src/middleware/cache.ts` with tiered presets. Apply per-route:

- `/v1/auth/*` → noCache
- `/v1/projects` → shortCache (15s)
- `/v1/organizations/settings` → longCache (1 hour)
- `/v1/plans`, `/v1/enums` → staticCache (24 hours)

---

#### 3.3 Add Missing Database Indexes

**Impact:** Medium | **Effort:** 1 hour | **Perceived speedup:** 20-40% faster queries

**Problem:** Several high-traffic tables lack proper indexes for common query patterns.

**Task:** Create migration `0030_performance_indexes.sql`:

```sql
-- Tasks (most queried table)
CREATE INDEX CONCURRENTLY idx_tasks_project_status ON tasks(project_id, status);
CREATE INDEX CONCURRENTLY idx_tasks_project_created ON tasks(project_id, created_at DESC);
CREATE INDEX CONCURRENTLY idx_tasks_assignee ON tasks(assigned_to, status) WHERE status != 'completed';

-- Bills
CREATE INDEX CONCURRENTLY idx_bills_project_created ON bills(project_id, created_at DESC);
CREATE INDEX CONCURRENTLY idx_bills_project_status ON bills(project_id, status);

-- BOQ Items
CREATE INDEX CONCURRENTLY idx_boq_items_project ON boq_items(project_id, category);

-- Work Logs
CREATE INDEX CONCURRENTLY idx_work_logs_project_date ON work_logs(project_id, date DESC);
CREATE INDEX CONCURRENTLY idx_work_logs_user ON work_logs(user_id, date DESC);
```

---

### Phase 4: Advanced Optimizations (3-5 days)

#### 4.1 Implement Infinite Scroll

**Impact:** Medium | **Effort:** 1 day | **Perceived speedup:** Faster initial load for paginated views

**Problem:** List views either load all data upfront (slow) or use traditional pagination (clunky UX).

**What Procure does:** `useInfiniteScroll` hook with IntersectionObserver:

```typescript
function useInfiniteScroll({ fetchNextPage, hasNextPage, isFetchingNextPage }) {
  const sentinelRef = useRef(null);
  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && hasNextPage && !isFetchingNextPage) {
          fetchNextPage();
        }
      },
      { rootMargin: '200px' }
    );
    if (sentinelRef.current) observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage]);
  return sentinelRef;
}
```

**Task:** Create `apps/client/src/hooks/use-infinite-scroll.ts` and apply to:

- Task lists
- Audit log viewer
- Bill lists
- Any paginated endpoint

---

#### 4.2 Lazy Tab Pattern for Detail Views

**Impact:** Medium | **Effort:** 1 day | **Perceived speedup:** 30-50% faster detail page loads

**Problem:** When opening a project workspace, ALL tabs (overview, BOQ, tasks, execution, modules) load their components immediately, even if the user only views the overview.

**What Procure does:** Default tab is eagerly loaded; other tabs use React.lazy:

```typescript
const tabs = [
  { id: 'overview', component: OverviewTab }, // eager
  { id: 'items', component: lazy(() => import('./ItemsTab')) }, // lazy
  { id: 'orders', component: lazy(() => import('./OrdersTab')) }, // lazy
];
```

**Task:** Apply lazy tab pattern to:

1. **Project Workspace** — only load active tab's component
2. **Module detail views** — only load active sub-section
3. **Admin pages** — only load visible admin section
4. **Settings pages** — only load active settings tab

---

#### 4.3 Web Workers for Heavy Computation

**Impact:** Medium | **Effort:** 2 days | **Perceived speedup:** Unblocked UI during processing

**Problem (RevBrain-specific):** RevBrain handles heavy engineering data that Procure doesn't:

- DXF file parsing (CAD drawings)
- 3D mesh generation (Three.js)
- Spreadsheet calculations (Fortune Sheet)
- PDF annotation rendering

These run on the main thread and freeze the UI during processing.

**Task:**

1. Create `apps/client/src/workers/dxf-parser.worker.ts` — offload DXF parsing
2. Create `apps/client/src/workers/spreadsheet-calc.worker.ts` — offload heavy calculations
3. Use `Comlink` library for ergonomic worker communication
4. Show progress indicator during worker processing

---

#### 4.4 Defer Non-Critical Initialization with requestIdleCallback

**Impact:** Medium | **Effort:** 2 hours | **Perceived speedup:** 200-500ms faster first paint

**Problem:** All initialization happens synchronously at app startup, blocking first paint.

**What Procure does:**

```typescript
// main.tsx — defer non-critical init
const deferInit = window.requestIdleCallback || ((cb) => setTimeout(cb, 100));

// Render app first
ReactDOM.createRoot(root).render(<App />);

// Then initialize non-critical services
deferInit(() => {
  import('@sentry/react').then(Sentry => Sentry.init({...}));
  import('./lib/analytics').then(a => a.init());
}, { timeout: 5000 });
```

**Task:** In `apps/client/src/main.tsx`:

1. Move Sentry init to requestIdleCallback
2. Move any analytics/telemetry to requestIdleCallback
3. Move non-critical provider initialization to after first paint

---

#### 4.5 Optimize React Query Per-Route

**Impact:** Medium | **Effort:** 4 hours | **Perceived speedup:** Smarter caching per data type

**Problem:** RevBrain uses a single staleTime (2 min) for all queries. But different data has different freshness needs.

**What Procure does:** Per-query staleTime tuning:
| Data Type | staleTime | Rationale |
|---|---|---|
| Dashboard stats | 5 min | Aggregated, changes slowly |
| Active tasks | 30 sec | Changes frequently, needs freshness |
| Project details | 60 sec | Changes moderately |
| Org settings | 10 min | Rarely changes |
| User profile | 5 min | Rarely changes |
| Enums/constants | 30 min | Static data |

**Task:** Add `staleTime` overrides to query hooks:

- `useProjects()` → staleTime: 60s
- `useTasks()` → staleTime: 30s
- `useDashboard()` → staleTime: 5min
- `useOrganization()` → staleTime: 10min
- `useEnums()` → staleTime: 30min

---

### Phase 5: Polish & Measurement (1-2 days)

#### 5.1 Add Performance Monitoring

**Impact:** Enables data-driven optimization | **Effort:** 4 hours

**Task:**

1. Add Web Vitals collection (`web-vitals` package)
2. Track LCP, FID, CLS, TTFB, INP
3. Send to Sentry Performance or custom endpoint
4. Add performance budget to CI (Lighthouse CI)

---

#### 5.2 Bundle Size Monitoring

**Impact:** Prevents regression | **Effort:** 2 hours

**Task:**

1. Add `bundlesize` or `size-limit` package
2. Set budgets: main chunk < 200KB, vendor chunks < 150KB each
3. Fail CI if bundle exceeds budget
4. Track bundle size trend over time

---

#### 5.3 Optimize Image Loading

**Impact:** Low | **Effort:** 2 hours

**Task:**

1. Add `loading="lazy"` to all non-critical images
2. Add `fetchpriority="high"` to hero/above-fold images
3. Use `srcset` for responsive images where applicable
4. Consider WebP/AVIF format conversion for uploaded images

---

#### 5.4 Deduplicate PrintSketches

**Impact:** Low (bundle size) | **Effort:** 2 hours

**Problem:** 4 nearly identical copies of PrintSketches across modules (~27KB duplicated code).

**Task:**

1. Extract shared PrintSketches component
2. Parameterize differences per module
3. Delete 3 duplicate files
4. Single lazy-loaded component used by all modules

---

## Implementation Priority Matrix

```
                        HIGH IMPACT
                            |
     Phase 2.1              |           Phase 2.3
     Virtualization         |           Split Monoliths
     ★★★★★                 |           ★★★★★
                            |
                            |
  Phase 2.2                 |         Phase 2.4
  Route Prefetching         |         React.memo
  ★★★★☆                    |         ★★★☆☆
                            |
LOW EFFORT ─────────────────┼──────────────── HIGH EFFORT
                            |
  Phase 1.1-1.4             |         Phase 4.3
  Quick Wins                |         Web Workers
  ★★★☆☆                    |         ★★★☆☆
                            |
  Phase 3.1-3.3             |         Phase 4.1-4.2
  Server Optimizations      |         Infinite Scroll + Lazy Tabs
  ★★★☆☆                    |         ★★★☆☆
                            |
                        LOW IMPACT
```

## Estimated Timeline

| Phase       | Tasks                                                     | Effort   | Cumulative Speedup        |
| ----------- | --------------------------------------------------------- | -------- | ------------------------- |
| **Phase 1** | Quick Wins (useShallow, DevTools, auth cache, DNS)        | 1 hour   | 20-30% fewer re-renders   |
| **Phase 2** | Core (virtualization, prefetch, split monoliths, memo)    | 3-5 days | **3-5x perceived speed**  |
| **Phase 3** | Server (ETags, tiered cache, DB indexes)                  | 1-2 days | 30-50% less data transfer |
| **Phase 4** | Advanced (infinite scroll, lazy tabs, workers, idle init) | 3-5 days | Unblocked UI, instant nav |
| **Phase 5** | Measurement & polish                                      | 1-2 days | Prevents regression       |

**Total estimated effort: 8-15 days**
**Expected result: RevBrain performance on par with Procure**

---

## Post-Implementation Findings (2026-03-16)

After completing all 30 tasks (Phases 0-5), staging testing revealed critical issues. These were resolved in Phase 6 (6 additional tasks). Key lessons:

### ETag Middleware: Body Hashing is an Anti-Pattern

**Task 3.1-3.2 (ETag middleware) caused a major regression.** The body-based ETag implementation reads every GET response body (`await c.res.text()`), hashes it, and rebuilds the Response object. On staging, this added 500ms-2s per API request, producing 6-8 second response times.

**Lesson:** Body-based ETags are fundamentally expensive for dynamic API responses. Hono's Response object is consumed on read — you must rebuild it from the string. Combined with character-by-character hashing, this creates significant overhead that scales with response size.

**Correct approach for future ETags:**

- Use DB timestamp-based ETags: `W/"<table>-<id>-<updated_at_unix>"`
- Only apply to endpoints with large payloads (>10KB) and low change frequency
- React Query's client-side caching makes HTTP-level ETags largely redundant for SPAs

### JWT Verification: Don't Re-Verify on Edge Functions

**Full ES256 JWT verification (JWKS fetch + crypto) was unnecessary.** On Supabase Edge Functions, the gateway already verifies JWT signatures before forwarding requests. Re-verifying was adding JWKS network calls + crypto overhead on every request.

**Lesson:** When running behind Supabase (or any gateway that verifies JWTs), just decode the token and check expiration. This is what Procure does — `decodeJwt()` (~0ms) instead of `verify()` (~200-500ms on first call).

### Background Data Prefetch: Critical Missing Piece

Hover-based prefetch (Task 2.7) only triggers on user interaction. Procure fires data prefetches immediately after first paint — by the time the user navigates, data is already cached. The two-phase pattern (data immediately, chunks deferred 2s) is essential.

### Perceived Performance: Skeletons + Animations

Generic loading spinners feel slow. Page-specific skeletons that match the real layout make loading feel 2-3x faster even with identical data load times. Staggered animations (header → cards → content) create a progressive-loading perception.

### Updated Impact Summary

| Phase                      | Status                               | Actual Impact                                  |
| -------------------------- | ------------------------------------ | ---------------------------------------------- |
| **0: Test Infrastructure** | Completed                            | Measurement baseline established               |
| **1: Quick Wins**          | Completed                            | ~25% fewer re-renders                          |
| **2: Core Performance**    | Completed                            | 3-5x perceived speed on navigation             |
| **3: Server & Network**    | Completed (ETag reverted in Phase 6) | Cache headers effective, ETag was net negative |
| **4: Advanced**            | Completed                            | Unblocked UI, deferred init                    |
| **5: Regression Guard**    | Completed                            | CI budgets in place                            |
| **6: Post-Impl Tuning**    | Completed                            | Fixed 6-8s → sub-second API responses          |

---

## Metrics to Track

Before starting, measure these baselines:

1. **Lighthouse Performance Score** (target: 90+)
2. **Largest Contentful Paint** (target: < 2.5s)
3. **First Input Delay / INP** (target: < 100ms)
4. **Cumulative Layout Shift** (target: < 0.1)
5. **Time to Interactive** (target: < 3.5s)
6. **Bundle size** (main chunk, total JS)
7. **Number of DOM nodes** on task list page (before/after virtualization)
8. **Re-render count** on navigation (before/after useShallow)
9. **API response size** (before/after ETags)
10. **Route transition time** (before/after prefetching)
