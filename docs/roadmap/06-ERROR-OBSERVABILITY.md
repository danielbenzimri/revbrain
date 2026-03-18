# Session 06: Error Handling & Observability

**Priority:** Medium-High
**Estimated Duration:** 1 day
**Dependencies:** Session 01 (Code Quality)

---

## Objective

Implement comprehensive error tracking, structured logging, and monitoring to ensure issues are detected and debugged quickly. This session focuses on solutions that work without Redis.

---

## Deliverables

### 1. Error Tracking (Sentry)

**Install Dependencies:**

```bash
# Backend
pnpm add @sentry/node --filter @geometrix/server

# Frontend
pnpm add @sentry/react --filter @geometrix/client
```

**Backend Sentry Setup:** `apps/server/src/lib/sentry.ts`

```typescript
import * as Sentry from '@sentry/node';

const isProduction = process.env.NODE_ENV === 'production';

export function initSentry() {
  if (!process.env.SENTRY_DSN) {
    console.warn('SENTRY_DSN not configured, error tracking disabled');
    return;
  }

  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV || 'development',
    release: process.env.VERCEL_GIT_COMMIT_SHA || 'local',

    // Performance monitoring
    tracesSampleRate: isProduction ? 0.1 : 1.0,

    // Only send errors in production
    enabled: isProduction,

    // Filter sensitive data
    beforeSend(event, hint) {
      // Remove sensitive headers
      if (event.request?.headers) {
        delete event.request.headers['authorization'];
        delete event.request.headers['cookie'];
      }

      // Remove sensitive data from body
      if (event.request?.data) {
        const data =
          typeof event.request.data === 'string'
            ? JSON.parse(event.request.data)
            : event.request.data;

        if (data.password) data.password = '[REDACTED]';
        if (data.token) data.token = '[REDACTED]';

        event.request.data = JSON.stringify(data);
      }

      return event;
    },

    // Ignore specific errors
    ignoreErrors: ['Request aborted', 'Network request failed', 'Rate limited'],
  });
}

// Capture error with context
export function captureError(error: Error, context?: Record<string, any>) {
  Sentry.withScope((scope) => {
    if (context) {
      scope.setExtras(context);
    }
    Sentry.captureException(error);
  });
}

// Set user context
export function setUserContext(user: { id: string; email: string; organizationId?: string }) {
  Sentry.setUser({
    id: user.id,
    email: user.email,
    organizationId: user.organizationId,
  });
}

// Clear user context
export function clearUserContext() {
  Sentry.setUser(null);
}
```

**Sentry Middleware:** `apps/server/src/middleware/sentry.ts`

```typescript
import { createMiddleware } from 'hono/factory';
import * as Sentry from '@sentry/node';
import { captureError, setUserContext } from '../lib/sentry';

export const sentryMiddleware = createMiddleware(async (c, next) => {
  const transaction = Sentry.startTransaction({
    op: 'http.server',
    name: `${c.req.method} ${c.req.path}`,
  });

  Sentry.getCurrentHub().configureScope((scope) => {
    scope.setSpan(transaction);
  });

  try {
    await next();

    // Set user context if authenticated
    const user = c.var?.user;
    if (user) {
      setUserContext({
        id: user.id,
        email: user.email,
        organizationId: user.organizationId,
      });
    }

    transaction.setHttpStatus(c.res.status);
  } catch (error) {
    transaction.setHttpStatus(500);

    captureError(error as Error, {
      requestId: c.var?.requestId,
      path: c.req.path,
      method: c.req.method,
      userId: c.var?.user?.id,
    });

    throw error;
  } finally {
    transaction.finish();
  }
});
```

**Frontend Sentry Setup:** `apps/client/src/lib/sentry.ts`

```typescript
import * as Sentry from '@sentry/react';
import { useEffect } from 'react';
import {
  createRoutesFromChildren,
  matchRoutes,
  useLocation,
  useNavigationType,
} from 'react-router-dom';

export function initSentry() {
  if (!import.meta.env.VITE_SENTRY_DSN) {
    console.warn('Sentry DSN not configured');
    return;
  }

  Sentry.init({
    dsn: import.meta.env.VITE_SENTRY_DSN,
    environment: import.meta.env.MODE,
    release: import.meta.env.VITE_COMMIT_SHA || 'local',

    integrations: [
      Sentry.reactRouterV6BrowserTracingIntegration({
        useEffect,
        useLocation,
        useNavigationType,
        createRoutesFromChildren,
        matchRoutes,
      }),
      Sentry.replayIntegration({
        maskAllText: false,
        blockAllMedia: false,
      }),
    ],

    // Performance
    tracesSampleRate: import.meta.env.PROD ? 0.1 : 1.0,

    // Session replay
    replaysSessionSampleRate: 0.1,
    replaysOnErrorSampleRate: 1.0,

    // Filter sensitive data
    beforeSend(event) {
      // Remove sensitive data from breadcrumbs
      if (event.breadcrumbs) {
        event.breadcrumbs = event.breadcrumbs.filter((breadcrumb) => {
          if (breadcrumb.category === 'xhr' || breadcrumb.category === 'fetch') {
            // Don't log auth endpoints
            if (breadcrumb.data?.url?.includes('/auth/')) {
              return false;
            }
          }
          return true;
        });
      }
      return event;
    },
  });
}

// Error boundary component
export const SentryErrorBoundary = Sentry.ErrorBoundary;

// Set user
export function setUser(user: { id: string; email: string }) {
  Sentry.setUser(user);
}

// Clear user
export function clearUser() {
  Sentry.setUser(null);
}
```

