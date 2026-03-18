import { Page } from '@playwright/test';
import { test, expect } from './auth';

/**
 * Performance measurement helpers for E2E tests.
 *
 * These fixtures provide consistent, reusable functions for collecting
 * performance metrics across the Geometrix application. Used by
 * e2e/performance.spec.ts to establish baselines and detect regressions.
 *
 * @see docs/roadmap/speedup_tasks.md — Task 0.1
 */

// ────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────

export interface NavigationMetrics {
  ttfb: number;
  domContentLoaded: number;
  loadComplete: number;
  domInteractive: number;
  fcp: number | null;
  lcp: number | null;
  domNodeCount: number;
  scriptCount: number;
  totalJsTransferredKB: number;
  cachedChunks: number;
  totalChunks: number;
}

export interface RouteTransitionMetrics {
  wallClockMs: number;
  domNodeCount: number;
}

export interface ChunkInfo {
  name: string;
  sizeKB: number;
  cached: boolean;
}

export interface ChunkLoadInfo {
  chunks: ChunkInfo[];
  totalSizeKB: number;
  cachedCount: number;
  totalCount: number;
  cacheHitRatio: number;
}

export interface LongTask {
  duration: number;
  startTime: number;
}

export interface MemoryInfo {
  usedJSHeapSizeMB: number;
  totalJSHeapSizeMB: number;
  jsHeapSizeLimitMB: number;
}

// ────────────────────────────────────────────────────────
// 1. collectNavigationMetrics
// ────────────────────────────────────────────────────────

/**
 * Collects comprehensive navigation timing metrics from the current page.
 * Should be called AFTER the page has fully loaded (networkidle).
 */
export async function collectNavigationMetrics(page: Page): Promise<NavigationMetrics> {
  return await page.evaluate(() => {
    const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;

    // FCP from paint entries
    const paintEntries = performance.getEntriesByType('paint');
    const fcpEntry = paintEntries.find((e) => e.name === 'first-contentful-paint');

    // LCP — may not be available if PerformanceObserver wasn't set up
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const lcpValue = (window as any).__lcp as number | undefined;

    // DOM node count
    const domNodeCount = document.querySelectorAll('*').length;

    // Script count
    const scriptCount = document.querySelectorAll('script').length;

    // JS resource timing
    const jsResources = performance
      .getEntriesByType('resource')
      .filter((r) => r.name.endsWith('.js') || r.name.includes('.js?'));

    const totalJsTransferredKB = jsResources.reduce((sum, r) => {
      const res = r as PerformanceResourceTiming;
      return sum + res.transferSize / 1024;
    }, 0);

    const cachedChunks = jsResources.filter((r) => {
      const res = r as PerformanceResourceTiming;
      return res.transferSize === 0;
    }).length;

    return {
      ttfb: nav ? nav.responseStart - nav.requestStart : 0,
      domContentLoaded: nav ? nav.domContentLoadedEventEnd - nav.startTime : 0,
      loadComplete: nav ? nav.loadEventEnd - nav.startTime : 0,
      domInteractive: nav ? nav.domInteractive - nav.startTime : 0,
      fcp: fcpEntry ? fcpEntry.startTime : null,
      lcp: lcpValue ?? null,
      domNodeCount,
      scriptCount,
      totalJsTransferredKB: Math.round(totalJsTransferredKB * 100) / 100,
      cachedChunks,
      totalChunks: jsResources.length,
    };
  });
}

// ────────────────────────────────────────────────────────
// 2. measureRouteTransition
// ────────────────────────────────────────────────────────

/**
 * Navigates to a URL and measures the wall-clock transition time.
 * Returns time to domcontentloaded + networkidle and final DOM node count.
 */
export async function measureRouteTransition(
  page: Page,
  url: string
): Promise<RouteTransitionMetrics> {
  const start = Date.now();

  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle');

  const wallClockMs = Date.now() - start;

  const domNodeCount = await page.evaluate(() => document.querySelectorAll('*').length);

  return { wallClockMs, domNodeCount };
}

// ────────────────────────────────────────────────────────
// 3. countDOMNodesInSelector
// ────────────────────────────────────────────────────────

