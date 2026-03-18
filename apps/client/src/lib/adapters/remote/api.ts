import type { APIAdapter, RequestOptions } from '@/types/services';
import { supabase } from '@/lib/supabase';

/**
 * Remote API Adapter
 * Calls the actual Hono backend (local dev server or Supabase Edge Functions)
 */
export class RemoteAPIAdapter implements APIAdapter {
  private baseUrl: string;

  constructor(baseUrl?: string) {
    // Default to local Hono dev server, can be overridden for Supabase Edge
    this.baseUrl = baseUrl || import.meta.env.VITE_API_URL || 'http://localhost:3000';
  }

  private async request<T>(
    method: string,
    path: string,
    data?: unknown,
    options?: RequestOptions
  ): Promise<T> {
    // Ensure base URL ends with / and path doesn't start with /
    // This is crucial for new URL() to append rather than replace path
    const base = this.baseUrl.endsWith('/') ? this.baseUrl : `${this.baseUrl}/`;
    const relativePath = path.startsWith('/') ? path.slice(1) : path;
    const url = new URL(relativePath, base);

    // Add query params
    if (options?.params) {
      Object.entries(options.params).forEach(([key, value]) => {
        url.searchParams.set(key, value);
      });
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...options?.headers,
    };

    // Add auth token if available (Supabase Session)
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (session?.access_token) {
      headers['Authorization'] = `Bearer ${session.access_token}`;
    }

    // No Supabase session = not authenticated
    // User needs to log in via Supabase Auth

    const response = await fetch(url.toString(), {
      method,
      headers,
      body: data ? JSON.stringify(data) : undefined,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: response.statusText }));
      throw new Error(error.message || `API Error: ${response.status}`);
    }

    return response.json();
  }

  async get<T>(path: string, options?: RequestOptions): Promise<T> {
    return this.request<T>('GET', path, undefined, options);
  }

  async post<T>(path: string, data?: unknown, options?: RequestOptions): Promise<T> {
    return this.request<T>('POST', path, data, options);
  }

  async put<T>(path: string, data?: unknown, options?: RequestOptions): Promise<T> {
    return this.request<T>('PUT', path, data, options);
  }

  async patch<T>(path: string, data?: unknown, options?: RequestOptions): Promise<T> {
    return this.request<T>('PATCH', path, data, options);
  }

  async delete<T>(path: string, options?: RequestOptions): Promise<T> {
    return this.request<T>('DELETE', path, undefined, options);
  }
}
