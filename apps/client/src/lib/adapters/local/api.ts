import type { APIAdapter } from '@/types/services';

// Simulated network delay (ms)
const SIMULATED_DELAY = 300;

// Mock API responses storage
const mockResponses: Record<string, unknown> = {};

/**
 * Local API Adapter
 * Returns mock data and simulates network latency for development
 */
export class LocalAPIAdapter implements APIAdapter {
  private async simulateDelay(): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, SIMULATED_DELAY));
  }

  async get<T>(path: string): Promise<T> {
    await this.simulateDelay();
    console.log(`[LocalAPI] GET ${path}`);

    // Return mock response if registered
    if (mockResponses[path]) {
      return mockResponses[path] as T;
    }

    // Return empty array for list endpoints, null for single items
    return (path.includes('list') ? [] : null) as T;
  }

  async post<T>(path: string, data?: unknown): Promise<T> {
    await this.simulateDelay();
    console.log(`[LocalAPI] POST ${path}`, data);

    // Mock Admin Onboarding
    if (path === '/v1/admin/onboard') {
      return {
        organization: {
          id: crypto.randomUUID(),
          ...(data as { organization: object }).organization,
        },
        firstAdmin: { id: crypto.randomUUID(), ...(data as { firstAdmin: object }).firstAdmin },
      } as T;
    }

    // Return the posted data with a generated ID
    return { id: crypto.randomUUID(), ...(data as object) } as T;
  }

  async put<T>(path: string, data?: unknown): Promise<T> {
    await this.simulateDelay();
    console.log(`[LocalAPI] PUT ${path}`, data);
    return data as T;
  }

  async patch<T>(path: string, data?: unknown): Promise<T> {
    await this.simulateDelay();
    console.log(`[LocalAPI] PATCH ${path}`, data);
    return data as T;
  }

  async delete<T>(path: string): Promise<T> {
    await this.simulateDelay();
    console.log(`[LocalAPI] DELETE ${path}`);
    return { success: true } as T;
  }
}

// Helper to register mock responses for testing
export function registerMockResponse(path: string, response: unknown): void {
  mockResponses[path] = response;
}

export function clearMockResponses(): void {
  Object.keys(mockResponses).forEach((key) => delete mockResponses[key]);
}
