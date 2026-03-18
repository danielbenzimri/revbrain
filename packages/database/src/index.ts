export { db, client, getDB } from './client.ts';
export type { DrizzleDB } from './client.ts';
export * from './schema.ts';

// Re-export drizzle-orm utilities to ensure consistent version across consumers
export {
  eq,
  ne,
  gt,
  gte,
  lt,
  lte,
  and,
  or,
  not,
  inArray,
  isNull,
  isNotNull,
  sql,
  desc,
  asc,
  like,
  ilike,
} from 'drizzle-orm';
