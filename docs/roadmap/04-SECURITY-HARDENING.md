# Session 04: Security Hardening (Non-Redis)

**Priority:** High
**Estimated Duration:** 1-2 days
**Dependencies:** Session 01 (Code Quality)

---

## Objective

Implement essential security measures that don't require Redis or external infrastructure. This creates a secure foundation that can be enhanced with Redis in Session 07.

---

## Deliverables

### 1. Security Headers Middleware

**Location:** `apps/server/src/middleware/security-headers.ts`

```typescript
import { createMiddleware } from 'hono/factory';

export interface SecurityHeadersOptions {
  contentSecurityPolicy?: string | false;
  frameOptions?: 'DENY' | 'SAMEORIGIN' | false;
  xssProtection?: boolean;
  noSniff?: boolean;
  hsts?:
    | {
        maxAge: number;
        includeSubDomains?: boolean;
        preload?: boolean;
      }
    | false;
  referrerPolicy?: string;
  permissionsPolicy?: string;
}

const defaultOptions: SecurityHeadersOptions = {
  contentSecurityPolicy:
    "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self' https://*.supabase.co",
  frameOptions: 'DENY',
  xssProtection: true,
  noSniff: true,
  hsts: {
    maxAge: 31536000, // 1 year
    includeSubDomains: true,
    preload: true,
  },
  referrerPolicy: 'strict-origin-when-cross-origin',
  permissionsPolicy: 'camera=(), microphone=(), geolocation=()',
};

export const securityHeaders = (options: SecurityHeadersOptions = {}) => {
  const config = { ...defaultOptions, ...options };

  return createMiddleware(async (c, next) => {
    await next();

    // X-Content-Type-Options
    if (config.noSniff) {
      c.header('X-Content-Type-Options', 'nosniff');
    }

    // X-Frame-Options
    if (config.frameOptions) {
      c.header('X-Frame-Options', config.frameOptions);
    }

    // X-XSS-Protection
    if (config.xssProtection) {
      c.header('X-XSS-Protection', '1; mode=block');
    }

    // Strict-Transport-Security
    if (config.hsts) {
      let hstsValue = `max-age=${config.hsts.maxAge}`;
      if (config.hsts.includeSubDomains) hstsValue += '; includeSubDomains';
      if (config.hsts.preload) hstsValue += '; preload';
      c.header('Strict-Transport-Security', hstsValue);
    }

    // Content-Security-Policy
    if (config.contentSecurityPolicy) {
      c.header('Content-Security-Policy', config.contentSecurityPolicy);
    }

    // Referrer-Policy
    if (config.referrerPolicy) {
      c.header('Referrer-Policy', config.referrerPolicy);
    }

    // Permissions-Policy
    if (config.permissionsPolicy) {
      c.header('Permissions-Policy', config.permissionsPolicy);
    }

    // Remove server identification
    c.header('X-Powered-By', '');
  });
};
```

### 2. Input Sanitization Middleware

**Location:** `apps/server/src/middleware/sanitize.ts`

```typescript
import { createMiddleware } from 'hono/factory';
import { AppError, ErrorCodes } from '@revbrain/contract';

// Characters that could be used for SQL injection
const SQL_INJECTION_PATTERNS = [
  /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|UNION|ALTER|CREATE|TRUNCATE)\b)/gi,
  /(--|#|\/\*|\*\/)/g,
  /(\bOR\b|\bAND\b)\s*\d+\s*=\s*\d+/gi,
  /'\s*(OR|AND)\s*'.*?'/gi,
];

// Characters that could be used for XSS
const XSS_PATTERNS = [
  /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
  /javascript:/gi,
  /on\w+\s*=/gi,
  /<iframe/gi,
  /<object/gi,
  /<embed/gi,
];

// Characters that could be used for command injection
const COMMAND_INJECTION_PATTERNS = [/[;&|`$(){}[\]]/g];

