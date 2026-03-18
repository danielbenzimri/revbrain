# RevBrain Performance Speedup — Phased Implementation Tasks

**Created:** 2026-03-15
**Revised:** 2026-03-15 (final version — two rounds of external senior auditor review)
**Reference:** [speedup_roadmap.md](./speedup_roadmap.md) (full analysis)
**Benchmark:** Procure project — identical stack, 10x faster after optimizations

---

## Why This Exists

RevBrain and Procure share the same architecture (React 19 + Vite + Hono + Supabase + Zustand + TanStack Query). Procure was equally slow until a systematic optimization pass made it feel instant. A side-by-side analysis revealed **16 optimization techniques** Procure applies that RevBrain does not. This document breaks those into small, testable, committable tasks — each with validation criteria and expected impact.

**Expected outcome:** 4-8x perceived speed improvement across the application.

---

## How to Use This Document

- Each task is a **single commit + push**
- Each task has a **validation method** (unit test, E2E assertion, or manual check)
- Phase 0 creates a Playwright performance test suite that measures baselines — run it before and after each phase to track improvement
- Tasks within a phase are ordered by dependency — complete them in sequence
- Estimated total effort: **13-20 days**

---

## Cross-Phase Dependencies

Tasks within each phase must be completed in order. Across phases:

```
Phase 0 (test infra) ──── must complete before all other phases
    │
    ├── Phase 1 (quick wins) ──── independent, start immediately after Phase 0
    │       ├── Tasks 1.1-1.4, 1.6 are independent of each other
    │       └── Task 1.5 (query tuning) should land before Phase 2 data prefetch (2.7)
    │
    ├── Phase 2 (core perf) ──── Task 2.1→2.2, Task 2.3→2.4→2.7, Task 2.5→2.6
    │       └── Task 2.2 (virtualization) before Task 2.6 (memo batch 2)
    │
    ├── Phase 3 (server) ──── Task 3.1→3.2, Task 3.3-3.5 are independent
    │
    ├── Phase 4 (advanced) ──── Tasks 4.1, 4.4, 4.5 are independent
    │       ├── Task 4.2 must land before Task 5.1 (web vitals uses deferred init)
    │       └── Task 4.5 (content-visibility) is independent — can be done anytime
    │
    └── Phase 5 (guards) ──── depends on ALL prior phases being complete
```

Phases 1, 2, and 3 are otherwise independent and **can be parallelized across developers** if needed.

---

## Rollback Protocol

- Each task is a single commit specifically so it can be **reverted independently**
- If `pnpm perf:test` shows a regression after a task, revert that commit immediately and open an investigation issue
- If a functional E2E test breaks, **revert before investigating** — don't fix forward under time pressure
- Baseline numbers are stored in `e2e/perf-baselines.json` (Task 0.4) so regressions are detectable numerically, not just by feel
- Document the "before" state with screenshots/recordings — a side-by-side video of key flows is convincing to stakeholders

---

## Phase 0: Performance Test Infrastructure

> **Why:** You can't improve what you can't measure. Before touching any production code, we need a Playwright test suite that captures performance baselines and acts as a regression guard after every optimization. This suite mimics real user behavior and measures what matters: load times, DOM complexity, bundle sizes, caching effectiveness, main thread blocking, and memory usage. Every subsequent phase tightens these budgets.

### Task 0.1 — Create performance measurement helpers

**What:** Create `e2e/fixtures/perf.ts` — a set of reusable helper functions for performance measurement that extend the existing auth fixtures.

**Why this matters:** Every performance test in this plan needs to collect the same types of metrics (navigation timing, DOM counts, chunk sizes). Centralizing these in a fixture prevents duplication and ensures consistent measurement methodology.

**Files to create:**

- `e2e/fixtures/perf.ts`

**Implementation:**
The fixture exports 6 helper functions:

1. `collectNavigationMetrics(page)` — reads Navigation Timing API for TTFB, domContentLoaded, loadComplete, domInteractive, FCP, and LCP via PerformanceObserver; counts DOM nodes and scripts; reads Resource Timing for transfer sizes and cache hits
2. `measureRouteTransition(page, url)` — navigates to a URL, measures wall-clock time to domcontentloaded and networkidle, counts DOM nodes
3. `countDOMNodesInSelector(page, selector)` — counts child elements inside a specific container (for measuring virtualization)
4. `getChunkLoadInfo(page)` — reads Resource Timing for `.js` files, reports name/size/cached for each chunk, totals
5. `measureLongTasks(page)` — uses PerformanceObserver for `longtask` entries to capture main thread blocking (tasks > 50ms). Critical for validating Tasks 4.2 and 4.4.
   **Important:** The observer must be attached BEFORE navigation using `page.addInitScript()`, otherwise early long tasks during page load are missed:
   ```typescript
   async function measureLongTasks(page: Page) {
     await page.addInitScript(() => {
       (window as any).__longTasks = [];
       new PerformanceObserver((list) => {
         (window as any).__longTasks.push(
           ...list.getEntries().map((e) => ({ duration: e.duration, startTime: e.startTime }))
         );
       }).observe({ type: 'longtask', buffered: true });
     });
   }
   // After navigation, collect results:
   // const longTasks = await page.evaluate(() => (window as any).__longTasks);
   ```
6. `measureMemoryUsage(page)` — reads `performance.memory` (Chrome only) for `usedJSHeapSize`. Requires `--enable-precise-memory-info` Chrome flag (see Task 0.3). Virtualization and lazy loading should reduce heap usage

Re-exports `test` (with `authenticatedPage` and `adminPage`) and `expect` from `e2e/fixtures/auth.ts`.

**Validation:**

```bash
pnpm exec playwright test --list 2>&1 | grep "perf"
# Should show the fixture file compiles without errors
```

**Commit:** `perf: add E2E performance measurement fixtures and helpers`

---

### Task 0.2 — Create the performance E2E test suite

**What:** Create `e2e/performance.spec.ts` — 11 test groups that establish performance baselines across key user flows.

**Why this matters:** This is the central measurement tool for the entire speedup effort. Each test group targets a specific optimization area so we can see exactly which changes improve which metrics. The generous initial budgets ensure tests pass today; we tighten them in Phase 5 after optimizations land.

**Files to create:**

- `e2e/performance.spec.ts`

**Test groups:**

| #   | Test Group               | What It Measures                                                      | Initial Budget         | Optimization Phase       |
| --- | ------------------------ | --------------------------------------------------------------------- | ---------------------- | ------------------------ |
| 1   | Login & Initial Load     | Login page load time, DOM node count                                  | < 5s, < 500 nodes      | Phase 1, 4               |
| 2   | Authenticated Navigation | Dashboard domInteractive after login; route transition to /projects   | < 5s each              | Phase 2 (prefetching)    |
| 3   | JS Bundle Analysis       | Total JS transferred on initial load                                  | < 2048 KB              | Phase 2 (splitting)      |
| 4   | Chunk Caching            | Cache hit ratio on second navigation                                  | Logged only (baseline) | Phase 2 (prefetching)    |
| 5   | DOM Node Count           | Total DOM nodes on projects list page                                 | < 5000                 | Phase 2 (virtualization) |
| 6   | Resource Hints           | Count of preconnect and dns-prefetch links in index.html              | >= 2                   | Phase 1                  |
| 7   | API Cache Headers        | Whether GET API responses include Cache-Control and ETag headers      | Logged only (baseline) | Phase 3                  |
| 8   | Long Tasks               | Count and total duration of main thread tasks > 50ms during page load | < 10 long tasks        | Phase 4                  |
| 9   | Module View Load         | Time to load the heaviest module view (WallDashboard)                 | < 8s                   | Phase 4                  |
| 10  | Memory Baseline          | JS heap size after loading projects list                              | < 100MB                | Phase 2, 4               |
| 11  | Concurrent API Requests  | Number of parallel API requests during dashboard load                 | Logged only (baseline) | Phase 1, 3               |

**Test group 4 — precise approach:** Navigate to `/projects` → wait for networkidle → navigate to `/` (dashboard) → wait for networkidle → navigate back to `/projects` → measure which `.js` chunks were served from cache (`transferSize === 0` in Resource Timing API reliably indicates cache hit in Chrome).

All tests print `[PERF]` prefixed metrics to console for easy grep/tracking.
Uses `authenticatedPage` fixture for tests 2-5, 7-11.
Unauthenticated `page` for tests 1, 6.

**Validation:**

```bash
pnpm exec playwright test e2e/performance.spec.ts
# All 11 test groups should pass with generous initial budgets
```

**Commit:** `perf: add comprehensive E2E performance test suite with baseline budgets`

---

### Task 0.3 — Add Playwright performance project config

**What:** Add a dedicated `performance` project to `playwright.config.ts` so perf tests run in isolation without artifact overhead. Add a convenience script.

**Why this matters:** Performance tests need clean, low-overhead execution — no screenshots, video, or tracing that would skew timing measurements. A dedicated project config ensures this. Disabling retries is intentional — if a performance test is flaky, that IS the bug (inconsistent performance).

**Files to modify:**

- `playwright.config.ts` — add to `projects` array:
  ```typescript
  {
    name: 'performance',
    testMatch: /performance\.spec\.ts/,
    retries: 0,  // Flaky perf = real signal, don't retry
    use: {
      ...devices['Desktop Chrome'],
      screenshot: 'off',
      video: 'off',
      trace: 'off',
      launchOptions: {
        args: [
          '--disable-extensions',
          '--disable-background-networking',
          '--enable-precise-memory-info',  // Required for performance.memory API
        ],
      },
    },
  }
  ```

