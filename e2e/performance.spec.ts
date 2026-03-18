import {
  test,
  expect,
  collectNavigationMetrics,
  measureRouteTransition,
  getChunkLoadInfo,
  countDOMNodesInSelector,
  setupLongTaskObserver,
  collectLongTasks,
  measureMemoryUsage,
} from './fixtures/perf';
import { test as baseTest } from '@playwright/test';

/**
 * Performance E2E Test Suite
 *
 * Regression guard with tightened budgets after optimization phases 1-4.
 * Budgets set at measured_value x 1.2 (20% buffer) per Task 5.3.
 *
 * All tests print [PERF] prefixed metrics for automated baseline capture.
 *
 * @see docs/roadmap/speedup_tasks.md — Task 5.3
 */

// ────────────────────────────────────────────────────────
// Test Group 1: Login & Initial Load (unauthenticated)
// ────────────────────────────────────────────────────────

baseTest.describe('Performance — Login & Initial Load', () => {
  baseTest('login page loads within budget', async ({ page }) => {
    const metrics = await measureRouteTransition(page, '/login');

    console.log(`[PERF] login.loadTime=${metrics.wallClockMs}ms`);
    console.log(`[PERF] login.domNodes=${metrics.domNodeCount}`);

    expect(metrics.wallClockMs).toBeLessThan(3000);
    expect(metrics.domNodeCount).toBeLessThan(500);
  });
});

// ────────────────────────────────────────────────────────
// Test Group 2: Authenticated Navigation
// ────────────────────────────────────────────────────────

test.describe('Performance — Authenticated Navigation', () => {
  test('dashboard loads within budget after login', async ({ authenticatedPage }) => {
    await authenticatedPage.waitForLoadState('networkidle');

    const metrics = await collectNavigationMetrics(authenticatedPage);

    console.log(`[PERF] dashboard.domInteractive=${metrics.domInteractive}ms`);
    console.log(`[PERF] dashboard.domContentLoaded=${metrics.domContentLoaded}ms`);
    console.log(`[PERF] dashboard.loadComplete=${metrics.loadComplete}ms`);
    console.log(`[PERF] dashboard.fcp=${metrics.fcp}ms`);
    console.log(`[PERF] dashboard.domNodes=${metrics.domNodeCount}`);

    expect(metrics.domInteractive).toBeLessThan(3000);
  });

  test('route transition to /projects within budget', async ({ authenticatedPage }) => {
    await authenticatedPage.waitForLoadState('networkidle');

    const transition = await measureRouteTransition(authenticatedPage, '/projects');

    console.log(`[PERF] routeTransition.projects=${transition.wallClockMs}ms`);
    console.log(`[PERF] routeTransition.projects.domNodes=${transition.domNodeCount}`);

    expect(transition.wallClockMs).toBeLessThan(1000);
  });
});

// ────────────────────────────────────────────────────────
// Test Group 3: JS Bundle Analysis
// ────────────────────────────────────────────────────────

test.describe('Performance — JS Bundle Analysis', () => {
  test('total JS transferred stays within budget', async ({ authenticatedPage }) => {
    await authenticatedPage.waitForLoadState('networkidle');

    const chunkInfo = await getChunkLoadInfo(authenticatedPage);

    console.log(`[PERF] js.totalTransferredKB=${chunkInfo.totalSizeKB}`);
    console.log(`[PERF] js.chunkCount=${chunkInfo.totalCount}`);

    for (const chunk of chunkInfo.chunks) {
      console.log(`[PERF] js.chunk.${chunk.name}=${chunk.sizeKB}KB cached=${chunk.cached}`);
    }

    expect(chunkInfo.totalSizeKB).toBeLessThan(1500);
  });
});

// ────────────────────────────────────────────────────────
// Test Group 4: Chunk Caching
// ────────────────────────────────────────────────────────

test.describe('Performance — Chunk Caching', () => {
  test('second navigation shows improved cache hits', async ({ authenticatedPage }) => {
    // First visit — loads fresh chunks
    await authenticatedPage.goto('/projects');
    await authenticatedPage.waitForLoadState('networkidle');

    // Navigate away
    await authenticatedPage.goto('/');
    await authenticatedPage.waitForLoadState('networkidle');

    // Clear performance entries to isolate second visit
    await authenticatedPage.evaluate(() => performance.clearResourceTimings());

    // Second visit — should use cached chunks
    await authenticatedPage.goto('/projects');
    await authenticatedPage.waitForLoadState('networkidle');

    const chunkInfo = await getChunkLoadInfo(authenticatedPage);

    console.log(`[PERF] caching.secondVisit.totalChunks=${chunkInfo.totalCount}`);
    console.log(`[PERF] caching.secondVisit.cachedChunks=${chunkInfo.cachedCount}`);
    console.log(
      `[PERF] caching.secondVisit.cacheHitRatio=${(chunkInfo.cacheHitRatio * 100).toFixed(1)}%`
    );

    // After optimization phases, expect meaningful cache hits
    expect(chunkInfo.cacheHitRatio).toBeGreaterThan(0.6);
  });
});

