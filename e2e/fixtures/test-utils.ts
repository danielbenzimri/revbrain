/**
 * E2E Test Utilities
 *
 * Provides helpers for:
 * - Generating unique test identifiers
 * - Test data cleanup
 * - Common test operations
 */
import type { Page } from '@playwright/test';

/**
 * Generate a unique identifier for test data
 * Format: TEST_<prefix>_<timestamp>_<random>
 */
export function uniqueId(prefix: string = ''): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 6);
  return `TEST_${prefix}_${timestamp}_${random}`.toUpperCase();
}

/**
 * Generate a unique email for test users
 */
export function uniqueEmail(prefix: string = 'user'): string {
  const id = Date.now().toString(36);
  return `test.${prefix}.${id}@example.com`;
}

/**
 * Track created resources for cleanup
 */
export class TestDataTracker {
  private coupons: string[] = [];
  private users: string[] = [];
  private projects: string[] = [];
  private leads: string[] = [];

  trackCoupon(code: string) {
    this.coupons.push(code);
  }

  trackUser(email: string) {
    this.users.push(email);
  }

  trackProject(id: string) {
    this.projects.push(id);
  }

  trackLead(id: string) {
    this.leads.push(id);
  }

  getTracked() {
    return {
      coupons: [...this.coupons],
      users: [...this.users],
      projects: [...this.projects],
      leads: [...this.leads],
    };
  }

  clear() {
    this.coupons = [];
    this.users = [];
    this.projects = [];
    this.leads = [];
  }
}

/**
 * API helpers for test data management
 * These can be used to create/delete test data via API
 */
export class TestApiClient {
  private cleanupKey: string;

  constructor(
    private baseUrl: string = 'http://localhost:3000',
    private authToken?: string
  ) {
    this.cleanupKey = process.env.TEST_CLEANUP_KEY || 'test-cleanup-secret';
  }

  setAuthToken(token: string) {
    this.authToken = token;
  }

  private async request(method: string, path: string, body?: unknown, useCleanupKey = false) {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (this.authToken) {
      headers['Authorization'] = `Bearer ${this.authToken}`;
    }
    if (useCleanupKey) {
      headers['X-Test-Cleanup-Key'] = this.cleanupKey;
    }

    const response = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      throw new Error(`API request failed: ${response.status} ${response.statusText}`);
    }

    return response.json().catch(() => null);
  }

  // ============================================
  // Coupon operations (admin only)
  // ============================================

  async createCoupon(data: {
    code: string;
    name: string;
    discountType: 'percent' | 'fixed';
    discountValue: number;
  }) {
    return this.request('POST', '/v1/admin/coupons', data);
  }

  async deleteCoupon(id: string) {
    return this.request('DELETE', `/v1/admin/coupons/${id}`);
  }

  // ============================================
  // Test Data Cleanup (dev only)
  // ============================================

  /**
   * Delete test coupons by pattern or specific codes
   */
  async cleanupCoupons(options?: { pattern?: string; codes?: string[] }) {
    return this.request('POST', '/v1/dev/cleanup/coupons', options || {}, true);
  }

  /**
   * Delete test leads by pattern or specific emails
   */
  async cleanupLeads(options?: { pattern?: string; emails?: string[] }) {
    return this.request('POST', '/v1/dev/cleanup/leads', options || {}, true);
  }

  /**
   * Delete test users by pattern or specific emails
   */
  async cleanupUsers(options?: { pattern?: string; emails?: string[] }) {
    return this.request('POST', '/v1/dev/cleanup/users', options || {}, true);
  }

  /**
   * Delete all test data matching default patterns
   */
  async cleanupAll() {
    return this.request('POST', '/v1/dev/cleanup/all', {}, true);
  }

  /**
   * Get count of test data that would be cleaned up
   */
  async getCleanupStats() {
    return this.request('GET', '/v1/dev/cleanup/stats', undefined, true);
  }
}

/**
 * Wait helpers
 */
