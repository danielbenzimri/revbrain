/**
 * @revbrain/database — Public API
 *
 * Only re-exports schema (table definitions, relations, types).
 * Does NOT export db, client, getDB, initDB — those live in ./client.ts
 * and must be imported explicitly to avoid triggering postgres.js loading.
 *
 * This keeps Edge Function cold starts fast: importing @revbrain/database
 * for schema tables never loads postgres.js.
 */
export * from './schema.ts';
export type { DrizzleDB } from './client.ts';