**CPU throttling (optional but recommended):** To simulate mid-range devices and get more realistic numbers, add CPU throttling in the test setup:

```typescript
// In performance.spec.ts beforeEach or per-test:
await page.emulateCPUThrottling(4); // 4x slowdown simulates a mid-range phone
```

This makes budgets more meaningful — passing at 4x throttle means the app is fast on real devices, not just on a developer's M-series Mac.

- `package.json` (root) — add script:
  ```json
  "perf:test": "playwright test --project=performance"
  ```

**Validation:**

```bash
pnpm perf:test
# Should run only performance.spec.ts with no artifacts, zero retries
```

**Commit:** `perf: add dedicated Playwright project config for performance tests`

---

### Task 0.4 — Automate baseline capture and comparison

**What:** Add a script that runs the performance suite, parses `[PERF]` console output, writes results to `e2e/perf-baselines.json`, and optionally compares against a previous baseline.

**Why this matters:** Manual recording of baselines is error-prone and will be skipped under time pressure. An automated script ensures every phase has a comparable before/after snapshot committed to the repo. This is how we prove the effort worked.

**Files to create:**

- `scripts/capture-perf-baseline.ts` — runs playwright, parses `[PERF]` lines, writes timestamped JSON
- `e2e/perf-baselines.json` — initial baseline (committed after first run)

**Files to modify:**

- `package.json` (root) — add scripts:
  ```json
  "perf:baseline": "tsx scripts/capture-perf-baseline.ts",
  "perf:compare": "tsx scripts/capture-perf-baseline.ts --compare"
  ```

**Validation:**

```bash
pnpm perf:baseline
cat e2e/perf-baselines.json  # Should contain timestamped metric values
```

**Commit:** `perf: add automated baseline capture and comparison script`

---

## Phase 1: Quick Wins

> **Why:** These 6 tasks require minimal code changes but eliminate systemic inefficiencies that affect every page in the application. Zustand's missing `useShallow` causes cascading re-renders across the entire component tree. TanStack Query's staleTime tuning eliminates redundant network requests. React DevTools instrumentation adds overhead to every component render. Synchronous localStorage reads on every API call add latency to every fetch. Missing DNS hints delay first-page-load. Combined, these fixes reduce unnecessary work by 30-40% across the board.

### Task 1.1 — Add useShallow to Zustand multi-property selectors

**What:** Import `useShallow` from `zustand/shallow` and wrap all store consumers that destructure multiple properties.

**Why this matters:** Without `useShallow`, Zustand uses reference equality. When a component destructures `{ isCollapsed, toggleSidebar }` from the store, it re-renders whenever _any_ store property changes — even unrelated ones like a different component calling `setSidebarCollapsed`. With `useShallow`, it only re-renders when `isCollapsed` or `toggleSidebar` actually change. Since the sidebar store is consumed on every page, this eliminates hundreds of unnecessary re-renders per session.

**Files to modify:**

- `apps/client/src/components/layout/sidebar.tsx` (line 31: `const { isCollapsed, toggleSidebar } = useSidebarStore()`)
- `apps/client/src/features/projects/layouts/project-layout.tsx` (line 22: `const { isCollapsed } = useSidebarStore()`)
- `apps/client/src/features/projects/components/ProjectSidebar.tsx` (line 58: `const { isCollapsed, toggleSidebar } = useSidebarStore()`)
- `apps/client/src/features/auth/pages/LoginPage.tsx` (line 13: `const { login, simulateRole, isLoading, error, user } = useAuthStore()` — destructures 5 properties!)
- `apps/client/src/components/dev/service-panel.tsx` (line 81: destructures entire `useServiceConfigStore`)
- `apps/client/src/hooks/use-services.ts` (line 64: multi-property selector from `useServiceConfigStore`)

**Pattern:**

```typescript
// BEFORE — re-renders on ANY store change
const { isCollapsed, toggleSidebar } = useSidebarStore();

// AFTER — only re-renders when these specific values change
import { useShallow } from 'zustand/shallow';
const { isCollapsed, toggleSidebar } = useSidebarStore(
  useShallow((s) => ({ isCollapsed: s.isCollapsed, toggleSidebar: s.toggleSidebar }))
);
```

**Note:** Single-property selectors like `useUser()`, `useIsAuthenticated()`, `useAppMode()`, `useIsOffline()`, `useIsOnline()` are already optimal — primitive values use strict equality by default. Skip these.

**Also audit for computed selectors that create new references:**

```typescript
// This creates a new array reference every render — useShallow won't help
const items = useStore((s) => s.items.filter((i) => i.active));
// Fix: use useMemo or a stable selector pattern
```

**Regression prevention:** Add a code comment convention to each store file:

```typescript
// PERF: All multi-property Zustand selectors MUST use useShallow — see speedup_tasks.md Task 1.1
```

**Validation:**

```bash
pnpm --filter client test -- --run          # All store unit tests pass
pnpm exec playwright test e2e/smoke.spec.ts # App still works end-to-end
```

**Commit:** `perf: add useShallow to all Zustand multi-property selectors`

---

### Task 1.2 — Disable React DevTools in production

**What:** Add a guard before `createRoot()` in `main.tsx` that neutralizes the React DevTools global hook in production builds.

**Why this matters:** React DevTools injects instrumentation into every component's render cycle. In production, this serves no purpose but still runs. Procure disables this; RevBrain does not.

**Risk note:** This only affects users who have React DevTools installed. The win is < 2% for typical users, up to 10% for developers testing in production. Still worth doing — zero cost, measurable upside.

**Files to modify:**

- `apps/client/src/main.tsx` — add before `createRoot`:

```typescript
// Disable React DevTools instrumentation overhead in production
// Allow ?debug query param to re-enable for production debugging
if (import.meta.env.PROD && !window.location.search.includes('debug')) {
  const hook = (window as any).__REACT_DEVTOOLS_GLOBAL_HOOK__;
  if (hook) hook.inject = () => {};
}
```

**Validation:**

```bash
pnpm --filter client build && pnpm --filter client preview
# In browser console: window.__REACT_DEVTOOLS_GLOBAL_HOOK__.inject.toString()
# Should return: "() => {}"
# Add ?debug to URL to re-enable DevTools when needed
```

**Commit:** `perf: disable React DevTools instrumentation in production builds`

---

### Task 1.3 — Cache auth token in memory

**What:** Add a module-level `_cachedSession` variable to `auth-headers.ts` that avoids calling `adapter.getSession()` on every API request when the token is still valid.

**Why this matters:** `getAuthHeaders()` is called on **every single API request** (used by all 26+ query hooks). Currently, each call invokes `adapter.getSession()` which reads from Supabase's localStorage-backed session store. With 50+ API calls per page load, this adds measurable latency. Caching the token in memory eliminates this entirely.

**Files to modify:**

- `apps/client/src/lib/auth-headers.ts` — add at module level:

```typescript
let _cachedSession: { accessToken: string; expiresAt: number } | null = null;
let _refreshPromise: Promise<void> | null = null; // Deduplicate concurrent refreshes
const CACHE_EXPIRY_BUFFER_MS = 30_000; // Invalidate 30s before actual expiry

export function invalidateAuthCache() {
  _cachedSession = null;
}
```

Modify `getAuthHeaders()` to:

1. Check `_cachedSession` — if valid and not within 30s of expiry, use it
2. On cache miss, read from adapter and populate cache
3. Deduplicate concurrent refresh calls via `_refreshPromise` to prevent multiple adapter reads

- `apps/client/src/stores/auth-store.ts` — call `invalidateAuthCache()` on SIGNED_OUT event (line 62) and in `logout()` action (line 111)

**Unit tests to add in `auth-headers.test.ts`:**

- Second call reuses cached token (adapter.getSession not called twice)
- `invalidateAuthCache()` forces next call to re-read from adapter
- Cached token within 30s of expiry triggers refresh
- Concurrent calls during refresh don't cause multiple adapter reads

**Validation:**

```bash
pnpm --filter client test -- --run
pnpm exec playwright test e2e/smoke.spec.ts  # Login/logout still works
```

**Commit:** `perf: cache auth session token in memory to avoid repeated storage reads`

---

### Task 1.4 — Add DNS-prefetch and preconnect hints

**What:** Add `<link rel="dns-prefetch">` and `<link rel="preconnect">` for CDN domains already used in `index.html`.

**Why this matters:** RevBrain loads Leaflet from `unpkg.com` and Proj4 from `cdnjs.cloudflare.com` as external scripts in `index.html`. Without preconnect/dns-prefetch, the browser doesn't start DNS resolution and TCP/TLS handshake until it encounters the `<script>` tags — by which time it's already blocking. Adding hints in `<head>` allows parallel resolution, saving 100-300ms on first load.

**Files to modify:**

- `apps/client/index.html` — add after existing preconnects (line 11), before Leaflet CSS (line 28):

```html
<!-- DNS prefetch + preconnect for CDNs already used below -->
<link rel="dns-prefetch" href="https://unpkg.com" />
<link rel="dns-prefetch" href="https://cdnjs.cloudflare.com" />
<link rel="preconnect" href="https://unpkg.com" crossorigin />
<link rel="preconnect" href="https://cdnjs.cloudflare.com" crossorigin />
```

**Validation:**

```bash
pnpm perf:test
# Test group 6 "Resource Hints" — now expects hints.length >= 6
```

**Commit:** `perf: add dns-prefetch and preconnect hints for CDN domains`

---

### Task 1.5 — Optimize TanStack Query per-route staleTime