export async function waitForApi(page: Page, urlPattern: string | RegExp) {
  return page.waitForResponse(
    (response) =>
      (typeof urlPattern === 'string'
        ? response.url().includes(urlPattern)
        : urlPattern.test(response.url())) && response.status() === 200
  );
}

/**
 * Login and get auth token from localStorage
 */
export async function getAuthToken(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    // Adjust based on how your app stores auth tokens
    const session = localStorage.getItem('supabase.auth.token');
    if (session) {
      try {
        const parsed = JSON.parse(session);
        return parsed.currentSession?.access_token || null;
      } catch {
        return null;
      }
    }
    return null;
  });
}

/**
 * Common navigation helpers
 */
export const navigate = {
  async toBilling(page: Page) {
    await page.goto('/billing');
    await page.waitForLoadState('networkidle');
  },

  async toAdminCoupons(page: Page) {
    await page.goto('/admin/coupons');
    await page.waitForLoadState('networkidle');
  },

  async toAdminLeads(page: Page) {
    await page.goto('/admin/leads');
    await page.waitForLoadState('networkidle');
  },

  async toSettings(page: Page) {
    await page.goto('/settings');
    await page.waitForLoadState('networkidle');
  },

  async toUsers(page: Page) {
    await page.goto('/users');
    await page.waitForLoadState('networkidle');
  },

  async toProjects(page: Page) {
    await page.goto('/projects');
    await page.waitForLoadState('networkidle');
  },
};

/**
 * Form helpers
 */
export const form = {
  async fillInput(page: Page, label: string | RegExp, value: string) {
    const input = page.getByLabel(label);
    await input.fill(value);
  },

  async selectOption(page: Page, label: string | RegExp, value: string) {
    const select = page.getByLabel(label);
    await select.selectOption(value);
  },

  async clickButton(page: Page, name: string | RegExp) {
    await page.getByRole('button', { name }).click();
  },

  async submitForm(page: Page) {
    await page.getByRole('button', { name: /submit|save|create|שמור|צור/i }).click();
  },
};

/**
 * Global test cleanup helper
 * Call this in globalTeardown or after test suites
 */
export async function cleanupTestData(apiUrl = 'http://localhost:3000') {
  const client = new TestApiClient(apiUrl);
  try {
    const result = await client.cleanupAll();
    console.log('Test data cleanup:', result);
    return result;
  } catch (err) {
    console.error('Failed to cleanup test data:', err);
    return null;
  }
}

/**
 * Create a cleanup function for use in test.afterAll
 */
export function createCleanupFn(tracker: TestDataTracker, apiUrl = 'http://localhost:3000') {
  return async () => {
    const tracked = tracker.getTracked();
    const client = new TestApiClient(apiUrl);

    try {
      if (tracked.coupons.length > 0) {
        await client.cleanupCoupons({ codes: tracked.coupons });
        console.log(`Cleaned up ${tracked.coupons.length} test coupons`);
      }
      if (tracked.users.length > 0) {
        await client.cleanupUsers({ emails: tracked.users });
        console.log(`Cleaned up ${tracked.users.length} test users`);
      }
      if (tracked.leads.length > 0) {
        await client.cleanupLeads({ emails: tracked.leads });
        console.log(`Cleaned up ${tracked.leads.length} test leads`);
      }
    } catch (err) {
      console.error('Cleanup failed:', err);
    }

    tracker.clear();
  };
}

/**
 * Assertion helpers for bilingual UI
 */
export const selectors = {
  // Buttons
  saveButton: /save|שמור/i,
  cancelButton: /cancel|ביטול/i,
  deleteButton: /delete|מחק/i,
  editButton: /edit|עריכה/i,
  createButton: /create|צור/i,
  submitButton: /submit|שלח/i,

  // Status badges
  activeStatus: /active|פעיל/i,
  inactiveStatus: /inactive|לא פעיל/i,
  pendingStatus: /pending|ממתין/i,

  // Common text
  noResults: /no results|אין תוצאות/i,
  loading: /loading|טוען/i,
  error: /error|שגיאה/i,
};