/**
 * Counts child elements inside a specific container.
 * Useful for measuring virtualization effectiveness.
 */
export async function countDOMNodesInSelector(page: Page, selector: string): Promise<number> {
  return await page.evaluate((sel) => {
    const container = document.querySelector(sel);
    if (!container) return 0;
    return container.querySelectorAll('*').length;
  }, selector);
}

// ────────────────────────────────────────────────────────
// 4. getChunkLoadInfo
// ────────────────────────────────────────────────────────

/**
 * Reads Resource Timing for .js files and reports per-chunk info.
 * transferSize === 0 reliably indicates cache hit in Chrome.
 */
export async function getChunkLoadInfo(page: Page): Promise<ChunkLoadInfo> {
  return await page.evaluate(() => {
    const jsResources = performance
      .getEntriesByType('resource')
      .filter((r) => r.name.endsWith('.js') || r.name.includes('.js?'));

    const chunks: { name: string; sizeKB: number; cached: boolean }[] = jsResources.map((r) => {
      const res = r as PerformanceResourceTiming;
      const urlParts = res.name.split('/');
      return {
        name: urlParts[urlParts.length - 1].split('?')[0],
        sizeKB: Math.round((res.transferSize / 1024) * 100) / 100,
        cached: res.transferSize === 0,
      };
    });

    const cachedCount = chunks.filter((c) => c.cached).length;
    const totalCount = chunks.length;
    const totalSizeKB = chunks.reduce((sum, c) => sum + c.sizeKB, 0);

    return {
      chunks,
      totalSizeKB: Math.round(totalSizeKB * 100) / 100,
      cachedCount,
      totalCount,
      cacheHitRatio: totalCount > 0 ? cachedCount / totalCount : 0,
    };
  });
}

// ────────────────────────────────────────────────────────
// 5. measureLongTasks
// ────────────────────────────────────────────────────────

/**
 * Sets up long task observation BEFORE navigation via addInitScript.
 * Must be called before navigating to the page under test.
 * After navigation, call collectLongTasks() to retrieve results.
 *
 * Important: The observer MUST be attached before navigation,
 * otherwise early long tasks during page load are missed.
 */
export async function setupLongTaskObserver(page: Page): Promise<void> {
  await page.addInitScript(() => {
    /* eslint-disable @typescript-eslint/no-explicit-any */
    (window as any).__longTasks = [];
    new PerformanceObserver((list) => {
      const tasks = (window as any).__longTasks as {
        duration: number;
        startTime: number;
      }[];
      for (const entry of list.getEntries()) {
        tasks.push({ duration: entry.duration, startTime: entry.startTime });
      }
    }).observe({ type: 'longtask', buffered: true });
    /* eslint-enable @typescript-eslint/no-explicit-any */
  });
}

/**
 * Collects long task results after navigation.
 * Call this after the page has loaded and settled.
 */
export async function collectLongTasks(page: Page): Promise<LongTask[]> {
  return await page.evaluate(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return ((window as any).__longTasks as LongTask[]) || [];
  });
}

// ────────────────────────────────────────────────────────
// 6. measureMemoryUsage
// ────────────────────────────────────────────────────────

/**
 * Reads performance.memory (Chrome only) for JS heap size.
 * Requires --enable-precise-memory-info Chrome flag (see Task 0.3).
 * Returns null if the API is not available.
 */
export async function measureMemoryUsage(page: Page): Promise<MemoryInfo | null> {
  return await page.evaluate(() => {
    const perf = performance as Performance & {
      memory?: {
        usedJSHeapSize: number;
        totalJSHeapSize: number;
        jsHeapSizeLimit: number;
      };
    };

    if (!perf.memory) return null;

    return {
      usedJSHeapSizeMB: Math.round((perf.memory.usedJSHeapSize / 1024 / 1024) * 100) / 100,
      totalJSHeapSizeMB: Math.round((perf.memory.totalJSHeapSize / 1024 / 1024) * 100) / 100,
      jsHeapSizeLimitMB: Math.round((perf.memory.jsHeapSizeLimit / 1024 / 1024) * 100) / 100,
    };
  });
}

// ────────────────────────────────────────────────────────
// Re-exports
// ────────────────────────────────────────────────────────

export { test, expect };