**What:** Add per-query `staleTime` overrides to match data volatility instead of using a single 2-minute global default.

**Why this matters:** The current global `staleTime: 2 * 60 * 1000` is a reasonable default, but one-size-fits-all means static data (org settings, plans) refetches unnecessarily while real-time data (tasks) might feel stale. Procure tunes per-query. More importantly, adding `placeholderData: keepPreviousData` to list queries eliminates loading flashes on re-navigation — the old data shows instantly while fresh data loads in the background. This is one of the **highest ROI single changes** in the entire plan.

**Important:** The global `staleTime: 2 * 60 * 1000` in `apps/client/src/app/providers/query.tsx` **stays as the default**. The per-query overrides below only apply to specific hooks where the data volatility differs significantly from the 2-minute default. They don't replace the global config.

**Files to modify:**

- Individual query hooks — add staleTime overrides:

| Hook                     | staleTime | Rationale                           |
| ------------------------ | --------- | ----------------------------------- |
| `use-tasks.ts`           | 30s       | Changes frequently, needs freshness |
| `use-projects.ts`        | 60s       | Changes moderately                  |
| `use-boq.ts`             | 60s       | Changes moderately                  |
| `use-profile.ts`         | 5min      | Rarely changes                      |
| `use-org-users.ts`       | 5min      | Rarely changes                      |
| `use-plans.ts`           | 30min     | Static pricing data                 |
| `use-billing.ts`         | 5min      | Changes on payment events only      |
| `use-support-tickets.ts` | 30s       | Near-real-time for admin            |

Also add `placeholderData: keepPreviousData` to list queries for instant back-navigation.

**Validation:**

```bash
# Open DevTools Network tab
# Navigate to /projects, then to /, then back to /projects
# Before: all queries refetch on re-mount
# After: queries within staleTime serve from cache instantly (no loading spinner)
pnpm exec playwright test e2e/smoke.spec.ts  # No functional regressions
```

**Expected impact:** 20-40% fewer network requests. Instant back-navigation. Faster route transitions.

**Commit:** `perf: optimize TanStack Query staleTime per data type for smarter caching`

---

### Task 1.6 — Font and image optimization

**What:** Self-host the Inter font as a woff2 subset and add lazy loading attributes to non-critical images.

**Why this matters:** The current `index.html` loads Inter from Google Fonts CDN, which requires DNS resolution, TCP connection, and TLS handshake to `fonts.googleapis.com` and `fonts.gstatic.com` — adding 200-400ms to first paint. Self-hosting eliminates this cross-origin chain. Additionally, images without `loading="lazy"` are downloaded immediately even if they're below the fold, competing with critical resources.

**Files to modify:**

- `apps/client/index.html` — replace Google Fonts `<link>` with local `@font-face` declaration
- `apps/client/public/fonts/` — add `Inter-latin-400.woff2`, `Inter-latin-500.woff2`, `Inter-latin-600.woff2`, `Inter-latin-700.woff2` (latin subset only, ~25KB per weight vs ~100KB full)

**Font subset approach:**

```css
/* In index.html <style> or a preloaded CSS file */
@font-face {
  font-family: 'Inter';
  font-style: normal;
  font-weight: 400;
  font-display: swap;
  src: url('/fonts/Inter-latin-400.woff2') format('woff2');
  unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+2000-206F;
}
/* Repeat for 500, 600, 700 weights */
```

**Image optimization:**

- Audit all `<img>` tags and add `loading="lazy" decoding="async"` to any image not visible in the initial viewport
- Priority images (logo, hero) should keep `loading="eager"` or use `fetchpriority="high"`

**Validation:**

```bash
pnpm --filter client build && pnpm --filter client preview
# No Google Fonts requests in Network tab
# Font renders with no FOUT (font-display: swap ensures text is visible immediately)
pnpm perf:test
# Test group 1 — LCP should improve (no cross-origin font chain)
```

**Commit:** `perf: self-host Inter font subset and add lazy loading to images`

---

## Phase 2: Core Performance

> **Why:** This is the phase with the highest impact on perceived speed. The 7 tasks here address the three biggest performance bottlenecks: (1) **No list virtualization** — large lists render every DOM node, causing 500ms+ initial renders and janky scrolling; (2) **No route prefetching** — every navigation waits for the lazy chunk to download (500ms-2s); (3) **Limited React.memo** — only 9 components are memoized, causing cascading re-renders. Procure implements all three patterns extensively. Additionally, we add **data prefetching on hover** to complement chunk prefetching — making routes not just code-ready but data-ready before the click.

### Task 2.1 — Install @tanstack/react-virtual and create useVirtualList hook

**What:** Install the virtualization library and create a reusable hook in `apps/client/src/hooks/use-virtual-list.ts`.

**Why this matters:** This is the infrastructure for Task 2.2. The hook wraps `@tanstack/react-virtual` (4KB gzipped, tree-shakeable) with a simple API matching the project's hook conventions. It provides `parentRef` (scroll container), `virtualItems` (visible items), `totalSize` (for spacer div), and `scrollToIndex()` for programmatic scrolling.

**Files to create:**

- `apps/client/src/hooks/use-virtual-list.ts`
- `apps/client/src/hooks/use-virtual-list.test.ts`

**Files to modify:**

- `apps/client/package.json` — add `@tanstack/react-virtual`

**Unit tests:**

- Hook returns expected shape: `{ parentRef, virtualizer, virtualItems, totalSize }`
- Overscan parameter works (renders extra items above/below viewport)
- Empty list handled without errors
- List size changes handled correctly (items added/removed)

**Validation:**

```bash
pnpm install
pnpm --filter client test -- --run src/hooks/use-virtual-list.test.ts
```

**Commit:** `perf: add useVirtualList hook wrapping @tanstack/react-virtual`

---

### Task 2.2 — Apply virtualization to BOQ item list

**What:** Apply `useVirtualList` to the BOQ item list — the highest-row-count list view in typical usage (50-500 items per project).

**Why this matters:** Without virtualization, a project with 200 BOQ items renders 200 row components with all their children — potentially 2000+ DOM nodes. With virtualization, only ~15-20 visible items plus a 5-item overscan buffer are rendered. This is the **single highest-impact optimization** in the entire plan.

**Target:** BOQ item list (highest row counts, most complex per-row rendering with inputs and calculations).

**Accessibility requirements:**

- Add `aria-rowcount` on the container with total item count
- Add `aria-rowindex` on each visible row
- Ensure keyboard navigation (arrow keys) scrolls the virtualizer
- Set overscan to at least 5 items to prevent visible "popping"

**Warning — controlled inputs in virtualized rows:** When rows containing controlled `<input>` elements are recycled (scrolled out of view and back), they can lose focus and reset cursor position. Mitigations:

- Always use `key={item.id}` (never array index) so React preserves component identity
- Prefer uncontrolled inputs with refs (`defaultValue` + `onBlur`) over controlled inputs (`value` + `onChange`) in virtualized rows
- If controlled inputs are necessary, use stable `useCallback` handlers and ensure the parent doesn't re-render the virtualizer on every keystroke

**Files to modify:**

- BOQ list component (identify exact path during implementation)
- `e2e/performance.spec.ts` — add assertion for DOM node count inside the list container

**Validation:**

```bash
pnpm exec playwright test e2e/boq-management.spec.ts  # Functional tests still pass
pnpm perf:test
# Test group 5 "DOM Node Count" — should show significant reduction
# Before: potentially 2000-5000 nodes for a large list
# After: ~200-400 nodes (only visible items + overscan rendered)
# Test group 10 "Memory" — heap usage should decrease
```

**Commit:** `perf: add virtual scrolling to BOQ item list`

---

### Task 2.3 — Create route chunk prefetch system

**What:** Create `apps/client/src/lib/route-prefetch.ts` with background chunk preloading using `requestIdleCallback`.

**Why this matters:** Currently, when a user clicks a sidebar link, the browser must download the lazy-loaded chunk before rendering the page (500ms-2s depending on connection). Procure preloads all route chunks during idle time after initial render — by the time the user clicks, the chunk is already cached. This makes navigation feel **instant**.

**Files to create:**

- `apps/client/src/lib/route-prefetch.ts` — contains:
  - `routeChunkMap`: Maps 20+ routes to their lazy import functions (mirrors `router.tsx`)
  - `prefetchRoute(path)`: Preloads a single route chunk with error handling
  - `startBackgroundPreload()`: Cooperatively preloads all chunks during idle time
  - Deduplication via module-level `Set<string>`

**Critical implementation details:**

```typescript
// Error handling — prefetch failures must be silent
async function prefetchRoute(path: string) {
  if (prefetched.has(path) || !routeChunkMap[path]) return;
  prefetched.add(path);
  try {
    await routeChunkMap[path]();
  } catch {
    prefetched.delete(path); // Allow retry on next attempt
  }
}

// Network awareness — don't prefetch on slow/metered connections
function shouldPrefetch(): boolean {
  const conn = (navigator as any).connection;
  if (conn?.saveData) return false;
  if (conn?.effectiveType === '2g' || conn?.effectiveType === 'slow-2g') return false;
  return true;
}
```

**Maintenance requirement:** Do NOT duplicate lazy import functions. Instead, export a `routeLazyImports` map from `router.tsx` and import it in `route-prefetch.ts`:

```typescript
// In router.tsx — export the lazy import functions
export const routeLazyImports: Record<string, () => Promise<any>> = {
  '/': () => import('@/features/dashboard/pages/DashboardPage'),
  '/projects': () => import('@/features/projects/pages/ProjectsPage'),
  // ... all 20+ routes
};

// Then use in router definitions:
const DashboardPage = lazy(routeLazyImports['/']);
```

