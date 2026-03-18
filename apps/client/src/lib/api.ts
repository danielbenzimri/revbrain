import { hc } from 'hono/client';
import type { AppType } from '@geometrix/server';

// Use environment variable for API URL or default to local
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

// Create the type-safe client
export const client = hc<AppType>(API_URL);

// Export specific routers for convenience
// export const api = client.v1