export interface SanitizeOptions {
  checkSqlInjection?: boolean;
  checkXss?: boolean;
  checkCommandInjection?: boolean;
  maxBodySize?: number; // bytes
  maxStringLength?: number;
  allowedHtmlTags?: string[];
}

const defaultOptions: SanitizeOptions = {
  checkSqlInjection: true,
  checkXss: true,
  checkCommandInjection: true,
  maxBodySize: 1024 * 1024, // 1MB
  maxStringLength: 10000,
};

export const sanitizeMiddleware = (options: SanitizeOptions = {}) => {
  const config = { ...defaultOptions, ...options };

  return createMiddleware(async (c, next) => {
    // Check Content-Length
    const contentLength = c.req.header('content-length');
    if (contentLength && parseInt(contentLength) > config.maxBodySize!) {
      throw new AppError(
        ErrorCodes.PAYLOAD_TOO_LARGE,
        `Request body too large. Maximum size: ${config.maxBodySize} bytes`,
        413
      );
    }

    // Only check JSON bodies
    const contentType = c.req.header('content-type');
    if (contentType?.includes('application/json')) {
      try {
        const body = await c.req.json();
        validateObject(body, config);
        // Re-attach sanitized body (Hono caches parsed body)
      } catch (error) {
        if (error instanceof AppError) throw error;
        throw new AppError(ErrorCodes.INVALID_INPUT, 'Invalid JSON body', 400);
      }
    }

    // Check query parameters
    const query = c.req.query();
    validateObject(query, config);

    // Check URL parameters
    const params = c.req.param();
    validateObject(params, config);

    await next();
  });
};

function validateObject(obj: any, config: SanitizeOptions, path = ''): void {
  if (obj === null || obj === undefined) return;

  if (typeof obj === 'string') {
    validateString(obj, config, path);
    return;
  }

  if (Array.isArray(obj)) {
    obj.forEach((item, index) => validateObject(item, config, `${path}[${index}]`));
    return;
  }

  if (typeof obj === 'object') {
    Object.entries(obj).forEach(([key, value]) => {
      validateObject(value, config, path ? `${path}.${key}` : key);
    });
  }
}

function validateString(value: string, config: SanitizeOptions, path: string): void {
  // Check string length
  if (value.length > config.maxStringLength!) {
    throw new AppError(
      ErrorCodes.INVALID_INPUT,
      `Field "${path}" exceeds maximum length of ${config.maxStringLength} characters`,
      400
    );
  }

  // Check SQL injection
  if (config.checkSqlInjection) {
    for (const pattern of SQL_INJECTION_PATTERNS) {
      if (pattern.test(value)) {
        console.warn(
          `Potential SQL injection detected in field "${path}": ${value.substring(0, 100)}`
        );
        throw new AppError(
          ErrorCodes.INVALID_INPUT,
          `Invalid characters detected in field "${path}"`,
          400
        );
      }
    }
  }

  // Check XSS
  if (config.checkXss) {
    for (const pattern of XSS_PATTERNS) {
      if (pattern.test(value)) {
        console.warn(`Potential XSS detected in field "${path}": ${value.substring(0, 100)}`);
        throw new AppError(
          ErrorCodes.INVALID_INPUT,
          `Invalid content detected in field "${path}"`,
          400
        );
      }
    }
  }

  // Check command injection (mainly for file paths, etc.)
  if (config.checkCommandInjection) {
    for (const pattern of COMMAND_INJECTION_PATTERNS) {
      if (pattern.test(value) && !isAllowedSpecialChar(value, path)) {
        console.warn(
          `Potential command injection detected in field "${path}": ${value.substring(0, 100)}`
        );
        throw new AppError(
          ErrorCodes.INVALID_INPUT,
          `Invalid characters detected in field "${path}"`,
          400
        );
      }
    }
  }
}