This eliminates the sync risk of maintaining two separate route maps. `route-prefetch.ts` simply imports `routeLazyImports` — single source of truth.

**Files to modify:**

- `apps/client/src/App.tsx` — add `useEffect` to call `startBackgroundPreload()` after mount

**Validation:**

```bash
pnpm --filter client build  # Build succeeds (no circular imports)
pnpm perf:test
# Test group 4 "Chunk Caching" — should show higher cache hit ratio on second navigation
```

**Commit:** `perf: add idle-time route chunk prefetching system`

---

### Task 2.4 — Wire prefetchRoute to sidebar navigation hover

**What:** Add debounced `onMouseEnter` and `onFocus` handlers to sidebar nav links that call `prefetchRoute(href)`.

**Why this matters:** Background preloading (Task 2.3) covers common routes, but hover prefetching provides an additional signal. When the user moves their mouse toward a link (200-500ms before clicking), the chunk starts downloading.

**Important:** Debounce hover to prevent prefetch storms when users sweep their mouse across the sidebar:

```typescript
let hoverTimer: ReturnType<typeof setTimeout>;
const handleHover = (href: string) => {
  clearTimeout(hoverTimer);
  hoverTimer = setTimeout(() => prefetchRoute(href), 100);
};
```

Also add `onFocus` for keyboard navigation accessibility:

```typescript
onFocus={() => prefetchRoute(item.href)}
```

**Files to modify:**

- `apps/client/src/components/layout/sidebar.tsx` — add handlers to nav `<Link>` elements
- `apps/client/src/features/projects/components/ProjectSidebar.tsx` — same for project workspace nav links

**Validation:**

```bash
pnpm exec playwright test e2e/smoke.spec.ts  # Navigation still works
# Manual: Open DevTools Network tab, hover over sidebar items, observe chunk requests before clicking
```

**Commit:** `perf: wire debounced route chunk prefetching to sidebar navigation hover`

---

### Task 2.5 — React.memo batch 1: project cards and sidebar items

**What:** Wrap `ProjectCard` (or equivalent) and sidebar nav item components with `React.memo()`.

**Why this matters:** The projects page renders a card for each project. Without `React.memo`, when any state changes (e.g., sidebar toggle, route change), every card re-renders even though its props haven't changed.

**Pre-task audit (CRITICAL):**
Before wrapping, audit each target component's parents for **unstable prop references** — React.memo is useless (adds overhead with zero benefit) if parent passes new references every render:

1. **Inline objects:** `<Card style={{ marginTop: 8 }} />` — new object each render. Fix: extract to constant or `useMemo`
2. **Inline callbacks:** `<Card onClick={() => handleClick(id)} />` — new function each render. Fix: `useCallback`, or pass `id` as prop and let child call `onClick(id)`
3. **Children as props:** `<Card><span>text</span></Card>` — new JSX element each render. If static, extract to constant

Fix unstable references **before** adding memo.

**Files to modify:**

- Project card component in `apps/client/src/features/projects/`
- Sidebar nav item in `apps/client/src/components/layout/sidebar.tsx` (extract to memoized component if inline)

**Validation:**

```bash
pnpm --filter client test -- --run
pnpm exec playwright test e2e/smoke.spec.ts
# Use React DevTools Profiler (dev mode) to verify reduced re-render counts — document delta in commit message
```

**Commit:** `perf: wrap ProjectCard and sidebar nav items with React.memo`

---

### Task 2.6 — React.memo batch 2: workspace list items

**What:** Wrap task cards, BOQ row items, bill/execution cards, and dashboard stat cards with `React.memo()`.

**Why this matters:** These components are rendered inside the most data-heavy pages. Combined with virtualization (Task 2.2), this transforms list performance from O(n) re-renders to O(1).

**Pre-task audit:** Same unstable-reference audit as Task 2.5. This is especially important for components receiving `onEdit`, `onDelete`, `onStatusChange` callbacks — ensure parents use `useCallback` for these.

**Files to modify:** (identify exact components during implementation)

- Task card components in `apps/client/src/features/tasks/components/`
- BOQ row components in `apps/client/src/features/boq/components/`
- Execution/bill components in `apps/client/src/features/execution/`
- Dashboard stat cards in `apps/client/src/features/dashboard/`

**Validation:**

```bash
pnpm --filter client test -- --run
pnpm exec playwright test e2e/tasks-kanban.spec.ts
pnpm exec playwright test e2e/boq-management.spec.ts
pnpm exec playwright test e2e/execution-bills.spec.ts
```

**Commit:** `perf: wrap task, BOQ, bill, and dashboard components with React.memo`

---

### Task 2.7 — Prefetch React Query data on sidebar hover

**What:** Extend the hover/focus handlers from Task 2.4 to also prefetch the **data** for the target route, not just the code chunk.

**Why this matters:** Chunk prefetch makes navigation feel faster (no download wait). Data prefetch makes it **actually** faster — when the user arrives, the data is already cached in React Query. Combined, this achieves Next.js-level navigation UX: zero spinners on route transitions.

**Architecture — registry pattern:** Instead of hardcoding prefetch queries in each sidebar component, create a centralized `routeDataPrefetchMap` registry in `route-prefetch.ts` alongside the chunk map. This keeps all prefetch logic in one place and makes it testable:

```typescript
// In route-prefetch.ts
import { QueryClient } from '@tanstack/react-query';

export const routeDataPrefetchMap: Record<string, (qc: QueryClient) => void> = {
  '/projects': (qc) => qc.prefetchQuery({ queryKey: ['projects'], queryFn: fetchProjects }),
  '/billing': (qc) => qc.prefetchQuery({ queryKey: ['billing'], queryFn: fetchBilling }),
  // ... add routes as needed
};

export function prefetchRouteData(path: string, queryClient: QueryClient) {
  routeDataPrefetchMap[path]?.(queryClient);
}
```

Sidebar hover handler becomes simple:

```typescript
onMouseEnter={() => {
  prefetchRoute(item.href);           // chunk (Task 2.4)
  prefetchRouteData(item.href, qc);   // data (this task)
}}
```

Builds on the existing `usePrefetchProject()` and `usePrefetchProjectWorkspace()` hooks in `apps/client/src/hooks/use-prefetch.ts` — extend the same pattern to top-level navigation.

**Files to modify:**

- `apps/client/src/lib/route-prefetch.ts` — add `routeDataPrefetchMap` and `prefetchRouteData()` export
- `apps/client/src/components/layout/sidebar.tsx` — call `prefetchRouteData` in hover handler
- `apps/client/src/hooks/use-prefetch.ts` — add `usePrefetchRoute()` hook for top-level routes

**Validation:**

```bash
pnpm exec playwright test e2e/smoke.spec.ts
# Manual: Navigate to /projects, then /, then hover /projects in sidebar
# Network tab should show NO new requests when clicking — data already cached
pnpm perf:test
# Test group 2 "Route Transitions" — should show faster transition times
```

**Expected impact:** Route transitions feel instant — no loading spinners, no data refetch.

**Commit:** `perf: prefetch React Query data on sidebar hover for instant navigation`

---

## Phase 3: Server & Network

> **Why:** Phases 1-2 optimize the client. Phase 3 optimizes what the client receives. Currently, every GET request re-downloads the full response payload even when data hasn't changed. Every route gets the same 60-second cache policy regardless of data volatility. And several high-traffic query patterns lack database indexes. Procure has 7 cache tiers, ETag support (saving ~15KB per conditional request), and 11 strategic database indexes. These optimizations reduce data transfer by 30-50% and query latency by 20-40%.
>
> **Note:** Server-side compression (gzip/brotli) is already enabled via Hono `compress()` middleware at `apps/server/src/index.ts` line 83. No action needed there — verified during analysis.

### Task 3.1 — Create ETag middleware

**What:** Create `apps/server/src/middleware/etag.ts` with FNV-1a hash-based **weak ETag** generation and 304 Not Modified support.

**Why this matters:** Without ETags, the client re-downloads the full response body on every request — even if the data hasn't changed. For list endpoints returning 10-50KB of JSON, this wastes bandwidth and forces the client to re-parse identical data.

**Weak ETags (`W/"hash"`)** are used instead of strong ETags because JSON serialization order may vary between responses with semantically identical content.

FNV-1a is chosen because it's non-cryptographic (fast) and produces good distribution — same algorithm Procure uses.

**Files to create:**

- `apps/server/src/middleware/etag.ts`
- `apps/server/src/middleware/etag.test.ts`

**Exclusions:** Skip streaming/SSE endpoints if any exist — buffering a stream to compute a hash defeats the purpose.

**Unit tests (7):**

1. GET request returns `ETag: W/"hash"` header in response
2. Matching `If-None-Match` returns 304 with empty body
3. Non-matching `If-None-Match` returns 200 with new ETag
4. POST requests are not affected (passthrough)
5. Non-200 responses are not affected
6. Large response bodies (> 1MB) — verify hash doesn't cause noticeable latency
7. Same response body with different request URLs produces same ETag (body-only hash)

**Validation:**

```bash
pnpm --filter @revbrain/server test -- --run src/middleware/etag.test.ts
# All 7 tests pass
```

**Commit:** `perf: add ETag middleware with FNV-1a weak hash for conditional GET requests`

---

### Task 3.2 — Wire ETag middleware into the server

**What:** Apply the ETag middleware to API routes in `apps/server/src/index.ts`.

