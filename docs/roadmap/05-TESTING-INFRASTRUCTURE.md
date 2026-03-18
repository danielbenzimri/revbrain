# Session 05: Testing Infrastructure

**Priority:** High
**Estimated Duration:** 2-3 days
**Dependencies:** Session 02 (DAL), Session 04 (Security)

---

## Objective

Establish a comprehensive testing strategy that ensures code quality, prevents regressions, and enables confident refactoring. The goal is 80%+ coverage on critical paths.

---

## Testing Pyramid

```
                    ┌───────────────┐
                    │     E2E       │  ← 10% (Critical user flows)
                    │  (Playwright) │
                    └───────┬───────┘
                            │
                ┌───────────┴───────────┐
                │    Integration        │  ← 30% (API + DB)
                │    (Vitest + Real DB) │
                └───────────┬───────────┘
                            │
        ┌───────────────────┴───────────────────┐
        │           Unit Tests                  │  ← 60% (Pure logic)
        │      (Vitest + Mocked deps)           │
        └───────────────────────────────────────┘
```

---

## Deliverables

### 1. Testing Dependencies

**Root `package.json`:**

```json
{
  "devDependencies": {
    "vitest": "^1.6.0",
    "@vitest/coverage-v8": "^1.6.0",
    "@vitest/ui": "^1.6.0"
  }
}
```

**Backend `apps/server/package.json`:**

```json
{
  "devDependencies": {
    "vitest": "^1.6.0",
    "@vitest/coverage-v8": "^1.6.0",
    "supertest": "^6.3.0",
    "@types/supertest": "^6.0.0"
  }
}
```

**Frontend `apps/client/package.json`:**

```json
{
  "devDependencies": {
    "vitest": "^1.6.0",
    "@vitest/coverage-v8": "^1.6.0",
    "@testing-library/react": "^14.0.0",
    "@testing-library/jest-dom": "^6.0.0",
    "@testing-library/user-event": "^14.0.0",
    "jsdom": "^24.0.0",
    "msw": "^2.0.0",
    "@playwright/test": "^1.40.0"
  }
}
```

### 2. Vitest Configuration

**Backend:** `apps/server/vitest.config.ts`

```typescript
import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.spec.ts'],
    exclude: ['src/**/*.e2e.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      exclude: [
        'node_modules',
        'dist',
        '**/*.d.ts',
        '**/*.config.ts',
        '**/types.ts',
        '**/index.ts',
      ],
      thresholds: {
        statements: 80,
        branches: 75,
        functions: 80,
        lines: 80,
      },
    },
    setupFiles: ['./src/test/setup.ts'],
    testTimeout: 10000,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
});
```

**Frontend:** `apps/client/vitest.config.ts`

```typescript
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}', 'src/**/*.spec.{ts,tsx}'],
    exclude: ['src/**/*.e2e.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      exclude: [
        'node_modules',
        'dist',
        '**/*.d.ts',
        '**/*.config.ts',
        '**/types.ts',
        '**/main.tsx',
      ],
      thresholds: {
        statements: 70,
        branches: 65,
        functions: 70,
        lines: 70,
      },
    },
    setupFiles: ['./src/test/setup.ts'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
});
```

### 3. Test Setup Files

**Backend Setup:** `apps/server/src/test/setup.ts`

```typescript
import { beforeAll, afterAll, afterEach, vi } from 'vitest';

// Mock environment variables
process.env.NODE_ENV = 'test';
process.env.SUPABASE_URL = 'http://localhost:54321';
process.env.SUPABASE_ANON_KEY = 'test-anon-key';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key';
process.env.DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/test';

// Global test hooks
beforeAll(async () => {
  // Setup code (e.g., start test database)
});

afterAll(async () => {
  // Cleanup code
});

afterEach(() => {
  vi.clearAllMocks();
});

// Custom matchers
expect.extend({
  toBeValidUUID(received: string) {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const pass = uuidRegex.test(received);
    return {
      pass,
      message: () =>
        pass
          ? `Expected ${received} not to be a valid UUID`
          : `Expected ${received} to be a valid UUID`,
    };
  },
});

declare global {
  namespace Vi {
    interface Assertion {
      toBeValidUUID(): void;
    }
  }
}
```

