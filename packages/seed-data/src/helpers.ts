/**
 * Mock Data Helpers
 */

/** Returns a Date that is `n` days in the past */
export function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

/** Returns a Date that is `n` hours in the past */
export function hoursAgo(n: number): Date {
  const d = new Date();
  d.setHours(d.getHours() - n);
  return d;
}

/** Deep clone an array of entities using structuredClone */
export function cloneArray<T>(arr: readonly T[]): T[] {
  return structuredClone(arr) as T[];
}
