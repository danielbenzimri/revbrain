/**
 * Web Vitals Collection
 *
 * Collects Core Web Vitals (LCP, CLS, INP, TTFB, FCP) on every page load.
 * Reports to console in development, Sentry in production.
 *
 * Called from deferred init in main.tsx (Task 4.2) so it doesn't
 * compete with React's initial render.
 */
import type { Metric } from 'web-vitals';

function reportMetric(metric: Metric): void {
  const label = `[WebVitals] ${metric.name}: ${Math.round(metric.value)}ms (rating: ${metric.rating})`;

  if (import.meta.env.DEV) {
    console.log(label, { id: metric.id, entries: metric.entries });
    return;
  }

  // Production: send to Sentry Performance if available
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const Sentry = (window as any).__SENTRY__;
  if (Sentry?.captureMessage) {
    Sentry.captureMessage(label, {
      level: 'info',
      tags: { vital: metric.name, rating: metric.rating },
    });
  }
}

/**
 * Initialize Web Vitals collection.
 * Uses dynamic import so the ~4KB web-vitals library is only loaded
 * during idle time, not in the critical path.
 */
export async function initWebVitals(): Promise<void> {
  try {
    const { onLCP, onCLS, onINP, onTTFB, onFCP } = await import('web-vitals');

    onLCP(reportMetric);
    onCLS(reportMetric);
    onINP(reportMetric);
    onTTFB(reportMetric);
    onFCP(reportMetric);
  } catch {
    // Silent failure — web vitals are non-critical
  }
}