**Frontend Setup:** `apps/client/src/test/setup.ts`

```typescript
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

// Cleanup after each test
afterEach(() => {
  cleanup();
});

// Mock window.matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// Mock ResizeObserver
global.ResizeObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}));

// Mock IntersectionObserver
global.IntersectionObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}));
```

### 4. Test Utilities

**Backend Test Helpers:** `apps/server/src/test/helpers.ts`

```typescript
import { Hono } from 'hono';
import type { Repositories } from '@revbrain/contract';

// Create a test app instance
export function createTestApp(overrides?: Partial<{ repos: Repositories }>) {
  const app = new Hono();

  // Add test middleware
  app.use('*', async (c, next) => {
    c.set('repos', overrides?.repos || createMockRepositories());
    await next();
  });

  return app;
}

// Mock repository factory
export function createMockRepositories(): Repositories {
  return {
    users: {
      findById: vi.fn(),
      findByEmail: vi.fn(),
      findBySupabaseId: vi.fn(),
      findByOrganization: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      activate: vi.fn(),
      updateLastLogin: vi.fn(),
      count: vi.fn(),
    },
    organizations: {
      findById: vi.fn(),
      findBySlug: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      incrementSeatUsed: vi.fn(),
      decrementSeatUsed: vi.fn(),
      findWithPlan: vi.fn(),
      count: vi.fn(),
    },
    plans: {
      findById: vi.fn(),
      findByCode: vi.fn(),
      findActive: vi.fn(),
      findPublic: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
    projects: {
      findById: vi.fn(),
      findByOwner: vi.fn(),
      findByOrganization: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
    auditLogs: {
      create: vi.fn(),
      findByOrganization: vi.fn(),
      findByUser: vi.fn(),
      findByAction: vi.fn(),
    },
  };
}

// Test data factories
export const factories = {
  user: (overrides = {}) => ({
    id: 'user-123',
    email: 'test@example.com',
    fullName: 'Test User',
    role: 'contractor_pm',
    organizationId: 'org-123',
    isActive: true,
    isOrgAdmin: false,
    createdAt: new Date(),
    ...overrides,
  }),

  organization: (overrides = {}) => ({
    id: 'org-123',
    name: 'Test Org',
    slug: 'test-org',
    type: 'contractor',
    seatLimit: 10,
    seatUsed: 1,
    isActive: true,
    createdAt: new Date(),
    ...overrides,
  }),

  plan: (overrides = {}) => ({
    id: 'plan-123',
    name: 'Pro Plan',
    code: 'pro',
    price: 9900,
    currency: 'USD',
    interval: 'month',
    isActive: true,
    isPublic: true,
    ...overrides,
  }),
};

// Authenticated request helper
export function withAuth(headers: Record<string, string> = {}) {
  return {
    Authorization: 'Bearer mock_token_user-123',
    ...headers,
  };
}
```

**Frontend Test Helpers:** `apps/client/src/test/helpers.tsx`

```typescript
import { ReactNode } from 'react';
import { render, RenderOptions } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';

// Create a fresh query client for each test
function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
      },
      mutations: {
        retry: false,
      },
    },
  });
}

interface WrapperProps {
  children: ReactNode;
}

// All providers wrapper
function AllProviders({ children }: WrapperProps) {
  const queryClient = createTestQueryClient();

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        {children}
      </BrowserRouter>
    </QueryClientProvider>
  );
}

// Custom render function
export function renderWithProviders(
  ui: React.ReactElement,
  options?: Omit<RenderOptions, 'wrapper'>
) {
  return render(ui, { wrapper: AllProviders, ...options });
}

// Re-export everything
export * from '@testing-library/react';
export { renderWithProviders as render };
```