// Allow certain special characters in specific fields
function isAllowedSpecialChar(value: string, path: string): boolean {
  // Allow parentheses in phone numbers
  if (path.includes('phone')) return true;
  // Allow brackets in JSON metadata fields
  if (path.includes('metadata') || path.includes('preferences')) return true;
  return false;
}
```

### 3. Request Body Size Limit

**Location:** `apps/server/src/middleware/body-limit.ts`

```typescript
import { createMiddleware } from 'hono/factory';
import { AppError, ErrorCodes } from '@revbrain/contract';

export interface BodyLimitOptions {
  maxSize: number; // bytes
}

export const bodyLimit = (options: BodyLimitOptions) => {
  return createMiddleware(async (c, next) => {
    const contentLength = c.req.header('content-length');

    if (contentLength) {
      const size = parseInt(contentLength, 10);
      if (size > options.maxSize) {
        throw new AppError(
          ErrorCodes.PAYLOAD_TOO_LARGE,
          `Request body too large. Maximum: ${formatBytes(options.maxSize)}`,
          413
        );
      }
    }

    await next();
  });
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// Route-specific limits
export const bodyLimits = {
  default: bodyLimit({ maxSize: 100 * 1024 }), // 100KB
  upload: bodyLimit({ maxSize: 10 * 1024 * 1024 }), // 10MB
  json: bodyLimit({ maxSize: 1024 * 1024 }), // 1MB
};
```

### 4. Enhanced Rate Limiting (In-Memory)

Improve existing rate limiter until Redis is available:

**Location:** `apps/server/src/middleware/rate-limit.ts`

```typescript
import { createMiddleware } from 'hono/factory';
import { AppError, ErrorCodes } from '@revbrain/contract';

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

// In-memory store with automatic cleanup
class InMemoryStore {
  private store = new Map<string, RateLimitEntry>();
  private cleanupInterval: NodeJS.Timeout;

  constructor() {
    // Clean up expired entries every minute
    this.cleanupInterval = setInterval(() => this.cleanup(), 60000);
  }

  get(key: string): RateLimitEntry | undefined {
    return this.store.get(key);
  }

  set(key: string, entry: RateLimitEntry): void {
    this.store.set(key, entry);
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.store) {
      if (entry.resetAt < now) {
        this.store.delete(key);
      }
    }
  }

  destroy(): void {
    clearInterval(this.cleanupInterval);
    this.store.clear();
  }
}

const store = new InMemoryStore();

export interface RateLimitOptions {
  windowMs: number;
  max: number;
  keyGenerator?: (c: any) => string;
  skipFailedRequests?: boolean;
  message?: string;
}

export const rateLimit = (options: RateLimitOptions) => {
  const {
    windowMs,
    max,
    keyGenerator = defaultKeyGenerator,
    skipFailedRequests = false,
    message = 'Too many requests, please try again later',
  } = options;

  return createMiddleware(async (c, next) => {
    const key = keyGenerator(c);
    const now = Date.now();

    let entry = store.get(key);

    if (!entry || entry.resetAt < now) {
      entry = { count: 0, resetAt: now + windowMs };
    }

    entry.count++;
    store.set(key, entry);

    // Set rate limit headers
    c.header('X-RateLimit-Limit', String(max));
    c.header('X-RateLimit-Remaining', String(Math.max(0, max - entry.count)));
    c.header('X-RateLimit-Reset', String(Math.ceil(entry.resetAt / 1000)));

    if (entry.count > max) {
      c.header('Retry-After', String(Math.ceil((entry.resetAt - now) / 1000)));

      throw new AppError(ErrorCodes.RATE_LIMITED, message, 429);
    }

    await next();

    // Optionally don't count failed requests
    if (skipFailedRequests && c.res.status >= 400) {
      entry.count--;
      store.set(key, entry);
    }
  });
};

function defaultKeyGenerator(c: any): string {
  // Use user ID if authenticated, otherwise IP
  const userId = c.var?.user?.id;
  if (userId) return `user:${userId}`;

  const ip =
    c.req.header('x-forwarded-for')?.split(',')[0] || c.req.header('x-real-ip') || 'unknown';
  return `ip:${ip}`;
}

