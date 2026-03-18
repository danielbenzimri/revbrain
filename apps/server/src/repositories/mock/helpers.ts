/**
 * Shared helpers for mock repositories.
 */

/** Apply limit/offset pagination to an array */
export function applyPagination<T>(items: T[], options?: { limit?: number; offset?: number }): T[] {
  let result = [...items];
  if (options?.offset) result = result.slice(options.offset);
  if (options?.limit) result = result.slice(0, options.limit);
  return result;
}

/** Sort an array by a field. Default descending. */
export function applySorting<T>(
  items: T[],
  field: keyof T,
  direction: 'asc' | 'desc' = 'desc'
): T[] {
  return [...items].sort((a, b) => {
    const aVal = a[field];
    const bVal = b[field];
    if (aVal == null && bVal == null) return 0;
    if (aVal == null) return 1;
    if (bVal == null) return -1;
    if (aVal < bVal) return direction === 'asc' ? -1 : 1;
    if (aVal > bVal) return direction === 'asc' ? 1 : -1;
    return 0;
  });
}

/** Generate a random UUID */
export function generateId(): string {
  return crypto.randomUUID();
}

/**
 * Validate filter keys against an allowlist.
 * Throws descriptive error for unsupported filters.
 */
export function validateFilters(
  filters: Record<string, unknown>,
  allowedKeys: readonly string[],
  repoName: string
): void {
  for (const key of Object.keys(filters)) {
    if (!allowedKeys.includes(key)) {
      throw new Error(
        `[MOCK ${repoName}] Unsupported filter: "${key}". Allowed: ${allowedKeys.join(', ')}`
      );
    }
  }
}

/** Apply simple equality filters to an array */
export function applyFilters<T>(items: T[], filter?: Record<string, unknown>): T[] {
  if (!filter) return items;
  return items.filter((item) => {
    for (const [key, value] of Object.entries(filter)) {
      if (value !== undefined && (item as Record<string, unknown>)[key] !== value) {
        return false;
      }
    }
    return true;
  });
}