// ────────────────────────────────────────────────────────
// Test Group 5: DOM Node Count
// ────────────────────────────────────────────────────────

test.describe('Performance — DOM Node Count', () => {
  test('projects page DOM count stays within budget', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/projects');
    await authenticatedPage.waitForLoadState('networkidle');

    const totalNodes = await authenticatedPage.evaluate(
      () => document.querySelectorAll('*').length
    );

    console.log(`[PERF] dom.projectsPage.totalNodes=${totalNodes}`);

    expect(totalNodes).toBeLessThan(1500);
  });
});

// ────────────────────────────────────────────────────────
// Test Group 6: Resource Hints (unauthenticated)
// ────────────────────────────────────────────────────────

baseTest.describe('Performance — Resource Hints', () => {
  baseTest('index.html includes preconnect and dns-prefetch hints', async ({ page }) => {
    await page.goto('/login');
    await page.waitForLoadState('domcontentloaded');

    const hints = await page.evaluate(() => {
      const preconnects = document.querySelectorAll('link[rel="preconnect"]');
      const dnsPrefetch = document.querySelectorAll('link[rel="dns-prefetch"]');
      return {
        preconnectCount: preconnects.length,
        dnsPrefetchCount: dnsPrefetch.length,
        total: preconnects.length + dnsPrefetch.length,
      };
    });

    console.log(`[PERF] hints.preconnect=${hints.preconnectCount}`);
    console.log(`[PERF] hints.dnsPrefetch=${hints.dnsPrefetchCount}`);
    console.log(`[PERF] hints.total=${hints.total}`);

    expect(hints.total).toBeGreaterThanOrEqual(6);
  });
});

// ────────────────────────────────────────────────────────
// Test Group 7: API Cache Headers
// ────────────────────────────────────────────────────────

test.describe('Performance — API Cache Headers', () => {
  test('API GET responses include cache headers', async ({ authenticatedPage }) => {
    const apiResponses: { url: string; cacheControl: string | null; etag: string | null }[] = [];

    authenticatedPage.on('response', (response) => {
      const url = response.url();
      if (url.includes('/v1/') && response.request().method() === 'GET') {
        apiResponses.push({
          url: url.split('/v1/')[1] || url,
          cacheControl: response.headers()['cache-control'] || null,
          etag: response.headers()['etag'] || null,
        });
      }
    });

    await authenticatedPage.goto('/');
    await authenticatedPage.waitForLoadState('networkidle');

    const withCacheControl = apiResponses.filter((r) => r.cacheControl);
    const withEtag = apiResponses.filter((r) => r.etag);

    console.log(`[PERF] api.totalGETRequests=${apiResponses.length}`);
    console.log(`[PERF] api.withCacheControl=${withCacheControl.length}`);
    console.log(`[PERF] api.withEtag=${withEtag.length}`);

    for (const r of apiResponses.slice(0, 10)) {
      console.log(
        `[PERF] api.response.${r.url} cache=${r.cacheControl || 'none'} etag=${r.etag || 'none'}`
      );
    }

    // After Phase 3 ETag implementation, expect ETags on API responses
    if (apiResponses.length > 0) {
      const etagRatio = withEtag.length / apiResponses.length;
      expect(etagRatio).toBeGreaterThan(0.5);
    }
  });
});

// ────────────────────────────────────────────────────────
// Test Group 8: Long Tasks
// ────────────────────────────────────────────────────────