### 2. Structured Logging

**Logger Service:** `apps/server/src/lib/logger.ts`

```typescript
type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogContext {
  requestId?: string;
  userId?: string;
  organizationId?: string;
  [key: string]: unknown;
}

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: LogContext;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
}

class Logger {
  private minLevel: LogLevel;
  private levelPriority: Record<LogLevel, number> = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
  };

  constructor() {
    this.minLevel = (process.env.LOG_LEVEL as LogLevel) || 'info';
  }

  private shouldLog(level: LogLevel): boolean {
    return this.levelPriority[level] >= this.levelPriority[this.minLevel];
  }

  private formatLog(level: LogLevel, message: string, context?: LogContext, error?: Error): string {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      context,
    };

    if (error) {
      entry.error = {
        name: error.name,
        message: error.message,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
      };
    }

    return JSON.stringify(entry);
  }

  debug(message: string, context?: LogContext): void {
    if (this.shouldLog('debug')) {
      console.debug(this.formatLog('debug', message, context));
    }
  }

  info(message: string, context?: LogContext): void {
    if (this.shouldLog('info')) {
      console.info(this.formatLog('info', message, context));
    }
  }

  warn(message: string, context?: LogContext): void {
    if (this.shouldLog('warn')) {
      console.warn(this.formatLog('warn', message, context));
    }
  }

  error(message: string, error?: Error, context?: LogContext): void {
    if (this.shouldLog('error')) {
      console.error(this.formatLog('error', message, context, error));
    }
  }

  // Create a child logger with preset context
  child(context: LogContext): ChildLogger {
    return new ChildLogger(this, context);
  }
}

class ChildLogger {
  constructor(
    private parent: Logger,
    private context: LogContext
  ) {}

  debug(message: string, context?: LogContext): void {
    this.parent.debug(message, { ...this.context, ...context });
  }

  info(message: string, context?: LogContext): void {
    this.parent.info(message, { ...this.context, ...context });
  }

  warn(message: string, context?: LogContext): void {
    this.parent.warn(message, { ...this.context, ...context });
  }

  error(message: string, error?: Error, context?: LogContext): void {
    this.parent.error(message, error, { ...this.context, ...context });
  }
}

export const logger = new Logger();
export type { Logger, ChildLogger, LogContext };
```

**Request Logger Middleware:** `apps/server/src/middleware/logger.ts`

```typescript
import { createMiddleware } from 'hono/factory';
import { logger, type ChildLogger } from '../lib/logger';

declare module 'hono' {
  interface ContextVariableMap {
    logger: ChildLogger;
  }
}

export const loggerMiddleware = createMiddleware(async (c, next) => {
  const requestId = c.var.requestId || 'unknown';
  const startTime = Date.now();

  // Create request-scoped logger
  const requestLogger = logger.child({ requestId });
  c.set('logger', requestLogger);

  // Log request start
  requestLogger.info('Request started', {
    method: c.req.method,
    path: c.req.path,
    userAgent: c.req.header('user-agent'),
    ip: c.req.header('x-forwarded-for')?.split(',')[0],
  });

  try {
    await next();
  } finally {
    const duration = Date.now() - startTime;
    const userId = c.var?.user?.id;

    // Log request completion
    requestLogger.info('Request completed', {
      userId,
      status: c.res.status,
      duration,
    });
  }
});
```

### 3. Health Check Endpoint

**Enhanced Health Check:** `apps/server/src/v1/routes/health.ts`