// Pre-configured rate limiters
export const rateLimiters = {
  // Auth: 10 requests per minute
  auth: rateLimit({
    windowMs: 60 * 1000,
    max: 10,
    message: 'Too many authentication attempts',
  }),

  // General API: 100 requests per minute
  api: rateLimit({
    windowMs: 60 * 1000,
    max: 100,
  }),

  // Invites: 30 per 15 minutes
  invite: rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 30,
    message: 'Too many invite requests',
  }),

  // Admin operations: 60 per hour
  admin: rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 60,
    message: 'Too many admin operations',
  }),

  // Strict: 5 requests per minute (password reset, etc.)
  strict: rateLimit({
    windowMs: 60 * 1000,
    max: 5,
    message: 'Please wait before trying again',
  }),
};
```

### 5. CORS Enhancement

**Location:** `apps/server/src/middleware/cors.ts`

```typescript
import { cors } from 'hono/cors';

const isProduction = process.env.NODE_ENV === 'production';

// Allowed origins based on environment
const allowedOrigins = isProduction
  ? ['https://app.revbrain.io', 'https://revbrain.io']
  : ['http://localhost:5173', 'http://localhost:3000', 'http://127.0.0.1:5173'];

export const corsMiddleware = cors({
  origin: (origin) => {
    // Allow requests with no origin (mobile apps, curl, etc.)
    if (!origin) return isProduction ? null : '*';

    // Check if origin is allowed
    if (allowedOrigins.includes(origin)) {
      return origin;
    }

    // Allow Vercel preview deployments
    if (!isProduction && origin.endsWith('.vercel.app')) {
      return origin;
    }

    return null;
  },
  allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization', 'X-Request-ID', 'X-Use-Engine'],
  exposeHeaders: [
    'X-Request-ID',
    'X-RateLimit-Limit',
    'X-RateLimit-Remaining',
    'X-RateLimit-Reset',
  ],
  maxAge: 86400, // 24 hours
  credentials: true,
});
```

### 6. Request ID & Audit Trail

**Location:** `apps/server/src/middleware/request-id.ts`

```typescript
import { createMiddleware } from 'hono/factory';
import { randomUUID } from 'crypto';

declare module 'hono' {
  interface ContextVariableMap {
    requestId: string;
    requestStartTime: number;
  }
}

export const requestIdMiddleware = createMiddleware(async (c, next) => {
  // Use existing request ID or generate new one
  const requestId = c.req.header('x-request-id') || randomUUID();
  const startTime = Date.now();

  c.set('requestId', requestId);
  c.set('requestStartTime', startTime);

  await next();

  // Set response headers
  c.header('X-Request-ID', requestId);

  // Log request completion
  const duration = Date.now() - startTime;
  const userId = c.var?.user?.id || 'anonymous';

  console.log(
    JSON.stringify({
      level: 'info',
      type: 'request',
      requestId,
      userId,
      method: c.req.method,
      path: c.req.path,
      status: c.res.status,
      duration,
      userAgent: c.req.header('user-agent'),
      ip: c.req.header('x-forwarded-for')?.split(',')[0] || 'unknown',
    })
  );
});
```

### 7. Secure Error Handler

**Location:** `apps/server/src/middleware/error-handler.ts`

```typescript
import { ErrorHandler } from 'hono';
import { AppError } from '@revbrain/contract';
import { ZodError } from 'zod';

const isProduction = process.env.NODE_ENV === 'production';

