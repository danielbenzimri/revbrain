/**
 * Cursor-Based Pagination Utility
 *
 * Provides stable pagination for high-volume endpoints (users, tickets, audit logs).
 * Cursor format: base64-encoded `{createdAt}:{id}` string.
 *
 * Usage:
 * - If `cursor` query param is provided, decode and apply to query
 * - Returns `nextCursor` in response for the client to use on next page
 * - Falls back to offset pagination if `cursor` is not provided
 */

export interface CursorPaginationInput {
  cursor?: string | null;
  limit: number;
}

export interface CursorPaginationOutput<T> {
  items: T[];
  nextCursor: string | null;
  hasMore: boolean;
}

/**
 * Encode a cursor from the last item's createdAt and id
 */
export function encodeCursor(createdAt: Date | string, id: string): string {
  const ts = typeof createdAt === 'string' ? createdAt : createdAt.toISOString();
  return Buffer.from(`${ts}:${id}`).toString('base64url');
}

/**
 * Decode a cursor into createdAt timestamp and id
 */
export function decodeCursor(cursor: string): { createdAt: string; id: string } | null {
  try {
    const decoded = Buffer.from(cursor, 'base64url').toString('utf-8');
    const [createdAt, id] = decoded.split(':');
    if (!createdAt || !id) return null;
    // Validate date
    if (isNaN(new Date(createdAt).getTime())) return null;
    return { createdAt, id };
  } catch {
    return null;
  }
}

/**
 * Apply cursor pagination to an in-memory array (for mock repositories).
 * Items must be sorted by createdAt descending, then id descending.
 */
export function applyCursorPagination<T extends { createdAt: Date; id: string }>(
  items: T[],
  input: CursorPaginationInput
): CursorPaginationOutput<T> {
  let filtered = [...items];

  // Sort by createdAt desc, then id desc for stable ordering
  filtered.sort((a, b) => {
    const timeDiff = b.createdAt.getTime() - a.createdAt.getTime();
    if (timeDiff !== 0) return timeDiff;
    return b.id.localeCompare(a.id);
  });

  // Apply cursor — find items after the cursor position
  if (input.cursor) {
    const decoded = decodeCursor(input.cursor);
    if (decoded) {
      const cursorTime = new Date(decoded.createdAt).getTime();
      const cursorIdx = filtered.findIndex(
        (item) =>
          item.createdAt.getTime() < cursorTime ||
          (item.createdAt.getTime() === cursorTime && item.id < decoded.id)
      );
      if (cursorIdx > 0) {
        filtered = filtered.slice(cursorIdx);
      } else if (cursorIdx === -1) {
        filtered = []; // cursor is past the end
      }
    }
  }

  // Take limit + 1 to determine hasMore
  const pageItems = filtered.slice(0, input.limit + 1);
  const hasMore = pageItems.length > input.limit;
  const resultItems = hasMore ? pageItems.slice(0, input.limit) : pageItems;

  // Encode next cursor from the last item
  const lastItem = resultItems[resultItems.length - 1];
  const nextCursor = hasMore && lastItem ? encodeCursor(lastItem.createdAt, lastItem.id) : null;

  return {
    items: resultItems,
    nextCursor,
    hasMore,
  };
}