test.describe('Performance — Long Tasks', () => {
  test('main thread blocking stays within budget', async ({ authenticatedPage }) => {
    // Long task observer is set up via fixture — need a fresh page with addInitScript
    // We navigate to a new page to trigger the observer
    await setupLongTaskObserver(authenticatedPage);

    await authenticatedPage.goto('/');
    await authenticatedPage.waitForLoadState('networkidle');

    // Give a short pause for any remaining tasks to complete
    await authenticatedPage.waitForTimeout(1000);

    const longTasks = await collectLongTasks(authenticatedPage);

    const totalDuration = longTasks.reduce((sum, t) => sum + t.duration, 0);

    console.log(`[PERF] longTasks.count=${longTasks.length}`);
    console.log(`[PERF] longTasks.totalDuration=${Math.round(totalDuration)}ms`);

    for (const task of longTasks.slice(0, 5)) {
      console.log(
        `[PERF] longTask.at=${Math.round(task.startTime)}ms duration=${Math.round(task.duration)}ms`
      );
    }

    expect(longTasks.length).toBeLessThan(5);
  });
});

// ────────────────────────────────────────────────────────
// Test Group 9: Module View Load
// ────────────────────────────────────────────────────────

test.describe('Performance — Module View Load', () => {
  test('heaviest module view loads within budget', async ({ authenticatedPage }) => {
    // Navigate to the projects list first
    await authenticatedPage.goto('/projects');
    await authenticatedPage.waitForLoadState('networkidle');

    // Find the first project link and navigate to it
    const projectLink = authenticatedPage.locator('a[href*="/project/"]').first();

    if ((await projectLink.count()) === 0) {
      console.log('[PERF] moduleLoad — skipped: no projects available');
      test.skip();
      return;
    }

    const href = await projectLink.getAttribute('href');
    if (!href) {
      console.log('[PERF] moduleLoad — skipped: no project href found');
      test.skip();
      return;
    }

    // Navigate to a module view (modules page within project)
    const modulesUrl = `${href}/modules`;
    const transition = await measureRouteTransition(authenticatedPage, modulesUrl);

    console.log(`[PERF] moduleView.loadTime=${transition.wallClockMs}ms`);
    console.log(`[PERF] moduleView.domNodes=${transition.domNodeCount}`);

    expect(transition.wallClockMs).toBeLessThan(5000);
  });
});

// ────────────────────────────────────────────────────────
// Test Group 10: Memory Baseline
// ────────────────────────────────────────────────────────

test.describe('Performance — Memory Baseline', () => {
  test('JS heap size stays within budget', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/projects');
    await authenticatedPage.waitForLoadState('networkidle');

    const memory = await measureMemoryUsage(authenticatedPage);

    if (!memory) {
      console.log('[PERF] memory — skipped: performance.memory not available');
      console.log('[PERF] memory — ensure --enable-precise-memory-info flag is set');
      test.skip();
      return;
    }

    console.log(`[PERF] memory.usedJSHeapMB=${memory.usedJSHeapSizeMB}`);
    console.log(`[PERF] memory.totalJSHeapMB=${memory.totalJSHeapSizeMB}`);
    console.log(`[PERF] memory.heapLimitMB=${memory.jsHeapSizeLimitMB}`);

    expect(memory.usedJSHeapSizeMB).toBeLessThan(100);
  });
});

// ────────────────────────────────────────────────────────
// Test Group 11: Concurrent API Requests
// ────────────────────────────────────────────────────────

test.describe('Performance — Concurrent API Requests', () => {
  test('dashboard API request count is tracked', async ({ authenticatedPage }) => {
    const apiRequests: { url: string; startTime: number }[] = [];
    const startTime = Date.now();

    authenticatedPage.on('request', (request) => {
      const url = request.url();
      if (url.includes('/v1/') && request.method() === 'GET') {
        apiRequests.push({
          url: url.split('/v1/')[1] || url,
          startTime: Date.now() - startTime,
        });
      }
    });

    await authenticatedPage.goto('/');
    await authenticatedPage.waitForLoadState('networkidle');

    console.log(`[PERF] api.dashboard.totalRequests=${apiRequests.length}`);

    // Find concurrent requests (requests starting within 50ms of each other)
    let maxConcurrent = 0;
    for (let i = 0; i < apiRequests.length; i++) {
      let concurrent = 1;
      for (let j = i + 1; j < apiRequests.length; j++) {
        if (Math.abs(apiRequests[j].startTime - apiRequests[i].startTime) < 50) {
          concurrent++;
        }
      }
      maxConcurrent = Math.max(maxConcurrent, concurrent);
    }

    console.log(`[PERF] api.dashboard.maxConcurrent=${maxConcurrent}`);

    for (const r of apiRequests.slice(0, 10)) {
      console.log(`[PERF] api.request.${r.url} at=${r.startTime}ms`);
    }

    // Baseline only — logged for tracking
  });
});
