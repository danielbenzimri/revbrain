/**
 * Snake-case ↔ camelCase mapping for PostgREST responses.
 *
 * Supabase JS returns snake_case columns from PostgreSQL.
 * Our entity interfaces use camelCase. These utilities handle
 * the bidirectional conversion without external dependencies.
 */

/** Convert a single snake_case string to camelCase */
function snakeToCamel(str: string): string {
  return str.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
}

/** Convert a single camelCase string to snake_case */
function camelToSnake(str: string): string {
  return str.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
}

/**
 * Convert all keys in an object from snake_case to camelCase.
 * Handles nested objects and arrays. Preserves null/undefined.
 */
export function toCamelCase<T>(obj: Record<string, unknown>): T {
  if (!obj || typeof obj !== 'object') return obj as T;

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    const camelKey = snakeToCamel(key);

    // Convert Date strings back to Date objects for timestamp fields
    if (
      typeof value === 'string' &&
      (key.endsWith('_at') || key.endsWith('_date')) &&
      /^\d{4}-\d{2}-\d{2}/.test(value)
    ) {
      result[camelKey] = new Date(value);
    } else {
      result[camelKey] = value;
    }
  }
  return result as T;
}

/**
 * Convert all keys in an object from camelCase to snake_case.
 * Used for inserting/updating data via Supabase JS.
 */
export function toSnakeCase(obj: Record<string, unknown>): Record<string, unknown> {
  if (!obj || typeof obj !== 'object') return obj;

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    result[camelToSnake(key)] = value;
  }
  return result;
}