**Why this matters:** The middleware from 3.1 does nothing until it's mounted. This task wires it into the middleware chain after cache headers (line ~210) so all GET responses include ETags.

**Middleware ordering (critical):** ETag middleware MUST run AFTER compression middleware (`compress()` at `index.ts` line 83). If ETag runs before compress, the hash is computed on the uncompressed body, but the client receives the compressed body — on the next request, the client sends back the ETag, the server computes a hash of a different (uncompressed) response, and the ETag never matches. The insertion point at line ~210 (after cache middleware) is correct because compress is already applied at line 83.

**Files to modify:**

- `apps/server/src/index.ts` — add after cache middleware (line ~210), which is already after compress (line 83):

```typescript
import { etagMiddleware } from './middleware/etag.ts';
app.use('/api/v1/*', etagMiddleware);
app.use('/v1/*', etagMiddleware);
```

**Validation:**

```bash
pnpm --filter @revbrain/server test -- --run  # All server tests pass
curl -v http://localhost:3000/v1/health  # Observe ETag header
curl -v -H 'If-None-Match: W/"<hash>"' http://localhost:3000/v1/health  # Observe 304

pnpm perf:test
# Test group 7 "API Cache Headers" — should now observe ETag headers
```

**Commit:** `perf: wire ETag middleware into API routes`

---

### Task 3.3 — Implement tiered cache presets

**What:** Expand `apps/server/src/middleware/cache.ts` with named cache presets and apply per-route.

**Why this matters:** Currently, every GET endpoint gets `max-age=60, stale-while-revalidate=300`. But a task list changes every few seconds while organization settings change every few months. By matching cache duration to data volatility, we reduce unnecessary refetches for stable data and keep real-time data fresh.

**Files to modify:**

- `apps/server/src/middleware/cache.ts` — add presets:

| Preset    | max-age  | stale-while-revalidate | Use Case                        |
| --------- | -------- | ---------------------- | ------------------------------- |
| `short`   | 15s      | 30s                    | Tasks, work logs, notifications |
| `default` | 60s      | 5min                   | Project lists, BOQ items, bills |
| `long`    | 1 hour   | 4 hours                | Org settings, user profiles     |
| `static`  | 24 hours | 7 days                 | Plans, enums, health endpoint   |
| `noCache` | no-store | —                      | Auth endpoints (already exists) |

**Important: Add `Vary` header handling.** Endpoints returning user-specific data must include `Vary: Authorization` to prevent shared caches (CDN, proxy) from serving User A's data to User B. The existing `private` directive handles browser caches, but `Vary` is needed for correctness.

- `apps/server/src/index.ts` — replace generic `cacheMiddleware` with route-specific presets

**Validation:**

```bash
pnpm --filter @revbrain/server test -- --run  # Existing + new cache preset tests pass
pnpm perf:test
# Test group 7 — different routes should now show different cache-control values
```

**Commit:** `perf: implement tiered cache-control presets per route type`

---

### Task 3.4 — Add missing database indexes

**What:** Create a new SQL migration with indexes for query patterns not covered by existing migrations.

**Why this matters:** Database queries without covering indexes require full table scans. As data grows, these queries get linearly slower. Each missing index can mean the difference between a 5ms query and a 500ms query at scale.

**Pre-task analysis (run before writing indexes):**

```sql
-- Find slow queries
SELECT query, mean_time, calls FROM pg_stat_statements ORDER BY mean_time DESC LIMIT 20;

-- Find tables with more sequential scans than index scans
SELECT schemaname, tablename, seq_scan, idx_scan, seq_scan - idx_scan AS delta
FROM pg_stat_user_tables WHERE seq_scan > idx_scan ORDER BY delta DESC;
```

**Document these results in the commit message** so index choices are evidence-based.

**Files to create:**

- `supabase/migrations/0041_additional_performance_indexes.sql`

**Supabase migration compatibility (critical):** `CREATE INDEX CONCURRENTLY` cannot run inside a transaction, but Supabase migrations run inside transactions by default. Two approaches:

1. **Preferred — run via Supabase SQL editor:** Execute the `CONCURRENTLY` indexes directly in the Supabase dashboard SQL editor (outside the migration system). Then add a comment-only migration file documenting what was done.
2. **Alternative — use regular `CREATE INDEX` with lock timeout:** If you must use the migration system, use regular `CREATE INDEX` (not `CONCURRENTLY`) with a safety timeout:
   ```sql
   SET LOCAL lock_timeout = '5s';
   CREATE INDEX IF NOT EXISTS idx_calculation_results_project_module ...;
   ```
   Schedule this migration during a low-traffic window to minimize lock contention.

**Document the chosen approach in the commit message.**

**Indexes to create:**

```sql
CREATE INDEX IF NOT EXISTS idx_calculation_results_project_module
  ON calculation_results (project_id, module_type);

CREATE INDEX IF NOT EXISTS idx_support_tickets_user_status
  ON support_tickets (user_id, status);

CREATE INDEX IF NOT EXISTS idx_job_queue_status_scheduled
  ON job_queue (status, scheduled_for) WHERE status = 'pending';
```

**Additional candidates to investigate based on query patterns:**

- `projects(organization_id, status)` — filtered project lists
- `boq_items(project_id, category)` — BOQ filtering
- `work_logs(task_id, created_at)` — task work history
- `audit_logs(entity_type, entity_id, created_at)` — audit trail queries

**Validation:**

```bash
pnpm supabase db push  # Apply migration locally
# Verify with EXPLAIN ANALYZE on common queries — confirm index scans
pnpm exec playwright test e2e/smoke.spec.ts  # No functional regressions
```

**Commit:** `perf: add database indexes for calculation results, support tickets, and job queue`

---

### Task 3.5 — API request deduplication

**What:** Create a thin deduplication layer that collapses identical in-flight GET requests into a single network call.

**Why this matters:** During page loads, multiple components often mount simultaneously and each triggers the same API query independently. TanStack Query deduplicates at the hook level within React, but direct `authFetch` calls from services/utilities bypass this. A network-level dedup ensures that if `/v1/projects` is already in flight, a second identical request waits for the first response instead of hitting the server again.

**Files to create:**

- `apps/client/src/lib/request-dedup.ts`

**Implementation:**

```typescript
const inFlight = new Map<string, Promise<Response>>();

export function dedupFetch(url: string, options: RequestInit = {}): Promise<Response> {
  // Only dedup GET requests
  if (options.method && options.method !== 'GET') {
    return fetch(url, options);
  }

  const key = url; // Could include sorted query params if needed
  const existing = inFlight.get(key);
  if (existing) return existing.then((r) => r.clone()); // Clone so each consumer gets a fresh body

  const promise = fetch(url, options).finally(() => {
    inFlight.delete(key);
  });
  inFlight.set(key, promise);
  return promise;
}
```

**Files to modify:**

- `apps/client/src/lib/auth-headers.ts` — use `dedupFetch` instead of raw `fetch` in `authFetch()`

**Unit tests:**

1. Two concurrent identical GET requests result in one `fetch` call
2. POST requests are never deduplicated
3. After the first request completes, a new request to the same URL makes a fresh call
4. Each consumer gets a usable Response (`.clone()` works correctly)

**Validation:**

```bash
pnpm --filter client test -- --run src/lib/request-dedup.test.ts
pnpm exec playwright test e2e/smoke.spec.ts  # No functional regressions
pnpm perf:test
# Test group 11 "Concurrent API Requests" — should show fewer parallel requests
```

**Commit:** `perf: add API request deduplication for concurrent identical GET requests`

---

## Phase 4: Advanced Optimizations

> **Why:** These 5 tasks address deeper architectural bottlenecks. Infinite scroll eliminates the "load everything upfront" anti-pattern. Deferred initialization moves non-critical work out of the critical rendering path. Lazy module views prevent loading 19,000-line components until actually needed. Web Workers unblock the main thread during heavy DXF/CAD file processing — a RevBrain-specific bottleneck. CSS `content-visibility` eliminates rendering work for offscreen content. `useTransition` improves perceived responsiveness during heavy state changes like module switching.

### Task 4.1 — Create useInfiniteScroll hook

**What:** Create `apps/client/src/hooks/use-infinite-scroll.ts` using IntersectionObserver to trigger loading more data when a sentinel element enters the viewport.

**Why this matters:** Currently, list views either load all data upfront (slow initial render) or use button-based pagination (clunky UX). IntersectionObserver-based infinite scroll loads data on demand as the user scrolls — no scroll event listeners needed.

**Integration pattern with TanStack Query `useInfiniteQuery`:**

```typescript
const { data, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({...});

const sentinelRef = useInfiniteScroll({
  hasNextPage: !!hasNextPage,
  isLoading: isFetchingNextPage,
  onLoadMore: fetchNextPage,
  rootMargin: '200px', // Start loading 200px before sentinel is visible
});

return (
  <>
    {data.pages.flat().map(item => <Item key={item.id} {...item} />)}
    <div ref={sentinelRef} /> {/* Sentinel element */}
  </>
);
```

**Composition with virtualization:** This hook stacks with Task 2.1's `useVirtualList`. Infinite scroll loads data incrementally; virtualization controls DOM rendering. They solve different problems and compose well together.

**Files to create:**

- `apps/client/src/hooks/use-infinite-scroll.ts`
- `apps/client/src/hooks/use-infinite-scroll.test.ts`

**Unit tests:**

1. Callback fires when `isIntersecting=true` and `hasNextPage=true`
2. Callback does NOT fire when `isLoading=true`
3. Callback does NOT fire when `hasNextPage=false`
4. Observer disconnects on cleanup

**Validation:**

