import type { APIAdapter } from '@/types/services';

/**
 * Local API Adapter — AUTH-ONLY STUB
 *
 * DEPRECATED for data operations. Use `dev:real` (client + mock server) for
 * realistic admin development. This adapter returns empty/error responses
 * for data calls to prevent false confidence from fake client-side data.
 *
 * Auth operations are handled by LocalAuthAdapter, not this class.
 */
export class LocalAPIAdapter implements APIAdapter {
  private warn(method: string, path: string): void {
    console.warn(
      `[LocalAPI] ${method} ${path} — client-only mode does not serve data. ` +
        `Run 'pnpm dev:real' for mock server with real data.`
    );
  }

  async get<T>(path: string): Promise<T> {
    this.warn('GET', path);
    return { success: true, data: [] } as T;
  }

   
  async post<T>(path: string, ..._args: unknown[]): Promise<T> {
    this.warn('POST', path);
    throw new Error('Data mutations require the mock server. Run: pnpm dev:real');
  }

  async put<T>(path: string, ..._args: unknown[]): Promise<T> {
    this.warn('PUT', path);
    throw new Error('Data mutations require the mock server. Run: pnpm dev:real');
  }

  async patch<T>(path: string, ..._args: unknown[]): Promise<T> {
    this.warn('PATCH', path);
    throw new Error('Data mutations require the mock server. Run: pnpm dev:real');
  }
   

  async delete<T>(path: string): Promise<T> {
    this.warn('DELETE', path);
    throw new Error('Data mutations require the mock server. Run: pnpm dev:real');
  }
}