### 5. Unit Test Examples

**Repository Unit Test:** `apps/server/src/repositories/drizzle/__tests__/user.repository.test.ts`

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DrizzleUserRepository } from '../user.repository';

describe('DrizzleUserRepository', () => {
  let repo: DrizzleUserRepository;
  let mockDb: any;

  beforeEach(() => {
    mockDb = {
      query: {
        users: {
          findFirst: vi.fn(),
          findMany: vi.fn(),
        },
      },
      insert: vi.fn(() => ({
        values: vi.fn(() => ({
          returning: vi.fn(),
        })),
      })),
      update: vi.fn(() => ({
        set: vi.fn(() => ({
          where: vi.fn(() => ({
            returning: vi.fn(),
          })),
        })),
      })),
    };
    repo = new DrizzleUserRepository(mockDb);
  });

  describe('findById', () => {
    it('should return user when found', async () => {
      const mockUser = { id: '123', email: 'test@example.com' };
      mockDb.query.users.findFirst.mockResolvedValue(mockUser);

      const result = await repo.findById('123');

      expect(result).toEqual(mockUser);
      expect(mockDb.query.users.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.anything() })
      );
    });

    it('should return null when user not found', async () => {
      mockDb.query.users.findFirst.mockResolvedValue(undefined);

      const result = await repo.findById('nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('findByEmail', () => {
    it('should normalize email to lowercase', async () => {
      mockDb.query.users.findFirst.mockResolvedValue(null);

      await repo.findByEmail('TEST@EXAMPLE.COM');

      // Verify the query used lowercase
      expect(mockDb.query.users.findFirst).toHaveBeenCalled();
    });
  });

  describe('create', () => {
    it('should create user with normalized email', async () => {
      const newUser = { id: '123', email: 'new@example.com' };
      mockDb.insert().values().returning.mockResolvedValue([newUser]);

      const result = await repo.create({
        email: 'NEW@EXAMPLE.COM',
        fullName: 'New User',
        role: 'contractor_pm',
        organizationId: 'org-123',
      });

      expect(result).toEqual(newUser);
    });
  });
});
```

**Middleware Unit Test:** `apps/server/src/middleware/__tests__/rate-limit.test.ts`

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Hono } from 'hono';
import { rateLimit } from '../rate-limit';

describe('Rate Limit Middleware', () => {
  let app: Hono;

  beforeEach(() => {
    vi.useFakeTimers();
    app = new Hono();
  });

  it('should allow requests within limit', async () => {
    app.use('*', rateLimit({ windowMs: 60000, max: 5 }));
    app.get('/test', (c) => c.json({ ok: true }));

    for (let i = 0; i < 5; i++) {
      const res = await app.request('/test');
      expect(res.status).toBe(200);
    }
  });

  it('should block requests over limit', async () => {
    app.use('*', rateLimit({ windowMs: 60000, max: 2 }));
    app.get('/test', (c) => c.json({ ok: true }));

    await app.request('/test');
    await app.request('/test');

    const res = await app.request('/test');
    expect(res.status).toBe(429);

    const body = await res.json();
    expect(body.error.code).toBe('RATE_LIMITED');
  });

  it('should reset after window expires', async () => {
    app.use('*', rateLimit({ windowMs: 60000, max: 1 }));
    app.get('/test', (c) => c.json({ ok: true }));

    await app.request('/test');
    expect((await app.request('/test')).status).toBe(429);

    // Advance time past window
    vi.advanceTimersByTime(61000);

    expect((await app.request('/test')).status).toBe(200);
  });

  it('should include rate limit headers', async () => {
    app.use('*', rateLimit({ windowMs: 60000, max: 10 }));
    app.get('/test', (c) => c.json({ ok: true }));

    const res = await app.request('/test');

    expect(res.headers.get('X-RateLimit-Limit')).toBe('10');
    expect(res.headers.get('X-RateLimit-Remaining')).toBe('9');
    expect(res.headers.get('X-RateLimit-Reset')).toBeTruthy();
  });
});
```

### 6. Integration Test Examples

**API Integration Test:** `apps/server/src/v1/routes/__tests__/plans.integration.test.ts`

```typescript
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { app } from '../../../index';
import { db } from '../../../lib/db';
import { plans } from '@revbrain/database';
import { eq } from 'drizzle-orm';

describe('Plans API (Integration)', () => {
  const testPlan = {
    name: 'Test Plan',
    code: 'test-plan-' + Date.now(),
    price: 1000,
    currency: 'USD',
    interval: 'month',
    isActive: true,
    isPublic: true,
  };

  let createdPlanId: string;

  beforeAll(async () => {
    // Ensure test database is ready
  });

  afterAll(async () => {
    // Cleanup test data
    if (createdPlanId) {
      await db.delete(plans).where(eq(plans.id, createdPlanId));
    }
  });

  describe('GET /v1/plans', () => {
    it('should return public plans for anonymous users', async () => {
      const res = await app.request('/v1/plans');
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.success).toBe(true);
      expect(Array.isArray(body.data)).toBe(true);
    });
  });

  describe('POST /v1/plans (Admin)', () => {
    it('should create plan with valid admin token', async () => {
      const res = await app.request('/v1/plans', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer mock_token_admin-123', // System admin mock token
        },
        body: JSON.stringify(testPlan),
      });

      const body = await res.json();

      expect(res.status).toBe(201);
      expect(body.success).toBe(true);
      expect(body.data.code).toBe(testPlan.code);

      createdPlanId = body.data.id;
    });

    it('should reject non-admin users', async () => {
      const res = await app.request('/v1/plans', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer mock_token_user-123', // Regular user
        },
        body: JSON.stringify(testPlan),
      });

      expect(res.status).toBe(403);
    });
  });
});
```

### 7. Component Test Examples

**React Component Test:** `apps/client/src/components/__tests__/Button.test.tsx`

```typescript
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '../../test/helpers';
import { Button } from '../ui/button';

describe('Button', () => {
  it('renders with children', () => {
    render(<Button>Click me</Button>);
    expect(screen.getByText('Click me')).toBeInTheDocument();
  });

  it('handles click events', async () => {
    const handleClick = vi.fn();
    render(<Button onClick={handleClick}>Click me</Button>);

    fireEvent.click(screen.getByText('Click me'));

    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('can be disabled', () => {
    render(<Button disabled>Click me</Button>);
    expect(screen.getByText('Click me')).toBeDisabled();
  });

  it('applies variant styles', () => {
    render(<Button variant="destructive">Delete</Button>);
    const button = screen.getByText('Delete');
    expect(button).toHaveClass('bg-destructive');
  });
});
```

**Hook Test:** `apps/client/src/features/projects/__tests__/use-projects.test.ts`

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useProjects } from '../hooks/use-projects';
import * as api from '../../../lib/api';