```bash
pnpm --filter client test -- --run src/hooks/use-infinite-scroll.test.ts
```

**Commit:** `perf: add useInfiniteScroll hook with IntersectionObserver`

---

### Task 4.2 — Defer non-critical initialization with requestIdleCallback

**What:** Move Sentry initialization and any future analytics/telemetry to after first paint using `requestIdleCallback`.

**Why this matters:** Currently, `main.tsx` imports and initializes everything synchronously before `createRoot().render()`. Sentry's initialization competes with React's first render for main thread time. Procure defers all non-critical initialization to idle time, reducing time-to-interactive by 200-500ms.

**Error handling (critical):** If Sentry fails to initialize during idle callback, install a minimal fallback error handler so errors aren't silently lost:

```typescript
// requestIdleCallback with fallback for Safari (no rIC support)
// Use 1000ms fallback timeout — 100ms is too aggressive and can still
// block during heavy initial rendering. 1000ms gives the main thread
// time to settle after first paint.
const idle = (cb: () => void, opts?: { timeout?: number }) => {
  if ('requestIdleCallback' in window) {
    requestIdleCallback(cb, opts);
  } else {
    setTimeout(cb, 1000); // Safari fallback — generous delay
  }
};

idle(async () => {
  try {
    const Sentry = await import('@sentry/react');
    Sentry.init({...});
  } catch {
    window.addEventListener('error', (event) => {
      console.error('[Fallback Error Reporter]', event.error);
    });
  }
}, { timeout: 5000 });
```

**Also add performance marks** for measuring the impact:

```typescript
performance.mark('app-render-start');
createRoot(...).render(...);
performance.mark('app-rendered');
// ... in idle callback:
performance.mark('init-complete');
performance.measure('render-to-init', 'app-rendered', 'init-complete');
```

**Files to modify:**

- `apps/client/src/main.tsx`

**Validation:**

```bash
pnpm --filter client build
pnpm exec playwright test e2e/smoke.spec.ts  # App still works
pnpm perf:test
# Test group 2 — domInteractive should improve
# Test group 8 — long task count should decrease
```

**Commit:** `perf: defer Sentry and non-critical init with requestIdleCallback`

---

### Task 4.3 — Lazy tab pattern for project workspace module views

**What:** Ensure module views (WallDashboard 19K lines, LandscapingView 18K lines, PavingView 12K lines) are lazy-loaded only when their specific module tab is selected.

**Why this matters:** A single WallDashboard component is 19,816 lines of code — loading it when the user wants to see Paving wastes time and memory. Procure uses a lazy tab pattern where only the active tab's component loads.

**Loading state design:** When a module tab is clicked and the chunk is loading, show a skeleton loader matching the module layout, not a spinner (skeletons feel instant, spinners feel slow):

```typescript
<Suspense fallback={<ModuleLoadingSkeleton moduleName={activeModule} />}>
  <LazyModuleView />
</Suspense>
```

**Consider `useTransition`** for module switching — React 19's concurrent features let you keep the old view visible while the new one loads:

```typescript
const [isPending, startTransition] = useTransition();
const handleTabChange = (module) => {
  startTransition(() => setActiveModule(module));
};
// Show subtle loading indicator when isPending, but keep old content visible
```

**After implementation, document each module's chunk size** in the commit message for future reference.

**Files to modify:**

- Module routing/tab components within `apps/client/src/features/modules/`

**Validation:**

```bash
pnpm exec playwright test e2e/paving-module.spec.ts
pnpm exec playwright test e2e/drainage-channels-*.spec.ts
pnpm exec playwright test e2e/gravity-walls-module.spec.ts
# All module E2E tests still pass

pnpm perf:test
# Test group 9 "Module View Load" — should show faster load times
# Test group 10 "Memory" — heap usage should decrease
```

**Commit:** `perf: lazy-load individual module views within project workspace`

---

### Task 4.4 — Web Worker for DXF parsing

**What:** Create a Web Worker that offloads DXF file parsing from the main thread.

**Why this matters (RevBrain-specific):** This is a bottleneck Procure doesn't have. RevBrain processes CAD/DXF files for engineering drawings. The `dxf-parser` library parses these files synchronously on the main thread, freezing the UI for 1-5 seconds on large files. Vite natively supports `?worker` imports.

**Structured message protocol:**

```typescript
// Worker receives:
type WorkerMessage = { id: string; type: 'parse'; payload: ArrayBuffer };
// Worker sends:
type WorkerResponse =
  | { id: string; type: 'result'; payload: ParsedDxf }
  | { id: string; type: 'error'; payload: string }
  | { id: string; type: 'progress'; payload: { percent: number } };
```

**Key implementation details:**

- **Transferable objects:** Use `worker.postMessage({ ... }, [buffer])` to transfer ArrayBuffer ownership instead of copying — critical for 10MB+ files
- **Progress reporting:** Post progress every 1000 lines so the UI can show a progress bar, not just a spinner
- **Browser fallback:** Safari private browsing and some enterprise browsers restrict workers. Add sync fallback:
  ```typescript
  export function useDxfParser() {
    if (typeof Worker === 'undefined') return { parse: syncParse };
    // ... worker implementation
  }
  ```
- **Error handler:** Attach `worker.onerror` to log failures and fall back to sync parsing:
  ```typescript
  worker.onerror = (event) => {
    console.error('[DXF Worker] Error:', event.message);
    worker.terminate();
    // Fall back to sync parsing
    resolve(syncParse(buffer));
  };
  ```
- **Timeout safety (30s):** If the worker hasn't responded in 30 seconds, terminate it and fall back. Large DXF files shouldn't take more than 10s — if they do, something is wrong:
  ```typescript
  const timeout = setTimeout(() => {
    worker.terminate();
    console.warn('[DXF Worker] Timed out after 30s, falling back to sync');
    resolve(syncParse(buffer));
  }, 30_000);
  ```
- **Cleanup on unmount:** The `useDxfWorker` hook must terminate the worker in its `useEffect` cleanup to prevent memory leaks:
  ```typescript
  useEffect(() => {
    const worker = new Worker(new URL('../workers/dxf-parser.worker.ts', import.meta.url), {
      type: 'module',
    });
    workerRef.current = worker;
    return () => {
      worker.terminate();
    };
  }, []);
  ```

**Files to create:**

- `apps/client/src/workers/dxf-parser.worker.ts`
- `apps/client/src/hooks/use-dxf-worker.ts`

**Files to modify:**

- Components that currently call `DxfParser.parseSync()` directly

**Validation:**

```bash
pnpm --filter client build  # Worker compiles correctly
pnpm perf:test
# Test group 8 "Long Tasks" — should show fewer/shorter blocking tasks during DXF operations
```

**Commit:** `perf: add Web Worker for DXF file parsing to unblock main thread`

---

### Task 4.5 — CSS content-visibility for offscreen sections

**What:** Apply `content-visibility: auto` with `contain-intrinsic-size` to below-fold page sections and inactive module views.

**Why this matters:** `content-visibility: auto` tells the browser to completely skip layout, paint, and style calculation for elements outside the viewport. For pages with lots of below-fold content (dashboard panels, long forms, module views), this can reduce initial rendering work by 30-50%. It's a pure CSS optimization — no JavaScript, no component changes, zero risk of behavioral regressions.

**Browser support:** Chrome 85+, Edge 85+, Firefox 125+, Safari 18+. Falls back gracefully — unsupported browsers simply ignore the property and render normally.

**Files to modify:**

- `apps/client/src/index.css` (or Tailwind config) — add utility class:

```css
.content-offscreen {
  content-visibility: auto;
  contain-intrinsic-size: auto 500px; /* Estimated height for layout stability */
}
```

**Targets to apply the class to:**

- Dashboard stat panels below the first row
- Module view containers in project workspace (inactive tabs)
- Long form sections in project settings (below initial viewport)
- BOQ/task list sections when the page has multiple content areas

**Caution:** Do NOT apply to elements the user sees immediately on load (above the fold). `content-visibility: auto` can cause a brief layout shift as the browser calculates actual dimensions when the element scrolls into view. `contain-intrinsic-size` mitigates this but may need per-section tuning.

**Validation:**

```bash
pnpm exec playwright test e2e/smoke.spec.ts  # No visual regressions
pnpm perf:test
# Test group 8 "Long Tasks" — fewer long tasks during page load
# Test group 2 — faster domInteractive (less rendering work)
```

**Commit:** `perf: apply content-visibility auto to offscreen page sections`

---

## Phase 5: Measurement & Regression Guard

> **Why:** Performance improvements without monitoring are temporary. Without budgets and CI enforcement, any new feature can silently regress performance back to where we started. This phase installs permanent guardrails.

### Task 5.1 — Add Web Vitals collection

**What:** Install `web-vitals` package, create `apps/client/src/lib/web-vitals.ts`, collect LCP/FID/CLS/TTFB/INP on every page load.

**Why this matters:** Core Web Vitals are the industry standard for measuring real user performance. **INP (Interaction to Next Paint)** replaced FID as a Core Web Vital in March 2024 — it measures latency of ALL interactions, not just the first one. For RevBrain, this captures responsiveness of form interactions in module views.

**Also add custom vitals for RevBrain-specific flows:**

```typescript
// Time from clicking a module tab to content visible
performance.mark('module-tab-clicked');
// ... in the module component:
performance.mark('module-content-rendered');
performance.measure('module-load', 'module-tab-clicked', 'module-content-rendered');
```

**Reporting destination:** Console in development, Sentry Performance in production (already set up with 10% sampling).

**Files to create:**

