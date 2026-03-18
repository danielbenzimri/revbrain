// Service Layer Types
// Defines interfaces for all configurable services

// =============================================================================
// Service Modes
// =============================================================================

export type ServiceMode = 'local' | 'remote';

export interface ServiceConfig {
  api: ServiceMode;
  db: ServiceMode;
  storage: ServiceMode;
  auth: ServiceMode;
}

// =============================================================================
// API Adapter Interface
// =============================================================================

export interface APIAdapter {
  // Core HTTP methods
  get<T>(path: string, options?: RequestOptions): Promise<T>;
  post<T>(path: string, data?: unknown, options?: RequestOptions): Promise<T>;
  put<T>(path: string, data?: unknown, options?: RequestOptions): Promise<T>;
  patch<T>(path: string, data?: unknown, options?: RequestOptions): Promise<T>;
  delete<T>(path: string, options?: RequestOptions): Promise<T>;
}

export interface RequestOptions {
  headers?: Record<string, string>;
  params?: Record<string, string>;
}

// =============================================================================
// Database Adapter Interface
// =============================================================================

export interface DBAdapter {
  // Query operations
  query<T>(table: string, options?: QueryOptions): Promise<T[]>;
  queryOne<T>(table: string, id: string): Promise<T | null>;

  // Mutation operations
  insert<T>(table: string, data: Omit<T, 'id'>): Promise<T>;
  update<T>(table: string, id: string, data: Partial<T>): Promise<T>;
  upsert<T>(table: string, data: T): Promise<T>;
  delete(table: string, id: string): Promise<void>;

  // Batch operations
  insertMany<T>(table: string, data: Omit<T, 'id'>[]): Promise<T[]>;
  deleteMany(table: string, ids: string[]): Promise<void>;
}

export interface QueryOptions {
  filter?: Record<string, unknown>;
  orderBy?: { column: string; ascending?: boolean };
  limit?: number;
  offset?: number;
}

// =============================================================================
// Storage Adapter Interface
// =============================================================================

export interface StorageAdapter {
  // File operations
  upload(bucket: string, path: string, file: File | Blob): Promise<string>;
  download(bucket: string, path: string): Promise<Blob>;
  delete(bucket: string, path: string): Promise<void>;

  // URL operations
  getPublicUrl(bucket: string, path: string): string;
  getSignedUrl(bucket: string, path: string, expiresIn?: number): Promise<string>;

  // Listing
  list(bucket: string, prefix?: string): Promise<StorageFile[]>;
}

export interface StorageFile {
  name: string;
  path: string;
  size: number;
  createdAt: string;
  updatedAt: string;
}

// =============================================================================
// Auth Adapter Interface
// =============================================================================

export interface AuthAdapter {
  // Session management
  login(email: string, password: string): Promise<AuthResult>;
  logout(): Promise<void>;
  getSession(): Promise<Session | null>;
  refreshSession(): Promise<Session | null>;
  setSession(accessToken: string, refreshToken: string): Promise<AuthResult>;

  // User management
  getCurrentUser(): Promise<AuthUser | null>;
  updateUser(data: Partial<AuthUser>): Promise<AuthUser>;

  // Password
  resetPassword(email: string): Promise<void>;
  updatePassword(newPassword: string): Promise<void>;

  // Events
  onAuthStateChange(callback: (event: string, session: Session | null) => void): () => void;
}

export interface AuthResult {
  user: AuthUser;
  session: Session;
}

export interface Session {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

export interface AuthUser {
  id: string;
  email: string;
  name?: string;
  avatar?: string;
  role?: string;
  metadata?: Record<string, unknown>;
}