vi.mock('../../../lib/api');

describe('useProjects', () => {
  const mockProjects = [
    { id: '1', name: 'Project 1' },
    { id: '2', name: 'Project 2' },
  ];

  beforeEach(() => {
    vi.mocked(api.getProjects).mockResolvedValue({ data: mockProjects });
  });

  function wrapper({ children }: { children: React.ReactNode }) {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    return (
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    );
  }

  it('should fetch projects', async () => {
    const { result } = renderHook(() => useProjects(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual(mockProjects);
  });

  it('should handle loading state', () => {
    const { result } = renderHook(() => useProjects(), { wrapper });

    expect(result.current.isLoading).toBe(true);
  });
});
```

### 8. E2E Test Setup

**Playwright Config:** `apps/client/playwright.config.ts`

```typescript
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'mobile',
      use: { ...devices['iPhone 12'] },
    },
  ],
  webServer: {
    command: 'pnpm dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
  },
});
```

**E2E Test Example:** `apps/client/e2e/auth.spec.ts`

```typescript
import { test, expect } from '@playwright/test';

test.describe('Authentication', () => {
  test('should show login page', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByRole('heading', { name: /login/i })).toBeVisible();
  });

  test('should redirect to dashboard after login', async ({ page }) => {
    await page.goto('/login');

    await page.fill('input[name="email"]', 'test@example.com');
    await page.fill('input[name="password"]', 'password123');
    await page.click('button[type="submit"]');

    await expect(page).toHaveURL('/dashboard');
  });

  test('should show error for invalid credentials', async ({ page }) => {
    await page.goto('/login');

    await page.fill('input[name="email"]', 'wrong@example.com');
    await page.fill('input[name="password"]', 'wrongpassword');
    await page.click('button[type="submit"]');

    await expect(page.getByText(/invalid credentials/i)).toBeVisible();
  });
});
```

---

## NPM Scripts

**Root `package.json`:**

```json
{
  "scripts": {
    "test": "turbo run test",
    "test:unit": "turbo run test:unit",
    "test:integration": "turbo run test:integration",
    "test:e2e": "turbo run test:e2e",
    "test:coverage": "turbo run test:coverage",
    "test:watch": "turbo run test:watch"
  }
}
```

**Backend `apps/server/package.json`:**

```json
{
  "scripts": {
    "test": "vitest run",
    "test:unit": "vitest run --exclude '**/*.integration.test.ts'",
    "test:integration": "vitest run --include '**/*.integration.test.ts'",
    "test:coverage": "vitest run --coverage",
    "test:watch": "vitest"
  }
}
```

**Frontend `apps/client/package.json`:**

```json
{
  "scripts": {
    "test": "vitest run",
    "test:unit": "vitest run",
    "test:coverage": "vitest run --coverage",
    "test:watch": "vitest",
    "test:e2e": "playwright test",
    "test:e2e:ui": "playwright test --ui"
  }
}
```

---

## CI Integration

Update `.github/workflows/ci.yml`:

```yaml
jobs:
  test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:15
        env:
          POSTGRES_PASSWORD: postgres
          POSTGRES_DB: test
        ports:
          - 5432:5432
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

    steps:
      - uses: actions/checkout@v4

      - name: Setup
        uses: ./.github/actions/setup

      - name: Run Unit Tests
        run: pnpm test:unit

      - name: Run Integration Tests
        run: pnpm test:integration
        env:
          DATABASE_URL: postgresql://postgres:postgres@localhost:5432/test

      - name: Upload Coverage
        uses: codecov/codecov-action@v3
        with:
          files: ./apps/server/coverage/lcov.info,./apps/client/coverage/lcov.info

  e2e:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup
        uses: ./.github/actions/setup

      - name: Install Playwright
        run: pnpm exec playwright install --with-deps chromium

      - name: Run E2E Tests
        run: pnpm test:e2e

      - name: Upload Artifacts
        uses: actions/upload-artifact@v3
        if: failure()
        with:
          name: playwright-report
          path: apps/client/playwright-report/
```

---

## Acceptance Criteria

- [ ] Vitest configured for backend and frontend
- [ ] Test setup files with mocks and helpers
- [ ] Unit test coverage >80% for repositories
- [ ] Unit test coverage >80% for middleware
- [ ] Integration tests for all API endpoints
- [ ] Component tests for UI components
- [ ] E2E tests for critical user flows
- [ ] CI pipeline runs all test suites
- [ ] Coverage reports uploaded to Codecov

---

## Coverage Targets by Module

| Module                  | Target | Priority |
| ----------------------- | ------ | -------- |
| Repositories (Drizzle)  | 90%    | High     |
| Repositories (Supabase) | 90%    | High     |
| Middleware              | 85%    | High     |
| API Routes              | 80%    | High     |
| React Hooks             | 80%    | Medium   |
| UI Components           | 70%    | Medium   |
| Utility Functions       | 95%    | High     |