- `apps/client/src/lib/web-vitals.ts`

**Files to modify:**

- `apps/client/package.json` — add `web-vitals`
- `apps/client/src/main.tsx` — call `initWebVitals()` in the deferred init from Task 4.2

**Validation:**

```bash
pnpm perf:test
# Manual: Open browser console, navigate — see "[WebVitals] LCP: 1234" etc.
```

**Commit:** `perf: add web-vitals collection for Core Web Vitals monitoring`

---

### Task 5.2 — Add bundle size monitoring to CI

**What:** Add `size-limit` to the client package with budgets per chunk and a total budget, plus a CI step that fails the build if budgets are exceeded.

**Why this matters:** Bundle size is the #1 predictor of load time. Without CI enforcement, any single import can silently add hundreds of KB.

**Pre-task:** Run `pnpm --filter client build` NOW and document current sizes. Set budgets at current + 10% to avoid immediate CI failures:

```json
[
  { "path": "dist/assets/index-*.js", "limit": "XX KB", "name": "main" },
  { "path": "dist/assets/react-vendor-*.js", "limit": "XX KB", "name": "react" },
  { "path": "dist/assets/ui-vendor-*.js", "limit": "XX KB", "name": "ui" },
  { "path": "dist/assets/geo-vendor-*.js", "limit": "XX KB", "name": "geo" },
  { "path": "dist/assets/*.js", "limit": "1500 KB", "name": "total-js" }
]
```

The total budget catches death-by-a-thousand-cuts that individual chunk budgets miss.

**Also add a build analysis tool:**

```json
"analyze": "ANALYZE=true pnpm --filter client build"
```

The existing `rollup-plugin-visualizer` in `vite.config.ts` generates `dist/stats.html` — this script makes it easy to run.

**Files to create:**

- `apps/client/.size-limit.json`

**Files to modify:**

- `apps/client/package.json` — add `size-limit`, `@size-limit/file` devDependencies, `"size"` and `"analyze"` scripts
- `.github/workflows/ci.yml` — add bundle size check step after build

**Validation:**

```bash
pnpm --filter client build && pnpm --filter client size
# Should report chunk sizes and PASS within budgets
```

**Commit:** `perf: add bundle size monitoring with size-limit in CI`

---

### Task 5.3 — Tighten performance test budgets

**What:** Update `e2e/performance.spec.ts` with stricter budgets based on post-optimization measurements.

**Why this matters:** The generous Phase 0 budgets were designed to pass before any optimizations. Now that all phases are complete, we lock in improvements as regression guards.

**Buffer policy:** Budgets should be set at `measured_value x 1.2` (20% buffer). Performance varies 10-15% between runs due to system load. Too-tight budgets cause flaky tests that get disabled — defeating the purpose.

**Target budgets (adjust based on actual measurements):**

| Metric                    | Phase 0 Budget | Phase 5 Budget | Formula        |
| ------------------------- | -------------- | -------------- | -------------- |
| Login page load           | < 5s           | < 3s           | measured x 1.2 |
| Dashboard domInteractive  | < 5s           | < 3s           | measured x 1.2 |
| Route transition          | < 5s           | < 2s           | measured x 1.2 |
| Total JS transferred      | < 2048 KB      | < 1500 KB      | measured x 1.2 |
| DOM nodes (list page)     | < 5000         | < 1500         | measured x 1.2 |
| Resource hints            | >= 2           | >= 6           | exact count    |
| Cache hit ratio (2nd nav) | logged only    | > 60%          | measured - 10% |
| API responses with ETag   | logged only    | > 50%          | measured - 10% |
| Long tasks during load    | < 10           | < 5            | measured x 1.2 |

**Document actual measured values in the commit message:**

```
Measured post-optimization baselines (average of 3 runs):
- Login page load: 1.8s → budget 2.2s (1.2x)
- Dashboard domInteractive: 2.1s → budget 2.5s (1.2x)
...
```

**Files to modify:**

- `e2e/performance.spec.ts` — update all `expect` thresholds

**Validation:**

```bash
pnpm perf:test
# All tests pass with tighter budgets — this IS the validation
```

**Commit:** `perf: tighten E2E performance test budgets after optimization phases`

---

## Phase 6: Post-Implementation Tuning (Completed 2026-03-16)

> **Why:** After completing all 30 tasks from Phases 0-5, staging testing revealed two critical performance regressions and three missing optimizations compared to Procure. The ETag middleware (Task 3.1-3.2) was reading every response body, adding 500ms-2s per GET. JWT verification was doing unnecessary crypto on every request. And Procure's perceived-performance patterns (skeletons, animations, background data prefetch) were absent.
>
> **Discovery method:** Side-by-side DevTools Network tab comparison on staging. API responses were 6-8 seconds where Procure's were sub-second. Root cause analysis traced 80% of latency to the ETag middleware body hashing.

### Task 6.1 — Disable body-based ETag middleware (COMPLETED)

**What:** Remove the ETag middleware from API routes in `apps/server/src/index.ts`.

**Why this matters:** The ETag middleware (Task 3.1) computes a hash by calling `await c.res.text()` on every GET response, consuming and rebuilding the entire Response object. For a projects list returning 50-500KB of JSON, this adds 500ms-2s of pure overhead per request. On staging (Supabase Edge Functions), this compounded with network latency to produce 6-8 second API responses.

**Root cause:** Body-based ETags require reading the entire response into memory, hashing it character-by-character (FNV-1a), then constructing a new `Response(body, { headers })`. In Hono, `c.res.text()` consumes the response stream — the body must be rebuilt from the string.

**Why ETags don't help here:** React Query manages client-side caching with configurable `staleTime` and `gcTime`. Browsers don't reliably send `If-None-Match` for JavaScript `fetch()` API calls in the same way they do for static assets. The Cache-Control headers (already configured per-route with 60s/1h/24h tiers from Task 3.3) handle HTTP caching.

**What we preserved:** The ETag middleware file (`etag.ts`) and its tests remain in the codebase for reference. If conditional GET is needed in the future, the correct approach is DB timestamp-based ETags (see Phase 6 notes below), not response body hashing.

**Files modified:**

- `apps/server/src/index.ts` — removed `etagMiddleware` import and its two `app.use()` registrations

**Validation:**

```bash
pnpm --filter server exec tsc --noEmit  # No type errors
pnpm --filter server test               # All 436 tests pass (including etag.test.ts — standalone)
# Staging: API responses dropped from 6-8s to sub-second
```

**Commit:** `perf: disable ETag middleware — eliminates 500ms-2s overhead per GET request`

---

### Task 6.2 — Decode ES256 JWTs instead of full verification (COMPLETED)

**What:** Replace full JWKS-based ES256 JWT verification with simple JWT decoding in `apps/server/src/middleware/auth.ts`.

**Why this matters:** On Supabase Edge Functions, the Supabase gateway has already verified the JWT signature before the request reaches the Edge Function code. Re-verifying with JWKS fetch + crypto adds unnecessary overhead:

1. **JWKS fetch:** Network round-trip to `SUPABASE_URL/auth/v1/.well-known/jwks.json` (200-500ms on first call, then cached 10 minutes)
2. **ES256 crypto verification:** ECDSA P-256 signature validation (~5-20ms)
3. **Fallback penalty:** When JWKS verification fails (key mismatch, network issue), the code fell back to `supabase.auth.getUser(token)` — a full remote round-trip (~1-2s) with **no timeout cap**

**What Procure does:** Uses `decodeJwt()` from the `jose` library — decode-only, no signature verification (~0ms). Validates only the `exp` claim. This is the proven pattern for Supabase Edge Functions.

**What we changed:**

1. Replaced `verify(token, jwk, 'ES256')` with `decode(token)` from `hono/jwt` — same decode-only approach as Procure
2. Removed the `getJWKS()` function and JWKS cache (no longer needed)
3. Added 3-second timeout on `verifyTokenRemotely()` fallback (Procure pattern) to prevent unbounded latency
4. Updated `authMiddlewareAllowInactive` with the same decode pattern

**Files modified:**

- `apps/server/src/middleware/auth.ts` — replaced ES256 verification with decode, removed JWKS fetch, added remote timeout

**Security notes:**

- HS256 tokens (legacy/custom) are still fully verified with the JWT secret — no change
- ES256 decode-only is safe because the Supabase gateway verifies the signature before forwarding
- Token expiration is still checked locally (`payload.exp < now`)
- The 3s remote timeout prevents a slow Supabase auth service from blocking all requests

**Validation:**

```bash
pnpm --filter server exec tsc --noEmit  # No type errors
pnpm --filter server test               # All 436 tests pass
# Check staging logs for absence of "ES256 JWKS verification failed" warnings
```

**Commit:** `perf: decode ES256 JWTs instead of full verification (Procure pattern)`

---

### Task 6.3 — Background data prefetch on mount (COMPLETED)

**What:** Expand `apps/client/src/lib/route-prefetch.ts` with `startBackgroundDataPreload()` that fires React Query prefetches for all primary routes immediately after first paint.

**Why this matters:** Task 2.7 added hover-based data prefetch — the user must hover a sidebar link to trigger data loading. Procure fires ALL route data prefetches in parallel immediately after the first paint, so data is already cached by the time the user navigates. The user never sees a data loading state on first navigation to any route.

**Procure's two-phase pattern:**

1. **Data prefetch: immediately** — async I/O, no main thread blocking
2. **Chunk prefetch: deferred 2s** — JS parsing is CPU-bound, defer to avoid jank

**What we changed:**