export const errorHandler: ErrorHandler = (err, c) => {
  const requestId = c.var?.requestId || 'unknown';

  // Log full error details (server-side only)
  console.error(
    JSON.stringify({
      level: 'error',
      type: 'error',
      requestId,
      error: {
        name: err.name,
        message: err.message,
        stack: err.stack,
      },
      path: c.req.path,
      method: c.req.method,
    })
  );

  // Handle known error types
  if (err instanceof AppError) {
    return c.json(
      {
        success: false,
        error: {
          code: err.code,
          message: err.message,
          // Only include details in development
          ...(isProduction ? {} : { stack: err.stack }),
        },
        requestId,
      },
      err.statusCode
    );
  }

  if (err instanceof ZodError) {
    return c.json(
      {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid request data',
          details: isProduction
            ? undefined
            : err.errors.map((e) => ({
                path: e.path.join('.'),
                message: e.message,
              })),
        },
        requestId,
      },
      400
    );
  }

  // Generic error (hide details in production)
  return c.json(
    {
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: isProduction ? 'An unexpected error occurred' : err.message,
      },
      requestId,
    },
    500
  );
};
```

---

## Middleware Stack Order

Update `apps/server/src/index.ts`:

```typescript
import { Hono } from 'hono';
import { securityHeaders } from './middleware/security-headers';
import { corsMiddleware } from './middleware/cors';
import { requestIdMiddleware } from './middleware/request-id';
import { bodyLimits } from './middleware/body-limit';
import { sanitizeMiddleware } from './middleware/sanitize';
import { rateLimiters } from './middleware/rate-limit';
import { errorHandler } from './middleware/error-handler';

const app = new Hono();

// Error handler (must be first)
app.onError(errorHandler);

// Security & tracking middleware (order matters!)
app.use('*', requestIdMiddleware); // 1. Request tracking
app.use('*', securityHeaders()); // 2. Security headers
app.use('*', corsMiddleware); // 3. CORS
app.use('*', bodyLimits.default); // 4. Body size limit
app.use('*', sanitizeMiddleware()); // 5. Input sanitization
app.use('*', rateLimiters.api); // 6. Rate limiting

// Auth routes with stricter limits
app.use('/v1/auth/*', rateLimiters.auth);
app.use('/v1/admin/*', rateLimiters.admin);

// Routes...
```

---

## Security Checklist

### Headers

- [x] X-Content-Type-Options: nosniff
- [x] X-Frame-Options: DENY
- [x] X-XSS-Protection: 1; mode=block
- [x] Strict-Transport-Security (HSTS)
- [x] Content-Security-Policy
- [x] Referrer-Policy
- [x] Permissions-Policy

### Input Validation

- [x] SQL injection patterns blocked
- [x] XSS patterns blocked
- [x] Command injection patterns blocked
- [x] Max string length enforced
- [x] Max body size enforced

### Rate Limiting

- [x] Auth endpoints protected
- [x] Admin endpoints protected
- [x] General API protected
- [x] Rate limit headers exposed

### Error Handling

- [x] Stack traces hidden in production
- [x] Generic error messages in production
- [x] Request ID in all responses
- [x] Structured error logging

---

## Acceptance Criteria

- [ ] Security headers score A+ on securityheaders.com
- [ ] Input sanitization blocks OWASP Top 10 patterns
- [ ] Rate limiting works correctly with proper headers
- [ ] Error responses don't leak sensitive info in production
- [ ] All middleware has unit tests
- [ ] CORS properly restricts origins in production

---

## Testing

```bash
# Test security headers
curl -I https://api.revbrain.io/v1/health

# Test rate limiting
for i in {1..15}; do curl -s https://api.revbrain.io/v1/health; done

# Test input sanitization
curl -X POST https://api.revbrain.io/v1/test \
  -H "Content-Type: application/json" \
  -d '{"name": "<script>alert(1)</script>"}'

# Test body size limit
dd if=/dev/zero bs=2M count=1 | curl -X POST \
  -H "Content-Type: application/json" \
  --data-binary @- https://api.revbrain.io/v1/test
```

---

## Notes

- Redis-based rate limiting will be added in Session 07
- Consider adding CAPTCHA for public endpoints later
- WAF (Web Application Firewall) can be added at infrastructure level
- Regular security audits recommended (quarterly)