```typescript
import { Hono } from 'hono';
import { db } from '../../lib/db';
import { sql } from 'drizzle-orm';

const app = new Hono();

interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  version: string;
  uptime: number;
  checks: {
    database: HealthCheck;
    memory: HealthCheck;
  };
}

interface HealthCheck {
  status: 'pass' | 'fail';
  latency?: number;
  message?: string;
}

const startTime = Date.now();

app.get('/', async (c) => {
  const checks: HealthStatus['checks'] = {
    database: await checkDatabase(),
    memory: checkMemory(),
  };

  const allHealthy = Object.values(checks).every((check) => check.status === 'pass');
  const status: HealthStatus['status'] = allHealthy ? 'healthy' : 'degraded';

  const health: HealthStatus = {
    status,
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '1.0.0',
    uptime: Math.floor((Date.now() - startTime) / 1000),
    checks,
  };

  return c.json(health, allHealthy ? 200 : 503);
});

// Lightweight health check for load balancers
app.get('/live', (c) => c.json({ status: 'ok' }));

// Readiness check (includes dependency checks)
app.get('/ready', async (c) => {
  const dbCheck = await checkDatabase();

  if (dbCheck.status === 'fail') {
    return c.json({ status: 'not ready', reason: 'database' }, 503);
  }

  return c.json({ status: 'ready' });
});

async function checkDatabase(): Promise<HealthCheck> {
  const start = Date.now();

  try {
    await db.execute(sql`SELECT 1`);
    return {
      status: 'pass',
      latency: Date.now() - start,
    };
  } catch (error) {
    return {
      status: 'fail',
      message: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

function checkMemory(): HealthCheck {
  const used = process.memoryUsage();
  const heapUsedMB = Math.round(used.heapUsed / 1024 / 1024);
  const heapTotalMB = Math.round(used.heapTotal / 1024 / 1024);
  const usagePercent = Math.round((heapUsedMB / heapTotalMB) * 100);

  // Warn if using more than 90% of heap
  if (usagePercent > 90) {
    return {
      status: 'fail',
      message: `High memory usage: ${usagePercent}% (${heapUsedMB}MB / ${heapTotalMB}MB)`,
    };
  }

  return {
    status: 'pass',
    message: `${usagePercent}% (${heapUsedMB}MB / ${heapTotalMB}MB)`,
  };
}

export default app;
```

### 4. Performance Monitoring

**Timing Utilities:** `apps/server/src/lib/timing.ts`

```typescript
import { logger } from './logger';

export interface TimingResult<T> {
  result: T;
  duration: number;
}

// Measure async function execution time
export async function measure<T>(
  name: string,
  fn: () => Promise<T>,
  context?: Record<string, unknown>
): Promise<TimingResult<T>> {
  const start = performance.now();

  try {
    const result = await fn();
    const duration = Math.round(performance.now() - start);

    // Log slow operations (>100ms)
    if (duration > 100) {
      logger.warn(`Slow operation: ${name}`, {
        duration,
        ...context,
      });
    } else {
      logger.debug(`Operation: ${name}`, {
        duration,
        ...context,
      });
    }

    return { result, duration };
  } catch (error) {
    const duration = Math.round(performance.now() - start);
    logger.error(`Operation failed: ${name}`, error as Error, {
      duration,
      ...context,
    });
    throw error;
  }
}

// Decorator for measuring method execution
export function timed(threshold = 100) {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      const start = performance.now();
      const result = await originalMethod.apply(this, args);
      const duration = Math.round(performance.now() - start);

      if (duration > threshold) {
        logger.warn(`Slow method: ${propertyKey}`, { duration });
      }

      return result;
    };

    return descriptor;
  };
}
```

**Usage in Repository:**

```typescript
import { measure } from '../../lib/timing';

class DrizzleUserRepository implements UserRepository {
  async findById(id: string) {
    const { result } = await measure(
      'UserRepository.findById',
      () => this.db.query.users.findFirst({ where: eq(users.id, id) }),
      { userId: id }
    );
    return result ?? null;
  }
}
```

### 5. Metrics Collection (Lightweight)

**Metrics Service:** `apps/server/src/lib/metrics.ts`