1. Added `startBackgroundDataPreload(queryClient, currentPath)` to `route-prefetch.ts`
2. Expanded `routeDataPrefetchMap` with `/billing` (subscription query) and `/users` (org-users query)
3. Moved preload orchestration from `App.tsx` to `main-layout.tsx` (where `queryClient` and `location` are available)
4. Data fires immediately, chunks deferred 2 seconds

**Critical detail:** Each prefetch entry must use the **exact same queryKey** as the page's React Query hook. If the keys don't match, React Query won't serve from the prefetch cache and the page will refetch.

**Files modified:**

- `apps/client/src/lib/route-prefetch.ts` — added `startBackgroundDataPreload()` and expanded prefetch map
- `apps/client/src/components/layout/main-layout.tsx` — added two-phase preload useEffect
- `apps/client/src/App.tsx` — removed `startBackgroundPreload()` call (moved to MainLayout)

**Validation:**

```bash
pnpm --filter client build  # Build succeeds
# Open DevTools Network tab → on login, see prefetch requests fire for
# /v1/projects, /v1/billing/subscription, /v1/org/users BEFORE navigating
```

**Commit:** `perf: add background data prefetch for all primary routes`

---

### Task 6.4 — Auth initialization optimization (COMPLETED)

**What:** Eliminate the auth spinner for returning users by caching the user object in localStorage and rendering immediately.

**Why this matters:** On app load, `auth-store.ts` called `adapter.getSession()` → `adapter.getCurrentUser()` sequentially. `getSession()` reads from localStorage (fast), but `getCurrentUser()` was calling `supabase.auth.getUser()` which makes a network round-trip. If the network is slow, the app shows a spinner for seconds — even for returning users who were logged in 5 minutes ago.

**What Procure does:** Caches the last known user in localStorage. On mount, renders the cached user immediately (no spinner). Validates the session in the background — if invalid, signs out. Returning users see the app shell instantly.

**What we changed:**

1. Added `revbrain_user` localStorage cache in `auth-store.ts`
2. On `initialize()`: read cached user first → set it immediately (no spinner) → validate session in background
3. Fixed `getCurrentUser()` in `RemoteAuthAdapter` to prefer the session's cached user (no `getUser()` network call)
4. Cache is cleared on logout, `SIGNED_OUT` event, or validation failure

**Files modified:**

- `apps/client/src/stores/auth-store.ts` — added localStorage user cache and instant render
- `apps/client/src/lib/adapters/remote/auth.ts` — `getCurrentUser()` prefers cached session user

**Validation:**

```bash
pnpm --filter client test  # All tests pass
# Hard refresh the app → should render app shell immediately with no spinner
```

**Commit:** `perf: eliminate auth initialization network round-trip`

---

### Task 6.5 — Composable skeleton component library (COMPLETED)

**What:** Create `apps/client/src/components/ui/skeleton.tsx` with composable skeleton primitives and page-specific compositions as Suspense fallbacks.

**Why this matters:** RevBrain had a single generic `PageSkeleton` (4 grey boxes + content block) for all routes. Procure has composable skeletons (Kpi, Table, Chart, Card) that match each page's actual layout. When the skeleton looks like the real page, users perceive the page as loading faster — the content "fills in" rather than "appearing from nothing."

**Components created:**

| Component           | Purpose             | Structure                               |
| ------------------- | ------------------- | --------------------------------------- |
| `Skeleton`          | Base building block | `animate-pulse rounded-md bg-slate-200` |
| `SkeletonKpi`       | KPI cards           | Label + big number + subtitle           |
| `SkeletonTable`     | Data tables         | Header row + N data rows                |
| `SkeletonCard`      | Content cards       | Avatar + 2-line text                    |
| `SkeletonChart`     | Chart areas         | Title + bar chart placeholder           |
| `DashboardSkeleton` | Dashboard page      | 4x KPI + 3x Chart + Table               |
| `ProjectsSkeleton`  | Projects list       | Search bar + Table                      |
| `BillingSkeleton`   | Billing page        | Plan card + Table                       |
| `TeamSkeleton`      | Team/Users page     | Header + Table                          |
| `WorkspaceSkeleton` | Project workspace   | Sidebar + Content                       |
| `PageSkeleton`      | Generic fallback    | Header + 4 cards + content block        |

All skeletons include `aria-hidden="true"` for accessibility.

**Files created/modified:**

- `apps/client/src/components/ui/skeleton.tsx` — new file with all components
- `apps/client/src/app/router.tsx` — replaced generic `PageSkeleton` with route-specific skeletons

**Validation:**

```bash
pnpm --filter client build  # Build succeeds
# Navigate to each page with throttled network → skeleton matches real layout
```

**Commit:** `perf: add composable skeleton library with page-specific loading states`

---

### Task 6.6 — Staggered page animations (COMPLETED)

**What:** Add CSS `fadeInUp` animation keyframes with staggered delays to key pages for perceived speed.

**Why this matters:** Without animation, page content appears all at once after data loads — creating a jarring "pop" effect. With staggered cascade (header → cards → content), the page feels like it's loading progressively even though all data arrived simultaneously. This is a pure perceived-performance technique.

**CSS added to `index.css`:**

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
.delay-150 {
  animation-delay: 150ms;
}
.delay-200 {
  animation-delay: 200ms;
}
.delay-300 {
  animation-delay: 300ms;
}
```

**Pages updated:**

- **DashboardPage** — Header (0ms) → KPI grid (50ms) → welcome card (100ms)
- **ProjectsPage** — Header (0ms) → stats (50ms) → content (100ms)
- **BillingPage** — Header (0ms) → plan card (100ms) → payment history (200ms)

**Guideline:** Animations are subtle (0.4s max, 8px translate) — perceived performance, not decoration.

**Files modified:**

- `apps/client/src/index.css` — added keyframes and delay utilities
- `apps/client/src/features/dashboard/pages/DashboardPage.tsx`
- `apps/client/src/features/projects/pages/ProjectsPage.tsx`
- `apps/client/src/features/billing/pages/BillingPage.tsx`

**Commit:** `perf: add staggered fade-in animations for perceived speed`

---

### Phase 6 Notes: Future ETag Strategy

If conditional GET (304 Not Modified) is needed in the future, **do not hash response bodies**. Instead:

1. **DB timestamp-based ETags:** Use a `updated_at` column as the ETag value: `W/"<table>-<id>-<updated_at_unix>"`. The server checks the timestamp in the database (fast index lookup) instead of reading the full response body.
2. **Version-based ETags:** For list endpoints, use a `version` counter on the parent entity (e.g., project). Increment on any child change. ETag = `W/"project-<id>-v<version>"`.
3. **Scope:** Only apply ETags to endpoints where the response payload is large (>10KB) AND the data changes infrequently (>1 minute between changes). For real-time data (tasks, work logs), Cache-Control `max-age=15` is sufficient.

---

## Summary

| Phase                      | Tasks        | Effort          | Cumulative Impact                        |
| -------------------------- | ------------ | --------------- | ---------------------------------------- |
| **0: Test Infrastructure** | 4 tasks      | 3 hours         | Measurement capability + baseline        |
| **1: Quick Wins**          | 6 tasks      | 1-2 days        | 30-40% fewer re-renders + fewer requests |
| **2: Core Performance**    | 7 tasks      | 3-5 days        | **3-5x perceived speed**                 |
| **3: Server & Network**    | 5 tasks      | 2-3 days        | 30-50% less data transfer                |
| **4: Advanced**            | 5 tasks      | 3-5 days        | Unblocked UI, instant nav                |
| **5: Regression Guard**    | 3 tasks      | 1 day           | Permanent guardrails                     |
| **6: Post-Impl Tuning**    | 6 tasks      | 1 day           | **Removed regressions + perceived perf** |
| **Total**                  | **36 tasks** | **~14-21 days** | **On par with or exceeding Procure**     |

---

## Operational Notes

**Performance Champion:** Assign one developer as the performance champion for this effort. Responsibilities:

- Run `pnpm perf:compare` after each phase and share results with the team
- Present before/after metrics in sprint reviews — visible improvement motivates continued investment
- Monitor the nightly CI results (see below) and investigate regressions promptly

**Nightly staging runs:** After Phase 0 is complete, set up a nightly CI job that runs `pnpm perf:test` against the staging environment and posts results to Slack (or your team's notification channel). This catches performance regressions from non-performance PRs — someone adds a heavy import, a new unoptimized list, or an N+1 query, and you know within 24 hours instead of discovering it weeks later.

**Vite chunk splitting — already done:** RevBrain already has 7 manual chunks configured in `apps/client/vite.config.ts` (react-vendor, query-vendor, ui-vendor, chart-vendor, geo-vendor, form-vendor, i18n-vendor) plus gzip+brotli compression and a rollup visualizer. This was identified as "RevBrain ahead" in the [speedup_roadmap.md](./speedup_roadmap.md) analysis. No additional chunk splitting task is needed — Task 5.2's `size-limit` budgets should reference these existing chunks.

---

## Metrics to Capture Before Starting

Run `pnpm perf:baseline` after Phase 0 and commit `e2e/perf-baselines.json`:

1. Login page load time (ms)
2. Dashboard domInteractive (ms)
3. Route transition time (ms)
4. Total JS transferred (KB)
5. DOM node count on projects page
6. Resource hints count
7. API cache headers presence
8. Chunk cache hit ratio on second navigation
9. Long task count and total duration
10. JS heap size (MB)
11. Concurrent API request count

These become the "before" numbers. After Phase 5, the same test produces the "after" numbers — the delta is the measurable result of this effort. The `perf:compare` script will output a side-by-side comparison.
