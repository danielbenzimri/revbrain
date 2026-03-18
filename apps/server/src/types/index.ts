import type { User } from '@revbrain/database/schema';

/**
 * Supabase JWT Payload Structure
 *
 * This matches the actual structure of JWTs issued by Supabase Auth.
 * We verify these tokens locally for security.
 */
export interface SupabaseJWTPayload {
  [key: string]: unknown;
  // Standard JWT claims
  sub: string; // Supabase user ID
  exp: number; // Expiration timestamp (seconds)
  iat: number; // Issued at timestamp (seconds)
  aud: string; // Audience (usually "authenticated")

  // Supabase-specific
  email?: string;
  phone?: string;
  role: string; // Supabase role (usually "authenticated", NOT your app role)

  // Custom data set during invite
  user_metadata: {
    full_name?: string;
    role?: string; // YOUR app role (operator, admin, etc.)
    invited_by?: string;
    invited_at?: string;
    organization_id?: string;
    organization_name?: string;
    email?: string;
  };

  app_metadata: {
    provider?: string;
    providers?: string[];
  };
}

/**
 * Extended Hono Context Variables
 *
 * These are attached to the context by middleware and available in route handlers.
 */
export interface Variables {
  user: User;
  jwtPayload: SupabaseJWTPayload;
  requestId: string;
}

export type AppEnv = {
  Variables: Variables;
};

declare module 'hono' {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface ContextVariableMap extends Variables {}
}