```typescript
interface MetricEntry {
  name: string;
  value: number;
  tags: Record<string, string>;
  timestamp: number;
}

class Metrics {
  private buffer: MetricEntry[] = [];
  private flushInterval: NodeJS.Timeout;

  constructor() {
    // Flush metrics every 60 seconds
    this.flushInterval = setInterval(() => this.flush(), 60000);
  }

  // Counter
  increment(name: string, tags: Record<string, string> = {}, value = 1): void {
    this.buffer.push({
      name: `counter.${name}`,
      value,
      tags,
      timestamp: Date.now(),
    });
  }

  // Gauge
  gauge(name: string, value: number, tags: Record<string, string> = {}): void {
    this.buffer.push({
      name: `gauge.${name}`,
      value,
      tags,
      timestamp: Date.now(),
    });
  }

  // Histogram (timing)
  timing(name: string, duration: number, tags: Record<string, string> = {}): void {
    this.buffer.push({
      name: `timing.${name}`,
      value: duration,
      tags,
      timestamp: Date.now(),
    });
  }

  private flush(): void {
    if (this.buffer.length === 0) return;

    // Aggregate metrics
    const aggregated = this.aggregate();

    // Log aggregated metrics
    console.log(
      JSON.stringify({
        type: 'metrics',
        timestamp: new Date().toISOString(),
        metrics: aggregated,
      })
    );

    // Clear buffer
    this.buffer = [];
  }

  private aggregate(): Record<string, any> {
    const result: Record<string, any> = {};

    for (const entry of this.buffer) {
      const key = `${entry.name}:${JSON.stringify(entry.tags)}`;

      if (!result[key]) {
        result[key] = {
          name: entry.name,
          tags: entry.tags,
          count: 0,
          sum: 0,
          min: Infinity,
          max: -Infinity,
        };
      }

      result[key].count++;
      result[key].sum += entry.value;
      result[key].min = Math.min(result[key].min, entry.value);
      result[key].max = Math.max(result[key].max, entry.value);
    }

    return Object.values(result).map((m) => ({
      ...m,
      avg: m.sum / m.count,
    }));
  }

  destroy(): void {
    clearInterval(this.flushInterval);
    this.flush();
  }
}

export const metrics = new Metrics();
```

**Metrics Middleware:** `apps/server/src/middleware/metrics.ts`

```typescript
import { createMiddleware } from 'hono/factory';
import { metrics } from '../lib/metrics';

export const metricsMiddleware = createMiddleware(async (c, next) => {
  const start = Date.now();

  await next();

  const duration = Date.now() - start;

  // Record request metrics
  metrics.increment('http.requests', {
    method: c.req.method,
    path: c.req.routePath || c.req.path,
    status: String(c.res.status),
  });

  metrics.timing('http.request.duration', duration, {
    method: c.req.method,
    path: c.req.routePath || c.req.path,
  });
});
```

---

## Environment Variables

Add to `.env.example`:

```bash
# Sentry
SENTRY_DSN=https://xxx@xxx.ingest.sentry.io/xxx
VITE_SENTRY_DSN=https://xxx@xxx.ingest.sentry.io/xxx

# Logging
LOG_LEVEL=info  # debug, info, warn, error
```

---

## Middleware Stack Update

```typescript
// apps/server/src/index.ts
import { initSentry } from './lib/sentry';
import { sentryMiddleware } from './middleware/sentry';
import { metricsMiddleware } from './middleware/metrics';
import { loggerMiddleware } from './middleware/logger';

// Initialize Sentry first
initSentry();

const app = new Hono();

// Middleware order
app.use('*', requestIdMiddleware); // 1. Request ID
app.use('*', sentryMiddleware); // 2. Sentry (error tracking)
app.use('*', loggerMiddleware); // 3. Logging
app.use('*', metricsMiddleware); // 4. Metrics
app.use('*', securityHeaders()); // 5. Security
// ... rest of middleware
```

---

## Dashboard Queries

### Supabase Logs (SQL)

```sql
-- Recent errors
SELECT
  timestamp,
  event_message,
  metadata->>'requestId' as request_id,
  metadata->>'userId' as user_id
FROM edge_logs
WHERE event_message LIKE '%"level":"error"%'
ORDER BY timestamp DESC
LIMIT 100;

-- Slow requests (>500ms)
SELECT
  timestamp,
  metadata->>'path' as path,
  metadata->>'duration' as duration_ms,
  metadata->>'status' as status
FROM edge_logs
WHERE CAST(metadata->>'duration' AS INTEGER) > 500
ORDER BY timestamp DESC
LIMIT 100;

-- Request volume by endpoint
SELECT
  metadata->>'path' as path,
  COUNT(*) as requests,
  AVG(CAST(metadata->>'duration' AS INTEGER)) as avg_duration
FROM edge_logs
WHERE timestamp > NOW() - INTERVAL '1 hour'
GROUP BY metadata->>'path'
ORDER BY requests DESC;
```

---

## Acceptance Criteria

- [ ] Sentry configured for backend and frontend
- [ ] Structured JSON logging implemented
- [ ] Health check endpoints working (/health, /live, /ready)
- [ ] Performance timing utilities integrated
- [ ] Metrics collection and aggregation working
- [ ] Error boundaries in React app
- [ ] No sensitive data in logs or error reports
- [ ] Dashboard queries documented

---

## Alerting Rules (Future)

When monitoring is mature, set up alerts for:

| Metric       | Threshold | Action       |
| ------------ | --------- | ------------ |
| Error rate   | >1%       | Page on-call |
| P95 latency  | >500ms    | Investigate  |
| Health check | Fails 3x  | Auto-restart |
| Memory usage | >90%      | Scale up     |
| 5xx errors   | >10/min   | Page on-call |
